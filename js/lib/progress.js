// Regras puras da tela Meu progresso (sem DOM), testadas em web/test/progress.test.js.
// Todos os números vêm de GET /api/v1/progress; aqui só se formata e se organiza para desenhar.

const nf = new Intl.NumberFormat('pt-BR');
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 7450 -> "7.450". */
export function formatXp(value) {
  return nf.format(Math.max(0, Math.trunc(Number(value) || 0)));
}

/** 8 -> "08". */
export function levelNumber(n) {
  return String(n).padStart(2, '0');
}

/** "2026-09" -> "set" / "setembro". */
export function monthShort(month) {
  return MONTHS_SHORT[Number(String(month).slice(5, 7)) - 1] ?? '';
}
export function monthName(month) {
  return MONTHS_LONG[Number(String(month).slice(5, 7)) - 1] ?? '';
}

/** Barra de XP do kit: "7.450 / 8.000" com a largura xp / próximo limiar. No último nível, a barra fica cheia. */
export function xpBar(progress) {
  const { xp, next } = progress;
  if (!next) return { label: `${formatXp(xp)} XP`, max: null, pct: 100 };
  return { label: `${formatXp(xp)} / ${formatXp(next.at)}`, max: next.at, pct: Math.min(100, Math.floor((xp / next.at) * 100)) };
}

/** "Faltam 550 XP" (ou nível máximo). */
export function missingText(progress) {
  return progress.next ? `Faltam ${formatXp(progress.next.missing)} XP` : 'Nível máximo';
}

/** "~ 4 dias no seu ritmo": só existe quando o servidor calculou (há XP recente); senão null. */
export function paceText(progress) {
  const days = progress.next?.etaDays;
  if (!Number.isInteger(days) || days < 1) return null;
  return `~ ${days} ${days === 1 ? 'dia' : 'dias'} no seu ritmo`;
}

/** Barras do gráfico mensal: altura em % do maior mês (mínimo 4% quando há XP, para a barra aparecer). */
export function monthBars(monthly, today) {
  const max = Math.max(0, ...monthly.map((m) => m.xp));
  const current = String(today ?? '').slice(0, 7);
  return monthly.map((m) => ({
    month: m.month,
    label: monthShort(m.month),
    xp: m.xp,
    height: max === 0 || m.xp === 0 ? 0 : Math.max(4, Math.round((m.xp / max) * 100)),
    current: m.month === current,
  }));
}

/** Resumo em texto do gráfico mensal (para o leitor de tela). */
export function monthSummary(monthly) {
  return `XP por mês: ${monthly.map((m) => `${monthName(m.month)} ${formatXp(m.xp)}`).join(', ')}.`;
}

/** Nível de cor do dia (0 a 3) pela intensidade relativa ao melhor dia das 12 semanas. */
export function heatLevel(xp, max) {
  if (!(xp > 0) || !(max > 0)) return 0;
  const ratio = xp / max;
  if (ratio <= 1 / 3) return 1;
  if (ratio <= 2 / 3) return 2;
  return 3;
}

/** Células do mapa (12 semanas x 7 dias, na ordem seg..dom de cada semana). `future` = depois de hoje. */
export function heatCells(daily, today) {
  const max = Math.max(0, ...daily.map((d) => d.xp));
  return daily.map((d) => ({ date: d.date, xp: d.xp, level: heatLevel(d.xp, max), future: d.date > today }));
}

function dayMonth(date) {
  return `${Number(date.slice(8, 10))} ${monthShort(date)}.`;
}

/** Texto do mapa para leitor de tela. */
export function heatSummary(daily, today) {
  const past = daily.filter((d) => d.date <= today);
  const active = past.filter((d) => d.xp > 0);
  const total = past.reduce((sum, d) => sum + d.xp, 0);
  if (active.length === 0) return 'Mapa de produtividade das últimas 12 semanas: nenhum dia com XP ainda.';
  const best = active.reduce((a, b) => (b.xp > a.xp ? b : a));
  return `Mapa de produtividade das últimas 12 semanas: ${active.length} ${active.length === 1 ? 'dia' : 'dias'} com XP, ${formatXp(total)} XP no total. Melhor dia: ${dayMonth(best.date)}, ${formatXp(best.xp)} XP.`;
}

/** Dica (title) de cada dia do mapa. */
export function heatTitle(cell) {
  if (cell.future) return '';
  return cell.xp > 0 ? `${dayMonth(cell.date)}: ${formatXp(cell.xp)} XP` : `${dayMonth(cell.date)}: sem XP`;
}

/** "Hoje, 14:32" / "Ontem, 09:10" / "5 out., 18:40" no relógio do navegador. */
export function recentWhen(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = (x) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Hoje, ${time}`;
  if (diff === 1) return `Ontem, ${time}`;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}., ${time}`;
}

/** Título do XP do primeiro acesso do dia (o servidor o concede sozinho, sem nenhuma ação da aluna). */
const DAILY_ACCESS_TITLE = 'Primeiro acesso do dia';

/**
 * Sem nenhum XP "de verdade" ainda? (estado vazio humano). O +2 do primeiro acesso do dia não conta: a aluna que só abriu
 * o sistema ainda não fez nada que pontue.
 */
export function isEmpty(progress) {
  return !progress || progress.recent.every((r) => r.title === DAILY_ACCESS_TITLE);
}

/** Texto do cartão do Painel: "550 XP para o Nível 09". */
export function nextLevelText(progress) {
  return progress.next ? `${formatXp(progress.next.missing)} XP para o Nível ${levelNumber(progress.next.n)}` : 'Você chegou ao nível máximo';
}
