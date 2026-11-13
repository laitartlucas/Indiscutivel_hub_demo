import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery, hashParam } from '../lib/query.js';
import {
  csvFilename,
  DEFAULT_PERIOD,
  formatMoney,
  formatPercent,
  funnelRows,
  goalsText,
  isPeriod,
  outcomeColumns,
  PERIODS,
  periodLong,
  rangeLabel,
  rateVariation,
  reportRows,
  salesColumns,
  sourceBars,
  taskColumns,
  toCsv,
  variation,
  variationSentence,
  variationText,
} from '../lib/reports.js';
import { tzOffsetMinutes } from '../lib/tasks.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, emptyState, skeleton } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { bindTabs, tabList, tabPanel } from '../ui/tabs.js';
import { dataTable } from '../ui/table.js';
import { daysLabel, formatRate, funnelRows as commercialFunnelRows, moneyShort, overviewKpis } from '../lib/commercial.js';
import { dueRelative, installmentLabel, money, saleStatusLabel, saleStatusTone, todayIso } from '../lib/finance.js';
import { formatDateOnly } from '../lib/format.js';
import { channelLabel, formatCount, formatPct, instagramBars, rangeLabel as dayRange } from '../lib/marketing.js';
import { sourceLabel } from '../lib/sources.js';
import { filterLabel, filterQuery, monthBounds, normalizeFilter, seriesColumns, seriesIsEmpty, valueBars } from '../lib/business.js';
import { barList, bindFilter, filterBar, retryBlock } from './business-ui.js';
import { campaignsCard } from './marketing-overview.js';
import { metricsGrid } from './marketing-ui.js';

const TREND_ICON = { up: 'chevronUp', down: 'chevronDown' };

function kpiCard({ label, value, delta, note }) {
  const trend = delta.kind === 'up' || delta.kind === 'down';
  return html`<div class="rp-kpi" role="group" aria-label="${label}">
    <span class="rp-kpi-label">${label}</span>
    <span class="rp-kpi-value">${value}</span>
    <span${attrs({ class: `rp-kpi-delta is-${delta.kind}` })}>${trend ? icon(TREND_ICON[delta.kind], { size: 14, stroke: 2 }) : ''}<span aria-hidden="true">${variationText(delta)}</span><span class="sr-only">${variationSentence(delta)} em relação ao período anterior</span></span>
    ${note ? html`<span class="rp-kpi-note">${note}</span>` : ''}
  </div>`;
}

function kpis(report) {
  const k = report.kpis;
  const conv = k.conversionRate;
  return html`<div class="rp-kpis">
    ${kpiCard({ label: 'Vendas ganhas', value: formatMoney(k.salesWon.current), delta: variation(k.salesWon.current, k.salesWon.previous) })}
    ${kpiCard({ label: 'Oportunidades ganhas', value: k.dealsWon.current, delta: variation(k.dealsWon.current, k.dealsWon.previous) })}
    ${kpiCard({
      label: 'Taxa de conversão',
      value: formatPercent(conv.current),
      delta: rateVariation(conv.current, conv.previous),
      note: conv.current === null ? 'Nenhuma oportunidade ganha ou perdida' : 'ganhas ÷ (ganhas + perdidas)',
    })}
    ${kpiCard({ label: 'Novos leads', value: k.newLeads.current, delta: variation(k.newLeads.current, k.newLeads.previous) })}
  </div>`;
}

function salesChart(report) {
  const cols = salesColumns(report.buckets);
  const unit = report.granularity === 'month' ? 'mês' : 'bloco de 6 dias';
  return html`<section class="growth-card" aria-labelledby="rp-sales-title">
    <div class="growth-card-head"><h2 id="rp-sales-title">Evolução de vendas</h2><span class="growth-card-note">R$ ganhos por ${unit}</span></div>
    <div${attrs({ class: 'rp-cols', 'data-dense': cols.length > 6 ? 'true' : false })} aria-hidden="true">${cols.map(
      (c) => html`<div class="rp-col"><div class="rp-col-area"><div${attrs({ class: `rp-col-bar${c.current ? ' is-current' : ''}`, 'data-h': String(c.height) })}></div></div><span${attrs({ class: `rp-col-label${c.current ? ' is-current' : ''}` })}>${c.label}</span><span class="rp-col-value">${c.valueText}</span></div>`,
    )}</div>
    <div class="sr-only"><table><caption>Vendas ganhas por ${unit}</caption><thead><tr><th scope="col">Período</th><th scope="col">Vendas ganhas</th></tr></thead>
      <tbody>${report.buckets.map((b) => html`<tr><th scope="row">${b.label}</th><td>${formatMoney(b.sales)}</td></tr>`)}</tbody></table></div>
  </section>`;
}

