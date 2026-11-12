import { debounce } from '../lib/debounce.js';
import { money } from '../lib/finance.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { CAMPAIGN_SEGMENTS, CHANNEL_FILTER_OPTIONS, channelLabel, formatCount, formatRoas, isCampaignStatus, metricsOf, moneyOrDash, rangeLabel } from '../lib/marketing.js';
import { buildQuery, hashParam } from '../lib/query.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { button, emptyState, searchField, selectField } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { createListLoader } from '../ui/list-view.js';
import { MARKETING_EYEBROW, marketingTabs } from '../ui/marketing-tabs.js';
import { actionMenu } from '../ui/menu.js';
import { dataTable } from '../ui/table.js';
import { bindPeriod, campaignBadge, campaignHref, openCampaignDialog, periodButtons, readMarketingPeriod } from './marketing-ui.js';

const rowMenu = (row) =>
  actionMenu({
    label: `Mais ações da campanha ${row.name}`,
    id: row.id,
    items: [
      { label: 'Abrir campanha', action: 'open', id: row.id },
      { label: 'Editar', action: 'edit', id: row.id },
      { separator: true },
      row.archived ? { label: 'Desarquivar', action: 'unarchive', id: row.id } : { label: 'Arquivar', action: 'archive', id: row.id },
    ],
  });

const COLUMNS = [
  {
    key: 'name',
    label: 'Campanha',
    render: (r) => html`<a class="lead-cell mk-cell" href="${campaignHref(r.id)}"><span class="lead-cell-text"><span class="lead-cell-name">${r.name}</span><span class="lead-cell-sub">${channelLabel(r.channel)} · ${rangeLabel(r.startsOn, r.endsOn)}</span></span></a>`,
  },
  { key: 'status', label: 'Situação', nowrap: true, render: (r) => campaignBadge(r.status) },
  { key: 'investment', label: 'Investimento', align: 'end', nowrap: true, render: (r) => money(metricsOf(r.metrics).investment) },
  { key: 'leads', label: 'Leads', align: 'end', nowrap: true, render: (r) => formatCount(metricsOf(r.metrics).leads) },
  { key: 'cpl', label: 'CPL', align: 'end', nowrap: true, optional: true, render: (r) => moneyOrDash(metricsOf(r.metrics).cpl) },
  { key: 'sales', label: 'Vendas', align: 'end', nowrap: true, optional: true, render: (r) => formatCount(metricsOf(r.metrics).sales) },
  { key: 'revenue', label: 'Receita', align: 'end', nowrap: true, render: (r) => money(metricsOf(r.metrics).revenue) },
  { key: 'roas', label: 'ROAS', align: 'end', nowrap: true, optional: true, render: (r) => formatRoas(metricsOf(r.metrics).roas) },
  { key: 'actions', label: 'Ações', nowrap: true, render: rowMenu },
];

function segments(current) {
  return html`${CAMPAIGN_SEGMENTS.map((s) => html`<button${attrs({ type: 'button', class: 'segment', 'data-segment': s.id, 'aria-pressed': String(s.id === current) })}>${s.label}</button>`)}`;
}

