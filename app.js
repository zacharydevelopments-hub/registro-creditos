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

  const CLAVE_SELECCION = "registro-ventas:seleccion";

  function leerSeleccionGuardada() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE_SELECCION) || "{}");
      return { razonSocial: datos.razonSocial || "", sucursal: datos.sucursal || "" };
    } catch {
      return { razonSocial: "", sucursal: "" };
    }
  }

  function guardarSeleccion(razonSocial, sucursal) {
    try {
      localStorage.setItem(CLAVE_SELECCION, JSON.stringify({ razonSocial, sucursal }));
    } catch {
      /* el navegador no permite guardar: no pasa nada */
    }
  }

  // ---------- Sucursal dependiente de la razón social ----------

  const MAPA_SUCURSALES = window.SUCURSALES_POR_RAZON || {};

  function poblarSucursales(razonSocial, sucursalAPreseleccionar) {
    const select = $("sucursal");
    const opciones = MAPA_SUCURSALES[razonSocial] || [];

    if (!razonSocial || opciones.length === 0) {
      select.replaceChildren(new Option("Primero elige una razón social", ""));
      select.disabled = true;
      return;
    }

    select.replaceChildren(
      new Option("Elige una sucursal", "", true, true),
      ...opciones.map((s) => new Option(s, s))
    );
    select.disabled = false;
    if (sucursalAPreseleccionar && opciones.includes(sucursalAPreseleccionar)) {
      select.value = sucursalAPreseleccionar;
    }
  }

  function restaurarSeleccionGuardada() {
    const guardada = leerSeleccionGuardada();
    if (!guardada.razonSocial || !MAPA_SUCURSALES[guardada.razonSocial]) return;
    $("razon-social").value = guardada.razonSocial;
    poblarSucursales(guardada.razonSocial, guardada.sucursal);
  }

  $("razon-social").addEventListener("change", (e) => poblarSucursales(e.target.value));

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

  // ---------- Pestañas (solo supervisor: el ejecutivo no tiene navbar y ve todo junto) ----------

  const PESTANAS = {
    resumen: $("panel-ventas"),
    ingreso: $("panel-nueva-venta"),
    usuarios: $("panel-usuarios"),
  };

  function mostrarPestana(nombre) {
    for (const [clave, panel] of Object.entries(PESTANAS)) panel.hidden = clave !== nombre;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("activa", b.dataset.tab === nombre));
    if (nombre === "ingreso") $("folio").focus();
    if (nombre === "usuarios") cargarUsuarios();
  }

  document.querySelectorAll(".tab").forEach((boton) =>
    boton.addEventListener("click", () => mostrarPestana(boton.dataset.tab))
  );

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

    const tiposElegidos = [...document.querySelectorAll('input[name="tipo"]:checked')].map(
      (c) => c.value
    );

    const registro = {
      folio: $("folio").value.trim(),
      vendedor: $("vendedor").value.trim(),
      tipo: tiposElegidos,
      razon_social: $("razon-social").value.trim(),
      sucursal: $("sucursal").value.trim(),
    };

    mensaje("venta-mensaje", "");

    if (
      !registro.folio ||
      !registro.vendedor ||
      registro.tipo.length === 0 ||
      !registro.razon_social ||
      !registro.sucursal
    ) {
      mensaje("venta-mensaje", "Completa todos los campos y elige al menos un tipo.", "error");
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
        duplicada ? `El folio ${registro.folio} ya está registrado.` : "No se pudo guardar la venta. Intenta de nuevo.",
        "error"
      );
      return;
    }

    guardarSeleccion(registro.razon_social, registro.sucursal);
    mensaje("venta-mensaje", `Venta ${registro.folio} guardada.`, "ok");
    $("folio").value = "";
    $("vendedor").value = "";
    document.querySelectorAll('input[name="tipo"]:checked').forEach((c) => (c.checked = false));
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
    tr.append(celda(v.vendedor || ""));

    const tdTipo = document.createElement("td");
    tdTipo.className = "tipos";
    for (const t of v.tipo || []) {
      const chip = document.createElement("span");
      chip.className = "tipo";
      chip.textContent = t;
      tdTipo.append(chip);
    }
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
      if (tipo && !(v.tipo || []).includes(tipo)) return false;
      if (sucursal && v.sucursal !== sucursal) return false;
      if (ejecutivo && v.user_email !== ejecutivo) return false;
      if (busqueda) {
        const texto = `${v.folio} ${v.razon_social} ${v.vendedor || ""}`.toLowerCase();
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

  // Cada venta puede tener varios tipos, así que se cuenta por tipo individual, no por combinación.
  function contarPorTipo(data) {
    const conteo = new Map();
    for (const v of data) {
      for (const t of v.tipo && v.tipo.length ? v.tipo : ["(sin dato)"]) {
        conteo.set(t, (conteo.get(t) || 0) + 1);
      }
    }
    return [...conteo.entries()].sort((a, b) => b[1] - a[1]);
  }

  // ---------- Gráficos (solo supervisor) ----------

  const graficos = {}; // instancias de Chart.js, una por canvas, reutilizadas al filtrar

  // Paleta consistente con los colores del resto de la página.
  const PALETA = ["#0B5A8A", "#1B6E44", "#B3261E", "#9AA8B6", "#6B4FA0", "#C77D18"];

  function grafico(id, config) {
    const lienzo = $(id);
    if (!lienzo || typeof window.Chart === "undefined") return; // Chart.js no cargó: no rompemos la página
    if (graficos[id]) {
      graficos[id].data = config.data;
      graficos[id].update();
    } else {
      graficos[id] = new Chart(lienzo, config);
    }
  }

  function opcionesBase(extra) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      ...extra,
    };
  }

  function actualizarGraficos(filas) {
    // "filas" viene como [[etiqueta, cantidad], ...], ya ordenado de mayor a menor.
    grafico("grafico-ejecutivo", {
      type: "bar",
      data: {
        labels: filas.ejecutivo.map((f) => f[0]),
        datasets: [{ data: filas.ejecutivo.map((f) => f[1]), backgroundColor: PALETA[0] }],
      },
      options: opcionesBase(),
    });

    grafico("grafico-sucursal", {
      type: "bar",
      data: {
        labels: filas.sucursal.map((f) => f[0]),
        datasets: [{ data: filas.sucursal.map((f) => f[1]), backgroundColor: PALETA[1] }],
      },
      options: opcionesBase(),
    });

    grafico("grafico-tipo", {
      type: "doughnut",
      data: {
        labels: filas.tipo.map((f) => f[0]),
        datasets: [{ data: filas.tipo.map((f) => f[1]), backgroundColor: PALETA }],
      },
      options: opcionesBase({
        scales: {}, // un doughnut no usa ejes
        plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12 } } },
      }),
    });
  }

  function actualizarResumen(data) {
    if (!esSupervisor) return;
    $("resumen-supervisor").hidden = data.length === 0;
    if (data.length === 0) return;

    const porEjecutivo = contarPor(data, "user_email");
    const porSucursal = contarPor(data, "sucursal");
    const porTipo = contarPorTipo(data);

    pintarResumen("resumen-ejecutivo", porEjecutivo);
    pintarResumen("resumen-sucursal", porSucursal);
    pintarResumen("resumen-tipo", porTipo);
    actualizarGraficos({ ejecutivo: porEjecutivo, sucursal: porSucursal, tipo: porTipo });
  }

  function exportarCSV() {
    const filas = aplicarFiltros();
    const encabezado = ["Folio", "Vendedor", "Tipo", "Razón social", "Sucursal", "Ejecutivo", "Fecha"];
    const escapar = (texto) => `"${String(texto ?? "").replace(/"/g, '""')}"`;
    const lineas = [
      encabezado.join(","),
      ...filas.map((v) =>
        [v.folio, v.vendedor, (v.tipo || []).join(";"), v.razon_social, v.sucursal, v.user_email, formatoFecha(v.created_at)]
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
    const columnas = "folio, vendedor, tipo, razon_social, sucursal, user_email, created_at";

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

  // ---------- Usuarios (solo supervisor) ----------

  // Todas las acciones de administración (listar/crear/bloquear/eliminar) pasan
  // por la Edge Function "admin-usuarios": crear o eliminar una cuenta requiere
  // la clave service_role, que nunca debe estar en el navegador.
  async function llamarAdminUsuarios(cuerpo) {
    const { data, error } = await db.functions.invoke("admin-usuarios", { body: cuerpo });
    if (error) {
      // Supabase entrega el mensaje real del servidor en el "context" de la respuesta.
      let detalle = error.message;
      try {
        detalle = (await error.context.json()).error || detalle;
      } catch {
        /* si no se pudo leer el detalle, se usa el mensaje genérico */
      }
      throw new Error(detalle);
    }
    return data;
  }

  function formatoFechaCorta(iso) {
    return new Date(iso).toLocaleDateString("es-CL", { dateStyle: "medium" });
  }

  function filaUsuario(u) {
    const tr = document.createElement("tr");
    tr.append(celda(u.email || ""));

    const tdRol = document.createElement("td");
    const chipRol = document.createElement("span");
    chipRol.className = "tipo";
    chipRol.textContent = u.rol === "supervisor" ? "Supervisor" : "Ejecutivo";
    tdRol.append(chipRol);
    tr.append(tdRol);

    const tdEstado = document.createElement("td");
    const chipEstado = document.createElement("span");
    chipEstado.className = "estado-chip " + (u.bloqueado ? "bloqueado" : "activo");
    chipEstado.textContent = u.bloqueado ? "Bloqueado" : "Activo";
    tdEstado.append(chipEstado);
    tr.append(tdEstado);

    tr.append(celda(formatoFechaCorta(u.creado)));

    const tdAcciones = document.createElement("td");
    tdAcciones.className = "acciones-usuario";

    const btnEstado = document.createElement("button");
    btnEstado.type = "button";
    btnEstado.className = "boton-mini";
    btnEstado.textContent = u.bloqueado ? "Desbloquear" : "Bloquear";
    btnEstado.addEventListener("click", () => accionUsuario(u, u.bloqueado ? "desbloquear" : "bloquear"));
    tdAcciones.append(btnEstado);

    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.className = "boton-mini peligro";
    btnEliminar.textContent = "Eliminar";
    btnEliminar.addEventListener("click", () => accionUsuario(u, "eliminar"));
    tdAcciones.append(btnEliminar);

    tr.append(tdAcciones);
    return tr;
  }

  async function accionUsuario(u, accion) {
    const confirmaciones = {
      bloquear: `¿Bloquear a ${u.email}? No podrá volver a iniciar sesión hasta que lo desbloquees.`,
      desbloquear: `¿Desbloquear a ${u.email}?`,
      eliminar: `¿Eliminar la cuenta de ${u.email}? Esta acción no se puede deshacer. Sus ventas ya guardadas se conservan.`,
    };
    if (!confirm(confirmaciones[accion])) return;

    try {
      await llamarAdminUsuarios({ accion, id: u.id });
      cargarUsuarios();
    } catch (e) {
      alert("No se pudo completar la acción: " + e.message);
    }
  }

  async function cargarUsuarios() {
    const estado = $("usuarios-estado");
    $("usuarios-tabla").hidden = true;
    estado.textContent = "Cargando usuarios…";

    try {
      const { usuarios } = await llamarAdminUsuarios({ accion: "listar" });
      $("usuarios-cuerpo").replaceChildren(...usuarios.map(filaUsuario));
      $("usuarios-tabla").hidden = usuarios.length === 0;
      estado.textContent = usuarios.length ? "" : "No hay usuarios.";
    } catch (e) {
      estado.textContent = "No se pudo cargar la lista de usuarios: " + e.message;
    }
  }

  $("form-usuario").addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = $("btn-crear-usuario");
    mensaje("usuario-mensaje", "");
    boton.disabled = true;
    boton.textContent = "Agregando…";

    try {
      await llamarAdminUsuarios({
        accion: "crear",
        email: $("nu-email").value.trim(),
        password: $("nu-password").value,
        rol: $("nu-rol").value,
      });
      mensaje("usuario-mensaje", "Usuario agregado.", "ok");
      $("form-usuario").reset();
      cargarUsuarios();
    } catch (e) {
      mensaje("usuario-mensaje", "No se pudo agregar el usuario: " + e.message, "error");
    } finally {
      boton.disabled = false;
      boton.textContent = "Agregar usuario";
    }
  });

  // ---------- Rol (ejecutivo / supervisor) ----------

  async function obtenerRol(usuario) {
    const { data, error } = await db.from("profiles").select("role").eq("id", usuario.id).maybeSingle();
    if (error || !data) return "ejecutivo"; // por defecto, si algo falla, se trata como ejecutivo
    return data.role;
  }

  function aplicarVistaSegunRol() {
    $("badge-rol").hidden = !esSupervisor;
    $("tabs-supervisor").hidden = !esSupervisor;
    $("filtros-supervisor").hidden = !esSupervisor;
    $("col-ejecutivo").hidden = !esSupervisor;
    $("titulo-ventas").textContent = esSupervisor ? "Todas las ventas" : "Tus últimas ventas";

    if (esSupervisor) {
      // El supervisor navega por pestañas; "Resumen" es la que ve al entrar.
      mostrarPestana("resumen");
    } else {
      // El ejecutivo no tiene pestañas: ve el formulario y su listado juntos, como siempre.
      $("panel-nueva-venta").hidden = false;
      $("panel-ventas").hidden = false;
      $("panel-usuarios").hidden = true;
    }
  }

  // ---------- Sesión ----------

  async function entrar(usuario) {
    // Se resuelve el rol ANTES de mostrar la app: así nunca se alcanza a
    // pintar por un instante el formulario de ejecutivo si la persona es supervisor.
    esSupervisor = (await obtenerRol(usuario)) === "supervisor";
    aplicarVistaSegunRol();

    $("usuario-email").textContent = usuario.email || "";
    restaurarSeleccionGuardada();
    mostrar("app");
    if (!esSupervisor) $("folio").focus();

    cargarVentas();
  }

  function irALogin() {
    $("form-venta").reset();
    poblarSucursales(""); // limpia opciones de la sesión anterior y vuelve a deshabilitarlo
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
    for (const id of Object.keys(graficos)) {
      graficos[id].destroy();
      delete graficos[id];
    }
    $("form-usuario").reset();
    $("usuarios-cuerpo").replaceChildren();
    $("usuarios-tabla").hidden = true;
    $("usuarios-estado").textContent = "";
    mensaje("usuario-mensaje", "");
    mostrarPestana("resumen"); // deja la pestaña lista para la próxima sesión
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
