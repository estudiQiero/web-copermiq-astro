// ⚠️ SOLO REFERENCIA — NO DESPLEGAR DESDE ESTE REPO SIN COORDINAR ANTES.
//
// Código real compartido por el lado de la app el 2026-08-08 (sin
// cambios de fondo respecto a versiones anteriores, solo con las
// versiones de librería ya fijadas a una versión estable). Se guarda
// aquí para que quien trabaje en la web sepa qué contrato respeta —
// no para volver a desplegarla desde aquí. billing.js ya la llama por
// nombre y funciona contra la versión real desplegada.

// ================= FUNCIÓN: create-portal-session =================
// Se pega en Supabase → Edge Functions → Deploy a new function → Via
// Editor, con el nombre exacto "create-portal-session".
//
// Qué hace: recibe el JWT de quien está autenticado, busca su cliente de
// Stripe, y abre una sesión del Portal de Cliente de Stripe — ahí puede
// cambiar de tarjeta, ver facturas, o cancelar su suscripción, sin que
// tengamos que construir nada de eso nosotros mismos.
//
// Requiere estos secretos (Edge Functions → esta función → Secrets):
//   - STRIPE_SECRET_KEY: tu clave secreta de Stripe (empieza por sk_).
//   - APP_URL (opcional): a dónde volver al salir del portal, ej.
//     "https://app.copermiq.com".
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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "Todavía no tienes ninguna suscripción contratada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });
    const appUrl = Deno.env.get("APP_URL") || "https://app.copermiq.com";

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: appUrl,
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
