import { describeError } from '../lib/api.js';
import { PERIODS, formatRate, funnelRows, isPeriod, moneyShort, overviewKpis, statusBars } from '../lib/commercial.js';
import { dueRelative, financeKpis, installmentLabel, money, todayIso } from '../lib/finance.js';
import { formatDateOnly } from '../lib/format.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery, hashParam } from '../lib/query.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { COMMERCIAL_EYEBROW, commercialTabs } from '../ui/commercial-tabs.js';
import { dataTable } from '../ui/table.js';

const PERIOD_KEY = 'ih:commercial-period';

function readPeriod() {
  const fromHash = hashParam('periodo');
  if (isPeriod(fromHash)) return fromHash;
  try {
    const saved = globalThis.localStorage?.getItem(PERIOD_KEY);
    return isPeriod(saved) ? saved : 'month';
  } catch {
    return 'month';
  }
}

function savePeriod(value) {
  try {
    globalThis.localStorage?.setItem(PERIOD_KEY, value);
  } catch {
    // sem armazenamento: só não lembra do período
  }
}

function periodSwitch(current) {
  return html`${PERIODS.map((p) => html`<button${attrs({ type: 'button', class: 'segment', 'data-period': p.value, 'aria-pressed': String(p.value === current) })}>${p.label}</button>`)}`;
}

function kpis(overview) {
  return html`<section class="cc-kpis" aria-label="Indicadores do período">${overviewKpis(overview).map(
    (k) => html`<div${attrs({ class: `cc-kpi${k.gold ? ' is-gold' : ''}`, role: 'group', 'aria-label': k.label })}>
      <span class="lead-kpi-label">${k.label}</span>
      <span class="cc-kpi-value">${k.value}</span>
      <span class="lead-kpi-note">${k.note}</span>
    </div>`,
  )}</section>`;
}

function statusCard(overview) {
  const bars = statusBars(overview.byStatus);
  const total = bars.reduce((n, b) => n + b.count, 0);
  return html`<section class="lead-card" aria-labelledby="cc-status-title">
    <div class="od-card-head"><h2 id="cc-status-title" class="lead-card-title">Contatos por situação</h2><a class="od-link-btn" href="#/comercial/contatos">Ver contatos</a></div>
    ${total === 0
      ? emptyState({ title: 'Nenhum contato ainda.', message: 'Quando você cadastrar contatos, a divisão por situação aparece aqui.' })
      : html`<ul class="rp-sources cc-status-bars">${bars.map(
          (b) => html`<li><a class="rp-source-name cc-bar-link" href="#/comercial/contatos?status=${b.status}">${b.label}</a><span class="rp-source-track" aria-hidden="true"><span${attrs({ class: `rp-source-fill cc-fill-${b.status}`, 'data-w': String(b.width) })}></span></span><strong class="rp-source-count">${b.count}</strong></li>`,
        )}</ul>
        <p class="rp-foot">Situação de hoje: cliente tem ao menos uma compra; em negociação tem oportunidade aberta.</p>`}
  </section>`;
}

const FUNNEL_COLUMNS = [
  {
    key: 'name',
    label: 'Funil',
    render: (r) => html`<a class="cc-funnel-link" href="#/comercial/pipeline/${encodeURIComponent(r.key ?? '')}">${r.name}</a><span class="cc-funnel-bar" aria-hidden="true"><span class="cc-funnel-fill" data-w="${r.width}"></span></span>`,
  },
  { key: 'open', label: 'Em negociação', align: 'end', nowrap: true, render: (r) => String(r.open) },
  { key: 'won', label: 'Ganhas', align: 'end', nowrap: true, render: (r) => String(r.won) },
  { key: 'lost', label: 'Perdidas', align: 'end', nowrap: true, optional: true, render: (r) => String(r.lost) },
  { key: 'wonTotal', label: 'Valor ganho', align: 'end', nowrap: true, render: (r) => moneyShort(r.wonTotal ?? '0.00') },
  { key: 'conversionRate', label: 'Conversão', align: 'end', nowrap: true, render: (r) => formatRate(r.conversionRate) },
];

function funnelCard(overview) {
  const rows = funnelRows(overview.byFunnel);
  return html`<section class="lead-card cc-funnels-card" aria-labelledby="cc-funnels-title">
    <div class="od-card-head"><h2 id="cc-funnels-title" class="lead-card-title">Por funil</h2><a class="od-link-btn" href="#/comercial/pipeline">Abrir pipeline</a></div>
    ${rows.length === 0
      ? emptyState({ title: 'Nenhuma oportunidade no período.', message: 'Abra oportunidades no Pipeline: cada funil aparece aqui com o que está em negociação, ganho e perdido.' })
      : dataTable({ caption: 'Oportunidades por funil no período', columns: FUNNEL_COLUMNS, rows, rowKey: (r) => r.funnelId ?? r.key ?? r.name })}
  </section>`;
}

