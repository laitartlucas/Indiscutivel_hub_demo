import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { CATEGORY_FILTERS, categoryIcon, countsText, filterAchievements, instantDayMonth, instantDayMonthYear, progressLabel, sortAchievements, xpText } from '../lib/growth.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';

/** Conquistas da aluna (kit A-Conquistas): reconhecimento pelos marcos reais; o servidor decide o que está desbloqueado. */

function retryBlock(error) {
  return html`<div class="stack">${alert({ tone: 'danger', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;
}

function heroCard(recent) {
  return html`<section class="unlock-card" aria-labelledby="ach-recent-title">
    <svg class="unlock-arcs" width="480" height="200" viewBox="0 0 480 200" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor"><circle cx="300" cy="100" r="60" stroke-opacity="0.25"></circle><circle cx="300" cy="100" r="110" stroke-opacity="0.12"></circle><circle cx="300" cy="100" r="170" stroke-opacity="0.06"></circle></g></svg>
    <span class="unlock-halo" aria-hidden="true">${icon(categoryIcon(recent.category), { size: 36, stroke: 1.3 })}</span>
    <div class="unlock-text">
      <p class="unlock-eyebrow">Desbloqueada recentemente${recent.unlockedAt ? ` · ${instantDayMonth(recent.unlockedAt).toUpperCase()}` : ''}</p>
      <h2 id="ach-recent-title" class="unlock-title">${recent.title}</h2>
      <p class="unlock-desc">${recent.description || recent.criteria}</p>
    </div>
  </section>`;
}

function cardHtml(a) {
  const label = progressLabel(a.progress);
  const status = a.unlocked ? 'Desbloqueada' : 'Bloqueada';
  return html`<li${attrs({ class: `ach-card ${a.unlocked ? 'is-unlocked' : 'is-locked'}`, 'data-ach': a.id })}>
    <span class="ach-medal" aria-hidden="true">${icon(categoryIcon(a.category), { size: 24, stroke: 1.4 })}</span>
    <h3 class="ach-title">${a.title}<span class="sr-only"> (${status})</span></h3>
    <p class="ach-desc">${a.description || a.criteria}</p>
    ${a.unlocked
      ? html`<p class="ach-date">${instantDayMonthYear(a.unlockedAt)}${a.xpReward > 0 ? html`<span class="ach-xp"> · ${xpText(a.xpReward)}</span>` : ''}</p>`
      : a.progress
        ? html`<div class="ach-bottom"><div class="ach-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${a.progress.pct}" aria-label="${a.title}: ${label}"><div${attrs({ class: 'ach-fill', 'data-w': String(a.progress.pct) })}></div></div><p class="ach-progress">${label}${a.xpReward > 0 ? html`<span class="ach-xp"> · ${xpText(a.xpReward)}</span>` : ''}</p></div>`
        : html`<p class="ach-progress">${a.linkedChallenge ? html`Conclua o desafio <a href="#/desafios/${a.linkedChallenge.id}">${a.linkedChallenge.title}</a>` : 'Concedida por um desafio da mentoria'}</p>`}
  </li>`;
}

export function renderAchievements({ root, session, api, navigate }) {
  let disposed = false;
  let gen = 0;
  let data = null;
  let category = 'all';

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'achievements',
    heading: 'Conquistas',
    eyebrow: 'Crescimento',
    subtitle: 'Reconhecimentos pelos marcos reais do seu negócio.',
    actions: html`<div class="ach-counter" id="ach-counter" hidden></div>`,
    content: html`<div class="growth" id="ach-body" aria-busy="true">${skeleton(4)}</div>`,
  });

  const body = root.querySelector('#ach-body');
  const counter = root.querySelector('#ach-counter');

  function paintCounter() {
    if (!data || data.total === 0) {
      counter.hidden = true;
      return;
    }
    const pct = Math.min(100, Math.floor((data.unlocked / data.total) * 100));
    mount(counter, html`<span><strong class="ach-counter-num">${data.unlocked}</strong> ${countsText(data.unlocked, data.total).replace(/^\d[\d.]*\s/, '')}</span>
      <span class="ach-counter-track" role="progressbar" aria-valuemin="0" aria-valuemax="${data.total}" aria-valuenow="${data.unlocked}" aria-label="${countsText(data.unlocked, data.total)}"><span${attrs({ class: 'ach-counter-fill', 'data-w': String(pct) })}></span></span>`);
    counter.hidden = false;
    applySizes(counter);
  }

  function paintGrid() {
    const list = root.querySelector('#ach-list');
    if (!list) return;
    const visible = sortAchievements(filterAchievements(data.data, category));
    if (visible.length === 0) {
      mount(list, emptyState({ title: 'Nenhuma conquista nesta categoria', message: 'Escolha outra categoria para ver as demais.', action: button({ label: 'Ver todas', variant: 'ghost', extra: { 'data-action': 'clear-filter' } }) }));
      return;
    }
    mount(list, html`<ul class="ach-grid" aria-label="Conquistas${category === 'all' ? '' : ` de ${CATEGORY_FILTERS.find((c) => c.id === category)?.label ?? ''}`}">${visible.map(cardHtml)}</ul>`);
    applySizes(list);
  }

  function paint() {
    paintCounter();
    if (data.total === 0) {
      mount(body, emptyState({
        iconName: 'conquistas',
        title: 'Nenhuma conquista disponível ainda',
        message: 'Quando a sua mentora definir as conquistas da mentoria, elas aparecem aqui com o seu avanço em cada uma.',
      }));
      return;
    }
    const present = new Set(data.data.map((a) => a.category));
    const filters = CATEGORY_FILTERS.filter((c) => c.id === 'all' || present.has(c.id));
    mount(body, html`${data.recent ? heroCard(data.recent) : ''}
      <div class="segments" role="group" aria-label="Filtrar por categoria">${filters.map(
        (c) => html`<button${attrs({ type: 'button', class: 'segment', 'data-category': c.id, 'aria-pressed': String(c.id === category) })}>${c.label}</button>`,
      )}</div>
      <div id="ach-list"></div>`);
    paintGrid();
  }

  async function load() {
    const id = ++gen;
    body.setAttribute('aria-busy', 'true');
    mount(body, skeleton(4));
    try {
      const result = await api.get('/api/v1/achievements');
      if (disposed || id !== gen) return;
      data = result;
      paint();
    } catch (error) {
      if (disposed || id !== gen) return;
      data = null;
      paintCounter();
      mount(body, retryBlock(error));
    }
    body.setAttribute('aria-busy', 'false');
  }

  body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-category], [data-action]');
    if (!target) return;
    if (target.dataset.action === 'retry') return void load();
    if (target.dataset.action === 'clear-filter') category = 'all';
    else category = target.dataset.category;
    for (const chip of body.querySelectorAll('[data-category]')) chip.setAttribute('aria-pressed', String(chip.dataset.category === category));
    paintGrid();
  });

  load();

  return () => {
    disposed = true;
    dispose();
  };
}
