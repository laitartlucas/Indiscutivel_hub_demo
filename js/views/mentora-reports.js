import { describeError } from '../lib/api.js';
import { initials, mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { columnsOf, levelsSummary, mentoraCsvFilename, mentoraReportRows, moduleBars, reportKpis, studentsText } from '../lib/followup.js';
import { NO_CLASS } from '../lib/mentora.js';
import { buildQuery, hashParam } from '../lib/query.js';
import { DEFAULT_PERIOD, isPeriod, PERIODS, periodLong, rangeLabel, toCsv, variationSentence, variationText } from '../lib/reports.js';
import { icon } from '../ih-icons.js';
import { applySizes } from '../lib/widths.js';
import { renderShell } from '../shell.js';
import { alert, avatarContent, button, emptyState, selectField, skeleton } from '../ui/components.js';
import { toast } from '../ui/toast.js';

// Relatórios da mentoria (kit M-Relatorios). SÓ sinais de mentoria: alunas ativas, engajamento, desafios, metas atingidas
// (contagem), uso por módulo (contagens), níveis e XP. Não há faturamento nem nenhum valor em R$: a mentora não os lê.

const TREND_ICON = { up: 'chevronUp', down: 'chevronDown' };
const nf = new Intl.NumberFormat('pt-BR');

function kpiCard({ label, value, delta, note, dark }) {
  const trend = delta.kind === 'up' || delta.kind === 'down';
  return html`<div${attrs({ class: `rp-kpi${dark ? ' is-dark' : ''}`, role: 'group', 'aria-label': label })}>
    <span class="rp-kpi-label">${label}</span>
    <span class="rp-kpi-value">${value}</span>
    <span${attrs({ class: `rp-kpi-delta is-${delta.kind}` })}>${trend ? icon(TREND_ICON[delta.kind], { size: 14, stroke: 2 }) : ''}<span aria-hidden="true">${variationText(delta)}</span><span class="sr-only">${variationSentence(delta)} em relação ao período anterior</span></span>
    ${note ? html`<span class="rp-kpi-note">${note}</span>` : ''}
  </div>`;
}

function kpis(report) {
  return html`<div class="rp-kpis" id="mr-kpis">${reportKpis(report).map(kpiCard)}</div>`;
}

function modulesCard(report) {
  const bars = moduleBars(report.modules);
  return html`<section class="growth-card" aria-labelledby="mr-modules-title">
    <div class="growth-card-head"><h2 id="mr-modules-title">Uso por módulo</h2><span class="growth-card-note">alunas que usaram no período</span></div>
    <ul class="mr-mods">${bars.map(
      (m, i) => html`<li><div class="mr-mod-head"><span class="mr-mod-name">${m.label}</span><span class="mr-mod-val">${studentsText(m.students)} · ${m.pct}%</span></div>
        <div class="rp-track" aria-hidden="true"><div${attrs({ class: `rp-fill mr-fill-${(i % 7) + 1}`, 'data-w': String(m.width) })}></div></div></li>`,
    )}</ul>
    <div class="sr-only"><table><caption>Uso por módulo no período</caption><thead><tr><th scope="col">Módulo</th><th scope="col">Ações</th><th scope="col">Alunas</th><th scope="col">Parte das alunas</th></tr></thead>
      <tbody>${report.modules.map((m) => html`<tr><th scope="row">${m.label}</th><td>${m.actions}</td><td>${m.students}</td><td>${m.pct}%</td></tr>`)}</tbody></table></div>
    <p class="rp-foot">Só contagens: quantas alunas fizeram alguma coisa em cada módulo, sem mostrar o que foi feito.</p>
  </section>`;
}

function topCard(report) {
  const rows = report.topEvolution;
  return html`<section class="growth-card" aria-labelledby="mr-top-title">
    <h2 id="mr-top-title">Maior evolução no trimestre</h2>
    ${rows.length === 0
      ? emptyState({ title: 'Ninguém ganhou XP neste trimestre.', message: 'Quando as alunas pontuarem, as cinco que mais evoluíram aparecem aqui.' })
      : html`<ol class="mr-top">${rows.map(
          (t) => html`<li><a class="mr-top-row" href="#/alunas/${t.id}">
            <span class="mr-top-pos" aria-hidden="true">${t.position}</span>
            <span class="mp-hl-avatar" aria-hidden="true">${t.avatarUrl ? avatarContent(t.name, t.avatarUrl) : initials(t.name)}</span>
            <span class="mr-top-text"><span class="mr-top-name"><span class="sr-only">${t.position}º lugar: </span>${t.name}</span><span class="mr-top-sub">Nível ${String(t.level.n).padStart(2, '0')} · ${t.level.name}</span></span>
            <span class="mr-top-xp">+${nf.format(t.xpGained)} XP</span>
          </a></li>`,
        )}</ol>`}
  </section>`;
}

function goalsCard(report) {
  const cols = columnsOf(report.goalsByMonth, (g) => g.count);
  const total = cols.reduce((n, c) => n + c.value, 0);
  return html`<section class="growth-card" aria-labelledby="mr-goals-title">
    <div class="growth-card-head"><h2 id="mr-goals-title">Metas atingidas por mês</h2><span class="growth-card-note">últimos 6 meses</span></div>
    ${total === 0
      ? emptyState({ title: 'Nenhuma meta atingida nos últimos 6 meses.', message: 'Cada meta batida por uma aluna entra na contagem do mês.' })
      : html`<div class="rp-cols" aria-hidden="true">${cols.map(
          (c, i) => html`<div class="rp-col"><span class="rp-col-value">${c.value}</span><div class="rp-col-area mr-area"><div${attrs({ class: `rp-col-bar${i === cols.length - 1 ? ' is-current' : ''}`, 'data-h': String(c.height) })}></div></div><span${attrs({ class: `rp-col-label${i === cols.length - 1 ? ' is-current' : ''}` })}>${c.item.label}</span></div>`,
        )}</div>
        <div class="sr-only"><table><caption>Metas atingidas por mês</caption><thead><tr><th scope="col">Mês</th><th scope="col">Metas atingidas</th></tr></thead>
          <tbody>${report.goalsByMonth.map((g) => html`<tr><th scope="row">${g.label}</th><td>${g.count}</td></tr>`)}</tbody></table></div>`}
  </section>`;
}

function levelsCard(report) {
  const cols = columnsOf(report.levels, (l) => l.students);
  const total = cols.reduce((n, c) => n + c.value, 0);
  return html`<section class="growth-card" aria-labelledby="mr-levels-title">
    <div class="growth-card-head"><h2 id="mr-levels-title">Distribuição de níveis</h2><span class="growth-card-note">alunas por nível</span></div>
    ${total === 0
      ? emptyState({ title: 'Nenhuma aluna pontuou ainda.', message: 'Os níveis aparecem quando as alunas ganharem XP.' })
      : html`<div class="rp-cols" data-dense="true" role="img" aria-label="${levelsSummary(report.levels)}">${cols.map(
          (c) => html`<div class="rp-col"><span class="rp-col-value">${c.value || ''}</span><div class="rp-col-area mr-area"><div${attrs({ class: `rp-col-bar${c.item.n >= 9 ? ' is-current' : ''}`, 'data-h': String(c.height), title: `${studentsText(c.value)} no nível ${String(c.item.n).padStart(2, '0')}` })}></div></div><span class="rp-col-label">${String(c.item.n).padStart(2, '0')}</span></div>`,
        )}</div>
        <div class="sr-only"><table><caption>Alunas por nível</caption><thead><tr><th scope="col">Nível</th><th scope="col">Alunas</th></tr></thead>
          <tbody>${report.levels.map((l) => html`<tr><th scope="row">${String(l.n).padStart(2, '0')} ${l.name}</th><td>${l.students}</td></tr>`)}</tbody></table></div>`}
  </section>`;
}

function emptyReport() {
  return html`<section class="growth-card growth-empty">${emptyState({
    iconName: 'relatorios',
    title: 'Ainda não há alunas ativas para analisar',
    message: 'Quando suas alunas ativarem o acesso, os números e os gráficos aparecem aqui. Experimente outra turma.',
    action: html`<a class="btn btn-primary" href="#/alunas">Ver minhas alunas</a>`,
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

function turmaSelect(classNames, current) {
  const options = [{ value: '', label: 'Todas as turmas' }, ...classNames.map((name) => ({ value: name, label: name })), { value: NO_CLASS, label: 'Sem turma' }];
  if (current && !options.some((o) => o.value === current)) options.splice(1, 0, { value: current, label: current });
  return selectField({ id: 'mr-turma', label: 'Turma', value: current, options });
}

export function renderMentoraReports({ root, session, api, navigate }) {
  let disposed = false;
  let generation = 0;
  let period = isPeriod(hashParam('period')) ? hashParam('period') : DEFAULT_PERIOD;
  let turma = hashParam('turma');
  let classNames = [];
  let report = null;

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'mentora-reports',
    heading: 'Relatórios da mentoria',
    eyebrow: 'Análises',
    actions: button({ label: 'Exportar relatório', id: 'mr-export', disabled: true, iconStart: icon('download', { size: 16, stroke: 2 }) }),
    content: html`<div class="growth rp-scope" aria-label="Relatório da mentoria">
      <div class="mr-filters"><div id="mr-period">${periodSwitch(period)}</div><div id="mr-turma-host">${turmaSelect([], turma)}</div></div>
      <p class="rp-compare" id="mr-compare" role="status"></p>
      <div id="mr-region" class="growth" aria-busy="true">${skeleton(5)}</div>
    </div>`,
  });
  const region = root.querySelector('#mr-region');
  const compare = root.querySelector('#mr-compare');
  const exportButton = root.querySelector('#mr-export');
  const periodHost = root.querySelector('#mr-period');
  const turmaHost = root.querySelector('#mr-turma-host');

  function syncHash() {
    window.history.replaceState(null, '', `#/relatorios-mentoria${buildQuery({ period, turma })}`);
  }

  async function load() {
    const id = ++generation;
    report = null;
    exportButton.disabled = true;
    compare.textContent = '';
    region.setAttribute('aria-busy', 'true');
    mount(region, skeleton(5));
    try {
      const data = await api.get(`/api/v1/mentora/reports${buildQuery({ period, turma })}`);
      if (disposed || id !== generation) return;
      report = data;
      classNames = data.classNames;
      const hadFocus = turmaHost.contains(document.activeElement);
      mount(turmaHost, turmaSelect(classNames, turma));
      if (hadFocus) turmaHost.querySelector('select')?.focus();
      compare.textContent = `${periodLong(period)}: ${rangeLabel(data.range)} · comparado a ${rangeLabel(data.previousRange)}`;
      if (!data.hasData) {
        mount(region, emptyReport());
      } else {
        exportButton.disabled = false;
        mount(
          region,
          html`${kpis(data)}
            <div class="rp-split">${modulesCard(data)}${topCard(data)}</div>
            <div class="mr-duo">${goalsCard(data)}${levelsCard(data)}</div>
            <p class="rp-foot">Números calculados a partir de sinais de mentoria: dias com atividade, contagens, níveis e XP. Esta tela não mostra valores monetários nem dados do CRM das alunas.</p>`,
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
    const text = toCsv(mentoraReportRows(report));
    const blob = new window.Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = mentoraCsvFilename(report);
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
    syncHash();
    mount(periodHost, periodSwitch(period));
    periodHost.querySelector(`[data-period="${period}"]`)?.focus();
    load();
  });
  turmaHost.addEventListener('change', (event) => {
    if (event.target.id !== 'mr-turma') return;
    turma = event.target.value;
    syncHash();
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
