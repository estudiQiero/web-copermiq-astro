import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://copermiq.com',
  compressHTML: true,
  integrations: [
    sitemap({
      // /cuenta es el panel de login/administración, no contenido de
      // marketing — no tiene sentido que Google lo indexe ni lo sugiera.
      // /privacidad (y cualquier página legal futura con noindex, ver
      // Layout.astro) tampoco debe aparecer en el sitemap: enviarla a
      // Google marcada "noindex" produce un error de Search Console
      // ("URL enviada marcada como noindex") y, sobre todo, Miq no quiere
      // que estas páginas se indexen (2026-08-20).
      filter: (page) => !page.includes('/cuenta') && !page.includes('/privacidad'),
    }),
  ],
});
