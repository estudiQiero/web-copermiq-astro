// ⚠️ PENDIENTE DE SINCRONIZAR CON LO REAL — NO DESPLEGAR ESTE ARCHIVO.
//
// Esta función ya está desplegada en Supabase (vista en Edge Functions,
// actualizada hace 12 horas), casi seguro gestionada desde el lado de la
// app — igual que create-checkout-session, que sí hemos podido comparar y
// resultó usar `user_id` y valores de plan en español ('suscripcion'/
// 'premium', no 'subscription'/'premium') en la tabla `profiles`. Esta es
// la función MÁS delicada de las tres: es la única que escribe el plan
// real de cada usuario, así que desplegar aquí una versión con el
// esquema equivocado podría dejar de actualizar planes correctamente, o
// pisar la lógica real ya en producción.
//
// El contenido que había aquí antes (borrado a propósito) usaba `id` y
// 'free'/'subscription'/'premium' en vez del esquema real. Hasta tener
// el código real desplegado:
//   1. No ejecutar `supabase functions deploy stripe-webhook` desde este
//      repo bajo ningún concepto.
//   2. No hace falta que la web toque esta función directamente — Stripe
//      la llama sola vía webhook; la web solo necesita que
//      `profiles.plan`/`status` estén al día, y eso ya lo mantiene la
//      versión real desplegada.
//
// Para completar esto: pedir en Supabase → Edge Functions →
// stripe-webhook → ver código, y pegarlo aquí como referencia (igual que
// se hizo con create-checkout-session).
