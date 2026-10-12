import { debounce } from '../lib/debounce.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { SEGMENT_FILTER_OPTIONS, SORT_OPTIONS, barPercent, kpiCards, locationLabel, logoLetters, logoTone, moneyShort, segmentLabel } from '../lib/companies.js';
import { whenLabel } from '../lib/leads.js';
import { pageOffset, recoveryOffset, withFilters } from '../lib/list-state.js';
import { buildQuery, pageInfo, parseSort } from '../lib/query.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { button, emptyState, searchField, selectField } from '../ui/components.js';
import { createListLoader } from '../ui/list-view.js';
import { actionMenu } from '../ui/menu.js';
import { dataTable, pager } from '../ui/table.js';
import { confirmDeleteCompany, openCompanyDialog } from './company-dialogs.js';

const LIMIT = 20;
const SEARCH_DELAY_MS = 300;
const DEFAULT_SORT = 'pipeline:desc';

/** Avatar-logo da empresa: iniciais num quadrado arredondado; cor entre 5 variações fixas por empresa. */
export function companyLogo(company, size = '') {
  return html`<span${attrs({ class: `co-logo co-logo-${logoTone(company.id)}${size ? ` co-logo-${size}` : ''}`, 'aria-hidden': 'true' })}>${logoLetters(company.name)}</span>`;
}

function kpiStrip(summary) {
  return html`<section class="co-kpis" aria-label="Resumo das empresas">${kpiCards(summary).map(
    (k) => html`<div${attrs({ class: `co-kpi${k.dark ? ' co-kpi-dark' : ''}`, 'data-kpi': k.id })}>
      <span class="co-kpi-label">${k.label}</span>
      <span${attrs({ class: `co-kpi-value${k.id === 'top' ? ' is-name' : ''}` })}>${summary ? k.value : '·'}</span>
      ${summary && k.note ? html`<span class="co-kpi-note">${k.note}</span>` : ''}
    </div>`,
  )}</section>`;
}

const rowMenu = (company) =>
  actionMenu({
    label: `Mais ações de ${company.name}`,
    id: company.id,
    items: [
      { label: 'Abrir empresa', action: 'open', id: company.id },
      { label: 'Editar', action: 'edit', id: company.id },
      { separator: true },
      { label: 'Excluir', action: 'delete', id: company.id, tone: 'danger' },
    ],
  });

function columns(maxValue) {
  return [
    {
      key: 'name',
      label: 'Empresa',
      render: (c) => html`<a class="co-cell" href="#/empresas/${c.id}">${companyLogo(c)}<span class="co-cell-text"><span class="co-cell-name">${c.name}</span>${locationLabel(c) ? html`<span class="co-cell-sub">${locationLabel(c)}</span>` : ''}</span></a>`,
    },
    { key: 'segment', label: 'Segmento', optional: true, render: (c) => segmentLabel(c.segment) ?? '—' },
    { key: 'contactsCount', label: 'Contatos', nowrap: true, render: (c) => html`<strong>${c.contactsCount}</strong>` },
    { key: 'openDealsCount', label: 'Oportunidades', nowrap: true, render: (c) => html`<strong>${c.openDealsCount}</strong>` },
    {
      key: 'pipelineValue',
      label: 'Valor do pipeline',
      render: (c) => html`<span class="co-pipe"><strong class="co-pipe-value">${moneyShort(c.pipelineValue)}</strong><span class="co-bar" aria-hidden="true"><span class="co-bar-fill" data-width="${barPercent(c.pipelineValue, maxValue)}"></span></span></span>`,
    },
    { key: 'lastActivityAt', label: 'Última atividade', nowrap: true, optional: true, render: (c) => whenLabel(c.lastActivityAt) },
    { key: 'actions', label: 'Ações', nowrap: true, render: rowMenu },
  ];
}

function emptyCompanies(filtered) {
  if (filtered) {
    return emptyState({
      iconName: 'search',
      title: 'Nada encontrado',
      message: 'Tente outro termo de busca ou remova os filtros.',
      action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear-filters' } }),
    });
  }
  return emptyState({
    iconName: 'empresas',
    title: 'Nenhuma empresa ainda',
    message: 'Cadastre as contas com quem você se relaciona e vincule as pessoas a elas para ver o valor em jogo em cada uma.',
    action: button({ label: 'Nova empresa', extra: { 'data-action': 'create' } }),
  });
}

