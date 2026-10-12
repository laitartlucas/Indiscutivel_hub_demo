import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import {
  formatXp,
  heatCells,
  heatSummary,
  heatTitle,
  isEmpty,
  levelNumber,
  monthBars,
  monthName,
  monthSummary,
  paceText,
  recentWhen,
  xpBar,
} from '../lib/progress.js';
import { buildQuery } from '../lib/query.js';
import { tzOffsetMinutes } from '../lib/tasks.js';
import { applySizes } from '../lib/widths.js';
import { arcs, icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';

const BAR_SLOT = 640 / 6;
const BAR_WIDTH = 52;
const PLOT_TOP = 20;
const PLOT_BOTTOM = 220;

function levelCard(p) {
  const bar = xpBar(p);
  const pace = paceText(p);
  const nextLine = p.next ? `Próximo: Nível ${levelNumber(p.next.n)} · ${p.next.name}` : 'Você chegou ao último nível.';
  const [done, rest] = bar.max === null ? [bar.label, ''] : [formatXp(p.xp), ` / ${formatXp(bar.max)} XP`];
  return html`<section class="level-card" aria-labelledby="level-title">
    ${arcs(600, 260)}
    <div class="level-badge" aria-hidden="true"><span class="level-badge-cap">NÍVEL</span><span class="level-badge-num">${levelNumber(p.level.n)}</span></div>
    <div class="level-main">
      <div class="level-title-block"><h2 id="level-title" class="level-name"><span class="sr-only">Nível ${levelNumber(p.level.n)}: </span>${p.level.name}</h2><p class="level-next">${nextLine}</p></div>
      <div class="level-xp">
        <p class="level-xp-row"><strong>${done}</strong>${rest}</p>
        <div class="xp-track" role="progressbar" aria-valuemin="0" aria-valuemax="${bar.max ?? p.xp}" aria-valuenow="${p.xp}" aria-label="${bar.label} XP"><div${attrs({ class: 'xp-fill', 'data-w': String(bar.pct) })}></div></div>
      </div>
    </div>
    <div class="level-missing">
      <span class="level-missing-cap">${p.next ? 'FALTAM' : 'NÍVEL'}</span>
      <span class="level-missing-num">${p.next ? formatXp(p.next.missing) : 'Máximo'}</span>
      <span class="level-missing-note">${p.next ? html`XP${pace ? ` · ${pace}` : ''}` : 'Parabéns pela jornada.'}</span>
    </div>
  </section>`;
}

function statsRow(stats) {
  if (stats.length === 0) return '';
  return html`<div class="growth-stats">${stats.map(
    (s) => html`<a class="growth-stat" href="${s.href}"><span class="growth-stat-label">${s.label}</span><span class="growth-stat-value">${s.value}</span><span class="growth-stat-note">${s.note}</span></a>`,
  )}</div>`;
}

function monthlyChart(p) {
  const bars = monthBars(p.monthly, p.today);
  const rects = bars.map((b, i) => {
    const h = Math.round(((PLOT_BOTTOM - PLOT_TOP) * b.height) / 100);
    return html`<rect${attrs({ class: `bar-rect${b.current ? ' is-current' : ''}`, x: String(Math.round(i * BAR_SLOT + (BAR_SLOT - BAR_WIDTH) / 2)), y: String(PLOT_BOTTOM - h), width: String(BAR_WIDTH), height: String(h), rx: '6' })}></rect>`;
  });
  return html`<section class="growth-card" aria-labelledby="month-title">
    <div class="growth-card-head"><h2 id="month-title">Evolução mensal</h2><span class="growth-card-note">XP ganho por mês</span></div>
    <svg class="month-chart" viewBox="0 0 640 240" preserveAspectRatio="none" role="img" aria-label="${monthSummary(p.monthly)}">
      <g class="chart-grid"><line x1="0" y1="20" x2="640" y2="20"></line><line x1="0" y1="80" x2="640" y2="80"></line><line x1="0" y1="140" x2="640" y2="140"></line><line x1="0" y1="200" x2="640" y2="200"></line><line x1="0" y1="220" x2="640" y2="220" class="is-base"></line></g>
      ${rects}
    </svg>
    <ol class="month-labels" aria-hidden="true">${bars.map((b) => html`<li${attrs({ class: b.current ? 'is-current' : false })}>${b.label} · ${formatXp(b.xp)}</li>`)}</ol>
  </section>`;
}

function recentList(p) {
  const now = new Date();
  if (p.recent.length === 0) return emptyState({ title: 'Nada por aqui ainda.', message: 'Os pontos que você ganhar aparecem nesta lista.' });
  return html`<ul class="xp-recent">${p.recent.map(
    (r) => html`<li><span class="xp-recent-main"><span class="xp-recent-title">${r.title}</span><time class="xp-recent-time" datetime="${r.occurredAt}">${recentWhen(r.occurredAt, now)}</time></span><strong class="xp-recent-points">+${formatXp(r.points)} XP</strong></li>`,
  )}</ul>`;
}

function productivity(p) {
  const cells = heatCells(p.daily, p.today);
  return html`<section class="growth-card" aria-labelledby="heat-title">
    <div class="growth-card-head"><h2 id="heat-title">Produtividade</h2><span class="growth-card-note">12 semanas</span></div>
    <div class="heat" role="img" aria-label="${heatSummary(p.daily, p.today)}">${cells.map(
      (c) => html`<span${attrs({ class: `heat-cell${c.future ? ' is-future' : ''}`, 'data-level': c.future ? false : String(c.level), title: heatTitle(c) || false })}></span>`,
    )}</div>
    <p class="heat-legend" aria-hidden="true">Menos${[0, 1, 2, 3].map((l) => html`<span class="heat-cell" data-level="${l}"></span>`)}Mais</p>
    <div class="xp-recent-block"><h3 class="eyebrow eyebrow-muted">XP recente</h3>${recentList(p)}</div>
  </section>`;
}

function emptyProgress() {
  return html`<section class="growth-card growth-empty">${emptyState({
    iconName: 'progresso',
    title: 'Conclua uma tarefa para ganhar seus primeiros pontos',
    message: 'Cada ação real no sistema soma XP: concluir tarefas, cadastrar pessoas, registrar contatos com leads e fechar vendas.',
    action: html`<a class="btn btn-primary" href="#/tarefas">Ir para Tarefas</a>`,
  })}</section>`;
}

function errorBlock(error) {
  return html`<div class="stack">${alert({ tone: 'danger', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;
}

/** Números reais de apoio: metas do mês, XP do mês e tarefas dos últimos 7 dias. Cada um que falhar simplesmente não aparece. */
async function loadStats(api, p) {
  const tz = tzOffsetMinutes();
  const [goals, tasks] = await Promise.allSettled([
    api.get(`/api/v1/goals${buildQuery({ tzOffset: tz })}`),
    api.get(`/api/v1/tasks/summary${buildQuery({ tzOffset: tz })}`),
  ]);
  const stats = [];
  if (goals.status === 'fulfilled') {
    const list = goals.value.data;
    const reached = list.filter((g) => g.status === 'atingida').length;
    stats.push(
      list.length === 0
        ? { label: 'METAS', value: '—', note: 'Defina suas metas do mês', href: '#/metas' }
        : { label: 'METAS', value: `${reached} de ${list.length}`, note: reached === 1 ? 'atingida neste mês' : 'atingidas neste mês', href: '#/metas' },
    );
  }
  stats.push({ label: 'XP NO MÊS', value: formatXp(p.monthXp), note: `em ${monthName(p.monthly[p.monthly.length - 1].month)}`, href: '#/progresso' });
  if (tasks.status === 'fulfilled') {
    const n = tasks.value.doneThisWeek ?? 0;
    stats.push({ label: 'TAREFAS', value: String(n), note: n === 1 ? 'concluída nos últimos 7 dias' : 'concluídas nos últimos 7 dias', href: '#/tarefas' });
  }
  return stats;
}

export function renderProgress({ root, session, api, navigate }) {
  let disposed = false;
  let generation = 0;

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'progress',
    heading: 'Meu progresso',
    eyebrow: 'Crescimento',
    actions: html`<a class="btn btn-ghost" href="#/ranking">${icon('equipe', { size: 16 })}Evolução da comunidade</a>`,
    content: html`<div class="growth" id="progress-region" aria-busy="true">${skeleton(5)}</div>`,
  });
  const region = root.querySelector('#progress-region');

  async function load() {
    const id = ++generation;
    region.setAttribute('aria-busy', 'true');
    mount(region, skeleton(5));
    try {
      const p = await api.get(`/api/v1/progress${buildQuery({ tzOffset: tzOffsetMinutes() })}`);
      if (disposed || id !== generation) return;
      if (isEmpty(p)) {
        mount(region, html`${levelCard(p)}${emptyProgress()}`);
      } else {
        const stats = await loadStats(api, p);
        if (disposed || id !== generation) return;
        mount(region, html`${levelCard(p)}${statsRow(stats)}<div class="growth-split">${monthlyChart(p)}${productivity(p)}</div>`);
      }
      applySizes(region);
    } catch (error) {
      if (disposed || id !== generation) return;
      mount(region, errorBlock(error));
    }
    region.setAttribute('aria-busy', 'false');
  }

  region.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) load();
  });
  load();

  return () => {
    disposed = true;
    dispose();
  };
}