function funnelCard(report) {
  const rows = funnelRows(report.funnel);
  return html`<section class="growth-card" aria-labelledby="rp-funnel-title">
    <h2 id="rp-funnel-title">Conversão por etapa</h2>
    ${report.funnel.cohort === 0
      ? emptyState({ title: 'Nenhuma oportunidade criada no período.', message: 'Quando você abrir oportunidades, o caminho de cada uma aparece aqui.' })
      : html`<ol class="rp-funnel">${rows.map(
          (r, i) => html`<li><div class="rp-funnel-head"><span class="rp-funnel-name">${r.label}</span><span class="rp-funnel-text">${r.text}</span></div>
            <div class="rp-track" aria-hidden="true"><div${attrs({ class: `rp-fill rp-fill-${i + 1}`, 'data-w': String(r.width) })}></div></div></li>`,
        )}</ol>
        <p class="rp-foot">Das ${report.funnel.cohort} ${report.funnel.cohort === 1 ? 'oportunidade criada' : 'oportunidades criadas'} no período, quantas chegaram a cada etapa.</p>`}
  </section>`;
}

function sourcesCard(report) {
  const bars = sourceBars(report.sources);
  return html`<section class="growth-card" aria-labelledby="rp-sources-title">
    <h2 id="rp-sources-title">Leads por origem</h2>
    ${bars.length === 0
      ? emptyState({ title: 'Nenhum lead novo no período.', message: 'Os leads que você cadastrar aparecem agrupados pela origem.' })
      : html`<ul class="rp-sources">${bars.map(
          (s, i) => html`<li><span class="rp-source-name">${s.label}</span><span class="rp-source-track" aria-hidden="true"><span${attrs({ class: `rp-source-fill rp-source-${Math.min(i, 4) + 1}`, 'data-w': String(s.width) })}></span></span><strong class="rp-source-count">${s.count}</strong></li>`,
        )}</ul>`}
  </section>`;
}

function outcomesCard(report) {
  const cols = outcomeColumns(report.buckets);
  const total = report.buckets.reduce((n, b) => n + b.won + b.lost, 0);
  const unit = report.granularity === 'month' ? 'mês' : 'bloco de 6 dias';
  return html`<section class="growth-card" aria-labelledby="rp-outcomes-title">
    <div class="growth-card-head"><h2 id="rp-outcomes-title">Oportunidades</h2>
      <p class="hist-legend" aria-hidden="true"><span class="hist-legend-item"><span class="rp-dot rp-dot-won"></span>Ganhas</span><span class="hist-legend-item"><span class="rp-dot rp-dot-lost"></span>Perdidas</span></p></div>
    ${total === 0
      ? emptyState({ title: 'Nenhuma oportunidade fechada.', message: 'Ganhas e perdidas do período aparecem aqui.' })
      : html`<div${attrs({ class: 'rp-cols rp-pairs', 'data-dense': cols.length > 6 ? 'true' : false })} aria-hidden="true">${cols.map(
          (c) => html`<div class="rp-col"><div class="rp-col-area rp-col-area-pair"><div${attrs({ class: 'rp-col-bar rp-won', 'data-h': String(c.wonHeight) })}></div><div${attrs({ class: 'rp-col-bar rp-lost', 'data-h': String(c.lostHeight) })}></div></div><span class="rp-col-label">${c.label}</span></div>`,
        )}</div>
        <div class="sr-only"><table><caption>Oportunidades ganhas e perdidas por ${unit}</caption><thead><tr><th scope="col">Período</th><th scope="col">Ganhas</th><th scope="col">Perdidas</th></tr></thead>
          <tbody>${report.buckets.map((b) => html`<tr><th scope="row">${b.label}</th><td>${b.won}</td><td>${b.lost}</td></tr>`)}</tbody></table></div>`}
  </section>`;
}

function tasksCard(report) {
  const t = report.tasks;
  const cols = taskColumns(report.buckets);
  return html`<section class="growth-card" aria-labelledby="rp-tasks-title">
    <h2 id="rp-tasks-title">Tarefas e produtividade</h2>
    ${t.onTimePct === null
      ? html`<p class="rp-big"><span class="rp-big-num">${t.done}</span><span class="rp-big-note">${t.done === 1 ? 'tarefa concluída' : 'tarefas concluídas'}</span></p>
        <p class="rp-foot">${t.done === 0 ? 'Nenhuma tarefa concluída no período.' : 'Sem prazos nas tarefas concluídas, não há como medir a entrega no prazo.'}</p>`
      : html`<p class="rp-big"><span class="rp-big-num">${t.onTimePct}%</span><span class="rp-big-note">entregues no prazo</span></p>`}
    ${t.done > 0 ? html`<div class="rp-cols rp-mini" aria-hidden="true">${cols.map((c) => html`<div class="rp-col"><div class="rp-col-area"><div${attrs({ class: `rp-col-bar${c.current ? ' is-current' : ''}`, 'data-h': String(c.height) })}></div></div></div>`)}</div>
      <div class="sr-only"><table><caption>Tarefas concluídas por ${report.granularity === 'month' ? 'mês' : 'bloco de 6 dias'}</caption><thead><tr><th scope="col">Período</th><th scope="col">Concluídas</th></tr></thead>
        <tbody>${report.buckets.map((b) => html`<tr><th scope="row">${b.label}</th><td>${b.tasksDone}</td></tr>`)}</tbody></table></div>` : ''}
    <div class="rp-card-foot"><span>${t.done} ${t.done === 1 ? 'concluída' : 'concluídas'}</span>${report.goals ? html`<span>${goalsText(report.goals)}</span>` : ''}</div>
  </section>`;
}

