// ⚠️ SOLO REFERENCIA — NO DESPLEGAR DESDE ESTE REPO SIN COORDINAR ANTES.
//
// Esta función ya está desplegada y en uso real, gestionada desde el lado
// de la app (app.copermiq.com, repo aparte). Este archivo es una copia de
// lo que hay realmente desplegado en Supabase a día 2026-08-08, guardada
// aquí solo para que quien trabaje en la web sepa qué contrato tiene que
// respetar (nombres de columnas, valores de plan, etc.) — no para volver
// a desplegarla desde aquí. Si algún día hace falta cambiarla, hay que
// coordinarlo con quien lleve la app, porque desplegar una versión
// distinta desde este repo sobrescribiría la que ya funciona.
//
// Nota de lo aprendido al comparar (ver copermiq-billing-architecture.md
// para el detalle completo): la tabla `profiles` real usa `user_id` (no
// `id`) y valores de plan en español ('suscripcion'/'premium', no
// 'subscription'/'premium'). Esta función ya normaliza alias en inglés
// que pueda mandar la web, así que `startCheckout('subscription')` desde
// billing.js sigue funcionando tal cual.

// ================= FUNCIÓN: create-checkout-session =================
// Se pega en Supabase → Edge Functions → Deploy a new function → Via
// Editor, con el nombre exacto "create-checkout-session".
//
// Qué hace: recibe el JWT de quien está autenticado en la app (o en la
// web, es indiferente — comparten el mismo Supabase) y el plan que
// quiere contratar ('suscripcion' o 'premium'). Crea (o reutiliza) su
// cliente de Stripe, abre una sesión de Stripe Checkout para el precio
// correspondiente, y devuelve la URL a la que hay que llevar al usuario.
//
// Requiere estos secretos (Edge Functions → esta función → Secrets):
//   - STRIPE_SECRET_KEY: tu clave secreta de Stripe (empieza por sk_).
//   - STRIPE_PRICE_SUSCRIPCION: el Price ID del plan Suscripción.
//   - STRIPE_PRICE_PREMIUM: el Price ID del plan Premium.
//   - APP_URL (opcional): a dónde volver tras pagar/cancelar, ej.
//     "https://app.copermiq.com". Si no lo pones, usa ese valor por
//     defecto.
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
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "No se pudo verificar tu identidad" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let { plan } = await req.json();
    // Normalizamos: la web (proyecto aparte) podría mandar mayúsculas, con
    // espacios, o en inglés ("subscription") — no dependemos de que
    // escriba el texto exactamente igual que la app.
    plan = String(plan || "").trim().toLowerCase();
    if (plan === "subscription" || plan === "sub" || plan === "suscripción") plan = "suscripcion";
    if (plan !== "suscripcion" && plan !== "premium") {
      return new Response(JSON.stringify({ error: "Plan no válido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceId = plan === "premium"
      ? Deno.env.get("STRIPE_PRICE_PREMIUM")
      : Deno.env.get("STRIPE_PRICE_SUSCRIPCION");
    if (!priceId) {
      return new Response(JSON.stringify({ error: `Falta configurar el Price ID de ${plan} en los secretos de esta función` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });

    // Cliente con permisos de administrador — necesario para leer/escribir
    // en profiles saltándose las políticas normales (que impiden que el
    // propio cliente escriba su plan).
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("user_id", user.id);
    }

    const appUrl = Deno.env.get("APP_URL") || "https://app.copermiq.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}?checkout=success`,
      cancel_url: `${appUrl}?checkout=cancel`,
      // El id de usuario también va aquí, aparte del customer — así el
      // webhook puede encontrar el perfil correcto incluso en el primer
      // pago, antes de que exista relación previa con este customer.
      client_reference_id: user.id,
      subscription_data: { metadata: { supabase_user_id: user.id } },
    });

    return new Response(JSON.stringify({ url: session.url }), {
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
