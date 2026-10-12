import { formatMoney } from '../../shared/money.js';
import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { dateFormatter, dateTimeFormatter } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import {
  daysInStageLabel,
  forecastDate,
  forecastOverdue,
  forecastRelative,
  neighbourStage,
  reopenStage,
  stageTimeline,
  stepStates,
  weightedForDeal,
} from '../lib/deal-detail.js';
import { loadPipelineConfig, onPipelineConfig, pipelineStages } from '../lib/pipeline-config.js';
import { buildQuery } from '../lib/query.js';
import { dueLabel, isOverdue, KIND_LABELS, tzOffsetMinutes } from '../lib/tasks.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, emptyState, skeleton } from '../ui/components.js';
import { stageLabel, temperatureLabel, temperatureTone } from '../ui/kanban.js';
import { toast } from '../ui/toast.js';
import { companyLogo } from './companies.js';
import { openEditDealDialog, promptLostReason } from './deals-dialogs.js';
import { openTaskDialog } from './task-dialogs.js';

const STAGE_TONES = { arrived: 'neutral', talking: 'warn', proposal: 'warn', won: 'good', lost: 'bad' };
const TIMELINE_ICONS = { created: 'plus', won: 'check', lost: 'close', move: 'pipeline' };

function stepper(deal) {
  const states = stepStates(deal.stage);
  return html`<ol class="od-stepper" aria-label="Etapas do funil">${states.map(
    ({ key, state }) => html`<li${attrs({ class: `od-step is-${state}`, 'aria-current': state === 'current' ? 'step' : false })}>
      <span class="od-step-bar" aria-hidden="true"></span>
      <span class="od-step-label">${stageLabel(key)}${state === 'current' ? html`<span class="sr-only"> (etapa atual)</span>` : state === 'done' ? html`<span class="sr-only"> (concluída)</span>` : ''}</span>
    </li>`,
  )}</ol>`;
}

function stageControls(deal, history) {
  if (deal.stage === 'won' || deal.stage === 'lost') {
    return button({ label: `Reabrir em ${stageLabel(reopenStage(history))}`, variant: 'ghost', extra: { 'data-action': 'reopen' } });
  }
  const back = neighbourStage(deal.stage, -1);
  const next = neighbourStage(deal.stage, 1);
  return html`${back ? button({ label: `Voltar para ${stageLabel(back)}`, variant: 'ghost', small: true, iconStart: icon('arrowLeft', { size: 16 }), extra: { 'data-action': 'back' } }) : ''}
    ${next ? button({ label: `Avançar para ${stageLabel(next)}`, variant: 'ghost', small: true, iconEnd: icon('arrowRight', { size: 16 }), extra: { 'data-action': 'advance' } }) : ''}`;
}

function outcomeButtons(deal) {
  if (deal.stage === 'won' || deal.stage === 'lost') return '';
  return html`<button type="button" class="btn btn-lost" data-action="lose">Marcar como perdida</button>
    <button type="button" class="btn btn-gold" data-action="win">${icon('check', { size: 16 })}<span>Marcar como ganha</span></button>`;
}

function hero(deal, history) {
  const closed = deal.stage === 'won' || deal.stage === 'lost';
  const stage = deal.stage;
  return html`<section class="od-hero" aria-label="Resumo da oportunidade">
    <div class="od-hero-top">
      <div class="od-hero-main">
        <div class="od-who">
          ${deal.companyId
            ? html`<a class="od-company" href="#/empresas/${deal.companyId}">${companyLogo({ id: deal.companyId, name: deal.companyName }, 'sm')}<strong>${deal.companyName}</strong></a><span class="od-dot" aria-hidden="true">·</span>`
            : ''}
          <span>${deal.productName ?? 'Sem produto'}</span>
        </div>
        <div class="lead-badges">${badge(stageLabel(stage), STAGE_TONES[stage] ?? 'neutral')}${badge(temperatureLabel(deal.temperature), temperatureTone(deal.temperature))}</div>
        ${stage === 'lost' && deal.lostReason ? html`<p class="od-reason"><strong>Motivo da perda:</strong> ${deal.lostReason}</p>` : ''}
        ${closed && deal.closedAt ? html`<p class="muted od-closed">${stage === 'won' ? 'Fechada' : 'Encerrada'} em ${dateFormatter.format(new Date(deal.closedAt))}.</p>` : ''}
      </div>
      <div class="od-value"><span class="lead-kpi-label">Valor</span><span class="od-value-amount">${formatMoney(deal.value)}</span></div>
    </div>
    <div class="od-flow">${stepper(deal)}<div class="od-flow-moves">${stageControls(deal, history)}</div></div>
    <div class="od-actions">
      ${button({ label: 'Editar', variant: 'ghost', extra: { 'data-action': 'edit' } })}
      ${outcomeButtons(deal)}
    </div>
  </section>`;
}

