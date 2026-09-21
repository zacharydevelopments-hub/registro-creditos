(() => {
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const vistas = {
    carga: $("vista-carga"),
    config: $("vista-config"),
    login: $("vista-login"),
    app: $("vista-app"),
  };

  function mostrar(nombre) {
    for (const [clave, el] of Object.entries(vistas)) {
      el.hidden = clave !== nombre;
    }
  }

  // Si config.js todavía tiene los valores de ejemplo, avisamos y salimos.
  const sinConfigurar =
    !cfg.SUPABASE_URL ||
    !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_URL.includes("TU-PROYECTO") ||
    cfg.SUPABASE_ANON_KEY.includes("TU-CLAVE");

  if (sinConfigurar) {
    mostrar("config");
    return;
  }

  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---------- Utilidades ----------

  const CLAVE_SUCURSAL = "registro-ventas:sucursal";

  function leerSucursal() {
    try {
      return localStorage.getItem(CLAVE_SUCURSAL) || "";
    } catch {
      return "";
    }
  }

  function guardarSucursal(valor) {
    try {
      localStorage.setItem(CLAVE_SUCURSAL, valor);
    } catch {
      /* el navegador no permite guardar: no pasa nada */
    }
  }

  function mensaje(id, texto, tipo) {
    const el = $(id);
    el.textContent = texto || "";
    el.className = "mensaje" + (tipo ? " " + tipo : "");
  }

  function formatoFecha(iso) {
    return new Date(iso).toLocaleString("es-CL", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  // ---------- Login ----------

  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = $("btn-login");
    mensaje("login-error", "");
    boton.disabled = true;
    boton.textContent = "Ingresando…";

    const { error } = await db.auth.signInWithPassword({
      email: $("login-email").value.trim(),
      password: $("login-password").value,
    });

    boton.disabled = false;
    boton.textContent = "Ingresar";

    if (error) {
      const credenciales =
        error.code === "invalid_credentials" || /invalid login/i.test(error.message || "");
      mensaje(
        "login-error",
        credenciales
          ? "Correo o contraseña incorrectos."
          : "No pudimos iniciar sesión. Revisa tu conexión e intenta de nuevo.",
        "error"
      );
      return;
    }
    $("login-password").value = "";
  });

  $("btn-salir").addEventListener("click", () => {
    db.auth.signOut();
  });

  // ---------- Guardar venta ----------

  $("form-venta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = $("btn-guardar");

    const registro = {
      folio: $("folio").value.trim(),
      tipo: $("tipo").value,
      razon_social: $("razon-social").value.trim(),
      sucursal: $("sucursal").value.trim(),
    };

    mensaje("venta-mensaje", "");

    if (!registro.folio || !registro.tipo || !registro.razon_social || !registro.sucursal) {
      mensaje("venta-mensaje", "Completa todos los campos.", "error");
      return;
    }

    boton.disabled = true;
    boton.textContent = "Guardando…";

    // user_id y user_email los completa la base de datos con la sesión activa.
    const { error } = await db.from("ventas").insert(registro);

    boton.disabled = false;
    boton.textContent = "Guardar venta";

    if (error) {
      const duplicada = error.code === "23505";
      mensaje(
        "venta-mensaje",
        duplicada
          ? `El folio ${registro.folio} ya está registrado como ${registro.tipo}.`
          : "No se pudo guardar la venta. Intenta de nuevo.",
        "error"
      );
      return;
    }

    guardarSucursal(registro.sucursal);
    mensaje("venta-mensaje", `Venta ${registro.folio} guardada.`, "ok");
    $("folio").value = "";
    $("razon-social").value = "";
    $("folio").focus();
    cargarVentas();
  });

  // ---------- Listado ----------

  let esSupervisor = false;
  let todasLasVentas = []; // solo se usa en modo supervisor, para filtrar sin volver a consultar

  function celda(texto, clase) {
    const td = document.createElement("td");
    td.textContent = texto;
    if (clase) td.className = clase;
    return td;
  }

  function fila(v) {
    const tr = document.createElement("tr");
    tr.append(celda(v.folio, "folio"));

    const tdTipo = document.createElement("td");
    const chip = document.createElement("span");
    chip.className = "tipo";
    chip.textContent = v.tipo;
    tdTipo.append(chip);
    tr.append(tdTipo);

    tr.append(celda(v.razon_social), celda(v.sucursal));

    const tdEjecutivo = celda(v.user_email || "", "col-ejecutivo");
    tdEjecutivo.hidden = !esSupervisor;
    tr.append(tdEjecutivo);

    tr.append(celda(formatoFecha(v.created_at), "fecha"));
    return tr;
  }

  function pintarFilas(data) {
    const cuerpo = $("ventas-cuerpo");
    const estado = $("ventas-estado");
    cuerpo.replaceChildren(...data.map(fila));
    $("ventas-tabla").hidden = data.length === 0;
    estado.textContent = data.length
      ? ""
      : esSupervisor
      ? "No hay ventas que coincidan con el filtro."
      : "Aún no guardas ventas. Los folios que registres aparecerán aquí.";
  }

  // Rellena los <select> de filtro (sucursal, ejecutivo) con los valores presentes en los datos.
  function actualizarOpcionesFiltro(data) {
    function llenar(select, valores, textoTodos) {
      const actual = select.value;
      const opciones = [...new Set(valores)].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
      select.replaceChildren(new Option(textoTodos, ""));
      for (const v of opciones) select.append(new Option(v, v));
      if (opciones.includes(actual)) select.value = actual;
    }
    llenar($("filtro-sucursal"), data.map((v) => v.sucursal), "Todas");
    llenar($("filtro-ejecutivo"), data.map((v) => v.user_email), "Todos");
  }

  function aplicarFiltros() {
    const busqueda = $("filtro-busqueda").value.trim().toLowerCase();
    const tipo = $("filtro-tipo").value;
    const sucursal = $("filtro-sucursal").value;
    const ejecutivo = $("filtro-ejecutivo").value;
    const desde = $("filtro-desde").value; // "YYYY-MM-DD" o ""
    const hasta = $("filtro-hasta").value;

    const filtradas = todasLasVentas.filter((v) => {
      if (tipo && v.tipo !== tipo) return false;
      if (sucursal && v.sucursal !== sucursal) return false;
      if (ejecutivo && v.user_email !== ejecutivo) return false;
      if (busqueda) {
        const texto = `${v.folio} ${v.razon_social}`.toLowerCase();
        if (!texto.includes(busqueda)) return false;
      }
      const fechaVenta = v.created_at.slice(0, 10); // fecha local aproximada, suficiente para filtrar por día
      if (desde && fechaVenta < desde) return false;
      if (hasta && fechaVenta > hasta) return false;
      return true;
    });

    pintarFilas(filtradas);
    actualizarResumen(filtradas);
    return filtradas;
  }

  // Cuenta ocurrencias por columna y arma filas "valor / cantidad" ordenadas de mayor a menor.
  function contarPor(data, campo) {
    const conteo = new Map();
    for (const v of data) {
      const clave = v[campo] || "(sin dato)";
      conteo.set(clave, (conteo.get(clave) || 0) + 1);
    }
    return [...conteo.entries()].sort((a, b) => b[1] - a[1]);
  }

  function pintarResumen(idBody, filas) {
    const cuerpo = $(idBody);
    cuerpo.replaceChildren(
      ...filas.map(([nombre, cantidad]) => {
        const tr = document.createElement("tr");
        tr.append(celda(nombre), celda(String(cantidad)));
        return tr;
      })
    );
  }

  function actualizarResumen(data) {
    if (!esSupervisor) return;
    $("resumen-supervisor").hidden = data.length === 0;
    pintarResumen("resumen-ejecutivo", contarPor(data, "user_email"));
    pintarResumen("resumen-sucursal", contarPor(data, "sucursal"));
    pintarResumen("resumen-tipo", contarPor(data, "tipo"));
  }

  function exportarCSV() {
    const filas = aplicarFiltros();
    const encabezado = ["Folio", "Tipo", "Razón social", "Sucursal", "Ejecutivo", "Fecha"];
    const escapar = (texto) => `"${String(texto ?? "").replace(/"/g, '""')}"`;
    const lineas = [
      encabezado.join(","),
      ...filas.map((v) =>
        [v.folio, v.tipo, v.razon_social, v.sucursal, v.user_email, formatoFecha(v.created_at)]
          .map(escapar)
          .join(",")
      ),
    ];
    const blob = new Blob([lineas.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  $("filtro-busqueda").addEventListener("input", aplicarFiltros);
  $("filtro-tipo").addEventListener("change", aplicarFiltros);
  $("filtro-sucursal").addEventListener("change", aplicarFiltros);
  $("filtro-ejecutivo").addEventListener("change", aplicarFiltros);
  $("filtro-desde").addEventListener("change", aplicarFiltros);
  $("filtro-hasta").addEventListener("change", aplicarFiltros);
  $("btn-exportar").addEventListener("click", exportarCSV);

  async function cargarVentas() {
    const estado = $("ventas-estado");
    const columnas = "folio, tipo, razon_social, sucursal, user_email, created_at";

    // El supervisor trae más registros y filtra en pantalla; el ejecutivo solo ve los suyos (RLS).
    const consulta = db
      .from("ventas")
      .select(columnas)
      .order("created_at", { ascending: false })
      .limit(esSupervisor ? 500 : 20);

    const { data, error } = await consulta;

    if (error) {
      $("ventas-cuerpo").replaceChildren();
      $("ventas-tabla").hidden = true;
      estado.textContent = "No pudimos cargar las ventas.";
      return;
    }

    if (esSupervisor) {
      todasLasVentas = data;
      actualizarOpcionesFiltro(data);
      aplicarFiltros();
    } else {
      pintarFilas(data);
    }
  }

  // ---------- Rol (ejecutivo / supervisor) ----------

  async function obtenerRol(usuario) {
    const { data, error } = await db.from("profiles").select("role").eq("id", usuario.id).maybeSingle();
    if (error || !data) return "ejecutivo"; // por defecto, si algo falla, se trata como ejecutivo
    return data.role;
  }

  function aplicarVistaSegunRol() {
    $("badge-rol").hidden = !esSupervisor;
    $("filtros-supervisor").hidden = !esSupervisor;
    $("col-ejecutivo").hidden = !esSupervisor;
    $("titulo-ventas").textContent = esSupervisor ? "Todas las ventas" : "Tus últimas ventas";
  }

  // ---------- Sesión ----------

  async function entrar(usuario) {
    $("usuario-email").textContent = usuario.email || "";
    if (!$("sucursal").value) $("sucursal").value = leerSucursal();
    mostrar("app");
    $("folio").focus();

    esSupervisor = (await obtenerRol(usuario)) === "supervisor";
    aplicarVistaSegunRol();
    cargarVentas();
  }

  function irALogin() {
    $("form-venta").reset();
    $("ventas-cuerpo").replaceChildren();
    $("resumen-ejecutivo").replaceChildren();
    $("resumen-sucursal").replaceChildren();
    $("resumen-tipo").replaceChildren();
    $("resumen-supervisor").hidden = true;
    $("filtro-busqueda").value = "";
    $("filtro-desde").value = "";
    $("filtro-hasta").value = "";
    todasLasVentas = [];
    esSupervisor = false;
    mensaje("venta-mensaje", "");
    mostrar("login");
    $("login-email").focus();
  }

  let idActual; // undefined = todavía no sabemos si hay sesión
  db.auth.onAuthStateChange((_evento, sesion) => {
    const usuario = sesion ? sesion.user : null;
    const id = usuario ? usuario.id : null;
    if (id === idActual) return; // p. ej. renovación de token: no hay nada que redibujar
    idActual = id;
    // setTimeout evita llamar a Supabase dentro del propio callback de auth.
    setTimeout(() => (usuario ? entrar(usuario) : irALogin()), 0);
  });
})();
