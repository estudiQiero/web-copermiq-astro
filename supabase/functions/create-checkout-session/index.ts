// Copermiq — crea una Stripe Checkout Session para pasar a "subscription"
// o "premium". La llaman tanto la web (copermiq-web) como la app
// (app.copermiq.com): cualquiera de las dos manda el JWT del usuario ya
// logueado, y esta función se encarga del resto.
//
// Despliegue: `supabase functions deploy create-checkout-session`
// Variables de entorno que necesita esta función (ver README de
// supabase/functions/ para cómo configurarlas):
//   STRIPE_SECRET_KEY           — clave secreta de Stripe (sk_...)
//   STRIPE_PRICE_SUBSCRIPTION   — price ID del plan "Suscripción" en Stripe
//   STRIPE_PRICE_PREMIUM        — price ID del plan "Premium" en Stripe
//   PUBLIC_SITE_URL             — https://copermiq.com (para las URLs de
//                                 vuelta tras el pago o al cancelar)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo, no
// hace falta configurarlos a mano.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
});

const PRICE_IDS: Record<string, string | undefined> = {
  subscription: Deno.env.get('STRIPE_PRICE_SUBSCRIPTION'),
  premium: Deno.env.get('STRIPE_PRICE_PREMIUM'),
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { plan } = await req.json();
    if (plan !== 'subscription' && plan !== 'premium') {
      return json({ error: 'plan debe ser "subscription" o "premium"' }, 400);
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return json({ error: `Falta configurar STRIPE_PRICE_${plan.toUpperCase()} en las variables de entorno de la función` }, 500);
    }

    // Identifica al usuario a partir del JWT que manda el cliente (web o
    // app) en la cabecera Authorization — esta función corre con permisos
    // de service role, pero igualmente necesitamos saber QUIÉN llama.
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: 'No autenticado' }, 401);
    }
    const user = userData.user;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Reutiliza el stripe_customer_id si el usuario ya tiene uno (p.ej. de
    // un plan anterior cancelado), o crea un Customer nuevo en Stripe.
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://copermiq.com';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/cuenta?checkout=success`,
      cancel_url: `${siteUrl}/precios?checkout=cancel`,
      // supabase_user_id también aquí, por si el Customer se creó fuera de
      // este flujo alguna vez y no lo tuviera en sus metadatos.
      subscription_data: { metadata: { supabase_user_id: user.id, plan } },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err);
    return json({ error: 'Error creando la sesión de pago' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
