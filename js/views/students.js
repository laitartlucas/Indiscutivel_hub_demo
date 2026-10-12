import { ApiError, describeError } from '../lib/api.js';
import { debounce } from '../lib/debounce.js';
import { initials, mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { pageOffset, recoveryOffset, withFilters } from '../lib/list-state.js';
import {
  activityText,
  goalsSentence,
  goalsText,
  lastAccessText,
  levelText,
  miniBars,
  NO_CLASS,
  segmentCount,
  STUDENT_SEGMENTS,
  STUDENT_SORT_OPTIONS,
  studentsCsv,
  studentsCsvFilename,
} from '../lib/mentora.js';
import { buildQuery, hashParam, pageInfo, parseSort } from '../lib/query.js';
import { STATUS_LABELS, statusTone } from '../lib/students.js';
import { ACTIVE_BANDS, formatCount, updatedAgo, updatedOn } from '../../shared/active-students.js';
import { deltaBadge } from '../ui/active-students.js';
import { icon } from '../ih-icons.js';
import { applySizes } from '../lib/widths.js';
import { renderShell } from '../shell.js';
import { avatarContent, badge, button, emptyState, searchField, selectField } from '../ui/components.js';
import { can } from '../lib/permissions.js';
import { createListLoader } from '../ui/list-view.js';
import { actionMenu } from '../ui/menu.js';
import { dataTable, pager } from '../ui/table.js';
import { toast } from '../ui/toast.js';
import { copyLinkDialog, linkDatesCheck, studentDialogBody, studentPayload, studentValidators } from './student-forms.js';

const LIMIT = 20;
const SEARCH_DELAY_MS = 300;
const DEFAULT_SORT = 'name:asc';
const EMAIL_TAKEN_MESSAGE = 'Já existe uma conta com esse e-mail.';
const CAN_RESEND = new Set(['invite_pending', 'invite_expired', 'no_invite']);

/** O servidor responde 409 `email_taken` sem lista de campos; vira erro no campo E-mail (o diálogo continua aberto e preenchido). */
function withEmailFieldError(error) {
  if (error instanceof ApiError && error.code === 'email_taken') {
    return new ApiError({ status: error.status, code: error.code, detail: error.detail, requestId: error.requestId, errors: [{ field: 'email', message: EMAIL_TAKEN_MESSAGE }] });
  }
  return error;
}

function studentAvatar(student) {
  return html`<span class="mp-avatar" aria-hidden="true">${student.avatarUrl ? avatarContent(student.name, student.avatarUrl) : initials(student.name)}</span>`;
}

function segments(counts, current) {
  return html`<div class="segments" role="group" aria-label="Filtrar por estado">${STUDENT_SEGMENTS.map((s) => {
    const count = segmentCount(counts, s.id);
    const label = count === null ? s.label : `${s.label}, ${count}`;
    return html`<button${attrs({ type: 'button', class: 'segment', 'data-segment': s.id, 'aria-pressed': String(s.id === current), 'aria-label': label })}>${s.label}<span class="segment-count" aria-hidden="true">${count ?? '·'}</span></button>`;
  })}</div>`;
}

function activeSegments(counts, current) {
  const options = [{ id: '', label: 'Todas' }, ...ACTIVE_BANDS];
  return html`<span class="segments-label" id="active-segments-label">Alunas ativas</span><div class="segments" role="group" aria-labelledby="active-segments-label">${options.map((o) => {
    const count = o.id === '' ? null : (counts?.[o.id] ?? null);
    const label = count === null ? o.label : `${o.label}, ${count}`;
    return html`<button${attrs({ type: 'button', class: 'segment', 'data-active-band': o.id, 'aria-pressed': String(o.id === current), 'aria-label': `Alunas ativas: ${label}` })}>${o.label}${count === null ? '' : html`<span class="segment-count" aria-hidden="true">${count}</span>`}</button>`;
  })}</div>`;
}

// Quem está vendo a lista (proprietária ou equipe): o menu só oferece o que o papel permite. O servidor confere de novo.
let viewer = null;

const rowMenu = (student) =>
  actionMenu({
    label: `Mais ações de ${student.name}`,
    id: student.id,
    items: [
      { label: 'Abrir perfil', action: 'open', id: student.id },
      ...(can(viewer, 'sessions.manage') ? [{ label: 'Marcar sessão', action: 'schedule', id: student.id }] : []),
      ...(can(viewer, 'students.manage') && CAN_RESEND.has(student.status) ? [{ label: student.status === 'no_invite' ? 'Enviar convite' : 'Reenviar convite', action: 'resend', id: student.id }] : []),
    ],
  });

/** Alunas ativas informadas pela própria aluna: valor, variação do mês e há quantos dias foi atualizado ("—" quando não informou). */
function activeCell(active) {
  if (!active || !Number.isInteger(active.count)) return html`<span class="mp-muted"><span aria-hidden="true">—</span><span class="sr-only">Ainda não informou</span></span>`;
  return html`<span class="as-cell"><span class="as-cell-top"><strong class="as-cell-num">${formatCount(active.count)}</strong>${deltaBadge(active.deltaMonth)}</span><span${attrs({ class: 'as-cell-when', title: updatedOn(active.updatedAt) })}><span class="sr-only">Atualizado </span>${updatedAgo(active.updatedAt).replace(/^Atualizado /, "")}</span></span>`;
}

const COLUMNS = [
  {
    key: 'name',
    label: 'Aluna',
    render: (s) => html`<a class="mp-student" href="#/alunas/${s.id}">${studentAvatar(s)}<span class="mp-student-text"><span class="mp-student-name">${s.name}</span><span class="mp-student-sub">${s.className ?? s.email}</span></span></a>`,
  },
  { key: 'status', label: 'Estado', nowrap: true, render: (s) => badge(STATUS_LABELS[s.status] ?? s.status, statusTone(s.status)) },
  {
    key: 'lastLoginAt',
    label: 'Último acesso',
    nowrap: true,
    optional: true,
    render: (s) => html`<span${attrs({ title: s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString('pt-BR') : false })}>${lastAccessText(s.lastLoginAt)}</span>`,
  },
  {
    key: 'progress',
    label: 'Progresso',
    render: (s) =>
      s.status === 'invite_pending' || s.status === 'invite_expired' || s.status === 'no_invite'
        ? html`<span class="mp-muted">—</span>`
        : html`<span class="mp-progress"><span class="mp-track mp-track-sm" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.progressPct}" aria-label="Progresso até o próximo nível: ${s.progressPct}%"><span class="mp-fill" data-w="${s.progressPct}"></span></span><strong class="mp-progress-pct">${s.progressPct}%</strong></span>`,
  },
  { key: 'goals', label: 'Meta', nowrap: true, optional: true, render: (s) => html`<span${attrs({ title: goalsSentence(s.goals) })}>${goalsText(s.goals)}<span class="sr-only"> (${goalsSentence(s.goals)})</span></span>` },
  { key: 'level', label: 'Nível', nowrap: true, render: (s) => html`<span${attrs({ class: `mp-level${s.level.n >= 9 ? ' is-high' : ''}` })}>${levelText(s.level.n)}<span class="sr-only">, ${s.level.name}</span></span>` },
  {
    key: 'activeStudents',
    label: 'Alunas ativas',
    nowrap: true,
    sortable: true,
    render: (s) => activeCell(s.activeStudents),
  },
  {
    key: 'activity',
    label: 'Atividade',
    nowrap: true,
    optional: true,
    render: (s) => html`<svg class="mp-bars-mini" width="70" height="22" viewBox="0 0 70 22" role="img" aria-label="${activityText(s.activity)}">${miniBars(s.activity).map(
      (b) => html`<rect${attrs({ class: b.on ? 'is-on' : 'is-off', x: String(b.x), y: String(b.y), width: String(b.w), height: String(b.h), rx: '1' })}></rect>`,
    )}</svg>`,
  },
  { key: 'actions', label: 'Ações', nowrap: true, render: (s) => rowMenu(s) },
];

function emptyStudents(filtered) {
  if (filtered) {
    return emptyState({
      iconName: 'search',
      title: 'Nada encontrado',
      message: 'Tente outro termo de busca ou remova os filtros.',
      action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear-filters' } }),
    });
  }
  return emptyState({
    iconName: 'alunas',
    title: 'Nenhuma aluna ainda',
    message: can(viewer, 'students.manage') ? 'Cadastre a primeira aluna para acompanhar a evolução dela na mentoria.' : 'Quando a mentora cadastrar as alunas, elas aparecem aqui.',
    action: can(viewer, 'students.manage') ? button({ label: 'Cadastrar aluna', extra: { 'data-action': 'create' } }) : undefined,
  });
}

function classOptions(classNames, current) {
  const known = new Set(classNames);
  const options = [{ value: '', label: 'Todas as turmas' }, ...classNames.map((name) => ({ value: name, label: name })), { value: NO_CLASS, label: 'Sem turma' }];
  if (current && current !== NO_CLASS && !known.has(current)) options.splice(1, 0, { value: current, label: current });
  return options;
}

export function renderStudents({ root, session, api, navigate }) {
  viewer = session.state.user;
  const canCreate = can(viewer, 'students.manage');
  let state = { q: hashParam('q'), status: '', className: '', activeStudents: '', ...parseSort(DEFAULT_SORT), offset: 0 };
  let rows = [];
  let counts = null;
  let classNames = [];
  let activeCounts = null;
  let exporting = false;

  const content = html`<div class="toolbar lead-toolbar">
      <div class="toolbar-search">${searchField({ id: 'students-search', label: 'Buscar aluna', placeholder: 'Buscar uma aluna…' })}</div>
      <div class="toolbar-actions">
        <div id="students-class-host">${selectField({ id: 'students-class', label: 'Turma', value: '', options: classOptions([], '') })}</div>
        ${selectField({ id: 'students-sort', label: 'Ordenar por', value: DEFAULT_SORT, options: STUDENT_SORT_OPTIONS })}
        ${button({ label: 'Limpar filtros', variant: 'ghost', id: 'students-clear', extra: { hidden: true } })}
      </div>
    </div>
    <div id="student-segments">${segments(null, '')}</div>
    <div class="segments-row" id="active-segments">${activeSegments(null, '')}</div>
    <div id="list-region" aria-live="off"></div>`;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'students',
    heading: 'Minhas alunas',
    eyebrow: 'Mentoria',
    subtitle: 'Acompanhe evolução, atividade e acesso das suas alunas em um só lugar.',
    actions: html`${button({ label: 'Exportar lista', variant: 'ghost', id: 'students-export', iconStart: icon('download', { size: 16, stroke: 2 }) })}${canCreate ? button({ label: 'Nova aluna', id: 'new-student', iconStart: icon('plus') }) : ''}`,
    content,
  });

  const region = root.querySelector('#list-region');
  const search = root.querySelector('#students-search');
  if (state.q) search.value = state.q;
  const classHost = root.querySelector('#students-class-host');
  const sortSelect = root.querySelector('#students-sort');
  const clearButton = root.querySelector('#students-clear');
  const segmentRegion = root.querySelector('#student-segments');
  const activeRegion = root.querySelector('#active-segments');
  const exportButton = root.querySelector('#students-export');

  const hasFilters = () => Boolean(state.q || state.status || state.className || state.activeStudents);

  function paintFilters() {
    const focused = segmentRegion.contains(document.activeElement) ? document.activeElement.dataset.segment : null;
    mount(segmentRegion, segments(counts, state.status));
    if (focused !== null && focused !== undefined) segmentRegion.querySelector(`[data-segment="${CSS.escape(focused)}"]`)?.focus();
    const bandFocused = activeRegion.contains(document.activeElement) ? document.activeElement.dataset.activeBand : null;
    mount(activeRegion, activeSegments(activeCounts, state.activeStudents));
    if (bandFocused !== null && bandFocused !== undefined) activeRegion.querySelector(`[data-active-band="${CSS.escape(bandFocused)}"]`)?.focus();
    sortSelect.value = `${state.sort}:${state.order}`;
    const hadFocus = classHost.contains(document.activeElement);
    mount(classHost, selectField({ id: 'students-class', label: 'Turma', value: state.className, options: classOptions(classNames, state.className) }));
    if (hadFocus) classHost.querySelector('select')?.focus();
    clearButton.hidden = !hasFilters();
  }

  const loader = createListLoader({
    region,
    errorTitle: 'Não foi possível carregar as alunas',
    fallback: () => search,
    fetchData: () => {
      const { offset, ...params } = state;
      return api.get(`/api/v1/mentora/students${buildQuery({ ...params, limit: LIMIT, offset })}`);
    },
    recover: (result) => {
      const offset = recoveryOffset(result, state.offset, LIMIT);
      if (offset === null) return false;
      state = { ...state, offset };
      return true;
    },
    paint: (result) => {
      rows = result.data;
      counts = result.counts ?? counts;
      classNames = result.classNames ?? classNames;
      activeCounts = result.activeCounts ?? activeCounts;
      paintFilters();
      if (rows.length === 0) {
        mount(region, emptyStudents(hasFilters()));
        return;
      }
      const { limit, offset, total } = result.page;
      mount(region, html`${dataTable({ caption: 'Lista de alunas', columns: COLUMNS, rows, dense: true, sort: { key: state.sort, order: state.order } })}${pager({ info: pageInfo({ limit, offset, total }), total })}`);
      applySizes(region);
    },
  });

  function setFilters(patch) {
    state = withFilters(state, patch);
    loader.load();
  }

  /** Padrões da mentoria (turma, programa, plano) como valores iniciais de "Nova aluna". Sem eles, o diálogo abre em branco. */
  async function studentDefaults() {
    try {
      const s = await api.get('/api/v1/mentora/settings');
      return { className: s.defaultClassName ?? '', program: s.defaultProgram ?? '', plan: s.defaultPlan ?? '' };
    } catch {
      return {};
    }
  }

  async function openCreateDialog() {
    let sendAccess = true;
    let created = null;
    let accessBox = null;
    await loader.formDialog(
      {
        title: 'Nova aluna',
        submitLabel: 'Criar aluna',
        busyLabel: 'Criando…',
        body: studentDialogBody(null, await studentDefaults()),
        className: 'dialog-wide',
        validators: studentValidators(null),
        onMount: (dialog, formApi) => {
          accessBox = dialog.querySelector('[name="sendAccess"]');
          linkDatesCheck(dialog, formApi);
        },
        onSubmit: async (values) => {
          sendAccess = accessBox ? accessBox.checked : sendAccess;
          try {
            created = await api.post('/api/v1/students', studentPayload(values, { sendAccess }));
          } catch (error) {
            throw withEmailFieldError(error);
          }
        },
      },
      'Aluna cadastrada.',
    );
    if (created?.invite?.acceptUrl && !loader.disposed) await copyLinkDialog({ student: created.student, acceptUrl: created.invite.acceptUrl });
  }

  async function resend(student) {
    try {
      const result = await api.post(`/api/v1/students/${encodeURIComponent(student.id)}/invites`, {});
      if (loader.disposed) return;
      toast('Novo link de acesso gerado.', { tone: 'success' });
      if (result?.invite?.acceptUrl) await copyLinkDialog({ student: result.student ?? student, acceptUrl: result.invite.acceptUrl });
    } catch (error) {
      if (!loader.disposed) toast(describeError(error), { tone: 'danger' });
    }
    if (!loader.disposed) await loader.load();
  }

  /** CSV gerado no navegador com a lista filtrada (todas as páginas): nome, e-mail, turma, estado, último acesso e nível. */
  async function exportList() {
    if (exporting) return;
    exporting = true;
    exportButton.disabled = true;
    exportButton.setAttribute('aria-busy', 'true');
    try {
      const all = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const params = { ...state, offset: undefined };
        const page = await api.get(`/api/v1/mentora/students${buildQuery({ ...params, limit: 100, offset })}`);
        all.push(...page.data);
        if (all.length >= page.page.total || page.data.length === 0) break;
      }
      if (loader.disposed) return;
      if (all.length === 0) {
        toast('Não há alunas para exportar com esses filtros.', { tone: 'info' });
        return;
      }
      const blob = new window.Blob([studentsCsv(all)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = studentsCsvFilename();
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Lista exportada em CSV.', { tone: 'success' });
    } catch (error) {
      if (!loader.disposed) toast(describeError(error), { tone: 'danger' });
    } finally {
      exporting = false;
      exportButton.disabled = false;
      exportButton.removeAttribute('aria-busy');
    }
  }

  function clearFilters() {
    scheduleSearch.cancel();
    search.value = '';
    setFilters({ q: '', status: '', className: '', activeStudents: '' });
  }

  const scheduleSearch = debounce((value) => setFilters({ q: value.trim() }), SEARCH_DELAY_MS);
  search.addEventListener('input', (event) => scheduleSearch(event.target.value));
  classHost.addEventListener('change', (event) => {
    if (event.target.id === 'students-class') setFilters({ className: event.target.value });
  });
  sortSelect.addEventListener('change', (event) => setFilters(parseSort(event.target.value)));
  clearButton.addEventListener('click', () => {
    clearFilters();
    search.focus();
  });
  root.querySelector('#new-student')?.addEventListener('click', openCreateDialog);
  exportButton.addEventListener('click', exportList);
  activeRegion.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-active-band]');
    if (!choice || choice.getAttribute('aria-pressed') === 'true') return;
    setFilters({ activeStudents: choice.dataset.activeBand });
  });
  segmentRegion.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-segment]');
    if (!choice || choice.getAttribute('aria-pressed') === 'true') return;
    setFilters({ status: choice.dataset.segment });
  });

  const rowActions = {
    open: (student) => navigate(`/alunas/${student.id}`),
    schedule: (student) => navigate(`/alunas/${student.id}?sessao=1`),
    resend,
  };
  region.addEventListener('click', (event) => {
    const sortButton = event.target.closest('[data-sort]');
    if (sortButton) {
      const key = sortButton.dataset.sort;
      // Primeiro clique: maior primeiro; clicar de novo inverte. Sem informar sempre fica no fim.
      setFilters({ sort: key, order: state.sort === key && state.order === 'desc' ? 'asc' : 'desc' });
      return;
    }
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      state = { ...state, offset: pageOffset(pageButton.dataset.page, state.offset, LIMIT) };
      loader.load();
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const { action } = actionButton.dataset;
    if (action === 'create') return void openCreateDialog();
    if (action === 'clear-filters') {
      clearFilters();
      search.focus();
      return;
    }
    const row = Object.hasOwn(rowActions, action) ? rows.find((r) => r.id === actionButton.dataset.id) : null;
    if (row) loader.runLocked(row.id, () => rowActions[action](row));
  });

  loader.load();
  // Vindo do Painel ("Nova aluna"): abre o diálogo já na entrada da tela.
  if (hashParam('nova') === '1' && canCreate) {
    window.history.replaceState(null, '', '#/alunas');
    Promise.resolve().then(() => {
      if (!loader.disposed) openCreateDialog();
    });
  }

  return () => {
    loader.dispose();
    scheduleSearch.cancel();
    disposeShell();
  };
}
