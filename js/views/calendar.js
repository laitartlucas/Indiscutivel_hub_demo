import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { createRowLock } from '../lib/list-state.js';
import { buildQuery } from '../lib/query.js';
import {
  KIND_LABELS,
  WEEKDAY_HEADERS,
  agendaTime,
  agendaTitle,
  dayKey,
  gridKeyTarget,
  gridRange,
  groupByDay,
  monthGrid,
  monthTitle,
  parseDayKey,
  shiftMonth,
  startOfDay,
  tzOffsetMinutes,
} from '../lib/tasks.js';
import { sessionAsCalendarItem, sessionLine } from '../lib/mentora.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { actionMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { refreshTasksBadge } from '../lib/tasks-badge.js';
import { confirmDeleteTask, openTaskDialog } from './task-dialogs.js';
import { linkLabel, tasksPageSwitch } from './tasks.js';

const MAX_CHIPS = 3;
const PAGE_SIZE = 200;
const MAX_PAGES = 5;
const MODE_KEY = 'ih:calendar-mode';
const MODES = [
  { value: 'month', label: 'Mês' },
  { value: 'list', label: 'Lista' },
];
const DAY_LONG = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

function readMode() {
  try {
    const value = globalThis.localStorage?.getItem(MODE_KEY);
    return value === 'list' ? 'list' : 'month';
  } catch {
    return 'month';
  }
}
function writeMode(mode) {
  try {
    globalThis.localStorage?.setItem(MODE_KEY, mode);
  } catch {
    // sem armazenamento: só não lembra
  }
}

/** Rótulos do calendário: os tipos de tarefa mais a Mentoria (sessão marcada pela mentora, somente leitura). */
const LABELS = { ...KIND_LABELS, mentoring: 'Mentoria' };

const kindClass = (task) => `kind-${task.kind}${task.status === 'done' ? ' is-done' : ''}`;

function cellLabel(cell, items, todayKey) {
  const sessions = items.filter((t) => t.readOnly).length;
  const tasks = items.filter((t) => !t.readOnly);
  const open = tasks.filter((t) => t.status === 'open').length;
  const done = tasks.length - open;
  const parts = [DAY_LONG.format(cell.date)];
  if (cell.key === todayKey) parts.push('hoje');
  if (items.length === 0) parts.push('sem tarefas');
  else {
    if (tasks.length > 0) {
      parts.push(open === 0 ? 'nenhuma pendente' : open === 1 ? '1 pendente' : `${open} pendentes`);
      if (done > 0) parts.push(done === 1 ? '1 concluída' : `${done} concluídas`);
    }
    if (sessions > 0) parts.push(sessions === 1 ? '1 mentoria' : `${sessions} mentorias`);
  }
  return parts.join(', ');
}

function dayCell(cell, items, { todayKey, selectedKey, focusKey }) {
  const shown = items.slice(0, MAX_CHIPS);
  const more = items.length - shown.length;
  return html`<div${attrs({
    role: 'gridcell',
    class: `cal-cell${cell.inMonth ? '' : ' is-outside'}${cell.key === todayKey ? ' is-today' : ''}${cell.key === selectedKey ? ' is-selected' : ''}`,
    tabindex: cell.key === focusKey ? '0' : '-1',
    'data-key': cell.key,
    'aria-selected': String(cell.key === selectedKey),
    'aria-current': cell.key === todayKey ? 'date' : false,
    'aria-label': cellLabel(cell, items, todayKey),
  })}>
    <span class="cal-day" aria-hidden="true">${cell.day}</span>
    <ul class="cal-events" aria-hidden="true">${shown.map((t) => html`<li${attrs({ class: `cal-chip ${kindClass(t)}` })}><span class="cal-chip-dot"></span><span class="cal-chip-text">${t.title}</span></li>`)}${more > 0 ? html`<li class="cal-more">+${more} mais</li>` : ''}</ul>
    <ul class="cal-dots" aria-hidden="true">${items.slice(0, 4).map((t) => html`<li${attrs({ class: `cal-dot ${kindClass(t)}` })}></li>`)}</ul>
  </div>`;
}

