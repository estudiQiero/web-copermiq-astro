// Copermiq — crea una sesión del Stripe Customer Portal, donde el usuario
// puede cambiar de tarjeta, ver facturas o cancelar su plan por su cuenta
// (no hace falta construir una pantalla de cancelación propia). La llaman
// tanto la web como la app, igual que create-checkout-session.
//
// Despliegue: `supabase functions deploy create-portal-session`
// Variables de entorno que necesita:
//   STRIPE_SECRET_KEY   — clave secreta de Stripe (sk_...)
//   PUBLIC_SITE_URL     — https://copermiq.com (a dónde vuelve el usuario
//                         al salir del Portal)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
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

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userData.user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return json({ error: 'Este usuario todavía no tiene ninguna suscripción de pago' }, 400);
    }

    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://copermiq.com';
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl}/cuenta`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('create-portal-session error', err);
    return json({ error: 'Error creando la sesión del portal' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