export function renderCampaigns({ root, session, api, navigate }) {
  const fromHash = hashParam('status');
  const state = { status: isCampaignStatus(fromHash) ? fromHash : '', channel: '', q: '', period: readMarketingPeriod() };
  let rows = [];

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'marketing',
    heading: 'Campanhas',
    eyebrow: MARKETING_EYEBROW,
    subtitle: 'Cada ação de divulgação com o que custou e o que trouxe. Os números são do período escolhido.',
    actions: button({ label: 'Nova campanha', id: 'new-campaign', iconStart: icon('plus') }),
    content: html`${marketingTabs('campaigns')}
      <div class="segments-row"><span class="segments-label" aria-hidden="true">Números de</span><div class="segments" role="group" aria-label="Período dos números" id="cp-period">${periodButtons(state.period)}</div></div>
      <div class="segments" role="group" aria-label="Filtrar por situação" id="cp-segments">${segments(state.status)}</div>
      <div class="toolbar">
        <div class="toolbar-search">${searchField({ id: 'cp-search', label: 'Buscar campanha', placeholder: 'Buscar pelo nome…' })}</div>
        <div class="toolbar-actions">${selectField({ id: 'cp-channel-filter', label: 'Canal', value: '', options: CHANNEL_FILTER_OPTIONS })}</div>
      </div>
      <div id="list-region" aria-live="off"></div>`,
  });

  const region = root.querySelector('#list-region');
  const searchInput = root.querySelector('#cp-search');
  const segmentsEl = root.querySelector('#cp-segments');
  const filtered = () => Boolean(state.status || state.channel || state.q);

  const loader = createListLoader({
    region,
    errorTitle: 'Não foi possível carregar as campanhas',
    fallback: () => searchInput,
    fetchData: () => api.get(`/api/v1/campaigns${buildQuery({ status: state.status, channel: state.channel, q: state.q, period: state.period })}`),
    paint: (result) => {
      rows = Array.isArray(result?.rows) ? result.rows : [];
      if (rows.length === 0) {
        mount(
          region,
          filtered()
            ? emptyState({ iconName: 'search', title: 'Nenhuma campanha encontrada', message: 'Tente outro nome, canal ou situação.', action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear-filters' } }) })
            : emptyState({
                iconName: 'megafone',
                title: 'Nenhuma campanha ainda',
                message: 'Crie uma campanha para cada ação de divulgação (um lançamento, uma live, anúncios do mês) e veja quanto cada uma traz.',
                action: button({ label: 'Criar campanha', extra: { 'data-action': 'create' } }),
              }),
        );
        return;
      }
      mount(region, html`${dataTable({ caption: 'Campanhas e números do período', columns: COLUMNS, rows })}<p class="pager-count muted" role="status">${rows.length === 1 ? '1 campanha' : `${rows.length} campanhas`}</p>`);
    },
  });

  async function create() {
    const outcome = await openCampaignDialog({ api });
    if (loader.disposed) return;
    await loader.settle(outcome, 'Campanha criada.');
  }

  async function edit(row) {
    await loader.settle(await openCampaignDialog({ api, campaign: row }), 'Campanha atualizada.');
  }

  async function archive(row, on) {
    if (on) {
      const ok = await confirmDialog({
        title: `Arquivar ${row.name}?`,
        message: 'A campanha sai das listas de escolha e não recebe investimentos novos. Os números dela continuam nos relatórios, e você pode desarquivar quando quiser.',
        confirmLabel: 'Arquivar',
      });
      if (!ok || loader.disposed) return;
    }
    await loader.mutate(() => api.post(`/api/v1/campaigns/${encodeURIComponent(row.id)}/${on ? 'archive' : 'unarchive'}`, { version: row.version }), on ? 'Campanha arquivada.' : 'Campanha desarquivada.');
  }

  function clearFilters() {
    scheduleSearch.cancel();
    searchInput.value = '';
    root.querySelector('#cp-channel-filter').value = '';
    Object.assign(state, { status: '', channel: '', q: '' });
    mount(segmentsEl, segments(''));
    loader.load();
    searchInput.focus();
  }

  const scheduleSearch = debounce((value) => {
    state.q = value.trim();
    loader.load();
  }, 300);
  searchInput.addEventListener('input', (event) => scheduleSearch(event.target.value));
  root.querySelector('#cp-channel-filter').addEventListener('change', (event) => {
    state.channel = event.target.value;
    loader.load();
  });
  segmentsEl.addEventListener('click', (event) => {
    const segment = event.target.closest('[data-segment]');
    if (!segment || segment.getAttribute('aria-pressed') === 'true') return;
    for (const other of segmentsEl.querySelectorAll('[data-segment]')) other.setAttribute('aria-pressed', String(other === segment));
    state.status = segment.dataset.segment;
    loader.load();
  });
  bindPeriod(root.querySelector('#cp-period'), () => state.period, (next) => {
    state.period = next;
    loader.load();
  });
  root.querySelector('#new-campaign').addEventListener('click', () => create());
  region.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'create') return void create();
    if (action === 'clear-filters') return void clearFilters();
    const row = rows.find((r) => r.id === target.dataset.id);
    if (!row) return;
    if (action === 'open') navigate(`/marketing/campanhas/${encodeURIComponent(row.id)}`);
    else if (action === 'edit') loader.runLocked(row.id, () => edit(row));
    else if (action === 'archive') loader.runLocked(row.id, () => archive(row, true));
    else if (action === 'unarchive') loader.runLocked(row.id, () => archive(row, false));
  });

  loader.load();
  return () => {
    loader.dispose();
    scheduleSearch.cancel();
    disposeShell();
  };
}