function agendaItem(task) {
  if (task.readOnly) {
    // Sessão de mentoria: marcada pela mentora, só leitura (sem marcar como feita, editar nem excluir).
    return html`<li${attrs({ class: 'agenda-row', 'data-task-id': task.id })}>
      <span class="agenda-time">${agendaTime(task)}</span>
      <div${attrs({ class: `agenda-card ${kindClass(task)}` })}>
        <span class="agenda-mentoring-icon" aria-hidden="true">${icon('calendar', { size: 16 })}</span>
        <div class="agenda-text"><span class="agenda-title">${task.title}</span><span class="agenda-sub">Mentoria · ${sessionLine(task.session).split(' · ').slice(1).join(' · ')}</span></div>
      </div>
    </li>`;
  }
  const done = task.status === 'done';
  const link = linkLabel(task);
  return html`<li${attrs({ class: `agenda-row${done ? ' is-done' : ''}`, 'data-task-id': task.id })}>
    <span class="agenda-time">${agendaTime(task)}</span>
    <div${attrs({ class: `agenda-card ${kindClass(task)}` })}>
      <button${attrs({ type: 'button', class: 'task-check', 'data-action': 'toggle', 'data-id': task.id, 'aria-pressed': String(done), 'aria-label': `Concluir: ${task.title}` })}><span class="task-check-box" aria-hidden="true">${icon('check', { size: 13, stroke: 3 })}</span></button>
      <div class="agenda-text"><span class="agenda-title">${task.title}</span><span class="agenda-sub">${LABELS[task.kind] ?? task.kind}${link ? ` · ${link}` : ''}</span></div>
      ${actionMenu({
        label: `Mais ações de ${task.title}`,
        id: task.id,
        items: [
          { label: 'Editar', action: 'edit', id: task.id },
          { label: 'Excluir', action: 'delete', id: task.id, tone: 'danger' },
        ],
      })}
    </div>
  </li>`;
}

const LEGEND = ['meeting', 'call', 'followup', 'deadline', 'task', 'mentoring'];

