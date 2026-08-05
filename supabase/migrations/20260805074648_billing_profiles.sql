-- Copermiq — planes de pago (Gratis / Suscripción / Premium)
--
-- Esta tabla es la ÚNICA fuente de verdad sobre qué plan tiene cada
-- usuario. Tanto la web (copermiq-web) como la app (app.copermiq.com) la
-- leen para decidir qué mostrar o permitir. Ninguna de las dos la escribe
-- directamente: solo lo hacen las Edge Functions de supabase/functions/
-- (create-checkout-session, create-portal-session, stripe-webhook), que
-- usan la service role key.
--
-- Ver el documento "Copermiq — Arquitectura de planes de pago" en el
-- proyecto de Claude para el razonamiento completo.
--
-- Cómo aplicar esta migración: con la Supabase CLI logueada en tu
-- proyecto, `supabase db push` desde la raíz del repo. También puedes
-- pegar este archivo tal cual en el SQL Editor del panel de Supabase.

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
