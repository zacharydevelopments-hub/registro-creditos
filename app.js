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

    tr.append(celda(v.razon_social), celda(v.sucursal), celda(formatoFecha(v.created_at), "fecha"));
    return tr;
  }

  async function cargarVentas() {
    const cuerpo = $("ventas-cuerpo");
    const estado = $("ventas-estado");

    const { data, error } = await db
      .from("ventas")
      .select("folio, tipo, razon_social, sucursal, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      cuerpo.replaceChildren();
      $("ventas-tabla").hidden = true;
      estado.textContent = "No pudimos cargar tus ventas.";
      return;
    }

    cuerpo.replaceChildren(...data.map(fila));
    $("ventas-tabla").hidden = data.length === 0;
    estado.textContent = data.length
      ? ""
      : "Aún no guardas ventas. Los folios que registres aparecerán aquí.";
  }

  // ---------- Sesión ----------

  function entrar(usuario) {
    $("usuario-email").textContent = usuario.email || "";
    if (!$("sucursal").value) $("sucursal").value = leerSucursal();
    mostrar("app");
    $("folio").focus();
    cargarVentas();
  }

  function irALogin() {
    $("form-venta").reset();
    $("ventas-cuerpo").replaceChildren();
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
