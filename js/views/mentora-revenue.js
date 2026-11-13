import { debounce } from '../lib/debounce.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { PHASE_FILTER_OPTIONS, isPhase, phaseLabel, phaseNumber } from '../lib/journey.js';
import { pageOffset } from '../lib/list-state.js';
import { buildQuery, hashParam, pageInfo } from '../lib/query.js';
import {
  MILESTONES,
  MILESTONE_FILTERS,
  PAD_GOLD_LABEL,
  brl,
  currentMonth,
  dateBR,
  isMilestoneFilter,
  isMonth,
  milestoneShort,
  milestoneStatusMeta,
  monthFilterOptions,
  monthShort,
  monthTitle,
  nextText,
  padGoldStatus,
  revenueErrorMessage,
  revenueListHash,
  statusOf,
  summaryItems,
} from '../lib/revenue.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, searchField, selectField, skeleton, statCard } from '../ui/components.js';
import { dataTable, pager } from '../ui/table.js';

// Faturamento das alunas (mentora, #/faturamento-alunas, permissão revenue.view): o faturamento AUTODECLARADO de cada
// aluna (nunca as vendas do Comercial), o acumulado desde a entrada, os marcos e o PAD GOLD. Filtros no endereço.

const LIMIT = 20;
const SEARCH_DELAY_MS = 300;

/** Conquistas da linha: os 4 marcos como selos pequenos, com ícone e texto da situação (nunca só cor). */
function milestoneBadges(row) {
  const byValue = new Map((row.milestones ?? []).map((m) => [Number(m.milestone), m]));
  return html`<ul class="rv-mini" aria-label="Marcos">${MILESTONES.map((base) => {
    const m = byValue.get(base.milestone);
    const status = statusOf(m?.status);
    const meta = milestoneStatusMeta(status);
    const title = status === 'active' && m?.reachedAt ? `${base.label}: alcançado em ${dateBR(m.reachedAt)}` : `${base.label}: ${meta.label.toLowerCase()}`;
    return html`<li${attrs({ class: `rv-mini-ms is-${status === 'in_review' ? 'review' : status}`, title })}>${icon(meta.icon, { size: 12, stroke: 2.2 })}<span>${milestoneShort(base.milestone)}</span><span class="sr-only"> (${meta.label.toLowerCase()})</span></li>`;
  })}</ul>`;
}

function padGoldCell(padGold) {
  const status = padGoldStatus(padGold);
  if (status === 'active') return html`<span class="rv-gold-tag is-active">${icon('gem', { size: 14 })}<span>${PAD_GOLD_LABEL}</span></span>${padGold.reachedAt ? html`<span class="rv-cell-sub">desde ${dateBR(padGold.reachedAt)}</span>` : ''}`;
  if (status === 'in_review') return html`<span class="rv-gold-tag is-review">${icon('alert', { size: 14 })}<span>Em revisão</span></span>`;
  return html`<span class="muted">—</span>`;
}

const COLUMNS = [
  { key: 'studentName', label: 'Aluna', render: (r) => html`<a class="rv-student-link" href="#/alunas/${encodeURIComponent(r.studentId)}">${r.studentName}</a>` },
  { key: 'phase', label: 'Fase', nowrap: true, optional: true, render: (r) => (isPhase(r.phase) ? `${phaseNumber(r.phase)} · ${r.phaseLabel || phaseLabel(r.phase)}` : '—') },
  { key: 'monthAmount', label: 'No mês', align: 'end', nowrap: true, render: (r) => (r.monthAmount === null || r.monthAmount === undefined ? html`<span class="muted">Não lançou</span>` : brl(r.monthAmount)) },
  { key: 'total', label: 'Acumulado', align: 'end', nowrap: true, render: (r) => html`<strong>${brl(r.total)}</strong>` },
  { key: 'milestones', label: 'Conquistas', render: milestoneBadges },
  { key: 'next', label: 'Próxima', optional: true, render: (r) => (r.next ? nextText(r.next) : html`<span class="muted">Todas alcançadas</span>`) },
  { key: 'padGold', label: 'PAD GOLD', render: (r) => padGoldCell(r.padGold) },
  { key: 'lastEntryAt', label: 'Último lançamento', nowrap: true, optional: true, render: (r) => (r.lastEntryAt ? dateBR(r.lastEntryAt) : html`<span class="muted">Nunca</span>`) },
];

