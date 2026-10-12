import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import {
  chartMoney,
  currentMonthKey,
  formatGoalValue,
  historyBars,
  historyHasData,
  isMonthKey,
  leftText,
  monthAbbrev,
  monthSubtitle,
  monthTitle,
  paceText,
  quarterRow,
  shiftMonthKey,
  statusMeta,
} from '../lib/goals.js';
import { buildQuery, hashParam } from '../lib/query.js';
import { tzOffsetMinutes } from '../lib/tasks.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { actionMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { confirmDeleteGoal, openGoalDialog } from './goal-dialogs.js';

const QUOTE = '“Meta boa é a que muda a sua agenda desta semana.”';

function retryBlock(error, action) {
  return html`<div class="stack">${alert({ tone: 'danger', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': action } })}</div></div>`;
}

function goalCard(goal, month, dark) {
  const meta = statusMeta(goal.status);
  const pace = paceText(goal, month);
  const pct = Math.min(100, goal.pct);
  const valueText = formatGoalValue(goal.metric, goal.progress);
  const targetText = formatGoalValue(goal.metric, goal.target);
  return html`<article${attrs({ class: `goal-card${dark ? ' goal-card--dark' : ''}`, 'data-goal-id': goal.id })}>
    <div class="goal-top">
      <div class="goal-top-main"><h3 class="goal-label">${goal.label}</h3><span class="goal-status is-${meta.tone}">${meta.label}</span></div>
      <span class="goal-pct" aria-label="${goal.pct}% da meta">${goal.pct}%</span>
      <span class="goal-menu">${actionMenu({
        label: `Mais ações de ${goal.label}`,
        id: goal.id,
        items: [
          { label: 'Editar alvo', action: 'edit', id: goal.id },
          { label: 'Excluir', action: 'delete', id: goal.id, tone: 'danger' },
        ],
      })}</span>
    </div>
    <p class="goal-value"><span class="goal-value-num">${valueText}</span><span class="goal-value-of">/ ${targetText}</span></p>
    <div class="goal-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${goal.label}: ${goal.pct}% da meta (${valueText} de ${targetText})"><div${attrs({ class: 'goal-fill', 'data-w': String(pct) })}></div></div>
    <p class="goal-foot"><span>${leftText(goal)}</span><span>${pace}</span></p>
  </article>`;
}

function historyBlock(history) {
  if (!historyHasData(history.data)) {
    return emptyState({ title: 'Sem faturamento nem metas nestes meses.', message: 'Quando você ganhar oportunidades ou definir metas de faturamento, a comparação aparece aqui.' });
  }
  const bars = historyBars(history.data);
  return html`<div class="hist-plot" aria-hidden="true">${bars.map(
    (b) => html`<div class="hist-col"><div class="hist-area">
      <div${attrs({ class: `hist-bar${b.current ? ' is-current' : b.reached ? ' is-reached' : ''}`, 'data-h': String(b.height) })}><span class="hist-value">${chartMoney(b.progress)}</span></div>
      ${b.mark !== null ? html`<div${attrs({ class: 'hist-mark', 'data-b': String(b.mark) })}></div>` : ''}
    </div></div>`,
  )}</div>
  <ol class="hist-months" aria-hidden="true">${bars.map((b) => html`<li${attrs({ class: b.current ? 'is-current' : false })}>${b.label}</li>`)}</ol>
  <table class="sr-only"><caption>Faturamento: meta e realizado por mês</caption>
    <thead><tr><th scope="col">Mês</th><th scope="col">Meta</th><th scope="col">Realizado</th></tr></thead>
    <tbody>${bars.map((b) => html`<tr><th scope="row">${monthTitle(b.month)}</th><td>${b.target === null ? 'Sem meta' : formatGoalValue('revenue', b.target.toFixed(2))}</td><td>${formatGoalValue('revenue', b.progress.toFixed(2))}</td></tr>`)}</tbody></table>`;
}

