// Origens de lead da aluna (GET/PUT /api/v1/lead-sources), lidas uma vez por sessão.
// As telas de Pessoas e Leads leem daqui (síncrono). Sem a leitura valem as 6 origens padrão: nunca bloqueia uma tela.
// Origem arquivada some dos formulários, mas continua com nome em tudo que já a usa.

export const DEFAULT_SOURCES = Object.freeze(
  [
    ['referral', 'Indicação'],
    ['organic', 'Orgânico'],
    ['meta_ads', 'Meta Ads'],
    ['google_ads', 'Google Ads'],
    ['event', 'Evento'],
    ['other', 'Outro'],
  ].map(([key, label], index) => Object.freeze({ key, label, archived: false, position: index + 1 })),
);

let current = DEFAULT_SOURCES;
let ready = null;
let generation = 0;

function isValid(list) {
  return (
    Array.isArray(list) &&
    list.length > 0 &&
    list.every((s) => s && typeof s.key === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(s.key) && typeof s.label === 'string' && s.label.trim() !== '' && typeof s.archived === 'boolean')
  );
}

/** Todas as origens (inclusive arquivadas), na ordem da aluna. */
export function allSources() {
  return current;
}

/** Nome da origem; chave desconhecida volta como veio. */
export function sourceLabel(key) {
  return current.find((s) => s.key === key)?.label ?? key;
}

/** Opções do formulário: só as ativas, mais a origem atual do registro se ela estiver arquivada. */
export function sourceOptions(selectedKey = null) {
  return current.filter((s) => !s.archived || s.key === selectedKey).map((s) => ({ value: s.key, label: s.archived ? `${s.label} (arquivada)` : s.label }));
}

/** Opções do filtro: todas as origens, inclusive arquivadas (os registros antigos continuam filtráveis). */
export function sourceFilterOptions() {
  return [{ value: '', label: 'Todas' }, ...current.map((s) => ({ value: s.key, label: s.archived ? `${s.label} (arquivada)` : s.label }))];
}

export function setSources(list) {
  if (!isValid(list)) return false;
  current = list.map((s, index) => Object.freeze({ key: s.key, label: s.label.trim(), archived: s.archived, position: index + 1 }));
  return true;
}

export function resetSources() {
  generation += 1;
  current = DEFAULT_SOURCES;
  ready = null;
}

/** Lê uma vez por sessão. Nunca rejeita: em falha ficam os padrões e a próxima chamada tenta de novo. */
export function loadSources(api) {
  if (ready) return ready;
  const mine = generation;
  ready = api
    .get('/api/v1/lead-sources')
    .then((result) => {
      if (mine === generation) setSources(result?.sources);
    })
    .catch(() => {
      if (mine === generation) ready = null;
    });
  return ready;
}

/** Origem inicial de um cadastro novo: "Outro" se estiver ativa, senão a primeira ativa. */
export function defaultSourceKey() {
  const active = current.filter((s) => !s.archived);
  return (active.find((s) => s.key === 'other') ?? active[0] ?? current[0]).key;
}
