import { debounce } from '../lib/debounce.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery } from '../lib/query.js';
import { icon } from '../ih-icons.js';
import { conversionRate, formatMoneyCompact, loadDealsSummary, openTotals, pack } from '../lib/dashboard.js';
import { loadPipelineConfig, weightedOpenTotal } from '../lib/pipeline-config.js';
import { renderShell } from '../shell.js';
import { button, emptyState, searchField, selectField } from '../ui/components.js';
import { STAGES, kanbanBoard, stageLabel } from '../ui/kanban.js';
import { createListLoader } from '../ui/list-view.js';
import { confirmDeleteDeal, openCreateDealDialog, openEditDealDialog, promptLostReason } from './deals-dialogs.js';
import { TEMPERATURE_FILTER_OPTIONS, productFilterOptions } from './deals-forms.js';

const COLUMN_LIMIT = 100; // mesmo teto que o servidor aceita (listQuery.limit.max) — ver comentário em fetchColumns().

function emptyBoard(filtered) {
  if (filtered) {
    return emptyState({
      iconName: 'search',
      title: 'Nada encontrado',
      message: 'Tente outro termo de busca ou remova os filtros.',
      action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear-filters' } }),
    });
  }
  return emptyState({
    iconName: 'pipeline',
    title: 'Nenhuma oportunidade ainda',
    message: 'Cadastre a primeira oportunidade para começar a acompanhar suas negociações.',
    action: button({ label: 'Cadastrar oportunidade', extra: { 'data-action': 'create' } }),
  });
}

/**
 * Uma leva com 5 pedidos (um por estágio) em vez de um único /deals com paginação: o quadro kanban
 * não pagina por coluna (o menor limite comum às 5 colunas já cobre o teto do servidor, 100), e cada
 * coluna precisa do próprio total/soma independente das outras. `Promise.all` (não `allSettled`):
 * uma coluna falhando também derruba as outras 4 — decisão deliberada, mesmo padrão atômico de
 * Produtos/Pessoas (uma tela, um estado de carregamento só), diferente do Painel (Plano 4), que
 * isola a falha por seção; aqui as 5 colunas formam uma coisa só (o quadro), não 5 blocos independentes.
 * Devolve `{ [stage]: { data: DealListItem[], page: {limit,offset,total} } }`; cada item já traz
 * `personName` (JOIN no servidor): nenhum pedido extra por Pessoa antes de pintar o quadro.
 */
async function fetchColumns(api, state) {
  const results = await Promise.all(
    STAGES.map((stage) =>
      api.get(
        `/api/v1/deals${buildQuery({
          q: state.q || undefined,
          temperature: state.temperature || undefined,
          productId: state.productId || undefined,
          stage,
          sort: 'created_at',
          order: 'desc',
          limit: COLUMN_LIMIT,
          offset: 0,
        })}`,
      ),
    ),
  );
  return Object.fromEntries(STAGES.map((stage, index) => [stage, results[index]]));
}

/** Faixa de números do funil inteiro (GET /deals/summary), acima do quadro. */
function funnelMetrics(summary) {
  const open = openTotals(summary);
  const metrics = [
    ['Em aberto', formatMoneyCompact(open.total), `ponderado ${formatMoneyCompact(weightedOpenTotal(summary.stages))}`],
    ['Oportunidades abertas', String(open.count)],
    ['Ganhas', formatMoneyCompact(summary.stages.won.total)],
    ['Conversão', conversionRate(summary) ?? '—'],
  ];
  return html`<div class="metric-strip" role="group" aria-label="Resumo do funil">${metrics.map(
    ([label, value, note]) => html`<div class="metric"><span class="metric-label">${label}</span><span class="metric-value">${value}</span>${note ? html`<span class="metric-note">${note}</span>` : ''}</div>`,
  )}</div>`;
}

