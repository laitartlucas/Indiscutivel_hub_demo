import { html } from '../lib/html.js';
import { formatMoney } from '../../shared/money.js';
import { formatWhatsapp } from '../../shared/contact.js';
import {
  conversionRate,
  eyebrowDate,
  formatMoneyCompact,
  funnelRows,
  greeting,
  idleLabel,
  listRows,
  listTotal,
  loadCommercialOverview,
  loadDashboard,
  loadDealsSummary,
  loadPeopleRecent,
  loadPeopleTotal,
  loadProductsRecent,
  loadProductsTotal,
  openTotals,
  pack,
  wonAverage,
} from '../lib/dashboard.js';
import { arcs, icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { buildQuery } from '../lib/query.js';
import { dueLabel, focusRing, isOverdue, tzOffsetMinutes } from '../lib/tasks.js';
import { setTasksBadge } from '../lib/tasks-badge.js';
import { alert, button, emptyState, skeleton, statCard } from '../ui/components.js';
import { mountActiveCard } from '../ui/active-students.js';
import { iaCard } from '../ui/ia-link.js';
import { focusHeading, mount } from '../lib/dom.js';
import { levelNumber, nextLevelText, xpBar } from '../lib/progress.js';
import { sessionLine } from '../lib/mentora.js';
import { applySizes } from '../lib/widths.js';
import {
  formatResetDate,
  loadSecurityNotice,
  readDismissedResetNotice,
  saveDismissedResetNotice,
  shouldShowResetNotice,
} from '../lib/reset-notice.js';

const EMPTY = html``;
const QUOTE = '“Seu negócio não precisa de mais esforço. Precisa de clareza.”';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Mesmo padrão de `ui/list-view.js`: alerta de erro com um botão "Tentar de novo" (`data-action="retry"`). */
function retryAlert(message) {
  return html`<div class="stack">
    ${alert({ tone: 'danger', message })}
    <div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div>
  </div>`;
}

function paintStat(el, packed, label, iconName, note) {
  if (packed.status === 'error') {
    mount(el, retryAlert('Não foi possível carregar.'));
    return;
  }
  mount(el, statCard({ label, value: String(listTotal(packed.value)), iconName, note: note?.(packed.value) }));
}

/** "3 clientes" a partir da contagem de contatos por situação. */
const clientsNote = (counts) => (Number.isInteger(counts?.client) ? plural(counts.client, 'cliente', 'clientes') : '');

function paintList(el, packed, renderOk, emptyMessage) {
  if (packed.status === 'error') {
    mount(el, retryAlert('Não foi possível carregar agora. Tente de novo em instantes.'));
    return;
  }
  if (listRows(packed.value).length === 0) {
    mount(el, emptyState({ title: emptyMessage }));
    return;
  }
  mount(el, renderOk(packed.value));
}

function renderProductsRecent(v) {
  return html`<ul class="recent-list">
    ${listRows(v).map(
      (p) =>
        html`<li class="recent-item"><span class="recent-item-name">${p.name}</span><span class="recent-item-meta">${formatMoney(p.price)}</span></li>`,
    )}
  </ul>`;
}

function renderPeopleRecent(v) {
  return html`<ul class="recent-list">
    ${listRows(v).map(
      (p) =>
        html`<li class="recent-item"><a class="recent-item-name recent-item-link" href="#/comercial/contatos/${encodeURIComponent(p.id)}">${p.name}</a><span class="recent-item-meta">${p.whatsapp ? formatWhatsapp(p.whatsapp) : '—'}</span></li>`,
    )}
  </ul>`;
}

// ---------- Foco de hoje (Tarefas) ----------

function loadTodayTasks(api) {
  const tz = tzOffsetMinutes();
  return Promise.all([
    api.get(`/api/v1/tasks${buildQuery({ view: 'today', limit: 5, tzOffset: tz })}`),
    api.get(`/api/v1/tasks/summary${buildQuery({ tzOffset: tz })}`),
  ]).then(([list, summary]) => ({ list, summary }));
}

function renderTodayTasks({ list, summary }, now) {
  const ring = focusRing(summary);
  const late = summary.overdue;
  const lateNote = late > 0 ? html`<a class="dash-tasks-late" href="#/tarefas">${plural(late, 'tarefa atrasada', 'tarefas atrasadas')}</a>` : '';
  if (ring.total === 0) {
    return html`<p class="dash-tasks-sum">Nenhuma tarefa com prazo hoje.</p>${lateNote}`;
  }
  return html`<p class="dash-tasks-sum"><strong>${ring.done}/${ring.total}</strong> concluídas hoje</p>
    <ul class="recent-list">${list.data.map((t) => html`<li class="recent-item${t.status === 'done' ? ' is-done' : ''}"><span class="recent-item-name">${t.title}</span><span class="recent-item-meta${isOverdue(t, now) ? ' is-late' : ''}">${dueLabel(t, now)}</span></li>`)}</ul>${lateNote}`;
}

// ---------- resumo das oportunidades (todos os funis): "próximo movimento", ganhas, KPIs e funis ----------

/** Título do cartão verde: quantas negociações estão abertas. */
function nextMoveCopy(summary) {
  const open = openTotals(summary).count;
  if (open > 0) return `Você tem ${plural(open, 'oportunidade', 'oportunidades')} em negociação.`;
  return 'Seu pipeline está vazio.';
}

function renderNextMove(summary, now) {
  const empty = openTotals(summary).count === 0 && Number(summary?.won?.count ?? 0) === 0 && Number(summary?.lost?.count ?? 0) === 0;
  const waiting = Array.isArray(summary?.waiting) ? summary.waiting : [];
  return html`<section class="dash-premium" aria-labelledby="dash-next-title">
    ${arcs()}
    <div class="dash-premium-main">
      <span class="eyebrow">Seu próximo movimento</span>
      <h2 id="dash-next-title">${nextMoveCopy(summary)}</h2>
      ${empty ? html`<p class="dash-premium-hint">Abra a primeira oportunidade no Pipeline para acompanhar suas vendas por aqui.</p>` : ''}
      <a class="dash-cta" href="#/comercial/pipeline">Abrir pipeline${icon('arrowRight')}</a>
    </div>
    ${waiting.length > 0
      ? html`<ul class="dash-waiting">${waiting.map(
          (w) => html`<li><a href="#/comercial/oportunidades/${encodeURIComponent(w.id)}"><span class="dash-waiting-top"><span class="dash-waiting-name">${w.personName}</span><span class="dash-waiting-value">${formatMoneyCompact(w.value)}</span></span><span class="dash-waiting-meta">${w.stageName ?? ''} · ${idleLabel(w.updatedAt, now)}</span></a></li>`,
        )}</ul>`
      : ''}
  </section>`;
}

function renderWon(summary) {
  const won = summary?.won ?? { count: 0, total: '0.00' };
  return html`<section class="dash-card dash-won" aria-labelledby="dash-won-title">
    <div class="dash-card-head"><h2 id="dash-won-title" class="eyebrow eyebrow-muted">Vendas ganhas</h2><a href="#/comercial/contatos?status=client">Ver clientes</a></div>
    <p class="dash-won-value">${formatMoneyCompact(won.total)}</p>
    <p class="dash-won-note">${won.count === 0 ? 'Nenhuma oportunidade ganha ainda.' : html`<strong>${plural(won.count, 'oportunidade ganha', 'oportunidades ganhas')}</strong>`}</p>
  </section>`;
}

function renderDealKpis(summary) {
  const open = openTotals(summary);
  return html`${statCard({ label: 'Em negociação', value: formatMoneyCompact(open.total), iconName: 'pipeline', note: plural(open.count, 'oportunidade', 'oportunidades') })}${statCard({
    label: 'Valor ponderado',
    value: formatMoneyCompact(open.weighted),
    iconName: 'leads',
    note: open.count === 0 ? '' : 'valor × chance de cada etapa',
  })}`;
}

function renderFunnel(summary, overviewPacked) {
  const conversion = conversionRate(summary);
  const average = wonAverage(summary);
  const foot = html`<p class="dash-funnel-foot"><span>Conversão <strong>${conversion ?? '—'}</strong></span><span>Ticket médio <strong>${average ? formatMoneyCompact(average) : '—'}</strong></span></p>`;
  const head = html`<div class="dash-card-head"><h2>Funis em andamento</h2><a href="#/comercial">Ver visão geral</a></div>`;
  if (overviewPacked?.status !== 'ok') {
    return html`${head}${overviewPacked?.status === 'error' ? retryAlert('Não foi possível carregar os funis agora.') : skeleton(3)}${foot}`;
  }
  const rows = funnelRows(overviewPacked.value?.byFunnel);
  if (rows.length === 0) {
    return html`${head}${emptyState({ title: 'Nenhuma negociação no mês.', message: 'Quando você abrir oportunidades, os funis com movimento aparecem aqui.' })}${foot}`;
  }
  return html`${head}<ul class="dash-funnel">${rows.map(
      (r) => html`<li class="dash-funnel-row"><a class="dash-funnel-name" href="#/comercial/pipeline/${encodeURIComponent(r.key ?? '')}">${r.name}</a><span class="dash-funnel-track"><span class="dash-funnel-bar" data-width="${r.width}">${r.open > 0 ? r.open : ''}</span></span><span class="dash-funnel-value">${r.won > 0 ? `${r.won} ${r.won === 1 ? 'ganha' : 'ganhas'}` : '—'}</span></li>`,
    )}</ul>
    <p class="sr-only">As barras mostram as oportunidades em negociação em cada funil neste mês.</p>
    ${foot}`;
}

/** Cartão discreto de nível e XP (dados reais de GET /progress), com link para Meu progresso. */
function renderLevelCard(p) {
  const bar = xpBar(p);
  return html`<section class="dash-card dash-level" aria-labelledby="dash-level-title">
    <div class="dash-level-who">
      <span class="dash-level-badge" aria-hidden="true"><span class="dash-level-cap">NÍVEL</span><span class="dash-level-num">${levelNumber(p.level.n)}</span></span>
      <div><h2 id="dash-level-title">Minha evolução</h2><p class="dash-level-name"><span class="sr-only">Nível ${levelNumber(p.level.n)}: </span>${p.level.name}</p></div>
    </div>
    <div class="dash-level-xp">
      <p class="dash-level-row"><span>XP</span><strong>${bar.label}</strong></p>
      <div class="xp-track xp-track-sm" role="progressbar" aria-valuemin="0" aria-valuemax="${bar.max ?? p.xp}" aria-valuenow="${p.xp}" aria-label="XP: ${bar.label}"><div class="xp-fill" data-w="${bar.pct}"></div></div>
      <p class="dash-level-next">${nextLevelText(p)}</p>
    </div>
    <a class="dash-level-link" href="#/progresso">Ver meu progresso${icon('arrowRight', { size: 15 })}</a>
  </section>`;
}

/** Bloco "Próxima mentoria": só existe quando a mentora marcou uma sessão (GET /mentoring/next). Somente leitura. */
function renderNextMentoring(session) {
  return html`<section class="dash-card dash-mentoring" aria-labelledby="dash-mentoring-title">
    <div class="dash-card-head"><h2 id="dash-mentoring-title">Próxima mentoria</h2><a href="#/calendario">Ver no calendário</a></div>
    <p class="dash-mentoring-when">${sessionLine(session)}</p>
    ${session.topic ? html`<p class="dash-mentoring-topic">${session.topic}</p>` : ''}
  </section>`;
}

/** Aviso de segurança no topo: a senha foi redefinida por um link da mentora. Alerta informativo (role="status") com "Entendi". */
function renderResetNotice(passwordResetAt) {
  return html`<div class="alert alert-info alert-action" role="status">
    <div>
      <p class="alert-title">Senha redefinida</p>
      <p>A senha da sua conta foi redefinida em ${formatResetDate(passwordResetAt)} por um link gerado pela sua mentora. Se não foi você quem definiu a nova senha, avise a sua mentora e peça um novo link.</p>
    </div>
    ${button({ label: 'Entendi', variant: 'ghost', extra: { 'data-action': 'dismiss-reset-notice' } })}
  </div>`;
}

export function renderHome({ root, session, api, navigate }) {
  const first = String(session.state.user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  let disposed = false;
  const now = new Date();

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'home',
    heading: first ? `${greeting(now)}, ${first}.` : `${greeting(now)}.`,
    eyebrow: eyebrowDate(now),
    large: true,
    subtitle: QUOTE,
    content: html`<div class="dash">
      <div id="dash-reset-notice"></div>
      <div id="dash-welcome"></div>
      <div class="dash-hero">
        <div id="dash-next-move">${skeleton(3)}</div>
        <div id="dash-won">${skeleton(3)}</div>
      </div>
      <div class="stat-cards" id="dash-stats">
        <div id="dash-kpis-deals" class="dash-kpis-deals">${skeleton(1)}</div>
        <div id="dash-stats-people">${skeleton(1)}</div>
        <div id="dash-stats-products">${skeleton(1)}</div>
      </div>
      <div class="dash-duo">
        <section class="dash-card as-card" id="dash-active" aria-labelledby="as-title">${skeleton(3)}</section>
        ${iaCard()}
      </div>
      <div id="dash-progress"></div>
      <div id="dash-mentoring"></div>
      <div class="dash-split dash-split-flow">
        <section class="dash-card" id="dash-funnel" aria-label="Funis em andamento">${skeleton(4)}</section>
        <div class="dash-side">
          <section class="dash-card" id="dash-tasks" aria-labelledby="dash-tasks-title"><div class="dash-card-head"><h2 id="dash-tasks-title">Foco de hoje</h2><a href="#/tarefas">Ver tarefas</a></div><div id="dash-tasks-body">${skeleton(3)}</div></section>
          <section class="dash-card"><div class="dash-card-head"><h2>Contatos recentes</h2><a href="#/comercial/contatos">Ver todos</a></div><div id="dash-people-recent">${skeleton(3)}</div></section>
          <section class="dash-card"><div class="dash-card-head"><h2>Produtos recentes</h2><a href="#/produtos">Ver todos</a></div><div id="dash-products-recent">${skeleton(3)}</div></section>
        </div>
      </div>
    </div>`,
  });

  const resetNoticeEl = root.querySelector('#dash-reset-notice');
  const welcomeEl = root.querySelector('#dash-welcome');

  // Mensagem de boas-vindas da mentoria (só aparece se a mentora escreveu uma; falha em silêncio).
  api
    .get('/api/v1/account/mentoria')
    .then((info) => {
      if (disposed || !info || typeof info.welcomeMessage !== 'string' || !info.welcomeMessage.trim()) return;
      mount(welcomeEl, html`<section class="dash-card dash-welcome" aria-label="Mensagem da mentoria">
        <p class="eyebrow">${typeof info.name === 'string' && info.name.trim() ? info.name : 'Sua mentoria'}</p>
        <p class="dash-welcome-text">${info.welcomeMessage}</p>
      </section>`);
    })
    .catch(() => {});
  const nextMoveEl = root.querySelector('#dash-next-move');
  const wonEl = root.querySelector('#dash-won');
  const dealKpisEl = root.querySelector('#dash-kpis-deals');
  const funnelEl = root.querySelector('#dash-funnel');
  const productsStatEl = root.querySelector('#dash-stats-products');
  const peopleStatEl = root.querySelector('#dash-stats-people');
  const productsRecentEl = root.querySelector('#dash-products-recent');
  const peopleRecentEl = root.querySelector('#dash-people-recent');
  const tasksEl = root.querySelector('#dash-tasks-body');
  const progressEl = root.querySelector('#dash-progress');
  const mentoringEl = root.querySelector('#dash-mentoring');

  // Minhas alunas ativas: número auto-informado (a mentora vê só ele). Cartão independente: falha e tenta de novo sozinho.
  const disposeActive = mountActiveCard({ host: root.querySelector('#dash-active'), api });

  // Nível e XP: região opcional. Qualquer falha deixa o cartão de fora, sem afetar o resto do Painel.
  api
    .get(`/api/v1/progress${buildQuery({ tzOffset: tzOffsetMinutes() })}`)
    .then((p) => {
      if (disposed || !p || typeof p !== 'object' || !p.level) return;
      mount(progressEl, renderLevelCard(p));
      applySizes(progressEl);
    })
    .catch(() => {});

  // Próxima mentoria: região opcional (só aparece com uma sessão marcada). Qualquer falha deixa o bloco de fora.
  api
    .get('/api/v1/mentoring/next')
    .then((result) => {
      if (disposed || !result?.next || typeof result.next.startsAt !== 'string') return;
      mount(mentoringEl, renderNextMentoring(result.next));
    })
    .catch(() => {});

  // A largura das barras do funil vem de dados, e o CSP não aceita style inline: aplica pela CSSOM
  // (element.style.width é permitido) depois de pintar.
  function applyFunnelWidths() {
    for (const bar of funnelEl.querySelectorAll('[data-width]')) {
      bar.style.width = `${bar.getAttribute('data-width')}%`;
      bar.removeAttribute('data-width');
    }
  }

  let overviewPacked = null;

  function paintSummary(packed) {
    if (packed.status === 'error') {
      mount(nextMoveEl, retryAlert('Não foi possível carregar agora. Tente de novo em instantes.'));
      mount(wonEl, EMPTY);
      mount(dealKpisEl, EMPTY);
      mount(funnelEl, retryAlert('Não foi possível carregar agora. Tente de novo em instantes.'));
      return;
    }
    const summary = packed.value;
    mount(nextMoveEl, renderNextMove(summary, now));
    mount(wonEl, renderWon(summary));
    mount(dealKpisEl, renderDealKpis(summary));
    mount(funnelEl, renderFunnel(summary, overviewPacked));
    applyFunnelWidths();
  }

  // Cada seção tenta de novo sozinha: refazer só a própria chamada e repintar só a própria região,
  // sem tocar nas outras (para um retry avulso não faz sentido buscar de novo o que já carregou).
  // As quatro peças que vêm do resumo de Oportunidades compartilham uma só chamada.
  function retrySummary() {
    for (const el of [nextMoveEl, wonEl, dealKpisEl, funnelEl]) mount(el, skeleton(el === funnelEl ? 4 : 2));
    Promise.all([pack(loadDealsSummary(api)), pack(loadCommercialOverview(api))]).then(([packed, overview]) => {
      if (disposed) return;
      overviewPacked = overview;
      paintSummary(packed);
    });
  }

  function retryTasks() {
    mount(tasksEl, skeleton(3));
    pack(loadTodayTasks(api)).then((packed) => {
      if (disposed) return;
      if (packed.status === 'error') {
        mount(tasksEl, retryAlert('Não foi possível carregar agora. Tente de novo em instantes.'));
        return;
      }
      setTasksBadge(packed.value.summary.overdue + packed.value.summary.today);
      mount(tasksEl, renderTodayTasks(packed.value, new Date()));
    });
  }

  function retryProductsStat() {
    mount(productsStatEl, skeleton(1));
    pack(loadProductsTotal(api)).then((packed) => {
      if (disposed) return;
      paintStat(productsStatEl, packed, 'Produtos ativos', 'crm');
    });
  }

  function retryPeopleStat() {
    mount(peopleStatEl, skeleton(1));
    pack(loadPeopleTotal(api)).then((packed) => {
      if (disposed) return;
      paintStat(peopleStatEl, packed, 'Contatos', 'contatos', clientsNote);
    });
  }

  function retryProductsRecent() {
    mount(productsRecentEl, skeleton(3));
    pack(loadProductsRecent(api)).then((packed) => {
      if (disposed) return;
      paintList(productsRecentEl, packed, renderProductsRecent, 'Nenhum produto ainda.');
    });
  }

  function retryPeopleRecent() {
    mount(peopleRecentEl, skeleton(3));
    pack(loadPeopleRecent(api)).then((packed) => {
      if (disposed) return;
      paintList(peopleRecentEl, packed, renderPeopleRecent, 'Nenhum contato ainda.');
    });
  }

  // Um listener por região (não em `root`, que é o container fixo de #app e sobrevive a esta view —
  // ligar nele aqui vazaria um listener a cada visita ao Painel). Cada `*El` é recriado por `renderShell`
  // nesta chamada, então o listener some junto quando a tela troca, sem precisar remover na saída.
  function onSectionRetry(el, retry) {
    el.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="retry"]')) retry();
    });
  }
  onSectionRetry(nextMoveEl, retrySummary);
  onSectionRetry(funnelEl, retrySummary);
  onSectionRetry(tasksEl, retryTasks);
  onSectionRetry(productsStatEl, retryProductsStat);
  onSectionRetry(peopleStatEl, retryPeopleStat);
  onSectionRetry(productsRecentEl, retryProductsRecent);
  onSectionRetry(peopleRecentEl, retryPeopleRecent);

  // Aviso de redefinição de senha: região independente das demais. Qualquer falha (rede, 5xx, resposta estranha)
  // não mostra nada e não afeta o resto do Painel; nem há "Tentar de novo" para um aviso opcional.
  pack(loadSecurityNotice(api)).then((packed) => {
    if (disposed || packed.status === 'error') return;
    const passwordResetAt = packed.value?.passwordResetAt;
    if (!shouldShowResetNotice(passwordResetAt, readDismissedResetNotice(), new Date())) return;
    mount(resetNoticeEl, renderResetNotice(passwordResetAt));
    resetNoticeEl.addEventListener('click', (event) => {
      if (!event.target.closest('[data-action="dismiss-reset-notice"]')) return;
      saveDismissedResetNotice(passwordResetAt);
      mount(resetNoticeEl, EMPTY);
      focusHeading(root); // o botão some: o foco volta ao título em vez de se perder
    });
  });

  retryTasks();

  // Carga inicial: uma única leva com todas as chamadas em paralelo (`Promise.all` sobre `pack()` dentro
  // de `loadDashboard`) — só o retry acima busca uma peça isolada.
  loadDashboard(api).then((data) => {
    if (disposed) return;
    overviewPacked = data.overview;
    paintSummary(data.dealsSummary);
    paintStat(productsStatEl, data.productsTotal, 'Produtos ativos', 'crm');
    paintStat(peopleStatEl, data.peopleTotal, 'Contatos', 'contatos', clientsNote);
    paintList(productsRecentEl, data.productsRecent, renderProductsRecent, 'Nenhum produto ainda.');
    paintList(peopleRecentEl, data.peopleRecent, renderPeopleRecent, 'Nenhum contato ainda.');
  });

  return () => {
    disposed = true;
    disposeActive();
    dispose();
  };
}