function miniList(items, { title, empty, late }) {
  const today = todayIso();
  return html`<div><h3 class="fin-mini-title">${title}</h3>${(items ?? []).length === 0
    ? html`<p class="muted od-none">${empty}</p>`
    : html`<ul class="fin-mini">${items.map(
        (i) => html`<li><a class="fin-mini-item" href="${i.saleId ? `#/comercial/vendas/${encodeURIComponent(i.saleId)}` : '#/comercial/receber'}">
          <span class="fin-mini-main"><span class="fin-mini-name">${i.personName ?? '—'}</span><span${attrs({ class: `fin-mini-sub${late ? ' is-late' : ''}` })}>${installmentLabel(i.number)} · ${formatDateOnly(i.dueOn)} · ${dueRelative(i.dueOn, today)}</span></span>
          <span class="fin-mini-value">${money(i.remaining ?? i.amount)}</span>
        </a></li>`,
      )}</ul>`}</div>`;
}

/** Bloco Financeiro (GET /finance/overview): contratado e recebido no período; a receber e vencido hoje. */
function financeCard(finance) {
  const head = html`<div class="od-card-head fin-overview-head"><h2 id="cc-finance-title" class="lead-card-title">Financeiro</h2><span class="row"><a class="od-link-btn" href="#/comercial/receber">A receber</a><a class="od-link-btn" href="#/comercial/vendas">Ver vendas</a></span></div>`;
  if (!finance) {
    return html`<section class="lead-card fin-overview" aria-labelledby="cc-finance-title">${head}<p class="muted od-none">Não foi possível carregar os números do financeiro agora.</p>${button({ label: 'Tentar de novo', variant: 'ghost', small: true, extra: { 'data-action': 'retry' } })}</section>`;
  }
  return html`<section class="lead-card fin-overview" aria-labelledby="cc-finance-title">${head}
    <div class="fin-kpis">${financeKpis(finance).map(
      (k) => html`<div${attrs({ class: `fin-kpi${k.gold ? ' is-gold' : ''}${k.bad ? ' is-bad' : ''}`, role: 'group', 'aria-label': k.label })}><span class="lead-kpi-label">${k.label}</span><span class="fin-kpi-value">${k.value}</span><span class="lead-kpi-note">${k.note}</span></div>`,
    )}</div>
    <div class="fin-overview-lists">
      ${miniList(finance.overdueList, { title: 'Vencidas', empty: 'Nenhuma parcela vencida.', late: true })}
      ${miniList(finance.upcoming, { title: 'A vencer', empty: 'Nada vence nos próximos dias.' })}
    </div>
    <p class="rp-foot">Fechar não é receber: o recebido vem só dos pagamentos lançados.</p>
  </section>`;
}

function rangeText(overview) {
  const from = overview?.period?.from;
  const to = overview?.period?.to;
  if (!from || !to) return '';
  const day = (v) => formatDateOnly(String(v).slice(0, 10));
  return `${day(from)} a ${day(to)}`;
}

export function renderCommercialOverview({ root, session, api, navigate }) {
  let disposed = false;
  let seq = 0;
  let period = readPeriod();

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'commercial',
    heading: 'Comercial',
    eyebrow: COMMERCIAL_EYEBROW,
    subtitle: 'Contatos, negociações e vendas em um só lugar.',
    actions: html`<a class="btn btn-ghost" href="#/comercial/contatos">${icon('contatos', { size: 16 })}<span>Contatos</span></a><a class="btn btn-primary" href="#/comercial/pipeline">${icon('pipeline', { size: 16 })}<span>Abrir pipeline</span></a>`,
    content: html`${commercialTabs('overview')}
      <div class="cc-period-row">
        <div class="segments" role="group" aria-label="Período" id="cc-period">${periodSwitch(period)}</div>
        <p class="cc-period-range muted" id="cc-range" aria-live="polite"></p>
      </div>
      <div id="cc-overview" aria-live="off">${skeleton(6)}</div>`,
  });

  const region = root.querySelector('#cc-overview');
  const periodEl = root.querySelector('#cc-period');
  const rangeEl = root.querySelector('#cc-range');

  async function load() {
    const mine = ++seq;
    region.setAttribute('aria-busy', 'true');
    mount(region, skeleton(6));
    try {
      // O financeiro é um bloco à parte: se só ele falhar, o resto da visão geral aparece normalmente.
      const [overview, finance] = await Promise.all([
        api.get(`/api/v1/commercial/overview${buildQuery({ period })}`),
        api.get(`/api/v1/finance/overview${buildQuery({ period })}`).catch(() => null),
      ]);
      if (disposed || mine !== seq) return;
      rangeEl.textContent = rangeText(overview);
      mount(region, html`${kpis(overview)}${financeCard(finance)}<div class="cc-overview-grid">${statusCard(overview)}${funnelCard(overview)}</div>`);
      applySizes(region);
    } catch (error) {
      if (disposed || mine !== seq) return;
      rangeEl.textContent = '';
      mount(region, html`<div class="card stack">${alert({ tone: 'danger', title: 'Não foi possível carregar a visão geral', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`);
    }
    region.setAttribute('aria-busy', 'false');
  }

  periodEl.addEventListener('click', (event) => {
    const option = event.target.closest('[data-period]');
    if (!option || option.dataset.period === period) return;
    period = option.dataset.period;
    savePeriod(period);
    for (const other of periodEl.querySelectorAll('[data-period]')) other.setAttribute('aria-pressed', String(other === option));
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