export function renderCompanies({ root, session, api, navigate }) {
  let state = { q: '', segment: '', ...parseSort(DEFAULT_SORT), offset: 0 };
  let rows = [];
  let summary = null;

  const content = html`<div id="company-kpis">${kpiStrip(null)}</div>
    <div class="toolbar co-toolbar">
      <div class="toolbar-search">${searchField({ id: 'companies-search', label: 'Buscar empresa', placeholder: 'Buscar empresa…' })}</div>
      <div class="toolbar-actions">
        ${selectField({ id: 'companies-segment', label: 'Segmento', value: '', options: SEGMENT_FILTER_OPTIONS })}
        ${selectField({ id: 'companies-sort', label: 'Ordenar por', value: DEFAULT_SORT, options: SORT_OPTIONS })}
        ${button({ label: 'Limpar filtros', variant: 'ghost', id: 'companies-clear', extra: { hidden: true } })}
      </div>
    </div>
    <div id="list-region" aria-live="off"></div>`;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'companies',
    heading: 'Empresas',
    eyebrow: 'CRM',
    subtitle: 'Contas com quem você se relaciona e o valor em jogo em cada uma.',
    actions: button({ label: 'Nova empresa', id: 'new-company', iconStart: icon('plus') }),
    content,
  });

  const region = root.querySelector('#list-region');
  const search = root.querySelector('#companies-search');
  const segmentSelect = root.querySelector('#companies-segment');
  const sortSelect = root.querySelector('#companies-sort');
  const clearButton = root.querySelector('#companies-clear');
  const kpiRegion = root.querySelector('#company-kpis');

  const hasFilters = () => Boolean(state.q || state.segment);

  function paintSummary() {
    mount(kpiRegion, kpiStrip(summary));
    clearButton.hidden = !hasFilters();
  }

  // A largura das barras vem de dados, e o CSP não aceita style inline: aplica pela CSSOM depois de pintar.
  function applyBarWidths() {
    for (const bar of region.querySelectorAll('[data-width]')) {
      bar.style.width = `${bar.getAttribute('data-width')}%`;
      bar.removeAttribute('data-width');
    }
  }

  const loader = createListLoader({
    region,
    errorTitle: 'Não foi possível carregar as empresas',
    fallback: () => search,
    fetchData: () => {
      const { offset, ...params } = state;
      return api.get(`/api/v1/companies${buildQuery({ ...params, limit: LIMIT, offset })}`);
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
        mount(region, emptyCompanies(hasFilters()));
        return;
      }
      const { limit, offset, total } = result.page;
      const max = summary?.top?.pipelineValue ?? '0.00';
      mount(region, html`${dataTable({ caption: 'Lista de empresas', columns: columns(max), rows })}${pager({ info: pageInfo({ limit, offset, total }), total })}`);
      applyBarWidths();
    },
  });

  function setFilters(patch) {
    state = withFilters(state, patch);
    paintSummary();
    loader.load();
  }

  async function create() {
    const outcome = await openCompanyDialog({ api });
    await loader.settle(outcome, 'Empresa cadastrada.');
  }

  async function edit(company) {
    const outcome = await openCompanyDialog({ api, company });
    await loader.settle(outcome, 'Empresa atualizada.');
  }

  async function remove(company) {
    if (!(await confirmDeleteCompany(company)) || loader.disposed) return;
    await loader.mutate(() => api.delete(`/api/v1/companies/${company.id}`), 'Empresa excluída.');
  }

  function clearFilters() {
    scheduleSearch.cancel();
    search.value = '';
    segmentSelect.value = '';
    setFilters({ q: '', segment: '' });
  }

  const scheduleSearch = debounce((value) => setFilters({ q: value.trim() }), SEARCH_DELAY_MS);
  search.addEventListener('input', (event) => scheduleSearch(event.target.value));
  segmentSelect.addEventListener('change', (event) => setFilters({ segment: event.target.value }));
  sortSelect.addEventListener('change', (event) => setFilters(parseSort(event.target.value)));
  clearButton.addEventListener('click', () => {
    clearFilters();
    search.focus();
  });
  root.querySelector('#new-company').addEventListener('click', create);

  const rowActions = { edit, delete: remove, open: (company) => navigate(`/empresas/${company.id}`) };
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
