// Regras puras do Acompanhamento e dos Relatórios da mentoria na demonstração: ESPELHO de server/src/domain/followup.ts (o teste
// server/test/unit/followup-domain.test.ts confere que continuam iguais). Só sinais de mentoria: nada de R$ nem de dado do CRM.

const DAY = 86_400_000;

export const FOLLOWUP_WEEKS = 8;
export const VERY_ENGAGED_PCT = 80;
export const TREND_DELTA = 10;
export const PLAN_MAX = 300;
export const CHECKIN_NOTE_MAX = 500;
export const FOLLOWUP_TZ = 180;
export const MAX_CHECKIN_SPAN_DAYS = 400;
export const MODULES = ['tarefas', 'leads', 'oportunidades', 'pessoas', 'empresas', 'metas', 'desafios'];
export const MODULE_LABELS = { tarefas: 'Tarefas', leads: 'Leads', oportunidades: 'Oportunidades', pessoas: 'Pessoas', empresas: 'Empresas', metas: 'Metas', desafios: 'Desafios' };
export const STATE_LABELS = { at_risk: 'Em risco', very_engaged: 'Muito engajada', no_activity: 'Sem atividade', steady: 'Regular' };
const STATE_RANK = { at_risk: 0, no_activity: 1, steady: 2, very_engaged: 3 };
const TREND_RANK = { down: 0, flat: 1, up: 2 };

export const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const mondayOf = (date) => addDays(date, -((weekday(date) + 6) % 7));

export function weekPct(activeDays, elapsedDays = 7) {
  const elapsed = Math.min(7, Math.max(1, elapsedDays));
  return Math.round((Math.min(elapsed, Math.max(0, activeDays)) / elapsed) * 100);
}
export const elapsedDaysOf = (weekStart, today) => (weekStart === mondayOf(today) ? ((weekday(today) + 6) % 7) + 1 : 7);
export const meanPct = (values) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);

export function trendOf(pcts) {
  if (pcts.length < 6) return { trend: 'flat', delta: 0 };
  const recent = meanPct(pcts.slice(-3));
  const before = meanPct(pcts.slice(-6, -3));
  const delta = recent - before;
  return { trend: delta >= TREND_DELTA ? 'up' : delta <= -TREND_DELTA ? 'down' : 'flat', delta };
}

export function stateOf({ pcts, atRisk }) {
  if (pcts.every((p) => p === 0)) return 'no_activity';
  if (atRisk) return 'at_risk';
  if (meanPct(pcts) >= VERY_ENGAGED_PCT) return 'very_engaged';
  return 'steady';
}

export function riskCompare(a, b) {
  return (
    Number(b.atRisk) - Number(a.atRisk) ||
    STATE_RANK[a.state] - STATE_RANK[b.state] ||
    TREND_RANK[a.trend] - TREND_RANK[b.trend] ||
    a.avgPct - b.avgPct ||
    a.name.localeCompare(b.name, 'pt-BR')
  );
}

export function dueOf(nextCheckinOn, today) {
  if (!nextCheckinOn) return null;
  return nextCheckinOn < today ? 'overdue' : nextCheckinOn === today ? 'today' : 'upcoming';
}

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export const isMonday = (value) => isIsoDate(value) && weekday(value) === 1;

export function isoWeekNumber(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY));
}

export function weeksEnding(endWeek, today, count = FOLLOWUP_WEEKS) {
  const currentMonday = mondayOf(today);
  return Array.from({ length: count }, (_, k) => {
    const start = addDays(endWeek, -7 * (count - 1 - k));
    return { start, end: addDays(start, 6), label: `S${isoWeekNumber(start)}`, current: start === currentMonday };
  });
}

export function weekError(week, today) {
  if (!isMonday(week)) return 'Informe a segunda-feira da semana (AAAA-MM-DD).';
  const current = mondayOf(today);
  if (week > current) return 'Escolha a semana atual ou uma anterior.';
  if (week < addDays(current, -7 * 52)) return 'Escolha uma semana dentro do último ano.';
  return null;
}

export const daysInWindow = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;

export function periodEngagement(activeDays, students, days) {
  if (students <= 0 || days <= 0) return 0;
  return Math.min(100, Math.round((activeDays / (students * days)) * 100));
}

export function checkinDateError(date, today) {
  if (!isIsoDate(date)) return 'Informe uma data válida.';
  if (Math.abs(daysInWindow(today, date) - 1) > MAX_CHECKIN_SPAN_DAYS) return 'Escolha uma data dentro de mais ou menos 12 meses.';
  return null;
}
