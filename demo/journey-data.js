// Jornada e check-ins (Entrega 5): regras puras, espelho de server/src/domain/journey.ts para a demonstração.
// O teste de paridade do servidor (server/test/unit/journey-domain.test.ts) confere que as duas versões dão o mesmo resultado.
// Datas de dia são 'AAAA-MM-DD' no fuso de Brasília (UTC-3, sem horário de verão: o mesmo dia do XP).

/** As quatro fases da mentoria, em ordem. Sem registro, a aluna está na Fase 01. */
export const PHASES = [
  { phase: 1, label: 'Método Validado' },
  { phase: 2, label: 'Autoridade' },
  { phase: 3, label: 'Escala' },
  { phase: 4, label: 'Gestão' },
];

/** Limites dos check-ins e das evidências (os mesmos do servidor; a demo tem limites próprios de arquivo em mock-journey.js). */
export const CHECKIN_LIMITS = {
  filesPerCheckin: 5,
  studentBytes: 50 * 1024 * 1024,
  imageBytes: 2 * 1024 * 1024,
  pdfBytes: 3 * 1024 * 1024,
  closeAfterDays: 7,
  lateAfterDays: 3,
  links: 5,
  linkChars: 500,
};

const DAY_MS = 86_400_000;
const BRASILIA_OFFSET_MS = 180 * 60_000;

/** Soma `days` dias a um dia 'AAAA-MM-DD'. */
export function addDays(day, days) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Dias corridos de `from` até `to` (positivo quando `to` é depois). */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Dia de Brasília de um instante (ISO ou Date). */
export function brasiliaDay(at) {
  const ms = typeof at === 'string' ? Date.parse(at) : at.getTime();
  return new Date(ms - BRASILIA_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'AAAA-MM-DD' que existe no calendário. */
export function isValidDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= '2100-12-31';
}

/** Rótulo da fase (null para um número fora de 1..4). */
export function phaseLabel(phase) {
  return PHASES.find((p) => p.phase === phase)?.label ?? null;
}

/** Fase atual: o registro mais recente vale; em empate de horário, o último da lista. Sem registro = 1. */
export function currentPhase(history) {
  let best = null;
  for (const item of history ?? []) {
    if (!best || Date.parse(item.createdAt) >= Date.parse(best.createdAt)) best = item;
  }
  return best ? best.phase : 1;
}

/**
 * Situação da aluna num desafio:
 *  - completed: concluiu o desafio;
 *  - active: tem check-in nos últimos 3 dias do período corrido (até hoje, ou até o fim, se já terminou);
 *  - late: inscrita, desafio em andamento e sem check-in há mais de 3 dias (contando do início da participação, se nunca fez);
 *  - not_started: o resto (não inscrita, inscrita há pouco sem check-in, desafio ainda não começou ou já encerrado sem check-in recente).
 */
export function participantStatus(participant, challenge, today) {
  if (participant.completedAt) return 'completed';
  if (!participant.joinedAt) return 'not_started';
  const reference = today < challenge.endsOn ? today : challenge.endsOn;
  const late = CHECKIN_LIMITS.lateAfterDays;
  if (participant.lastCheckinDay && daysBetween(participant.lastCheckinDay, reference) <= late) return 'active';
  const running = today >= challenge.startsOn && today <= challenge.endsOn;
  if (!running) return 'not_started';
  const joinedDay = brasiliaDay(participant.joinedAt);
  const since = participant.lastCheckinDay ?? (joinedDay > challenge.startsOn ? joinedDay : challenge.startsOn);
  return daysBetween(since, today) > late ? 'late' : 'not_started';
}

/**
 * Janela de check-in: de `firstDay` (início) a `lastDay` (hoje, ou o fim, se já passou). `closed` = passou do prazo de
 * fechamento (fim + 7 dias): daí em diante tudo é só leitura. Antes do início, `lastDay` < `firstDay` (nenhum dia vale).
 */
export function checkinWindow(challenge, today) {
  return {
    firstDay: challenge.startsOn,
    lastDay: today < challenge.endsOn ? today : challenge.endsOn,
    closed: today > addDays(challenge.endsOn, CHECKIN_LIMITS.closeAfterDays),
  };
}

/** O dia pode receber check-in? 'closed' (prazo encerrado: vale para qualquer dia), 'out_of_period' (fora do período ou no futuro) ou 'ok'. */
export function checkinDayState(challenge, day, today) {
  const win = checkinWindow(challenge, today);
  if (win.closed) return 'closed';
  if (day < win.firstDay || day > win.lastDay) return 'out_of_period';
  return 'ok';
}

/** Link aceito: só http/https, com host, sem espaços nem caracteres de controle, até 500 caracteres (depois de aparar). */
export function isValidLink(value) {
  if (typeof value !== 'string') return false;
  const link = value.trim();
  if (link.length === 0 || link.length > CHECKIN_LIMITS.linkChars) return false;
  if (/[\s\u0000-\u001f\u007f]/.test(link)) return false;
  let url;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
}

/** Cabe mais um arquivo? Confere o limite por check-in e o total da aluna (a demo passa o próprio limite total). */
export function fileFits(state, sizeBytes, limitBytes = CHECKIN_LIMITS.studentBytes) {
  if (state.filesInCheckin >= CHECKIN_LIMITS.filesPerCheckin) return 'file_limit';
  if (state.usedBytes + sizeBytes > limitBytes) return 'storage_full';
  return 'ok';
}

/** Soma dos tamanhos (bytes) de uma lista de arquivos. */
export function storageUsed(files) {
  return files.reduce((sum, f) => sum + f.sizeBytes, 0);
}
