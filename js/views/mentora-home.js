import { arcs, icon } from '../ih-icons.js';
import { describeError } from '../lib/api.js';
import { initials, mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { eyebrowDate, greeting, pack } from '../lib/dashboard.js';
import {
  activitySummary,
  attentionCountText,
  barHeights,
  dayLabel,
  evolutionNote,
  evolutionText,
  levelText,
  linePoints,
  pathOf,
  REASON_LABELS,
  ringDash,
} from '../lib/mentora.js';
import { applySizes } from '../lib/widths.js';
import { renderShell } from '../shell.js';
import { alert, avatarContent, button, emptyState, skeleton, statCard } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { copyLinkDialog } from './student-forms.js';
import { can } from '../lib/permissions.js';
import { renderTeamHome } from './team-home.js';

// Quem está vendo (a proprietária pode tudo; a equipe só o que o papel permite). O servidor confere de novo em cada rota.
let viewer = null;
const allowed = (key) => can(viewer, key);
// Ação do cartão "Precisa da sua atenção" -> permissão que ela exige.
const ACTION_PERMISSION = { resend_invite: 'students.manage', schedule: 'sessions.manage' };
const actionAllowed = (key) => !Object.hasOwn(ACTION_PERMISSION, key) || allowed(ACTION_PERMISSION[key]);

const SUBTITLE = 'Acompanhe quem já ativou o acesso e quem ainda precisa de um convite.';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Cartões de número do resumo (/mentora/summary), na ordem em que aparecem: [campo, rótulo, ícone].
const STATS = [
  ['totalStudents', 'Total de alunas', 'alunas'],
  ['activeStudents', 'Alunas ativas', 'check'],
  ['pendingInvites', 'Convites pendentes', 'mail'],
  ['expiredInvites', 'Convites expirados', 'clock'],
  ['neverAccessed', 'Nunca acessaram', 'eye'],
  ['accessedLast24h', 'Acessos nas últimas 24 h', 'acompanhamento'],
];
// Os dois cartões que vêm do painel (/mentora/overview).
const EXTRA_STATS = [
  ['atRisk', 'Em risco', 'alert', 'sem atividade há 7 dias ou desafio parado'],
  ['sessionsThisWeek', 'Sessões na semana', 'calendar', 'de segunda a domingo'],
];

/** Resposta do resumo com os seis números esperados; qualquer outra coisa não vira cartão. */
function isSummary(value) {
  return !!value && typeof value === 'object' && STATS.every(([key]) => Number.isInteger(value[key]) && value[key] >= 0);
}

function isOverview(value) {
  return !!value && typeof value === 'object' && !!value.hero && Array.isArray(value.evolution) && Array.isArray(value.activity) && !!value.attention && Array.isArray(value.attention.items) && !!value.kpis;
}

/** Mesmo padrão do Painel da aluna: alerta de erro com um botão "Tentar de novo" (`data-action="retry"`). */
function retryAlert(message = 'Não foi possível carregar agora. Tente de novo em instantes.', which = 'overview', label = '') {
  return html`<div class="stack">
    ${alert({ tone: 'danger', message })}
    <div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry', 'data-which': which, ...(label ? { 'aria-label': `Tentar de novo: ${label}` } : {}) } })}</div>
  </div>`;
}

function renderEmpty() {
  return html`<section class="dash-card mentora-empty" aria-label="Sua turma">${emptyState({
    iconName: 'alunas',
    title: 'Nenhuma aluna ainda',
    message: 'Quando você cadastrar suas alunas, o acompanhamento aparece aqui.',
    action: allowed('students.manage') ? html`<a class="btn btn-primary" href="#/alunas">Cadastrar a primeira aluna</a>` : undefined,
  })}</section>`;
}

// ---------------------------------------------------------------- cartão verde
function renderHero(overview) {
  const { hero } = overview;
  const gold = hero.evolutionPct !== null && hero.evolutionPct > 0;
  return html`<section class="dash-premium mp-green" aria-labelledby="mentora-hero-title">
    ${arcs()}
    <div class="dash-premium-main">
      <span class="eyebrow">Autoridade indiscutível</span>
      <h2 id="mentora-hero-title" class="sr-only">Você acompanha ${plural(hero.students, 'aluna', 'alunas')}.</h2>
      <div class="mp-numbers">
        <p class="mp-number"><span class="mp-number-value">${hero.students}</span><span class="mp-number-label">alunas</span></p>
        <p class="mp-number"><span class="mp-number-value">${hero.active}</span><span class="mp-number-label">ativas · acesso ativado</span></p>
        <p class="mp-number"><span${attrs({ class: `mp-number-value${gold ? ' is-gold' : ''}` })}>${evolutionText(hero.evolutionPct)}</span><span class="mp-number-label">${evolutionNote(hero.evolutionPct)}</span></p>
      </div>
      <a class="dash-cta" href="#/alunas">Ver minhas alunas${icon('arrowRight')}</a>
    </div>
    <div class="mp-ring" role="img" aria-label="Progresso médio até o próximo nível: ${hero.progressAvg}%">
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true"><circle class="mp-ring-track" cx="60" cy="60" r="50"></circle><circle${attrs({ class: 'mp-ring-fill', cx: '60', cy: '60', r: '50', 'stroke-dasharray': ringDash(hero.progressAvg), transform: 'rotate(-90 60 60)' })}></circle></svg>
      <span class="mp-ring-value" aria-hidden="true">${hero.progressAvg}%</span>
      <span class="mp-ring-label" aria-hidden="true">progresso médio</span>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- precisa da sua atenção
const REASON_ICONS = { invite_expired: 'mail', never_accessed: 'eye', inactive: 'clock', stalled_challenge: 'desafios', blocked: 'lock' };
const REASON_TONES = { invite_expired: 'warn', never_accessed: 'warn', inactive: 'bad', stalled_challenge: 'warn', blocked: 'bad' };

function attentionRow(item) {
  const permitted = item.actions.filter((a) => a.key === 'view' || actionAllowed(a.key));
  const primary = permitted[0] ?? item.actions.find((a) => a.key === 'view') ?? item.actions[0];
  const secondary = permitted.slice(1);
  const primaryButton =
    primary.key === 'view'
      ? html`<a class="btn btn-ghost btn-sm" href="${item.link}" aria-label="Ver aluna: ${item.name}">${primary.label}</a>`
      : button({ label: primary.label, variant: 'ghost', small: true, extra: { 'data-action': primary.key, 'data-id': item.id, 'aria-label': `${primary.label}: ${item.name}` } });
  return html`<li class="mp-attn-row">
    <span${attrs({ class: `mp-attn-icon is-${REASON_TONES[item.reason] ?? 'warn'}`, 'aria-hidden': 'true' })}>${icon(REASON_ICONS[item.reason] ?? 'alert', { size: 17 })}</span>
    <span class="mp-attn-text">
      <a class="mp-attn-name" href="${item.link}">${item.name}</a>
      <span class="mp-attn-reason"><span class="sr-only">${REASON_LABELS[item.reason] ?? ''}: </span>${item.text}</span>
    </span>
    <span class="mp-attn-actions">${primaryButton}${secondary.filter((a) => a.key !== 'view').map((a) => button({ label: a.label, variant: 'ghost', small: true, extra: { 'data-action': a.key, 'data-id': item.id, 'aria-label': `${a.label}: ${item.name}` } }))}</span>
  </li>`;
}

function renderAttention(overview) {
  const { total, items } = overview.attention;
  return html`<div class="dash-card-head"><h2 id="mp-attention-title">Precisa da sua atenção</h2><span class="mp-count">${attentionCountText(total)}</span></div>
    ${items.length === 0
      ? emptyState({ title: 'Tudo em dia por aqui.', message: 'Nenhuma aluna precisa de atenção agora.' })
      : html`<ul class="mp-attn" aria-labelledby="mp-attention-title">${items.map(attentionRow)}</ul>
        ${total > items.length ? html`<p class="mp-more">Mostrando ${items.length} de ${total}. <a href="#/alunas">Ver todas as alunas</a></p>` : ''}`}`;
}

// ---------------------------------------------------------------- KPIs
function renderKpis(summary, overview, overviewFailed) {
  const extras = EXTRA_STATS.map(([key, label, iconName, note]) => {
    if (overview) return statCard({ label, value: String(overview.kpis[key]), iconName, note });
    return statCard({ label, value: '—', iconName, note: overviewFailed ? 'indisponível agora' : 'carregando…' });
  });
  return html`${summary.totalStudents === 0 ? renderEmpty() : ''}
    <div class="stat-cards mp-kpis">${STATS.map(([key, label, iconName]) => statCard({ label, value: String(summary[key]), iconName }))}${extras}</div>`;
}

// ---------------------------------------------------------------- evolução
function renderEvolution(overview) {
  const evo = overview.evolution;
  const xp = evo.map((p) => p.avgXp);
  const goals = evo.map((p) => p.goalsReached);
  const empty = xp.every((v) => v === 0) && goals.every((v) => v === 0);
  const xpPts = linePoints(xp, Math.max(...xp));
  const goalPts = linePoints(goals, Math.max(...goals));
  const lastXp = xp[xp.length - 1];
  const lastGoals = goals[goals.length - 1];
  return html`<div class="dash-card-head"><h2 id="mp-evolution-title">Evolução das alunas</h2>
      <span class="mp-legend"><span class="mp-legend-item"><span class="mp-swatch is-green"></span>XP médio por aluna</span><span class="mp-legend-item"><span class="mp-swatch is-gold"></span>Metas atingidas</span></span></div>
    ${empty
      ? emptyState({ title: 'Ainda sem evolução para mostrar.', message: 'Quando as alunas usarem o Hub, o XP e as metas aparecem mês a mês.' })
      : html`<svg class="mp-chart" viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label="Evolução mensal do XP médio e das metas atingidas. Último mês: XP médio ${lastXp}, ${plural(lastGoals, 'meta atingida', 'metas atingidas')}.">
          <g class="mp-grid">${[20, 80, 140, 190].map((y) => html`<line x1="0" y1="${y}" x2="600" y2="${y}"></line>`)}</g>
          <path class="mp-area" d="${pathOf(xpPts)} L${xpPts[xpPts.length - 1].x} 190 L${xpPts[0].x} 190 Z"></path>
          <path class="mp-line is-green" d="${pathOf(xpPts)}"></path>
          <path class="mp-line is-gold" d="${pathOf(goalPts)}"></path>
          <circle class="mp-dot is-green" cx="${xpPts[xpPts.length - 1].x}" cy="${xpPts[xpPts.length - 1].y}" r="5"></circle>
          <circle class="mp-dot is-gold" cx="${goalPts[goalPts.length - 1].x}" cy="${goalPts[goalPts.length - 1].y}" r="5"></circle>
        </svg>
        <ul class="mp-months" aria-hidden="true">${evo.map((p, i) => html`<li${attrs({ class: i === evo.length - 1 ? 'is-current' : '' })}>${p.label}</li>`)}</ul>
        <table class="sr-only"><caption>Evolução mensal</caption><thead><tr><th scope="col">Mês</th><th scope="col">XP médio por aluna</th><th scope="col">Metas atingidas</th></tr></thead><tbody>${evo.map((p) => html`<tr><th scope="row">${p.label}</th><td>${p.avgXp}</td><td>${p.goalsReached}</td></tr>`)}</tbody></table>`}
    ${allowed('reports.view') ? html`<p class="mp-more"><a href="#/relatorios-mentoria">Ver relatórios</a></p>` : ''}`;
}

// ---------------------------------------------------------------- por turma
function renderClasses(overview) {
  const rows = overview.byClass;
  return html`<h2 id="mp-classes-title">Progresso por turma</h2>
    ${rows.length === 0
      ? emptyState({ title: 'Nenhuma turma ainda.', message: 'Quando as alunas tiverem turma, o progresso de cada uma aparece aqui.' })
      : html`<ul class="mp-classes" aria-labelledby="mp-classes-title">${rows.map(
          (c) => html`<li class="mp-class">
            <p class="mp-class-head"><span><strong>${c.className}</strong> <span class="mp-muted">· ${plural(c.students, 'aluna', 'alunas')}</span></span><span class="mp-class-pct">${c.avgProgressPct}%</span></p>
            <div class="mp-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${c.avgProgressPct}" aria-label="Progresso médio de ${c.className}"><div class="mp-fill" data-w="${c.avgProgressPct}"></div></div>
          </li>`,
        )}</ul>`}`;
}

// ---------------------------------------------------------------- atividade
function renderActivity(overview) {
  const days = overview.activity;
  const heights = barHeights(days);
  const total = days.reduce((sum, d) => sum + d.events, 0);
  return html`<div class="dash-card-head"><h2 id="mp-activity-title">Atividade da plataforma</h2><span class="mp-muted">Ações registradas · últimos 14 dias</span></div>
    ${total === 0
      ? emptyState({ title: 'Nenhuma ação registrada ainda.', message: 'Cada tarefa concluída, lead ou meta atingida das alunas conta aqui, sem mostrar o que foi feito.' })
      : html`<div class="mp-bars" role="img" aria-label="${activitySummary(days)}">${days.map(
            (d, i) => html`<span${attrs({ class: `mp-bar${i === days.length - 1 ? ' is-today' : ''}${isWeekend(d.day) ? ' is-weekend' : ''}`, title: `${dayLabel(d.day)}: ${plural(d.events, 'ação', 'ações')}`, 'data-h': String(heights[i]) })}></span>`,
          )}</div>
        <p class="mp-bars-axis" aria-hidden="true"><span>${dayLabel(days[0].day)}</span><span>Hoje</span></p>
        <p class="sr-only">${activitySummary(days)}</p>`}`;
}

function isWeekend(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

// ---------------------------------------------------------------- destaques
function renderHighlights(overview) {
  const rows = overview.highlights;
  return html`<div class="dash-card-head"><h2 id="mp-highlights-title">Destaques da semana</h2><a href="#/alunas">Ver alunas</a></div>
    ${rows.length === 0
      ? emptyState({ title: 'Sem destaques ainda.', message: 'Quem mais evoluir nesta semana aparece aqui.' })
      : html`<ul class="mp-highlights" aria-labelledby="mp-highlights-title">${rows.map(
          (h) => html`<li><a class="mp-hl" href="#/alunas/${h.id}">
            <span class="mp-hl-avatar" aria-hidden="true">${h.avatarUrl ? avatarContent(h.name, h.avatarUrl) : initials(h.name)}</span>
            <span class="mp-hl-text"><span class="mp-hl-name">${h.name}</span><span class="mp-hl-sub">${levelText(h.level.n)} · ${h.level.name} · ${h.label}</span></span>
            <span class="mp-hl-xp">+${h.weekXp.toLocaleString('pt-BR')} XP<span class="sr-only"> na semana</span></span>
          </a></li>`,
        )}</ul>`}`;
}

export function renderMentoraHome({ root, session, api, navigate }) {
  viewer = session.state.user;
  // Equipe sem permissão de ver alunas: o Painel é só um ponto de partida para o que o papel libera.
  if (!allowed('students.view')) return renderTeamHome({ root, session, navigate });
  const first = String(session.state.user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  const now = new Date();
  let disposed = false;
  let summary = null;
  let summaryFailed = false;
  let overview = null;
  let overviewFailed = false;
  let overviewSeq = 0;

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'home',
    heading: first ? `${greeting(now)}, ${first}.` : `${greeting(now)}.`,
    eyebrow: eyebrowDate(now),
    subtitle: SUBTITLE,
    large: true,
    actions: allowed('students.manage') ? html`<a class="btn btn-primary" href="#/alunas?nova=1" id="mp-new-student">${icon('plus', { size: 16, stroke: 2 })}Nova aluna</a>` : '',
    content: html`<div class="dash mp">
      <div class="mp-hero">
        <div id="mp-green">${skeleton(3)}</div>
        <section class="dash-card" id="mp-attention" aria-labelledby="mp-attention-title" aria-busy="true">${skeleton(3)}</section>
      </div>
      <div id="mentora-summary" aria-live="off">${skeleton(3)}</div>
      <div class="dash-split mp-split">
        <section class="dash-card" id="mp-evolution" aria-labelledby="mp-evolution-title" aria-busy="true">${skeleton(3)}</section>
        <section class="dash-card" id="mp-classes" aria-labelledby="mp-classes-title" aria-busy="true">${skeleton(3)}</section>
      </div>
      <div class="dash-split mp-split">
        <section class="dash-card" id="mp-activity" aria-labelledby="mp-activity-title" aria-busy="true">${skeleton(3)}</section>
        <section class="dash-card" id="mp-highlights" aria-labelledby="mp-highlights-title" aria-busy="true">${skeleton(3)}</section>
      </div>
    </div>`,
  });

  const el = {
    green: root.querySelector('#mp-green'),
    attention: root.querySelector('#mp-attention'),
    summary: root.querySelector('#mentora-summary'),
    evolution: root.querySelector('#mp-evolution'),
    classes: root.querySelector('#mp-classes'),
    activity: root.querySelector('#mp-activity'),
    highlights: root.querySelector('#mp-highlights'),
  };
  const cards = [
    [el.evolution, renderEvolution, 'Evolução das alunas', 'mp-evolution-title'],
    [el.classes, renderClasses, 'Progresso por turma', 'mp-classes-title'],
    [el.activity, renderActivity, 'Atividade da plataforma', 'mp-activity-title'],
    [el.highlights, renderHighlights, 'Destaques da semana', 'mp-highlights-title'],
  ];

  function paintKpis() {
    if (summaryFailed) {
      mount(el.summary, retryAlert('Não foi possível carregar agora. Tente de novo em instantes.', 'summary'));
      return;
    }
    if (!summary) return;
    mount(el.summary, renderKpis(summary, overview, overviewFailed));
  }

  function paintOverview() {
    if (overviewFailed) {
      mount(el.green, retryAlert('Não foi possível carregar o resumo da mentoria agora.', 'overview', 'resumo da mentoria'));
      mount(el.attention, html`<h2 id="mp-attention-title">Precisa da sua atenção</h2>${retryAlert('Não foi possível carregar este cartão.', 'overview', 'Precisa da sua atenção')}`);
      for (const [target, , label, titleId] of cards) {
        mount(target, html`<h2 id="${titleId}">${label}</h2>${retryAlert('Não foi possível carregar este cartão.', 'overview', label)}`);
        target.setAttribute('aria-busy', 'false');
      }
      el.attention.setAttribute('aria-busy', 'false');
      paintKpis();
      return;
    }
    if (!overview) return;
    mount(el.green, overview.hero.students === 0 ? html`` : renderHero(overview));
    mount(el.attention, renderAttention(overview));
    el.attention.setAttribute('aria-busy', 'false');
    for (const [target, render] of cards) {
      mount(target, render(overview));
      target.setAttribute('aria-busy', 'false');
    }
    applySizes(root);
    // Colunas do gráfico de atividade: altura vem de dados (CSP não aceita style inline).
    paintKpis();
  }

  function loadOverview() {
    const mine = ++overviewSeq;
    overview = null;
    overviewFailed = false;
    mount(el.green, skeleton(3));
    mount(el.attention, skeleton(3));
    for (const [target] of cards) mount(target, skeleton(3));
    pack(api.get('/api/v1/mentora/overview')).then((packed) => {
      if (disposed || mine !== overviewSeq) return;
      if (packed.status === 'ok' && isOverview(packed.value)) overview = packed.value;
      else overviewFailed = true;
      paintOverview();
    });
  }

  function loadSummary() {
    summary = null;
    summaryFailed = false;
    mount(el.summary, skeleton(3));
    pack(api.get('/api/v1/mentora/summary')).then((packed) => {
      if (disposed) return;
      if (packed.status === 'ok' && isSummary(packed.value)) summary = packed.value;
      else summaryFailed = true;
      paintKpis();
    });
  }

  /** "Reenviar convite" direto do painel: gera o novo link (o anterior deixa de valer) e mostra para copiar. */
  async function resendInvite(button_, id) {
    button_.disabled = true;
    try {
      const result = await api.post(`/api/v1/students/${encodeURIComponent(id)}/invites`, {});
      if (disposed) return;
      toast('Novo link de acesso gerado.', { tone: 'success' });
      if (result?.invite?.acceptUrl) await copyLinkDialog({ student: result.student, acceptUrl: result.invite.acceptUrl });
    } catch (error) {
      if (!disposed) toast(describeError(error), { tone: 'danger' });
    }
    if (disposed) return;
    loadOverview();
    loadSummary();
  }

  // Os ouvintes ficam na raiz da tela (recriada por `renderShell` a cada visita), então somem junto com ela.
  root.querySelector('.dash').addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, id, which } = target.dataset;
    if (action === 'retry') {
      if (which === 'summary') loadSummary();
      else loadOverview();
    } else if (action === 'resend_invite') resendInvite(target, id);
    else if (action === 'schedule') navigate(`/alunas/${id}?sessao=1`);
  });

  loadSummary();
  loadOverview();

  return () => {
    disposed = true;
    dispose();
  };
}
