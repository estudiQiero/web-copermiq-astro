// ⚠️ SOLO REFERENCIA — la gestiona el lado de la app, la web no la llama.
//
// Compartida el 2026-08-08 por transparencia, ya que usa profiles.is_admin
// (la misma columna compartida) — no hace falta que la web haga nada con
// esta función, se guarda aquí solo para tener el contexto completo junto
// a las demás.

// ================= FUNCIÓN: admin-delete-user =================
// Se pega en Supabase → Edge Functions → Deploy a new function → Via
// Editor, con el nombre exacto "admin-delete-user".
//
// Qué hace: permite que el ADMINISTRADOR (y solo el administrador) borre
// de verdad la cuenta de otra persona — no solo su acceso a Copermiq,
// sino las credenciales reales de Supabase Auth, igual que hace
// "Eliminar cuenta" cuando alguien se borra a sí mismo. Se usa desde el
// botón "Eliminar solicitud" del panel de Usuarios (Admin).
//
// Si esa persona tenía una suscripción de Stripe activa, esta función
// también la CANCELA (de forma inmediata, no al final del periodo) —
// así no se le sigue cobrando a alguien que ya ha sido eliminado.
// OJO: esto NO devuelve el dinero de cargos ya hechos — un reembolso es
// una decisión aparte, que se hace a mano en Stripe (Payments → Refund),
// nunca disparada sola como efecto secundario de borrar una cuenta.
//
// Por qué hacía falta lo de las credenciales: antes, "Eliminar solicitud"
// solo borraba el perfil y la invitación — la persona seguía pudiendo
// entrar con su contraseña si ya se había puesto una, aunque quedara
// bloqueada otra vez nada más entrar. Con esta función, su acceso
// desaparece del todo.
//
// Seguridad: la función comprueba que quien la llama está autenticado
// Y que su fila en profiles tiene is_admin=true — nadie más puede
// usarla, ni para borrarse a otros ni para borrarse a sí mismo por aquí.
// (Antes comprobaba un email fijo por variable de entorno; desde el
// 2026-08-08 usa la misma columna compartida que la app, para que la web
// —proyecto aparte, mismo Supabase— pueda usar exactamente el mismo
// criterio si algún día necesita verificar quién es admin.)
//
// Requiere estos secretos (Edge Functions → Secrets, la página general
// del proyecto — no hace falta repetirlos por función):
//   - STRIPE_SECRET_KEY: la misma clave secreta de Stripe que ya usan
//     las otras funciones de cobro.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Falta el token de autenticación" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: callerError } = await supabaseClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "No se pudo verificar tu identidad" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (!callerProfile?.is_admin) {
      return new Response(JSON.stringify({ error: "Solo el administrador puede hacer esto" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, email } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "Falta el id del usuario a eliminar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // El admin nunca puede borrarse a sí mismo por aquí, por accidente.
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: "No puedes eliminarte a ti mismo desde aquí" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Antes de borrar nada, miramos si tenía una suscripción de Stripe
    // activa, para poder cancelarla — una vez borrado el perfil, este
    // dato ya no estaría en ningún sitio.
    const { data: profileBeforeDelete } = await supabaseAdmin
      .from("profiles")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileBeforeDelete?.stripe_subscription_id) {
      try {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });
        await stripe.subscriptions.cancel(profileBeforeDelete.stripe_subscription_id);
      } catch (e) {
        // Si ya estaba cancelada, o cualquier otro fallo con Stripe, no
        // bloqueamos el borrado por esto — seguimos adelante igualmente.
        console.error("No se pudo cancelar la suscripción de Stripe:", e);
      }
    }

    // Limpiamos todos los datos que pudiera tener, igual que en
    // "Eliminar cuenta" cuando alguien se borra a sí mismo.
    const tables = ["clients", "invoices", "expenses", "providers", "budgets", "app_config", "user_settings", "profiles"];
    for (const table of tables) {
      await supabaseAdmin.from(table).delete().eq("user_id", userId);
    }
    if (email) {
      await supabaseAdmin.from("invited_emails").delete().eq("email", email);
    }

    // Y por último, las credenciales de acceso reales.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
