import { formatMoney } from '../../shared/money.js';
import { describeError } from '../lib/api.js';
import { listOf, temperatureLabel, temperatureTone } from '../lib/commercial.js';
import {
  daysInStageLabel,
  forecastDate,
  forecastOverdue,
  forecastRelative,
  historyList,
  neighbourStage,
  reopenStage,
  stageTimeline,
  stepStates,
  weightedForDeal,
} from '../lib/deal-detail.js';
import { mount } from '../lib/dom.js';
import { dateFormatter, dateTimeFormatter } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import { funnelById, loadFunnels, lostStage, onFunnels, wonStage } from '../lib/pipeline-config.js';
import { buildQuery } from '../lib/query.js';
import { KIND_LABELS, dueLabel, isOverdue, tzOffsetMinutes } from '../lib/tasks.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, emptyState, skeleton } from '../ui/components.js';
import { COMMERCIAL_EYEBROW, commercialTabs } from '../ui/commercial-tabs.js';
import { actionMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { dealStatusBadge } from './contact-detail.js';
import { confirmDeleteDeal, openEditDealDialog, promptLostReason } from './deals-dialogs.js';
import { explainDealHasSale, openSaleDialog, openWinSaleDialog } from './sale-dialogs.js';
import { saleHref, saleStatusBadge } from './sales.js';
import { money } from '../lib/finance.js';
import { openTaskDialog } from './task-dialogs.js';

const TIMELINE_ICONS = { created: 'plus', won: 'check', lost: 'close', move: 'pipeline' };

/** Etapas do funil da oportunidade; se o funil não estiver na lista (ainda carregando), só a etapa atual. */
function stagesOf(deal) {
  const funnel = funnelById(deal.funnelId);
  if (funnel) return funnel.stages;
  return [{ id: deal.stageId, name: deal.stageName ?? 'Etapa atual', probability: deal.status === 'won' ? 100 : 0, kind: deal.status === 'open' ? 'open' : deal.status }];
}

function stepper(deal, stages) {
  const states = stepStates(stages, deal);
  return html`<ol class="od-stepper" aria-label="Etapas do funil ${deal.funnelName ?? ''}">${states.map(
    ({ stage, state }) => html`<li${attrs({ class: `od-step is-${state}`, 'aria-current': state === 'current' ? 'step' : false })}>
      <span class="od-step-bar" aria-hidden="true"></span>
      <span class="od-step-label">${stage.name}${state === 'current' ? html`<span class="sr-only"> (etapa atual)</span>` : state === 'done' ? html`<span class="sr-only"> (concluída)</span>` : ''}</span>
    </li>`,
  )}</ol>`;
}

function stageControls(deal, stages, history) {
  if (deal.status !== 'open') {
    const target = reopenStage(stages, history);
    return target ? button({ label: `Reabrir em ${target.name}`, variant: 'ghost', extra: { 'data-action': 'reopen' } }) : '';
  }
  const back = neighbourStage(stages, deal.stageId, -1);
  const next = neighbourStage(stages, deal.stageId, 1);
  const others = stages.filter((s) => s.kind === 'open' && s.id !== deal.stageId);
  return html`${back ? button({ label: `Voltar para ${back.name}`, variant: 'ghost', small: true, iconStart: icon('arrowLeft', { size: 16 }), extra: { 'data-action': 'back' } }) : ''}
    ${next ? button({ label: `Avançar para ${next.name}`, variant: 'ghost', small: true, iconEnd: icon('arrowRight', { size: 16 }), extra: { 'data-action': 'advance' } }) : ''}
    ${others.length > 1
      ? actionMenu({ label: 'Mover para outra etapa', id: deal.id, items: [{ group: 'Mover para', items: others.map((s) => ({ label: s.name, action: 'move-to', id: deal.id, ariaLabel: `Mover para ${s.name}`, extra: { 'data-stage-id': s.id } })) }] })
      : ''}`;
}

function outcomeButtons(deal) {
  if (deal.status !== 'open') return '';
  return html`<button type="button" class="btn btn-lost" data-action="lose">Marcar como perdida</button>
    <button type="button" class="btn btn-gold" data-action="win">${icon('check', { size: 16 })}<span>Marcar como ganha</span></button>`;
}

function hero(deal, stages, history) {
  return html`<section class="od-hero" aria-label="Resumo da oportunidade">
    <div class="od-hero-top">
      <div class="od-hero-main">
        <div class="od-who">
          <a class="od-company" href="#/comercial/contatos/${encodeURIComponent(deal.personId)}">${icon('contatos', { size: 16 })}<strong>${deal.personName}</strong></a>
          <span class="od-dot" aria-hidden="true">·</span><span>${deal.funnelName ?? 'Funil'}</span>
          <span class="od-dot" aria-hidden="true">·</span><span>${deal.productName ?? 'Sem produto'}</span>
          ${deal.campaignId ? html`<span class="od-dot" aria-hidden="true">·</span><a class="cc-tl-link fin-inline-link" href="#/marketing/campanhas/${encodeURIComponent(deal.campaignId)}">Campanha: ${deal.campaignName ?? 'ver'}</a>` : ''}
        </div>
        <div class="lead-badges">${dealStatusBadge(deal)}${deal.temperature ? badge(temperatureLabel(deal.temperature), temperatureTone(deal.temperature)) : ''}${deal.responsible ? html`<span class="cc-responsible">${icon('contatos', { size: 14 })}${deal.responsible}</span>` : ''}</div>
        ${deal.status === 'lost' && deal.lostReason ? html`<p class="od-reason"><strong>Motivo da perda:</strong> ${deal.lostReason}</p>` : ''}
        ${deal.status !== 'open' && deal.closedAt ? html`<p class="muted od-closed">${deal.status === 'won' ? 'Fechada' : 'Encerrada'} em ${dateFormatter.format(new Date(deal.closedAt))}.</p>` : ''}
      </div>
      <div class="od-value"><span class="lead-kpi-label">Valor</span><span class="od-value-amount">${formatMoney(deal.value)}</span></div>
    </div>
    <div class="od-flow">${stepper(deal, stages)}<div class="od-flow-moves">${stageControls(deal, stages, history)}</div></div>
    <div class="od-actions">
      ${button({ label: 'Editar', variant: 'ghost', extra: { 'data-action': 'edit' } })}
      ${button({ label: 'Excluir', variant: 'ghost', extra: { 'data-action': 'delete' } })}
      ${outcomeButtons(deal)}
    </div>
  </section>`;
}

function forecastCard(deal, stages, history, now) {
  const { probability, value } = weightedForDeal(deal, stages);
  const open = deal.status === 'open';
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
      <div class="od-prob-track" aria-hidden="true"><div class="od-prob-fill" data-w="${probability}"></div></div>
    </div>
    <div class="od-forecast-foot"><span>Ponderado <strong>${formatMoney(value)}</strong></span><span>${open ? daysInStageLabel(deal, history, now) : ''}</span></div>
  </section>`;
}

function taskRow(task, now) {
  const done = task.status === 'done';
  const late = isOverdue(task, now);
  return html`<li class="od-task">
    <span${attrs({ class: `od-task-check${done ? ' is-done' : ''}`, 'aria-hidden': 'true' })}>${done ? icon('check', { size: 12, stroke: 3 }) : ''}</span>
    <div class="od-task-main">
      <span${attrs({ class: `od-task-title${done ? ' is-done' : ''}` })}>${task.title}</span>
      <span${attrs({ class: `od-task-meta${late ? ' is-late' : ''}` })}>${done ? 'Concluída' : late ? 'Atrasada' : (KIND_LABELS[task.kind] ?? task.kind)} · ${dueLabel(task, now)}</span>
    </div>
  </li>`;
}

function tasksCard(tasks, failed, now) {
  return html`<section class="lead-card od-card" aria-labelledby="od-tasks-title">
    <div class="od-card-head"><h2 id="od-tasks-title" class="lead-card-title">Tarefas</h2><button type="button" class="od-link-btn" data-action="new-task">+ Nova</button></div>
    ${failed
      ? html`<p class="muted od-none">Não foi possível carregar as tarefas agora.</p><button type="button" class="lead-link-strong lead-link-button" data-action="reload">Tentar de novo</button>`
      : tasks.length === 0
        ? html`<p class="muted od-none">Nenhuma tarefa ligada a esta oportunidade.</p>`
        : html`<ul class="od-tasks">${tasks.map((t) => taskRow(t, now))}</ul><a class="lead-link-strong" href="#/tarefas">Ver todas as tarefas ${icon('arrowRight', { size: 14 })}</a>`}
  </section>`;
}

function notesCard(deal) {
  return html`<section class="lead-card od-card" aria-labelledby="od-notes-title">
    <h2 id="od-notes-title" class="lead-card-title">Observações</h2>
    ${deal.notes
      ? html`<p class="od-notes">${deal.notes}</p>${deal.updatedAt ? html`<span class="od-notes-meta">Atualizada em ${dateTimeFormatter.format(new Date(deal.updatedAt))}</span>` : ''}`
      : html`<p class="muted od-none">Nenhuma observação ainda.</p><button type="button" class="lead-link-strong lead-link-button" data-action="edit">Adicionar observação ${icon('arrowRight', { size: 14 })}</button>`}
  </section>`;
}

/** Oportunidade ganha: a venda ligada a ela (ou o convite para registrá-la, se ficou para depois). */
function saleCard(deal, sale) {
  if (deal.status !== 'won') return '';
  return html`<section class="lead-card od-card" aria-labelledby="od-sale-title">
    <div class="od-card-head"><h2 id="od-sale-title" class="lead-card-title">Venda</h2>${sale ? saleStatusBadge(sale.financialStatus) : ''}</div>
    ${sale
      ? html`<p class="od-none">${sale.description}: recebido ${money(sale.received)} de ${money(sale.finalValue)}.</p><a class="lead-link-strong" href="${saleHref(sale.id)}">Abrir venda ${icon('arrowRight', { size: 14 })}</a>`
      : sale === null
        ? html`<p class="muted od-none">Nenhuma venda registrada para esta oportunidade. Fechar não é receber: registre a venda com as parcelas para acompanhar o que entra.</p><button type="button" class="lead-link-strong lead-link-button" data-action="register-sale">Registrar venda ${icon('arrowRight', { size: 14 })}</button>`
        : html`<p class="muted od-none">Não foi possível ver a venda agora.</p><a class="lead-link-strong" href="#/comercial/contatos/${encodeURIComponent(deal.personId)}?aba=compras">Ver compras do contato ${icon('arrowRight', { size: 14 })}</a>`}
  </section>`;
}

function historyCard(deal, history) {
  const items = stageTimeline(deal, history);
  return html`<section class="lead-card" aria-labelledby="od-history-title">
    <h2 id="od-history-title" class="lead-card-title">Histórico de etapas</h2>
    <ol class="tl-list od-history">${items.map((item, index) => {
      const iconName = item.kind === 'created' ? TIMELINE_ICONS.created : (TIMELINE_ICONS[item.status] ?? TIMELINE_ICONS.move);
      return html`<li${attrs({ class: `tl-item${index === 0 ? ' is-latest' : ''}` })}>
        <span class="tl-icon" aria-hidden="true">${icon(iconName, { size: 16 })}</span>
        <div class="tl-body">
          <div class="tl-head"><span class="tl-kind">${item.text}</span><span class="tl-when">${item.at ? dateTimeFormatter.format(new Date(item.at)) : ''}</span></div>
          ${item.kind === 'move' && item.from && item.to ? html`<p class="tl-text">${item.from} → ${item.to}</p>` : ''}
        </div>
      </li>`;
    })}</ol>
  </section>`;
}

export function renderOpportunityDetail({ root, session, api, navigate, params }) {
  const base = `/api/v1/deals/${encodeURIComponent(params.id)}`;
  let disposed = false;
  let seq = 0;
  let deal = null;
  let history = [];
  let tasks = [];
  let tasksFailed = false;
  let products = null;
  let built = false;
  let busy = false;
  // Venda ligada (só oportunidade ganha): objeto, null (nenhuma) ou undefined (não deu para consultar).
  let linkedSale = undefined;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'commercial',
    heading: 'Oportunidade',
    eyebrow: html`${COMMERCIAL_EYEBROW} · <a class="back-link" href="#/comercial/pipeline">← Pipeline</a>`,
    content: html`${commercialTabs('pipeline')}<div id="deal-page" aria-live="off">${skeleton(4)}</div>`,
  });

  const page = root.querySelector('#deal-page');
  const heading = root.querySelector('h1');
  const backLink = root.querySelector('.back-link');
  const stillHere = (mine) => !disposed && mine === seq;

  function paintAll() {
    const stages = stagesOf(deal);
    heading.textContent = deal.personName;
    const funnel = funnelById(deal.funnelId);
    if (backLink && funnel) {
      backLink.setAttribute('href', `#/comercial/pipeline/${encodeURIComponent(funnel.key)}`);
      backLink.textContent = `← ${funnel.name}`;
    }
    const now = new Date();
    mount(
      page,
      html`${hero(deal, stages, history)}
        <div class="lead-grid">
          <div class="lead-side">${historyCard(deal, history)}</div>
          <div class="lead-side">${saleCard(deal, linkedSale)}${forecastCard(deal, stages, history, now)}${tasksCard(tasks, tasksFailed, now)}${notesCard(deal)}</div>
        </div>`,
    );
    applySizes(page); // a barra de probabilidade vem de dados e o CSP não aceita style inline
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
      action: html`<a class="btn btn-primary" href="#/comercial/pipeline">Voltar para o Pipeline</a>`,
    })}</section>`;

  const retryAlert = (error) =>
    html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar a oportunidade', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;

  async function loadTasks(mine, id) {
    try {
      const result = await api.get(`/api/v1/tasks${buildQuery({ dealId: id, view: 'all', limit: 50, tzOffset: tzOffsetMinutes() })}`);
      if (!stillHere(mine)) return;
      tasks = listOf(result);
      tasksFailed = false;
    } catch {
      if (stillHere(mine)) tasksFailed = true;
    }
  }

  async function loadSale(mine, fresh) {
    if (fresh.status !== 'won') return;
    try {
      const result = await api.get(`/api/v1/sales${buildQuery({ personId: fresh.personId, limit: 100 })}`);
      if (!stillHere(mine)) return;
      linkedSale = listOf(result).find((s) => s.dealId === fresh.id) ?? null;
    } catch {
      if (stillHere(mine)) linkedSale = undefined;
    }
  }

  async function load({ silent = false } = {}) {
    const mine = ++seq;
    if (!silent || !built) mount(page, skeleton(4));
    try {
      const [fresh, hist] = await Promise.all([api.get(base), api.get(`${base}/history`), loadFunnels(api)]);
      if (!stillHere(mine)) return;
      deal = fresh;
      history = historyList(hist);
      await Promise.all([loadTasks(mine, fresh.id), loadSale(mine, fresh)]);
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
  /** Ganha com venda ativa já conhecida: explica direto (nem pede o motivo da perda). */
  const blockedBySale = () => deal?.status === 'won' && linkedSale?.status === 'active';

  async function move(stage, message, extra = {}) {
    if (!stage) return;
    if (blockedBySale()) return void (await explainDealHasSale({ api, deal, navigate, sale: linkedSale }));
    try {
      await api.post(`${base}/stage-transitions`, { stageId: stage.id, version: deal.version, ...extra });
      if (disposed) return;
      toast(message, { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      if (error?.code === 'deal_has_sale') await explainDealHasSale({ api, deal, navigate, message: error.detail || undefined });
      else toast(describeError(error), { tone: 'danger' });
    }
    await load({ silent: true });
  }

  async function ensureProducts() {
    if (products) return products;
    try {
      products = listOf(await api.get('/api/v1/products?limit=100&archived=false'));
    } catch {
      products = [];
    }
    return products;
  }

  async function editDeal() {
    await ensureProducts();
    if (disposed) return;
    const outcome = await openEditDealDialog({ api, deal, products });
    if (disposed) return;
    if (outcome.saved) toast('Oportunidade atualizada.', { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load({ silent: true });
  }

  /** Ganhar abre "Registrar venda" (venda e etapa na mesma transação); "Registrar depois" só muda a etapa. */
  async function win() {
    const stage = wonStage(funnelById(deal.funnelId));
    if (!stage) return void toast('Não foi possível achar a etapa "Ganha" deste funil. Recarregue a página.', { tone: 'danger' });
    await ensureProducts();
    if (disposed) return;
    const outcome = await openWinSaleDialog({ api, deal, stageId: stage.id, products });
    if (disposed) return;
    if (outcome.later) return void (await move(stage, 'Oportunidade ganha. Parabéns! Registre a venda quando quiser.'));
    if (outcome.saved) toast('Oportunidade ganha e venda registrada. Parabéns!', { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load({ silent: true });
  }

  async function registerSale() {
    await ensureProducts();
    if (disposed) return;
    const outcome = await openSaleDialog({ api, person: { id: deal.personId, name: deal.personName }, deal, products });
    if (disposed) return;
    if (outcome.saved) toast('Venda registrada.', { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load({ silent: true });
  }

  async function lose() {
    const stage = lostStage(funnelById(deal.funnelId));
    if (!stage) return void toast('Não foi possível achar a etapa "Perdida" deste funil. Recarregue a página.', { tone: 'danger' });
    if (blockedBySale()) return void (await explainDealHasSale({ api, deal, navigate, sale: linkedSale }));
    const reason = await promptLostReason({ name: deal.personName });
    if (disposed || reason === null) return;
    await move(stage, 'Oportunidade marcada como perdida. O contato continua cadastrado.', { lostReason: reason });
  }

  async function removeDeal() {
    if (!(await confirmDeleteDeal(deal)) || disposed) return;
    try {
      await api.delete(base);
      toast('Oportunidade excluída.', { tone: 'success' });
      navigate(`/comercial/contatos/${encodeURIComponent(deal.personId)}`);
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
      await load({ silent: true });
    }
  }

  async function newTask() {
    const outcome = await openTaskDialog({ api, preset: { person: { id: deal.personId, name: deal.personName }, dealId: deal.id } });
    if (disposed) return;
    if (outcome.saved) {
      toast('Tarefa criada.', { tone: 'success' });
      await load({ silent: true });
    }
  }

  const step = (direction) => {
    const target = neighbourStage(stagesOf(deal), deal.stageId, direction);
    return move(target, `Oportunidade movida para "${target?.name ?? ''}".`);
  };

  const actions = {
    edit: editDeal,
    delete: removeDeal,
    win,
    lose,
    'register-sale': registerSale,
    advance: () => step(1),
    back: () => step(-1),
    reopen: () => {
      const target = reopenStage(stagesOf(deal), history);
      return move(target, `Oportunidade reaberta em "${target?.name ?? ''}".`);
    },
    'new-task': newTask,
    reload: () => load({ silent: true }),
  };

  const onClick = async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'retry') return void load();
    if (deal === null || busy) return;
    let run = Object.hasOwn(actions, action) ? actions[action] : null;
    if (action === 'move-to') {
      const stage = stagesOf(deal).find((s) => s.id === target.dataset.stageId);
      run = () => move(stage, `Oportunidade movida para "${stage?.name ?? ''}".`);
    }
    if (!run) return;
    busy = true; // uma ação por vez (a segunda usaria uma versão já velha)
    try {
      await run();
    } finally {
      busy = false;
    }
  };
  page.addEventListener('click', onClick);

  // Nome de etapa ou de funil editado em Configurações (outra aba da app): repinta sem nova chamada.
  const stopFunnels = onFunnels(() => {
    if (deal && built && !disposed) paintAll();
  });

  load();

  return () => {
    disposed = true;
    stopFunnels();
    page.removeEventListener('click', onClick);
    disposeShell();
  };
}
