import { periodRange } from '../lib/commercial.js';
import { money } from '../lib/finance.js';
import { mount } from '../lib/dom.js';
import { formatDateOnly } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import { channelLabel, formatCount } from '../lib/marketing.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { button, emptyState, selectField } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { createListView } from '../ui/list-view.js';
import { MARKETING_EYEBROW, marketingTabs } from '../ui/marketing-tabs.js';
import { actionMenu } from '../ui/menu.js';
import { campaignHref, loadCampaignChoices, openSpendDialog } from './marketing-ui.js';

const PERIOD_OPTIONS = [
  { value: '', label: 'Qualquer data' },
  { value: 'month', label: 'Este mês' },
  { value: 'quarter', label: 'Este trimestre' },
  { value: 'year', label: 'Este ano' },
];

const rowMenu = (row) =>
  actionMenu({
    label: `Mais ações do investimento de ${money(row.amount)} em ${formatDateOnly(row.spentOn)}`,
    id: row.id,
    items: [
      { label: 'Editar', action: 'edit', id: row.id },
      { separator: true },
      { label: 'Excluir', action: 'delete', id: row.id, tone: 'danger' },
    ],
  });

const COLUMNS = [
  { key: 'spentOn', label: 'Data', nowrap: true, render: (r) => formatDateOnly(r.spentOn) },
  { key: 'description', label: 'Descrição', render: (r) => r.description || '—' },
  { key: 'campaign', label: 'Campanha', render: (r) => (r.campaignId ? html`<a class="cc-funnel-link mk-inline-link" href="${campaignHref(r.campaignId)}">${r.campaignName ?? 'Campanha'}</a>` : html`<span class="muted">Sem campanha</span>`) },
  { key: 'channel', label: 'Canal', nowrap: true, optional: true, render: (r) => channelLabel(r.channel) },
  { key: 'amount', label: 'Valor', align: 'end', nowrap: true, render: (r) => html`<strong>${money(r.amount)}</strong>` },
  { key: 'actions', label: 'Ações', nowrap: true, render: rowMenu },
];

function totalsHtml(total, amount) {
  return html`<section class="fin-kpis mk-totals" aria-label="Totais com os filtros atuais">
    <div class="fin-kpi" role="group" aria-label="Total investido"><span class="lead-kpi-label">Total investido</span><span class="fin-kpi-value">${amount === null ? '·' : money(amount)}</span><span class="lead-kpi-note">com os filtros atuais</span></div>
    <div class="fin-kpi" role="group" aria-label="Lançamentos"><span class="lead-kpi-label">Lançamentos</span><span class="fin-kpi-value">${total === null ? '·' : formatCount(total)}</span><span class="lead-kpi-note">investimentos na lista</span></div>
  </section>`;
}

const campaignFilterOptions = (campaigns) => [{ value: '', label: 'Todas as campanhas' }, ...campaigns.map((c) => ({ value: c.id, label: c.archived ? `${c.name} (arquivada)` : c.name }))];

export function renderMarketingSpend({ root, session, api, navigate }) {
  let disposed = false;
  let campaigns = [];
  let total = null;
  let totalAmount = null;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'marketing',
    heading: 'Investimentos',
    eyebrow: MARKETING_EYEBROW,
    subtitle: 'Tudo o que você paga para divulgar: anúncios, eventos, materiais. É a base do CPL, do CAC, do ROAS e do ROI.',
    actions: button({ label: 'Novo investimento', id: 'new-spend', iconStart: icon('plus') }),
    content: html`${marketingTabs('spend')}
      <div id="sp-totals">${totalsHtml(null, null)}</div>
      <div class="toolbar">
        <div class="toolbar-actions">
          ${selectField({ id: 'sp-campaign-filter', label: 'Campanha', value: '', options: campaignFilterOptions([]) })}
          ${selectField({ id: 'sp-period', label: 'Período', value: '', options: PERIOD_OPTIONS })}
        </div>
      </div>
      <div id="list-region" aria-live="off"></div>`,
  });

  const totalsEl = root.querySelector('#sp-totals');
  const campaignSelect = root.querySelector('#sp-campaign-filter');
  // A lista devolve `totalAmount` junto com as linhas: guardamos a cada carga para a faixa de totais.
  const countingApi = {
    ...api,
    get: async (url) => {
      const result = await api.get(url);
      if (!disposed && result && typeof result === 'object') {
        total = Number.isInteger(result.total) ? result.total : null;
        totalAmount = typeof result.totalAmount === 'string' ? result.totalAmount : null;
        mount(totalsEl, totalsHtml(total, totalAmount));
      }
      return result;
    },
  };

  const list = createListView({
    api: countingApi,
    region: root.querySelector('#list-region'),
    // A API de investimentos não tem busca por texto: o campo de busca exigido pela lista fica fora da tela.
    search: document.createElement('input'),
    endpoint: '/api/v1/marketing/spend',
    filters: { campaignId: '', from: '', to: '' },
    caption: 'Investimentos lançados',
    columns: COLUMNS,
    empty: (state) =>
      state.campaignId || state.from
        ? emptyState({ iconName: 'search', title: 'Nenhum investimento com esses filtros', message: 'Troque a campanha ou o período.' })
        : emptyState({ iconName: 'crm', title: 'Nenhum investimento lançado', message: 'Lance o que você paga em anúncios, eventos e materiais para calcular o custo por lead e o retorno.', action: button({ label: 'Lançar investimento', extra: { 'data-action': 'create' } }) }),
    errorTitle: 'Não foi possível carregar os investimentos',
    actions: { create: () => create() },
    rowActions: { edit: (row) => edit(row), delete: (row) => remove(row) },
  });

  async function ensureCampaigns() {
    campaigns = await loadCampaignChoices(api);
    if (disposed) return campaigns;
    const value = campaignSelect.value;
    mount(campaignSelect, html`${campaignFilterOptions(campaigns).map((o) => html`<option${attrs({ value: o.value, selected: o.value === value })}>${o.label}</option>`)}`);
    return campaigns;
  }

  async function create() {
    await ensureCampaigns();
    if (disposed) return;
    await list.settle(await openSpendDialog({ api, campaigns, campaignId: campaignSelect.value || null }), 'Investimento lançado.');
  }

  async function edit(row) {
    await ensureCampaigns();
    if (disposed) return;
    await list.settle(await openSpendDialog({ api, spend: row, campaigns }), 'Investimento atualizado.');
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Excluir investimento?', message: `${money(row.amount)} de ${formatDateOnly(row.spentOn)} sai dos cálculos de CPL, CAC, ROAS e ROI. Esta ação não pode ser desfeita.`, confirmLabel: 'Excluir', tone: 'danger' });
    if (!ok || disposed) return;
    await list.mutate(() => api.delete(`/api/v1/marketing/spend/${encodeURIComponent(row.id)}`), 'Investimento excluído.');
  }

  campaignSelect.addEventListener('change', (event) => list.setFilters({ campaignId: event.target.value }));
  root.querySelector('#sp-period').addEventListener('change', (event) => {
    const { from, to } = periodRange(event.target.value);
    list.setFilters({ from, to });
  });
  root.querySelector('#new-spend').addEventListener('click', () => create());

  list.load();
  ensureCampaigns();

  return () => {
    disposed = true;
    list.dispose();
    disposeShell();
  };
}
