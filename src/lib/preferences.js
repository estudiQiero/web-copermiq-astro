// Copermiq — preferencias de interfaz (color e idioma) compartidas con la
// app (app.copermiq.com). Viven en la tabla `app_config` (una fila por
// usuario, columna `payload` de tipo jsonb) — la MISMA tabla y las MISMAS
// claves que usa la pantalla "Preferencias → Interfaz" de la app, según lo
// confirmó Miq el 2026-08-28: uiColor, customColorHex, customColors,
// uiMode, contentMode, language. No hay Edge Function para esto — se
// lee/escribe directamente con el cliente de Supabase (protegido por RLS:
// cada usuario ve/edita solo su propia fila), igual que ya se hace con
// admin_user_notes en billing.js.
//
// OJO — el payload es un ÚNICO JSON con TODAS las preferencias del
// usuario, incluidos datos fiscales que no nos incumben aquí. Nunca lo
// sobrescribimos entero: siempre se lee el objeto completo, se fusiona
// solo con los campos que tocamos, y se guarda de vuelta el objeto
// resultante — igual que hace la app (`config = {...config, ...payload}`).
//
// La web solo expone Color e Idioma (lo que pidió Miq) — `contentMode` no
// se toca nunca desde aquí: como no hay nada en esta web equivalente al
// "modo del contenido" de la app, cualquier valor que ya tenga guardado el
// usuario se conserva tal cual gracias a la fusión de arriba.

import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const DEFAULT_PREFERENCES = {
  uiColor: 'verde',
  customColorHex: null,
  customColors: [],
  uiMode: 'dark',
  contentMode: 'light',
  language: 'es',
};

async function getUserId() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function getFullPayload(userId) {
  const { data, error } = await supabase
    .from('app_config')
    .select('payload')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[Copermiq] No se pudo leer app_config:', error.message);
    return {};
  }
  return data?.payload ?? {};
}

// Lee las preferencias del usuario logueado, con valores por defecto
// razonables si todavía no tiene fila en app_config (p. ej. si nunca ha
// abierto la app). Sin sesión, devuelve los valores por defecto sin tocar
// Supabase.
export async function getPreferences() {
  const userId = await getUserId();
  if (!userId) return { ...DEFAULT_PREFERENCES };
  const payload = await getFullPayload(userId);
  return {
    uiColor: payload.uiColor ?? DEFAULT_PREFERENCES.uiColor,
    customColorHex: payload.customColorHex ?? DEFAULT_PREFERENCES.customColorHex,
    customColors: Array.isArray(payload.customColors) ? payload.customColors : DEFAULT_PREFERENCES.customColors,
    uiMode: payload.uiMode === 'light' ? 'light' : 'dark',
    contentMode: payload.contentMode === 'dark' ? 'dark' : 'light',
    language: payload.language === 'ca' ? 'ca' : 'es',
  };
}

// Guarda solo los campos indicados en `partial` (p. ej. { uiColor: 'azul' }
// o { language: 'ca' }), fusionados con el resto del payload existente sin
// tocarlo. Lanza si no hay sesión o si Supabase no está configurado.
export async function savePreferences(partial) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Configuración pendiente: faltan las claves de Supabase.');
  }
  const userId = await getUserId();
  if (!userId) throw new Error('Necesitas iniciar sesión primero.');

  const current = await getFullPayload(userId);
  const merged = { ...current, ...partial };
  const { error } = await supabase
    .from('app_config')
    .upsert({ user_id: userId, payload: merged, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  return merged;
}
