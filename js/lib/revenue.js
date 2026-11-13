// Regras puras do Faturamento autodeclarado e dos marcos de faturamento (Entrega 6), sem DOM, testadas em
// web/test/revenue.test.js. O servidor (server/src/domain/revenue.ts) é a fonte da verdade do acumulado, dos marcos e da
// situação de cada um; aqui só há rótulos, textos, validação do formulário e a geometria do gráfico. Dinheiro sempre em
// centavos inteiros (nunca soma de ponto flutuante).
//
// NUNCA misturar com o faturamento comercial (vendas da Entrega 3): este é o valor que a aluna informa.

import { ApiError, describeError } from './api.js';
import { formatDateOnly } from './format.js';
import { fromCents, money, toCents, todayIso } from './finance.js';
import { parseMoney } from '../../shared/money.js';

// ---------------------------------------------------------------- marcos

/** Os 4 marcos, na ordem (os mesmos rótulos do servidor). O de 100k também dá o status PAD GOLD. */
export const MILESTONES = Object.freeze([
  { milestone: 10000, label: '10k Mentorias', short: '10k' },
  { milestone: 30000, label: '30k Mentorias', short: '30k' },
  { milestone: 50000, label: '50k Mentorias', short: '50k' },
  { milestone: 100000, label: '100k Mentorias', short: '100k' },
]);
export const PAD_GOLD_MILESTONE = 100000;
export const PAD_GOLD_LABEL = 'PAD GOLD';

export const isMilestone = (value) => MILESTONES.some((m) => m.milestone === Number(value));
export const milestoneLabel = (value) => MILESTONES.find((m) => m.milestone === Number(value))?.label ?? `${value}`;
export const milestoneShort = (value) => MILESTONES.find((m) => m.milestone === Number(value))?.short ?? `${value}`;

/** Situações de um marco: texto curto, ícone e tom (nunca só cor: sempre texto + ícone). */
export const MILESTONE_STATUS = Object.freeze({
  active: { label: 'Alcançado', icon: 'check', tone: 'good' },
  in_review: { label: 'Em revisão', icon: 'alert', tone: 'warn' },
  locked: { label: 'Bloqueado', icon: 'lock', tone: 'neutral' },
});
export const statusOf = (status) => (Object.hasOwn(MILESTONE_STATUS, status) ? status : 'locked');
export const milestoneStatusMeta = (status) => MILESTONE_STATUS[statusOf(status)];

/** Situação do PAD GOLD ('none' | 'active' | 'in_review') no mesmo vocabulário dos marcos. */
export const padGoldStatus = (padGold) => (padGold?.status === 'active' ? 'active' : padGold?.status === 'in_review' ? 'in_review' : 'locked');

// ---------------------------------------------------------------- datas e meses

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const isMonth = (value) => typeof value === 'string' && MONTH_RE.test(value);

/** Mês corrente em Brasília, 'AAAA-MM' (o mesmo critério do servidor). */
export const currentMonth = (now = new Date()) => todayIso(now).slice(0, 7);

