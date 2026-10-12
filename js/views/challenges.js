import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { CHALLENGE_TABS, ctaLabel, doneLong, doneText, nextActions, periodText, rewardText, segments, stateMeta, tabOf, whenText, xpText } from '../lib/growth.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';

/** Desafios da aluna (kit A-Desafios): ciclos curtos de ação propostos pela mentora. */

const TAB_KEY = 'ih:challenges-tab';
const EMPTY = {
  active: { title: 'Você não está em nenhum desafio agora', message: 'Participe de um desafio disponível para acompanhar as ações e ganhar XP.' },
  available: { title: 'Nenhum desafio disponível', message: 'Quando a sua mentora publicar um novo desafio, ele aparece aqui.' },
  done: { title: 'Nenhum desafio concluído ainda', message: 'Os desafios que você concluir ficam registrados aqui.' },
};

function readTab() {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return CHALLENGE_TABS.some((t) => t.id === saved) ? saved : 'active';
  } catch {
    return 'active';
  }
}

function saveTab(tab) {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // sem armazenamento: a aba só vale nesta visita
  }
}

function retryBlock(error) {
  return html`<div class="stack">${alert({ tone: 'danger', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;
}

/** Barra do desafio: um segmento por ação (até 20) ou uma barra contínua. */
function progressBar(progress, label) {
  const segs = segments(progress);
  if (segs) {
    return html`<div class="chal-segs" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.total}" aria-valuenow="${progress.done}" aria-label="${label}">${segs.map((on) => html`<span${attrs({ class: `chal-seg${on ? ' is-on' : ''}` })}></span>`)}</div>`;
  }
  return html`<div class="chal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.pct}" aria-label="${label}"><div${attrs({ class: 'chal-bar-fill', 'data-w': String(progress.pct) })}></div></div>`;
}

function heroCard(c, detail) {
  const actions = detail ? nextActions(detail.actions, 5) : [];
  const reward = rewardText(c);
  return html`<section class="chal-hero" aria-labelledby="chal-hero-title">
    <svg class="chal-hero-art" width="520" height="360" viewBox="0 0 520 360" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor"><path d="M0 330 L130 170 L210 250 L300 110 L400 210 L520 60" stroke-opacity="0.35"></path><path d="M0 360 L130 220 L210 290 L300 170 L400 260 L520 130" stroke-opacity="0.12"></path></g><circle cx="300" cy="110" r="4" fill="currentColor"></circle></svg>
    <div class="chal-hero-main">
      <div class="chal-pills"><span class="chal-pill chal-pill--gold">EM ANDAMENTO</span><span class="chal-pill">${whenText(c)}</span></div>
      <h2 id="chal-hero-title" class="chal-hero-title">${c.title}</h2>
      ${c.description ? html`<p class="chal-hero-desc">${c.description}</p>` : ''}
      <div class="chal-hero-progress">
        <div class="chal-hero-row"><span class="chal-hero-count">${c.progress.done} <span class="chal-hero-total">/ ${c.progress.total}</span></span>${reward ? html`<span class="chal-hero-reward">${reward}</span>` : ''}</div>
        ${progressBar(c.progress, `Progresso do desafio ${c.title}: ${doneLong(c)}`)}
      </div>
      <a class="chal-cta" href="#/desafios/${c.id}">Ver desafio ${icon('arrowRight', { size: 16, stroke: 2 })}</a>
    </div>
    ${actions.length
      ? html`<div class="chal-next"><h3 class="chal-next-title">${actions.some((a) => !a.done) ? 'Próximas ações' : 'Ações do desafio'}</h3>
          <ul class="chal-next-list">${actions.map((a) => html`<li${attrs({ class: `chal-next-item${a.done ? ' is-done' : ''}` })}><span class="chal-check" aria-hidden="true">${a.done ? icon('check', { size: 12, stroke: 3 }) : ''}</span><span class="chal-next-text">${a.title}<span class="sr-only"> (${a.done ? 'feita' : 'pendente'})</span></span>${a.xp > 0 ? html`<span class="chal-next-xp">+${a.xp}</span>` : ''}</li>`)}</ul></div>`
      : ''}
  </section>`;
}

function challengeCard(c) {
  const meta = stateMeta(c.state);
  const reward = rewardText(c);
  const showBar = c.enrolled || c.state === 'completed';
  return html`<li class="chal-card${c.state === 'completed' ? ' is-completed' : ''}">
    <div class="chal-card-top"><span class="chal-card-icon" aria-hidden="true">${icon(c.state === 'completed' ? 'check' : 'desafios', { size: 19, stroke: 1.5 })}</span><span class="chal-status chal-status--${meta.tone}">${meta.label}</span></div>
    <h3 class="chal-card-title"><a class="chal-card-link" href="#/desafios/${c.id}">${c.title}</a></h3>
    <p class="chal-card-desc">${c.description || periodText(c)}</p>
    ${showBar ? progressBar(c.progress, `${c.title}: ${doneLong(c)}`) : ''}
    <div class="chal-card-foot"><span class="chal-card-count">${showBar ? doneText(c) + ' ações' : whenText(c)}</span>${reward ? html`<span class="chal-card-xp">${c.rewardXp > 0 ? xpText(c.rewardXp) : 'Conquista'}</span>` : ''}</div>
    <span class="sr-only">${ctaLabel(c)}</span>
  </li>`;
}

