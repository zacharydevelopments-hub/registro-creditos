# Registro de ventas

Página web con login para que los ejecutivos registren:

- Folio de venta
- Tipo (CC, CI, Seguro, MPP)
- Razón social
- Sucursal

Sitio estático (HTML + CSS + JS) con **Supabase** (login y base de datos), publicado con **Vercel** desde **GitHub**. No necesita build ni Node.

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor**, pega el contenido de `supabase/schema.sql` y ejecútalo. Crea la tabla `ventas` con seguridad por fila (cada ejecutivo solo ve y guarda lo suyo).
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

Además de los ejecutivos, ahora existe el rol **supervisor**: al entrar ve automáticamente una vista propia con **todas las ventas de todos los ejecutivos** (no solo las suyas), con filtros por sucursal, tipo, ejecutivo y búsqueda de folio/razón social, además de un botón para exportar a CSV.

Todo usuario nuevo se crea como `ejecutivo` por defecto. Para convertir a alguien en supervisor:

1. Abre Supabase → **SQL Editor**.
2. Ejecuta (reemplazando el correo real):
   ```sql
   update public.profiles set role = 'supervisor' where email = 'correo@empresa.cl';
   ```
3. La próxima vez que esa persona inicie sesión (o recargue la página), verá la vista de supervisor.

Para devolverlo a ejecutivo, ejecuta lo mismo con `role = 'ejecutivo'`.

> Si ya tenías el proyecto de Supabase creado antes de este cambio, vuelve a pegar el contenido completo de `supabase/schema.sql` en el SQL Editor y ejecútalo: es seguro repetirlo, crea la tabla de perfiles, migra a los usuarios existentes y actualiza los permisos sin duplicar nada.

## Ver todos los registros

Como administrador, revisa la tabla `ventas` en Supabase → **Table Editor** (ahí ves los registros de todos los ejecutivos, con el correo de quien los guardó). Puedes exportarla a CSV desde el mismo lugar.
