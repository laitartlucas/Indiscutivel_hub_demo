// Espelho, para a demonstração (sem servidor), das regras puras do Ranking e dos Relatórios.
// Fonte da verdade: server/src/domain/reports.ts e a função SQL ranking_month (migração 0018).
// server/test/reports-domain.test.ts confere que os períodos e blocos são idênticos aos do servidor.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const PERIODS = ['30d', 'quarter', '12m'];
export const DAYS_BLOCK = 6;
// Caminho comum a todos os funis (cada funil tem etapas próprias): criada -> avançou de etapa -> ganha (perdida não é etapa do caminho).
export const PATH = ['created', 'advanced', 'won'];
export const PATH_LABELS = { created: 'Criadas', advanced: 'Avançaram de etapa', won: 'Ganhas' };
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Mesmos limiares de server/src/domain/xp.ts (LEVELS). */
export const LEVEL_FLOORS = [0, 150, 400, 800, 1400, 2300, 3600, 5400, 8000, 11500, 16000, 22000];

export const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const localDate = (at, tz) => new Date(at.getTime() - tz * MINUTE).toISOString().slice(0, 10);
export const dayStart = (date, tz) => new Date(Date.parse(`${date}T00:00:00Z`) + tz * MINUTE);

function monthKey(year, index) {
  const y = year + Math.floor(index / 12);
  const i = ((index % 12) + 12) % 12;
  return `${String(y).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}`;
}
export function shiftMonth(month, delta) {
  return monthKey(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta);
}
export function shiftMonthsDate(date, delta) {
  const key = shiftMonth(date.slice(0, 7), delta);
  const last = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
  return `${key}-${String(Math.min(Number(date.slice(8, 10)), last)).padStart(2, '0')}`;
}

function windowOf(from, endExclusive, tz) {
  return { from, to: addDays(endExclusive, -1), start: dayStart(from, tz), end: dayStart(endExclusive, tz) };
}

/** Janelas e blocos de um período no fuso informado (mesma regra do servidor). */
export function planPeriod(period, now, tz) {
  const today = localDate(now, tz);
  const tomorrow = addDays(today, 1);
  let from;
  let prevFrom;
  let prevEndExclusive;
  if (period === '30d') {
    from = addDays(today, -29);
    prevFrom = addDays(today, -59);
    prevEndExclusive = from;
  } else if (period === 'quarter') {
    const firstMonth = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
    from = `${today.slice(0, 4)}-${String(firstMonth).padStart(2, '0')}-01`;
    prevFrom = shiftMonthsDate(from, -3);
    prevEndExclusive = shiftMonthsDate(tomorrow, -3);
  } else {
    from = `${shiftMonth(today.slice(0, 7), -11)}-01`;
    prevFrom = shiftMonthsDate(from, -12);
    prevEndExclusive = shiftMonthsDate(tomorrow, -12);
  }
  const current = windowOf(from, tomorrow, tz);
  const previous = windowOf(prevFrom, prevEndExclusive, tz);
  const buckets = [];
  if (period === '30d') {
    for (let i = 0; i < 30 / DAYS_BLOCK; i++) {
      const first = addDays(from, i * DAYS_BLOCK);
      buckets.push({ key: first, label: `${first.slice(8, 10)}/${first.slice(5, 7)}`, start: dayStart(first, tz), end: dayStart(addDays(first, DAYS_BLOCK), tz) });
    }
  } else {
    let month = from.slice(0, 7);
    const last = today.slice(0, 7);
    while (month <= last) {
      const start = month === from.slice(0, 7) ? current.start : dayStart(`${month}-01`, tz);
      const next = shiftMonth(month, 1);
      buckets.push({ key: month, label: MONTHS_SHORT[Number(month.slice(5, 7)) - 1], start, end: next > last ? current.end : dayStart(`${next}-01`, tz) });
      month = shiftMonth(month, 1);
    }
  }
  return { period, current, previous, granularity: period === '30d' ? 'days' : 'month', buckets };
}

export function conversionRate(won, lost) {
  const closed = won + lost;
  return closed <= 0 ? null : Math.round((won / closed) * 1000) / 10;
}
export function onTimeRate(onTime, withDue) {
  return withDue <= 0 ? null : Math.round((onTime / withDue) * 100);
}
export function advancePct(previousCount, count) {
  return previousCount <= 0 ? null : Math.round((count / previousCount) * 100);
}

/** "Camila Duarte" -> "Camila D."; "Maria da Silva" -> "Maria S."; nome único fica como está (igual à função SQL). */
export function displayName(fullName) {
  const name = String(fullName ?? '').trim();
  const first = /^(\S+)/.exec(name)?.[1] ?? '';
  const last = /(\S+)$/.exec(name)?.[1] ?? '';
  if (!/\s/.test(name)) return Array.from(name).slice(0, 30).join('');
  return `${Array.from(first).slice(0, 30).join('')} ${Array.from(last)[0].toUpperCase()}.`;
}

/** "Camila D." -> "CD". */
export function initialsOfShown(shown) {
  const parts = shown.replace(/\./g, '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.slice(0, 1);
  return letters.map((p) => Array.from(p)[0].toUpperCase()).join('');
}

/** Nível (1 a 12) de um total de XP, pelos limiares acima. */
export const levelNumberFor = (totalXp) => LEVEL_FLOORS.filter((floor) => floor <= totalXp).length;
