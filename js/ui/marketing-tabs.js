import { icon } from '../ih-icons.js';
import { attrs, html } from '../lib/html.js';

// Barra de seções do Marketing: mesmos links com aria-current (e o mesmo visual) da Central Comercial.
export const MARKETING_SECTIONS = [
  { id: 'overview', label: 'Visão geral', href: '#/marketing', icon: 'dashboard' },
  { id: 'campaigns', label: 'Campanhas', href: '#/marketing/campanhas', icon: 'megafone' },
  { id: 'spend', label: 'Investimentos', href: '#/marketing/investimentos', icon: 'crm' },
  { id: 'instagram', label: 'Instagram', href: '#/marketing/instagram', icon: 'camera' },
];

export function marketingTabs(current) {
  return html`<nav class="cc-tabs" aria-label="Seções do Marketing"><ul class="cc-tabs-list">${MARKETING_SECTIONS.map(
    (s) => html`<li><a${attrs({ class: 'cc-tab', href: s.href, 'aria-current': s.id === current ? 'page' : false })}>${icon(s.icon, { size: 16 })}<span>${s.label}</span></a></li>`,
  )}</ul></nav>`;
}

export const MARKETING_EYEBROW = 'Marketing';