export function renderMentoraRevenue({ root, session, api, navigate }) {
  const now = currentMonth();
  let disposed = false;
  let seq = 0;
  let rows = [];
  let state = {
    month: isMonth(hashParam('mes')) && hashParam('mes') <= now ? hashParam('mes') : now,
    q: hashParam('q'),
    phase: /^[1-4]$/.test(hashParam('fase')) ? hashParam('fase') : '',
    milestone: isMilestoneFilter(hashParam('conquista')) ? hashParam('conquista') : '',
    offset: 0,
  };
  const monthOptions = monthFilterOptions(now);
  if (!monthOptions.some((o) => o.value === state.month)) monthOptions.push({ value: state.month, label: monthTitle(state.month) });

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'mentora-revenue',
    heading: 'Faturamento das alunas',
    eyebrow: 'Mentoria',
    subtitle: 'O faturamento que cada aluna declara mês a mês, o acumulado desde a entrada e os marcos alcançados.',
    content: html`<p class="rv-intro rv-intro-page"><span class="rv-self">${icon('edit', { size: 14 })}<span>Autodeclarado</span></span><span>Valores informados pelas alunas, separados das vendas do Comercial.</span></p>
      <div id="mrv-summary" aria-live="off">${skeleton(2)}</div>
      <div class="toolbar lead-toolbar">
        <div class="toolbar-search">${searchField({ id: 'mrv-search', label: 'Buscar aluna', placeholder: 'Buscar uma aluna…' })}</div>
        <div class="toolbar-actions jr-filters">
          ${selectField({ id: 'mrv-month', label: 'Mês', value: state.month, options: monthOptions })}
          ${selectField({ id: 'mrv-phase', label: 'Fase', value: state.phase, options: PHASE_FILTER_OPTIONS })}
          ${selectField({ id: 'mrv-milestone', label: 'Conquista', value: state.milestone, options: MILESTONE_FILTERS })}
          ${button({ label: 'Limpar filtros', variant: 'ghost', id: 'mrv-clear', extra: { hidden: true } })}
        </div>
      </div>
      <div id="mrv-list" aria-live="off" aria-busy="true">${skeleton(5)}</div>`,
  });

  const summaryEl = root.querySelector('#mrv-summary');
  const list = root.querySelector('#mrv-list');
  const search = root.querySelector('#mrv-search');
  const monthSelect = root.querySelector('#mrv-month');
  const phaseSelect = root.querySelector('#mrv-phase');
  const milestoneSelect = root.querySelector('#mrv-milestone');
  const clearButton = root.querySelector('#mrv-clear');
  if (state.q) search.value = state.q;

  const hasFilters = () => Boolean(state.q || state.phase || state.milestone || state.month !== now);

  function syncAddress() {
    window.history.replaceState(null, '', revenueListHash({ ...state, month: state.month === now ? '' : state.month }));
    clearButton.hidden = !hasFilters();
  }

  function paintSummary(summary, month) {
    mount(summaryEl, html`<div class="stat-cards rv-kpis">${summaryItems(summary, month).map((s) => statCard({ label: s.label, value: s.value, iconName: s.icon }))}</div>`);
  }

  function paintList(total) {
    if (rows.length === 0) {
      mount(list, hasFilters()
        ? emptyState({ iconName: 'search', title: 'Nenhuma aluna com esses filtros', message: 'Troque o mês, a fase ou a conquista, ou limpe os filtros.', action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear' } }) })
        : emptyState({ iconName: 'metas', title: 'Nenhum faturamento ainda', message: 'Quando as alunas informarem o faturamento do mês em "Meu faturamento", ele aparece aqui.' }));
      return;
    }
    mount(list, html`${dataTable({ caption: `Faturamento das alunas em ${monthTitle(state.month)}`, columns: COLUMNS.map((c) => (c.key === 'monthAmount' ? { ...c, label: `Em ${monthShort(state.month)}` } : c)), rows, dense: true, rowKey: (r) => r.studentId })}
      ${pager({ info: pageInfo({ limit: LIMIT, offset: state.offset, total }), total })}`);
  }

  async function load() {
    const mine = ++seq;
    list.setAttribute('aria-busy', 'true');
    try {
      const result = await api.get(`/api/v1/mentora/revenue${buildQuery({ month: state.month, q: state.q, phase: state.phase, milestone: state.milestone, limit: LIMIT, offset: state.offset })}`);
      if (disposed || mine !== seq) return;
      rows = Array.isArray(result?.rows) ? result.rows : [];
      const total = Number.isInteger(result?.total) ? result.total : rows.length;
      if (rows.length === 0 && state.offset > 0 && total > 0) {
        state = { ...state, offset: Math.floor((total - 1) / LIMIT) * LIMIT };
        return void load();
      }
      paintSummary(result?.summary, isMonth(result?.month) ? result.month : state.month);
      paintList(total);
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(summaryEl, html``);
      mount(list, html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar o faturamento das alunas', message: revenueErrorMessage(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`);
    }
    list.setAttribute('aria-busy', 'false');
  }

  function setFilters(patch) {
    state = { ...state, ...patch, offset: 0 };
    syncAddress();
    load();
  }

  function clearFilters() {
    scheduleSearch.cancel();
    search.value = '';
    monthSelect.value = now;
    phaseSelect.value = '';
    milestoneSelect.value = '';
    setFilters({ q: '', month: now, phase: '', milestone: '' });
    search.focus();
  }

  const scheduleSearch = debounce((value) => setFilters({ q: value.trim() }), SEARCH_DELAY_MS);
  search.addEventListener('input', (event) => scheduleSearch(event.target.value));
  monthSelect.addEventListener('change', (event) => setFilters({ month: event.target.value }));
  phaseSelect.addEventListener('change', (event) => setFilters({ phase: event.target.value }));
  milestoneSelect.addEventListener('change', (event) => setFilters({ milestone: event.target.value }));
  clearButton.addEventListener('click', clearFilters);
  list.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      state = { ...state, offset: pageOffset(pageButton.dataset.page, state.offset, LIMIT) };
      load();
      root.querySelector('h1')?.scrollIntoView?.({ block: 'start' });
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'retry') load();
    else if (action === 'clear') clearFilters();
  });

  clearButton.hidden = !hasFilters();
  load();

  return () => {
    disposed = true;
    scheduleSearch.cancel();
    dispose();
  };
}
