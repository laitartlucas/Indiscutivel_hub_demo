import { attrs, html } from '../lib/html.js';

/**
 * Grade de cartões (visualização alternativa à tabela). Lista semântica, uma coluna no celular e até três
 * no desktop (css/components.css, .card-grid). `render(row)` devolve o conteúdo do cartão; as ações dele
 * usam `data-action` + `data-id`, tratados pela mesma delegação da tabela (ui/list-view.js).
 */
export function cardGrid({ label, rows, render, rowKey = (row) => row.id }) {
  return html`<ul${attrs({ class: 'card-grid', 'aria-label': label })}>${rows.map((row) => html`<li${attrs({ class: 'data-card', 'data-row': String(rowKey(row)) })}>${render(row)}</li>`)}</ul>`;
}

/**
 * Alternância "Cartões | Tabela". Dois botões com `aria-pressed` (não é um conjunto de abas: não há painéis
 * separados, só a mesma lista em duas formas). \`options\`: [{ value, label }].
 */
export function viewToggle({ value, options, label = 'Visualização' }) {
  return html`<div${attrs({ class: 'view-toggle', role: 'group', 'aria-label': label })}>${options.map(
    (o) => html`<button${attrs({ type: 'button', class: 'view-toggle-btn', 'data-view': o.value, 'aria-pressed': String(o.value === value) })}>${o.label}</button>`,
  )}</div>`;
}

/** Liga a alternância: atualiza os `aria-pressed` e chama `onChange(valor)` (só quando muda). */
export function bindViewToggle(container, onChange) {
  const toggle = container.querySelector('.view-toggle');
  toggle.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button || button.getAttribute('aria-pressed') === 'true') return;
    for (const other of toggle.querySelectorAll('[data-view]')) other.setAttribute('aria-pressed', String(other === button));
    onChange(button.dataset.view);
  });
}
