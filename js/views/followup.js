import { describeError } from '../lib/api.js';
import { initials, mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { pageOffset, recoveryOffset, withFilters } from '../lib/list-state.js';
import {
  cellSentence,
  DUE_INFO,
  formatDay,
  heatLevel,
  HEAT_LABELS,
  idleText,
  rowSentence,
  SORT_OPTIONS,
  STATE_INFO,
  TREND_INFO,
  trendSentence,
  weekRange,
  windowLabel,
} from '../lib/followup.js';
import { NO_CLASS } from '../lib/mentora.js';
import { buildQuery, hashParam, pageInfo } from '../lib/query.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { avatarContent, badge, button, emptyState, selectField } from '../ui/components.js';
import { createListLoader } from '../ui/list-view.js';
import { pager } from '../ui/table.js';
import { can } from '../lib/permissions.js';
import { toast } from '../ui/toast.js';
import { openPlanDialog } from './followup-dialogs.js';

// Acompanhamento (kit M-Acompanhamento): engajamento semanal por aluna, tendência, plano de ação e check-in da semana.
// Só sinais de MENTORIA (dias com atividade). Nenhum R$ nem dado do CRM da aluna.

const LIMIT = 20;
const SEG_MAX = 4; // até 4 turmas: botões segmentados (como no kit); acima disso, um seletor

function studentAvatar(student) {
  return html`<span class="mp-avatar" aria-hidden="true">${student.avatarUrl ? avatarContent(student.name, student.avatarUrl) : initials(student.name)}</span>`;
}

// ---------------------------------------------------------------- cartões de resumo
function turmaName(turma) {
  if (turma === '') return 'Todas as turmas';
  return turma === NO_CLASS ? 'Sem turma' : turma;
}

function summaryCards(result, turma) {
  const s = result.summary;
  const avg = s.avgEngagement === null ? '—' : `${s.avgEngagement}%`;
  return html`<div class="fu-summary">
    <div class="fu-card" role="group" aria-label="Engajamento médio">
      <span class="fu-card-text"><span class="fu-card-label">Engajamento médio</span><span class="fu-card-note">últimas 8 semanas</span></span>
      <span class="fu-card-value">${avg}</span>
    </div>
    <div class="fu-card" role="group" aria-label="Check-ins da semana">
      <span class="fu-card-text"><span class="fu-card-label">Check-ins da semana</span><span class="fu-card-note">${turmaName(turma)} · ${weekRange(result.week.start, result.week.end)}</span></span>
      <span class="fu-card-value" id="fu-checkins-value">${s.checkinsDone}/${s.checkinsTotal}<span class="sr-only"> feitos</span></span>
    </div>
    <div${attrs({ class: `fu-card${s.atRisk > 0 ? ' is-risk' : ''}`, role: 'group', 'aria-label': 'Em risco' })}>
      <span class="fu-card-text"><span class="fu-card-label">Em risco</span><span class="fu-card-note">sem atividade há 7+ dias</span></span>
      <span class="fu-card-value">${s.atRisk}</span>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- tabela
function heatCells(item, weeks) {
  return html`<ul class="fu-cells" aria-label="${`Engajamento semanal de ${item.name}, da semana mais antiga à mais recente`}">${item.weeks.map((cell, i) => {
    const week = weeks[i];
    const text = cellSentence(week, cell);
    return html`<li${attrs({ class: 'fu-cell', title: text })}><span${attrs({ class: `fu-cell-box is-l${heatLevel(cell.activeDays, cell.elapsedDays)}${week.current ? ' is-current' : ''}`, 'aria-hidden': 'true' })}>${cell.pct}</span><span class="fu-cell-week" aria-hidden="true">${week.label}</span><span class="sr-only">${text}</span></li>`;
  })}</ul>`;
}

function trendCell(item) {
  const info = TREND_INFO[item.trend] ?? TREND_INFO.flat;
  return html`<span${attrs({ class: `fu-trend is-${info.tone}` })}><span aria-hidden="true">${icon(info.icon, { size: 14, stroke: 2.2 })}</span><span aria-hidden="true">${info.text}</span><span class="sr-only">${trendSentence(item)}</span></span>`;
}

// Equipe sem `followup.manage` só LÊ o acompanhamento: nada de editar plano nem marcar check-in (o servidor confere de novo).
let canManage = true;

function planCell(item) {
  const plan = item.plan;
  if (!plan) {
    if (!canManage) return html`<div class="fu-plan"><span class="mp-muted">Sem plano definido</span></div>`;
    return html`<div class="fu-plan"><span class="mp-muted">Sem plano definido</span>${button({ label: 'Definir plano', variant: 'ghost', small: true, extra: { 'data-action': 'plan', 'data-id': item.id, 'aria-label': `Definir plano de ação de ${item.name}` } })}</div>`;
  }
  if (!canManage) return html`<div class="fu-plan"><p${attrs({ class: 'fu-plan-text', title: plan.actionText })}>${plan.actionText}</p></div>`;
  return html`<div class="fu-plan"><p${attrs({ class: 'fu-plan-text', title: plan.actionText })}>${plan.actionText}</p>${button({ label: 'Editar plano', variant: 'ghost', small: true, extra: { 'data-action': 'plan', 'data-id': item.id, 'aria-label': `Editar plano de ação de ${item.name}` } })}</div>`;
}

function nextCell(item) {
  const plan = item.plan;
  if (!plan?.nextCheckinOn) return html`<span class="mp-muted">—<span class="sr-only">Sem data combinada</span></span>`;
  const due = DUE_INFO[plan.due];
  return html`<span class="fu-next"><span>${formatDay(plan.nextCheckinOn)}</span>${due ? badge(due.label, due.tone) : ''}</span>`;
}

function checkinCell(item, week) {
  const done = item.checkin.done;
  if (!canManage) return html`<span class="mp-muted">${done ? 'Feito' : 'Não feito'}<span class="sr-only"> (check-in da semana ${week.label} de ${item.name})</span></span>`;
  return html`<button${attrs({
    type: 'button',
    class: 'fu-check',
    'data-action': 'checkin',
    'data-id': item.id,
    'aria-pressed': String(done),
    'aria-label': `Check-in da semana ${week.label} de ${item.name}`,
  })}><span aria-hidden="true">${done ? icon('check', { size: 15, stroke: 2.4 }) : ''}</span><span>${done ? 'Feito' : 'Marcar'}</span></button>`;
}

function stateBadge(item) {
  if (item.state === 'steady') return '';
  const info = STATE_INFO[item.state];
  return html`<span class="fu-state">${badge(info.label, info.tone)}</span>`;
}

function followupTable(result) {
  const weeks = result.weeks;
  const selected = weeks[weeks.length - 1];
  const rows = result.data.map(
    (item) => html`<tr${attrs({ role: 'row', 'data-row': item.id })}>
      <td${attrs({ role: 'cell', class: 'cell-primary', 'data-label': 'Aluna' })}><a class="mp-student" href="#/alunas/${item.id}">${studentAvatar(item)}<span class="mp-student-text"><span class="mp-student-name">${item.name}</span><span class="mp-student-sub">${item.atRisk ? idleText(item) : item.className ?? rowSentence(item)}</span></span></a>${stateBadge(item)}</td>
      <td${attrs({ role: 'cell', class: 'fu-td-weeks', 'data-label': 'Engajamento por semana' })}>${heatCells(item, weeks)}</td>
      <td${attrs({ role: 'cell', class: 'cell-nowrap', 'data-label': 'Tendência' })}>${trendCell(item)}</td>
      <td${attrs({ role: 'cell', 'data-label': 'Plano de ação' })}>${planCell(item)}</td>
      <td${attrs({ role: 'cell', class: 'cell-nowrap', 'data-label': 'Próximo check-in' })}>${nextCell(item)}</td>
      <td${attrs({ role: 'cell', class: 'cell-nowrap', 'data-label': `Check-in ${selected.label}` })}>${checkinCell(item, selected)}</td>
    </tr>`,
  );
  return html`<div class="table-wrap"${attrs({ role: 'region', 'aria-label': 'Acompanhamento semanal das alunas', tabindex: '0' })}>
    <table class="data-table data-table--dense fu-table" role="table">
      <caption class="sr-only">Engajamento semanal, tendência, plano de ação e check-in da semana de cada aluna</caption>
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader">Aluna</th>
        <th scope="col" role="columnheader" class="fu-th-weeks"><span class="sr-only">Engajamento por semana</span><span class="fu-weeks-head" aria-hidden="true">${weeks.map((w) => html`<span${attrs({ class: w.current ? 'is-current' : false, title: weekRange(w.start, w.end) })}>${w.label}</span>`)}</span></th>
        <th scope="col" role="columnheader">Tendência</th>
        <th scope="col" role="columnheader">Plano de ação</th>
        <th scope="col" role="columnheader">Próximo check-in</th>
        <th scope="col" role="columnheader">Check-in ${selected.label}</th>
      </tr></thead>
      <tbody role="rowgroup">${rows}</tbody>
    </table>
  </div>`;
}

function legend() {
  return html`<div class="fu-legend" role="group" aria-label="Legenda do mapa de engajamento">
    <span aria-hidden="true">Sem atividade</span>${HEAT_LABELS.map((label, i) => html`<span class="fu-legend-item"><span${attrs({ class: `fu-swatch is-l${i}`, 'aria-hidden': 'true' })}></span><span class="sr-only">${label}</span></span>`)}<span aria-hidden="true">Muito engajada</span>
    <span class="sr-only">Cada quadradinho é uma semana; o número dentro é o engajamento em porcentagem (dias com atividade sobre 7). Do mais claro ao mais escuro: ${HEAT_LABELS.join(', ')}.</span>
  </div>`;
}

function emptyFollowup(filtered) {
  if (filtered) {
    return emptyState({
      iconName: 'search',
      title: 'Nenhuma aluna nesta turma',
      message: 'Escolha outra turma para ver o acompanhamento.',
      action: button({ label: 'Ver todas as turmas', variant: 'ghost', extra: { 'data-action': 'clear-turma' } }),
    });
  }
  return emptyState({
    iconName: 'alunas',
    title: 'Nenhuma aluna ativa ainda',
    message: 'O acompanhamento aparece quando suas alunas ativarem o acesso.',
    action: html`<a class="btn btn-primary" href="#/alunas">Ver minhas alunas</a>`,
  });
}

// ---------------------------------------------------------------- filtros
function turmaControl(classNames, current) {
  const options = [{ value: '', label: 'Todas' }, ...classNames.map((name) => ({ value: name, label: name })), { value: NO_CLASS, label: 'Sem turma' }];
  if (current && !options.some((o) => o.value === current)) options.splice(1, 0, { value: current, label: current });
  if (classNames.length <= SEG_MAX) {
    return html`<div class="seg" role="group" aria-label="Filtrar por turma">${options.map(
      (o) => html`<button${attrs({ type: 'button', class: `seg-btn${o.value === current ? ' is-on' : ''}`, 'data-turma': o.value, 'aria-pressed': String(o.value === current) })}>${o.label}</button>`,
    )}</div>`;
  }
  return selectField({ id: 'fu-turma-select', label: 'Turma', value: current, options: options.map((o) => ({ value: o.value, label: o.value === '' ? 'Todas as turmas' : o.label })) });
}

function weekControl(result) {
  const w = result.week;
  return html`<div class="fu-week-nav" role="group" aria-label="Semana do acompanhamento">
    <button${attrs({ type: 'button', class: 'btn btn-ghost fu-icon-btn', 'data-week': 'prev', disabled: !w.previous, 'aria-label': 'Semanas anteriores' })}>${icon('chevronLeft', { size: 18, stroke: 2 })}</button>
    <span class="fu-week-label" role="status"><strong>${windowLabel(result.weeks)}</strong>${w.current ? html` <span class="mp-muted">· inclui a semana atual</span>` : ''}</span>
    <button${attrs({ type: 'button', class: 'btn btn-ghost fu-icon-btn', 'data-week': 'next', disabled: !w.next, 'aria-label': 'Semanas seguintes' })}>${icon('chevronRight', { size: 18, stroke: 2 })}</button>
    ${w.current ? '' : button({ label: 'Semana atual', variant: 'ghost', small: true, extra: { 'data-week': 'now' } })}
  </div>`;
}

export function renderFollowup({ root, session, api, navigate }) {
  canManage = can(session.state.user, 'followup.manage');
  const initialWeek = hashParam('week');
  const initialTurma = hashParam('turma');
  let state = { turma: initialTurma, week: /^\d{4}-\d{2}-\d{2}$/.test(initialWeek) ? initialWeek : '', sort: 'risk', offset: 0 };
  let lastResult = null;
  let rows = [];
  let classNames = [];

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'followup',
    heading: 'Acompanhamento',
    eyebrow: 'Mentoria',
    subtitle: 'Engajamento semanal de cada aluna, para agir antes que alguém fique para trás.',
    content: html`<div class="fu">
      <div class="fu-toolbar">
        <div id="fu-turma-host"></div>
        <div class="fu-toolbar-end">
          <div id="fu-week-host"></div>
          ${selectField({ id: 'fu-sort', label: 'Ordenar por', value: 'risk', options: SORT_OPTIONS })}
        </div>
      </div>
      <div id="fu-summary" aria-live="off"></div>
      <div id="list-region" aria-live="off"></div>
      <div id="fu-legend"></div>
    </div>`,
  });

  const region = root.querySelector('#list-region');
  const summaryHost = root.querySelector('#fu-summary');
  const turmaHost = root.querySelector('#fu-turma-host');
  const weekHost = root.querySelector('#fu-week-host');
  const legendHost = root.querySelector('#fu-legend');
  const sortSelect = root.querySelector('#fu-sort');
  mount(turmaHost, turmaControl([], state.turma));

  function syncHash() {
    const query = buildQuery({ week: state.week, turma: state.turma });
    window.history.replaceState(null, '', `#/acompanhamento${query}`);
  }

  function paintControls(result) {
    const hadTurmaFocus = turmaHost.contains(document.activeElement) ? document.activeElement.dataset.turma ?? document.activeElement.id : null;
    mount(turmaHost, turmaControl(classNames, state.turma));
    if (hadTurmaFocus !== null && hadTurmaFocus !== undefined) {
      (turmaHost.querySelector(`[data-turma="${CSS.escape(hadTurmaFocus)}"]`) ?? turmaHost.querySelector(`#${CSS.escape(hadTurmaFocus)}`))?.focus();
    }
    const hadWeekFocus = weekHost.contains(document.activeElement) ? document.activeElement.dataset.week : null;
    mount(weekHost, weekControl(result));
    if (hadWeekFocus) (weekHost.querySelector(`[data-week="${hadWeekFocus}"]:not([disabled])`) ?? weekHost.querySelector('.fu-week-label'))?.focus();
  }

  const loader = createListLoader({
    region,
    errorTitle: 'Não foi possível carregar o acompanhamento',
    fallback: () => sortSelect,
    fetchData: () => {
      const { offset, ...params } = state;
      return api.get(`/api/v1/mentora/followup${buildQuery({ ...params, limit: LIMIT, offset })}`);
    },
    recover: (result) => {
      const offset = recoveryOffset(result, state.offset, LIMIT);
      if (offset === null) return false;
      state = { ...state, offset };
      return true;
    },
    paint: (result) => {
      lastResult = result;
      rows = result.data;
      classNames = result.classNames;
      state = { ...state, week: result.week.current ? '' : result.week.start };
      syncHash();
      paintControls(result);
      mount(summaryHost, summaryCards(result, state.turma));
      if (rows.length === 0) {
        mount(region, emptyFollowup(Boolean(state.turma)));
        mount(legendHost, html``);
        return;
      }
      const { limit, offset, total } = result.page;
      mount(region, html`${followupTable(result)}${pager({ info: pageInfo({ limit, offset, total }), total })}`);
      mount(legendHost, legend());
    },
  });

  function setFilters(patch) {
    state = withFilters(state, patch);
    loader.load();
  }

  // ---- ações
  async function editPlan(row) {
    await loader.settle(await openPlanDialog({ api, student: { id: row.id, name: row.name }, plan: row.plan }), 'Plano de ação salvo.');
  }

  /** Marca/desmarca o check-in da semana mostrada, com atualização na hora e volta atrás se o servidor recusar. */
  async function toggleCheckin(row) {
    const week = lastResult.week.start;
    const done = !row.checkin.done;
    const apply = (value) => {
      row.checkin = { ...row.checkin, done: value };
      lastResult.summary.checkinsDone += value ? 1 : -1;
      repaintKeepingFocus(row.id);
    };
    apply(done);
    try {
      if (done) await api.post(`/api/v1/mentora/students/${encodeURIComponent(row.id)}/checkins`, { weekStart: week });
      else await api.delete(`/api/v1/mentora/students/${encodeURIComponent(row.id)}/checkins/${week}`);
      if (!loader.disposed) toast(done ? `Check-in de ${row.name} registrado.` : `Check-in de ${row.name} desmarcado.`, { tone: 'success' });
    } catch (error) {
      if (loader.disposed) return;
      apply(!done);
      toast(describeError(error), { tone: 'danger' });
    }
  }

  function repaintKeepingFocus(id) {
    loader.repaint(lastResult);
    region.querySelector(`[data-action="checkin"][data-id="${CSS.escape(id)}"]`)?.focus();
  }

  const rowActions = { plan: editPlan, checkin: toggleCheckin };
  region.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      state = { ...state, offset: pageOffset(pageButton.dataset.page, state.offset, LIMIT) };
      loader.load();
      return;
    }
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'clear-turma') return void setFilters({ turma: '' });
    const row = Object.hasOwn(rowActions, action) ? rows.find((r) => r.id === target.dataset.id) : null;
    if (row) loader.runLocked(`${action}:${row.id}`, () => rowActions[action](row));
  });

  turmaHost.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-turma]');
    if (!choice || choice.getAttribute('aria-pressed') === 'true') return;
    setFilters({ turma: choice.dataset.turma });
  });
  turmaHost.addEventListener('change', (event) => {
    if (event.target.id === 'fu-turma-select') setFilters({ turma: event.target.value });
  });
  weekHost.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-week]');
    if (!choice || !lastResult) return;
    const { week } = lastResult;
    const next = choice.dataset.week === 'prev' ? week.previous : choice.dataset.week === 'next' ? week.next : '';
    if (choice.dataset.week !== 'now' && !next) return;
    setFilters({ week: next });
  });
  sortSelect.addEventListener('change', (event) => setFilters({ sort: event.target.value }));

  loader.load();

  return () => {
    loader.dispose();
    disposeShell();
  };
}
