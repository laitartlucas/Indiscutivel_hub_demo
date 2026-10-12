// Regras puras da tela "Evolução da comunidade" (sem DOM), testadas em web/test/ranking.test.js.
// Os dados vêm de GET /api/v1/ranking (já filtrados no servidor: só optantes da mesma mentora/turma e só campos permitidos).
import { formatXp, levelNumber, monthName } from './progress.js';

/** 1 -> "01" (como o kit). */
export function positionLabel(position) {
  return String(position).padStart(2, '0');
}

/** "Nível 08 · Estrategista". */
export function levelLabel(level) {
  return `Nível ${levelNumber(level.n)} · ${level.name}`;
}

/** "+870 XP" (o ganho do mês; nunca o total acumulado). */
export function gainLabel(monthXp) {
  return `+${formatXp(monthXp)} XP`;
}

/** "outubro de 2026" a partir de "2026-10". */
export function monthTitle(month) {
  return `${monthName(month)} de ${String(month).slice(0, 4)}`;
}

/** Texto do resumo: "Você está na posição 6 de 12 participantes." (null se não houver dados). */
export function summaryText(position, total) {
  if (!Number.isInteger(position) || !Number.isInteger(total) || total < 1) return null;
  return `Você está na posição ${position} de ${total} ${total === 1 ? 'participante' : 'participantes'}.`;
}

/** Subtítulo da tela. Com turma: "Turma Aurora · outubro de 2026 · ..."; sem turma, o escopo é a mentoria toda. */
export function subtitleText(ranking) {
  const where = ranking.scope === 'class' && ranking.className ? ranking.className : 'Toda a mentoria';
  return `${where} · ${monthTitle(ranking.month)} · ranking por evolução no mês, não por volume absoluto.`;
}

/** Pódio (até 3 primeiras linhas) e o restante da tabela. */
export function splitRanking(entries) {
  return { podium: entries.slice(0, 3), rest: entries.slice(3) };
}

/** Largura (0 a 100) da barra de evolução de cada linha, relativa ao maior ganho da lista. */
export function gainWidth(monthXp, entries) {
  const max = Math.max(0, ...entries.map((e) => e.monthXp));
  if (max <= 0 || monthXp <= 0) return 0;
  return Math.max(4, Math.round((monthXp / max) * 100));
}

/** Descrição de uma linha para leitor de tela. */
export function entryDescription(entry) {
  return `${entry.position}º lugar, ${entry.name}${entry.me ? ' (você)' : ''}, ${levelLabel(entry.level)}, ${gainLabel(entry.monthXp)} neste mês.`;
}
