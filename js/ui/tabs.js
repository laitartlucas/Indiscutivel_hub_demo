import { attrs, html } from '../lib/html.js';

/**
 * Abas ARIA de uma mesma página (os painéis ficam todos no DOM; só um aparece). `tabs`: [{ id, label, count? }].
 * Cada aba controla o painel `${prefix}-panel-${id}`; quem chama monta os painéis com tabPanel().
 */
export function tabList({ prefix, label, tabs, current }) {
  return html`<div class="tabs cc-page-tabs" role="tablist" aria-label="${label}">${tabs.map(
    (t) => html`<button${attrs({
      type: 'button',
      role: 'tab',
      class: 'tabs-tab',
      id: `${prefix}-tab-${t.id}`,
      'data-tab': t.id,
      'aria-selected': String(t.id === current),
      'aria-controls': `${prefix}-panel-${t.id}`,
      tabindex: t.id === current ? '0' : '-1',
    })}>${t.label}${t.count === undefined || t.count === null ? '' : html`<span class="tabs-count" aria-hidden="true">${t.count}</span>`}</button>`,
  )}</div>`;
}

export function tabPanel({ prefix, id, current, content }) {
  return html`<div${attrs({ role: 'tabpanel', id: `${prefix}-panel-${id}`, 'aria-labelledby': `${prefix}-tab-${id}`, tabindex: '0', hidden: id !== current, class: 'cc-tab-panel' })}>${content}</div>`;
}

/**
 * Liga as abas: clique e setas (Esquerda/Direita, Home/End) trocam a aba, com a seleção acompanhando o foco
 * (padrão "ativação automática"). `onChange(id)` é chamado a cada troca. Devolve `select(id)` para trocar por código.
 */
export function bindTabs(container, onChange) {
  const list = container.querySelector('[role="tablist"]');
  const tabs = () => [...list.querySelectorAll('[role="tab"]')];
  function select(id, { focus = false } = {}) {
    for (const tab of tabs()) {
      const on = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = container.querySelector(`#${CSS.escape(tab.getAttribute('aria-controls'))}`);
      if (panel) panel.hidden = !on;
      if (on && focus) tab.focus();
    }
    onChange?.(id);
  }
  list.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab && tab.getAttribute('aria-selected') !== 'true') select(tab.dataset.tab);
  });
  list.addEventListener('keydown', (event) => {
    const all = tabs();
    const index = all.indexOf(document.activeElement);
    if (index < 0) return;
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: all.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(all[(next + all.length) % all.length].dataset.tab, { focus: true });
  });
  return select;
}
