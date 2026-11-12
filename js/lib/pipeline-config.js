// Funis da aluna (GET /api/v1/funnels): os 15 funis padrão, cada um com as próprias etapas.
// Lidos UMA vez por sessão e guardados aqui; as telas leem por funções síncronas (activeFunnels(), funnelById()...),
// então um nome editado em Configurações aparece no quadro, no detalhe e nos filtros sem cada tela buscar de novo.
// Enquanto a lista não chega (ou se a busca falhar), a lista fica vazia: nenhuma tela quebra por isso.

/** Uma etapa válida do contrato: { id, name, position, probability, kind }. */
function isStage(s) {
  return (
    s &&
    typeof s === 'object' &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    Number.isInteger(s.probability) &&
    s.probability >= 0 &&
    s.probability <= 100 &&
    (s.kind === 'open' || s.kind === 'won' || s.kind === 'lost')
  );
}

/** Um funil válido do contrato: { id, key, name, active, version, stages[] }. */
export function isFunnel(f) {
  return (
    f &&
    typeof f === 'object' &&
    typeof f.id === 'string' &&
    typeof f.key === 'string' &&
    typeof f.name === 'string' &&
    typeof f.active === 'boolean' &&
    Array.isArray(f.stages) &&
    f.stages.every(isStage)
  );
}

/** Etapas na ordem de exibição: abertas (pela posição), depois Ganha e Perdida. */
export function orderStages(stages) {
  const rank = { open: 0, won: 1, lost: 2 };
  return [...(stages ?? [])].sort((a, b) => rank[a.kind] - rank[b.kind] || (a.position ?? 0) - (b.position ?? 0));
}

function freezeFunnel(f) {
  return Object.freeze({ ...f, stages: Object.freeze(orderStages(f.stages).map((s) => Object.freeze({ ...s }))) });
}

let current = Object.freeze([]);
let ready = null;
let generation = 0;
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener(current);
}

/** Todos os funis (ativos e inativos), na ordem da aluna. */
export function getFunnels() {
  return current;
}

/** Só os ativos: são os que aparecem no seletor do quadro e nos formulários. */
export function activeFunnels() {
  return current.filter((f) => f.active);
}

export function funnelById(id) {
  return current.find((f) => f.id === id) ?? null;
}

export function funnelByKey(key) {
  return current.find((f) => f.key === key) ?? null;
}

export const openStages = (funnel) => (funnel?.stages ?? []).filter((s) => s.kind === 'open');
export const wonStage = (funnel) => (funnel?.stages ?? []).find((s) => s.kind === 'won') ?? null;
export const lostStage = (funnel) => (funnel?.stages ?? []).find((s) => s.kind === 'lost') ?? null;

/** Etapa (e o funil dela) a partir do id da etapa, em qualquer funil. */
export function stageById(stageId) {
  for (const funnel of current) {
    const stage = funnel.stages.find((s) => s.id === stageId);
    if (stage) return { funnel, stage };
  }
  return null;
}

