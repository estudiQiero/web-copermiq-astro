# Facturación de Copermiq (Supabase + Stripe)

## ⚠️ Antes de nada: este repo ya NO es la fuente de verdad de Supabase

Verificado el 2026-08-08: la tabla `profiles`, y probablemente las funciones `create-checkout-session`, `create-portal-session` y `stripe-webhook`, ya existen y están en uso real en el proyecto de Supabase — gestionadas desde el lado de la app (app.copermiq.com, repo aparte). Tienen un esquema distinto al que se pensó originalmente aquí (columna `user_id` en vez de `id`, valores de plan en español, columnas `email`/`approved`/`plan_since` extra).

**No ejecutes ninguno de los pasos de este documento sin releer antes `copermiq-billing-architecture.md`** (proyecto de Claude "Apps Miq"), que tiene el esquema real verificado y qué está pendiente de coordinar con el lado de la app. Las migraciones y funciones de este repo están marcadas con avisos de "no desplegar" hasta que se resuelva esa coordinación — desplegarlas tal cual podría romper el alta de usuarios o el checkout que ya funciona.

Lo que sigue por debajo es la guía **original**, útil como referencia de qué hace falta en general (Stripe, secrets, webhook), pero los nombres de columnas que menciona (`id`, valores de plan en inglés) no coinciden con la base de datos real.

---

## 1. Aplicar las migraciones (crea la tabla `profiles` y el rol de admin)

**En pausa** — ver el aviso de arriba. Ambos archivos en `supabase/migrations/` están marcados como obsoletos/no aplicar hasta coordinar con el lado de la app.

## 2. Crear los productos y precios en Stripe

En el [dashboard de Stripe](https://dashboard.stripe.com/products), crea dos productos recurrentes: "Suscripción" y "Premium" (nombres definitivos y precios, pendientes de decidir). Copia el **price ID** de cada uno (empieza por `price_...`). Esto es independiente del resto y no tiene riesgo de conflicto.

## 3. Configurar los secrets de las Edge Functions

Los nombres reales que espera la función `create-checkout-session` ya desplegada (ver su código en `supabase/functions/create-checkout-session/index.ts`, guardado aquí como referencia) son distintos de los que se pensaron originalmente:

```
STRIPE_SECRET_KEY
STRIPE_PRICE_SUSCRIPCION   (no STRIPE_PRICE_SUBSCRIPTION)
STRIPE_PRICE_PREMIUM
APP_URL                    (no PUBLIC_SITE_URL — y redirige a la app tras pagar, no a la web)
```

Esto ya debería estar configurado si la función ya está en uso — solo hace falta tocarlo si hay que cambiar precios o URLs.

## 4. Desplegar las funciones

**En pausa** — ver el aviso de arriba. `create-checkout-session`, `create-portal-session` y `stripe-webhook` ya están desplegadas y en uso; no volver a desplegarlas desde aquí sin coordinar. `admin-billing-overview` está pendiente de rediseñar contra el esquema real y de decidir cómo se marca a alguien como administrador — tampoco desplegar todavía.

## 5. Conectar el webhook en Stripe

Ya hecho (la función `stripe-webhook` está desplegada y actualizada recientemente). Si hiciera falta recrearlo: Stripe → Developers → Webhooks → "Add endpoint", URL `https://TU_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`, eventos `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

## Probar en local antes de ir a producción

Usa el modo test de Stripe (claves `sk_test_...`/precios de test) y el [Stripe CLI](https://stripe.com/docs/stripe-cli) para reenviar eventos a tu función local (`stripe listen --forward-to ...`), antes de repetir los pasos con las claves reales (`sk_live_...`).
