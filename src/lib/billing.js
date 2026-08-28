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
// plan, created_at, email_confirmed. Se cruza en el cliente con
// getAdminBillingOverview() para completar importe/estado de Stripe donde
// aplique (ver cuenta.astro).
//
// email_confirmed: añadido el 2026-08-28 por la sesión de la app, en
// respuesta a nuestra addenda del mismo día (columna "2F Ok" del panel de
// Usuarios) — calculado de `auth.users.email_confirmed_at IS NOT NULL`, sin
// tocar `profiles`. De momento solo está desplegado en el proyecto de
// STAGING de Supabase; en producción `admin-list-users` todavía no lo
// incluye, así que `u.email_confirmed` llega `undefined` hasta que Miq
// decida promocionarlo — el `?? false` de abajo lo trata igual que "no
// confirmado" mientras tanto, en vez de romper la tabla.
export async function getAdminUsersList() {
  const data = await callFunction('admin-list-users');
  return (data.users ?? []).map((u) => ({
    userId: u.user_id,
    email: u.email,
    approved: u.approved,
    plan: u.plan,
    createdAt: u.created_at,
    emailConfirmed: u.email_confirmed ?? false,
  }));
}

// Cambia el plan de un usuario a mano (sin pasar por Stripe) — llama a
// admin-set-plan, la función de la app para esto. Escribe profiles.plan
// y profiles.plan_since; es la forma real de asignar 'regalo'.
export async function adminSetPlan(userId, plan) {
  return callFunction('admin-set-plan', { userId, plan });
}

// Fuerza a mano el "2F Ok" (confirmado por email) de una cuenta — para
// cuando el email real de confirmación no le llegó al usuario (spam, error
// al escribirlo, etc.). Llama a admin-set-email-confirmed, la función que
// despliega y mantiene la app (mismo patrón que el resto de admin-*, mismo
// gate por profiles.is_admin) — añadida el 2026-08-28, de momento solo en
// STAGING (ver comentario de getAdminUsersList).
export async function adminSetEmailConfirmed(userId, confirmed) {
  return callFunction('admin-set-email-confirmed', { userId, confirmed });
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

// ---------------------------------------------------------------------
// Notas de admin sobre usuarios (añadido el 2026-08-09) — tabla PROPIA
// de la web (`admin_user_notes`), completamente aparte de `profiles`:
// no la toca ni la necesita la app para nada, solo sirve para que el
// admin de la web anote lo que quiera para identificar cuentas. No hay
// Edge Function — se lee/escribe directamente con el cliente de
// Supabase, protegido por RLS (solo profiles.is_admin = true puede
// leer/escribir esta tabla). Ver
// supabase/migrations/20260809_add_admin_user_notes.sql.
// ---------------------------------------------------------------------

// PostgREST devuelve este mensaje (código PGRST205) cuando la tabla no
// existe todavía en el proyecto real — es decir, cuando la migración
// supabase/migrations/20260809100000_add_admin_user_notes.sql no se ha
// aplicado aún a mano en el SQL Editor de Supabase (ver supabase/README.md).
// Lo detectamos para dar un mensaje que diga qué hacer, en vez del error
// crudo de Postgres.
function isMissingNotesTableError(message) {
  return typeof message === 'string' && /Could not find the table/i.test(message) && /admin_user_notes/i.test(message);
}
const NOTES_TABLE_MISSING_MESSAGE = 'Falta aplicar la migración de notas en Supabase (supabase/migrations/20260809100000_add_admin_user_notes.sql, en el SQL Editor) — ver supabase/README.md.';

export async function getAdminUserNotes() {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('admin_user_notes').select('user_id, note');
  if (error) {
    if (isMissingNotesTableError(error.message)) {
      console.warn('[Copermiq]', NOTES_TABLE_MISSING_MESSAGE);
    } else {
      console.warn('[Copermiq] No se pudieron leer las notas de usuarios:', error.message);
    }
    return [];
  }
  return (data ?? []).map((row) => ({ userId: row.user_id, note: row.note }));
}

export async function saveAdminUserNote(userId, note) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Configuración pendiente: faltan las claves de Supabase.');
  const { error } = await supabase
    .from('admin_user_notes')
    .upsert({ user_id: userId, note, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(isMissingNotesTableError(error.message) ? NOTES_TABLE_MISSING_MESSAGE : error.message);
}
