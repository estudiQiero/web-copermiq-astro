// ⚠️ SOLO REFERENCIA — NO DESPLEGAR DESDE ESTE REPO SIN COORDINAR ANTES.
//
// Código real compartido por el lado de la app el 2026-08-08. Es la
// función más delicada de las tres: la única que escribe profiles.plan
// de verdad. Se guarda aquí solo para que quien trabaje en la web sepa
// qué contrato respeta — no para volver a desplegarla desde aquí.

// ================= FUNCIÓN: stripe-webhook =================
// Se pega en Supabase → Edge Functions → Deploy a new function → Via
// Editor, con el nombre exacto "stripe-webhook".
//
// Qué hace: es la función que Stripe llama a sí misma (no la llama
// nunca la app ni la web) cada vez que pasa algo relevante con un pago
// — alguien completa el pago, se renueva la suscripción, alguien
// cancela, o falla un cobro. Esta función es la ÚNICA que escribe
// profiles.plan de verdad — ni la app ni la web lo hacen nunca
// directamente (las políticas de la tabla ya lo impiden).
//
// IMPORTANTE — configuración en Stripe, aparte de en Supabase:
// 1. Copia la URL de esta función una vez desplegada (algo como
//    https://TU-PROYECTO.supabase.co/functions/v1/stripe-webhook).
// 2. En Stripe → Developers → Webhooks → Add endpoint, pega esa URL.
// 3. Selecciona estos eventos: checkout.session.completed,
//    customer.subscription.updated, customer.subscription.deleted,
//    invoice.payment_failed.
// 4. Stripe te da un "Signing secret" (empieza por whsec_) — ese es el
//    STRIPE_WEBHOOK_SECRET que hay que poner como secreto de esta función.
//
// Requiere estos secretos (Edge Functions → esta función → Secrets):
//   - STRIPE_SECRET_KEY
//   - STRIPE_WEBHOOK_SECRET (el "Signing secret" del paso 4 de arriba)
//   - STRIPE_PRICE_SUSCRIPCION / STRIPE_PRICE_PREMIUM (para saber a qué
//     plan nuestro corresponde cada Price ID de Stripe)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature ?? "",
      Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? ""
    );
  } catch (e) {
    return new Response(`Firma no válida: ${e}`, { status: 400 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const priceToPlan = (priceId) => {
    if (priceId === Deno.env.get("STRIPE_PRICE_PREMIUM")) return "premium";
    if (priceId === Deno.env.get("STRIPE_PRICE_SUSCRIPCION")) return "suscripcion";
    return null;
  };

  // Busca el perfil por user_id (si lo tenemos, ej. la primera vez, vía
  // client_reference_id/metadata) o si no, por stripe_customer_id — así
  // funciona tanto en el primer pago como en eventos posteriores.
  async function findProfile(userId, customerId) {
    if (userId) {
      const { data } = await supabaseAdmin.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
      if (data) return data.user_id;
    }
    if (customerId) {
      const { data } = await supabaseAdmin.from("profiles").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
      if (data) return data.user_id;
    }
    return null;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.supabase_user_id;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = priceToPlan(priceId) || "suscripcion";

        const targetUserId = await findProfile(userId, customerId);
        if (targetUserId) {
          await supabaseAdmin.from("profiles").update({
            plan,
            status: "active",
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            plan_since: new Date().toISOString(),
          }).eq("user_id", targetUserId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = priceToPlan(priceId);
        const targetUserId = await findProfile(subscription.metadata?.supabase_user_id, customerId);
        if (targetUserId) {
          // Si canceló pero todavía está dentro del periodo ya pagado,
          // el plan se queda como está (no se baja a gratis todavía) —
          // solo cambia el "status", para poder avisarle en la app.
          const updates = {
            status: subscription.cancel_at_period_end ? "canceled" : subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          };
          if (plan && subscription.status === "active") { updates.plan = plan; updates.plan_since = new Date().toISOString(); }
          await supabaseAdmin.from("profiles").update(updates).eq("user_id", targetUserId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        // Este evento solo llega cuando el periodo ya pagado ha terminado
        // de verdad (Stripe gestiona la cancelación con gracia él solo) —
        // aquí sí es seguro bajar el plan a gratis.
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const targetUserId = await findProfile(subscription.metadata?.supabase_user_id, customerId);
        if (targetUserId) {
          await supabaseAdmin.from("profiles").update({
            plan: "gratis",
            status: "canceled",
            stripe_subscription_id: null,
            plan_since: new Date().toISOString(),
          }).eq("user_id", targetUserId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const targetUserId = await findProfile(null, customerId);
        if (targetUserId) {
          await supabaseAdmin.from("profiles").update({ status: "past_due" }).eq("user_id", targetUserId);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
