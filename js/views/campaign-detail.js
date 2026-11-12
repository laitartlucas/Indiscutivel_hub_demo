import { describeError } from '../lib/api.js';
import { money } from '../lib/finance.js';
import { mount } from '../lib/dom.js';
import { formatDateOnly } from '../lib/format.js';
import { html } from '../lib/html.js';
import { channelLabel, formatCount, rangeLabel, seriesBars } from '../lib/marketing.js';
import { buildQuery } from '../lib/query.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { MARKETING_EYEBROW, marketingTabs } from '../ui/marketing-tabs.js';
import { dataTable } from '../ui/table.js';
import { toast } from '../ui/toast.js';
import { bindPeriod, campaignBadge, loadCampaignChoices, metricsGrid, openCampaignDialog, openSpendDialog, periodButtons, readMarketingPeriod } from './marketing-ui.js';

function hero(c) {
  return html`<section class="od-hero mk-hero" aria-label="Resumo da campanha">
    <div class="od-hero-top">
      <div class="od-hero-main">
        <div class="lead-badges">${campaignBadge(c.status)}<span class="cc-responsible">${channelLabel(c.channel)}</span></div>
        <p class="od-closed muted">${rangeLabel(c.startsOn, c.endsOn)}</p>
        ${c.objective ? html`<p class="od-reason"><strong>Objetivo:</strong> ${c.objective}</p>` : ''}
        ${c.notes ? html`<p class="od-notes">${c.notes}</p>` : ''}
      </div>
    </div>
    <div class="od-actions">
      ${button({ label: 'Editar', variant: 'ghost', extra: { 'data-action': 'edit' } })}
      ${button({ label: c.archived ? 'Desarquivar' : 'Arquivar', variant: 'ghost', extra: { 'data-action': c.archived ? 'unarchive' : 'archive' } })}
      ${c.archived ? '' : button({ label: 'Lançar investimento', iconStart: icon('plus', { size: 16 }), extra: { 'data-action': 'add-spend' } })}
    </div>
  </section>`;
}

/** Últimos 6 meses: investimento e receita lado a lado (mesma escala); os leads ficam no rótulo. */
function seriesCard(series) {
  const bars = seriesBars(series);
  const hasData = bars.some((b) => b.inv > 0 || b.rev > 0 || b.leads > 0);
  return html`<section class="lead-card" aria-labelledby="mk-series-title">
    <div class="od-card-head"><h2 id="mk-series-title" class="lead-card-title">Últimos 6 meses</h2></div>
    <p class="mk-legend" aria-hidden="true"><span class="mk-swatch is-inv"></span>Investimento <span class="mk-swatch is-rev"></span>Receita atribuída</p>
    ${!hasData
      ? html`<p class="muted od-none">Ainda sem investimento, leads ou vendas nesta campanha.</p>`
      : html`<div class="mk-columns" aria-hidden="true">${bars.map(
          (b) => html`<div class="mk-col"><div class="mk-col-bars"><span class="mk-vbar is-inv" data-h="${b.invHeight}"></span><span class="mk-vbar is-rev" data-h="${b.revHeight}"></span></div><span class="mk-col-label">${b.label}</span><span class="mk-col-sub">${formatCount(b.leads)} ${b.leads === 1 ? 'lead' : 'leads'}</span></div>`,
        )}</div>
        <table class="sr-only"><caption>Investimento, leads e receita por mês</caption><thead><tr><th scope="col">Mês</th><th scope="col">Investimento</th><th scope="col">Leads</th><th scope="col">Receita</th></tr></thead>
          <tbody>${bars.map((b) => html`<tr><th scope="row">${b.label}</th><td>${money(b.investment ?? '0.00')}</td><td>${b.leads}</td><td>${money(b.revenue ?? '0.00')}</td></tr>`)}</tbody></table>`}
  </section>`;
}