/** 'AAAA-MM' + n meses. */
export function addMonthsTo(month, n) {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** '2026-11' -> 'novembro de 2026'. */
export function monthLong(month) {
  const m = MONTH_RE.exec(String(month ?? ''));
  return m ? `${MONTHS_LONG[Number(m[2]) - 1]} de ${m[1]}` : '—';
}

/** '2026-11' -> 'Novembro de 2026' (início de frase / opção de lista). */
export function monthTitle(month) {
  const text = monthLong(month);
  return text === '—' ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
}

/** '2026-11' -> 'nov/26'. */
export function monthShort(month) {
  const m = MONTH_RE.exec(String(month ?? ''));
  return m ? `${MONTHS_SHORT[Number(m[2]) - 1]}/${m[1].slice(2)}` : String(month ?? '');
}

/**
 * Meses que a aluna pode lançar: do mês de entrada até o mês corrente, do mais recente para o mais antigo (até 600).
 * Entrada ausente ou depois do mês corrente: só o mês corrente.
 */
export function monthRange(entryMonth, current = currentMonth()) {
  if (!isMonth(current)) return [];
  const first = isMonth(entryMonth) && entryMonth <= current ? entryMonth : current;
  const out = [];
  for (let month = current; month >= first && out.length < 600; month = addMonthsTo(month, -1)) out.push(month);
  return out;
}

/** Instante ISO -> 'dd/mm/aaaa' no fuso de São Paulo. */
export function dateBR(iso) {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? formatDateOnly(todayIso(new Date(time))) : '—';
}

// ---------------------------------------------------------------- dinheiro

/** Teto do lançamento: R$ 100.000.000,00. */
export const AMOUNT_MAX_CENTS = 10_000_000_000;
export const NOTE_MAX = 500;

/** "1500.00" -> "R$ 1.500,00"; ausente -> "—". */
export const brl = (value) => (value === null || value === undefined || value === '' ? '—' : money(String(value)));

/** Valor do lançamento: obrigatório, de R$ 0,00 a R$ 100.000.000,00. */
export function revenueAmountError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Informe o valor faturado no mês (use 0 se não faturou).';
  const parsed = parseMoney(text);
  if (!parsed.ok) return parsed.message;
  if (toCents(parsed.value) > AMOUNT_MAX_CENTS) return 'O valor máximo por mês é R$ 100.000.000,00.';
  return null;
}

/** Texto digitado -> "1500.00" (canônico) ou null. */
export function amountValue(text) {
  const parsed = parseMoney(String(text ?? '').trim());
  return parsed.ok ? fromCents(toCents(parsed.value)) : null;
}

export function noteError(value) {
  return [...String(value ?? '').trim()].length > NOTE_MAX ? `A observação é longa demais (máximo ${NOTE_MAX} caracteres).` : null;
}

/** Mês escolhido dentro da faixa permitida. */
export function monthError(value, { entryMonth, current = currentMonth() } = {}) {
  if (!isMonth(value)) return 'Escolha o mês.';
  if (value > current) return 'Não é possível lançar um mês que ainda não chegou.';
  if (isMonth(entryMonth) && value < entryMonth) return 'Esse mês é antes da sua entrada na mentoria.';
  return null;
}

// ---------------------------------------------------------------- progresso e textos dos marcos

/** Percentual (0 a 100, inteiro para baixo) do acumulado em relação ao marco, em centavos. */
export function milestonePct(total, milestone) {
  const have = Math.max(0, toCents(String(total ?? '0')));
  const want = Math.round(Number(milestone) * 100);
  if (!(want > 0)) return 0;
  return Math.min(100, Math.floor((have * 100) / want));
}

/** Falta para o marco: o `gap` do servidor quando vier; senão marco − acumulado (nunca negativo). */
export function gapOf(m, total) {
  if (m?.gap !== null && m?.gap !== undefined && m.gap !== '') return String(m.gap);
  return fromCents(Math.max(0, Math.round(Number(m?.milestone) * 100) - toCents(String(total ?? '0'))));
}

/**
 * Texto de um marco para a trilha: `{ status, label, title, detail }`.
 *  - active: "Alcançado em dd/mm/aaaa";
 *  - in_review: "Em revisão desde dd/mm/aaaa · faltam R$ X para o marco" (+ data original do alcance);
 *  - locked: "Faltam R$ X" (a barra mostra o progresso).
 */
export function milestoneText(m, total) {
  const status = statusOf(m?.status);
  const meta = MILESTONE_STATUS[status];
  const title = m?.label || milestoneLabel(m?.milestone);
  if (status === 'active') return { status, label: meta.label, title, detail: `Alcançado em ${dateBR(m.reachedAt)}`, original: null };
  if (status === 'in_review') {
    return {
      status,
      label: meta.label,
      title,
      detail: `Em revisão desde ${dateBR(m.reviewSince)} · faltam ${brl(gapOf(m, total))} para o marco`,
      original: m.reachedAt ? `Alcançado originalmente em ${dateBR(m.reachedAt)}` : null,
    };
  }
  return { status, label: meta.label, title, detail: `Faltam ${brl(gapOf(m, total))}`, original: null };
}

