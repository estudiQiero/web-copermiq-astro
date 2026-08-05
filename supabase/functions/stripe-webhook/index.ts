// Copermiq — recibe los eventos de Stripe y es el ÚNICO sitio que escribe
// el plan real del usuario en `profiles`. Ni la web ni la app lo hacen
// directamente: solo reaccionan a lo que este webhook confirma.
//
// Despliegue: `supabase functions deploy stripe-webhook --no-verify-jwt`
// (--no-verify-jwt es imprescindible: quien llama es Stripe, no un
// usuario logueado, así que no hay JWT de Supabase que comprobar — la
// autenticidad se verifica con la firma de Stripe, más abajo).
//
// Después de desplegar, copia la URL de la función y crea el webhook en
// el dashboard de Stripe (Developers → Webhooks) apuntando ahí, escuchando
// los eventos: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted, invoice.payment_failed. Stripe te dará
// un "signing secret" (whsec_...) — pégalo como STRIPE_WEBHOOK_SECRET.
//
// Variables de entorno que necesita:
//   STRIPE_SECRET_KEY           — clave secreta de Stripe (sk_...)
//   STRIPE_WEBHOOK_SECRET        — whsec_... (lo da Stripe al crear el webhook)
//   STRIPE_PRICE_SUBSCRIPTION   — price ID del plan "Suscripción"
//   STRIPE_PRICE_PREMIUM        — price ID del plan "Premium"

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
});

const PRICE_TO_PLAN: Record<string, 'subscription' | 'premium'> = {};
if (Deno.env.get('STRIPE_PRICE_SUBSCRIPTION')) {
  PRICE_TO_PLAN[Deno.env.get('STRIPE_PRICE_SUBSCRIPTION')!] = 'subscription';
}
if (Deno.env.get('STRIPE_PRICE_PREMIUM')) {
  PRICE_TO_PLAN[Deno.env.get('STRIPE_PRICE_PREMIUM')!] = 'premium';
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const body = await req.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error('Falta la cabecera stripe-signature');
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error('Firma de webhook inválida', err);
    return new Response('Firma inválida', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          await syncSubscriptionToProfile(subscription);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToProfile(subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await admin
            .from('profiles')
            .update({ status: 'past_due' })
            .eq('stripe_customer_id', invoice.customer as string);
        }
        break;
      }

      default:
        // Otros eventos no nos interesan; se ignoran silenciosamente.
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error procesando webhook', event.type, err);
    // Devolvemos 500 para que Stripe reintente el evento más tarde.
    return new Response('Error interno', { status: 500 });
  }
});

// Traduce el estado de una Subscription de Stripe al `plan`/`status` que
// guardamos en profiles. Esta es la única función que decide qué plan
// tiene de verdad un usuario — tanto la web como la app confían en su
// resultado.
//
// Política de cancelación (acceso hasta fin de periodo): cuando el
// usuario cancela desde el Portal de Stripe, Stripe NO cierra la
// suscripción al momento — la deja con status "active" y
// cancel_at_period_end=true hasta que el periodo ya pagado termina de
// verdad. Solo entonces Stripe la pasa a "canceled" (y dispara
// customer.subscription.deleted). Por eso basta con mirar el status real
// que manda Stripe: mientras diga "active"/"trialing", el usuario sigue
// teniendo su plan de pago, haya cancelado o no.
async function syncSubscriptionToProfile(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const mappedPlan = priceId ? PRICE_TO_PLAN[priceId] : undefined;

  let plan: 'free' | 'subscription' | 'premium' = 'free';
  let status: 'active' | 'canceled' | 'past_due' | 'incomplete' = 'active';

  switch (subscription.status) {
    case 'active':
    case 'trialing':
      plan = mappedPlan ?? 'free';
      status = subscription.cancel_at_period_end ? 'canceled' : 'active';
      break;
    case 'past_due':
      // Pago fallido pero Stripe sigue reintentando: se mantiene el plan
      // (periodo de gracia) y se avisa vía status.
      plan = mappedPlan ?? 'free';
      status = 'past_due';
      break;
    case 'incomplete':
      plan = 'free';
      status = 'incomplete';
      break;
    default:
      // 'canceled', 'incomplete_expired', 'unpaid', 'paused': el periodo
      // pagado ya terminó de verdad, o nunca llegó a empezar.
      plan = 'free';
      status = 'canceled';
      break;
  }

  const { error } = await admin
    .from('profiles')
    .update({
      plan,
      status,
      stripe_subscription_id: subscription.id,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('stripe_customer_id', customerId);

  if (error) {
    console.error('No se pudo actualizar profiles para', customerId, error);
    throw error;
  }
}
