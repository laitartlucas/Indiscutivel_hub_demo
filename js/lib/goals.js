// Regras puras de Metas (sem DOM), testadas em web/test/goals.test.js. Valores e situações vêm do servidor
// (GET /api/v1/goals); o realizado nunca é digitado: a tela só mostra e o alvo é a única coisa que se edita.
import { formatMoney, parseMoney } from '../../shared/money.js';
import { tzOffsetMinutes } from './tasks.js';

const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const MONTHS_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const METRICS = [
  { value: 'revenue', label: 'Faturamento', money: true, hint: 'Em reais, como 50.000,00.' },
  { value: 'deals_won', label: 'Oportunidades ganhas', money: false, hint: 'Quantidade inteira, como 5.' },
  { value: 'new_leads', label: 'Novos leads', money: false, hint: 'Quantidade inteira, como 25.' },
  { value: 'tasks_done', label: 'Tarefas concluídas', money: false, hint: 'Quantidade inteira, como 40.' },
  { value: 'new_people', label: 'Novas pessoas', money: false, hint: 'Quantidade inteira, como 15.' },
];
export const METRIC_OPTIONS = METRICS.map(({ value, label }) => ({ value, label }));
export const metricInfo = (metric) => METRICS.find((m) => m.value === metric) ?? METRICS[0];
export const isMoney = (metric) => metricInfo(metric).money;

export const STATUS_META = {
  atingida: { label: 'Atingida', tone: 'done' },
  no_ritmo: { label: 'No ritmo', tone: 'ok' },
  atrasada: { label: 'Atrasada', tone: 'late' },
};
export const statusMeta = (status) => STATUS_META[status] ?? STATUS_META.no_ritmo;

/** Mês local (AAAA-MM) de agora, no fuso da aluna. */
export function currentMonthKey(now = new Date(), tz = tzOffsetMinutes(now)) {
  return new Date(now.getTime() - tz * 60_000).toISOString().slice(0, 7);
}

export function isMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value));
}