function forecastCard(deal, history, stages, now) {
  const { probability, value } = weightedForDeal(deal, stages);
  const open = deal.stage !== 'won' && deal.stage !== 'lost';
  const date = forecastDate(deal.expectedCloseOn);
  const relative = open ? forecastRelative(deal.expectedCloseOn, now) : null;
  return html`<section class="od-forecast" aria-labelledby="od-forecast-title">
    <h2 id="od-forecast-title" class="od-forecast-eyebrow">Previsão de fechamento</h2>
    <div class="od-forecast-line">
      ${date
        ? html`<span class="od-forecast-date">${date}</span>${relative ? html`<span${attrs({ class: `od-forecast-rel${forecastOverdue(deal, now) ? ' is-late' : ''}` })}>${relative}</span>` : ''}`
        : html`<span class="od-forecast-date is-empty">Sem previsão</span><button type="button" class="od-forecast-set" data-action="edit">Definir</button>`}
    </div>
    <div class="od-prob">
      <div class="od-prob-line"><span>Probabilidade da etapa</span><strong>${probability}%</strong></div>
      <div class="od-prob-track" aria-hidden="true"><div class="od-prob-fill" data-width="${probability}"></div></div>
    </div>
    <div class="od-forecast-foot"><span>Ponderado <strong>${formatMoney(value)}</strong></span><span>${daysInStageLabel(deal, history, now)}</span></div>
  </section>`;
}

function taskRow(task, now) {
  const done = task.status === 'done';
  const late = isOverdue(task, now);
  return html`<li class="od-task">
    <span${attrs({ class: `od-task-check${done ? ' is-done' : ''}`, 'aria-hidden': 'true' })}>${done ? icon('check', { size: 12, stroke: 3 }) : ''}</span>
    <div class="od-task-main">
      <span${attrs({ class: `od-task-title${done ? ' is-done' : ''}` })}>${task.title}</span>
      <span${attrs({ class: `od-task-meta${late ? ' is-late' : ''}` })}>${done ? 'Concluída' : late ? 'Atrasada' : KIND_LABELS[task.kind] ?? task.kind} · ${dueLabel(task, now)}</span>
    </div>
  </li>`;
}

function tasksCard(tasks, failed, now) {
  return html`<section class="lead-card od-card" aria-labelledby="od-tasks-title">
    <div class="od-card-head"><h2 id="od-tasks-title" class="lead-card-title">Tarefas</h2><button type="button" class="od-link-btn" data-action="new-task">+ Nova</button></div>
    ${failed
      ? html`<p class="muted od-none">Não foi possível carregar as tarefas agora.</p><button type="button" class="lead-link-strong lead-link-button" data-action="reload-tasks">Tentar de novo</button>`
      : tasks.length === 0
        ? html`<p class="muted od-none">Nenhuma tarefa vinculada a esta oportunidade.</p>`
        : html`<ul class="od-tasks">${tasks.map((t) => taskRow(t, now))}</ul><a class="lead-link-strong" href="#/tarefas">Ver todas as tarefas ${icon('arrowRight', { size: 14 })}</a>`}
  </section>`;
}

