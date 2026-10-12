// Regras puras do detalhe da Oportunidade (sem DOM), testadas em web/test/deal-detail.test.js.
// Datas no fuso do NAVEGADOR da aluna, como em Tarefas e Leads.
import { shortDay, startOfDay } from './tasks.js';
import { weightedValue } from './pipeline-config.js';

/** Etapas do stepper, na ordem do funil. Perdida não é um passo: é um desfecho (mostrado à parte). */
export const FLOW = ['arrived', 'talking', 'proposal', 'won'];
/** Etapas em que dá para avançar/voltar um passo. */
const OPEN = ['arrived', 'talking', 'proposal'];

/** Etapa seguinte/anterior dentro do funil aberto (a partir de Proposta, quem fecha é "Marcar como ganha"). */
export function neighbourStage(stage, direction) {
  const index = OPEN.indexOf(stage);
  if (index < 0) return null;
  return OPEN[index + direction] ?? null;
}

/**
 * Situação de cada passo do stepper: 'done' (já passou), 'current' (etapa atual) ou 'todo'.
 * Oportunidade perdida: nenhum passo fica atual (todos 'todo'); ganha: todos 'done' e o último 'current'.
 */
export function stepStates(stage) {
  if (stage === 'lost') return FLOW.map((key) => ({ key, state: 'todo' }));
  const at = FLOW.indexOf(stage);
  return FLOW.map((key, i) => ({ key, state: i < at ? 'done' : i === at ? 'current' : 'todo' }));
}

function dayDiff(date, now) {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** Dias inteiros desde `iso` (calendário local; nunca negativo). */
export function daysSinceDay(iso, now = new Date()) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return 0;
  return Math.max(0, -dayDiff(date, now));
}

/** Instante em que a oportunidade entrou na etapa atual: a última transição real ou, sem nenhuma, a abertura. */
export function enteredStageAt(deal, history) {
  const last = (history ?? []).filter((h) => h.toStage === deal.stage).at(-1);
  return last?.changedAt ?? deal.openedAt;
}

/** "Hoje" / "1 dia na etapa" / "9 dias na etapa". */
export function daysInStageLabel(deal, history, now = new Date()) {
  const days = daysSinceDay(enteredStageAt(deal, history), now);
  if (days === 0) return 'Entrou na etapa hoje';
  return `${days} ${days === 1 ? 'dia' : 'dias'} na etapa`;
}

/** 'AAAA-MM-DD' -> Date local ao meio-dia (imune a fuso). */
export function parseDay(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getMonth() === Number(match[2]) - 1 ? date : null;
}

const pad = (n) => String(n).padStart(2, '0');

/** "03 out. 2026" (sempre com o ano, como no kit). */
export function forecastDate(text) {
  const date = parseDay(text);
  if (!date) return null;
  const withYear = shortDay(date, new Date(date.getFullYear() + 1, 0, 1));
  return withYear.replace(/^(\d{2})/, (d) => pad(Number(d)));
}

/** "em 5 dias" / "amanhã" / "hoje" / "atrasada há 3 dias" / "atrasada desde ontem"; sem data -> null. */
export function forecastRelative(text, now = new Date()) {
  const date = parseDay(text);
  if (!date) return null;
  const diff = dayDiff(date, now);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff > 1) return `em ${diff} dias`;
  if (diff === -1) return 'atrasada desde ontem';
  return `atrasada há ${-diff} dias`;
}

/** A previsão passou e a oportunidade ainda está aberta. */
export function forecastOverdue(deal, now = new Date()) {
  const date = parseDay(deal.expectedCloseOn);
  return Boolean(date) && OPEN.includes(deal.stage) && dayDiff(date, now) < 0;
}

/** Valor ponderado da oportunidade: valor x probabilidade da etapa atual. */
export function weightedForDeal(deal, stages) {
  const probability = stages.find((s) => s.key === deal.stage)?.probability ?? 0;
  return { probability, value: weightedValue(deal.value, probability) };
}

/**
 * Linha do tempo de etapas, mais recente primeiro: cada mudança do histórico e, no fim, a abertura.
 * Item: { id, kind: 'created'|'move', at, from?, to?, text }. `label` traduz a chave da etapa (rótulo configurado).
 */
export function stageTimeline(deal, history, label) {
  const items = (history ?? []).map((h, index) => ({
    id: `h-${index}`,
    kind: 'move',
    at: h.changedAt,
    from: h.fromStage,
    to: h.toStage,
    text: h.toStage === 'won' ? 'Marcada como ganha' : h.toStage === 'lost' ? 'Marcada como perdida' : `Movida para ${label(h.toStage)}`,
  }));
  items.reverse();
  items.push({ id: 'created', kind: 'created', at: deal.openedAt, text: 'Oportunidade criada' });
  return items;
}

/** Etapa em que reabrir uma oportunidade fechada: a última etapa em andamento do histórico (ou "chegaram"). */
export function reopenStage(history) {
  const moves = history ?? [];
  for (let i = moves.length - 1; i >= 0; i -= 1) {
    if (OPEN.includes(moves[i].fromStage)) return moves[i].fromStage;
  }
  return 'arrived';
}

/** Fecha o envio: '' -> null; texto -> AAAA-MM-DD (campo type=date já entrega nesse formato). */
export function expectedCloseError(value) {
  const text = (value ?? '').trim();
  if (!text) return null;
  const date = parseDay(text);
  if (!date) return 'Informe uma data válida.';
  const year = date.getFullYear();
  return year < 2000 || year > 2100 ? 'Informe uma data válida.' : null;
}

export const dealNotesError = (value) => ((value ?? '').trim().length > 1000 ? 'Notas muito longas (máximo 1000).' : null);