/** Troca a lista em uso (resposta do GET). Resposta malformada é ignorada. */
export function setFunnels(list) {
  if (!Array.isArray(list) || !list.every(isFunnel)) return false;
  current = Object.freeze([...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(freezeFunnel));
  notify();
  return true;
}

/** Troca um funil só (resposta do PATCH/PUT), mantendo a ordem. */
export function replaceFunnel(funnel) {
  if (!isFunnel(funnel)) return false;
  const index = current.findIndex((f) => f.id === funnel.id);
  if (index < 0) return false;
  const next = [...current];
  next[index] = freezeFunnel(funnel);
  current = Object.freeze(next);
  notify();
  return true;
}

/** Volta ao vazio e esquece a leitura (logout, troca de conta). */
export function resetFunnels() {
  generation += 1;
  current = Object.freeze([]);
  ready = null;
}

/** Avisa quando a lista muda. Devolve a função que cancela o aviso. */
export function onFunnels(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Busca agora (rejeita em falha): para as telas que precisam mostrar o erro, como o quadro e Configurações. */
export async function fetchFunnels(api) {
  const mine = generation;
  const result = await api.get('/api/v1/funnels');
  if (mine === generation && !setFunnels(result?.funnels)) {
    const error = new Error('Resposta inesperada do servidor.');
    error.code = 'invalid_response';
    throw error;
  }
  ready = Promise.resolve();
  return current;
}

/** Lê uma vez por sessão. Nunca rejeita: em falha a lista fica como está e a próxima chamada tenta de novo. */
export function loadFunnels(api) {
  if (ready) return ready;
  ready = fetchFunnels(api)
    .then(() => undefined)
    .catch(() => {
      ready = null;
    });
  return ready;
}

// ---------- último funil aberto no quadro (preferência do navegador) ----------

export const LAST_FUNNEL_KEY = 'ih:pipeline-funnel';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readLastFunnel(storage = defaultStorage()) {
  try {
    const value = storage?.getItem(LAST_FUNNEL_KEY);
    return typeof value === 'string' && /^[a-z0-9_-]{1,60}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastFunnel(key, storage = defaultStorage()) {
  try {
    storage?.setItem(LAST_FUNNEL_KEY, key);
  } catch {
    // sem armazenamento (janela privada, dados bloqueados): o quadro só não lembra do funil
  }
}

/** Qual funil abrir: o da rota (se ativo), senão o último aberto (se ativo), senão o primeiro ativo. */
export function pickFunnel(funnels, routeKey, lastKey) {
  const active = funnels.filter((f) => f.active);
  return active.find((f) => f.key === routeKey) ?? active.find((f) => f.key === lastKey) ?? active[0] ?? null;
}

// ---------- valor ponderado (valor x probabilidade da etapa) ----------

export function toCents(value) {
  const text = String(value ?? '0');
  const negative = text.startsWith('-');
  const [int, frac = '0'] = text.replace('-', '').split('.');
  const cents = Number(int) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
  return Number.isFinite(cents) ? (negative ? -cents : cents) : 0;
}

export function fromCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** "15000.00" x 80 -> "12000.00" (arredonda ao centavo). */
export function weightedValue(value, probability) {
  return fromCents(Math.round((toCents(value) * probability) / 100));
}

// ---------- editor de etapas (Configurações > Funis e etapas) ----------

export const MAX_OPEN_STAGES = 10;
export const STAGE_NAME_MAX = 40;
export const FUNNEL_NAME_MAX = 60;

/** Rascunho editável a partir do funil: abertas primeiro, depois Ganha e Perdida (fixas no fim). */
export function stagesDraft(funnel) {
  return orderStages(funnel?.stages).map((s) => ({ id: s.id, name: s.name, probability: s.probability, kind: s.kind }));
}

/** Corpo do PUT /funnels/:id/stages: abertas na ordem, depois uma Ganha (100%) e uma Perdida (0%). */
export function stagesPayload(draft) {
  const open = draft.filter((s) => s.kind === 'open');
  const won = draft.find((s) => s.kind === 'won');
  const lost = draft.find((s) => s.kind === 'lost');
  const item = (s, probability) => ({ ...(s.id ? { id: s.id } : {}), name: String(s.name ?? '').trim(), probability, kind: s.kind });
  return [
    ...open.map((s) => item(s, Number(s.probability))),
    ...(won ? [item(won, 100)] : []),
    ...(lost ? [item(lost, 0)] : []),
  ];
}

export function stageNameError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Informe o nome da etapa.';
  if ([...text].length > STAGE_NAME_MAX) return `Nome muito longo (máximo ${STAGE_NAME_MAX}).`;
  return null;
}

export function probabilityError(value) {
  const text = String(value ?? '').trim();
  if (text === '') return 'Informe a probabilidade.';
  if (!/^\d{1,3}$/.test(text)) return 'Use um número inteiro de 0 a 100.';
  return Number(text) > 100 ? 'A probabilidade vai de 0 a 100.' : null;
}

export function funnelNameError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Informe o nome do funil.';
  if ([...text].length > FUNNEL_NAME_MAX) return `Nome muito longo (máximo ${FUNNEL_NAME_MAX}).`;
  return null;
}

/**
 * Erros do rascunho inteiro: `{ list, rows }`. `list` = problemas do conjunto (quantidade de etapas abertas);
 * `rows[i]` = { name?, probability? } da linha i. Nomes repetidos (sem diferenciar maiúsculas) contam como erro.
 */
export function validateStages(draft) {
  const rows = draft.map(() => ({}));
  const list = [];
  const open = draft.filter((s) => s.kind === 'open').length;
  if (open < 1) list.push('Deixe ao menos uma etapa em andamento.');
  if (open > MAX_OPEN_STAGES) list.push(`Use no máximo ${MAX_OPEN_STAGES} etapas em andamento.`);
  const seen = new Map();
  draft.forEach((s, i) => {
    const nameError = stageNameError(s.name);
    if (nameError) rows[i].name = nameError;
    else {
      const folded = String(s.name).trim().toLocaleLowerCase('pt-BR');
      if (seen.has(folded)) rows[i].name = 'Cada etapa precisa de um nome diferente.';
      else seen.set(folded, i);
    }
    if (s.kind === 'open') {
      const probError = probabilityError(s.probability);
      if (probError) rows[i].probability = probError;
    }
  });
  const ok = list.length === 0 && rows.every((r) => !r.name && !r.probability);
  return { ok, list, rows };
}

/** Move uma etapa aberta uma posição para cima (-1) ou para baixo (+1), sem nunca passar Ganha/Perdida. */
export function moveDraftStage(draft, index, direction) {
  const target = index + direction;
  if (draft[index]?.kind !== 'open' || draft[target]?.kind !== 'open') return draft;
  const next = [...draft];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Nova etapa aberta logo antes de Ganha/Perdida. */
export function addDraftStage(draft) {
  const firstClosed = draft.findIndex((s) => s.kind !== 'open');
  const at = firstClosed < 0 ? draft.length : firstClosed;
  const next = [...draft];
  next.splice(at, 0, { name: '', probability: 50, kind: 'open' });
  return next;
}
