import { attrs, html } from '../lib/html.js';

/** Classes da célula: alinhamento à direita e/ou sem quebra de linha (c.nowrap); `optional` esconde a coluna em telas médias (769 a 1180 px). */
function cellClass(c, primary = false, body = true) {
  const classes = [c.align === 'end' ? 'cell-end' : '', c.nowrap ? 'cell-nowrap' : '', primary ? 'cell-primary' : '', body && c.label === 'Ações' ? 'cell-actions' : '', c.optional ? 'cell-optional' : ''].filter(Boolean);
  return classes.length ? classes.join(' ') : false;
}

/** Tabela de dados acessível: região rolável com legenda; a rolagem horizontal fica DENTRO da região. */
/** `dense`: células com respiro lateral menor (tabelas largas, como a de alunas). */
/**
 * No celular (<= 768 px) o CSS empilha cada linha como um CARTÃO (ver .data-table em components.css). Como `display`
 * de tabela some com a semântica em alguns leitores de tela, os papéis ARIA de tabela são explícitos; o rótulo de cada
 * campo vem de `data-label` (mostrado só no modo cartão).
 */
export function dataTable({ caption, columns, rows, dense = false, rowKey = (row) => row.id, rowClass = () => false }) {
  const head = columns.map((c) => html`<th${attrs({ scope: 'col', role: 'columnheader', class: cellClass(c, false, false) })}>${c.label}</th>`);
  const body = rows.map((row) => html`<tr${attrs({ role: 'row', class: rowClass(row), 'data-row': String(rowKey(row)) })}>${columns.map((c, i) => {
    const content = c.render ? c.render(row) : row[c.key];
    return html`<td${attrs({ role: 'cell', class: cellClass(c, i === 0), 'data-label': c.label })}>${content}</td>`;
  })}</tr>`);
  return html`<div class="table-wrap"${attrs({ role: 'region', 'aria-label': caption, tabindex: '0' })}>
    <table class="data-table${dense ? ' data-table--dense' : ''}" role="table"><caption class="sr-only">${caption}</caption><thead role="rowgroup"><tr role="row">${head}</tr></thead><tbody role="rowgroup">${body}</tbody></table>
  </div>`;
}

/** Paginador: contagem anunciada (aria-live) e botões desabilitados nos extremos. */
export function pager({ info, total }) {
  const count = total === 0 ? 'Nenhum resultado' : `Mostrando ${info.from}–${info.to} de ${total}`;
  return html`<div class="pager">
    <p class="pager-count" role="status" aria-live="polite">${count}</p>
    <nav aria-label="Paginação" class="pager-nav">
      <button${attrs({ type: 'button', class: 'btn btn-ghost', 'data-page': 'prev', disabled: !info.hasPrev })}>Anterior</button>
      <button${attrs({ type: 'button', class: 'btn btn-ghost', 'data-page': 'next', disabled: !info.hasNext })}>Próxima</button>
    </nav>
  </div>`;
}
