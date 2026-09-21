-- Pega este archivo completo en Supabase → SQL Editor → Run.

create table if not exists public.ventas (
  id           uuid primary key default gen_random_uuid(),
  folio        text not null check (length(btrim(folio)) > 0),
  tipo         text not null check (tipo in ('CC', 'CI', 'Seguro', 'MPP')),
  razon_social text not null check (length(btrim(razon_social)) > 0),
  sucursal     text not null check (length(btrim(sucursal)) > 0),
  user_id      uuid not null default auth.uid(),
  user_email   text default (auth.jwt() ->> 'email'),
  created_at   timestamptz not null default now(),

  -- Un mismo folio puede tener distintos tipos, pero no el mismo tipo dos veces.
  -- Si cada folio debe ser único sin importar el tipo, cambia por: unique (folio)
  unique (folio, tipo)
);

create index if not exists ventas_usuario_fecha_idx
  on public.ventas (user_id, created_at desc);

-- Seguridad: cada ejecutivo solo puede insertar sus propios registros.
alter table public.ventas enable row level security;

drop policy if exists "Ejecutivo inserta sus ventas" on public.ventas;
create policy "Ejecutivo inserta sus ventas"
  on public.ventas
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Roles: cada usuario tiene un perfil con rol 'ejecutivo' o 'supervisor'.
-- El ejecutivo solo ve sus ventas; el supervisor ve las de todos.
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

-- El ejecutivo ve sus propias ventas; el supervisor ve todas.
drop policy if exists "Ejecutivo ve sus ventas" on public.ventas;
drop policy if exists "Ver ventas propias o todas si es supervisor" on public.ventas;
create policy "Ver ventas propias o todas si es supervisor"
  on public.ventas
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_supervisor());

-- Para convertir a alguien en supervisor, ejecuta (con su correo real):
--   update public.profiles set role = 'supervisor' where email = 'correo@empresa.cl';
