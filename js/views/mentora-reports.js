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
import { bindTabs, tabList, tabPanel } from '../ui/tabs.js';
import { dataTable, pager } from '../ui/table.js';
import { can } from '../lib/permissions.js';
import { PHASE_FILTER_OPTIONS } from '../lib/journey.js';
import { brl, milestoneLabel, monthShort, padGoldText } from '../lib/revenue.js';
import { money } from '../lib/finance.js';
import { formatRate } from '../lib/commercial.js';
import { formatCount, formatRoas, moneyOrDash } from '../lib/marketing.js';
import {
  commercialItems,
  financeItems,
  filterLabel,
  isBusinessPeriod,
  lastMonths,
  marketingItems,
  monthTotalsColumns,
  phaseBars,
  phaseChangeText,
  shortDate,
  valueBars,
} from '../lib/business.js';
import { barList, bindFilter, filterBar, kpiGroup, retryBlock } from './business-ui.js';
import { selfDeclaredBadge } from './revenue-ui.js';

// Relatórios da mentoria (kit M-Relatorios). A aba Engajamento traz SÓ sinais de mentoria: alunas ativas, engajamento, desafios,
// metas atingidas (contagem), uso por módulo (contagens), níveis e XP, sem nenhum R$. As abas da Entrega 7 (Alunas e fases,
// Desafios, Conquistas, Faturamento das alunas e Negócio das alunas) pedem cada uma a sua permissão; o faturamento é o
// autodeclarado e o negócio são somas agregadas por aluna (nunca nomes de clientes nem de campanhas).

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
          (t) => html`<li><a class="mr-top-row" href="#/alunas/${encodeURIComponent(t.id)}">
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

// ======================================================================================================================
// Abas da Entrega 7. "Alunas e fases", "Desafios" e "Conquistas" vêm de GET /mentora/reports/journey (reports.view, com
// filtro de período, turma e fase); "Faturamento das alunas" de GET /mentora/revenue (revenue.view); "Negócio das alunas"
// de GET /mentora/business (business.view). Cada aba só aparece com a permissão dela.
// ======================================================================================================================

const BUSINESS_LIMIT = 20;
const STALLED_DAYS = 90;

function journeyTabs(viewer) {
  return [
    { id: 'engajamento', label: 'Engajamento', show: true },
    { id: 'fases', label: 'Alunas e fases', show: true },
    { id: 'desafios', label: 'Desafios', show: true },
    { id: 'conquistas', label: 'Conquistas', show: true },
    { id: 'faturamento', label: 'Faturamento das alunas', show: can(viewer, 'revenue.view') },
    { id: 'negocio', label: 'Negócio das alunas', show: can(viewer, 'business.view') },
  ].filter((t) => t.show);
}
const JOURNEY_TABS = new Set(['fases', 'desafios', 'conquistas']);

// ---------- Alunas e fases ----------

const studentLink = (r) => (r.studentId ? html`<a class="cc-funnel-link" href="#/alunas/${encodeURIComponent(r.studentId)}">${r.studentName ?? '—'}</a>` : (r.studentName ?? '—'));

function phasesTab(data) {
  const bars = phaseBars(data.phases);
  const changes = Array.isArray(data.phaseChanges) ? data.phaseChanges : [];
  const stalled = Array.isArray(data.stalled) ? data.stalled : [];
  const total = bars.reduce((n, b) => n + b.count, 0);
  return html`<div class="rp-duo">
      <section class="growth-card" aria-labelledby="mj-phases-title">
        <div class="growth-card-head"><h2 id="mj-phases-title">Distribuição por fase</h2><span class="growth-card-note">alunas ativas hoje</span></div>
        ${total === 0
          ? emptyState({ title: 'Nenhuma aluna com fase registrada.', message: 'A fase é registrada por você no perfil de cada aluna.' })
          : barList({ caption: 'Alunas por fase da jornada', valueHeader: 'Alunas', rows: bars.map((b) => ({ label: `${String(b.phase).padStart(2, '0')} · ${b.label}`, value: b.count, width: b.width })) })}
      </section>
      <section class="growth-card" aria-labelledby="mj-stalled-title">
        <div class="growth-card-head"><h2 id="mj-stalled-title">Sem mudança de fase</h2><span class="growth-card-note">há mais de ${STALLED_DAYS} dias</span></div>
        ${stalled.length === 0
          ? emptyState({ title: 'Nenhuma aluna parada.', message: `Quem estiver na mesma fase há mais de ${STALLED_DAYS} dias aparece aqui.` })
          : dataTable({
              caption: `Alunas sem mudança de fase há mais de ${STALLED_DAYS} dias`,
              columns: [
                { key: 'name', label: 'Aluna', render: studentLink },
                { key: 'phase', label: 'Fase', nowrap: true, render: (r) => (r.phase ? `${String(r.phase).padStart(2, '0')} · ${r.label ?? r.phaseLabel ?? ''}`.trim() : '—') },
                { key: 'since', label: 'Desde', align: 'end', nowrap: true, render: (r) => shortDate(r.since ?? r.changedAt ?? r.at) },
                { key: 'days', label: 'Dias', align: 'end', nowrap: true, optional: true, render: (r) => (Number.isFinite(Number(r.days)) ? formatCount(r.days) : '—') },
              ],
              rows: stalled,
              rowKey: (r) => r.studentId ?? r.studentName,
            })}
      </section>
    </div>
    <section class="growth-card" aria-labelledby="mj-changes-title">
      <div class="growth-card-head"><h2 id="mj-changes-title">Mudanças de fase no período</h2><span class="growth-card-note">${formatCount(changes.length)} ${changes.length === 1 ? 'mudança' : 'mudanças'}</span></div>
      ${changes.length === 0
        ? emptyState({ title: 'Nenhuma mudança de fase no período.', message: 'Cada avanço que você registrar no perfil da aluna entra aqui.' })
        : dataTable({
            caption: 'Mudanças de fase no período: aluna, de qual fase para qual e quando',
            columns: [
              { key: 'name', label: 'Aluna', render: studentLink },
              { key: 'change', label: 'De → para', render: (r) => phaseChangeText(r) },
              { key: 'at', label: 'Data', align: 'end', nowrap: true, render: (r) => shortDate(r.changedAt ?? r.at) },
            ],
            rows: changes,
            rowKey: (r) => `${r.studentId ?? r.studentName}-${r.at ?? r.changedAt}`,
          })}
    </section>`;
}

// ---------- Desafios ----------

function challengesTab(data) {
  const rows = Array.isArray(data.challenges) ? data.challenges : [];
  return html`<section class="growth-card" aria-labelledby="mj-challenges-title">
    <div class="growth-card-head"><h2 id="mj-challenges-title">Desafios</h2><a class="od-link-btn" href="#/gestao/checkins">Ver check-ins</a></div>
    ${rows.length === 0
      ? emptyState({ title: 'Nenhum desafio no período.', message: 'Os desafios destinados às alunas aparecem aqui com a adesão de cada um.' })
      : dataTable({
          caption: 'Por desafio: alunas destinadas, inscritas, que concluíram, check-ins no período e aguardando retorno',
          columns: [
            { key: 'title', label: 'Desafio', render: (r) => r.title ?? '—' },
            { key: 'destined', label: 'Destinadas', align: 'end', nowrap: true, render: (r) => formatCount(r.destined ?? 0) },
            { key: 'enrolled', label: 'Inscritas', align: 'end', nowrap: true, render: (r) => formatCount(r.enrolled ?? 0) },
            { key: 'completed', label: 'Concluíram', align: 'end', nowrap: true, render: (r) => (r.completed === null || r.completed === undefined ? html`—<span class="sr-only"> (conclusão automática, medida no CRM da aluna)</span>` : formatCount(r.completed)) },
            { key: 'checkins', label: 'Check-ins no período', align: 'end', nowrap: true, optional: true, render: (r) => formatCount(r.checkinsInPeriod ?? 0) },
            { key: 'pending', label: 'Aguardando retorno', align: 'end', nowrap: true, render: (r) => formatCount(r.pendingFeedback ?? 0) },
          ],
          rows,
          rowKey: (r) => r.challengeId ?? r.id ?? r.title,
        })}
    <p class="rp-foot">Check-ins contados no período; "aguardando retorno" é a situação de hoje. "—" em Concluíram: o desafio tem ação automática, medida no CRM da aluna, que você não vê.</p>
  </section>`;
}

// ---------- Conquistas ----------

function achievementsTab(data, canRevenue) {
  const bars = valueBars((data.achievements ?? []).map((a) => ({ label: a.title ?? '—', value: a.unlocks ?? 0 }))).filter((b) => b.value > 0);
  const milestones = canRevenue && Array.isArray(data.milestones) ? data.milestones : null;
  return html`<div class="rp-duo">
    <section class="growth-card" aria-labelledby="mj-achv-title">
      <div class="growth-card-head"><h2 id="mj-achv-title">Desbloqueios por conquista</h2><span class="growth-card-note">no período</span></div>
      ${bars.length === 0
        ? emptyState({ title: 'Nenhuma conquista desbloqueada no período.', message: 'Cada desbloqueio das alunas entra na contagem da conquista.' })
        : barList({ caption: 'Desbloqueios por conquista no período', valueHeader: 'Desbloqueios', fill: 'rp-source-2', rows: bars.map((b) => ({ ...b, value: formatCount(b.value) })) })}
    </section>
    ${milestones
      ? html`<section class="growth-card" aria-labelledby="mj-ms-title">
          <div class="growth-card-head"><h2 id="mj-ms-title">Marcos de faturamento</h2>${selfDeclaredBadge()}</div>
          ${dataTable({
            caption: 'Marcos de faturamento: alcançados no período e em revisão',
            columns: [
              { key: 'label', label: 'Marco', render: (r) => r.label || milestoneLabel(r.milestone) },
              { key: 'reached', label: 'Alcançados', align: 'end', nowrap: true, render: (r) => formatCount(r.reached ?? 0) },
              { key: 'inReview', label: 'Em revisão', align: 'end', nowrap: true, render: (r) => formatCount(r.inReview ?? 0) },
            ],
            rows: milestones,
            rowKey: (r) => String(r.milestone),
          })}
          <p class="rp-foot">Os marcos vêm do faturamento que cada aluna declara, não das vendas do Comercial.</p>
        </section>`
      : ''}
  </div>`;
}

// ---------- Faturamento das alunas ----------

function revenueTab(series, current) {
  const cols = monthTotalsColumns(series);
  const summary = current?.summary ?? {};
  const rows = Array.isArray(current?.rows) ? current.rows : [];
  const anyMonth = cols.some((c) => c.height > 0);
  return html`<section class="fin-kpis" aria-label="Resumo do faturamento declarado">
      <div class="fin-kpi" role="group" aria-label="Acumulado declarado"><span class="lead-kpi-label">Acumulado declarado</span><span class="fin-kpi-value">${brl(summary.total ?? '0.00')}</span><span class="lead-kpi-note">desde a entrada de cada aluna</span></div>
      <div class="fin-kpi is-gold" role="group" aria-label="PAD GOLD"><span class="lead-kpi-label">PAD GOLD</span><span class="fin-kpi-value">${formatCount(summary.padGold ?? 0)}</span><span class="lead-kpi-note">alunas com R$ 100 mil declarados</span></div>
      <div class="fin-kpi" role="group" aria-label="Marcos em revisão"><span class="lead-kpi-label">Marcos em revisão</span><span class="fin-kpi-value">${formatCount(summary.inReview ?? 0)}</span><span class="lead-kpi-note">aguardando a sua revisão</span></div>
    </section>
    <section class="growth-card" aria-labelledby="mf-series-title">
      <div class="growth-card-head"><h2 id="mf-series-title">Faturamento declarado por mês</h2><span class="growth-card-note">soma das alunas · últimos 6 meses</span></div>
      ${!anyMonth
        ? emptyState({ title: 'Nenhum faturamento declarado nos últimos 6 meses.', message: 'Quando as alunas lançarem o faturamento do mês, a soma aparece aqui.' })
        : html`<div class="rp-cols" aria-hidden="true">${cols.map(
            (c) => html`<div class="rp-col"><span class="rp-col-value">${c.total === null || c.total === undefined ? '—' : brl(c.total)}</span><div class="rp-col-area mr-area"><div${attrs({ class: `rp-col-bar${c.current ? ' is-current' : ''}`, 'data-h': String(c.height) })}></div></div><span${attrs({ class: `rp-col-label${c.current ? ' is-current' : ''}` })}>${c.label}</span></div>`,
          )}</div>
          <div class="sr-only"><table><caption>Faturamento declarado pelas alunas, soma por mês</caption><thead><tr><th scope="col">Mês</th><th scope="col">Total declarado</th></tr></thead>
            <tbody>${cols.map((c) => html`<tr><th scope="row">${monthShort(c.month)}</th><td>${c.total === null || c.total === undefined ? 'indisponível' : brl(c.total)}</td></tr>`)}</tbody></table></div>`}
    </section>
    <section class="growth-card" aria-labelledby="mf-rows-title">
      <div class="growth-card-head"><h2 id="mf-rows-title">Acumulado por aluna</h2><a class="od-link-btn" href="#/faturamento-alunas">Ver lista completa</a></div>
      ${rows.length === 0
        ? emptyState({ title: 'Nenhuma aluna lançou faturamento ainda.', message: 'O faturamento é declarado por cada aluna em Meu faturamento.' })
        : dataTable({
            caption: 'Faturamento declarado por aluna: acumulado, mês corrente e PAD GOLD',
            columns: [
              { key: 'name', label: 'Aluna', render: studentLink },
              { key: 'total', label: 'Acumulado', align: 'end', nowrap: true, render: (r) => brl(r.total) },
              { key: 'month', label: 'Mês corrente', align: 'end', nowrap: true, render: (r) => (r.monthAmount === null || r.monthAmount === undefined ? 'não lançou' : brl(r.monthAmount)) },
              { key: 'pad', label: 'PAD GOLD', nowrap: true, optional: true, render: (r) => padGoldText(r.padGold) },
            ],
            rows,
            rowKey: (r) => r.studentId,
          })}
      ${Number.isInteger(current?.total) && current.total > rows.length ? html`<p class="rp-note">Mostrando ${rows.length} de ${current.total} alunas (maior acumulado primeiro).</p>` : ''}
    </section>
    <p class="rp-foot">Valores informados pelas próprias alunas (autodeclarados). É outra medida: não se soma às vendas nem aos recebimentos do Comercial.</p>`;
}

// ---------- Negócio das alunas ----------

const BUSINESS_COLUMNS = [
  { key: 'name', label: 'Aluna', render: studentLink },
  { key: 'leads', label: 'Leads', align: 'end', nowrap: true, render: (r) => formatCount(r.commercial?.newContacts ?? 0) },
  { key: 'open', label: 'Em negociação', align: 'end', nowrap: true, optional: true, render: (r) => html`${money(r.commercial?.open?.total ?? '0.00')}<span class="rp-sub">${formatCount(r.commercial?.open?.count ?? 0)} abertas</span>` },
  { key: 'won', label: 'Vendas ganhas', align: 'end', nowrap: true, render: (r) => html`${money(r.commercial?.won?.total ?? '0.00')}<span class="rp-sub">${formatCount(r.commercial?.won?.count ?? 0)} ganhas</span>` },
  { key: 'conv', label: 'Conversão', align: 'end', nowrap: true, optional: true, render: (r) => formatRate(r.commercial?.conversionRate) },
  { key: 'received', label: 'Recebido', align: 'end', nowrap: true, render: (r) => money(r.finance?.received ?? '0.00') },
  { key: 'overdue', label: 'Vencido', align: 'end', nowrap: true, optional: true, render: (r) => money(r.finance?.overdue ?? '0.00') },
  { key: 'investment', label: 'Investimento', align: 'end', nowrap: true, optional: true, render: (r) => money(r.marketing?.investment ?? '0.00') },
  { key: 'cpl', label: 'CPL', align: 'end', nowrap: true, optional: true, render: (r) => moneyOrDash(r.marketing?.cpl ?? null) },
  { key: 'roas', label: 'ROAS', align: 'end', nowrap: true, optional: true, render: (r) => formatRoas(r.marketing?.roas ?? null) },
];

function businessTab(data, offset) {
  const totals = data?.totals ?? {};
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number.isInteger(data?.total) ? data.total : rows.length;
  const info = { from: total === 0 ? 0 : offset + 1, to: offset + rows.length, hasPrev: offset > 0, hasNext: offset + rows.length < total };
  return html`<div class="biz-groups">
      ${kpiGroup({ id: 'mrb-c', title: 'Comercial', items: commercialItems(totals.commercial) })}
      ${kpiGroup({ id: 'mrb-f', title: 'Financeiro', items: financeItems(totals.finance) })}
      ${kpiGroup({ id: 'mrb-m', title: 'Marketing', items: marketingItems(totals.marketing) })}
    </div>
    <section class="growth-card" aria-labelledby="mrb-rows-title">
      <div class="growth-card-head"><h2 id="mrb-rows-title">Por aluna</h2><span class="growth-card-note">maior valor de vendas ganhas primeiro</span></div>
      ${rows.length === 0
        ? emptyState({ title: 'Nenhuma aluna para mostrar.', message: 'Os números de negócio aparecem quando as alunas usarem o Comercial, o Financeiro e o Marketing.' })
        : html`${dataTable({ caption: 'Indicadores de negócio por aluna no período, só números agregados', columns: BUSINESS_COLUMNS, rows, dense: true, rowKey: (r) => r.studentId })}${pager({ info, total })}`}
    </section>
    <p class="rp-foot">Somas por natureza: comercial, financeiro e marketing não se somam entre si. Taxas (conversão, CPL, CAC, ROAS) recalculadas a partir das somas. Nunca nomes de clientes, de campanhas ou descrições de vendas.</p>`;
}

// ---------- tela ----------

function engagementPanel(period, turma) {
  return html`<div class="growth rp-scope" aria-label="Relatório da mentoria">
    <div class="rp-toolbar"><div class="mr-filters"><div id="mr-period">${periodSwitch(period)}</div><div id="mr-turma-host">${turmaSelect([], turma)}</div></div>${button({ label: 'Exportar relatório', id: 'mr-export', disabled: true, iconStart: icon('download', { size: 16, stroke: 2 }) })}</div>
    <p class="rp-compare" id="mr-compare" role="status"></p>
    <div id="mr-region" class="growth" aria-busy="true">${skeleton(5)}</div>
  </div>`;
}

const tabPanelBody = (id) => html`<div class="rp-panel rp-scope">
  <div class="rp-toolbar"><div class="biz-filter" data-filter-host="${id}"></div><p class="muted biz-range" data-range="${id}" aria-live="polite"></p></div>
  <div class="rp-panel" data-region="${id}" aria-busy="true"></div>
