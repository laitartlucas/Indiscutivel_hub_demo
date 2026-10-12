import { attrs, html } from '../lib/html.js';
import { formatMoney } from '../../shared/money.js';
import { shortDate } from '../lib/format.js';
import { stageLabelFor } from '../lib/pipeline-config.js';
import { badge } from './components.js';
import { actionMenu } from './menu.js';

/** Ordem fixa das colunas — a mesma do `STAGES` do servidor (server/src/repositories/deals.ts). */
export const STAGES = ['arrived', 'talking', 'proposal', 'won', 'lost'];

/**
 * Selo de temperatura: nunca usa o tom "accent" (verde de marca — Restrições globais do plano: verde
 * só em estado interativo/foco, nunca decorativo). "hot"/"warm"/"cold" usam os tons de estado que já
 * existem (bad/warn/neutral); a palavra ao lado do selo (Quente/Morno/Frio) carrega o significado, a
 * cor é só reforço visual, nunca a única pista.
 */
const TEMPERATURE_LABELS = { hot: 'Quente', warm: 'Morno', cold: 'Frio' };
const TEMPERATURE_TONES = { hot: 'bad', warm: 'warn', cold: 'neutral' };

/** Rótulo da etapa: o configurado pela aluna (lib/pipeline-config.js) ou o padrão. */
export function stageLabel(stage) {
  return stageLabelFor(stage);
}

export function temperatureLabel(temperature) {
  return TEMPERATURE_LABELS[temperature] ?? temperature;
}

export function temperatureTone(temperature) {
  return TEMPERATURE_TONES[temperature] ?? 'neutral';
}

function toCents(value) {
  const [int, frac = '0'] = String(value).split('.');
  return Number(int) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
}

function fromCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${int}.${frac}`;
}

/** Soma de `value` (texto decimal canônico, como products/price) em texto decimal canônico. Lista vazia -> "0.00". */
export function sumValues(deals) {
  return fromCents(deals.reduce((total, deal) => total + toCents(deal.value), 0));
}

/**
 * Rótulo acessível da região da coluna: nome do estágio + contagem + soma (Restrições globais do
 * plano — "role='region' + aria-label com o nome do estágio e a contagem/total"). `count` vem sempre
 * do total do servidor (`page.total`); `sum` é a soma dos itens realmente carregados (ver `truncated`
 * em `kanbanColumn`, abaixo) — para uma coluna com mais itens do que o limite buscado, a soma mostrada
 * é parcial, e o texto avisa isso.
 */
export function columnAriaLabel({ label, count, sum, truncated }) {
  const noun = count === 1 ? 'oportunidade' : 'oportunidades';
  const totalLabel = truncated ? `soma parcial ${formatMoney(sum)}` : `total ${formatMoney(sum)}`;
  return `${label} — ${count} ${noun}, ${totalLabel}`;
}

/**
 * Cartão de uma Oportunidade, limpo como no kit: nome, valor, temperatura e um rodapé discreto com a data
 * da última mudança. A ação principal é ARRASTAR o cartão para outra coluna (mouse); tudo o mais — editar,
 * mover e excluir — fica no menu "Mais ações" (ui/menu.js). Os itens "Mover para <etapa>" são a alternativa
 * de teclado e de toque ao arrastar (HANDOFF, seção 7): um Enter/clique move direto, sem passo de
 * confirmação, porque abrir o menu e escolher uma etapa já é uma ação deliberada (diferente de um <select>
 * cujo `change` dispara a cada seta do teclado, WCAG 3.2.2). O nome da Pessoa vem na própria listagem
 * (`deal.personName`, JOIN no servidor — server/src/repositories/deals.ts), nunca de um pedido por cartão.
 */
export function dealCard({ deal }) {
  const name = deal.personName;
  const otherStages = STAGES.filter((stage) => stage !== deal.stage);
  const updated = deal.updatedAt ? new Date(deal.updatedAt) : null;
  const menu = actionMenu({
    label: `Mais ações de ${name}`,
    id: deal.id,
    items: [
      { label: 'Editar', action: 'edit', id: deal.id },
      {
        group: 'Mover para',
        items: otherStages.map((stage) => ({ label: stageLabel(stage), action: 'move-to', id: deal.id, ariaLabel: `Mover para ${stageLabel(stage)}`, extra: { 'data-stage': stage } })),
      },
      { separator: true },
      { label: 'Excluir', action: 'delete', id: deal.id, tone: 'danger' },
    ],
  });
  return html`<li class="kanban-card" data-id="${deal.id}" draggable="true">
    <div class="kanban-card-head">
      <p class="kanban-card-name"><a class="kanban-card-link" href="#/oportunidades/${deal.id}" draggable="false">${name}</a></p>
      ${menu}
    </div>
    <p class="kanban-card-value">${formatMoney(deal.value)}</p>
    <div class="kanban-card-foot">
      ${badge(temperatureLabel(deal.temperature), temperatureTone(deal.temperature))}
      ${updated && !Number.isNaN(updated.getTime()) ? html`<span class="kanban-card-date">${shortDate.format(updated)}</span>` : ''}
    </div>
  </li>`;
}

/** Uma coluna do quadro: região nomeada (ver `columnAriaLabel`), cartões como itens de lista. */
function kanbanColumn({ stage, result }) {
  const label = stageLabel(stage);
  const count = result.page.total;
  const truncated = result.page.total > result.data.length;
  const sum = sumValues(result.data);
  const ariaLabel = columnAriaLabel({ label, count, sum, truncated });
  return html`<section${attrs({ role: 'region', 'aria-label': ariaLabel, class: `kanban-column kanban-column-${stage}`, 'data-stage': stage })}>
    <div class="kanban-column-header">
      <h2 class="kanban-column-title">${label}</h2>
      <p class="kanban-column-meta muted">${count} · ${formatMoney(sum)}${truncated ? ' (parcial)' : ''}</p>
    </div>
    ${result.data.length === 0
      ? html`<p class="kanban-column-empty muted">Nenhuma oportunidade neste estágio.</p>`
      : html`<ul class="kanban-column-list">${result.data.map((deal) => dealCard({ deal }))}</ul>`}
  </section>`;
}

/**
 * O quadro inteiro: as 5 colunas lado a lado, roláveis horizontalmente como um grupo. `.kanban-board`
 * (bloco comum) é só quem rola e corta o excesso; `.kanban-board-track` (flex) é quem organiza as
 * colunas em linha — ver o comentário grande em css/layout.css sobre por que são duas camadas, não uma.
 */
export function kanbanBoard({ columns }) {
  return html`<div class="kanban-board"><div class="kanban-board-track">${columns.map(({ stage, result }) => kanbanColumn({ stage, result }))}</div></div>`;
}
