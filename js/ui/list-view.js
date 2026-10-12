import { describeError } from '../lib/api.js';
import { debounce } from '../lib/debounce.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { createRequestGuard, createRowLock, pageOffset, recoveryOffset, withFilters } from '../lib/list-state.js';
import { buildQuery, hashParam, pageInfo } from '../lib/query.js';
import { alert, button, skeleton } from './components.js';
import { openTrackedFormDialog } from './form-dialog.js';
import { createListFocus } from './list-focus.js';
import { cardGrid } from './card-grid.js';
import { dataTable, pager } from './table.js';
import { toast } from './toast.js';

const LIMIT = 20;
const SEARCH_DELAY_MS = 300;

/**
 * Núcleo de uma região que carrega da API e se redesenha (tabela paginada, quadro kanban…).
 *
 * - `fetchData()` busca; `paint(result)` desenha; `recover(result)` (opcional) pode atualizar o estado
 *   e devolve true para descartar a resposta e carregar de novo (ex.: página que esvaziou).
 * - Toda carga passa pela guarda de resposta atrasada e pelo `listFocus.capture()/restore()`
 *   (foco do teclado preservado no paginador, na ação da linha ou no "Tentar de novo").
 * - Falha de carga vira o alerta com "Tentar de novo" (`data-action="retry"`), que esta região
 *   mesma trata — quem usa não deve despachar `retry` de novo.
 * - Toda mutação recarrega depois, no sucesso E na falha (409 porque outra aba mudou o item, 404
 *   porque ele sumiu): sem isso a linha manteria a version antiga ou ficaria na tela como fantasma,
 *   e cada nova tentativa repetiria o mesmo erro.
 */
