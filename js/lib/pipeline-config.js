// Configuração do funil da aluna: rótulo e probabilidade de cada etapa (GET/PUT /api/v1/pipeline/config).
// Lida UMA vez por sessão e guardada aqui; todas as telas leem os rótulos por stageLabelFor() (síncrono), então um
// rótulo editado aparece no quadro, no Painel, nos filtros e no detalhe sem cada tela buscar de novo.
// Enquanto a configuração não chega (ou se a busca falhar), valem os padrões: nunca bloqueia nem quebra uma tela.

export const STAGE_KEYS = ['arrived', 'talking', 'proposal', 'won', 'lost'];
/** Etapas em andamento: só elas entram no valor ponderado em aberto. */
export const OPEN_STAGE_KEYS = ['arrived', 'talking', 'proposal'];

export const DEFAULT_STAGES = Object.freeze([
  Object.freeze({ key: 'arrived', label: 'Chegaram', probability: 10 }),
  Object.freeze({ key: 'talking', label: 'Em conversa', probability: 30 }),
  Object.freeze({ key: 'proposal', label: 'Proposta', probability: 60 }),
  Object.freeze({ key: 'won', label: 'Ganhas', probability: 100 }),
  Object.freeze({ key: 'lost', label: 'Perdidas', probability: 0 }),
]);

let current = DEFAULT_STAGES;
let ready = null;
let generation = 0;
const listeners = new Set();

function isValid(stages) {
  return (
    Array.isArray(stages) &&
    stages.length === STAGE_KEYS.length &&
    STAGE_KEYS.every((key) => stages.some((s) => s && s.key === key && typeof s.label === 'string' && s.label.trim() !== '' && Number.isInteger(s.probability) && s.probability >= 0 && s.probability <= 100))
  );
}

/** As 5 etapas na ordem fixa, no formato { key, label, probability }. */
export function pipelineStages() {
  return current;
}

export function stageLabelFor(key) {
  return current.find((s) => s.key === key)?.label ?? key;
}

/** Probabilidade (0 a 100) da etapa; etapa desconhecida vale 0. */
export function stageProbabilityFor(key) {
  return current.find((s) => s.key === key)?.probability ?? 0;
}

/** Troca a configuração em uso (resposta do GET/PUT). Resposta malformada é ignorada. */
export function setPipelineConfig(stages) {
  if (!isValid(stages)) return false;
  current = STAGE_KEYS.map((key) => {
    const s = stages.find((item) => item.key === key);
    return Object.freeze({ key, label: s.label.trim(), probability: s.probability });
  });
  for (const listener of listeners) listener(current);
  return true;
}

/** Volta aos padrões e esquece a leitura (logout, troca de conta). */
export function resetPipelineConfig() {
  generation += 1;
  current = DEFAULT_STAGES;
  ready = null;
}

/** Avisa quando a configuração muda. Devolve a função que cancela o aviso. */
export function onPipelineConfig(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Lê a configuração uma vez por sessão. Nunca rejeita: em falha ficam os padrões e a próxima chamada tenta de novo. */
export function loadPipelineConfig(api) {
  if (ready) return ready;
  const mine = generation;
  ready = api
    .get('/api/v1/pipeline/config')
    .then((result) => {
      if (mine === generation) setPipelineConfig(result?.stages);
    })
    .catch(() => {
      if (mine === generation) ready = null;
    });
  return ready;
}

// ---------- valor ponderado (valor x probabilidade da etapa) ----------

function toCents(value) {
  const [int, frac = '0'] = String(value).split('.');
  return Number(int) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
}

function fromCents(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** "15000.00" x 80 -> "12000.00" (arredonda ao centavo). */
export function weightedValue(value, probability) {
  return fromCents(Math.round((toCents(value) * probability) / 100));
}

/** Soma ponderada das etapas em andamento a partir de `summary.stages` de GET /deals/summary. */
export function weightedOpenTotal(summaryStages, stages = current) {
  const cents = OPEN_STAGE_KEYS.reduce((sum, key) => {
    const stage = summaryStages?.[key];
    const probability = stages.find((s) => s.key === key)?.probability ?? 0;
    return sum + (stage ? Math.round((toCents(stage.total) * probability) / 100) : 0);
  }, 0);
  return fromCents(cents);
}
