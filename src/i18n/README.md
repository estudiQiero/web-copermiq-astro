# src/i18n/

Infraestructura de idiomas de copermiq-web — 2026-08-29, a petición de
Miq, para poder traducir la web (empezando por català) manteniendo el
mismo vocabulario y el mismo tono que ya usa la app en `app.copermiq.com`,
y para que añadir un tercer idioma más adelante sea barato.

## Qué hay aquí

- **`shared-glossary.json`** — el vocabulario que la web comparte
  literalmente con la app (nombres de plan, "Facturas", "Crear cuenta",
  acciones de cuenta...). Es un subconjunto curado del diccionario
  completo de la app (`Diccionarios/lang-ca.js`, `I18N_CA`), no una copia
  entera — el vocabulario fiscal interno de la app (modelos, IVA,
  IRPF...) no aparece en la web y se ha dejado fuera a propósito.
- **`STYLE-GUIDE.md`** — cómo debe sonar cada idioma (registro, patrones
  de frase, qué no se traduce, ortografía, puntuación), para el copy
  propio de la web que no tiene equivalente en el glosario.
- **`index.js`** — helpers (`glossaryTerm()`, `isBrandTerm()`) para
  consultar el glosario desde un componente `.astro`.

Todavía no hay ningún componente usando esto — es la base para ir
traduciendo cabecera/menú/cuenta primero (donde coincide con el
vocabulario de la app) y las páginas de marketing después.

## Cómo se usará desde un componente (fase siguiente)

Para un término del glosario:

```js
import { glossaryTerm } from '../i18n';
const locale = Astro.currentLocale ?? 'es';
```
```astro
<a href="/entrar">{glossaryTerm('Entrar', locale)}</a>
```

Para copy propio de la web sin equivalente en el glosario: un diccionario
de claves semánticas por página o sección (p. ej.
`src/i18n/pages/home.ca.json` con claves como `"hero.titulo"`), siguiendo
la guía de estilo. Todavía no existen esos archivos — se irán creando
página a página según se vaya traduciendo cada una.

## Cómo volver a sincronizar el glosario cuando la app cambie

La app y la web son repos separados, así que esto se sincroniza a mano
(no hay automatismo, y es lo bastante infrecuente como para que no haga
falta uno): cuando la app añada o cambie un término que también use la
web, se actualiza `shared-glossary.json` con la traducción nueva —
añadiendo el idioma correspondiente dentro del término ya existente, o
un término nuevo si no estaba. Última sincronización: 2026-08-29, desde
el addenda `addenda-app-a-web-glosario-catalan-2026-08-29` que pasó Miq
(diccionario completo de la app en ese momento, 343 líneas).
