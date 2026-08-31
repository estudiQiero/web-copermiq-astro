# Guía de estilo de traducción — copermiq-web

Reglas para que cualquier texto traducido en la web (marketing, cuenta,
formularios) suene igual de consistente que la app, y consistente consigo
mismo cuando añadamos más idiomas. El español es el idioma nativo de todo
el copy — se traduce desde ahí, nunca entre dos idiomas no-español.

Antes de traducir un término que también existe en la app (nombres de
plan, "Facturas", "Iniciar sesión", etc.), comprueba primero
`shared-glossary.json` en esta misma carpeta — si ya está ahí, usa esa
traducción tal cual, no una nueva. Eso es lo que evita que la web y la
app suenen distintas cuando alguien pasa de una a otra.

## Català

Basado en las 343 líneas del diccionario de la app (`lang-ca.js`),
sincronizado el 2026-08-29 — ver `shared-glossary.json` para los términos
en sí.

- **Registro**: tracte de "tu" en todo momento, nunca "vós" ni formas
  impersonales.
- **Botones de acción**: siempre en imperatiu — "Desa", "Elimina",
  "Crea", "Envia", "Puja", "Tria", "Escriu", "Afegeix", "Introdueix",
  "Descarrega", "Comença", "Passa a Pro".
- **Preguntas de confirmación**: patrón "Vols [verb]...?" — nunca "Estàs
  segur...?" ni "Confirmes...?". Ej.: "¿Eliminar esta factura?" → "Vols
  eliminar aquesta factura?".
- **"Guardar" → siempre "Desa"** (nunca "Guarda" a secas ni "Salva").
  Cuidado con la concordancia: "Desa els canvis", "Desa la despesa",
  "Desa'ls" (con pronombre feble si hace falta).
- **"Eliminar" vs "Borrar" — son dos acciones distintas, no
  intercambiables**: "Eliminar cuenta" (borra la identidad de acceso de
  verdad) → "Elimina el compte"; "Borrar todos los datos" (vacía los
  datos pero mantiene el acceso) → "Esborra totes les dades". Si un texto
  habla de borrar cuenta o datos, usa el verbo que corresponda al alcance
  real de la acción.
- **"Hacienda" → "Hisenda"**, sin artículo en la mayoría de casos ("a
  Hisenda", no "a la Hisenda").
- **Marcas y nombres propios que NO se traducen**: "Copermiq",
  "VERI*FACTU" / "Verifactu", y los nombres de plan "LT", "Basic", "Pro"
  y "Premium" (se quedan igual — "Basic" sustituye a "Gratis" desde el
  2026-08-31, ver Pricing.astro). Sí se traduce "Regalo" → "Regal"
  (lista completa en `doNotTranslate` dentro de `shared-glossary.json`).
- **Ortografía cuidada**: ela geminada con punt volat donde toca
  ("Cancel·la", "sol·licitud"), elisiones correctas ("l'IBAN",
  "l'idioma", "l'aplicació", "d'aquesta", "d'autenticació"), acentuación
  propia del català y no calcos del castellano ("Període",
  "Freqüència", "Còpia de seguretat").
- **Puntuación**: ratlla llarga "—" para incisos (no guion normal),
  el·lipsi como carácter único "…" (no tres puntos seguidos).
- **Números y fechas**: `Intl`/`toLocaleDateString` con locale `ca-ES`
  cuando el idioma activo es català (`es-ES` si no), para que importes y
  fechas salgan con coma decimal y formato català/español, no
  anglosajón.

## Idiomas futuros

Cuando se añada un idioma nuevo, crea una sección aquí con el mismo
formato (registro, patrones de confirmación/acción, qué no se traduce,
ortografía, puntuación, formato de números/fechas) y añade sus
traducciones dentro de los términos ya existentes en
`shared-glossary.json` — no dupliques el archivo por idioma.
