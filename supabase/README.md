# Facturación de Copermiq (Supabase + Stripe)

## Este repo ya NO es la fuente de verdad de `profiles` ni de las 3 funciones de Stripe

Verificado el 2026-08-08: la tabla `profiles` y las funciones `create-checkout-session`, `create-portal-session` y `stripe-webhook` ya existen y están en uso real en el proyecto de Supabase — gestionadas desde el lado de la app (app.copermiq.com, repo aparte). El código real de las tres se ha guardado como referencia en `supabase/functions/` (marcado "no desplegar desde aquí"). El esquema real está documentado en `copermiq-billing-architecture.md` (proyecto de Claude "Apps Miq") — léelo antes de tocar `profiles` o cualquier función compartida.

Desde el 2026-08-08 también existe `profiles.is_admin` (boolean), añadida por el lado de la app — es la columna compartida que marca quién es administrador, usada tanto por `admin-delete-user` (app) como por `admin-billing-overview` (web, ver más abajo). Los valores de `profiles.plan` son `'gratis'` (por defecto), `'suscripcion'`, `'regalo'` (mismo acceso que suscripción, asignado a mano sin pago) y `'premium'`.

## Lo único que SÍ es propio de este repo: `admin-billing-overview`

Esta función es nueva, no la gestiona la app, y no hay ningún nombre en conflicto — se puede desplegar con normalidad cuando se quiera activar el panel de admin de `/cuenta`:

```
supabase functions deploy admin-billing-overview
```

Secret que necesita (Edge Functions → esta función → Secrets):

```
STRIPE_SECRET_KEY
```

(el mismo valor que ya usan las demás funciones — no hace falta uno nuevo, solo asegurarse de que esta función también lo tiene configurado).

No necesita nada más: comprueba `profiles.is_admin` ella misma y lee `profiles`/Stripe directamente, no depende de ninguna otra función de este repo.

## También propia de este repo: la tabla `admin_user_notes`

Nueva desde el 2026-08-09 — notas libres del admin sobre cada usuario (para identificar cuentas en la tabla de `/cuenta`), en una tabla aparte de `profiles`, sin ninguna relación con lo que gestiona la app. Hay que aplicarla una vez, a mano, en el **SQL Editor** del panel de Supabase (no hay CLI de migraciones automatizado en este proyecto):

```
supabase/migrations/20260809100000_add_admin_user_notes.sql
```

No necesita ninguna Edge Function ni ningún secret — se lee y escribe directamente desde el cliente de la web, protegido por RLS (solo `profiles.is_admin = true` puede leer o escribir).

## El resto de pasos (Stripe, precios, webhook) los gestiona la app

- **Productos/precios en Stripe**: [dashboard de Stripe](https://dashboard.stripe.com/products) — coordinarlo con quien lleve esa parte, si hace falta un price ID nuevo (p. ej. para el toggle anual de `/precios`, todavía no conectado al cobro real).
- **Secrets de `create-checkout-session`** (ya configurados, solo por referencia): `STRIPE_SECRET_KEY`, `STRIPE_PRICE_SUSCRIPCION`, `STRIPE_PRICE_PREMIUM`, `APP_URL` (redirige a la app tras pagar/cancelar, no a la web).
- **Webhook de Stripe**: ya conectado y funcionando (gestionado desde el lado de la app).

## Probar en local antes de desplegar `admin-billing-overview`

Usa el modo test de Stripe (claves `sk_test_...`) y el [Stripe CLI](https://stripe.com/docs/stripe-cli) si hace falta simular datos antes de probar contra producción.
