// Lógica pura (sem DOM) de "Alunas ativas": o número que CADA aluna informa sobre as alunas dela (cada aluna também é mentora).
// Auto-informado de propósito: nunca é calculado do CRM da aluna, para preservar a regra de privacidade (a mentora vê só este número).
// Contrato: count inteiro 0 a 100000 + updatedAt; um ponto por mês (o último valor do mês) forma o histórico da variação.
// Usado pelas telas e pela demonstração (mesmas regras de validação, faixa, variação e ordenação do servidor).

export const ACTIVE_MAX = 100_000;
export const HISTORY_MONTHS = 6;
const TZ_MINUTES = 180; // dia/mês de Brasília, como o resto do Hub
const MINUTE = 60_000;
const DAY = 86_400_000;
const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Faixas do filtro. `none` = a aluna ainda não informou. */
export const ACTIVE_BANDS = [
  { id: 'none', label: 'Sem informar' },
  { id: '0', label: '0' },
  { id: '1-5', label: '1 a 5' },
  { id: '6-10', label: '6 a 10' },
  { id: '11+', label: '11 ou mais' },
];
export const ACTIVE_BAND_IDS = ACTIVE_BANDS.map((b) => b.id);

export const COUNT_RULE_MESSAGE = 'Use só números inteiros, de 0 a 100.000.';
export const PRIVACY_NOTE = 'A sua mentora vê só este número, nunca os seus clientes nem valores.';

/** Faixa de um valor (`null`/`undefined` = não informou). */
export function bandOf(count) {
  if (!Number.isInteger(count)) return 'none';
  if (count === 0) return '0';
  if (count <= 5) return '1-5';
  if (count <= 10) return '6-10';
  return '11+';
}

/** O valor cabe na faixa escolhida? Faixa vazia ('' ou indefinida) aceita tudo. */
export function inBand(count, band) {
  if (!band) return true;
  return bandOf(count) === band;
}

/**
 * Valida o que a aluna digitou (texto do campo). Devolve `{ ok: true, value }` ou `{ ok: false, message }`.
 * Só dígitos: sem sinal, decimal, expoente nem separador de milhar.
 */
export function parseCount(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { ok: false, message: 'Informe quantas alunas ativas você tem hoje.' };
  if (!/^\d+$/.test(text)) return { ok: false, message: COUNT_RULE_MESSAGE };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > ACTIVE_MAX) return { ok: false, message: `O máximo é ${ACTIVE_MAX.toLocaleString('pt-BR')}.` };
  return { ok: true, value };
}

/** Validação do corpo da API (demonstração e servidor): número inteiro JSON de 0 a 100000. Devolve a mensagem de erro ou ''. */
export function countError(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return COUNT_RULE_MESSAGE;
  if (value < 0) return COUNT_RULE_MESSAGE;
  if (value > ACTIVE_MAX) return `O máximo é ${ACTIVE_MAX.toLocaleString('pt-BR')}.`;
  return '';
}

/** "2026-10" do mês de Brasília de um instante ISO. */
export function monthKey(iso) {
  return new Date(Date.parse(iso) - TZ_MINUTES * MINUTE).toISOString().slice(0, 7);
}

/** Chave do mês `delta` meses depois (ou antes, se negativo) de uma chave "AAAA-MM". */
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Grava o valor no histórico: um ponto por mês, o último valor do mês substitui o anterior do mesmo mês.
 * Não altera a lista recebida. Guarda os 24 meses mais recentes, em ordem crescente.
 */
export function upsertMonth(history, count, nowIso) {
  const month = monthKey(nowIso);
  const rest = (Array.isArray(history) ? history : []).filter((p) => p.month !== month);
  return [...rest, { month, count }].sort((a, b) => a.month.localeCompare(b.month)).slice(-24);
}

/** Variação em relação ao mês anterior (mês de calendário imediatamente anterior); `null` quando um dos dois não existe. */
export function deltaMonth(history, nowIso) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const month = monthKey(nowIso);
  const current = history.find((p) => p.month === month);
  const previous = history.find((p) => p.month === shiftMonth(month, -1));
  if (!current || !previous) return null;
  return current.count - previous.count;
}

