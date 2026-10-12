import { describeError } from '../lib/api.js';
import { debounce } from '../lib/debounce.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { createRequestGuard, createRowLock, pageOffset, recoveryOffset } from '../lib/list-state.js';
import { buildQuery, hashParam, pageInfo } from '../lib/query.js';
import {
  PRIORITY_LABELS,
  TABS,
  belongsToTab,
  buildDue,
  dayKey,
  dueLabel,
  focusRing,
  isOverdue,
  tzOffsetMinutes,
} from '../lib/tasks.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, emptyState, searchField, skeleton } from '../ui/components.js';
import { actionMenu } from '../ui/menu.js';
import { pager } from '../ui/table.js';
import { toast } from '../ui/toast.js';
import { setTasksBadge } from '../lib/tasks-badge.js';
import { confirmDeleteTask, openTaskDialog } from './task-dialogs.js';

const LIMIT = 20;
const PRIORITY_TONE = { high: 'bad', medium: 'warn', low: 'neutral' };
const REMOVE_DELAY_MS = 650;

/** Alternância de página "Lista | Calendário" (links, não abas: cada uma é uma rota). */
export function tasksPageSwitch(active) {
  const item = (id, href, label, iconName) =>
    html`<a${attrs({ class: 'page-switch-item', href, 'aria-current': active === id ? 'page' : false })}>${icon(iconName, { size: 14 })}${label}</a>`;
  return html`<nav class="page-switch" aria-label="Visualização das tarefas">${item('list', '#/tarefas', 'Lista', 'menu')}${item('calendar', '#/calendario', 'Calendário', 'calendar')}</nav>`;
}

/** Selo de prioridade (alta em vinho, conforme o kit). */
export function priorityBadge(priority) {
  return badge(PRIORITY_LABELS[priority] ?? priority, PRIORITY_TONE[priority] ?? 'neutral');
}

/** Vínculo exibido: nome da Pessoa (ou da Pessoa da Oportunidade). */
export function linkLabel(task) {
  if (task.personName) return task.personName;
  if (task.dealPersonName) return `${task.dealPersonName} · oportunidade`;
  return null;
}

function checkButton(task) {
  const done = task.status === 'done';
  return html`<button${attrs({ type: 'button', class: 'task-check', 'data-action': 'toggle', 'data-id': task.id, 'aria-pressed': String(done), 'aria-label': `Concluir: ${task.title}` })}><span class="task-check-box" aria-hidden="true">${icon('check', { size: 13, stroke: 3 })}</span></button>`;
}

function taskRow(task, now) {
  const done = task.status === 'done';
  const late = isOverdue(task, now);
  const link = linkLabel(task);
  return html`<li${attrs({ class: `task-row${done ? ' is-done' : ''}`, 'data-task-id': task.id })}>
    ${checkButton(task)}
    <div class="task-main">
      <span class="task-title">${task.title}</span>
      <span class="task-sub"><span${attrs({ class: late ? 'task-sub-late' : false })}>${dueLabel(task, now)}</span>${link ? ` · ${link}` : ''}</span>
    </div>
    <span class="task-client" data-label="Cliente">${link ?? '—'}</span>
    <span${attrs({ class: `task-due${late ? ' is-late' : ''}`, 'data-label': 'Prazo' })}>${dueLabel(task, now)}</span>
    <span class="task-priority" data-label="Prioridade">${priorityBadge(task.priority)}</span>
    <span class="task-menu">${actionMenu({
      label: `Mais ações de ${task.title}`,
      id: task.id,
      items: [
        { label: 'Editar', action: 'edit', id: task.id },
        { label: 'Excluir', action: 'delete', id: task.id, tone: 'danger' },
      ],
    })}</span>
  </li>`;
}