/** "Faltam R$ 12.000,00 para 30k Mentorias" ou o texto de quem já alcançou todos. */
export function nextText(next) {
  if (!next || !isMilestone(next.milestone)) return 'Todos os marcos de faturamento alcançados.';
  return `Faltam ${brl(next.remaining)} para ${next.label || milestoneLabel(next.milestone)}`;
}

/** Texto curto da situação PAD GOLD. */
export function padGoldText(padGold) {
  const status = padGoldStatus(padGold);
  if (status === 'active') return padGold.reachedAt ? `PAD GOLD desde ${dateBR(padGold.reachedAt)}` : 'PAD GOLD';
  if (status === 'in_review') return 'PAD GOLD em revisão';
  return 'Ainda não é PAD GOLD';
}

// ---------------------------------------------------------------- avisos depois de gravar

/**
 * `changes` do PUT/DELETE -> avisos para a tela: `{ tone, message, detail }`.
 * reached = conquista (tom premium; o de 100k também anuncia o PAD GOLD); in_review/restored = aviso neutro.
 */
export function changeNotices(changes) {
  const out = [];
  for (const c of Array.isArray(changes) ? changes : []) {
    if (!isMilestone(c?.milestone)) continue;
    const label = milestoneLabel(c.milestone);
    if (c.kind === 'reached') {
      out.push({ tone: 'premium', message: `Marco alcançado: ${label}`, detail: 'Parabéns! A sua mentora também foi avisada.' });
      if (Number(c.milestone) === PAD_GOLD_MILESTONE) out.push({ tone: 'premium', message: 'Você agora é PAD GOLD', detail: 'O status vale enquanto o acumulado ficar acima de R$ 100 mil.' });
    } else if (c.kind === 'in_review') {
      out.push({ tone: 'info', message: `${label} em revisão`, detail: 'Com a correção, o acumulado ficou abaixo do marco. A data original fica guardada e ele volta a valer quando o acumulado passar de novo.' });
    } else if (c.kind === 'restored') {
      out.push({ tone: 'info', message: `${label} voltou a valer`, detail: 'O acumulado passou de novo do marco; a data original foi mantida.' });
    }
  }
  return out;
}

// ---------------------------------------------------------------- histórico

/** Um evento do histórico em uma frase. */
export function eventText(e) {
  const month = monthLong(e?.month);
  if (e?.kind === 'created') return `Lançou ${brl(e.newAmount)} em ${month}`;
  if (e?.kind === 'deleted') return `Excluiu o lançamento de ${month} (era ${brl(e.oldAmount)})`;
  return `Alterou ${month}: de ${brl(e?.oldAmount)} para ${brl(e?.newAmount)}`;
}

// ---------------------------------------------------------------- gráfico mensal × acumulado

/**
 * Série do gráfico: só os lançamentos que contam, do mais antigo ao mais recente, com os meses sem lançamento
 * preenchidos (R$ 0 no mês, acumulado mantido), limitada aos últimos `limit` meses. Mensal e acumulado na MESMA
 * escala (o maior acumulado), em %: `monthHeight` para as colunas e `cumY` (0 = topo) para a linha.
 */
export function chartSeries(entries, { limit = 12 } = {}) {
  const counted = (Array.isArray(entries) ? entries : []).filter((e) => e && e.counts && isMonth(e.month)).sort((a, b) => a.month.localeCompare(b.month));
  if (counted.length === 0) return [];
  const byMonth = new Map(counted.map((e) => [e.month, toCents(String(e.amount ?? '0'))]));
  const months = [];
  for (let m = counted[0].month; m <= counted[counted.length - 1].month && months.length < 600; m = addMonthsTo(m, 1)) months.push(m);
  let running = 0;
  const all = months.map((month) => {
    const cents = byMonth.get(month) ?? 0;
    running += cents;
    return { month, amountCents: cents, cumulativeCents: running };
  });
  const list = all.slice(-limit);
  const max = Math.max(0, ...list.map((p) => p.cumulativeCents));
  const pct = (v) => (max > 0 && v > 0 ? Math.max(2, Math.min(100, Math.round((v / max) * 100))) : 0);
  return list.map((p, i) => ({
    ...p,
    label: monthShort(p.month),
    amount: fromCents(p.amountCents),
    cumulative: fromCents(p.cumulativeCents),
    monthHeight: pct(p.amountCents),
    cumHeight: pct(p.cumulativeCents),
    x: ((i + 0.5) / list.length) * 100,
  }));
}

