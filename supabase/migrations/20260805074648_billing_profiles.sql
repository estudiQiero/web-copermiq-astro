-- Copermiq — planes de pago (Gratis / Suscripción / Premium)
--
-- ⚠️ OBSOLETA — NO EJECUTAR ESTO CONTRA EL PROYECTO REAL DE SUPABASE.
--
-- Se escribió asumiendo que había que crear la tabla `profiles` desde
-- cero. Verificado el 2026-08-08: esa tabla ya existía, creada y
-- gestionada desde el lado de la app, con un esquema distinto al de
-- aquí abajo (columna `user_id` en vez de `id`, valores de plan en
-- español, columnas `email`/`approved`/`plan_since` que este archivo no
-- contempla). El `create table if not exists` no haría nada (la tabla ya
-- existe), pero los triggers y la política de RLS de más abajo SÍ se
-- ejecutarían y fallarían o, peor, el trigger `handle_new_user` podría
-- intentar insertar usando la columna `id` (que no existe en la tabla
-- real) y romper el alta de usuarios nuevos tanto en la web como en la
-- app. Se deja este archivo solo como referencia histórica de cómo se
-- pensó al principio, antes de descubrir que ya existía una tabla real.
-- Ver copermiq-billing-architecture.md para el esquema real verificado.
--
-- (Instrucciones originales, ya no aplicables: `supabase db push`, o
-- pegar el contenido en el SQL Editor del panel de Supabase.)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  -- Plan efectivo ahora mismo. Esto es lo único que hace falta leer para
  -- gatear funciones en la web o en la app.
  plan text not null default 'free'
    check (plan in ('free', 'subscription', 'premium')),

  -- Estado del cobro en Stripe. Informativo (avisos tipo "tu pago ha
  -- fallado" o "cancelado, activo hasta el [fecha]"); no se usa para
  -- decidir acceso — eso lo decide únicamente `plan`.
  status text not null default 'active'
    check (status in ('active', 'canceled', 'past_due', 'incomplete')),

  stripe_customer_id text unique,
  stripe_subscription_id text unique,

  -- Fin del periodo ya pagado. Al cancelar, el usuario conserva `plan`
  -- hasta esta fecha (política de cancelación: "acceso hasta fin de
  -- periodo", no inmediato).
  current_period_end timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Fuente de verdad del plan de cada usuario (free/subscription/premium), compartida por la web y la app a través de Supabase. Solo las Edge Functions de Stripe escriben en ella.';

-- Mantener updated_at al día en cada cambio.
create or replace function public.handle_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_profiles_updated_at();

-- Crear la fila de perfil automáticamente al registrarse (empieza en
-- plan gratuito), para que la web/app nunca se encuentren un usuario sin
-- fila en profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Row Level Security: cada usuario solo puede LEER su propia fila. Nadie
-- puede insertar/actualizar/borrar desde el cliente (ni siquiera la suya
-- propia) — eso es a propósito, así nadie puede regalarse a sí mismo un
-- plan de pago. Solo la service role (que usan las Edge Functions,
-- bypassa RLS) puede escribir.
alter table public.profiles enable row level security;

drop policy if exists "Los usuarios leen su propio perfil" on public.profiles;
create policy "Los usuarios leen su propio perfil"
  on public.profiles
  for select
  using (auth.uid() = id);
