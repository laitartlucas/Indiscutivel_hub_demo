// INDISCUTÍVEL HUB — ícones (traço 1.5, 24px, cantos arredondados).
// Uso (dentro de html``): ${icon('pipeline')}  |  ${icon('check', { size: 14, stroke: 2.4 })}
// Devolvem SafeHtml (raw), prontos para interpolar em html`` e mount(). Cores vêm de currentColor:
// quem usa define a cor por CSS (nada de hex aqui, nada de style inline — o CSP não deixa).
import { escapeHtml, raw } from './lib/html.js';

export const ICONS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  crm: 'M3 7h18v12H3zM8 7V5h8v2M3 12h18',
  pipeline: 'M4 4h4v16H4zM10 4h4v11h-4zM16 4h4v7h-4z',
  contatos: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-4 4.5-6 8-6s6.5 2 8 6',
  leads: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  empresas: 'M4 21V5l8-2v18M12 8l8 2v11M3 21h18M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2',
  tarefas: 'M4 4h16v16H4zM8 12l3 3 5-6',
  metas: 'M5 21V4M5 4h11l-2 4 2 4H5',
  desafios: 'M3 20l6-11 4 7 2.5-4L21 20z',
  conquistas: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14L7 21l5-3 5 3-1.5-7',
  progresso: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  chat: 'M4 5h16v11H9l-5 4z',
  suporte: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6',
  relatorios: 'M4 20h16M7 16v-5M12 16V6M17 16v-8',
  alunas: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5M16 3.5a4 4 0 0 1 0 7.5M18 14.8c2 .8 3.4 2.6 4 5.2',
  acompanhamento: 'M3 12h4l3-7 4 14 3-7h4',
  equipe: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM7 20c.7-3.5 2.7-5.5 5-5.5s4.3 2 5 5.5M5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM19 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  config: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  plano: 'M3 6h18v12H3zM3 10h18M7 15h4',
  permissoes: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4V14M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  alert: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5M12 16h.01',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  menu: 'M4 7h16M4 12h16M4 17h10',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  filter: 'M4 5h16l-6 8v6l-4 2v-8z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  send: 'M4 12l16-8-6 16-3-7z',
  attach: 'M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 1 1 8 0v4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  flame: 'M12 3c1 3.5 6 5.5 6 10a6 6 0 0 1-12 0c0-2.8 1.6-4.4 2.6-6 .6 1.6 1.4 2.6 2.4 3 .4-2.4 0-4.6 1-7z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  gem: 'M6 3h12l3 6-9 12L3 9zM3 9h18M9 3l3 6 3-6',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  ia: 'M4 5h16v11h-8l-5 4v-4H4zM12 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  wifiOff: 'M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18'
};

export function icon(name, { size = 18, stroke = 1.5, label } = {}) {
  const d = ICONS[name];
  if (!d) throw new Error(`Ícone desconhecido: ${name}`);
  const a11y = label ? `role="img" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true"';
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ${a11y}><path d="${d}"/></svg>`);
}

// Monograma da marca (moldura + "I" serifado + ponto dourado de crescimento). Dourado = a cor do
// texto do contêiner: aplique `.logo-mark` (color: var(--gold-500)) ou defina `color` no pai.
export function logoMark(size = 36) {
  return raw(`<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x=".75" y=".75" width="34.5" height="34.5" rx="10" stroke="currentColor" stroke-opacity=".6"/><path d="M18 10v16M14 10h8M14 26h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="26.5" cy="9.5" r="1.8" fill="currentColor"/></svg>`);
}

// Arcos concêntricos decorativos dos cards premium (verde). Dourado via currentColor, como logoMark.
export function arcs(width = 360, height = 260) {
  const cx = width * 0.61, cy = height * 0.46;
  return raw(`<svg class="ih-arcs" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><g fill="none" stroke="currentColor"><circle cx="${cx}" cy="${cy}" r="70" stroke-opacity=".26"/><circle cx="${cx}" cy="${cy}" r="120" stroke-opacity=".12"/><circle cx="${cx}" cy="${cy}" r="175" stroke-opacity=".06"/></g></svg>`);
}

// Fundo decorativo do painel verde das telas de acesso (pontos + arcos + curvas). Dourado = currentColor;
// preenche o contêiner e ancora no canto inferior direito, onde ficam os arcos.
export function authArt() {
  return raw(`<svg class="auth-art" viewBox="0 0 720 900" preserveAspectRatio="xMaxYMax slice" aria-hidden="true"><defs><pattern id="auth-dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="currentColor" fill-opacity=".10"/></pattern></defs><rect width="720" height="900" fill="url(#auth-dots)"/><g fill="none" stroke="currentColor"><circle cx="600" cy="690" r="110" stroke-opacity=".38"/><circle cx="600" cy="690" r="190" stroke-opacity=".22"/><circle cx="600" cy="690" r="280" stroke-opacity=".12"/><circle cx="600" cy="690" r="380" stroke-opacity=".07"/><path d="M120 900C280 720 420 600 720 470" stroke-opacity=".6"/><path d="M40 900C240 760 400 680 720 610" stroke-opacity=".18"/></g><circle cx="434" cy="592" r="4" fill="currentColor"/><circle cx="434" cy="592" r="14" fill="none" stroke="currentColor" stroke-opacity=".35"/><line x1="434" y1="606" x2="434" y2="900" stroke="currentColor" stroke-opacity=".14" stroke-dasharray="2 6"/></svg>`);
}
