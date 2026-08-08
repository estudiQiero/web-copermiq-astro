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
// `user_id`, NO `id`, y `plan` usa valores en español ('gratis' por
// defecto, 'suscripcion', 'premium'), no en inglés. Esta tabla la creó y
// la sigue evolucionando el lado de la app — aquí solo la leemos.
export async function getMyProfile() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('plan, status, current_period_end, plan_since, approved')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[Copermiq] No se pudo leer el perfil de facturación:', error.message);
    return null;
  }
  return data;
}

// Panel de administración: pendiente de rehacer contra el esquema real
// (ver nota arriba) y de decidir, junto con el lado de la app, cómo se
// marca a alguien como administrador — de momento no existe ninguna
// columna para eso en `profiles`. No usar todavía.
export async function getAdminBillingOverview() {
  const data = await callFunction('admin-billing-overview');
  return data.subscriptions ?? [];
}
