// ================= FUNCIÓN: admin-billing-overview =================
// Nueva desde la web (copermiq-web), pensada para desplegarse junto a las
// demás funciones del proyecto de Supabase compartido. No la gestiona el
// lado de la app, pero usa exactamente el mismo esquema de `profiles`
// (columna user_id, is_admin, valores de plan en español incluido
// 'regalo') que confirmaron el 2026-08-08 — ver
// copermiq-billing-architecture.md para el contexto completo.
//
// Qué hace: si quien llama tiene profiles.is_admin = true, devuelve una
// lista de todos los usuarios con plan de pago (o regalado) — email,
// plan, estado, desde cuándo, y si tiene una suscripción de Stripe
// asociada, también importe/periodicidad/estado real de Stripe y si está
// marcada para cancelar. Es de solo lectura: no permite cambiar nada
// (para eso ya existe el desplegable del panel de admin de la app).
//
// Requiere estos secretos (Edge Functions → esta función → Secrets):
//   - STRIPE_SECRET_KEY: la misma clave secreta de Stripe que las demás.
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los
// inyecta Supabase solo, no hace falta configurarlos a mano.
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

    // Comprobación de admin con service role, saltándose la RLS —
    // imprescindible: la RLS normal solo deja a cada usuario leer su
    // propia fila, así que es la única forma de saber si OTRO es admin.
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (!callerProfile?.is_admin) {
      return new Response(JSON.stringify({ error: "No tienes permiso para ver esto" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Todos los usuarios con algo que mostrar: de pago o con acceso
    // regalado. Los "gratis" no aportan nada a esta tabla.
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, plan, status, stripe_subscription_id, current_period_end, plan_since")
      .neq("plan", "gratis")
      .order("plan_since", { ascending: false, nullsFirst: false });

    if (profilesError) {
      return new Response(JSON.stringify({ error: profilesError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });

    // Para cada fila con una suscripción real de Stripe, se pide el
    // importe/periodicidad/estado en vivo. Si falla una consulta puntual
    // (p. ej. una suscripción borrada en Stripe pero no aún en profiles),
    // no tira abajo el resto de la tabla — esa fila se queda sin esos
    // datos extra.
    const rows = await Promise.all(
      (profiles ?? []).map(async (profile) => {
        const base = {
          email: profile.email,
          plan: profile.plan,
          status: profile.status,
          planSince: profile.plan_since,
          currentPeriodEnd: profile.current_period_end,
          stripeStatus: null,
          cancelAtPeriodEnd: null,
          amount: null,
          currency: null,
          interval: null,
        };

        if (!profile.stripe_subscription_id) return base;

        try {
          const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
            expand: ["items.data.price"],
          });
          const price = sub.items.data[0]?.price;
          return {
            ...base,
            stripeStatus: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            amount: price?.unit_amount != null ? price.unit_amount / 100 : null,
            currency: price?.currency ?? null,
            interval: price?.recurring?.interval ?? null,
          };
        } catch (e) {
          console.error("No se pudo leer la suscripción de Stripe para", profile.email, e);
          return base;
        }
      })
    );

    return new Response(JSON.stringify({ rows }), {
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
