// Regras puras do Perfil (sem DOM), testadas em web/test/profile-lib.test.js.

const DAY = 86_400_000;
const NO_DATE = 'Sem data de alteração registrada';

/** "Alterada hoje" / "ontem" / "há N dias" a partir da data real da última troca de senha. */
export function passwordAgeLabel(iso, now = new Date()) {
  if (!iso) return NO_DATE;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return NO_DATE;
  const days = Math.max(0, Math.floor((now.getTime() - then.getTime()) / DAY));
  if (days === 0) return 'Alterada hoje';
  if (days === 1) return 'Alterada ontem';
  return `Alterada há ${days} dias`;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Aluna desde maio de 2026" (data real de criação da conta). */
export function memberSince(iso, role) {
  const date = new Date(iso);
  const who = role === 'admin' ? 'Mentora' : role === 'staff' ? 'Equipe' : 'Aluna';
  if (!iso || Number.isNaN(date.getTime())) return who;
  return `${who} desde ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

/** "Windows · Chrome" */
export function sessionTitle(session) {
  return `${session.device} · ${session.browser}`;
}

/** Última atividade em português curto: "Ativa agora", "Ativa há 12 min", "Ativa há 3 h", "Ativa ontem", "Ativa há 4 dias". */
export function lastSeenLabel(iso, now = new Date()) {
  const diff = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 10) return 'Ativa agora';
  if (minutes < 60) return `Ativa há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Ativa há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Ativa ontem' : `Ativa há ${days} dias`;
}

export const TIMEZONE_OPTIONS = [
  { value: 'auto', label: 'Automático (navegador)' },
  { value: 'America/Sao_Paulo', label: 'Brasília (GMT−3)' },
  { value: 'America/Manaus', label: 'Manaus (GMT−4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (GMT−5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (GMT−2)' },
  { value: 'UTC', label: 'UTC' },
];

/** Minutos no sinal de Date.getTimezoneOffset() (Brasília = 180). O Brasil não tem horário de verão desde 2019. */
export const TZ_OFFSETS = Object.freeze({ 'America/Sao_Paulo': 180, 'America/Manaus': 240, 'America/Rio_Branco': 300, 'America/Noronha': 120, UTC: 0 });

export const HOME_OPTIONS = [
  { value: 'dashboard', label: 'Painel' },
  { value: 'deals', label: 'Pipeline comercial' },
];

/** Avisos que o perfil oferece. `roles` limita a quem faz sentido (mentora não tem tarefas nem "avisos da mentora"). */
export const NOTIFICATION_ITEMS = [
  { key: 'overdueTasks', title: 'Tarefas atrasadas', text: 'Aviso quando uma tarefa passa do prazo', roles: ['user'] },
  { key: 'dailySummary', title: 'Resumo do dia', text: 'O que pede atenção hoje', roles: ['user', 'admin'] },
  { key: 'mentorMessages', title: 'Avisos da mentora', text: 'Recados e orientações da sua mentoria', roles: ['user'] },
  { key: 'security', title: 'Segurança da conta', text: 'Aviso quando a senha da conta é redefinida', roles: ['user', 'admin'] },
];

export function notificationItemsFor(role) {
  return NOTIFICATION_ITEMS.filter((item) => item.roles.includes(role));
}
