// Regras puras do Painel da mentora na demonstração: ESPELHO de server/src/domain/mentora.ts (o teste server/test/mentora-domain.test.ts
// confere que continuam iguais). Só sinais de mentoria: nada de R$ nem de dado do CRM.

const DAY = 86_400_000;

export const ACTIVITY_LABELS = {
  task_done: 'Concluiu uma tarefa',
  deal_won: 'Ganhou uma oportunidade',
  lead_converted: 'Converteu um lead',
  person_created: 'Cadastrou uma pessoa',
  lead_activity: 'Registrou atividade em um lead',
  daily_access: 'Acessou a plataforma',
  goal_reached: 'Atingiu uma meta',
  achievement_unlocked: 'Desbloqueou uma conquista',
  challenge_action: 'Avançou em um desafio',
  challenge_completed: 'Concluiu um desafio',
};
export const activityLabel = (kind) => ACTIVITY_LABELS[kind] ?? 'Teve uma atividade';

export const INACTIVE_DAYS = 7;
export const NEVER_ACCESSED_GRACE_DAYS = 3;
export const MAX_ATTENTION = 5;
export const ATTENTION_ORDER = ['invite_expired', 'never_accessed', 'inactive', 'stalled_challenge', 'blocked'];
export const SESSION_MODES = ['individual', 'grupo'];
export const SESSION_STATUSES = ['scheduled', 'done', 'cancelled'];
export const SESSION_MODE_LABELS = { individual: 'Individual', grupo: 'Em grupo' };

/** `levelFor` é a função de nível do mock principal (mesmos limiares do servidor). */
export function progressToNextPct(xp, levelFor) {
  const info = levelFor(xp);
  if (info.nextAt === null) return 100;
  const span = info.nextAt - info.base;
  return span > 0 ? Math.min(100, Math.floor((info.xpInto / span) * 100)) : 0;
}

export function evolutionPct(current, previous) {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function average(values) {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}

export function daysBetween(from, to) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));
}

export function lastSeen(i) {
  const times = [i.lastLoginAt, i.lastActivityAt].filter((d) => d != null).map((d) => d.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

export function attentionFor(i, now) {
  const seen = lastSeen(i);
  const idle = seen ? daysBetween(seen, now) : null;
  const age = daysBetween(i.createdAt, now);
  if (i.status === 'invite_expired') return { reason: 'invite_expired', text: 'Convite vencido sem acesso', days: null };
  if ((i.status === 'invite_pending' || i.status === 'no_invite') && i.lastLoginAt === null && age >= NEVER_ACCESSED_GRACE_DAYS) {
    return { reason: 'never_accessed', text: `Nunca acessou a plataforma (${age} ${age === 1 ? 'dia' : 'dias'} desde o cadastro)`, days: age };
  }
  if (i.status === 'active' && idle !== null && idle >= INACTIVE_DAYS) return { reason: 'inactive', text: `Sem atividade há ${idle} dias`, days: idle };
  if (i.status === 'active' && i.stalledChallenge) return { reason: 'stalled_challenge', text: `Desafio parado: ${i.stalledChallenge}`, days: null };
  if (i.status === 'blocked') return { reason: 'blocked', text: 'Acesso bloqueado', days: null };
  return null;
}

export function isAtRisk(i, now) {
  if (i.status !== 'active') return false;
  const seen = lastSeen(i);
  return (seen !== null && daysBetween(seen, now) >= INACTIVE_DAYS) || i.stalledChallenge !== null;
}

export function highlightLabel({ xpTotal, weekXp, goalsOk, goalsTotal, activeDays14 }, levelFor) {
  const before = levelFor(xpTotal - weekXp).level;
  const now = levelFor(xpTotal);
  if (now.level > before) return `Subiu para o nível ${String(now.level).padStart(2, '0')}`;
  if (goalsTotal > 0 && goalsOk === goalsTotal) return 'Todas as metas do mês em dia';
  if (activeDays14 >= 10) return 'Constância: ativa em quase todos os dias';
  return 'Maior ganho de XP da semana';
}

/** Início (segunda 00:00 no fuso) e fim exclusivo da semana, em ms UTC. `offset` segue Date.getTimezoneOffset(). */
export function weekBounds(now, offset) {
  const local = new Date(now.getTime() - offset * 60_000);
  const dow = (local.getUTCDay() + 6) % 7;
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow);
  return { start: startLocal + offset * 60_000, end: startLocal + 7 * DAY + offset * 60_000 };
}