export function shiftMonthKey(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** "2026-09" -> "Setembro 2026". */
export function monthTitle(month) {
  return `${MONTHS_LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}
export const monthAbbrev = (month) => MONTHS_SHORT[Number(month.slice(5, 7)) - 1];

/** Opções do seletor de mês do diálogo: do mês passado a 11 meses à frente (inclui `include`, se fora da faixa). */
export function monthOptions(now = new Date(), include = null) {
  const base = currentMonthKey(now);
  const keys = new Set(Array.from({ length: 13 }, (_, i) => shiftMonthKey(base, i - 1)));
  if (include && isMonthKey(include)) keys.add(include);
  return [...keys].sort().map((value) => ({ value, label: monthTitle(value) }));
}

/** Texto do valor: reais sem centavos quando redondo ("R$ 38.500"); contagens com milhar ("1.200"). */
export function formatGoalValue(metric, value) {
  if (isMoney(metric)) {
    const text = formatMoney(String(value)).replace('R$ ', 'R$ ');
    return text.endsWith(',00') ? text.slice(0, -3) : text;
  }
  const n = Number(value);
  return Number.isFinite(n) ? nf.format(n) : '—';
}

/** Valor por dia/semana, arredondado para cima, com no máximo 1 casa decimal nas contagens. */
function perPeriod(metric, amount) {
  return isMoney(metric) ? formatGoalValue(metric, (Math.ceil(amount * 100 - 1e-6) / 100).toFixed(2)) : nf1.format(Math.ceil(amount * 10 - 1e-6) / 10);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Frase da esquerda sob a barra: o que falta. */
export function leftText(goal) {
  if (goal.status === 'atingida') return 'Meta atingida';
  return `Faltam ${formatGoalValue(goal.metric, goal.remaining)}`;
}

/** Frase da direita: quanto é preciso por dia (calculado do que falta e dos dias que restam) ou o estado do mês. */
export function paceText(goal, month) {
  if (goal.status === 'atingida') return goal.pct > 100 ? `${goal.pct}% da meta` : '';
  if (month.phase === 'past') return 'Mês encerrado';
  if (month.phase === 'future') return 'Mês ainda não começou';
  const days = month.daysLeft;
  if (!Number.isInteger(days)) return '';
  if (days === 0) return 'Último dia do mês';
  const remaining = Number(goal.remaining);
  if (!(remaining > 0)) return '';
  const perDay = remaining / days;
  if (isMoney(goal.metric) || perDay >= 1) return `Precisa de ${perPeriod(goal.metric, perDay)} por dia`;
  return `Precisa de ${perPeriod(goal.metric, perDay * 7)} por semana`;
}

/** Frase do cabeçalho: "Setembro 2026 · 3 dias para o fechamento do mês". */
export function monthSubtitle(month) {
  const title = monthTitle(month.month);
  if (month.phase === 'past') return `${title} · mês encerrado`;
  if (month.phase === 'future') return `${title} · ainda não começou`;
  if (month.daysLeft === 0) return `${title} · hoje é o último dia do mês`;
  if (Number.isInteger(month.daysLeft)) return `${title} · ${plural(month.daysLeft, 'dia', 'dias')} para o fechamento do mês`;
  return title;
}

/** Valida o alvo digitado; devolve { ok, value } com o texto canônico da API ("50000.00" ou "25") ou { ok:false, message }. */
export function parseTarget(metric, text) {
  const raw = String(text ?? '').trim();
  if (isMoney(metric)) {
    const r = parseMoney(raw);
    if (!r.ok) return r;
    if (Number(r.value) <= 0) return { ok: false, message: 'O alvo precisa ser maior que zero.' };
    return r;
  }
  if (raw === '') return { ok: false, message: 'Informe o alvo da meta.' };
  const digits = raw.replace(/\./g, '');
  if (!/^\d+$/.test(digits)) return { ok: false, message: 'Informe um número inteiro, como 25.' };
  const n = Number(digits);
  if (n < 1) return { ok: false, message: 'O alvo precisa ser maior que zero.' };
  if (n > 1_000_000) return { ok: false, message: 'Alvo alto demais (máximo 1.000.000).' };
  return { ok: true, value: String(n) };
}

/** Texto do alvo para o campo de edição: "50.000,00" ou "25". */
export function targetToInput(metric, target) {
  if (isMoney(metric)) {
    const [int, frac] = String(target).split('.');
    return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac ?? '00'}`;
  }
  return String(target);
}

/** Valor curto para o topo das barras do gráfico: "R$ 38,5k"; abaixo de mil, "R$ 800". */
export function chartMoney(amount) {
  const n = Math.max(0, Number(amount) || 0);
  return n >= 1000 ? `R$ ${nf1.format(Math.round(n / 100) / 10)}k` : `R$ ${nf.format(Math.round(n))}`;
}

/** Barras do histórico meta x realizado: alturas e posição da linha de meta em % do maior valor. */
export function historyBars(data, today = currentMonthKey()) {
  const values = data.flatMap((d) => [Number(d.progress), d.target === null ? 0 : Number(d.target)]);
  const max = Math.max(0, ...values);
  const pct = (v) => (max === 0 ? 0 : Math.round((v / max) * 100));
  return data.map((d) => {
    const progress = Number(d.progress);
    const target = d.target === null ? null : Number(d.target);
    return {
      month: d.month,
      label: monthAbbrev(d.month),
      progress,
      target,
      height: progress === 0 ? 0 : Math.max(3, pct(progress)),
      mark: target === null ? null : pct(target),
      current: d.month === today,
      reached: target !== null && progress >= target,
    };
  });
}

/** O histórico tem algo para mostrar? (alguma meta ou algum realizado). */
export function historyHasData(data) {
  return data.some((d) => d.target !== null || Number(d.progress) > 0);
}

/** "Faturamento Q4" / "R$ 0 / R$ 150.000" para o cartão do trimestre. */
export function quarterRow(item, quarter) {
  return {
    title: `${item.label} ${quarter.label}`,
    value: `${formatGoalValue(item.metric, item.progress)} / ${formatGoalValue(item.metric, item.target)}`,
    pct: Math.min(100, item.pct),
  };
}