function emptyReport() {
  return html`<section class="growth-card growth-empty">${emptyState({
    iconName: 'relatorios',
    title: 'Ainda não há dados no período',
    message: 'Quando você ganhar ou perder oportunidades, cadastrar leads ou concluir tarefas, os números e os gráficos aparecem aqui. Experimente outro período.',
    action: html`<a class="btn btn-primary" href="#/comercial/contatos">Ver meus contatos</a>`,
  })}</section>`;
}

function errorBlock(error) {
  return html`<div class="stack">${alert({ tone: 'danger', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;
}

function periodSwitch(active) {
  return html`<div class="seg" role="group" aria-label="Período do relatório">${PERIODS.map(
    (p) => html`<button${attrs({ type: 'button', class: `seg-btn${p.value === active ? ' is-on' : ''}`, 'data-period': p.value, 'aria-pressed': p.value === active ? 'true' : 'false' })}>${p.label}</button>`,
  )}</div>`;
}


// ======================================================================================================================
// Abas da Entrega 7: Comercial e funis, Vendas e recebimentos, Marketing e campanhas. Cada aba usa os MESMOS endpoints dos
// módulos (nenhum cálculo novo no navegador); o filtro (mês, trimestre, ano ou um mês específico) vale para as três.
// ======================================================================================================================

const TABS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'comercial', label: 'Comercial e funis' },
  { id: 'vendas', label: 'Vendas e recebimentos' },
  { id: 'marketing', label: 'Marketing e campanhas' },
];
const isTab = (value) => TABS.some((t) => t.id === value);
const SERIES_MONTHS = [6, 12];
/**
 * Quantos meses o seletor "Mês específico" oferece (0 = desligado). Com um mês escolhido, os resumos recebem
 * `?period=month&month=AAAA-MM` e a lista de vendas usa o mesmo mês (monthBounds).
 */
const SPECIFIC_MONTHS = 12;

// ---------- Comercial e funis ----------

function commercialKpis(o) {
  return html`<section class="cc-kpis" aria-label="Indicadores comerciais do período">${overviewKpis(o).map(
    (k) => html`<div${attrs({ class: `cc-kpi${k.gold ? ' is-gold' : ''}`, role: 'group', 'aria-label': k.label })}><span class="lead-kpi-label">${k.label}</span><span class="cc-kpi-value">${k.value}</span><span class="lead-kpi-note">${k.note}</span></div>`,
  )}</section>`;
}

/** Contatos novos por origem (`bySource` do resumo comercial), da maior para a menor. */
function originCard(commercial) {
  const bars = valueBars(
    (commercial?.bySource ?? [])
      .map((s) => ({ label: s.label || sourceLabel(s.source), value: Number(s.count) || 0 }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label), 'pt-BR')),
  );
  return html`<section class="growth-card" aria-labelledby="rc-origin-title">
    <div class="growth-card-head"><h2 id="rc-origin-title">Contatos novos por origem</h2><span class="growth-card-note">${formatCount(commercial?.newContacts ?? 0)} no período</span></div>
    ${bars.length === 0
      ? emptyState({ title: 'Nenhum contato novo no período.', message: 'Os contatos que você cadastrar aparecem agrupados pela origem.' })
      : barList({ caption: 'Contatos novos por origem no período', valueHeader: 'Contatos', rows: bars.map((b) => ({ label: b.label, value: formatCount(b.value), width: b.width })) })}
  </section>`;
}

function lostReasonsCard(commercial) {
  const reasons = Array.isArray(commercial?.lostReasons) ? commercial.lostReasons : null;
  if (!reasons) return '';
  const bars = valueBars(reasons.map((r) => ({ label: r.reason || 'Sem motivo', value: r.count ?? 0 }))).filter((r) => r.value > 0);
  return html`<section class="growth-card" aria-labelledby="rc-lost-title">
    <div class="growth-card-head"><h2 id="rc-lost-title">Motivos de perda</h2><span class="growth-card-note">oportunidades perdidas no período</span></div>
    ${bars.length === 0
      ? emptyState({ title: 'Nenhuma oportunidade perdida no período.', message: 'Ao marcar uma oportunidade como perdida, o motivo entra aqui.' })
      : barList({ caption: 'Oportunidades perdidas por motivo', valueHeader: 'Oportunidades', fill: 'rp-source-5', rows: bars.map((b) => ({ ...b, value: formatCount(b.value) })) })}
  </section>`;
}

/** Etapas do funil: nas abertas, o que está nelas hoje; em ganha e perdida, o que fechou no período. */
const stageList = (stages) =>
  Array.isArray(stages) && stages.length
    ? html`<ul class="rp-stage-list" aria-label="Etapas">${stages.map((st) => html`<li>${st.name ?? 'Etapa'}: <strong>${formatCount(st.count ?? 0)}</strong>${Number(st.total) > 0 ? html` · ${moneyShort(st.total)}` : ''}</li>`)}</ul>`
    : '';

const FUNNEL_REPORT_COLUMNS = [
  { key: 'name', label: 'Funil', render: (r) => html`<a class="cc-funnel-link" href="#/comercial/pipeline/${encodeURIComponent(r.key ?? '')}">${r.name}</a>${stageList(r.stages)}` },
  { key: 'open', label: 'Abertas', align: 'end', nowrap: true, render: (r) => formatCount(r.open) },
  { key: 'won', label: 'Ganhas', align: 'end', nowrap: true, render: (r) => formatCount(r.won) },
  { key: 'lost', label: 'Perdidas', align: 'end', nowrap: true, render: (r) => formatCount(r.lost) },
  { key: 'wonTotal', label: 'Valor ganho', align: 'end', nowrap: true, render: (r) => moneyShort(r.wonTotal ?? '0.00') },
  { key: 'conversionRate', label: 'Conversão', align: 'end', nowrap: true, render: (r) => formatRate(r.conversionRate) },
];

function funnelTableCard(commercial) {
  const rows = commercialFunnelRows(commercial?.byFunnel);
  return html`<section class="growth-card" aria-labelledby="rc-funnels-title">
    <div class="growth-card-head"><h2 id="rc-funnels-title">Oportunidades por funil</h2><span class="growth-card-note">tempo médio até fechar: ${daysLabel(commercial?.avgDaysToClose)}</span></div>
    ${rows.length === 0
      ? emptyState({ title: 'Nenhuma oportunidade no período.', message: 'Abra oportunidades no Pipeline: cada funil aparece aqui com o que está aberto, ganho e perdido.', action: html`<a class="btn btn-ghost btn-sm" href="#/comercial/pipeline">Abrir pipeline</a>` })
      : dataTable({ caption: 'Oportunidades por funil no período: abertas, ganhas, perdidas, valor ganho e conversão', columns: FUNNEL_REPORT_COLUMNS, rows, rowKey: (r) => r.funnelId ?? r.key ?? r.name })}
    <p class="rp-foot">Conversão = ganhas ÷ (ganhas + perdidas). Nas etapas abertas, o que está nelas hoje; em ganha e perdida, o que fechou no período. Os números são os mesmos da Visão geral do Comercial.</p>
  </section>`;
}

function commercialTab(commercial) {
  const lost = lostReasonsCard(commercial);
  return html`${commercialKpis(commercial)}
    ${lost ? html`<div class="rp-duo">${originCard(commercial)}${lost}</div>` : originCard(commercial)}
    ${funnelTableCard(commercial)}`;
}

// ---------- Vendas e recebimentos ----------

function seriesCard(series, months) {
  const cols = seriesColumns(series?.rows);
  const switcher = html`<div class="segments" role="group" aria-label="Meses no gráfico">${SERIES_MONTHS.map((n) => html`<button${attrs({ type: 'button', class: 'segment', 'data-months': String(n), 'aria-pressed': String(n === months) })}>${n} meses</button>`)}</div>`;
  let body;
  if (!series) body = html`<p class="rp-note">Não foi possível carregar a série mensal agora.</p>`;
  else if (seriesIsEmpty(series.rows)) body = emptyState({ title: 'Nada contratado nem recebido nesses meses.', message: 'Registre vendas e pagamentos para ver a evolução mês a mês.' });
  else {
    body = html`<div${attrs({ class: 'rp-cols rp-pairs', 'data-dense': cols.length > 6 ? 'true' : false })} aria-hidden="true">${cols.map(
        (c) => html`<div class="rp-col"><div class="rp-col-area rp-col-area-pair"><div${attrs({ class: 'rp-col-bar rp-won', 'data-h': String(c.contractedHeight) })}></div><div${attrs({ class: 'rp-col-bar rp-received', 'data-h': String(c.receivedHeight) })}></div></div><span${attrs({ class: `rp-col-label${c.current ? ' is-current' : ''}` })}>${c.label}</span></div>`,
      )}</div>
      <div class="sr-only"><table><caption>Contratado e recebido por mês, últimos ${months} meses</caption><thead><tr><th scope="col">Mês</th><th scope="col">Contratado</th><th scope="col">Recebido</th><th scope="col">Vendas</th></tr></thead>
        <tbody>${cols.map((c) => html`<tr><th scope="row">${c.label}</th><td>${money(c.contracted)}</td><td>${money(c.received)}</td><td>${c.salesCount}</td></tr>`)}</tbody></table></div>`;
  }
  return html`<section class="growth-card" aria-labelledby="rv-series-title">
    <div class="growth-card-head"><h2 id="rv-series-title">Contratado × recebido por mês</h2>${switcher}</div>
    <p class="rp-legend" aria-hidden="true"><span class="rp-legend-item"><span class="rp-dot rp-dot-won"></span>Contratado</span><span class="rp-legend-item"><span class="rp-dot rp-dot-received"></span>Recebido</span></p>
    ${body}
    <p class="rp-foot">Contratado = vendas ativas fechadas no mês; recebido = pagamentos lançados no mês. São duas medidas diferentes: não se somam.</p>
  </section>`;
}

const SALE_COLUMNS = [
  { key: 'closedOn', label: 'Data', nowrap: true, render: (r) => formatDateOnly(r.closedOn) },
  { key: 'person', label: 'Venda', render: (r) => html`<a class="cc-funnel-link" href="#/comercial/vendas/${encodeURIComponent(r.id)}">${r.personName ?? '—'}</a><span class="rp-sub">${r.description ?? ''}</span>` },
  { key: 'finalValue', label: 'Valor', align: 'end', nowrap: true, render: (r) => money(r.finalValue ?? '0.00') },
  { key: 'received', label: 'Recebido', align: 'end', nowrap: true, optional: true, render: (r) => money(r.received ?? '0.00') },
  { key: 'status', label: 'Situação', nowrap: true, render: (r) => badge(saleStatusLabel(r.financialStatus), saleStatusTone(r.financialStatus)) },
];

function salesCard(sales) {
  const rows = Array.isArray(sales?.rows) ? sales.rows : [];
  const total = Number.isInteger(sales?.total) ? sales.total : rows.length;
  let body;
  if (!sales) body = html`<p class="rp-note">Não foi possível carregar a lista de vendas agora.</p>`;
  else if (rows.length === 0) body = emptyState({ title: 'Nenhuma venda no período.', message: 'Ao ganhar uma oportunidade, registre a venda para acompanhar o recebimento.' });
  else body = html`${dataTable({ caption: 'Vendas fechadas no período, as mais recentes primeiro', columns: SALE_COLUMNS, rows })}${total > rows.length ? html`<p class="rp-note">Mostrando as ${rows.length} mais recentes de ${total}.</p>` : ''}`;
  return html`<section class="growth-card" aria-labelledby="rv-sales-title">
    <div class="growth-card-head"><h2 id="rv-sales-title">Vendas do período</h2><a class="od-link-btn" href="#/comercial/vendas">Ver todas</a></div>
    ${body}
  </section>`;
}

function dueList(items, { empty, late = false }) {
  const today = todayIso();
  if (!items?.length) return html`<p class="muted od-none">${empty}</p>`;
  return html`<ul class="fin-mini">${items.map(
    (i) => html`<li><a class="fin-mini-item" href="${i.saleId ? `#/comercial/vendas/${encodeURIComponent(i.saleId)}` : '#/comercial/receber'}">
      <span class="fin-mini-main"><span class="fin-mini-name">${i.personName ?? '—'}</span><span${attrs({ class: `fin-mini-sub${late ? ' is-late' : ''}` })}>${installmentLabel(i.number)} · ${formatDateOnly(i.dueOn)} · ${dueRelative(i.dueOn, today)}</span></span>
      <span class="fin-mini-value">${money(i.remaining ?? i.amount)}</span></a></li>`,
  )}</ul>`;
}

function receivablesCard(finance, upcoming) {
  const upcomingRows = Array.isArray(upcoming?.rows) ? upcoming.rows : (finance?.upcoming ?? []);
  const upcomingTotal = Number.isInteger(upcoming?.total) ? upcoming.total : upcomingRows.length;
  return html`<section class="growth-card" aria-labelledby="rv-recv-title">
    <div class="growth-card-head"><h2 id="rv-recv-title">Contas a receber por situação</h2><a class="od-link-btn" href="#/comercial/receber">Abrir A receber</a></div>
    <dl class="mk-mini">
      <div><dt>A receber hoje</dt><dd>${money(finance?.receivable ?? '0.00')}</dd></div>
      <div><dt>Inadimplência</dt><dd>${money(finance?.overdue ?? '0.00')}</dd></div>
      <div><dt>Parcelas vencidas</dt><dd>${formatCount(finance?.overdueCount ?? 0)}</dd></div>
    </dl>
    <div class="rp-duo">
      <div><h3 class="fin-mini-title">Vencidas</h3>${dueList(finance?.overdueList, { empty: 'Nenhuma parcela vencida.', late: true })}</div>
      <div><h3 class="fin-mini-title">A vencer em 30 dias${upcomingTotal ? ` · ${upcomingTotal}` : ''}</h3>${dueList(upcomingRows.slice(0, 5), { empty: 'Nada vence nos próximos 30 dias.' })}</div>
    </div>
    <p class="rp-foot">A receber, inadimplência (o que já venceu e não foi pago) e as listas são a fotografia de hoje: não dependem do período.</p>
  </section>`;
}

function financeTiles(f) {
  const sales = Number(f?.salesCount ?? 0);
  return [
    { label: 'Contratado', value: money(f?.contracted ?? '0.00'), note: `${formatCount(sales)} ${sales === 1 ? 'venda' : 'vendas'} no período` },
    { label: 'Recebido', value: money(f?.received ?? '0.00'), note: 'pagamentos no período', gold: true },
    { label: 'Quitadas', value: formatCount(f?.settledCount ?? 0), note: 'vendas do período pagas por inteiro' },
    { label: 'Recebidas em parte', value: formatCount(f?.partialCount ?? 0), note: 'vendas do período' },
    { label: 'Canceladas', value: formatCount(f?.cancelledCount ?? 0), note: 'vendas do período' },
  ];
}

function metricStrip(tiles, label) {
  return html`<section class="fin-kpis" aria-label="${label}">${tiles.map(
    (k) => html`<div${attrs({ class: `fin-kpi${k.gold ? ' is-gold' : ''}`, role: 'group', 'aria-label': k.label })}><span class="lead-kpi-label">${k.label}</span><span class="fin-kpi-value">${k.value}</span><span class="lead-kpi-note">${k.note}</span></div>`,
  )}</section>`;
}

function salesTab({ finance, series, sales, upcoming, months }) {
  return html`${metricStrip(financeTiles(finance), 'Indicadores do financeiro no período')}
    ${seriesCard(series, months)}
    <div class="rp-duo">${salesCard(sales)}${receivablesCard(finance, upcoming)}</div>`;
}

// ---------- Marketing e campanhas ----------

const CHANNEL_COLUMNS = [
  { key: 'channel', label: 'Canal', render: (r) => (r.channel ? r.label || channelLabel(r.channel) : html`<strong>${r.label || 'Sem campanha'}</strong>`) },
  { key: 'investment', label: 'Investimento', align: 'end', nowrap: true, render: (r) => money(r.investment ?? '0.00') },
  { key: 'leads', label: 'Leads', align: 'end', nowrap: true, render: (r) => formatCount(r.leads ?? 0) },
  { key: 'sales', label: 'Vendas', align: 'end', nowrap: true, render: (r) => formatCount(r.sales ?? 0) },
  { key: 'revenue', label: 'Receita', align: 'end', nowrap: true, render: (r) => money(r.revenue ?? '0.00') },
];

/** Por canal (`byChannel` do resumo do Marketing); a linha sem canal ("Sem campanha") vem por último. */
function channelsCard(overview) {
  if (!Array.isArray(overview?.byChannel)) return '';
  const rows = overview.byChannel.filter((r) => Number(r.leads) || Number(r.sales) || Number(r.investment) || Number(r.revenue));
  return html`<section class="lead-card cc-funnels-card" aria-labelledby="rm-channels-title">
    <div class="od-card-head"><h2 id="rm-channels-title" class="lead-card-title">Por canal</h2></div>
    ${rows.length === 0
      ? emptyState({ title: 'Nenhum canal com números no período.', message: 'O canal vem da campanha e de cada investimento lançado.' })
      : dataTable({ caption: 'Indicadores por canal no período, com a linha Sem campanha', columns: CHANNEL_COLUMNS, rows, rowKey: (r) => r.channel ?? 'sem-campanha', rowClass: (r) => (r.channel ? false : 'mk-row-total') })}
  </section>`;
}

function instagramReportCard(instagram) {
  const rows = Array.isArray(instagram?.rows) ? instagram.rows : null;
  const bars = rows ? instagramBars(rows) : [];
  let body;
  if (!rows) body = html`<p class="rp-note">Não foi possível carregar os períodos do Instagram agora.</p>`;
  else if (rows.length === 0) body = emptyState({ title: 'Nenhum período lançado.', message: 'Os números do Instagram são lançados à mão: nenhuma conta é conectada.' });
  else {
    body = html`<p class="rp-legend" aria-hidden="true"><span class="rp-legend-item"><span class="rp-dot rp-dot-won"></span>Seguidores</span><span class="rp-legend-item"><span class="rp-dot rp-dot-received"></span>Alcance</span></p>
      <div class="rp-cols rp-pairs" aria-hidden="true">${bars.map(
        (b) => html`<div class="rp-col"><div class="rp-col-area rp-col-area-pair"><div${attrs({ class: 'rp-col-bar rp-won', 'data-h': String(b.followersHeight) })}></div><div${attrs({ class: 'rp-col-bar rp-received', 'data-h': String(b.reachHeight) })}></div></div><span class="rp-col-label">${formatDateOnly(b.periodEnd).slice(0, 5)}</span></div>`,
      )}</div>
      ${dataTable({
        caption: 'Períodos do Instagram lançados, do mais antigo ao mais recente',
        columns: [
          { key: 'period', label: 'Período', render: (r) => dayRange(r.periodStart, r.periodEnd) },
          { key: 'followers', label: 'Seguidores', align: 'end', nowrap: true, render: (r) => formatCount(r.followers) },
          { key: 'reach', label: 'Alcance', align: 'end', nowrap: true, render: (r) => formatCount(r.reach) },
          { key: 'engagement', label: 'Engajamento', align: 'end', nowrap: true, render: (r) => formatPct(r.engagementRate) },
        ],
        rows: bars,
        rowKey: (r) => r.id ?? r.periodStart,
      })}
      <p class="rp-foot">Seguidores e alcance têm escalas próprias: cada barra é relativa ao maior valor dela.</p>`;
  }
  return html`<section class="lead-card" aria-labelledby="rm-ig-title">
    <div class="od-card-head"><h2 id="rm-ig-title" class="lead-card-title">Instagram: últimos períodos</h2><a class="od-link-btn" href="#/marketing/instagram">Lançar período</a></div>
    ${body}
  </section>`;
}

function marketingTab(overview, instagram) {
  return html`${metricsGrid(overview?.metrics)}
    ${campaignsCard(overview ?? {})}
    ${channelsCard(overview)}
    ${instagramReportCard(instagram)}`;
}

// ---------- tela ----------

function summaryPanel(period) {
  return html`<div class="growth rp-scope" aria-label="Relatório do período">
    <div class="rp-toolbar"><div id="reports-period">${periodSwitch(period)}</div>${button({ label: 'Exportar relatório', id: 'reports-export', disabled: true, iconStart: icon('download', { size: 16, stroke: 2 }) })}</div>
    <p class="rp-compare" id="reports-compare" role="status"></p>
    <div id="reports-region" class="growth" aria-busy="true">${skeleton(5)}</div>
  </div>`;
}

const businessPanel = (id) => html`<div class="rp-panel rp-scope">
  <div class="rp-toolbar"><div data-filter-host="${id}"></div><p class="muted biz-range" data-range="${id}" aria-live="polite"></p></div>
  <div class="rp-panel" data-region="${id}" aria-busy="true"></div>
</div>`;

export function renderReports({ root, session, api, navigate }) {
  let disposed = false;
  let generation = 0;
  let period = isPeriod(hashParam('period')) ? hashParam('period') : DEFAULT_PERIOD;
  let report = null;
  let tab = isTab(hashParam('aba')) ? hashParam('aba') : 'resumo';
  let filter = normalizeFilter({ period: hashParam('periodo'), month: SPECIFIC_MONTHS ? hashParam('mes') : '' });
  let months = 6;
  const loaded = new Set();
  const seqs = {};

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'reports',
    heading: 'Relatórios',
    eyebrow: 'Análises',
    subtitle: 'Os números do seu negócio por período, com os mesmos cálculos de cada módulo.',
    content: html`<div class="rp-tabs">${tabList({ prefix: 'rp', label: 'Relatórios', tabs: TABS, current: tab })}</div>
      ${TABS.map((t) => tabPanel({ prefix: 'rp', id: t.id, current: tab, content: t.id === 'resumo' ? summaryPanel(period) : businessPanel(t.id) }))}`,
  });
  const region = root.querySelector('#reports-region');
  const compare = root.querySelector('#reports-compare');
  const exportButton = root.querySelector('#reports-export');
  const periodHost = root.querySelector('#reports-period');

  function paintPeriod() {
    mount(periodHost, periodSwitch(period));
  }

  // O endereço guarda a aba e o filtro (sem criar entrada no histórico nem disparar a navegação). No Resumo, o período dele.
  function syncHash() {
    const query = tab === 'resumo' ? (hashParam('period') || period !== DEFAULT_PERIOD ? buildQuery({ period }) : '') : buildQuery({ aba: tab, periodo: filter.month ? '' : filter.period, mes: filter.month });
    window.history.replaceState(null, '', `#/relatorios${query}`);
  }

  async function load() {
    const id = ++generation;
    report = null;
    exportButton.disabled = true;
    compare.textContent = '';
    region.setAttribute('aria-busy', 'true');
    mount(region, skeleton(5));
    try {
      const data = await api.get(`/api/v1/reports/overview${buildQuery({ period, tzOffset: tzOffsetMinutes() })}`);
      if (disposed || id !== generation) return;
      report = data;
      compare.textContent = `${periodLong(period)}: ${rangeLabel(data.range)} · comparado a ${rangeLabel(data.previousRange)}`;
      if (!data.hasData) {
        mount(region, emptyReport());
      } else {
        exportButton.disabled = false;
        mount(
          region,
          html`${kpis(data)}
            <div class="rp-split">${salesChart(data)}${funnelCard(data)}</div>
            <div class="rp-triple">${sourcesCard(data)}${outcomesCard(data)}${tasksCard(data)}</div>
            <p class="rp-foot">Números calculados a partir do seu CRM. A taxa de conversão usa as oportunidades ganhas e perdidas no período; o funil usa as oportunidades criadas nele.</p>`,
        );
      }
      applySizes(region);
    } catch (error) {
      if (disposed || id !== generation) return;
      mount(region, errorBlock(error));
    }
    region.setAttribute('aria-busy', 'false');
  }

  function exportCsv() {
    if (!report) return;
    const text = toCsv(reportRows(report));
    const blob = new window.Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFilename(report);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Relatório exportado em CSV.', { tone: 'success' });
  }

  // ---------- abas de negócio ----------

  const hostOf = (id, attr) => root.querySelector(`[${attr}="${id}"]`);

  const LOADERS = {
    async comercial() {
      const commercial = await api.get(`/api/v1/commercial/overview${buildQuery(filterQuery(filter))}`);
      return { range: commercial?.period, view: commercialTab(commercial) };
    },
    async vendas() {
      const q = filterQuery(filter);
      const [finance, series, upcoming] = await Promise.all([
        api.get(`/api/v1/finance/overview${buildQuery(q)}`),
        api.get(`/api/v1/finance/series${buildQuery({ months })}`).catch(() => null),
        api.get(`/api/v1/receivables${buildQuery({ status: 'upcoming', limit: 5 })}`).catch(() => null),
      ]);
      // A lista de vendas usa as mesmas datas do resumo do financeiro (data da venda dentro do período).
      const bounds = filter.month ? monthBounds(filter.month) : { from: String(finance?.period?.from ?? '').slice(0, 10), to: String(finance?.period?.to ?? '').slice(0, 10) };
      const sales = bounds?.from ? await api.get(`/api/v1/sales${buildQuery({ from: bounds.from, to: bounds.to, sort: 'closed_on', order: 'desc', limit: 10 })}`).catch(() => null) : null;
      return { range: finance?.period, view: salesTab({ finance, series, sales, upcoming, months }) };
    },
    async marketing() {
      const q = filterQuery(filter);
      const [overview, instagram] = await Promise.all([api.get(`/api/v1/marketing/overview${buildQuery(q)}`), api.get(`/api/v1/marketing/instagram${buildQuery({ limit: 6 })}`).catch(() => null)]);
      return { range: overview?.period, view: marketingTab(overview, instagram) };
    },
  };

  function paintFilter(id, focusSelector) {
    const host = hostOf(id, 'data-filter-host');
    mount(host, filterBar({ prefix: `rp-${id}`, filter, months: SPECIFIC_MONTHS, label: 'Período do relatório' }));
    if (focusSelector) host.querySelector(focusSelector)?.focus();
  }

  async function loadTab(id) {
    if (!Object.hasOwn(LOADERS, id)) return;
    const mine = (seqs[id] = (seqs[id] ?? 0) + 1);
    loaded.add(id);
    const target = hostOf(id, 'data-region');
    const rangeEl = hostOf(id, 'data-range');
    if (!hostOf(id, 'data-filter-host').childElementCount) paintFilter(id);
    target.setAttribute('aria-busy', 'true');
    mount(target, skeleton(5));
    try {
      const { range, view } = await LOADERS[id]();
      if (disposed || mine !== seqs[id]) return;
      rangeEl.textContent = range?.from ? `${filterLabel(filter)}: ${dayRange(range.from, range.to)}` : filterLabel(filter);
      mount(target, view);
      applySizes(target);
    } catch (error) {
      if (disposed || mine !== seqs[id]) return;
      rangeEl.textContent = '';
      mount(target, retryBlock(error, id));
    }
    target.setAttribute('aria-busy', 'false');
  }

  for (const t of TABS.filter((x) => x.id !== 'resumo')) {
    const panel = root.querySelector(`#rp-panel-${t.id}`);
    bindFilter(hostOf(t.id, 'data-filter-host'), () => filter, (next, focusSelector) => {
      filter = normalizeFilter(next);
      // O filtro vale para as três abas: as outras recarregam quando forem abertas.
      loaded.clear();
      syncHash();
      paintFilter(t.id, focusSelector);
      loadTab(t.id);
    });
    panel.addEventListener('click', (event) => {
      const retry = event.target.closest('[data-action="retry"]');
      if (retry && retry.dataset.which === t.id) {
        loadTab(t.id);
        return;
      }
      const choice = event.target.closest('[data-months]');
      if (choice && Number(choice.dataset.months) !== months) {
        months = Number(choice.dataset.months);
        loadTab('vendas').then(() => root.querySelector(`#rp-panel-vendas [data-months="${months}"]`)?.focus());
      }
    });
  }

  bindTabs(root.querySelector('#main'), (id) => {
    tab = id;
    syncHash();
    if (id === 'resumo') return;
    paintFilter(id);
    if (!loaded.has(id)) loadTab(id);
  });

  periodHost.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-period]');
    if (!choice || choice.dataset.period === period) return;
    period = choice.dataset.period;
    // O período fica no endereço (sem criar entrada no histórico nem disparar a navegação).
    window.history.replaceState(null, '', `#/relatorios?period=${period}`);
    paintPeriod();
    periodHost.querySelector(`[data-period="${period}"]`)?.focus();
    load();
  });
  exportButton.addEventListener('click', exportCsv);
  region.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) load();
  });
  load();
  if (tab !== 'resumo') loadTab(tab);

  return () => {
    disposed = true;
    dispose();
  };
}
