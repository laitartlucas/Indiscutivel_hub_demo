import { describeError } from '../lib/api.js';
import { BOARD_PERIODS, listOf, normalizePage, periodRange, summaryMetrics } from '../lib/commercial.js';
import { debounce } from '../lib/debounce.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { activeFunnels, fetchFunnels, getFunnels, pickFunnel, readLastFunnel, writeLastFunnel } from '../lib/pipeline-config.js';
import { buildQuery } from '../lib/query.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, field, searchField, selectField, skeleton } from '../ui/components.js';
import { COMMERCIAL_EYEBROW, commercialTabs } from '../ui/commercial-tabs.js';
import { kanbanBoard } from '../ui/kanban.js';
import { createListLoader } from '../ui/list-view.js';
import { confirmDeleteDeal, openCreateDealDialog, openEditDealDialog, promptLostReason } from './deals-dialogs.js';
import { activeSaleOfDeal, explainDealHasSale, openWinSaleDialog } from './sale-dialogs.js';
import { toast } from '../ui/toast.js';

const COLUMN_LIMIT = 100; // teto por coluna (o mesmo limite máximo que o servidor aceita numa listagem)
const TEXT_DELAY_MS = 300;

/** Faixa de números do funil (GET /deals/summary?funnelId), acima do quadro. */
function funnelMetrics(summary) {
  return html`<div class="metric-strip cc-metrics" role="group" aria-label="Resumo do funil">${summaryMetrics(summary).map(
    (m) => html`<div class="metric"><span class="metric-label">${m.label}</span><span class="metric-value">${m.value}</span>${m.note ? html`<span class="metric-note">${m.note}</span>` : ''}</div>`,
  )}</div>`;
}

function noFunnels() {
  return html`<section class="lead-card">${emptyState({
    iconName: 'pipeline',
    title: 'Nenhum funil ativo',
    message: 'Ative ao menos um funil em Configurações para acompanhar as suas negociações por etapa.',
    action: html`<a class="btn btn-primary" href="#/configuracoes">Abrir Configurações</a>`,
  })}</section>`;
}

const funnelSelectOptions = (current) => activeFunnels().map((f) => html`<option${attrs({ value: f.key, selected: f.key === current })}>${f.name}</option>`);

