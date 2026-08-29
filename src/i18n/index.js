// ================= i18n: utilidades compartidas =================
// Infraestructura para traducir copermiq-web a más de un idioma,
// empezando por català — 2026-08-29, a petición de Miq, para que el
// vocabulario compartido con la app (nombres de plan, "Facturas",
// "Crear cuenta"...) no diverja entre los dos sitios cuando alguien pasa
// de uno a otro. Ver también STYLE-GUIDE.md (registro, patrones de
// frase) y shared-glossary.json (los términos en sí).
//
// Fase 2 (mismo día): cabecera, menú de cuenta y panel de cuenta/
// preferencias/compras ya usan esto de verdad — cada texto traducible
// lleva un atributo `data-i18n="Texto exacto en español"` en el propio
// .astro, y applyLanguage() (más abajo) recorre esos elementos y les pone
// la traducción cuando toca. Se llama desde AuthModal.astro (que vive en
// cada página) igual que ya se hace con applyAccent()/applyContentMode():
// al iniciar sesión con el idioma guardado en app_config, al cambiarlo
// desde Preferencias, y de vuelta a español al cerrar sesión. El copy de
// marketing (Funciones, Precios...) todavía no usa este mecanismo — esa
// es la fase siguiente.
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


// Aplica el idioma a todos los elementos ya traducidos de la página
// (marcados con `data-i18n="Texto exacto en español"` en el propio
// .astro — ver Header.astro, AuthModal.astro y cuenta.astro para
// ejemplos). No toca nada que no lleve ese atributo, así que es seguro
// llamarla en cada página aunque la mayoría del copy (marketing) todavía
// no esté traducido — simplemente no hay ningún `data-i18n` que tocar
// ahí y no pasa nada.
export function applyLanguage(locale) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const term = el.getAttribute('data-i18n');
    if (term) el.textContent = glossaryTerm(term, locale);
  });
}
