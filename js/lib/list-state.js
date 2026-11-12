import { lastPageOffset } from './query.js';

// Regras puras do controlador de lista (ui/list-view.js), separadas para teste em node:test.

/** Filtro novo (busca, <select>) sempre volta à 1ª página: um offset antigo poderia cair além do total filtrado. */
export function withFilters(state, patch) {
  return { ...state, ...patch, offset: 0 };
}

/** Offset depois de um clique no paginador (`data-page="prev"` ou `"next"`). */
export function pageOffset(direction, offset, limit) {
  return direction === 'prev' ? Math.max(0, offset - limit) : offset + limit;
}

/**
 * A página atual voltou vazia mas não é a primeira (ex.: arquivou/excluiu o último item da última
 * página, ou outra aba apagou itens): devolve o offset da última página que ainda existe, para
 * recarregar lá. `null` quando não há o que recuperar (pinta a resposta como veio).
 */
export function recoveryOffset(result, offset, limit) {
  return result.data.length === 0 && offset > 0 ? lastPageOffset(result.page.total, limit) : null;
}

/**
 * Guarda de resposta atrasada: cada carga pega um número com `next()`; ao chegar a resposta, só
 * pinta se ainda for a carga mais recente e a tela não tiver sido desmontada (`isStale(id)`) —
 * senão uma busca lenta antiga sobrescreveria a mais nova, ou pintaria numa tela que já saiu.
 */
export function createRequestGuard() {
  let current = 0;
  let disposed = false;
  return {
    next: () => ++current,
    isStale: (id) => disposed || id !== current,
    dispose() {
      disposed = true;
    },
    get disposed() {
      return disposed;
    },
  };
}

/**
 * Trava por linha contra clique duplo: enquanto a ação de uma chave (e a recarga que ela faz) não
 * termina, novos pedidos com a mesma chave são ignorados — um 2º envio com a mesma `version` voltaria
 * como um falso 409 de conflito, e um 2º "Editar" abriria dois diálogos.
 */
export function createRowLock() {
  const busy = new Set();
  return async function runLocked(key, action) {
    if (busy.has(key)) return;
    busy.add(key);
    try {
      await action();
    } finally {
      busy.delete(key);
    }
  };
}

/**
 * Lista paginada no formato que as telas usam: `{ data, page: { limit, offset, total } }`. Aceita o formato do
 * contrato da Central Comercial (`{ rows, total }`) e o formato antigo das outras listas (`{ data, page }`).
 */
export function normalizePage(result, { limit = 20, offset = 0 } = {}) {
  if (result && Array.isArray(result.rows)) {
    return { data: result.rows, page: { limit, offset, total: Number.isInteger(result.total) ? result.total : result.rows.length } };
  }
  if (result && Array.isArray(result.data) && result.page) return result;
  if (Array.isArray(result)) return { data: result, page: { limit, offset, total: result.length } };
  return { data: [], page: { limit, offset, total: 0 } };
}