export function renderChallenges({ root, session, api, navigate }) {
  let disposed = false;
  let gen = 0;
  let data = null;
  let heroDetail = null;
  let tab = readTab();

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'challenges',
    heading: 'Desafios',
    eyebrow: 'Crescimento',
    subtitle: 'Ciclos curtos de ação estratégica, propostos pela sua mentora.',
    actions: html`<div class="tabs chal-tabs" role="tablist" aria-label="Situação dos desafios" id="chal-tabs"></div>`,
    content: html`<div class="growth" id="chal-panel" role="tabpanel" aria-busy="true">${skeleton(4)}</div>`,
  });

  const panel = root.querySelector('#chal-panel');
  const tabsEl = root.querySelector('#chal-tabs');

  const inTab = (id) => (data?.data ?? []).filter((c) => tabOf(c) === id);

  function paintTabs() {
    mount(tabsEl, html`${CHALLENGE_TABS.map(
      (t) => html`<button${attrs({ type: 'button', role: 'tab', class: 'tabs-tab', id: `chal-tab-${t.id}`, 'data-tab': t.id, 'aria-selected': String(t.id === tab), 'aria-controls': 'chal-panel', tabindex: t.id === tab ? '0' : '-1' })}>${t.label}<span class="tabs-count" aria-hidden="true">${data ? inTab(t.id).length : '·'}</span></button>`,
    )}`);
    panel.setAttribute('aria-labelledby', `chal-tab-${tab}`);
  }

  function paintPanel() {
    const list = inTab(tab);
    if (list.length === 0) {
      mount(panel, emptyState({
        iconName: 'desafios',
        title: EMPTY[tab].title,
        message: EMPTY[tab].message,
        action: tab === 'active' && inTab('available').length > 0 ? button({ label: 'Ver desafios disponíveis', variant: 'ghost', extra: { 'data-action': 'go-available' } }) : '',
      }));
      return;
    }
    if (tab === 'active') {
      const [first, ...rest] = list;
      mount(panel, html`${heroCard(first, heroDetail?.id === first.id ? heroDetail : null)}${rest.length ? html`<ul class="chal-grid" aria-label="Outros desafios ativos">${rest.map(challengeCard)}</ul>` : ''}`);
    } else {
      mount(panel, html`<ul class="chal-grid" aria-label="${CHALLENGE_TABS.find((t) => t.id === tab).label}">${list.map(challengeCard)}</ul>`);
    }
    applySizes(panel);
  }

  async function loadHero() {
    const first = inTab('active')[0];
    if (!first) return;
    try {
      const detail = await api.get(`/api/v1/challenges/${first.id}`);
      if (disposed) return;
      heroDetail = detail;
      if (tab === 'active') paintPanel();
    } catch {
      // as próximas ações são um apoio: sem elas o cartão continua inteiro
    }
  }

  async function load() {
    const id = ++gen;
    panel.setAttribute('aria-busy', 'true');
    mount(panel, skeleton(4));
    try {
      const result = await api.get('/api/v1/challenges');
      if (disposed || id !== gen) return;
      data = result;
      // Sem desafio na aba lembrada, vai para a primeira que tem algo (nunca deixa a pessoa numa aba vazia sem saber).
      if (inTab(tab).length === 0) tab = CHALLENGE_TABS.find((t) => inTab(t.id).length > 0)?.id ?? tab;
      paintTabs();
      paintPanel();
      loadHero();
    } catch (error) {
      if (disposed || id !== gen) return;
      data = null;
      paintTabs();
      mount(panel, retryBlock(error));
    }
    panel.setAttribute('aria-busy', 'false');
  }

  function select(next, { focus = false } = {}) {
    if (next === tab) return;
    tab = next;
    saveTab(tab);
    paintTabs();
    paintPanel();
    if (focus) tabsEl.querySelector(`[data-tab="${tab}"]`)?.focus();
  }

  tabsEl.addEventListener('click', (event) => {
    const t = event.target.closest('[data-tab]');
    if (t) select(t.dataset.tab);
  });
  tabsEl.addEventListener('keydown', (event) => {
    const index = CHALLENGE_TABS.findIndex((t) => t.id === tab);
    let next = null;
    if (event.key === 'ArrowRight') next = CHALLENGE_TABS[(index + 1) % CHALLENGE_TABS.length].id;
    else if (event.key === 'ArrowLeft') next = CHALLENGE_TABS[(index - 1 + CHALLENGE_TABS.length) % CHALLENGE_TABS.length].id;
    else if (event.key === 'Home') next = CHALLENGE_TABS[0].id;
    else if (event.key === 'End') next = CHALLENGE_TABS[CHALLENGE_TABS.length - 1].id;
    if (!next) return;
    event.preventDefault();
    select(next, { focus: true });
  });
  panel.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'retry') load();
    else if (target.dataset.action === 'go-available') select('available', { focus: true });
  });

  paintTabs();
  load();

  return () => {
    disposed = true;
    dispose();
  };
}
