// Copermiq — helpers de facturación (Stripe vía Supabase Edge Functions).
//
// No hablan con Stripe directamente: llaman a las Edge Functions del
// mismo proyecto de Supabase (supabase/functions/), que son las únicas
// que conocen la clave secreta de Stripe. La app (app.copermiq.com) usa
// las mismas funciones, así que dar de alta o gestionar el plan funciona
// igual desde los dos sitios — ver supabase/README.md y el documento de
// arquitectura en el proyecto de Claude.

import { supabase, isSupabaseConfigured } from './supabaseClient.js';

function functionsUrl(name) {
  const base = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
  // https://xxxx.supabase.co  ->  https://xxxx.supabase.co/functions/v1/<name>
  return `${base.replace(/\/$/, '')}/functions/v1/${name}`;
}

async function callFunction(name, body) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Configuración pendiente: faltan las claves de Supabase.');
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Necesitas iniciar sesión primero.');
  }

  const res = await fetch(functionsUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || 'Ha ocurrido un error. Inténtalo de nuevo.');
  }
  return payload;
}

// Abre Stripe Checkout para pasar a "subscription" o "premium". Redirige
// la propia pestaña a la URL de pago que devuelve Stripe.
export async function startCheckout(plan) {
  const { url } = await callFunction('create-checkout-session', { plan });
  if (url) window.location.href = url;
}

// Abre el Stripe Customer Portal (cambiar tarjeta, ver facturas, cancelar).
export async function openBillingPortal() {
  const { url } = await callFunction('create-portal-session');
  if (url) window.location.href = url;
}

// Lee el plan/estado actual del usuario logueado directamente de
// `profiles` (lectura permitida por RLS: cada usuario ve su propia fila).
//
// OJO — esquema real (verificado el 2026-08-08 contra el proyecto de
// Supabase, que gestiona también la app): la columna de usuario se llama
// `user_id`, NO `id`. `plan` usa valores en español: 'gratis' (por
// defecto), 'suscripcion', 'regalo' (mismo acceso que suscripcion, pero
// asignado a mano por un admin sin pago real), 'premium'. `is_admin`
// (boolean) es la columna compartida que marca quién es administrador —
// añadida el 2026-08-08 de acuerdo con el lado de la app. Esta tabla la
// creó y la sigue evolucionando el lado de la app — aquí solo la leemos.
export async function getMyProfile() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('plan, status, current_period_end, plan_since, approved, is_admin')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[Copermiq] No se pudo leer el perfil de facturación:', error.message);
    return null;
  }
  return data;
}

// Panel de administración: suscripciones/pagos (planes de pago o
// "regalo"), cruzados con Stripe. Solo funciona si el usuario logueado
// tiene profiles.is_admin = true — si no, la Edge Function responde 403.
export async function getAdminBillingOverview() {
  const data = await callFunction('admin-billing-overview');
  return data.rows ?? [];
}

// ---------------------------------------------------------------------
// Gestión de cuentas de usuario (añadido el 2026-08-08) — llama a las
// Edge Functions que YA EXISTEN Y GESTIONA LA APP para esto mismo
// (confirmado por la sesión de la app tras preguntarle explícitamente,
// para no duplicar nada): `admin-list-users`, `admin-set-plan`,
// `admin-activate-user`. La web no las despliega ni las mantiene, solo
// las invoca — igual que ya se hacía con `admin-delete-user`. Ver
// copermiq-billing-architecture.md para el detalle completo.
// ---------------------------------------------------------------------

// Todos los usuarios (no solo los de pago) — user_id, email, approved,
// plan, created_at. Se cruza en el cliente con getAdminBillingOverview()
// para completar importe/estado de Stripe donde aplique (ver cuenta.astro).
export async function getAdminUsersList() {
  const data = await callFunction('admin-list-users');
  return (data.users ?? []).map((u) => ({
    userId: u.user_id,
    email: u.email,
    approved: u.approved,
    plan: u.plan,
    createdAt: u.created_at,
  }));
}

// Cambia el plan de un usuario a mano (sin pasar por Stripe) — llama a
// admin-set-plan, la función de la app para esto. Escribe profiles.plan
// y profiles.plan_since; es la forma real de asignar 'regalo'.
export async function adminSetPlan(userId, plan) {
  return callFunction('admin-set-plan', { userId, plan });
}

// Aprueba una cuenta pendiente (profiles.approved = true) — llama a
// admin-activate-user. Todavía no existe el equivalente para desactivar
// (confirmado por la app el 2026-08-08); si hace falta, coordinarlo con
// ese lado antes de añadir nada por nuestra cuenta.
export async function adminActivateUser(userId) {
  return callFunction('admin-activate-user', { userId });
}

// Elimina por completo la cuenta de un usuario (perfil + datos +
// credenciales de Auth), cancelando su suscripción de Stripe si tenía.
// Llama a admin-delete-user — la función que ya gestiona y despliega el
// lado de la app; la web no la duplica, solo la invoca.
export async function adminDeleteUser(userId, email) {
  return callFunction('admin-delete-user', { userId, email });
}