</div>`;

function journeyFilters({ period, phase, className, classNames }) {
  const classOptions = [{ value: '', label: 'Todas as turmas' }, ...classNames.map((name) => ({ value: name, label: name })), { value: NO_CLASS, label: 'Sem turma' }];
  if (className && !classOptions.some((o) => o.value === className)) classOptions.splice(1, 0, { value: className, label: className });
  return html`${filterBar({ prefix: 'mj', filter: { period, month: '' }, label: 'Período do relatório' })}
    <div class="mr-filters">${selectField({ id: 'mj-class', label: 'Turma da jornada', name: 'className', value: className, options: classOptions })}${selectField({ id: 'mj-phase', label: 'Fase', name: 'phase', value: phase, options: PHASE_FILTER_OPTIONS })}</div>`;
}

export function renderMentoraReports({ root, session, api, navigate }) {
  const viewer = session.state.user;
  const tabs = journeyTabs(viewer);
  const canRevenue = can(viewer, 'revenue.view');
  let disposed = false;
  let generation = 0;
  let period = isPeriod(hashParam('period')) ? hashParam('period') : DEFAULT_PERIOD;
  let turma = hashParam('turma');
  let classNames = [];
  let report = null;
  let tab = tabs.some((t) => t.id === hashParam('aba')) ? hashParam('aba') : 'engajamento';
  // Filtros das abas novas (período mês/trimestre/ano; turma e fase só na jornada).
  let jPeriod = isBusinessPeriod(hashParam('periodo')) ? hashParam('periodo') : 'month';
  let jPhase = /^[1-4]$/.test(hashParam('fase') ?? '') ? hashParam('fase') : '';
  let jClass = hashParam('turmaJornada') ?? '';
  let businessOffset = 0;
  const loaded = new Set();
  const seqs = {};

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'mentora-reports',
    heading: 'Relatórios da mentoria',
    eyebrow: 'Análises',
    content: html`<div class="rp-tabs">${tabList({ prefix: 'mr', label: 'Relatórios da mentoria', tabs, current: tab })}</div>
      ${tabs.map((t) => tabPanel({ prefix: 'mr', id: t.id, current: tab, content: t.id === 'engajamento' ? engagementPanel(period, turma) : tabPanelBody(t.id) }))}`,
  });
  const region = root.querySelector('#mr-region');
  const compare = root.querySelector('#mr-compare');
  const exportButton = root.querySelector('#mr-export');
  const periodHost = root.querySelector('#mr-period');
  const turmaHost = root.querySelector('#mr-turma-host');

  function syncHash() {
    const query =
      tab === 'engajamento'
        ? buildQuery({ period, turma })
        : buildQuery({ aba: tab, periodo: tab === 'faturamento' ? '' : jPeriod, ...(JOURNEY_TABS.has(tab) ? { fase: jPhase, turmaJornada: jClass } : {}) });
    window.history.replaceState(null, '', `#/relatorios-mentoria${query}`);
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
      // As abas da jornada já abertas (ex.: pelo endereço) foram montadas antes de as turmas chegarem: repinta o filtro delas.
      for (const tab of JOURNEY_TABS) {
        const host = hostOf(tab, 'data-filter-host');
        if (!host || !host.childElementCount) continue;
        const active = host.contains(document.activeElement) && document.activeElement.id ? `#${document.activeElement.id}` : undefined;
        paintFilter(tab, active);
      }
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
            <p class="rp-foot">Números calculados a partir de sinais de mentoria: dias com atividade, contagens, níveis e XP. Esta aba não mostra valores monetários nem dados do CRM das alunas.</p>`,
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

  // ---------- abas novas ----------

  const hostOf = (id, attr) => root.querySelector(`[${attr}="${id}"]`);
  let journey = null; // a mesma resposta serve às três abas da jornada (mesmos filtros)

  async function loadJourney() {
    if (!journey) journey = api.get(`/api/v1/mentora/reports/journey${buildQuery({ period: jPeriod, phase: jPhase, className: jClass })}`);
    try {
      return await journey;
    } catch (error) {
      journey = null;
      throw error;
    }
  }

  const LOADERS = {
    fases: async () => phasesTab(await loadJourney()),
    desafios: async () => challengesTab(await loadJourney()),
    conquistas: async () => achievementsTab(await loadJourney(), canRevenue),
    async faturamento() {
      const months = lastMonths(6);
      const current = months[months.length - 1];
      const results = await Promise.all(
        months.map((m) =>
          api.get(`/api/v1/mentora/revenue${buildQuery({ month: m, limit: m === current ? 20 : 1, offset: 0 })}`).then(
            (r) => r,
            (error) => (m === current ? Promise.reject(error) : null),
          ),
        ),
      );
      const series = months.map((m, i) => ({ month: m, total: results[i]?.summary?.monthTotal ?? null }));
      return revenueTab(series, results[results.length - 1]);
    },
    async negocio() {
      const data = await api.get(`/api/v1/mentora/business${buildQuery({ period: jPeriod, limit: BUSINESS_LIMIT, offset: businessOffset })}`);
      return businessTab(data, businessOffset);
    },
  };

  function paintFilter(id, focusSelector) {
    const host = hostOf(id, 'data-filter-host');
    if (!host) return;
    if (JOURNEY_TABS.has(id)) mount(host, journeyFilters({ period: jPeriod, phase: jPhase, className: jClass, classNames }));
    else if (id === 'negocio') mount(host, filterBar({ prefix: 'mrb', filter: { period: jPeriod, month: '' }, label: 'Período do relatório' }));
    else mount(host, html`<p class="rp-note">Últimos 6 meses, pelo mês de cada lançamento.</p>`);
    if (focusSelector) host.querySelector(focusSelector)?.focus();
  }

  async function loadTab(id) {
    if (!Object.hasOwn(LOADERS, id)) return;
    const mine = (seqs[id] = (seqs[id] ?? 0) + 1);
    loaded.add(id);
    const target = hostOf(id, 'data-region');
    const rangeEl = hostOf(id, 'data-range');
    target.setAttribute('aria-busy', 'true');
    mount(target, skeleton(5));
    try {
      const view = await LOADERS[id]();
      if (disposed || mine !== seqs[id]) return;
      rangeEl.textContent = id === 'faturamento' ? '' : filterLabel({ period: jPeriod, month: '' });
      mount(target, view);
      applySizes(target);
    } catch (error) {
      if (disposed || mine !== seqs[id]) return;
      rangeEl.textContent = '';
      mount(target, retryBlock(error, id));
    }
    target.setAttribute('aria-busy', 'false');
  }

  /** Troca de filtro das abas novas: as abas que usam o filtro recarregam (a atual já, as outras quando abertas). */
  function filtersChanged(id, focusSelector) {
    journey = null;
    businessOffset = 0;
    for (const other of [...loaded]) if (other !== 'faturamento') loaded.delete(other);
    syncHash();
    paintFilter(id, focusSelector);
    loadTab(id);
  }

  for (const t of tabs.filter((x) => x.id !== 'engajamento')) {
    const panel = root.querySelector(`#mr-panel-${t.id}`);
    const host = hostOf(t.id, 'data-filter-host');
    bindFilter(host, () => ({ period: jPeriod, month: '' }), (next, focusSelector) => {
      jPeriod = next.period;
      filtersChanged(t.id, focusSelector);
    });
    host.addEventListener('change', (event) => {
      if (event.target.id === 'mj-class') jClass = event.target.value;
      else if (event.target.id === 'mj-phase') jPhase = event.target.value;
      else return;
      filtersChanged(t.id, `#${event.target.id}`);
    });
    panel.addEventListener('click', (event) => {
      const retry = event.target.closest('[data-action="retry"]');
      if (retry && retry.dataset.which === t.id) {
        if (JOURNEY_TABS.has(t.id)) journey = null;
        loadTab(t.id);
        return;
      }
      const page = event.target.closest('[data-page]');
      if (page && t.id === 'negocio' && !page.disabled) {
        businessOffset = Math.max(0, businessOffset + (page.dataset.page === 'next' ? BUSINESS_LIMIT : -BUSINESS_LIMIT));
        loadTab('negocio').then(() => panel.querySelector(`[data-page="${page.dataset.page}"]:not(:disabled)`)?.focus());
      }
    });
  }

  bindTabs(root.querySelector('#main'), (id) => {
    tab = id;
    syncHash();
    if (id === 'engajamento') return;
    paintFilter(id);
    if (!loaded.has(id)) loadTab(id);
  });

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
  if (tab !== 'engajamento') {
    paintFilter(tab);
    loadTab(tab);
  }

  return () => {
    disposed = true;
    dispose();
  };
}
