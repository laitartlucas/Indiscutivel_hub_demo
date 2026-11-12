import { describeError } from '../lib/api.js';
import { money } from '../lib/finance.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { FORMULAS, OVERVIEW_NOTE, channelLabel, formatCount, formatPct, formatRoas, moneyOrDash, moneyPairs, rangeLabel, sourceBars } from '../lib/marketing.js';
import { buildQuery } from '../lib/query.js';
import { sourceLabel } from '../lib/sources.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { MARKETING_EYEBROW, marketingTabs } from '../ui/marketing-tabs.js';
import { dataTable } from '../ui/table.js';
import { bindPeriod, campaignHref, metricsGrid, periodButtons, readMarketingPeriod } from './marketing-ui.js';

/** "Como calculamos": todas as fórmulas, abertas sob demanda. */
export function formulasDisclosure() {
  return html`<details class="cc-filters mk-formulas">
    <summary class="cc-filters-summary">${icon('info', { size: 16 })}<span>Como calculamos</span></summary>
    <div class="mk-formulas-body">
      <dl class="mk-formula-list">${FORMULAS.map((f) => html`<div class="mk-formula"><dt>${f.term}</dt><dd>${f.text}</dd></div>`)}</dl>
      <p class="muted mk-formula-note">${OVERVIEW_NOTE} O período é o mês, o trimestre ou o ano de hoje, no horário de Brasília.</p>
    </div>
  </details>`;
}

function sourcesCard(overview) {
  const bars = sourceBars(overview.bySource, sourceLabel);
  return html`<section class="lead-card" aria-labelledby="mk-sources-title">
    <div class="od-card-head"><h2 id="mk-sources-title" class="lead-card-title">Leads por origem</h2></div>
    ${bars.length === 0
      ? emptyState({ title: 'Nenhum lead no período.', message: 'Os contatos criados no período aparecem aqui, agrupados pela origem.' })
      : html`<ul class="rp-sources">${bars.map(
          (b) => html`<li><span class="rp-source-name">${b.label}</span><span class="rp-source-track" aria-hidden="true"><span class="rp-source-fill mk-fill" data-w="${b.width}"></span></span><strong class="rp-source-count">${b.leads}</strong></li>`,
        )}</ul>`}
  </section>`;
}

/** Gráfico simples: por campanha, uma barra de investimento e outra de receita, na mesma escala. */
function chartCard(overview) {
  const rows = moneyPairs([
    { key: 'total', name: 'Total do período', investment: overview.metrics?.investment, revenue: overview.metrics?.revenue },
    ...(overview.byCampaign ?? []).map((c) => ({ key: c.campaignId, name: c.name, investment: c.metrics?.investment, revenue: c.metrics?.revenue })),
  ]);
  return html`<section class="lead-card" aria-labelledby="mk-chart-title">
    <div class="od-card-head"><h2 id="mk-chart-title" class="lead-card-title">Investimento x receita</h2></div>
    <p class="mk-legend" aria-hidden="true"><span class="mk-swatch is-inv"></span>Investimento <span class="mk-swatch is-rev"></span>Receita atribuída</p>
    ${rows.length === 0
      ? emptyState({ title: 'Nada para comparar ainda.', message: 'Lance investimentos e registre vendas para ver o retorno de cada campanha.' })
      : html`<ul class="mk-pairs">${rows.map(
          (r) => html`<li class="mk-pair">
            <span class="mk-pair-name">${r.name}</span>
            <span class="mk-pair-bars" aria-hidden="true"><span class="mk-bar is-inv" data-w="${r.invWidth}"></span><span class="mk-bar is-rev" data-w="${r.revWidth}"></span></span>
            <span class="mk-pair-values">${money(r.investment ?? '0.00')} → ${money(r.revenue ?? '0.00')}</span>
          </li>`,
        )}</ul>`}
  </section>`;
}

const CAMPAIGN_COLUMNS = [
  {
    key: 'name',
    label: 'Campanha',
    render: (r) => (r.campaignId ? html`<a class="cc-funnel-link mk-inline-link" href="${campaignHref(r.campaignId)}">${r.name}</a><span class="mk-sub">${channelLabel(r.channel)}</span>` : html`<strong>${r.name}</strong><span class="mk-sub">não atribuídas a campanha</span>`),
  },
  { key: 'investment', label: 'Investimento', align: 'end', nowrap: true, render: (r) => (r.campaignId ? money(r.metrics.investment) : '—') },
  { key: 'leads', label: 'Leads', align: 'end', nowrap: true, render: (r) => formatCount(r.metrics.leads) },
  { key: 'cpl', label: 'CPL', align: 'end', nowrap: true, optional: true, render: (r) => (r.campaignId ? moneyOrDash(r.metrics.cpl) : '—') },
  { key: 'sales', label: 'Vendas', align: 'end', nowrap: true, render: (r) => formatCount(r.metrics.sales) },
  { key: 'revenue', label: 'Receita', align: 'end', nowrap: true, render: (r) => money(r.metrics.revenue) },
  { key: 'cac', label: 'CAC', align: 'end', nowrap: true, optional: true, render: (r) => (r.campaignId ? moneyOrDash(r.metrics.cac) : '—') },
  { key: 'roas', label: 'ROAS', align: 'end', nowrap: true, render: (r) => (r.campaignId ? formatRoas(r.metrics.roas) : '—') },
];

