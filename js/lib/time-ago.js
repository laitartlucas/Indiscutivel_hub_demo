// Tempo relativo curto das notificações ("Agora", "5 min", "3 h", "Ontem", "2 d", "25 set."). Sem DOM; `now` injetável para teste.
// Os dias são os do calendário LOCAL de quem vê (o relógio do navegador).

const MONTHS_SHORT = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const MIN = 60_000;
const HOUR = 60 * MIN;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Dias de calendário entre duas datas (hoje - antes), imune a horário de verão. */
function calendarDays(now, then) {
  const a = startOfDay(now);
  const b = startOfDay(then);
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86_400_000);
}

/** Texto curto para "quando aconteceu". Data inválida devolve ''. Instante no futuro (relógios diferentes) vale "Agora". */
export function relativeTime(iso, now = new Date()) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const diff = now.getTime() - then.getTime();
  if (diff < MIN) return 'Agora';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min`;
  const days = calendarDays(now, then);
  if (days <= 0) return `${Math.floor(diff / HOUR)} h`;
  if (days === 1) return 'Ontem';
  if (days < 7) return `${days} d`;
  const base = `${then.getDate()} ${MONTHS_SHORT[then.getMonth()]}`;
  return then.getFullYear() === now.getFullYear() ? base : `${base} ${then.getFullYear()}`;
}

/** Data e hora completas para o atributo title/aria (ex.: "9 out. 2026, 14:32"). */
export function fullDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