function emptyForTab(tab, q) {
  if (q) {
    return emptyState({
      iconName: 'search',
      title: `Nada encontrado para “${q}”`,
      message: 'Tente outro termo de busca.',
      action: button({ label: 'Limpar busca', variant: 'ghost', extra: { 'data-action': 'clear-search' } }),
    });
  }
  const create = button({ label: 'Nova tarefa', extra: { 'data-action': 'create' } });
  const copy = {
    today: ['Nada para hoje', 'Você não tem tarefas com prazo hoje. Planeje o próximo passo com a sua rotina.', create],
    upcoming: ['Nenhuma tarefa por vir', 'Crie uma tarefa para não esquecer o próximo contato.', create],
    overdue: ['Nenhuma tarefa atrasada', 'Você está em dia. As tarefas que passarem do prazo aparecem aqui.', ''],
    done: ['Nenhuma tarefa concluída ainda', 'Quando você concluir uma tarefa, ela fica registrada aqui.', ''],
  }[tab];
  return emptyState({ iconName: 'tarefas', title: copy[0], message: copy[1], action: copy[2] });
}

function focusCard(summary, earnedXp = 0) {
  const ring = focusRing(summary);
  const left = (summary?.today ?? 0);
  const note = ring.total === 0 ? 'Nenhuma tarefa com prazo hoje.' : left === 0 ? 'Tudo concluído por hoje.' : left === 1 ? 'Falta 1 tarefa para hoje.' : `Faltam ${left} tarefas para hoje.`;
  return html`<section class="focus-card" aria-labelledby="focus-title">
    <h2 id="focus-title" class="eyebrow">Foco de hoje</h2>
    <svg class="focus-ring" width="140" height="140" viewBox="0 0 120 120" role="img" aria-label="${ring.done} de ${ring.total} tarefas de hoje concluídas">
      <circle class="focus-ring-track" cx="60" cy="60" r="50" fill="none" stroke-width="7"></circle>
      <circle class="focus-ring-arc" cx="60" cy="60" r="50" fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray="${ring.dash} ${ring.circumference}" transform="rotate(-90 60 60)"></circle>
      <text x="60" y="62" text-anchor="middle" class="focus-ring-num">${ring.done}/${ring.total}</text>
      <text x="60" y="82" text-anchor="middle" class="focus-ring-cap">CONCLUÍDAS</text>
    </svg>
    <p class="focus-note">${note}</p>
    <p class="focus-xp-note">Cada tarefa concluída soma 10 XP.${earnedXp > 0 ? html` <span class="xp-pop" data-xp-pop>+${earnedXp} XP</span>` : ''}</p>
  </section>`;
}

function statsCard(summary) {
  const late = summary?.overdue ?? 0;
  return html`<section class="task-stats" aria-label="Resumo das tarefas">
    <p><span>Em aberto</span><strong>${summary?.openTotal ?? 0}</strong></p>
    <p><span>Atrasadas</span><strong${attrs({ class: late > 0 ? 'is-late' : false })}>${late}</strong></p>
    <p><span>Concluídas nos últimos 7 dias</span><strong>${summary?.doneThisWeek ?? 0}</strong></p>
  </section>`;
}

