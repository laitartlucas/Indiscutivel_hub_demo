import { debounce } from '../lib/debounce.js';
import { initials, mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { avatarTone, kpiCards, moneyShort, segmentCount, SORT_OPTIONS, STATUS_LABELS, STATUS_SEGMENTS, STATUS_TONES, TEMPERATURE_FILTER_OPTIONS, whenLabel } from '../lib/leads.js';
import { sourceFilterOptions, sourceLabel } from '../lib/sources.js';
import { pageOffset, recoveryOffset, withFilters } from '../lib/list-state.js';
import { buildQuery, hashParam, pageInfo, parseSort } from '../lib/query.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { badge, button, emptyState, searchField, selectField } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { createListLoader } from '../ui/list-view.js';
import { actionMenu } from '../ui/menu.js';
import { dataTable, pager } from '../ui/table.js';
import { toast } from '../ui/toast.js';
import { temperatureLabel, temperatureTone } from '../ui/kanban.js';
import { openConvertDialog, openLeadDialog } from './lead-dialogs.js';

const LIMIT = 20;
const SEARCH_DELAY_MS = 300;
const DEFAULT_SORT = 'created_at:desc';

/** Selo da situação do lead (a palavra carrega o significado; o tom só reforça). */
export function statusBadge(status) {
  return badge(STATUS_LABELS[status] ?? status, STATUS_TONES[status] ?? 'neutral');
}

export function temperatureBadge(temperature) {
  return badge(temperatureLabel(temperature), temperatureTone(temperature));
}

/** Círculo com as iniciais; a cor é uma de 5 variações estáveis por lead. */
export function leadAvatar(lead, size = '') {
  return html`<span${attrs({ class: `lead-avatar lead-avatar-${avatarTone(lead.id)}${size ? ` lead-avatar-${size}` : ''}`, 'aria-hidden': 'true' })}>${initials(lead.name)}</span>`;
}

function kpiStrip(summary) {
  const cards = kpiCards(summary);
  return html`<section class="lead-kpis" aria-label="Resumo dos leads">${cards.map(
    (k) => html`<div${attrs({ class: 'lead-kpi', 'data-kpi': k.id })}>
      <span class="lead-kpi-label">${k.label}</span>
      <span class="lead-kpi-line"><span${attrs({ class: `lead-kpi-value${k.gold ? ' is-gold' : ''}` })}>${summary ? k.value : '·'}</span>${summary && k.note ? html`<span class="lead-kpi-note">${k.note}</span>` : ''}</span>
    </div>`,
  )}</section>`;
}

function segments(summary, current) {
  return html`<div class="segments" role="group" aria-label="Filtrar por situação">${STATUS_SEGMENTS.map((s) => {
    const count = segmentCount(summary, s.id);
    const label = count === null ? s.label : `${s.label}, ${count}`;
    return html`<button${attrs({ type: 'button', class: 'segment', 'data-segment': s.id, 'aria-pressed': String(s.id === current), 'aria-label': label })}>${s.label}<span class="segment-count" aria-hidden="true">${count ?? '·'}</span></button>`;
  })}</div>`;
}

const rowMenu = (lead) =>
  actionMenu({
    label: `Mais ações de ${lead.name}`,
    id: lead.id,
    items: [
      { label: 'Abrir lead', action: 'open', id: lead.id },
      { label: 'Editar', action: 'edit', id: lead.id },
      ...(lead.status === 'converted' ? [] : [{ label: 'Criar oportunidade', action: 'convert', id: lead.id }]),
      { separator: true },
      { label: 'Excluir', action: 'delete', id: lead.id, tone: 'danger' },
    ],
  });

const COLUMNS = [
  {
    key: 'name',
    label: 'Nome',
    render: (lead) => html`<a class="lead-cell" href="#/leads/${lead.id}">${leadAvatar(lead)}<span class="lead-cell-text"><span class="lead-cell-name">${lead.name}</span>${lead.email || lead.whatsapp ? html`<span class="lead-cell-sub">${lead.email ?? ''}</span>` : ''}</span></a>`,
  },
  { key: 'company', label: 'Empresa', optional: true, render: (lead) => lead.company ?? '—' },
  { key: 'source', label: 'Origem', nowrap: true, optional: true, render: (lead) => sourceLabel(lead.source) },
  { key: 'status', label: 'Situação', nowrap: true, render: (lead) => html`<span class="lead-badges">${statusBadge(lead.status)}</span>` },
  { key: 'estimatedValue', label: 'Valor', nowrap: true, render: (lead) => html`<strong class="lead-value">${lead.estimatedValue ? moneyShort(lead.estimatedValue) : '—'}</strong>` },
  { key: 'lastActivityAt', label: 'Última atividade', nowrap: true, render: (lead) => whenLabel(lead.lastActivityAt) },
  { key: 'actions', label: 'Ações', nowrap: true, render: (lead) => rowMenu(lead) },
];

function emptyLeads(filtered) {
  if (filtered) {
    return emptyState({
      iconName: 'search',
      title: 'Nada encontrado',
      message: 'Tente outro termo de busca ou remova os filtros.',
      action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear-filters' } }),
    });
  }
  return emptyState({
    iconName: 'leads',
    title: 'Nenhum lead ainda',
    message: 'Cadastre quem demonstrou interesse no seu trabalho para acompanhar a conversa até virar oportunidade.',
    action: button({ label: 'Novo lead', extra: { 'data-action': 'create' } }),
  });
}

export function renderLeads({ root, session, api, navigate }) {
  let state = { q: hashParam('q'), status: '', temperature: '', source: '', ...parseSort(DEFAULT_SORT), offset: 0 };
  let rows = [];
  let summary = null;

  const content = html`<div id="lead-kpis">${kpiStrip(null)}</div>
    <div class="toolbar lead-toolbar">
      <div class="toolbar-search">${searchField({ id: 'leads-search', label: 'Buscar lead', placeholder: 'Buscar lead…' })}</div>
      <div class="toolbar-actions">
        ${selectField({ id: 'leads-source', label: 'Origem', value: '', options: sourceFilterOptions() })}
        ${selectField({ id: 'leads-temperature', label: 'Temperatura', value: '', options: TEMPERATURE_FILTER_OPTIONS })}
        ${selectField({ id: 'leads-sort', label: 'Ordenar por', value: DEFAULT_SORT, options: SORT_OPTIONS })}
        ${button({ label: 'Limpar filtros', variant: 'ghost', id: 'leads-clear', extra: { hidden: true } })}
      </div>
    </div>
    <div id="lead-segments">${segments(null, '')}</div>
    <div id="list-region" aria-live="off"></div>`;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'leads',
    heading: 'Leads',
    eyebrow: 'CRM',
    subtitle: 'Pessoas que demonstraram interesse no seu trabalho.',
    actions: button({ label: 'Novo lead', id: 'new-lead', iconStart: icon('plus') }),
    content,
  });

  const region = root.querySelector('#list-region');
  const search = root.querySelector('#leads-search');
  if (state.q) search.value = state.q;
  const sourceSelect = root.querySelector('#leads-source');
  const temperatureSelect = root.querySelector('#leads-temperature');
  const sortSelect = root.querySelector('#leads-sort');
  const clearButton = root.querySelector('#leads-clear');
  const kpiRegion = root.querySelector('#lead-kpis');
  const segmentRegion = root.querySelector('#lead-segments');

  const hasFilters = () => Boolean(state.q || state.status || state.temperature || state.source);

  function paintSummary() {
    // Redesenhar os filtros não pode tirar o foco de quem navega por teclado.
    const focused = segmentRegion.contains(document.activeElement) ? document.activeElement.dataset.segment : null;
    mount(kpiRegion, kpiStrip(summary));
    mount(segmentRegion, segments(summary, state.status));
    if (focused !== null && focused !== undefined) segmentRegion.querySelector(`[data-segment="${CSS.escape(focused)}"]`)?.focus();
    clearButton.hidden = !hasFilters();
  }

  const loader = createListLoader({
    region,
    errorTitle: 'Não foi possível carregar os leads',
    fallback: () => search,
    fetchData: () => {
      const { offset, ...params } = state;
      return api.get(`/api/v1/leads${buildQuery({ ...params, limit: LIMIT, offset })}`);
    },
    recover: (result) => {
      const offset = recoveryOffset(result, state.offset, LIMIT);
      if (offset === null) return false;
      state = { ...state, offset };
      return true;
    },
    paint: (result) => {
      rows = result.data;
      summary = result.summary ?? summary;
      paintSummary();
      if (rows.length === 0) {
        // Sem nenhum lead na carteira (e sem filtro ativo) o vazio convida a cadastrar; com filtro, é "nada encontrado".
        mount(region, emptyLeads(hasFilters()));
        return;
      }
      const { limit, offset, total } = result.page;
      mount(region, html`${dataTable({ caption: 'Lista de leads', columns: COLUMNS, rows })}${pager({ info: pageInfo({ limit, offset, total }), total })}`);
    },
  });

  function setFilters(patch) {
    state = withFilters(state, patch);
    paintSummary();
    loader.load();
  }

  async function create() {
    const outcome = await openLeadDialog({ api });
    await loader.settle(outcome, 'Lead cadastrado.');
  }

  async function edit(lead) {
    const outcome = await openLeadDialog({ api, lead });
    await loader.settle(outcome, 'Lead atualizado.');
  }

  async function convert(lead) {
    const outcome = await openConvertDialog({ api, lead });
    if (loader.disposed) return;
    if (outcome.saved) {
      toast('Oportunidade criada. O lead foi marcado como convertido.', { tone: 'success' });
      navigate(`/leads/${lead.id}`);
      return;
    }
    await loader.settle(outcome, '');
  }

  async function remove(lead) {
    const confirmed = await confirmDialog({
      title: `Excluir ${lead.name}?`,
      message: 'O lead e toda a linha do tempo dele serão apagados. Pessoa e oportunidade já criadas a partir dele continuam. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!confirmed || loader.disposed) return;
    await loader.mutate(() => api.delete(`/api/v1/leads/${lead.id}`), 'Lead excluído.');
  }

  function clearFilters() {
    scheduleSearch.cancel();
    search.value = '';
    sourceSelect.value = '';
    temperatureSelect.value = '';
    setFilters({ q: '', status: '', temperature: '', source: '' });
  }

  const scheduleSearch = debounce((value) => setFilters({ q: value.trim() }), SEARCH_DELAY_MS);
  search.addEventListener('input', (event) => scheduleSearch(event.target.value));
  sourceSelect.addEventListener('change', (event) => setFilters({ source: event.target.value }));
  temperatureSelect.addEventListener('change', (event) => setFilters({ temperature: event.target.value }));
  sortSelect.addEventListener('change', (event) => setFilters(parseSort(event.target.value)));
  clearButton.addEventListener('click', () => {
    clearFilters();
    search.focus();
  });
  root.querySelector('#new-lead').addEventListener('click', create);
  segmentRegion.addEventListener('click', (event) => {
    const button = event.target.closest('[data-segment]');
    if (!button || button.getAttribute('aria-pressed') === 'true') return;
    setFilters({ status: button.dataset.segment });
  });

  const rowActions = { edit, convert, delete: remove, open: (lead) => navigate(`/leads/${lead.id}`) };
  region.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      state = { ...state, offset: pageOffset(pageButton.dataset.page, state.offset, LIMIT) };
      loader.load();
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const { action } = actionButton.dataset;
    if (action === 'create') return void create();
    if (action === 'clear-filters') {
      clearFilters();
      search.focus();
      return;
    }
    const row = Object.hasOwn(rowActions, action) ? rows.find((r) => r.id === actionButton.dataset.id) : null;
    if (row) loader.runLocked(row.id, () => rowActions[action](row));
  });

  loader.load();

  return () => {
    loader.dispose();
    scheduleSearch.cancel();
    disposeShell();
  };
}

