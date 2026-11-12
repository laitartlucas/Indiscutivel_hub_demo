// Regras puras do detalhe da Oportunidade (sem DOM), testadas em web/test/deal-detail.test.js.
// As etapas vêm do funil da oportunidade (lib/pipeline-config.js): cada funil tem as próprias.
// Datas no fuso do NAVEGADOR da aluna, como em Tarefas.
import { shortDay, startOfDay } from './tasks.js';
import { weightedValue } from './pipeline-config.js';

const isOpen = (deal) => deal?.status === 'open';

/** Passos do stepper: as etapas em andamento e, no fim, Ganha. Perdida não é um passo: é um desfecho. */
export function flowStages(stages) {
  const open = (stages ?? []).filter((s) => s.kind === 'open');
  const won = (stages ?? []).find((s) => s.kind === 'won');
  return won ? [...open, won] : open;
}

/**
 * Situação de cada passo do stepper: 'done' (já passou), 'current' (etapa atual) ou 'todo'.
 * Oportunidade perdida: nenhum passo fica atual (todos 'todo'); ganha: todos 'done' e o último 'current'.
 */
export function stepStates(stages, deal) {
  const flow = flowStages(stages);
  if (deal?.status === 'lost') return flow.map((stage) => ({ stage, state: 'todo' }));
  const at = flow.findIndex((s) => s.id === deal?.stageId);
  return flow.map((stage, i) => ({ stage, state: at < 0 ? 'todo' : i < at ? 'done' : i === at ? 'current' : 'todo' }));
}

/** Etapa aberta seguinte (+1) ou anterior (-1); a partir da última aberta, quem fecha é "Marcar como ganha". */
export function neighbourStage(stages, stageId, direction) {
  const open = (stages ?? []).filter((s) => s.kind === 'open');
  const index = open.findIndex((s) => s.id === stageId);
  if (index < 0) return null;
  return open[index + direction] ?? null;
}

/** Etapa em que reabrir uma oportunidade fechada: a última etapa em andamento de onde ela saiu (ou a primeira). */
export function reopenStage(stages, history) {
  const open = (stages ?? []).filter((s) => s.kind === 'open');
  const moves = history ?? [];
  for (let i = moves.length - 1; i >= 0; i -= 1) {
    const found = open.find((s) => s.id === moves[i].fromStageId);
    if (found) return found;
  }
  return open[0] ?? null;
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

/** Instante em que a oportunidade entrou na etapa atual: a última transição para ela ou, sem nenhuma, a abertura. */
export function enteredStageAt(deal, history) {
  const last = (history ?? []).filter((h) => h.toStageId === deal.stageId).at(-1);
  return last?.changedAt ?? deal.openedAt;
}

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

/** "03 out. 2026" (sempre com o ano). */
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
  return Boolean(date) && isOpen(deal) && dayDiff(date, now) < 0;
}

/** Valor ponderado da oportunidade: valor x probabilidade da etapa atual. */
export function weightedForDeal(deal, stages) {
  const probability = (stages ?? []).find((s) => s.id === deal.stageId)?.probability ?? (deal.status === 'won' ? 100 : 0);
  return { probability, value: weightedValue(deal.value ?? '0.00', probability) };
}

/** Histórico em lista: o contrato devolve um array; versões antigas embrulhavam em `{ data }`. */
export function historyList(result) {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.data) ? result.data : [];
}

/**
 * Linha do tempo de etapas, mais recente primeiro: cada mudança do histórico e, no fim, a abertura.
 * Item: { id, kind: 'created'|'move', at, from?, to?, status?, text }. Os nomes vêm gravados no histórico.
 */
export function stageTimeline(deal, history) {
  const items = (history ?? []).map((h, index) => ({
    id: `h-${index}`,
    kind: 'move',
    at: h.changedAt,
    from: h.fromStageName ?? '',
    to: h.toStageName ?? '',
    status: h.toStatus,
    text: h.toStatus === 'won' ? 'Marcada como ganha' : h.toStatus === 'lost' ? 'Marcada como perdida' : h.fromStatus && h.fromStatus !== 'open' ? `Reaberta em ${h.toStageName ?? ''}` : `Movida para ${h.toStageName ?? ''}`,
  }));
  items.reverse();
  items.push({ id: 'created', kind: 'created', at: deal.openedAt ?? deal.createdAt, text: 'Oportunidade criada' });
  return items;
}

/** '' -> sem erro; texto -> AAAA-MM-DD válido entre 2000 e 2100 (campo type=date já entrega nesse formato). */
export function expectedCloseError(value) {
  const text = (value ?? '').trim();
  if (!text) return null;
  const date = parseDay(text);
  if (!date) return 'Informe uma data válida.';
  const year = date.getFullYear();
  return year < 2000 || year > 2100 ? 'Informe uma data válida.' : null;
}

export const dealNotesError = (value) => ((value ?? '').trim().length > 1000 ? 'Notas muito longas (máximo 1000).' : null);
