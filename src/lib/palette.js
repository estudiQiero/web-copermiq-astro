// Copermiq — paleta real de color de la app (pantalla Preferencias →
// Interfaz), confirmada por Miq el 2026-08-28 al describir el esquema de
// `app_config`. Son los mismos 5 nombres y los mismos hex que ya usa la
// demo ilustrativa de "A tu manera" (Customization.astro) — duplicados
// aquí A PROPÓSITO, sin importarlos desde ese componente: la demo incluye
// 3 colores más (grisOscuro/grisMedio/marrón) que Miq NO mencionó como
// valores válidos de `uiColor` al describir el esquema real, así que
// podrían ser presets añadidos después en la app y no queremos acoplar
// una sección de marketing puramente ilustrativa con esta función real de
// cuenta de usuario. Si algún día se confirma que esos 3 también son
// valores válidos de `uiColor`, añadirlos aquí.
export const PALETTE = {
  verde: { label: 'Verde', dark: { bg: '#134430', fg: '#EAF3EC' }, light: { bg: '#DCEBE2', fg: '#14432C' } },
  azul: { label: 'Azul oscuro', dark: { bg: '#142A42', fg: '#E9F0F7' }, light: { bg: '#DCE7F3', fg: '#142A42' } },
  naranja: { label: 'Naranja', dark: { bg: '#5C2E0E', fg: '#FBEEE0' }, light: { bg: '#FBE6D2', fg: '#6B3510' } },
  violeta: { label: 'Violeta', dark: { bg: '#2E1F4D', fg: '#EDE7F7' }, light: { bg: '#E7DFF5', fg: '#34235A' } },
  rosa: { label: 'Rosa', dark: { bg: '#4A1F35', fg: '#F8E7EE' }, light: { bg: '#F7DCE7', fg: '#5A2440' } },
};

// Luminosidad relativa aproximada (0 negro, 1 blanco) — misma fórmula que
// Customization.astro — para elegir un texto de contraste razonable sobre
// un color personalizado (que no trae, a diferencia de los presets, un fg
// ya pensado a mano).
function isLightColor(hex) {
  const clean = (hex || '').replace('#', '');
  if (clean.length < 6) return false;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

// A partir de las preferencias guardadas en app_config (uiColor, uiMode,
// customColorHex, customColors), calcula el color de acento {bg, fg} que
// comparten la cabecera y el menú principal de la web — 2026-08-28, a
// petición de Miq: "el color debe ser el mismo tanto de fondo como de
// menús". uiMode elige la variante oscura o clara del preset (igual que el
// interruptor "Tono" de la app); con un color personalizado ('custom' o
// 'custom:N') se usa el hex guardado tal cual y se calcula un fg de
// contraste, porque la web no tiene guardado un fg propio para esos casos.
export function resolveAccent(prefs) {
  const uiColor = prefs?.uiColor ?? 'verde';
  const tone = prefs?.uiMode === 'light' ? 'light' : 'dark';

  if (uiColor === 'custom') {
    const bg = prefs?.customColorHex;
    if (bg) return { bg, fg: isLightColor(bg) ? '#1E2A22' : '#F3F5F2' };
  } else if (typeof uiColor === 'string' && uiColor.startsWith('custom:')) {
    const index = Number(uiColor.split(':')[1]);
    const bg = prefs?.customColors?.[index]?.hex;
    if (bg) return { bg, fg: isLightColor(bg) ? '#1E2A22' : '#F3F5F2' };
  }

  const preset = PALETTE[uiColor] ?? PALETTE.verde;
  return preset[tone];
}

// Aplica (o quita) el acento de usuario a toda la web: variables CSS en
// <html> + clase `has-user-accent` en <body>, que es lo que activa las
// reglas de global.css sobre `.site-header`/`.site-menu` y su contenido.
// Se llama desde AuthModal.astro (en cuanto se resuelve la sesión, en
// TODAS las páginas — Layout.astro la incluye siempre) y desde el propio
// panel de Preferencias en /cuenta, para previsualizar al instante.
// Pasar `null` (sin sesión, o al cerrarla) vuelve al turquesa de marca de
// siempre.
export function applyAccent(prefs) {
  if (typeof document === 'undefined') return;
  if (!prefs) {
    document.body?.classList.remove('has-user-accent');
    return;
  }
  const { bg, fg } = resolveAccent(prefs);
  document.documentElement.style.setProperty('--user-accent-bg', bg);
  document.documentElement.style.setProperty('--user-accent-fg', fg);
  document.body?.classList.add('has-user-accent');
}
