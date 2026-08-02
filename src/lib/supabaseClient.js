// ============================================================================
// Cliente de Supabase — COMPARTIDO con la app de Copermiq (app.copermiq.com)
// ============================================================================
//
// Esta web y la app de Copermiq usan el MISMO proyecto de Supabase: no son
// dos sistemas sincronizados, es una única cuenta de Supabase Auth (y una
// única base de datos) usada desde dos sitios distintos. Un usuario que se
// registra aquí puede iniciar sesión directamente en app.copermiq.com, y
// viceversa.
//
// ----------------------------------------------------------------------------
// ⚠️  DÓNDE PEGAR LAS CLAVES REALES (SUPABASE_URL y SUPABASE_ANON_KEY)
// ----------------------------------------------------------------------------
// Este archivo NUNCA debe contener las claves reales escritas a mano: este
// repositorio es público, así que cualquier valor que escribas aquí
// quedaría visible para siempre en el historial de Git. Por eso los dos
// valores se leen de variables de entorno.
//
//   1) EN LOCAL (para probar en tu ordenador con `npm run dev`):
//      Crea un archivo llamado `.env` en la raíz del proyecto (al lado de
//      package.json) — NO se sube a git, ya está listado en .gitignore.
//      Puedes partir de la plantilla `.env.example` que ya existe ahí.
//      Su contenido debe ser exactamente:
//
//        PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
//        PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon-real
//
//   2) EN PRODUCCIÓN (Netlify, el sitio "copermiq-web" que sirve copermiq.com):
//      Panel de Netlify → Site configuration → Environment variables →
//      añade esas mismas dos variables (mismos nombres, mismos valores) y
//      vuelve a desplegar (Trigger deploy) para que el build las incluya.
//      Astro las incrusta en el HTML/JS generado en el momento del build,
//      así que un cambio de variable siempre necesita un redeploy.
//
// La clave "anon" no es secreta (Supabase la diseña para vivir en código de
// cliente/navegador, protegida por las políticas de Row Level Security de
// la base de datos), pero se gestiona igualmente por variables de entorno
// para no tener que tocar código si cambia, y para no duplicarla a mano.
// ----------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

const hasCredentials = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasCredentials) {
  // Esto es normal antes de configurar las variables de entorno (ver arriba).
  // El registro/inicio de sesión mostrará un aviso en vez de fallar en seco.
  console.warn(
    '[Copermiq] Faltan PUBLIC_SUPABASE_URL y/o PUBLIC_SUPABASE_ANON_KEY. ' +
      'Ver instrucciones en src/lib/supabaseClient.js para configurarlas.'
  );
}

// `supabase` es `null` mientras no se hayan configurado las variables de
// entorno, para no romper la carga de la página. El resto del código que
// lo usa (AuthModal.astro) comprueba esto antes de llamarlo.
export const supabase = hasCredentials ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const isSupabaseConfigured = hasCredentials;
