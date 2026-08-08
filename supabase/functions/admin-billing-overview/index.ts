// Copermiq — panel de administración: datos de suscripciones/pagos.
//
// Punto de partida del panel de admin (solo lectura, de momento). Verifica
// que quien llama tiene profiles.role = 'admin' (usando la service role,
// que se salta la RLS — por eso esta comprobación es imprescindible aquí:
// nadie puede leer esto directamente desde el cliente) y, si es así,
// devuelve las suscripciones de Stripe con el email del cliente y el plan
// correspondiente en `profiles`.
//
// Pendiente para una siguiente iteración (fuera del alcance de este primer
// punto de partida): devoluciones/reembolsos, histórico de pagos sueltos,
// paginación más allá de las primeras 100 suscripciones, y el panel de
// control por usuario individual mencionado para más adelante.
//
// Despliegue: `supabase functions deploy admin-billing-overview`
// Variables de entorno que necesita:
//   STRIPE_SECRET_KEY — clave secreta de Stripe (sk_...)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.

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

    // Comprobación de admin: se hace aquí, con service role, porque la RLS
    // de profiles solo deja a cada usuario leer su propia fila — esta
    // función es la única forma de saber si alguien más es admin.
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (callerProfile?.role !== 'admin') {
      return json({ error: 'No tienes permiso para ver esto' }, 403);
    }

    // Todas las filas de profiles con algo que mostrar (plan de pago
    // actual o histórico), para cruzarlas con las suscripciones de Stripe.
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end')
      .neq('plan', 'free');

    const profilesByCustomerId = new Map(
      (profiles ?? []).filter((p) => p.stripe_customer_id).map((p) => [p.stripe_customer_id, p])
    );

    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      status: 'all',
      expand: ['data.customer', 'data.items.data.price'],
    });

    const rows = subscriptions.data.map((sub) => {
      const customer = typeof sub.customer === 'object' ? sub.customer : null;
      const profile = profilesByCustomerId.get(typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? '');
      const item = sub.items.data[0];
      const price = item?.price;

      return {
        subscriptionId: sub.id,
        customerEmail: customer && !customer.deleted ? customer.email : null,
        plan: (sub.metadata?.plan as string | undefined) ?? profile?.plan ?? null,
        stripeStatus: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        amount: price?.unit_amount != null ? price.unit_amount / 100 : null,
        currency: price?.currency ?? null,
        interval: price?.recurring?.interval ?? null,
        currentPeriodEnd: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        supabaseStatus: profile?.status ?? null,
      };
    });

    return json({ subscriptions: rows });
  } catch (err) {
    console.error('admin-billing-overview error', err);
    return json({ error: 'Error obteniendo los datos de administración' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