export function createListLoader({ region, fallback, errorTitle, skeletonLines = 4, fetchData, paint, recover }) {
  const guard = createRequestGuard();
  const focus = createListFocus(region, { fallback });
  const runLocked = createRowLock();

  function paintError(error) {
    mount(
      region,
      html`<div class="card stack">
        ${alert({ tone: 'danger', title: errorTitle, message: describeError(error) })}
        <div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div>
      </div>`,
    );
  }

  async function load() {
    const myId = guard.next();
    focus.capture();
    region.setAttribute('aria-busy', 'true');
    mount(region, skeleton(skeletonLines));
    try {
      const result = await fetchData();
      if (guard.isStale(myId)) return;
      if (recover?.(result)) {
        await load();
        return;
      }
      paint(result);
    } catch (error) {
      if (guard.isStale(myId)) return;
      paintError(error);
    }
    region.setAttribute('aria-busy', 'false');
    focus.restore();
  }

  /** Executa `request()`, avisa (sucesso ou erro) e SEMPRE recarrega — ver o comentário do módulo. */
  async function mutate(request, successMessage) {
    try {
      await request();
      if (guard.disposed) return;
      toast(successMessage, { tone: 'success' });
    } catch (error) {
      if (guard.disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await load();
  }

  /** Desfecho de um diálogo de formulário: salvou → aviso + recarga; fechou depois de uma falha → só recarga. */
  async function settle({ saved, hadFailure }, successMessage) {
    if (guard.disposed) return;
    if (saved) toast(successMessage, { tone: 'success' });
    if (saved || hadFailure) await load();
  }

  /** openFormDialog() + settle(): opções iguais às de openFormDialog(). */
  async function formDialog(options, successMessage) {
    await settle(await openTrackedFormDialog(options), successMessage);
  }

  region.addEventListener('click', (event) => {
    if (event.target.closest('[data-action]')?.dataset.action === 'retry') load();
  });

  return {
    load,
    /** Redesenha com um resultado já em mãos (troca de visualização), sem nova chamada à API. */
    repaint: (result) => paint(result),
    mutate,
    settle,
    formDialog,
    /** Trava por linha (clique duplo): `runLocked(row.id, () => acao(row))`. */
    runLocked,
    get disposed() {
      return guard.disposed;
    },
    dispose: () => guard.dispose(),
  };
}

/**
 * Tela de lista em tabela paginada com busca (Produtos, Pessoas, Clientes) sobre createListLoader().
 *
 * Configuração: `api`; `region` (#list-region) e `search` (<input> de busca: debounce de 300 ms e
 * destino do foco quando a região não tem para onde levá-lo); `endpoint` e `filters` (valores
 * iniciais; a query string leva `q`, os filtros, `limit` e `offset`, e a ordem dos filtros nela é a
 * ordem de inserção das chaves de `filters`); `caption` e
 * `columns` de dataTable() (e `dense` opcional, células mais justas); `empty(state)` (estado vazio, filtrado ou não); `errorTitle`;
 * `actions` ({ [data-action]: () => … }) e `rowActions` ({ [data-action]: (row) => … }, achadas pelo
 * `data-id` do botão e protegidas pela trava por linha). "Limpar busca" (`clear-search`), paginador
 * e "Tentar de novo" já vêm ligados.
 *
 * Visualização opcional em cartões: `cards` ({ render(row), label }) + `view` ('cards' | 'table', a
 * inicial). Os dois modos mostram os MESMOS dados, estados e paginador; `setView(mode)` redesenha a página
 * já carregada, sem pedir de novo à API. As ações por linha (`rowActions`) valem nos dois.
 */
export function createListView({ api, region, search, endpoint, filters = {}, caption, columns, dense = false, empty, errorTitle, actions = {}, rowActions = {}, cards = null, view = 'table' }) {
  // Vindo da busca global ("#/pessoas?q=Ana"), a lista já abre filtrada.
  const initialQ = search ? hashParam('q') : '';
  if (initialQ) search.value = initialQ;
  let state = { q: initialQ, ...filters, offset: 0 };
  let rows = [];
  let lastResult = null;
  let mode = cards ? view : 'table';

  const loader = createListLoader({
    region,
    errorTitle,
    fallback: () => search,
    fetchData: () => {
      const { offset, ...params } = state;
      return api.get(`${endpoint}${buildQuery({ ...params, limit: LIMIT, offset })}`);
    },
    recover: (result) => {
      const offset = recoveryOffset(result, state.offset, LIMIT);
      if (offset === null) return false;
      state = { ...state, offset };
      return true;
    },
    paint: (result) => {
      lastResult = result;
      rows = result.data;
      if (rows.length === 0) {
        mount(region, empty(state));
        return;
      }
      const { limit, offset, total } = result.page;
      const body = mode === 'cards' ? cardGrid({ label: cards.label ?? caption, rows, render: cards.render }) : dataTable({ caption, columns, rows, dense });
      mount(region, html`${body}${pager({ info: pageInfo({ limit, offset, total }), total })}`);
    },
  });

  /** Troca table/cards e redesenha a página que já está na tela (sem nova chamada à API). */
  function setView(next) {
    if (!cards || next === mode) return;
    mode = next;
    if (lastResult && !region.querySelector('[data-action="retry"]') && region.getAttribute('aria-busy') !== 'true') {
      loader.repaint(lastResult);
    }
  }

  /** Aplica filtros novos (volta à 1ª página) e recarrega. */
  function setFilters(patch) {
    state = withFilters(state, patch);
    loader.load();
  }

  const scheduleSearch = debounce((value) => setFilters({ q: value }), SEARCH_DELAY_MS);
  search.addEventListener('input', (event) => scheduleSearch(event.target.value));

  /** Esvazia a busca (e aplica `patch`, ex.: outros filtros zerados), recarrega e devolve o foco à busca. */
  function resetSearch(patch = {}) {
    scheduleSearch.cancel();
    search.value = '';
    setFilters({ q: '', ...patch });
    search.focus();
  }

  region.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      state = { ...state, offset: pageOffset(pageButton.dataset.page, state.offset, LIMIT) };
      loader.load();
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    if (action === 'clear-search') {
      resetSearch();
      return;
    }
    if (Object.hasOwn(actions, action)) {
      actions[action]();
      return;
    }
    const rowAction = Object.hasOwn(rowActions, action) ? rowActions[action] : null;
    const row = rowAction && rows.find((r) => r.id === actionButton.dataset.id);
    if (row) loader.runLocked(row.id, () => rowAction(row));
  });

  return {
    load: loader.load,
    mutate: loader.mutate,
    settle: loader.settle,
    formDialog: loader.formDialog,
    setFilters,
    resetSearch,
    setView,
    get view() {
      return mode;
    },
    get state() {
      return state;
    },
    get disposed() {
      return loader.disposed;
    },
    dispose() {
      loader.dispose();
      scheduleSearch.cancel();
    },
  };
}