export function renderDeals({ root, session, api, navigate }) {
  let products = [];
  let columnsData = null;
  const state = { q: '', temperature: '', productId: '' };

  const content = html`<div class="toolbar">
      <div class="toolbar-search">${searchField({ id: 'deals-search', label: 'Buscar por pessoa', placeholder: 'Buscar por pessoa…' })}</div>
      <div class="toolbar-actions">
        ${selectField({ id: 'deals-temperature', label: 'Temperatura', value: state.temperature, options: TEMPERATURE_FILTER_OPTIONS })}
        ${selectField({ id: 'deals-product', label: 'Produto', value: state.productId, options: [{ value: '', label: 'Todos' }] })}
      </div>
    </div>
    <div id="list-region" aria-live="off"></div>`;

  const disposeShell = renderShell({ root, session, navigate, active: 'deals',
    heading: 'Oportunidades',
    eyebrow: 'CRM · Funil principal',
    subtitle: 'Acompanhe cada negociação da chegada ao fechamento.',
    actions: button({ label: 'Nova oportunidade', id: 'new-deal', iconStart: icon('plus') }),
    content,
  });

  const listRegion = root.querySelector('#list-region');
  const searchInput = root.querySelector('#deals-search');
  const temperatureSelect = root.querySelector('#deals-temperature');
  const productFilterSelect = root.querySelector('#deals-product');
  const newButton = root.querySelector('#new-deal');

  // O quadro não é uma tabela paginada: usa só o núcleo de carga (guarda de resposta atrasada, foco,
  // esqueleto, erro com "Tentar de novo" — que o próprio núcleo trata —, recarga depois de mutação e a
  // trava por Oportunidade, que cobre Mover/Editar/Excluir).
  const loader = createListLoader({
    region: listRegion,
    fallback: () => searchInput,
    errorTitle: 'Não foi possível carregar as oportunidades',
    skeletonLines: 5,
    fetchData: async () => {
      const filtered = Boolean(state.q || state.temperature || state.productId);
      // O resumo é global (não respeita filtros): só aparece com o quadro sem filtro e, se falhar, o quadro segue sem ele.
      const [columns, summary] = await Promise.all([fetchColumns(api, state), filtered ? null : pack(loadDealsSummary(api)), loadPipelineConfig(api)]);
      return { columns, summary: summary?.status === 'ok' ? summary.value : null };
    },
    paint: ({ columns, summary }) => {
      columnsData = columns;
      const total = STAGES.reduce((n, stage) => n + columnsData[stage].page.total, 0);
      if (total === 0) mount(listRegion, emptyBoard(Boolean(state.q || state.temperature || state.productId)));
      else mount(listRegion, html`${summary ? funnelMetrics(summary) : ''}${kanbanBoard({ columns: STAGES.map((stage) => ({ stage, result: columnsData[stage] })) })}`);
    },
  });

  /** Só para os filtros/diálogo (produtos ativos do próprio dono). Falhar aqui não impede o quadro. */
  async function loadProducts() {
    try {
      const result = await api.get('/api/v1/products?limit=100&archived=false');
      if (loader.disposed) return;
      products = result.data;
      mount(
        productFilterSelect,
        html`${productFilterOptions(products).map((o) => html`<option${attrs({ value: o.value, selected: o.value === state.productId })}>${o.label}</option>`)}`,
      );
    } catch {
      // O filtro de produto fica só com "Todos" e o diálogo de criação só com "Nenhum (valor manual)".
    }
  }

  function findDeal(id) {
    if (!columnsData) return null;
    for (const stage of STAGES) {
      const found = columnsData[stage].data.find((deal) => deal.id === id);
      if (found) return found;
    }
    return null;
  }

  async function createDeal() {
    await loader.settle(await openCreateDealDialog({ api, products }), 'Oportunidade cadastrada.');
  }

  /**
   * Move um cartão de estágio — pelo item "Mover para <etapa>" do menu do cartão (alternativa de teclado e
   * de toque) ou soltando o cartão numa coluna (mouse). Se a pessoa cancelar o motivo da perda, nada mudou
   * no servidor: o quadro não recarrega. Em qualquer outro desfecho (sucesso, 409 de versão, 404 porque
   * outra aba já mudou o estágio) recarregamos sempre (mutate): sem isso, a version em cache ficaria
   * obsoleta e a próxima tentativa reproduziria o mesmo erro num laço sem saída. O foco (no gatilho do
   * menu) acompanha o cartão para a coluna nova: ver ui/list-focus.js.
   */
  async function moveDeal(deal, toStage) {
    const body = { toStage, version: deal.version };
    if (toStage === 'lost') {
      const reason = await promptLostReason();
      if (loader.disposed || reason === null) return;
      body.lostReason = reason;
    }
    await loader.mutate(() => api.post(`/api/v1/deals/${deal.id}/stage-transitions`, body), `Oportunidade movida para "${stageLabel(toStage)}".`);
  }

  /** Editar: recarrega também se o envio falhou e o diálogo fechou sem salvar (ver openEditDealDialog). */
  async function editDeal(deal) {
    await loader.settle(await openEditDealDialog({ api, deal, products }), 'Oportunidade atualizada.');
  }

  /** Excluir: recarrega sempre depois da tentativa (sucesso ou falha, ex.: 404 porque outra aba já excluiu). */
  async function deleteDeal(deal) {
    if (!(await confirmDeleteDeal(deal)) || loader.disposed) return;
    await loader.mutate(() => api.delete(`/api/v1/deals/${deal.id}`), 'Oportunidade excluída.');
  }

  const scheduleSearch = debounce((value) => {
    state.q = value;
    loader.load();
  }, 300);

  searchInput.addEventListener('input', (event) => scheduleSearch(event.target.value));
  temperatureSelect.addEventListener('change', (event) => {
    state.temperature = event.target.value;
    loader.load();
  });
  productFilterSelect.addEventListener('change', (event) => {
    state.productId = event.target.value;
    loader.load();
  });
  newButton.addEventListener('click', () => createDeal());

  // "Tentar de novo" (`retry`) é tratado pelo próprio núcleo de carga.
  listRegion.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    if (action === 'create') {
      createDeal();
      return;
    }
    if (action === 'clear-filters') {
      scheduleSearch.cancel();
      searchInput.value = '';
      temperatureSelect.value = '';
      productFilterSelect.value = '';
      state.q = '';
      state.temperature = '';
      state.productId = '';
      loader.load();
      searchInput.focus();
      return;
    }
    const deal = findDeal(actionButton.dataset.id);
    if (!deal) return;
    if (action === 'move-to') {
      const toStage = actionButton.dataset.stage;
      if (STAGES.includes(toStage) && toStage !== deal.stage) loader.runLocked(deal.id, () => moveDeal(deal, toStage));
    } else if (action === 'edit') {
      loader.runLocked(deal.id, () => editDeal(deal));
    } else if (action === 'delete') {
      loader.runLocked(deal.id, () => deleteDeal(deal));
    }
  });

  // Arrastar e soltar (só mouse; teclado e toque usam "Mover para…" no menu do cartão): soltar numa coluna é
  // o mesmo que escolher o item do menu — mesma função, mesmo motivo da perda, mesma recarga.
  let draggedId = null;
  const columnOf = (event) => event.target.closest?.('.kanban-column[data-stage]') ?? null;
  const clearDropTargets = () => listRegion.querySelectorAll('[data-drop-target]').forEach((el) => el.removeAttribute('data-drop-target'));
  listRegion.addEventListener('dragstart', (event) => {
    const card = event.target.closest?.('.kanban-card[data-id]');
    if (!card) return;
    draggedId = card.dataset.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedId);
    card.classList.add('is-dragging');
  });
  listRegion.addEventListener('dragend', () => {
    draggedId = null;
    listRegion.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
    clearDropTargets();
  });
  listRegion.addEventListener('dragover', (event) => {
    const column = columnOf(event);
    if (!column || !draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (column.dataset.dropTarget !== 'true') {
      clearDropTargets();
      column.dataset.dropTarget = 'true';
    }
  });
  listRegion.addEventListener('drop', (event) => {
    const column = columnOf(event);
    if (!column || !draggedId) return;
    event.preventDefault();
    const deal = findDeal(draggedId);
    const toStage = column.dataset.stage;
    draggedId = null;
    clearDropTargets();
    if (deal && deal.stage !== toStage) loader.runLocked(deal.id, () => moveDeal(deal, toStage));
  });

  loader.load();
  loadProducts();

  return () => {
    loader.dispose();
    scheduleSearch.cancel();
    disposeShell();
  };
}