function notesCard(deal) {
  return html`<section class="lead-card od-card" aria-labelledby="od-notes-title">
    <h2 id="od-notes-title" class="lead-card-title">Notas</h2>
    ${deal.notes
      ? html`<p class="od-notes">${deal.notes}</p><span class="od-notes-meta">Atualizada em ${dateTimeFormatter.format(new Date(deal.updatedAt))}</span>`
      : html`<p class="muted od-none">Nenhuma nota ainda.</p><button type="button" class="lead-link-strong lead-link-button" data-action="edit">Adicionar nota ${icon('arrowRight', { size: 14 })}</button>`}
  </section>`;
}

function historyCard(deal, history) {
  const items = stageTimeline(deal, history, stageLabel);
  return html`<section class="lead-card" aria-labelledby="od-history-title">
    <h2 id="od-history-title" class="lead-card-title">Histórico de etapas</h2>
    <ol class="tl-list od-history">${items.map((item, index) => {
      const iconName = item.kind === 'created' ? TIMELINE_ICONS.created : (TIMELINE_ICONS[item.to] ?? TIMELINE_ICONS.move);
      return html`<li${attrs({ class: `tl-item${index === 0 ? ' is-latest' : ''}` })}>
        <span class="tl-icon" aria-hidden="true">${icon(iconName, { size: 16 })}</span>
        <div class="tl-body">
          <div class="tl-head"><span class="tl-kind">${item.text}</span><span class="tl-when">${dateTimeFormatter.format(new Date(item.at))}</span></div>
          ${item.kind === 'move' ? html`<p class="tl-text">${stageLabel(item.from)} → ${stageLabel(item.to)}</p>` : ''}
        </div>
      </li>`;
    })}</ol>
  </section>`;
}

