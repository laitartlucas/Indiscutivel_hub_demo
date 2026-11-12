import { attrs, html } from '../lib/html.js';
import { formatMoney } from '../../shared/money.js';
import { shortDate } from '../lib/format.js';
import { sumValues, temperatureLabel, temperatureTone } from '../lib/commercial.js';
import { badge } from './components.js';
import { actionMenu } from './menu.js';

// Quadro kanban de um funil: uma coluna por etapa (as em andamento, depois Ganha e Perdida). As colunas vêm do
// funil (lib/pipeline-config.js), nunca de uma lista fixa: cada funil tem as próprias etapas.

export { sumValues, temperatureLabel, temperatureTone };

/**
 * Rótulo acessível da região da coluna: nome da etapa + contagem + soma. `count` vem do total do servidor;
 * `sum` é a soma dos itens realmente carregados — numa coluna com mais itens do que o limite buscado, a soma
 * é parcial, e o texto avisa isso.
 */
export function columnAriaLabel({ label, count, sum, truncated }) {
  const noun = count === 1 ? 'oportunidade' : 'oportunidades';
  const totalLabel = truncated ? `soma parcial ${formatMoney(sum)}` : `total ${formatMoney(sum)}`;
  return `${label} — ${count} ${noun}, ${totalLabel}`;
}

/**
 * Cartão de uma oportunidade: nome do contato, produto, valor, temperatura e a data da última mudança. A ação
 * principal é ARRASTAR o cartão (mouse); editar, mover e excluir ficam no menu "Mais ações". Os itens
 * "Mover para <etapa>" são a alternativa de teclado e de toque ao arrastar: escolher no menu já é deliberado,
 * então move direto (Perdida ainda pede o motivo).
 */
export function dealCard({ deal, stages }) {
  const name = deal.personName ?? 'Contato';
  const otherStages = (stages ?? []).filter((stage) => stage.id !== deal.stageId);
  const updated = deal.updatedAt ? new Date(deal.updatedAt) : null;
  const menu = actionMenu({
    label: `Mais ações de ${name}`,
    id: deal.id,
    items: [
      { label: 'Abrir oportunidade', action: 'open', id: deal.id },
      { label: 'Editar', action: 'edit', id: deal.id },
      ...(otherStages.length
        ? [{ group: 'Mover para', items: otherStages.map((stage) => ({ label: stage.name, action: 'move-to', id: deal.id, ariaLabel: `Mover para ${stage.name}`, extra: { 'data-stage-id': stage.id } })) }]
        : []),
      { separator: true },
      { label: 'Excluir', action: 'delete', id: deal.id, tone: 'danger' },
    ],
  });
  return html`<li class="kanban-card" data-id="${deal.id}" draggable="true">
    <div class="kanban-card-head">
      <p class="kanban-card-name"><a class="kanban-card-link" href="#/comercial/oportunidades/${deal.id}" draggable="false">${name}</a></p>
      ${menu}
    </div>
    ${deal.productName ? html`<p class="kanban-card-sub">${deal.productName}</p>` : ''}
    <p class="kanban-card-value">${formatMoney(deal.value)}</p>
    <div class="kanban-card-foot">
      ${deal.temperature ? badge(temperatureLabel(deal.temperature), temperatureTone(deal.temperature)) : html`<span></span>`}
      ${updated && !Number.isNaN(updated.getTime()) ? html`<span class="kanban-card-date">${shortDate.format(updated)}</span>` : ''}
    </div>
  </li>`;
}

const EMPTY_TEXT = { open: 'Nenhuma oportunidade nesta etapa.', won: 'Nenhuma ganha ainda.', lost: 'Nenhuma perdida.' };

/** Uma coluna do quadro: região nomeada (ver `columnAriaLabel`), cartões como itens de lista. */
function kanbanColumn({ stage, result, stages }) {
  const count = result.page.total;
  const truncated = result.page.total > result.data.length;
  const sum = sumValues(result.data);
  const ariaLabel = columnAriaLabel({ label: stage.name, count, sum, truncated });
  return html`<section${attrs({ role: 'region', 'aria-label': ariaLabel, class: `kanban-column kanban-column-${stage.kind}`, 'data-stage-id': stage.id })}>
    <div class="kanban-column-header">
      <h2 class="kanban-column-title">${stage.name}${stage.kind === 'open' ? html`<span class="kanban-column-prob" aria-hidden="true">${stage.probability}%</span>` : ''}</h2>
      <p class="kanban-column-meta muted">${count} · ${formatMoney(sum)}${truncated ? ' (parcial)' : ''}</p>
    </div>
    ${result.data.length === 0
      ? html`<p class="kanban-column-empty muted">${EMPTY_TEXT[stage.kind] ?? EMPTY_TEXT.open}</p>`
      : html`<ul class="kanban-column-list">${result.data.map((deal) => dealCard({ deal, stages }))}</ul>`}
  </section>`;
}

/**
 * O quadro inteiro: `columns` = [{ stage, result: { data, page } }], na ordem das etapas do funil. `.kanban-board`
 * é só quem rola e corta o excesso; `.kanban-board-track` organiza as colunas em linha (ver css/layout.css).
 */
export function kanbanBoard({ columns }) {
  const stages = columns.map((c) => c.stage);
  return html`<div class="kanban-board"><div class="kanban-board-track">${columns.map(({ stage, result }) => kanbanColumn({ stage, result, stages }))}</div></div>`;
}