/** Os últimos 6 meses (o atual por último); mês sem valor vem com `count: null`. */
export function lastMonths(history, nowIso, months = HISTORY_MONTHS) {
  const current = monthKey(nowIso);
  const list = Array.isArray(history) ? history : [];
  return Array.from({ length: months }, (_, k) => {
    const month = shiftMonth(current, -(months - 1 - k));
    const point = list.find((p) => p.month === month);
    return { month, label: SHORT_MONTHS[Number(month.slice(5)) - 1], count: point ? point.count : null };
  });
}

/** Comparador: sem informar sempre por último (nos dois sentidos); depois valor. Empate fica para quem chama (nome). */
export function compareActive(a, b, order = 'desc') {
  const ka = Number.isInteger(a) ? a : null;
  const kb = Number.isInteger(b) ? b : null;
  if (ka === null && kb === null) return 0;
  if (ka === null) return 1;
  if (kb === null) return -1;
  return order === 'asc' ? ka - kb : kb - ka;
}

/** Soma e média só das alunas que informaram (média com 1 casa, `null` sem ninguém). */
export function networkTotals(counts) {
  const reported = counts.filter((n) => Number.isInteger(n));
  const total = reported.reduce((sum, n) => sum + n, 0);
  return { total, average: reported.length ? Math.round((total / reported.length) * 10) / 10 : null, reporting: reported.length, students: counts.length };
}

// ------------------------------------------------------------------ textos

export const formatCount = (n) => (Number.isInteger(n) ? n.toLocaleString('pt-BR') : '—');
export const formatAverage = (n) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) : '—');

/** "▲ 2", "▼ 3", "= 0" (visual); vazio = sem comparação. */
export function deltaText(delta) {
  if (!Number.isInteger(delta)) return '';
  if (delta > 0) return `▲ ${delta}`;
  if (delta < 0) return `▼ ${Math.abs(delta)}`;
  return '= 0';
}

/** Mesma variação em palavras (leitor de tela e legenda). */
export function deltaSpoken(delta) {
  if (!Number.isInteger(delta)) return 'sem mês anterior para comparar';
  if (delta === 0) return 'igual ao mês anterior';
  const n = Math.abs(delta);
  return `${delta > 0 ? 'subiu' : 'caiu'} ${n} ${n === 1 ? 'aluna' : 'alunas'} em relação ao mês anterior`;
}

const startOfDay = (iso) => {
  const local = new Date(Date.parse(iso) - TZ_MINUTES * MINUTE);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
};

/** Dias de calendário (Brasília) entre o instante e agora; `null` sem data válida. */
export function daysSince(iso, now = new Date()) {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return Math.max(0, Math.round((startOfDay(now.toISOString()) - startOfDay(iso)) / DAY));
}

/** "Atualizado hoje", "Atualizado ontem" ou "Atualizado há N dias" (vazio sem data). */
export function updatedAgo(iso, now = new Date()) {
  const days = daysSince(iso, now);
  if (days === null) return '';
  if (days === 0) return 'Atualizado hoje';
  if (days === 1) return 'Atualizado ontem';
  return `Atualizado há ${days} dias`;
}

/** "Atualizado em 12/10/2026". */
export function updatedOn(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  const local = new Date(Date.parse(iso) - TZ_MINUTES * MINUTE);
  const p = (n) => String(n).padStart(2, '0');
  return `Atualizado em ${p(local.getUTCDate())}/${p(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`;
}

/** Resumo em texto do mini-gráfico (alternativa para leitor de tela). */
export function chartSummary(series) {
  const known = series.filter((p) => p.count !== null);
  if (known.length === 0) return 'Sem valores informados nos últimos 6 meses.';
  return `Alunas ativas nos últimos ${series.length} meses: ${series.map((p) => `${p.label} ${p.count === null ? 'sem informar' : p.count}`).join(', ')}.`;
}
