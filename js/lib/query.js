/** Monta a query string, ignorando undefined, null e ''. */
export function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Intervalo mostrado, página atual e navegação. `page`/`pages` começam em 1. */
export function pageInfo({ limit, offset, total }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;
  const from = total === 0 || offset >= total ? 0 : offset + 1;
  const to = total === 0 || offset >= total ? 0 : Math.min(offset + limit, total);
  return { from, to, page, pages, hasPrev: offset > 0, hasNext: offset + limit < total };
}

/** Offset do início da última página (para voltar quando a página atual esvazia). */
export function lastPageOffset(total, limit) {
  return total <= 0 ? 0 : Math.floor((total - 1) / limit) * limit;
}

/** "name:desc" -> { sort: 'name', order: 'desc' } (valor de um <select> de ordenação; o servidor valida as listas permitidas). */
export function parseSort(value) {
  const [sort, order] = value.split(':');
  return { sort, order };
}

/** Valor de `?nome=` no hash da rota atual (ex.: "#/pessoas?q=Ana"), ou '' se não houver. Usado pelos links da busca global. */
export function hashParam(name, hash = globalThis.location?.hash ?? '') {
  const at = String(hash).indexOf('?');
  if (at === -1) return '';
  const value = new URLSearchParams(String(hash).slice(at + 1)).get(name);
  return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}
