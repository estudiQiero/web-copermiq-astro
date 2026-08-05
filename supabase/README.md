# Facturación de Copermiq (Supabase + Stripe)

Esto implementa los planes de pago (Gratis / Suscripción / Premium) de forma que funcionan igual desde la web (copermiq.com) que desde la app (app.copermiq.com), porque ambas leen y disparan la misma lógica en Supabase. El razonamiento completo está en el documento "Copermiq — Arquitectura de planes de pago" (guardado en el proyecto de Claude "Apps Miq").

Nada de esto se despliega solo — necesita varios pasos manuales tuyos porque requieren tus credenciales de Stripe y de Supabase, que esta sesión no tiene ni debe tener.

## 1. Aplicar la migración (crea la tabla `profiles`)

Con la [Supabase CLI](https://supabase.com/docs/guides/cli) instalada y logueada:

```
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

Alternativa sin CLI: abre el SQL Editor en el panel de Supabase de tu proyecto y pega el contenido de `supabase/migrations/20260805074648_billing_profiles.sql` tal cual.

## 2. Crear los productos y precios en Stripe

En el [dashboard de Stripe](https://dashboard.stripe.com/products), crea dos productos recurrentes: "Suscripción" y "Premium" (nombres definitivos y precios, pendientes de decidir). Copia el **price ID** de cada uno (empieza por `price_...`).

## 3. Configurar los secrets de las Edge Functions

```
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_PRICE_SUBSCRIPTION=price_...
supabase secrets set STRIPE_PRICE_PREMIUM=price_...
supabase secrets set PUBLIC_SITE_URL=https://copermiq.com
```

(`STRIPE_WEBHOOK_SECRET` se añade en el paso 5, después de crear el webhook en Stripe — hasta entonces no lo tienes.)

## 4. Desplegar las tres funciones

```
supabase functions deploy create-checkout-session
supabase functions deploy create-portal-session
supabase functions deploy stripe-webhook --no-verify-jwt
```

`stripe-webhook` necesita `--no-verify-jwt` porque quien la llama es Stripe, no un usuario logueado — su autenticidad se comprueba con la firma de Stripe (paso siguiente), no con un JWT de Supabase.

## 5. Conectar el webhook en Stripe

En Stripe → Developers → Webhooks → "Add endpoint": la URL es
`https://TU_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`.

Eventos a escuchar: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

Stripe te da un "Signing secret" (`whsec_...`) al crear el endpoint — pégalo:

```
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

## Probar en local antes de ir a producción

Usa el modo test de Stripe (claves `sk_test_...`/precios de test) y el [Stripe CLI](https://stripe.com/docs/stripe-cli) para reenviar eventos a tu función local (`stripe listen --forward-to ...`), antes de repetir los pasos con las claves reales (`sk_live_...`).