export function renderTasks({ root, session, api, navigate }) {
  const guard = createRequestGuard();
  const runLocked = createRowLock();
  let tab = 'today';
  let q = hashParam('q');
  let offset = 0;
  let rows = [];
  let total = 0;
  let summary = null;
  let earnedXp = 0; // XP ganho nesta visita (só o que o servidor concedeu), mostrado no Foco de hoje
  const timers = new Set();

  const tabButtons = TABS.map(
    (t) => html`<button${attrs({ type: 'button', role: 'tab', class: 'tabs-tab', id: `tab-${t.id}`, 'data-tab': t.id, 'aria-selected': String(t.id === tab), 'aria-controls': 'task-panel', tabindex: t.id === tab ? '0' : '-1' })}>${t.label}<span class="tabs-count" data-count="${t.id}" aria-hidden="true">·</span></button>`,
  );

  const content = html`<div class="tasks-layout">
    <section class="tasks-card" aria-label="Lista de tarefas">
      <div class="tasks-head">
        <div class="tabs" role="tablist" aria-label="Situação das tarefas">${tabButtons}</div>
        <div class="tasks-search">${searchField({ id: 'tasks-search', label: 'Buscar tarefa', placeholder: 'Buscar tarefa…' })}</div>
      </div>
      <label class="task-quick">
        <span class="task-quick-icon" aria-hidden="true">${icon('plus', { size: 18 })}</span>
        <input type="text" id="task-quick-input" class="task-quick-input" maxlength="120" aria-label="Adicionar tarefa rápida" autocomplete="off" placeholder="Adicionar tarefa rápida… (Enter para salvar)">
      </label>
      <p class="field-error task-quick-error" id="task-quick-error" role="alert"></p>
      <div id="task-panel" role="tabpanel" aria-labelledby="tab-today" tabindex="-1"><div id="list-region" aria-live="off"></div></div>
    </section>
    <aside class="tasks-aside" aria-label="Resumo">
      <div id="focus-region">${skeleton(3)}</div>
      <div id="stats-region"></div>
    </aside>
  </div>`;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'tasks',
    heading: 'Minhas tarefas',
    eyebrow: 'Gestão',
    actions: html`${tasksPageSwitch('list')}${button({ label: 'Nova tarefa', id: 'new-task', iconStart: icon('plus') })}`,
    content,
  });

  const region = root.querySelector('#list-region');
  const panel = root.querySelector('#task-panel');
  const search = root.querySelector('#tasks-search');
  if (q) search.value = q;
  const quick = root.querySelector('#task-quick-input');
  const quickError = root.querySelector('#task-quick-error');
  const focusRegion = root.querySelector('#focus-region');
  const statsRegion = root.querySelector('#stats-region');

  const tzOffset = () => tzOffsetMinutes();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  // ---------- resumo (contagens das abas, anel e números) ----------

  function paintSummary() {
    const counts = {
      today: (summary?.today ?? 0) + (summary?.todayDone ?? 0),
      upcoming: summary?.upcoming ?? 0,
      overdue: summary?.overdue ?? 0,
      done: summary?.doneTotal ?? 0,
    };
    for (const el of root.querySelectorAll('[data-count]')) {
      el.textContent = summary ? String(counts[el.dataset.count]) : '·';
      el.classList.toggle('is-late', el.dataset.count === 'overdue' && counts.overdue > 0);
      el.parentElement.setAttribute('aria-label', summary ? `${TABS.find((t) => t.id === el.dataset.count).label}, ${counts[el.dataset.count]}` : TABS.find((t) => t.id === el.dataset.count).label);
    }
    mount(focusRegion, summary ? focusCard(summary, earnedXp) : html``);
    mount(statsRegion, summary ? statsCard(summary) : html``);
    setTasksBadge((summary?.overdue ?? 0) + (summary?.today ?? 0));
  }

  async function refreshSummary() {
    try {
      const next = await api.get(`/api/v1/tasks/summary${buildQuery({ tzOffset: tzOffset() })}`);
      if (guard.disposed) return;
      summary = next;
      paintSummary();
    } catch {
      // as contagens são um apoio: a lista continua valendo e tem o próprio estado de erro
      if (guard.disposed) return;
      if (!summary) mount(focusRegion, html``);
    }
  }

  // ---------- lista ----------

  function paintRows(now = new Date()) {
    if (rows.length === 0) {
      mount(region, emptyForTab(tab, q));
      return;
    }
    const info = pageInfo({ limit: LIMIT, offset, total });
    mount(
      region,
      html`<div class="task-list-head" aria-hidden="true"><span></span><span>Tarefa</span><span>Cliente</span><span>Prazo</span><span>Prioridade</span><span></span></div>
        <ul class="task-list" aria-label="Tarefas: ${TABS.find((t) => t.id === tab).label}">${rows.map((task) => taskRow(task, now))}</ul>
        ${total > LIMIT ? pager({ info, total }) : ''}`,
    );
  }

  function paintError(error) {
    mount(
      region,
      html`<div class="stack task-error">
        ${alert({ tone: 'danger', title: 'Não foi possível carregar as tarefas', message: describeError(error) })}
        <div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div>
      </div>`,
    );
  }

  async function load({ keepFocus = true } = {}) {
    const id = guard.next();
    const hadFocus = keepFocus && region.contains(document.activeElement);
    const focused = hadFocus ? { action: document.activeElement.dataset.action, id: document.activeElement.dataset.id, page: document.activeElement.dataset.page } : null;
    region.setAttribute('aria-busy', 'true');
    mount(region, skeleton(4));
    try {
      const query = buildQuery({ view: tab, q, tzOffset: tzOffset(), limit: LIMIT, offset });
      const result = await api.get(`/api/v1/tasks${query}`);
      if (guard.isStale(id)) return;
      const recovery = recoveryOffset(result, offset, LIMIT);
      if (recovery !== null) {
        offset = recovery;
        await load({ keepFocus });
        return;
      }
      rows = result.data;
      total = result.page.total;
      paintRows();
    } catch (error) {
      if (guard.isStale(id)) return;
      rows = [];
      paintError(error);
    }
    region.setAttribute('aria-busy', 'false');
    if (focused) restoreFocus(focused);
  }

  function restoreFocus({ action, id, page }) {
    const target =
      (page && region.querySelector(`[data-page="${CSS.escape(page)}"]:not(:disabled)`)) ||
      (action && id && region.querySelector(`[data-action="${CSS.escape(action)}"][data-id="${CSS.escape(id)}"]`)) ||
      region.querySelector('.task-check, [data-action="retry"], .empty button, [data-page]:not(:disabled)');
    target?.focus();
  }

  async function reloadAll() {
    await Promise.all([load(), refreshSummary()]);
  }

  // ---------- ações ----------

  function replaceRow(updated) {
    rows = rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
  }

  /** "+10 XP" que sobe da linha da tarefa e some sozinho (o aviso do topo é que é anunciado; este é só visual). */
  function popXp(li, points) {
    const host = li?.querySelector('.task-main');
    if (!host) return;
    const pop = document.createElement('span');
    pop.className = 'xp-pop xp-pop-float';
    pop.setAttribute('aria-hidden', 'true');
    pop.textContent = `+${points} XP`;
    host.append(pop);
    later(() => pop.remove(), 1800);
  }

  /** Marca/desmarca. Atualização otimista com volta atrás se a API recusar; fora da aba, a linha sai depois de um instante. */
  async function toggle(task, button) {
    const next = task.status === 'done' ? 'open' : 'done';
    const li = button?.closest('.task-row');
    const apply = (status) => {
      button?.setAttribute('aria-pressed', String(status === 'done'));
      li?.classList.toggle('is-done', status === 'done');
    };
    apply(next);
    try {
      const updated = await api.patch(`/api/v1/tasks/${task.id}`, { status: next, version: task.version });
      if (guard.disposed) return;
      replaceRow(updated);
      // Com XP concedido, o aviso premium (central, em app.js) já diz "Tarefa concluída"; sem XP (tarefa reaberta e concluída de novo), o aviso comum.
      if (next === 'done') {
        if (Number.isInteger(updated.xpAwarded) && updated.xpAwarded > 0) {
          earnedXp += updated.xpAwarded;
          popXp(li, updated.xpAwarded);
        } else toast('Tarefa concluída.', { tone: 'success' });
      }
      await refreshSummary();
      if (!belongsToTab(updated, tab)) later(() => removeRow(updated.id), REMOVE_DELAY_MS);
    } catch (error) {
      if (guard.disposed) return;
      apply(task.status);
      toast(describeError(error), { tone: 'danger' });
      await reloadAll(); // 409/404: a lista mostrava uma versão velha
    }
  }

  /** Tira a linha da tela (sem recarregar) e leva o foco à vizinha, para quem usa teclado não perder o lugar. */
  function removeRow(id) {
    if (guard.disposed) return;
    const li = region.querySelector(`[data-task-id="${CSS.escape(id)}"]`);
    if (!li) return;
    const hadFocus = li.contains(document.activeElement);
    const neighbor = li.nextElementSibling ?? li.previousElementSibling;
    rows = rows.filter((r) => r.id !== id);
    total = Math.max(0, total - 1);
    if (rows.length === 0) {
      if (total > 0) load();
      else paintRows();
      if (hadFocus) (region.querySelector('.empty button') ?? root.querySelector(`#tab-${tab}`))?.focus();
      return;
    }
    li.remove();
    if (hadFocus) (neighbor?.querySelector('.task-check') ?? root.querySelector(`#tab-${tab}`))?.focus();
  }

  async function edit(task) {
    const result = await openTaskDialog({ api, task });
    if (guard.disposed) return;
    if (result.saved) toast('Tarefa atualizada.', { tone: 'success' });
    if (result.saved || result.hadFailure) await reloadAll();
  }

  async function remove(task) {
    if (!(await confirmDeleteTask(task)) || guard.disposed) return;
    try {
      await api.delete(`/api/v1/tasks/${task.id}`);
      if (guard.disposed) return;
      toast('Tarefa excluída.', { tone: 'success' });
    } catch (error) {
      if (guard.disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await reloadAll();
  }

  async function create() {
    const result = await openTaskDialog({ api });
    if (guard.disposed) return;
    if (result.saved) toast('Tarefa criada.', { tone: 'success' });
    if (result.saved || result.hadFailure) await reloadAll();
  }

  async function quickAdd() {
    const title = quick.value.trim();
    if (!title) return;
    if (title.length > 120) {
      quickError.textContent = 'Título muito longo (máximo 120).';
      quick.setAttribute('aria-invalid', 'true');
      return;
    }
    quickError.textContent = '';
    quick.removeAttribute('aria-invalid');
    quick.disabled = true;
    // Na aba "Hoje" a tarefa rápida nasce com prazo hoje (dia inteiro); nas outras, sem prazo.
    const body = { title };
    if (tab === 'today') Object.assign(body, buildDue(dayKey(new Date()), ''));
    try {
      await api.post('/api/v1/tasks', body);
      if (guard.disposed) return;
      quick.value = '';
      toast('Tarefa criada.', { tone: 'success' });
      await reloadAll();
    } catch (error) {
      if (guard.disposed) return;
      quickError.textContent = describeError(error);
      quick.setAttribute('aria-invalid', 'true');
    } finally {
      if (!guard.disposed) {
        quick.disabled = false;
        quick.focus();
      }
    }
  }

  function selectTab(id, { focus = false } = {}) {
    if (!TABS.some((t) => t.id === id) || id === tab) return;
    tab = id;
    offset = 0;
    for (const button of root.querySelectorAll('[data-tab]')) {
      const on = button.dataset.tab === id;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      if (on && focus) button.focus();
    }
    panel.setAttribute('aria-labelledby', `tab-${id}`);
    load({ keepFocus: false });
  }

  // ---------- eventos ----------

  root.querySelector('.tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (button) selectTab(button.dataset.tab);
  });
  root.querySelector('.tabs').addEventListener('keydown', (event) => {
    const index = TABS.findIndex((t) => t.id === tab);
    const move = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    let target = null;
    if (move) target = TABS[(index + move + TABS.length) % TABS.length].id;
    else if (event.key === 'Home') target = TABS[0].id;
    else if (event.key === 'End') target = TABS[TABS.length - 1].id;
    if (!target) return;
    event.preventDefault();
    selectTab(target, { focus: true });
  });

  const scheduleSearch = debounce((value) => {
    q = value.trim();
    offset = 0;
    load({ keepFocus: false });
  }, 300);
  search.addEventListener('input', (event) => scheduleSearch(event.target.value));

  quick.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      quickAdd();
    }
  });
  quick.addEventListener('input', () => {
    quickError.textContent = '';
    quick.removeAttribute('aria-invalid');
  });

  region.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      offset = pageOffset(pageButton.dataset.page, offset, LIMIT);
      load();
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const { action } = actionButton.dataset;
    if (action === 'retry') return void load();
    if (action === 'create') return void create();
    if (action === 'clear-search') {
      scheduleSearch.cancel();
      search.value = '';
      q = '';
      offset = 0;
      load({ keepFocus: false }).then(() => search.focus());
      return;
    }
    const task = rows.find((r) => r.id === actionButton.dataset.id);
    if (!task) return;
    if (action === 'toggle') runLocked(task.id, () => toggle(task, actionButton));
    else if (action === 'edit') runLocked(task.id, () => edit(task));
    else if (action === 'delete') runLocked(task.id, () => remove(task));
  });

  root.querySelector('#new-task').addEventListener('click', create);

  refreshSummary();
  load({ keepFocus: false });

  return () => {
    guard.dispose();
    scheduleSearch.cancel();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    disposeShell();
  };
}
