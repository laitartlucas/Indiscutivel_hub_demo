/**
 * Preferência de visualização (cartões ou tabela) guardada no navegador. Qualquer falha do armazenamento
 * (modo privado, bloqueado, cheio) é ignorada: a tela só não lembra da escolha.
 */
export const PEOPLE_VIEW_KEY = 'ih:people-view';
const VIEWS = new Set(['cards', 'table']);

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readViewPref(key, fallback = 'cards', storage = defaultStorage()) {
  try {
    const value = storage?.getItem(key);
    return VIEWS.has(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeViewPref(key, value, storage = defaultStorage()) {
  if (!VIEWS.has(value)) return;
  try {
    storage?.setItem(key, value);
  } catch {
    // sem armazenamento: só não lembra
  }
}