function spendCard(c) {
  const spend = c.spend ?? [];
  const columns = [
    { key: 'spentOn', label: 'Data', nowrap: true, render: (s) => formatDateOnly(s.spentOn) },
    { key: 'description', label: 'Descrição', render: (s) => s.description || '—' },
    { key: 'channel', label: 'Canal', nowrap: true, optional: true, render: (s) => channelLabel(s.channel) },
    { key: 'amount', label: 'Valor', align: 'end', nowrap: true, render: (s) => money(s.amount) },
  ];
  return html`<section class="lead-card fin-card" aria-labelledby="mk-spend-title">
    <div class="od-card-head"><h2 id="mk-spend-title" class="lead-card-title">Investimentos</h2><a class="od-link-btn" href="#/marketing/investimentos">Ver todos</a></div>
    ${spend.length === 0 ? html`<p class="muted od-none">Nenhum investimento lançado nesta campanha.</p>` : dataTable({ caption: 'Investimentos da campanha', columns, rows: spend })}
  </section>`;
}

export function renderCampaignDetail({ root, session, api, navigate, params }) {
  const base = `/api/v1/campaigns/${encodeURIComponent(params.id)}`;
  let disposed = false;
  let seq = 0;
  let period = readMarketingPeriod();
  let campaign = null;
  let busy = false;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'marketing',
    heading: 'Campanha',
    eyebrow: html`${MARKETING_EYEBROW} · <a class="back-link" href="#/marketing/campanhas">← Campanhas</a>`,
    content: html`${marketingTabs('campaigns')}
      <div class="segments-row"><span class="segments-label" aria-hidden="true">Números de</span><div class="segments" role="group" aria-label="Período dos números" id="cd-period">${periodButtons(period)}</div></div>
      <div id="cd-page" aria-live="off">${skeleton(5)}</div>`,
  });

  const page = root.querySelector('#cd-page');
  const heading = root.querySelector('h1');

  async function load() {
    const mine = ++seq;
    if (!campaign) mount(page, skeleton(5));
    try {
      const fresh = await api.get(`${base}${buildQuery({ period })}`);
      if (disposed || mine !== seq) return;
      campaign = fresh;
      heading.textContent = fresh.name;
      mount(page, html`${hero(fresh)}${metricsGrid(fresh.metrics, { label: 'Indicadores da campanha no período' })}<div class="lead-grid"><div class="lead-side">${seriesCard(fresh.series)}</div><div class="lead-side">${spendCard(fresh)}</div></div>`);
      applySizes(page);
    } catch (error) {
      if (disposed || mine !== seq) return;
      campaign = null;
      heading.textContent = 'Campanha';
      mount(
        page,
        error?.status === 404
          ? html`<section class="lead-card">${emptyState({ iconName: 'megafone', title: 'Campanha não encontrada', message: 'O endereço pode estar incorreto.', action: html`<a class="btn btn-primary" href="#/marketing/campanhas">Voltar para Campanhas</a>` })}</section>`
          : html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar a campanha', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`,
      );
    }
  }

  async function settle(outcome, message) {
    if (disposed) return;
    if (outcome.saved) toast(message, { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load();
  }

  async function setArchived(on) {
    if (on) {
      const ok = await confirmDialog({ title: `Arquivar ${campaign.name}?`, message: 'A campanha sai das listas de escolha e não recebe investimentos novos. Os números continuam nos relatórios.', confirmLabel: 'Arquivar' });
      if (!ok || disposed) return;
    }
    try {
      await api.post(`${base}/${on ? 'archive' : 'unarchive'}`, { version: campaign.version });
      if (!disposed) toast(on ? 'Campanha arquivada.' : 'Campanha desarquivada.', { tone: 'success' });
    } catch (error) {
      if (!disposed) toast(describeError(error), { tone: 'danger' });
    }
    await load();
  }

  const actions = {
    edit: async () => settle(await openCampaignDialog({ api, campaign }), 'Campanha atualizada.'),
    archive: () => setArchived(true),
    unarchive: () => setArchived(false),
    'add-spend': async () => {
      const campaigns = await loadCampaignChoices(api);
      if (disposed) return;
      const list = campaigns.some((c) => c.id === campaign.id) ? campaigns : [...campaigns, campaign];
      await settle(await openSpendDialog({ api, campaigns: list, campaignId: campaign.id }), 'Investimento lançado.');
    },
  };

  page.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'retry') return void load();
    if (busy || !campaign || !Object.hasOwn(actions, target.dataset.action)) return;
    busy = true;
    try {
      await actions[target.dataset.action]();
    } finally {
      busy = false;
    }
  });
  bindPeriod(root.querySelector('#cd-period'), () => period, (next) => {
    period = next;
    load();
  });

  load();
  return () => {
    disposed = true;
    disposeShell();
  };
}