export function renderPipeline({ root, session, api, navigate, params }) {
  let disposed = false;
  let funnel = null;
  let products = null;
  let columnsData = null;
  const state = { q: '', responsible: '', period: '' };

  const content = html`${commercialTabs('pipeline')}
    <div class="cc-board-bar">
      <div class="field cc-funnel-picker">
        <label class="field-label" for="pipeline-funnel">Funil</label>
        <div class="field-control"><select id="pipeline-funnel" class="field-input" disabled><option>Carregando…</option></select></div>
      </div>
      <div class="toolbar cc-board-toolbar">
        <div class="toolbar-search">${searchField({ id: 'pipeline-search', label: 'Buscar por contato', placeholder: 'Buscar por contato…' })}</div>
        <div class="toolbar-actions">
          ${field({ id: 'pipeline-responsible', label: 'Responsável', name: 'responsible', maxlength: 80, extra: { placeholder: 'Todos' } })}
          ${selectField({ id: 'pipeline-period', label: 'Período', value: '', options: BOARD_PERIODS })}
        </div>
      </div>
    </div>
    <div id="pipeline-region" aria-live="off">${skeleton(5)}</div>`;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'commercial',
    heading: 'Pipeline',
    eyebrow: COMMERCIAL_EYEBROW,
    subtitle: 'Cada funil com as próprias etapas. Arraste os cartões para mover as negociações.',
    actions: button({ label: 'Nova oportunidade', id: 'new-deal', iconStart: icon('plus') }),
    content,
  });

  const region = root.querySelector('#pipeline-region');
  const funnelSelect = root.querySelector('#pipeline-funnel');
  const searchInput = root.querySelector('#pipeline-search');
  const responsibleInput = root.querySelector('#pipeline-responsible');
  const periodSelect = root.querySelector('#pipeline-period');
  const newButton = root.querySelector('#new-deal');
  const filtered = () => Boolean(state.q || state.responsible || state.period);

  /** Uma leva com um pedido por etapa: cada coluna precisa do próprio total, independente das outras. */
  async function fetchColumns() {
    const { from, to } = periodRange(state.period);
    const pages = await Promise.all(
      funnel.stages.map((stage) =>
        api
          .get(`/api/v1/deals${buildQuery({ funnelId: funnel.id, stageId: stage.id, q: state.q || undefined, responsible: state.responsible || undefined, from: from || undefined, to: to || undefined, sort: 'created_at', order: 'desc', limit: COLUMN_LIMIT, offset: 0 })}`)
          .then((result) => normalizePage(result, { limit: COLUMN_LIMIT, offset: 0 })),
      ),
    );
    return funnel.stages.map((stage, i) => ({ stage, result: pages[i] }));
  }

  const loader = createListLoader({
    region,
    fallback: () => searchInput,
    errorTitle: 'Não foi possível carregar o quadro',
    skeletonLines: 5,
    fetchData: async () => {
      // O resumo é do funil inteiro (não respeita filtros); se falhar, o quadro segue sem ele.
      const [columns, summary] = await Promise.all([fetchColumns(), api.get(`/api/v1/deals/summary${buildQuery({ funnelId: funnel.id })}`).catch(() => null)]);
      return { columns, summary };
    },
    paint: ({ columns, summary }) => {
      columnsData = columns;
      const total = columns.reduce((n, c) => n + c.result.page.total, 0);
      const metrics = summary ? funnelMetrics(summary) : '';
      if (total === 0) {
        mount(
          region,
          html`${metrics}${filtered()
            ? emptyState({ iconName: 'search', title: 'Nada encontrado', message: 'Tente outro termo de busca ou remova os filtros.', action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear-filters' } }) })
            : html`<div class="cc-empty-board">${emptyState({
                iconName: 'pipeline',
                title: `Nenhuma oportunidade em ${funnel.name}`,
                message: 'Abra a primeira oportunidade deste funil: escolha um contato cadastrado ou crie um novo na hora.',
                action: button({ label: 'Nova oportunidade', extra: { 'data-action': 'create' } }),
              })}</div>`}`,
        );
        return;
      }
      mount(region, html`${metrics}${kanbanBoard({ columns })}`);
    },
  });

  function findDeal(id) {
    for (const column of columnsData ?? []) {
      const found = column.result.data.find((deal) => deal.id === id);
      if (found) return found;
    }
    return null;
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

  async function createDeal() {
    if (!funnel) return;
    await ensureProducts();
    if (disposed) return;
    const outcome = await openCreateDealDialog({ api, products, funnels: activeFunnels(), funnelId: funnel.id, allowNewContact: true });
    if (disposed) return;
    const message = outcome.deal && outcome.deal.funnelId && outcome.deal.funnelId !== funnel.id ? `Oportunidade criada no funil ${outcome.deal.funnelName ?? 'escolhido'}.` : 'Oportunidade criada.';
    await loader.settle(outcome, message);
  }

  /**
   * Move um cartão para outra etapa (menu "Mover para…" ou arrastar). Perdida pede o motivo; se a aluna cancelar,
   * nada muda no servidor e o quadro não recarrega. Nos outros desfechos (sucesso, 409, 404) recarrega sempre.
   */
  async function moveDeal(deal, stageId) {
    const stage = funnel.stages.find((s) => s.id === stageId);
    if (!stage || stage.id === deal.stageId) return;
    if (stage.kind === 'won') return winDeal(deal, stage);
    // Ganha com venda ativa não sai de Ganha: avisa antes de pedir o motivo da perda (o cartão nem sai do lugar).
    if (deal.status === 'won') {
      const sale = await activeSaleOfDeal(api, deal);
      if (loader.disposed) return;
      if (sale) return explainDealHasSale({ api, deal, navigate, sale });
    }
    const body = { stageId, version: deal.version };
    if (stage.kind === 'lost') {
      const reason = await promptLostReason({ name: deal.personName });
      if (loader.disposed || reason === null) return;
      body.lostReason = reason;
    }
    const message = stage.kind === 'won' ? 'Oportunidade ganha. Parabéns!' : stage.kind === 'lost' ? 'Oportunidade marcada como perdida.' : `Oportunidade movida para "${stage.name}".`;
    try {
      await api.post(`/api/v1/deals/${encodeURIComponent(deal.id)}/stage-transitions`, body);
      if (loader.disposed) return;
      toast(message, { tone: 'success' });
    } catch (error) {
      if (loader.disposed) return;
      if (error?.code === 'deal_has_sale') await explainDealHasSale({ api, deal, navigate, message: error.detail || undefined });
      else toast(describeError(error), { tone: 'danger' });
    }
    // Sempre recarrega: no erro, o cartão volta para a coluna em que está de verdade.
    if (!loader.disposed) await loader.load();
  }

  /**
   * Ganhar: abre "Registrar venda" e envia a venda junto com a transição. "Registrar depois" ganha sem venda;
   * "Cancelar" deixa a oportunidade onde estava (nada muda no servidor).
   */
  async function winDeal(deal, stage) {
    await ensureProducts();
    if (loader.disposed) return;
    const outcome = await openWinSaleDialog({ api, deal, stageId: stage.id, products });
    if (loader.disposed) return;
    if (outcome.later) {
      await loader.mutate(() => api.post(`/api/v1/deals/${encodeURIComponent(deal.id)}/stage-transitions`, { stageId: stage.id, version: deal.version }), 'Oportunidade ganha. Parabéns! Registre a venda depois, na aba Compras do contato.');
      return;
    }
    await loader.settle(outcome, 'Oportunidade ganha e venda registrada. Parabéns!');
  }

  async function editDeal(deal) {
    await ensureProducts();
    if (disposed) return;
    await loader.settle(await openEditDealDialog({ api, deal, products }), 'Oportunidade atualizada.');
  }

  async function deleteDeal(deal) {
    if (!(await confirmDeleteDeal(deal)) || loader.disposed) return;
    await loader.mutate(() => api.delete(`/api/v1/deals/${encodeURIComponent(deal.id)}`), 'Oportunidade excluída.');
  }

  function clearFilters() {
    scheduleSearch.cancel();
    scheduleResponsible.cancel();
    searchInput.value = '';
    responsibleInput.value = '';
    periodSelect.value = '';
    Object.assign(state, { q: '', responsible: '', period: '' });
    loader.load();
    searchInput.focus();
  }

  const scheduleSearch = debounce((value) => {
    state.q = value.trim();
    loader.load();
  }, TEXT_DELAY_MS);
  const scheduleResponsible = debounce((value) => {
    state.responsible = value.trim();
    loader.load();
  }, TEXT_DELAY_MS);

  searchInput.addEventListener('input', (event) => scheduleSearch(event.target.value));
  responsibleInput.addEventListener('input', (event) => scheduleResponsible(event.target.value));
  periodSelect.addEventListener('change', (event) => {
    state.period = event.target.value;
    loader.load();
  });
  funnelSelect.addEventListener('change', (event) => navigate(`/comercial/pipeline/${encodeURIComponent(event.target.value)}`));
  newButton.addEventListener('click', () => createDeal());

  region.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'create') return void createDeal();
    if (action === 'clear-filters') return void clearFilters();
    if (action === 'retry-funnels') return void start();
    const deal = findDeal(target.dataset.id);
    if (!deal) return;
    if (action === 'move-to') loader.runLocked(deal.id, () => moveDeal(deal, target.dataset.stageId));
    else if (action === 'edit') loader.runLocked(deal.id, () => editDeal(deal));
    else if (action === 'delete') loader.runLocked(deal.id, () => deleteDeal(deal));
    else if (action === 'open') navigate(`/comercial/oportunidades/${encodeURIComponent(deal.id)}`);
  });

  // Arrastar e soltar (mouse). Teclado e toque usam "Mover para…" no menu do cartão: mesma função, mesma recarga.
  let draggedId = null;
  const columnOf = (event) => event.target.closest?.('.kanban-column[data-stage-id]') ?? null;
  const clearDropTargets = () => region.querySelectorAll('[data-drop-target]').forEach((el) => el.removeAttribute('data-drop-target'));
  region.addEventListener('dragstart', (event) => {
    const card = event.target.closest?.('.kanban-card[data-id]');
    if (!card) return;
    draggedId = card.dataset.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedId);
    card.classList.add('is-dragging');
  });
  region.addEventListener('dragend', () => {
    draggedId = null;
    region.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
    clearDropTargets();
  });
  region.addEventListener('dragover', (event) => {
    const column = columnOf(event);
    if (!column || !draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (column.dataset.dropTarget !== 'true') {
      clearDropTargets();
      column.dataset.dropTarget = 'true';
    }
  });
  region.addEventListener('drop', (event) => {
    const column = columnOf(event);
    if (!column || !draggedId) return;
    event.preventDefault();
    const deal = findDeal(draggedId);
    const stageId = column.dataset.stageId;
    draggedId = null;
    clearDropTargets();
    if (deal && deal.stageId !== stageId) loader.runLocked(deal.id, () => moveDeal(deal, stageId));
  });

  /** Lê os funis, escolhe qual abrir (rota > último aberto > primeiro ativo) e carrega o quadro. */
  async function start() {
    mount(region, skeleton(5));
    try {
      await fetchFunnels(api);
    } catch (error) {
      if (disposed) return;
      if (getFunnels().length === 0) {
        mount(region, html`<div class="card stack">${alert({ tone: 'danger', title: 'Não foi possível carregar os funis', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry-funnels' } })}</div></div>`);
        return;
      }
    }
    if (disposed) return;
    funnel = pickFunnel(getFunnels(), params.key ?? null, readLastFunnel());
    if (!funnel) {
      mount(funnelSelect, html`<option>Nenhum funil ativo</option>`);
      newButton.disabled = true;
      mount(region, noFunnels());
      return;
    }
    // Endereço com um funil inexistente/inativo: corrige o endereço sem criar entrada nova no histórico.
    if (params.key && params.key !== funnel.key) window.history.replaceState(null, '', `#/comercial/pipeline/${encodeURIComponent(funnel.key)}`);
    writeLastFunnel(funnel.key);
    funnelSelect.disabled = false;
    mount(funnelSelect, html`${funnelSelectOptions(funnel.key)}`);
    root.querySelector('h1').textContent = `Pipeline · ${funnel.name}`;
    loader.load();
  }

  start();

  return () => {
    disposed = true;
    loader.dispose();
    scheduleSearch.cancel();
    scheduleResponsible.cancel();
    disposeShell();
  };
}
