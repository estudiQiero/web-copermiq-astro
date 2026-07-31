# Web Copermiq Astro

Web de Copermiq feta amb Astro.

Landing page de presentación de **Copermiq**, la app de facturación y contabilidad personal para autónomos y pymes. Construida con [Astro](https://astro.build).

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:4321`.

## Compilar para producción

```bash
npm run build
```

Genera el sitio estático en `dist/`. Puedes desplegarlo tal cual en Netlify, Vercel, GitHub Pages o cualquier hosting estático (arrastrando la carpeta `dist/` o conectando el repositorio).

## Estructura

- `src/layouts/Layout.astro` — `<head>`, metadatos SEO/Open Graph, fuentes (Zilla Slab, Inter, IBM Plex Mono).
- `src/components/` — cabecera, hero, funciones, personalización (colores + idioma, interactiva), cómo funciona, vista previa del panel, seguridad, CTA final y pie.
- `src/styles/global.css` — tokens de color y tipografía, coherentes con la paleta de la propia app (`--accent-deep: #134430`, `--navy: #142A42`, y la paleta real de colores de barra lateral de Preferencias → Interfaz).
- `public/images/` y `public/icons/` — logo de Copérnico e iconos PWA, tomados del proyecto de la app.

## Contenido

Todo el copy (funciones, pasos, seguridad, colores e idiomas) está basado en el código y el changelog real de la app (v0.7.2), incluida la paleta de colores exacta de `COLOR_PALETTE` y las traducciones reales del diccionario en català. El botón principal enlaza a `https://copermiq.netlify.app`. Las secciones "Inicio, de un vistazo" y "Tus colores. Tu idioma." son recreaciones ilustrativas con datos de ejemplo, no capturas reales — sustitúyelas por capturas reales cuando quieras.

## Próximos pasos sugeridos

- Sustituir las vistas ilustradas por capturas reales de la app.
- Añadir página de Precios o Novedades (changelog) si se necesitan más adelante.
- Conectar analítica (Plausible/Fathom) si se quiere medir tráfico.

## Licencia

GPL-3.0 — ver [LICENSE](./LICENSE).
