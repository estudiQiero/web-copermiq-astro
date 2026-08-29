// ================= i18n: utilidades compartidas =================
// Infraestructura mínima para traducir copermiq-web a más de un idioma,
// empezando por català — 2026-08-29, a petición de Miq, para que el
// vocabulario compartido con la app (nombres de plan, "Facturas",
// "Crear cuenta"...) no diverja entre los dos sitios cuando alguien pasa
// de uno a otro. Ver también STYLE-GUIDE.md (registro, patrones de
// frase) y shared-glossary.json (los términos en sí).
//
// De momento esto NO está conectado a ninguna página — es solo la base
// (rutas ya declaradas en astro.config.mjs + estos helpers) para la fase
// siguiente, en la que cada componente cambiará su texto fijo en español
// por una llamada a glossaryTerm() (para vocabulario compartido con la
// app) o a su propio diccionario de claves semánticas (para copy propio
// de la web, sin equivalente en la app).
// ==================================================================

import glossary from './shared-glossary.json';

export const DEFAULT_LOCALE = 'es';
export const LOCALES = ['es', 'ca'];

// Traduce un término del vocabulario compartido con la app (ver
// shared-glossary.json). Si el idioma pedido es el de por defecto, o el
// término no está en el glosario, o no tiene traducción para ese idioma
// todavía, se devuelve el propio término en español tal cual — así un
// término sin traducir nunca rompe la página, simplemente se queda en
// español hasta que se añada.
export function glossaryTerm(term, locale) {
  if (!locale || locale === DEFAULT_LOCALE) return term;
  return glossary.terms?.[term]?.[locale] ?? term;
}

// Marcas y nombres propios que nunca se traducen (Copermiq, Verifactu,
// los nombres de plan salvo "Gratis"/"Regalo") — ver STYLE-GUIDE.md.
export function isBrandTerm(term) {
  return glossary.doNotTranslate?.includes(term) ?? false;
}