function campaignsCard(overview) {
  const rows = (overview.byCampaign ?? []).map((c) => ({ ...c, metrics: c.metrics ?? {} }));
  const without = overview.withoutCampaign ?? { leads: 0, sales: 0, revenue: '0.00' };
  const all = [...rows, { campaignId: null, name: 'Sem campanha', metrics: { leads: without.leads ?? 0, sales: without.sales ?? 0, revenue: without.revenue ?? '0.00' } }];
  return html`<section class="lead-card cc-funnels-card" aria-labelledby="mk-campaigns-title">
    <div class="od-card-head"><h2 id="mk-campaigns-title" class="lead-card-title">Por campanha</h2><a class="od-link-btn" href="#/marketing/campanhas">Ver campanhas</a></div>
    ${rows.length === 0 && !Number(without.leads) && !Number(without.sales)
      ? emptyState({ title: 'Nenhuma campanha com números no período.', message: 'Crie uma campanha e escolha ela no cadastro do contato ou da oportunidade para atribuir leads e vendas.' })
      : dataTable({ caption: 'Indicadores por campanha no período, com a linha Sem campanha', columns: CAMPAIGN_COLUMNS, rows: all, rowKey: (r) => r.campaignId ?? 'sem-campanha', rowClass: (r) => (r.campaignId ? false : 'mk-row-total') })}
  </section>`;
}

const FUNNEL_COLUMNS = [
  { key: 'name', label: 'Funil', render: (r) => r.name },
  { key: 'leads', label: 'Leads', align: 'end', nowrap: true, render: (r) => formatCount(r.leads) },
  { key: 'opportunities', label: 'Oportunidades', align: 'end', nowrap: true, render: (r) => formatCount(r.opportunities) },
  { key: 'sales', label: 'Vendas', align: 'end', nowrap: true, render: (r) => formatCount(r.sales) },
  { key: 'revenue', label: 'Receita', align: 'end', nowrap: true, render: (r) => money(r.revenue ?? '0.00') },
];

function funnelsCard(overview) {
  const rows = (overview.byFunnel ?? []).filter((f) => Number(f.leads) || Number(f.opportunities) || Number(f.sales));
  return html`<section class="lead-card cc-funnels-card" aria-labelledby="mk-funnels-title">
    <div class="od-card-head"><h2 id="mk-funnels-title" class="lead-card-title">Por funil</h2></div>
    ${rows.length === 0
      ? emptyState({ title: 'Nenhum movimento por funil no período.', message: 'Leads contam pelo funil de entrada do contato.' })
      : dataTable({ caption: 'Indicadores por funil no período', columns: FUNNEL_COLUMNS, rows, rowKey: (r) => r.funnelId ?? r.name })}
  </section>`;
}

function instagramCard(entry) {
  return html`<section class="lead-card" aria-labelledby="mk-ig-title">
    <div class="od-card-head"><h2 id="mk-ig-title" class="lead-card-title">Instagram</h2><a class="od-link-btn" href="#/marketing/instagram">Lançar período</a></div>
    ${entry
      ? html`<dl class="mk-mini">
          <div><dt>Seguidores</dt><dd>${formatCount(entry.followers)}</dd></div>
          <div><dt>Alcance</dt><dd>${formatCount(entry.reach)}</dd></div>
          <div><dt>Engajamento</dt><dd>${formatPct(entry.engagementRate)}</dd></div>
        </dl>
        <p class="rp-foot">Último período lançado: ${rangeLabel(entry.periodStart, entry.periodEnd)}. Lançamento manual: nenhuma conta conectada.</p>`
      : html`<p class="muted od-none">Nenhum período lançado. Os números do Instagram são lançados à mão: nenhuma conta é conectada.</p>`}
  </section>`;
}

export function renderMarketingOverview({ root, session, api, navigate }) {
  let disposed = false;
  let seq = 0;
  let period = readMarketingPeriod();

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'marketing',
    heading: 'Marketing',
    eyebrow: MARKETING_EYEBROW,
    subtitle: 'Quanto você investe, quantos leads chegam e quanto volta em vendas.',
    actions: html`<a class="btn btn-ghost" href="#/marketing/investimentos">Lançar investimento</a><a class="btn btn-primary" href="#/marketing/campanhas">${icon('megafone', { size: 16 })}<span>Campanhas</span></a>`,
    content: html`${marketingTabs('overview')}
      <div class="cc-period-row">
        <div class="segments" role="group" aria-label="Período" id="mk-period">${periodButtons(period)}</div>
        <p class="cc-period-range muted" id="mk-range" aria-live="polite"></p>
      </div>
      <div id="mk-overview" aria-live="off">${skeleton(6)}</div>`,
  });

  const region = root.querySelector('#mk-overview');
  const rangeEl = root.querySelector('#mk-range');

  async function load() {
    const mine = ++seq;
    region.setAttribute('aria-busy', 'true');
    mount(region, skeleton(6));
    try {
      const overview = await api.get(`/api/v1/marketing/overview${buildQuery({ period })}`);
      if (disposed || mine !== seq) return;
      rangeEl.textContent = overview?.period ? rangeLabel(overview.period.from, overview.period.to) : '';
      mount(
        region,
        html`${metricsGrid(overview.metrics)}${formulasDisclosure()}
          <div class="mk-grid">${sourcesCard(overview)}${chartCard(overview)}</div>
          ${campaignsCard(overview)}
          <div class="mk-grid">${funnelsCard(overview)}${instagramCard(overview.instagram ?? null)}</div>`,
      );
      applySizes(region);
    } catch (error) {
      if (disposed || mine !== seq) return;
      rangeEl.textContent = '';
      mount(region, html`<div class="card stack">${alert({ tone: 'danger', title: 'Não foi possível carregar o marketing', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`);
    }
    region.setAttribute('aria-busy', 'false');
  }

  bindPeriod(root.querySelector('#mk-period'), () => period, (next) => {
    period = next;
    load();
  });
  region.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) load();
  });

  load();
  return () => {
    disposed = true;
    disposeShell();
  };
}

