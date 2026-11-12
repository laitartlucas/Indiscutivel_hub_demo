import { icon } from '../ih-icons.js';
import { attrs, html } from '../lib/html.js';

// Barra de seções da Central Comercial, igual em todas as telas dela. São LINKS (cada seção é uma rota), não abas
// ARIA: por isso `<nav>` com aria-current="page" na seção atual, como a alternância Lista | Calendário de Tarefas.
export const COMMERCIAL_SECTIONS = [
  { id: 'overview', label: 'Visão geral', href: '#/comercial', icon: 'dashboard' },
  { id: 'contacts', label: 'Contatos', href: '#/comercial/contatos', icon: 'contatos' },
  { id: 'pipeline', label: 'Pipeline', href: '#/comercial/pipeline', icon: 'pipeline' },
  { id: 'sales', label: 'Vendas', href: '#/comercial/vendas', icon: 'plano' },
  { id: 'receivables', label: 'A receber', href: '#/comercial/receber', icon: 'calendar' },
  { id: 'activities', label: 'Atividades', href: '#/comercial/atividades', icon: 'clock' },
  { id: 'products', label: 'Produtos', href: '#/produtos', icon: 'crm' },
];

export function commercialTabs(current) {
  return html`<nav class="cc-tabs" aria-label="Seções da Central Comercial"><ul class="cc-tabs-list">${COMMERCIAL_SECTIONS.map(
    (s) => html`<li><a${attrs({ class: 'cc-tab', href: s.href, 'aria-current': s.id === current ? 'page' : false })}>${icon(s.icon, { size: 16 })}<span>${s.label}</span></a></li>`,
  )}</ul></nav>`;
}

/** Rótulo pequeno acima do título das telas da Central Comercial. */
export const COMMERCIAL_EYEBROW = 'Central Comercial';
