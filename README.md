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

## Ver todos los registros

Como administrador, revisa la tabla `ventas` en Supabase → **Table Editor** (ahí ves los registros de todos los ejecutivos, con el correo de quien los guardó). Puedes exportarla a CSV desde el mismo lugar.