export function renderDealDetail({ root, session, api, navigate, params }) {
  const base = `/api/v1/deals/${encodeURIComponent(params.id)}`;
  let disposed = false;
  let seq = 0;
  let deal = null;
  let history = [];
  let tasks = [];
  let tasksFailed = false;
  let products = [];
  let built = false;
  let busy = false;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'deals',
    heading: 'Oportunidade',
    eyebrow: html`CRM · <a class="back-link" href="#/oportunidades">← Oportunidades</a>`,
    content: html`<div id="deal-page" aria-live="off">${skeleton(4)}</div>`,
  });

  const page = root.querySelector('#deal-page');
  const heading = root.querySelector('h1');
  const stillHere = (mine) => !disposed && mine === seq;

  function paintAll() {
    heading.textContent = deal.personName;
    const now = new Date();
    mount(
      page,
      html`${hero(deal, history)}
        <div class="lead-grid">
          <div class="lead-side">${historyCard(deal, history)}</div>
          <div class="lead-side">${forecastCard(deal, history, pipelineStages(), now)}${tasksCard(tasks, tasksFailed, now)}${notesCard(deal)}</div>
        </div>`,
    );
    // A largura da barra de probabilidade vem de dados e o CSP não aceita style inline: aplica pela CSSOM.
    for (const bar of page.querySelectorAll('[data-width]')) {
      bar.style.width = `${bar.getAttribute('data-width')}%`;
      bar.removeAttribute('data-width');
    }
    built = true;
  }

  function paintFailure(content) {
    built = false;
    mount(page, content);
    heading.textContent = 'Oportunidade';
  }

  const notFound = () =>
    html`<section class="lead-card" aria-label="Oportunidade não encontrada">${emptyState({
      iconName: 'pipeline',
      title: 'Oportunidade não encontrada',
      message: 'Ela pode ter sido excluída ou o endereço está incorreto.',
      action: html`<a class="btn btn-primary" href="#/oportunidades">Voltar para Oportunidades</a>`,
    })}</section>`;

  const retryAlert = (error) =>
    html`<div class="stack">
      ${alert({ tone: 'danger', title: 'Não foi possível carregar a oportunidade', message: describeError(error) })}
      <div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div>
    </div>`;

  async function loadTasks(mine, id) {
    try {
      const result = await api.get(`/api/v1/tasks${buildQuery({ dealId: id, view: 'all', limit: 50, tzOffset: tzOffsetMinutes() })}`);
      if (!stillHere(mine)) return;
      tasks = result.data;
      tasksFailed = false;
    } catch {
      // apoio: a tela segue sem a lista e oferece "Tentar de novo" no cartão
      if (stillHere(mine)) tasksFailed = true;
    }
  }

  /** `silent`: recarga depois de uma ação, sem trocar a tela por um esqueleto. */
  async function load({ silent = false } = {}) {
    const mine = ++seq;
    if (!silent || !built) mount(page, skeleton(4));
    try {
      const [fresh, hist] = await Promise.all([api.get(base), api.get(`${base}/history`), loadPipelineConfig(api)]);
      if (!stillHere(mine)) return;
      deal = fresh;
      history = hist.data;
      await loadTasks(mine, fresh.id);
      if (!stillHere(mine)) return;
      paintAll();
    } catch (error) {
      if (!stillHere(mine)) return;
      if (error?.status === 404) paintFailure(notFound());
      else if (silent && built) toast(describeError(error), { tone: 'danger' });
      else paintFailure(retryAlert(error));
    }
  }

  // ---------- ações ----------

  /** Muda de etapa pela transição dedicada; sucesso ou falha (409, 404), recarrega: a versão em tela pode estar velha. */
  async function move(toStage, message, extra = {}) {
    const body = { toStage, version: deal.version, ...extra };
    try {
      await api.post(`${base}/stage-transitions`, body);
      if (disposed) return;
      toast(message, { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await load({ silent: true });
  }

  async function ensureProducts() {
    if (products.length) return;
    try {
      products = (await api.get('/api/v1/products?limit=100&archived=false')).data;
    } catch {
      // o diálogo segue só com "Nenhum (valor manual)"
    }
  }

  async function editDeal() {
    await ensureProducts();
    if (disposed) return;
    const outcome = await openEditDealDialog({ api, deal, products });
    if (disposed) return;
    if (outcome.saved) toast('Oportunidade atualizada.', { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load({ silent: true });
  }

  async function lose() {
    const reason = await promptLostReason();
    if (disposed || reason === null) return;
    await move('lost', 'Oportunidade marcada como perdida.', { lostReason: reason });
  }

  async function newTask() {
    const outcome = await openTaskDialog({ api, preset: { person: { id: deal.personId, name: deal.personName }, dealId: deal.id } });
    if (disposed) return;
    if (outcome.saved) {
      toast('Tarefa criada.', { tone: 'success' });
      await load({ silent: true });
    }
  }

  const actions = {
    edit: editDeal,
    win: () => move('won', 'Oportunidade marcada como ganha.'),
    lose,
    advance: () => move(neighbourStage(deal.stage, 1), `Oportunidade movida para "${stageLabel(neighbourStage(deal.stage, 1))}".`),
    back: () => move(neighbourStage(deal.stage, -1), `Oportunidade movida para "${stageLabel(neighbourStage(deal.stage, -1))}".`),
    reopen: () => move(reopenStage(history), `Oportunidade reaberta em "${stageLabel(reopenStage(history))}".`),
    'new-task': newTask,
    'reload-tasks': () => load({ silent: true }),
  };

  const onClick = async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'retry') return void load();
    if (!Object.hasOwn(actions, action) || deal === null || busy) return;
    busy = true; // clique duplo: uma ação por vez (a segunda usaria uma versão já velha)
    try {
      await actions[action]();
    } finally {
      busy = false;
    }
  };
  page.addEventListener('click', onClick);

  // Se os rótulos/probabilidades mudarem (salvos em Configurações em outra aba da app), repinta sem nova chamada.
  const stopConfig = onPipelineConfig(() => {
    if (deal && built && !disposed) paintAll();
  });

  load();

  return () => {
    disposed = true;
    stopConfig();
    page.removeEventListener('click', onClick);
    disposeShell();
  };
}
