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
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { toast } from '../ui/toast.js';

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
    action: html`<a class="btn btn-primary" href="#/leads">Ver meus leads</a>`,
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

export function renderReports({ root, session, api, navigate }) {
  let disposed = false;
  let generation = 0;
  let period = isPeriod(hashParam('period')) ? hashParam('period') : DEFAULT_PERIOD;
  let report = null;

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'reports',
    heading: 'Relatórios',
    eyebrow: 'Análises',
    actions: html`<div id="reports-period">${periodSwitch(period)}</div>${button({ label: 'Exportar relatório', id: 'reports-export', disabled: true, iconStart: icon('download', { size: 16, stroke: 2 }) })}`,
    content: html`<div class="growth rp-scope" aria-label="Relatório do período">
      <p class="rp-compare" id="reports-compare" role="status"></p>
      <div id="reports-region" class="growth" aria-busy="true">${skeleton(5)}</div>
    </div>`,
  });
  const region = root.querySelector('#reports-region');
  const compare = root.querySelector('#reports-compare');
  const exportButton = root.querySelector('#reports-export');
  const periodHost = root.querySelector('#reports-period');

  function paintPeriod() {
    mount(periodHost, periodSwitch(period));
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

  return () => {
    disposed = true;
    dispose();
  };
}
