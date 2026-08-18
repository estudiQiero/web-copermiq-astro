import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://copermiq.com',
  compressHTML: true,
  integrations: [
    sitemap({
      // /cuenta es el panel de login/administración, no contenido de
      // marketing — no tiene sentido que Google lo indexe ni lo sugiera.
      filter: (page) => !page.includes('/cuenta'),
    }),
  ],
});