/** Pontos da linha do acumulado num viewBox 0 0 100 100 (y = 0 no topo). */
export const cumulativePoints = (series) => series.map((p) => `${p.x.toFixed(2)},${(100 - p.cumHeight).toFixed(2)}`).join(' ');

// ---------------------------------------------------------------- lista da mentora

/** Filtro "Conquista" da lista da mentora. */
export const MILESTONE_FILTERS = Object.freeze([
  { value: '', label: 'Todas as conquistas' },
  ...MILESTONES.map((m) => ({ value: String(m.milestone), label: m.label })),
  { value: 'pad_gold', label: PAD_GOLD_LABEL },
  { value: 'in_review', label: 'Com marco em revisão' },
]);
export const isMilestoneFilter = (value) => MILESTONE_FILTERS.some((f) => f.value && f.value === value);

/** '#/faturamento-alunas?mes=..&q=..&fase=..&conquista=..' (só os filtros preenchidos e válidos). */
export function revenueListHash({ month = '', q = '', phase = '', milestone = '' } = {}) {
  const query = new URLSearchParams();
  if (isMonth(month)) query.set('mes', month);
  if (String(q).trim()) query.set('q', String(q).trim());
  if (/^[1-4]$/.test(String(phase))) query.set('fase', String(phase));
  if (isMilestoneFilter(milestone)) query.set('conquista', milestone);
  const text = query.toString();
  return `#/faturamento-alunas${text ? `?${text}` : ''}`;
}

/** Meses do filtro da mentora: o corrente e os 23 anteriores (do mais recente ao mais antigo). */
export function monthFilterOptions(current = currentMonth(), count = 24) {
  return Array.from({ length: count }, (_, i) => {
    const month = addMonthsTo(current, -i);
    return { value: month, label: monthTitle(month) };
  });
}

/** Rótulos dos cartões do resumo da mentora, na ordem. */
export function summaryItems(s, month) {
  const n = (v) => (Number.isInteger(v) ? v.toLocaleString('pt-BR') : '—');
  return [
    { key: 'students', label: 'Alunas', value: n(s?.students), icon: 'alunas' },
    { key: 'monthTotal', label: `Total de ${monthShort(month)}`, value: brl(s?.monthTotal), icon: 'calendar' },
    { key: 'total', label: 'Acumulado', value: brl(s?.total), icon: 'metas' },
    { key: 'padGold', label: PAD_GOLD_LABEL, value: n(s?.padGold), icon: 'gem' },
    { key: 'inReview', label: 'Em revisão', value: n(s?.inReview), icon: 'alert' },
    { key: 'reachedThisMonth', label: 'Marcos no mês', value: n(s?.reachedThisMonth), icon: 'conquistas' },
  ];
}

// ---------------------------------------------------------------- erros amigáveis

/** Mensagem amigável para os erros do faturamento (cai no describeError para o resto). */
export function revenueErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.code === 'version_conflict') return 'Este lançamento foi alterado em outra aba ou aparelho. Recarregamos os dados: confira e salve de novo.';
    if (error.status === 403) return 'Você não tem permissão para ver o faturamento das alunas. Peça à mentora responsável para liberar.';
    if (error.status === 404) return 'Não encontramos este faturamento. Ele pode ter sido excluído ou a aluna não está mais na sua mentoria.';
    if (error.status === 400) {
      const month = error.errors?.find((e) => e.field === 'month')?.message;
      const amount = error.errors?.find((e) => e.field === 'amount')?.message;
      if (month) return month;
      if (amount) return amount;
      if (error.code === 'month' || /month/i.test(String(error.detail ?? ''))) return 'Escolha um mês entre a sua entrada na mentoria e o mês atual.';
    }
  }
  return describeError(error);
}

/** O erro pede recarregar os dados (alterado/excluído em outro lugar)? */
export const needsReload = (error) => error instanceof ApiError && (error.code === 'version_conflict' || error.status === 404);