function quarterBlock(q) {
  const months = q.quarter.months;
  const range = `${monthAbbrev(months[0])}–${monthAbbrev(months[months.length - 1])}`;
  const rows =
    q.data.length === 0
      ? emptyState({ title: 'Nenhuma meta neste trimestre.', message: 'As metas dos meses de ' + range + ' somam aqui.' })
      : html`<ul class="quarter-list">${q.data.map((item) => {
          const row = quarterRow(item, q.quarter);
          return html`<li><div class="quarter-row"><span class="quarter-title">${row.title}</span><span class="quarter-value">${row.value}</span></div>
            <div class="quarter-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${row.pct}" aria-label="${row.title}: ${item.pct}%"><div${attrs({ class: 'quarter-fill', 'data-w': String(row.pct) })}></div></div></li>`;
        })}</ul>`;
  return { range, rows };
}

export function renderGoals({ root, session, api, navigate }) {
  let disposed = false;
  let month = isMonthKey(hashParam('month')) ? hashParam('month') : currentMonthKey();
  let current = null; // última resposta de GET /goals (mês exibido)
  let cardsGen = 0;
  let histGen = 0;
  let quarterGen = 0;

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'goals',
    heading: 'Minhas metas',
    eyebrow: 'Crescimento',
    subtitle: monthTitle(month),
    actions: html`<div class="month-switch" role="group" aria-label="Mês das metas">
        <button type="button" class="month-switch-btn" id="goals-prev" aria-label="Mês anterior">${icon('chevronLeft', { size: 16 })}</button>
        <span class="month-switch-label" id="goals-month" role="status">${monthTitle(month)}</span>
        <button type="button" class="month-switch-btn" id="goals-next" aria-label="Próximo mês">${icon('chevronRight', { size: 16 })}</button>
      </div>
      ${button({ label: 'Nova meta', id: 'goals-new', iconStart: icon('plus', { size: 16, stroke: 2 }) })}`,
    content: html`<div class="growth">
      <section aria-label="Metas do mês" id="goals-cards" aria-busy="true">${skeleton(4)}</section>
      <div class="growth-split">
        <section class="growth-card" aria-labelledby="hist-title">
          <div class="growth-card-head"><h2 id="hist-title">Faturamento · meta x realizado</h2>
            <p class="hist-legend" aria-hidden="true"><span class="hist-legend-item"><span class="hist-legend-box"></span>Realizado</span><span class="hist-legend-item"><span class="hist-legend-line"></span>Meta</span></p></div>
          <div id="goals-history" aria-busy="true">${skeleton(4)}</div>
        </section>
        <section class="growth-card" aria-labelledby="quarter-title">
          <div class="growth-card-head"><h2 id="quarter-title">Metas do trimestre</h2><span class="growth-card-note" id="quarter-range"></span></div>
          <div id="goals-quarter" aria-busy="true">${skeleton(3)}</div>
          <p class="quote">${QUOTE}</p>
        </section>
      </div>
    </div>`,
  });

  const cardsEl = root.querySelector('#goals-cards');
  const histEl = root.querySelector('#goals-history');
  const quarterEl = root.querySelector('#goals-quarter');
  const rangeEl = root.querySelector('#quarter-range');
  const monthEl = root.querySelector('#goals-month');
  const subtitleEl = root.querySelector('.page-subtitle');
  const tz = () => tzOffsetMinutes();

  function paintMonthHeader() {
    monthEl.textContent = monthTitle(month);
    if (subtitleEl) subtitleEl.textContent = current ? monthSubtitle(current) : monthTitle(month);
    // O endereço guarda o mês escolhido (recarregar ou voltar não perde o lugar). replaceState não dispara nova renderização.
    try {
      window.history.replaceState(null, '', `#/metas${month === currentMonthKey() ? '' : `?month=${month}`}`);
    } catch {
      // sem History API: só não guarda o mês
    }
  }

  async function loadCards({ focusFirst = false } = {}) {
    const id = ++cardsGen;
    cardsEl.setAttribute('aria-busy', 'true');
    mount(cardsEl, skeleton(4));
    try {
      const data = await api.get(`/api/v1/goals${buildQuery({ month, tzOffset: tz() })}`);
      if (disposed || id !== cardsGen) return;
      current = data;
      paintMonthHeader();
      if (data.data.length === 0) {
        mount(cardsEl, emptyState({
          iconName: 'metas',
          title: `Nenhuma meta para ${monthTitle(month)}`,
          message: 'Defina quanto quer faturar, ganhar ou cadastrar neste mês. O progresso é calculado sozinho, com os seus dados reais.',
          action: button({ label: 'Nova meta', extra: { 'data-action': 'create' } }),
        }));
      } else {
        mount(cardsEl, html`<h2 class="sr-only">Metas de ${monthTitle(month)}</h2><div class="goal-grid">${data.data.map((g, i) => goalCard(g, data, i === 0))}</div>`);
        applySizes(cardsEl);
        if (focusFirst) cardsEl.querySelector('.menu-trigger')?.focus();
      }
    } catch (error) {
      if (disposed || id !== cardsGen) return;
      current = null;
      paintMonthHeader();
      mount(cardsEl, retryBlock(error, 'retry-cards'));
    }
    cardsEl.setAttribute('aria-busy', 'false');
  }

  async function loadHistory() {
    const id = ++histGen;
    histEl.setAttribute('aria-busy', 'true');
    mount(histEl, skeleton(4));
    try {
      const data = await api.get(`/api/v1/goals/history${buildQuery({ metric: 'revenue', months: 6, month, tzOffset: tz() })}`);
      if (disposed || id !== histGen) return;
      mount(histEl, historyBlock(data));
      applySizes(histEl);
    } catch (error) {
      if (disposed || id !== histGen) return;
      mount(histEl, retryBlock(error, 'retry-history'));
    }
    histEl.setAttribute('aria-busy', 'false');
  }

  async function loadQuarter() {
    const id = ++quarterGen;
    quarterEl.setAttribute('aria-busy', 'true');
    mount(quarterEl, skeleton(3));
    try {
      const data = await api.get(`/api/v1/goals/quarter${buildQuery({ tzOffset: tz() })}`);
      if (disposed || id !== quarterGen) return;
      const { range, rows } = quarterBlock(data);
      rangeEl.textContent = `${data.quarter.label} · ${range}`;
      mount(quarterEl, rows);
      applySizes(quarterEl);
    } catch (error) {
      if (disposed || id !== quarterGen) return;
      rangeEl.textContent = '';
      mount(quarterEl, retryBlock(error, 'retry-quarter'));
    }
    quarterEl.setAttribute('aria-busy', 'false');
  }

  const reloadAll = () => Promise.all([loadCards(), loadHistory(), loadQuarter()]);

  function goTo(next) {
    if (next === month || !isMonthKey(next)) return;
    month = next;
    current = null;
    paintMonthHeader();
    loadCards();
    loadHistory();
  }

  async function create() {
    const existing = (current?.data ?? []).map((g) => ({ month: g.month, metric: g.metric }));
    const { saved, hadFailure } = await openGoalDialog({ api, month, existing });
    if (disposed) return;
    if (saved) toast('Meta criada.', { tone: 'success' });
    if (saved || hadFailure) await reloadAll();
  }

  async function edit(goal) {
    const { saved, hadFailure } = await openGoalDialog({ api, goal });
    if (disposed) return;
    if (saved) toast('Meta atualizada.', { tone: 'success' });
    if (saved || hadFailure) await reloadAll();
  }

  async function remove(goal) {
    if (!(await confirmDeleteGoal(goal))) return;
    try {
      await api.delete(`/api/v1/goals/${goal.id}`);
      if (disposed) return;
      toast('Meta excluída.', { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await reloadAll();
  }

  root.querySelector('#goals-prev').addEventListener('click', () => goTo(shiftMonthKey(month, -1)));
  root.querySelector('#goals-next').addEventListener('click', () => goTo(shiftMonthKey(month, 1)));
  root.querySelector('#goals-new').addEventListener('click', create);

  const main = root.querySelector('#main');
  main.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'retry-cards') return void loadCards();
    if (action === 'retry-history') return void loadHistory();
    if (action === 'retry-quarter') return void loadQuarter();
    if (action === 'create') return void create();
    const goal = current?.data.find((g) => g.id === target.dataset.id);
    if (!goal) return;
    if (action === 'edit') edit(goal);
    else if (action === 'delete') remove(goal);
  });

  reloadAll();

  return () => {
    disposed = true;
    dispose();
  };
}
