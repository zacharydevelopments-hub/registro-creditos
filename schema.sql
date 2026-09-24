-- Pega este archivo completo en Supabase → SQL Editor → Run.
-- Es seguro volver a ejecutarlo (crea lo que falte, no duplica nada).

-- ---------------------------------------------------------------------
-- 1) Tabla de ventas
-- ---------------------------------------------------------------------

create table if not exists public.ventas (
  id           uuid primary key default gen_random_uuid(),
  folio        text not null check (length(btrim(folio)) > 0),
  vendedor     text,
  tipo         text[] not null,
  razon_social text not null,
  sucursal     text not null check (length(btrim(sucursal)) > 0),
  user_id      uuid not null default auth.uid(),
  user_email   text default (auth.jwt() ->> 'email'),
  created_at   timestamptz not null default now()
);

-- Si la tabla ya existía con "tipo" como texto simple, la convertimos a arreglo
-- (una venta ahora puede tener varios tipos: CC, CI, Seguro, MPP).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ventas'
      and column_name = 'tipo' and data_type <> 'ARRAY'
  ) then
    alter table public.ventas drop constraint if exists ventas_tipo_check;
    -- Quita la restricción de folio único que dependía del tipo, si existía.
    alter table public.ventas drop constraint if exists ventas_folio_tipo_key;
    alter table public.ventas alter column tipo type text[] using array[tipo];
  end if;
end $$;

-- Corrige una restricción antigua que validaba mal la razón social (si existía).
alter table public.ventas drop constraint if exists ventas_razon_social_check;

alter table public.ventas drop constraint if exists ventas_tipo_check;
alter table public.ventas add constraint ventas_tipo_check
  check (
    array_length(tipo, 1) > 0
    and tipo <@ array['CC', 'CI', 'Seguro', 'MPP']::text[]
  );

-- Si la tabla ya existía sin la columna "vendedor" (se agregó después), la crea.
alter table public.ventas add column if not exists vendedor text;

-- Si quedaron ventas guardadas antes de pedir el vendedor, se completan con un
-- valor de marcador para poder exigir el dato de ahí en adelante sin romper lo ya guardado.
update public.ventas set vendedor = '(sin dato)' where vendedor is null;

alter table public.ventas alter column vendedor set not null;
alter table public.ventas drop constraint if exists ventas_vendedor_check;
alter table public.ventas add constraint ventas_vendedor_check
  check (length(btrim(vendedor)) > 0);

create index if not exists ventas_usuario_fecha_idx
  on public.ventas (user_id, created_at desc);

alter table public.ventas enable row level security;

-- ---------------------------------------------------------------------
-- 2) Roles: cada usuario tiene un perfil con rol 'ejecutivo' o 'supervisor'.
--    El ejecutivo solo ve e ingresa sus propias ventas.
--    El supervisor ve todas las ventas y también puede ingresar las suyas.
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id    uuid primary key references auth.users (id) on delete cascade,
  email text,
  role  text not null default 'ejecutivo' check (role in ('ejecutivo', 'supervisor'))
);

alter table public.profiles enable row level security;

drop policy if exists "Usuario ve su propio perfil" on public.profiles;
create policy "Usuario ve su propio perfil"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- Crea automáticamente el perfil (rol 'ejecutivo' por defecto) al crear un usuario nuevo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Crea el perfil de los usuarios que ya existían antes de agregar esta tabla.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- Función auxiliar (security definer, evita recursión de RLS) para saber
-- si el usuario que hace la consulta es supervisor.
create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'supervisor'
  );
$$;

-- ---------------------------------------------------------------------
-- 3) Políticas de la tabla ventas
--    - Insertar: cualquier usuario autenticado, pero solo a su propio nombre
--      (ejecutivo o supervisor: el supervisor también puede ingresar
--      ventas desde su propia pestaña "Ingreso de venta").
--    - Ver: el ejecutivo ve las suyas; el supervisor ve todas.
-- ---------------------------------------------------------------------

drop policy if exists "Ejecutivo inserta sus ventas" on public.ventas;
drop policy if exists "Usuario inserta sus propias ventas" on public.ventas;
create policy "Usuario inserta sus propias ventas"
  on public.ventas
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Ejecutivo ve sus ventas" on public.ventas;
drop policy if exists "Ver ventas propias o todas si es supervisor" on public.ventas;
create policy "Ver ventas propias o todas si es supervisor"
  on public.ventas
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_supervisor());

-- Para convertir a alguien en supervisor, ejecuta (con su correo real):
--   update public.profiles set role = 'supervisor' where email = 'correo@empresa.cl';
-- Para devolverlo a ejecutivo, ejecuta lo mismo con role = 'ejecutivo'.
--
-- Nota: crear, bloquear y eliminar usuarios (pestaña "Usuarios") no se hace
-- con políticas RLS, sino con la función de servidor admin-usuarios (ver
-- supabase/functions/admin-usuarios) porque esas acciones requieren la
-- clave service_role, que nunca debe estar en el navegador.