export function renderCalendar({ root, session, api, navigate }) {
  const today = startOfDay(new Date());
  const todayKey = dayKey(today);
  let view = { year: today.getFullYear(), month: today.getMonth() };
  let selected = today;
  let mode = readMode();
  let tasks = [];
  let sessions = [];
  let loading = true;
  let loadError = null;
  let token = 0;
  let disposed = false;
  const runLocked = createRowLock();

  const content = html`<div class="cal-layout">
    <div class="cal-main">
      <div class="cal-toolbar">
        <div class="cal-nav">
          <button type="button" class="cal-nav-btn" id="cal-prev" aria-label="Mês anterior">${icon('chevronLeft', { size: 16 })}</button>
          <button type="button" class="cal-nav-btn" id="cal-next" aria-label="Próximo mês">${icon('chevronRight', { size: 16 })}</button>
          <button type="button" class="cal-today-btn" id="cal-today">Hoje</button>
        </div>
        <div class="view-toggle" role="group" aria-label="Modo do calendário">${MODES.map((m) => html`<button${attrs({ type: 'button', class: 'view-toggle-btn', 'data-mode': m.value, 'aria-pressed': String(m.value === mode) })}>${m.label}</button>`)}</div>
      </div>
      <p class="sr-only" id="cal-status" role="status" aria-live="polite"></p>
      <section class="cal-card" id="cal-region" aria-label="Calendário"></section>
    </div>
    <aside class="cal-aside" aria-label="Agenda e legenda">
      <section class="cal-agenda" id="cal-agenda" aria-labelledby="agenda-title"></section>
      <section class="cal-legend" aria-label="Legenda">
        <ul>${LEGEND.map((k) => html`<li><span class="cal-chip-dot kind-${k}"></span>${LABELS[k]}</li>`)}</ul>
      </section>
    </aside>
  </div>`;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'calendar',
    heading: monthTitle(view.year, view.month),
    eyebrow: 'Gestão',
    actions: html`${tasksPageSwitch('calendar')}${button({ label: 'Nova tarefa', id: 'new-task', iconStart: icon('plus') })}`,
    content,
  });

  const region = root.querySelector('#cal-region');
  const agenda = root.querySelector('#cal-agenda');
  const statusEl = root.querySelector('#cal-status');
  const heading = root.querySelector('h1');
  const toggleButtons = [...root.querySelectorAll('[data-mode]')];

  const weeks = () => monthGrid(view.year, view.month);
  const byDay = () => groupByDay([...tasks, ...sessions]);
  const itemsOf = (key) => byDay().get(key) ?? [];

  // ---------- desenho ----------

  function paintHeading() {
    const title = monthTitle(view.year, view.month);
    heading.textContent = title;
    statusEl.textContent = `Mostrando ${title}`;
    document.title = `${title} — Calendário — Indiscutível Hub`;
  }

  function paintMonth(focusKey = dayKey(selected)) {
    const grid = weeks();
    const groups = byDay();
    const selectedKey = dayKey(selected);
    const head = WEEKDAY_HEADERS.map((d, i) => html`<span role="columnheader" aria-label="${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][i]}">${d}</span>`);
    const inGrid = grid.some((week) => week.some((c) => c.key === focusKey));
    const effectiveFocus = inGrid ? focusKey : grid[0].find((c) => c.inMonth)?.key ?? grid[0][0].key;
    mount(
      region,
      html`<div class="cal-grid" role="grid"${attrs({ 'aria-label': monthTitle(view.year, view.month), 'aria-busy': String(loading) })}>
        <div class="cal-head" role="row">${head}</div>
        ${grid.map((week) => html`<div class="cal-week" role="row">${week.map((cell) => dayCell(cell, groups.get(cell.key) ?? [], { todayKey, selectedKey, focusKey: effectiveFocus }))}</div>`)}
      </div>`,
    );
  }

  function paintList() {
    const prefix = `${view.year}-${String(view.month + 1).padStart(2, '0')}-`;
    const days = [...byDay().entries()].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
    if (days.length === 0) {
      mount(
        region,
        emptyState({
          iconName: 'calendar',
          title: `Nenhuma tarefa em ${monthTitle(view.year, view.month)}`,
          message: 'Crie uma tarefa com prazo para vê-la aqui. As sessões de mentoria marcadas pela sua mentora também aparecem aqui.',
          action: button({ label: 'Nova tarefa', extra: { 'data-action': 'create' } }),
        }),
      );
      return;
    }
    mount(
      region,
      html`<div class="cal-list">${days.map(([key, items]) => {
        const date = parseDayKey(key);
        return html`<section class="cal-list-day" aria-label="${agendaTitle(date)}"><h2 class="cal-list-title">${agendaTitle(date)}</h2><ul class="agenda-list">${items.map(agendaItem)}</ul></section>`;
      })}</div>`,
    );
  }

  function paintAgenda() {
    const key = dayKey(selected);
    const items = itemsOf(key);
    const isToday = key === todayKey;
    mount(
      agenda,
      html`<div class="agenda-head"><span class="eyebrow">${isToday ? 'Hoje' : 'Dia selecionado'}</span><h2 id="agenda-title" class="agenda-day" tabindex="-1">${agendaTitle(selected)}</h2></div>
        ${loading
          ? skeleton(2)
          : items.length === 0
            ? html`<p class="agenda-empty">Nenhuma tarefa neste dia.</p>`
            : html`<ul class="agenda-list">${items.map(agendaItem)}</ul>`}
        <div class="row">${button({ label: 'Nova tarefa neste dia', variant: 'ghost', small: true, extra: { 'data-action': 'create-day' } })}</div>`,
    );
  }

  function paintBody({ focusKey } = {}) {
    if (loadError) {
      mount(
        region,
        html`<div class="stack cal-error">${alert({ tone: 'danger', title: 'Não foi possível carregar o calendário', message: describeError(loadError) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`,
      );
    } else if (mode === 'list') {
      if (loading) mount(region, skeleton(4));
      else paintList();
    } else {
      paintMonth(focusKey);
    }
    paintAgenda();
    for (const b of toggleButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }

  // ---------- dados ----------

  async function load({ focusKey } = {}) {
    const mine = ++token;
    loading = true;
    loadError = null;
    paintHeading();
    paintBody({ focusKey });
    try {
      const { from, to } = gridRange(weeks());
      const all = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await api.get(`/api/v1/tasks${buildQuery({ view: 'all', from, to, tzOffset: tzOffsetMinutes(), limit: PAGE_SIZE, offset: page * PAGE_SIZE })}`);
        if (disposed || mine !== token) return;
        all.push(...result.data);
        if (all.length >= result.page.total || result.data.length === 0) break;
      }
      tasks = all;
      // Sessões de mentoria marcadas pela mentora (somente leitura). Se falhar, o calendário segue só com as tarefas.
      sessions = await api
        .get(`/api/v1/mentoring/sessions${buildQuery({ from, to })}`)
        .then((result) => (Array.isArray(result?.data) ? result.data.filter((x) => x.status !== 'cancelled').map(sessionAsCalendarItem) : []))
        .catch(() => []);
      if (disposed || mine !== token) return;
    } catch (error) {
      if (disposed || mine !== token) return;
      tasks = [];
      sessions = [];
      loadError = error;
    }
    loading = false;
    paintBody({ focusKey });
    if (focusKey) focusCell(focusKey);
  }

  function focusCell(key) {
    region.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
  }

  // ---------- navegação ----------

  function goToMonth(next, { selectDate = null, focus = false } = {}) {
    view = next;
    const inView = (d) => d.getFullYear() === view.year && d.getMonth() === view.month;
    selected = selectDate ?? (inView(today) ? today : new Date(view.year, view.month, 1));
    return load({ focusKey: focus ? dayKey(selected) : undefined });
  }

  function selectDay(date, { focus = false } = {}) {
    selected = date;
    const inGrid = weeks().some((week) => week.some((c) => c.key === dayKey(date)));
    if (!inGrid) {
      goToMonth({ year: date.getFullYear(), month: date.getMonth() }, { selectDate: date, focus });
      return;
    }
    // Clicar num dia vizinho (cinza) só o seleciona; o mês exibido continua o mesmo.
    if (mode === 'month') {
      for (const cell of region.querySelectorAll('.cal-cell')) {
        const on = cell.dataset.key === dayKey(date);
        cell.classList.toggle('is-selected', on);
        cell.setAttribute('aria-selected', String(on));
        cell.tabIndex = on ? 0 : -1;
      }
      if (focus) focusCell(dayKey(date));
    }
    paintAgenda();
  }

  // ---------- ações ----------

  async function reload() {
    await load({});
    refreshTasksBadge({ force: true });
  }

  async function toggleTask(task) {
    const next = task.status === 'done' ? 'open' : 'done';
    try {
      await api.patch(`/api/v1/tasks/${task.id}`, { status: next, version: task.version });
      if (disposed) return;
      if (next === 'done') toast('Tarefa concluída.', { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await reload();
    restoreAction(task.id, 'toggle');
  }

  /** Depois de redesenhar, devolve o foco ao mesmo controle (o agenda é refeito inteiro). */
  function restoreAction(id, action) {
    const target = root.querySelector(`[data-action="${action}"][data-id="${CSS.escape(id)}"]`);
    if (target) target.focus();
  }

  async function createTask(preset) {
    const result = await openTaskDialog({ api, preset });
    if (disposed) return;
    if (result.saved) toast('Tarefa criada.', { tone: 'success' });
    if (result.saved || result.hadFailure) await reload();
  }

  async function editTask(task) {
    const result = await openTaskDialog({ api, task });
    if (disposed) return;
    if (result.saved) toast('Tarefa atualizada.', { tone: 'success' });
    if (result.saved || result.hadFailure) await reload();
    restoreAction(task.id, 'menu');
  }

  async function removeTask(task) {
    if (!(await confirmDeleteTask(task)) || disposed) return;
    try {
      await api.delete(`/api/v1/tasks/${task.id}`);
      if (disposed) return;
      toast('Tarefa excluída.', { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await reload();
    agenda.querySelector('#agenda-title')?.focus();
  }

  // ---------- eventos ----------

  root.querySelector('#cal-prev').addEventListener('click', () => goToMonth(shiftMonth(view, -1)));
  root.querySelector('#cal-next').addEventListener('click', () => goToMonth(shiftMonth(view, 1)));
  root.querySelector('#cal-today').addEventListener('click', () => goToMonth({ year: today.getFullYear(), month: today.getMonth() }, { selectDate: today }));
  root.querySelector('#new-task').addEventListener('click', () => createTask(null));

  root.querySelector('.cal-toolbar .view-toggle').addEventListener('click', (event) => {
    const b = event.target.closest('[data-mode]');
    if (!b || b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    writeMode(mode);
    paintBody({ focusKey: dayKey(selected) });
  });

  region.addEventListener('click', (event) => {
    const cell = event.target.closest('.cal-cell');
    if (cell) {
      const date = parseDayKey(cell.dataset.key);
      if (date) selectDay(date, { focus: true });
      return;
    }
    handleAction(event);
  });

  region.addEventListener('keydown', (event) => {
    const cell = event.target.closest?.('.cal-cell');
    if (!cell || event.target !== cell) return;
    const date = parseDayKey(cell.dataset.key);
    if (!date) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDay(date, { focus: true });
      return;
    }
    const target = gridKeyTarget(event.key, date);
    if (!target) return;
    event.preventDefault();
    selectDay(target, { focus: true });
  });

  agenda.addEventListener('click', handleAction);

  function handleAction(event) {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    if (action === 'retry') return void load({});
    if (action === 'create') return void createTask(null);
    if (action === 'create-day') return void createTask({ date: dayKey(selected) });
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (action === 'toggle') runLocked(task.id, () => toggleTask(task));
    else if (action === 'edit') runLocked(task.id, () => editTask(task));
    else if (action === 'delete') runLocked(task.id, () => removeTask(task));
  }

  paintHeading();
  load({});

  return () => {
    disposed = true;
    token++;
    disposeShell();
  };
}

