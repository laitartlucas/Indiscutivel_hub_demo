import { buildQuery } from './query.js';
import { tzOffsetMinutes } from './tasks.js';

// Selo do menu "Tarefas": atrasadas + as de hoje ainda abertas (vindas de GET /tasks/summary).
// O menu é redesenhado a cada troca de tela, então o último número fica aqui e cada menu novo já nasce com ele.
// Falha silenciosa: sem resposta, o selo some ou fica como estava; nunca vira erro na tela.

let api = null;
let count = null;
let lastFetch = 0;
let inflight = null;
const listeners = new Set();
const MIN_INTERVAL_MS = 1500;

export function configureTasksBadge(client) {
  api = client;
}

/** Valor atual (número) ou null enquanto desconhecido. */
export function getTasksBadge() {
  return count;
}

export function setTasksBadge(next) {
  const value = Number.isInteger(next) && next >= 0 ? next : null;
  if (value === count) return;
  count = value;
  for (const listener of listeners) listener(count);
}

/** Esquece tudo (saída da conta). */
export function resetTasksBadge() {
  lastFetch = 0;
  inflight = null;
  setTasksBadge(null);
}

export function onTasksBadge(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Busca o resumo (no máximo uma vez a cada 1,5 s) e atualiza o selo. Nunca lança. */
export function refreshTasksBadge({ force = false } = {}) {
  if (!api) return Promise.resolve();
  if (inflight) return inflight;
  if (!force && Date.now() - lastFetch < MIN_INTERVAL_MS) return Promise.resolve();
  lastFetch = Date.now();
  inflight = api
    .get(`/api/v1/tasks/summary${buildQuery({ tzOffset: tzOffsetMinutes() })}`)
    .then((summary) => setTasksBadge((summary?.overdue ?? 0) + (summary?.today ?? 0)))
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
