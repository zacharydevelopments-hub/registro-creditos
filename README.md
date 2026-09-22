# Registro de ventas

Página web con login para que los ejecutivos registren:

- Folio de venta
- Tipo (CC, CI, Seguro, MPP)
- Razón social
- Sucursal

Sitio estático (HTML + CSS + JS) con **Supabase** (login y base de datos), publicado con **Vercel** desde **GitHub**. No necesita build ni Node.

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor**, pega el contenido de `schema.sql` y ejecútalo. Crea la tabla `ventas` con seguridad por fila (cada ejecutivo solo ve y guarda lo suyo).
3. Crea los usuarios en **Authentication → Users → Add user → Create new user**, con correo y contraseña (marca *Auto Confirm User*).
4. Recomendado: en **Authentication → Sign In / Providers** desactiva el registro libre de usuarios (*Allow new users to sign up*), para que solo entren quienes tú crees.
5. Copia la **Project URL** y la clave **anon / publishable** desde **Project Settings → API** y pégalas en `config.js`.

> La clave anon es pública por diseño. Nunca uses la `service_role` en este proyecto.

## 2. Probar en tu computador (opcional)

```bash
python3 -m http.server 3000
# abre http://localhost:3000
```

## 3. GitHub

```bash
git init
git add .
git commit -m "Registro de ventas"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/registro-ventas.git
git push -u origin main
```

## 4. Vercel

1. En [vercel.com](https://vercel.com) elige **Add New → Project** e importa el repositorio.
2. **Framework Preset:** Other. Deja vacíos *Build Command* y *Output Directory*.
3. Pulsa **Deploy**. Cada `git push` a `main` vuelve a publicar.

## Rol de supervisor

Además de los ejecutivos, existe el rol **supervisor**. Al entrar, en vez del formulario simple del ejecutivo, ve una barra con **3 pestañas**:

1. **Resumen** — la vista que ya tenía: todas las ventas de todos los ejecutivos, con filtros (sucursal, tipo, ejecutivo, fechas, búsqueda), gráficos y exportar a CSV. Es la pestaña que se abre al entrar.
2. **Ingreso de venta** — el mismo formulario "Nueva venta" que usan los ejecutivos: el supervisor también puede registrar ventas a su nombre.
3. **Usuarios** — agregar, bloquear/desbloquear y eliminar cuentas (ver más abajo).

Todo usuario nuevo se crea como `ejecutivo` por defecto. Para convertir a alguien en supervisor a mano (sin usar la pestaña Usuarios):

1. Abre Supabase → **SQL Editor**.
2. Ejecuta (reemplazando el correo real):
   ```sql
   update public.profiles set role = 'supervisor' where email = 'correo@empresa.cl';
   ```
3. La próxima vez que esa persona inicie sesión (o recargue la página), verá la vista de supervisor.

Para devolverlo a ejecutivo, ejecuta lo mismo con `role = 'ejecutivo'`.

## Administrar usuarios (pestaña "Usuarios")

Crear, bloquear y eliminar cuentas son operaciones que **Supabase exige hacer con privilegios de administrador** (la clave `service_role`), y esa clave nunca debe pegarse en `config.js` ni en ningún archivo que suba a GitHub: cualquiera que la viera tomaría control total de tu base de datos. Por eso estas tres acciones no se hacen directamente desde el navegador, sino a través de una función que corre en el servidor de Supabase: `supabase/functions/admin-usuarios/index.ts`.

**Instalarla (una sola vez, sin instalar nada en tu computador):**

1. En Supabase, ve a **Edge Functions** → **Deploy a new function**.
2. Nombre de la función: `admin-usuarios` (tiene que ser exactamente ese nombre).
3. Abre `supabase/functions/admin-usuarios/index.ts` de este proyecto, copia todo su contenido y pégalo en el editor de Supabase.
4. Guarda / despliega. No hace falta configurar variables de entorno: Supabase ya le entrega automáticamente la URL del proyecto y sus claves.

Con eso, la pestaña **Usuarios** queda funcionando: solo un supervisor puede usarla (la función lo verifica en el servidor, no solo en la página), y desde ahí puede:

- **Agregar** un usuario nuevo (correo, contraseña y si es ejecutivo o supervisor). Queda listo para entrar de inmediato, sin correo de confirmación.
- **Bloquear / Desbloquear**: un usuario bloqueado no puede iniciar sesión, pero su cuenta y sus ventas se conservan.
- **Eliminar**: borra la cuenta por completo. Sus ventas ya guardadas no se borran (quedan asociadas a un usuario que ya no existe).

> Nadie puede bloquearse, eliminarse o quitarse a sí mismo el rol de supervisor desde esta pestaña, para evitar quedar afuera por accidente.

Prueba la función apenas la despliegues: agrega un usuario de prueba, bloquéalo y elimínalo. Si algún paso falla, Supabase → Edge Functions → `admin-usuarios` → **Logs** muestra el error exacto.

## Sucursal según la razón social

El combobox **Sucursal** empieza deshabilitado y se llena solo con las sucursales que correspondan apenas se elige una **Razón social**, usando el archivo `sucursales.js`. La última combinación de razón social y sucursal que usó cada ejecutivo se recuerda en su navegador para el siguiente registro.

Para actualizar la lista de sucursales (por ejemplo si abren una sucursal nueva), pide que se regenere `sucursales.js` a partir de un Excel con dos columnas, `Empresa` y `Sucursal`, una fila por cada sucursal.

## Tipo con selección múltiple

En "Nueva venta", el campo **Tipo** ahora son casillas (CC, CI, Seguro, MPP) y el ejecutivo puede marcar más de una para el mismo folio. En la tabla y en el resumen del supervisor, cada tipo se muestra y se cuenta por separado.

Si ya tenías la tabla `ventas` creada con `tipo` como texto simple, vuelve a ejecutar `schema.sql`: convierte la columna a arreglo automáticamente sin borrar datos existentes.

> Si ya tenías el proyecto de Supabase creado antes de este cambio, vuelve a pegar el contenido completo de `schema.sql` en el SQL Editor y ejecútalo: es seguro repetirlo, crea la tabla de perfiles, migra a los usuarios existentes y actualiza los permisos sin duplicar nada. Este mismo archivo también actualiza el permiso de ingreso de ventas para que el supervisor pueda usar su pestaña "Ingreso de venta".

## Ver todos los registros

Como administrador, revisa la tabla `ventas` en Supabase → **Table Editor** (ahí ves los registros de todos los ejecutivos, con el correo de quien los guardó). Puedes exportarla a CSV desde el mismo lugar.
