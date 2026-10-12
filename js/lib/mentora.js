// Lógica pura (sem DOM) das telas de mentoria: Painel, Minhas alunas e Perfil da aluna.
// Só sinais de mentoria: nível, XP, contagens de metas, dias com atividade. Nada de R$ nem de dado do CRM.

import { csvCell, toCsv } from './reports.js';
import { STATUS_LABELS } from './students.js';

const DAY = 86_400_000;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "Nível 08". */
export function levelText(n) {
  return `Nível ${String(Number(n) || 1).padStart(2, '0')}`;
}

/** "Há 12 dias", "Hoje", "Ontem", "Nunca acessou". Sem hora (a lista já traz o dia completo no `title`). */
export function lastAccessText(iso, now = new Date()) {
  if (!iso) return 'Nunca acessou';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '—';
  const days = Math.floor((startOfLocalDay(now) - startOfLocalDay(new Date(time))) / DAY);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return `Há ${days} dias`;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Texto para leitor de tela do mini-gráfico de atividade (nunca só a forma). */
export function activityText(values) {
  const list = Array.isArray(values) ? values : [];
  const days = list.filter((n) => n > 0).length;
  const total = list.reduce((sum, n) => sum + (Number(n) || 0), 0);
  if (days === 0) return 'Sem atividade nos últimos 14 dias';
  return `Atividade em ${days} de ${list.length} dias, ${plural(total, 'ação', 'ações')} nos últimos 14 dias`;
}

/** Linha do sparkline em SVG (largura x altura fixas); valores maiores ficam mais altos. Devolve o atributo `d`. */
export function sparkPath(values, width = 70, height = 22) {
  const list = Array.isArray(values) && values.length > 1 ? values.map((v) => Math.max(0, Number(v) || 0)) : [0, 0];
  const max = Math.max(1, ...list);
  const step = (width - 4) / (list.length - 1);
  return list.map((v, i) => `${i === 0 ? 'M' : 'L'}${(2 + i * step).toFixed(1)} ${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(' ');
}

/** Mini-barras de 14 dias (SVG 70x22): dia sem ação vira um traço baixo; a maior coluna enche a altura. */
export function miniBars(values, width = 70, height = 22) {
  const list = Array.isArray(values) && values.length > 0 ? values.map((v) => Math.max(0, Number(v) || 0)) : new Array(14).fill(0);
  const max = Math.max(1, ...list);
  const slot = width / list.length;
  const barWidth = Math.max(2, Math.floor(slot) - 2);
  return list.map((v, i) => {
    const h = v === 0 ? 2 : Math.max(4, Math.round((v / max) * (height - 2)));
    return { x: Number((i * slot + (slot - barWidth) / 2).toFixed(1)), y: height - h, w: barWidth, h, on: v > 0 };
  });
}

/** Arco do anel de progresso médio (circunferência de r=50: 314). */
export function ringDash(pct) {
  const clamped = Math.min(100, Math.max(0, Number(pct) || 0));
  return `${((clamped / 100) * 314).toFixed(0)} 314`;
}

/** "+12%", "-3%", "0%" ou "—" (sem base de comparação). */
export function evolutionText(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

export function evolutionNote(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 'evolução no mês (sem mês anterior para comparar)';
  return 'evolução no mês';
}

/** Alturas (em %) das colunas de atividade; a maior coluna vale 100%. Mínimo de 4% para dias com ação. */
export function barHeights(days) {
  const max = Math.max(1, ...days.map((d) => Number(d.events) || 0));
  return days.map((d) => {
    const v = Number(d.events) || 0;
    return v === 0 ? 2 : Math.max(4, Math.round((v / max) * 100));
  });
}

/** Resumo em texto do gráfico de 14 dias. */
export function activitySummary(days) {
  const total = days.reduce((sum, d) => sum + (Number(d.events) || 0), 0);
  if (total === 0) return 'Nenhuma ação registrada nos últimos 14 dias.';
  const best = days.reduce((a, b) => (b.events > a.events ? b : a), days[0]);
  return `${plural(total, 'ação registrada', 'ações registradas')} nos últimos ${days.length} dias; o pico foi em ${dayLabel(best.day)} (${best.events}).`;
}

export function dayLabel(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Pontos (x,y) de uma série em viewBox 600x200, com margens; `max` é o teto do eixo. */
export function linePoints(values, max, { width = 600, padX = 30, top = 20, bottom = 190 } = {}) {
  const n = values.length;
  const ceiling = Math.max(1, max);
  return values.map((v, i) => ({
    x: n === 1 ? width / 2 : padX + (i * (width - padX * 2)) / (n - 1),
    y: bottom - (Math.max(0, v) / ceiling) * (bottom - top),
  }));
}

export function pathOf(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

/** Texto de tabela alternativa para o gráfico de evolução (leitor de tela). */
export function evolutionRows(evolution) {
  return evolution.map((p) => ({ label: p.label, avgXp: p.avgXp, goalsReached: p.goalsReached }));
}

// ------------------------------------------------------------------ lista de alunas
export const STUDENT_SEGMENTS = [
  { id: '', label: 'Todas' },
  { id: 'active', label: 'Ativas' },
  { id: 'at_risk', label: 'Em risco' },
  { id: 'invite_pending', label: 'Convite pendente' },
  { id: 'invite_expired', label: 'Convite expirado' },
  { id: 'blocked', label: 'Bloqueadas' },
  { id: 'inactive', label: 'Inativas' },
];

export function segmentCount(counts, id) {
  if (!counts) return null;
  const value = id === '' ? counts.all : counts[id];
  return Number.isInteger(value) ? value : null;
}

export const STUDENT_SORT_OPTIONS = [
  { value: 'name:asc', label: 'Nome (A–Z)' },
  { value: 'name:desc', label: 'Nome (Z–A)' },
  { value: 'progress:desc', label: 'Maior progresso' },
  { value: 'progress:asc', label: 'Menor progresso' },
  { value: 'last_login:desc', label: 'Acesso mais recente' },
  { value: 'activity:desc', label: 'Mais ativas' },
  { value: 'activeStudents:desc', label: 'Mais alunas ativas' },
  { value: 'activeStudents:asc', label: 'Menos alunas ativas' },
];

/** Nome de turma usado no filtro: '' = todas, '__none__' = sem turma. */
export const NO_CLASS = '__none__';

/** "Meta N de M" ou "—" quando a aluna não tem metas no mês. */
export function goalsText(goals) {
  if (!goals || !goals.total) return '—';
  return `${goals.ok} de ${goals.total}`;
}

export function goalsSentence(goals) {
  if (!goals || !goals.total) return 'Sem metas neste mês';
  return `${plural(goals.ok, 'meta atingida ou no ritmo', 'metas atingidas ou no ritmo')} de ${goals.total}`;
}

// ------------------------------------------------------------------ exportação da lista (CSV no navegador, sem R$)
const CSV_HEAD = ['Nome', 'E-mail', 'Turma', 'Estado', 'Último acesso', 'Nível', 'Alunas ativas', 'Alunas ativas atualizado em'];

const csvDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Linhas do CSV: só dados de cadastro e mentoria (nome, e-mail, turma, estado, último acesso, nível, alunas ativas informadas). Nunca valores em reais. */
export function studentRows(students) {
  return [
    CSV_HEAD,
    ...students.map((s) => [
      s.name,
      s.email,
      s.className ?? '',
      STATUS_LABELS[s.status] ?? s.status,
      s.lastLoginAt ? csvDate.format(new Date(s.lastLoginAt)) : 'Nunca acessou',
      levelText(s.level?.n),
      Number.isInteger(s.activeStudents?.count) ? s.activeStudents.count : 'Não informou',
      s.activeStudents?.updatedAt ? csvDate.format(new Date(s.activeStudents.updatedAt)) : '',
    ]),
  ];
}

export function studentsCsv(students) {
  return toCsv(studentRows(students));
}

export function studentsCsvFilename(now = new Date()) {
  const day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  return `alunas-indiscutivel-hub-${day}.csv`;
}

export { csvCell };

// ------------------------------------------------------------------ sessões
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' });
const HOUR = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Qui, 01 out. · 16h" (ou "16h30"). */
export function sessionWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const [hh, mm] = HOUR.format(date).split(':');
  const hour = mm === '00' ? `${Number(hh)}h` : `${Number(hh)}h${mm}`;
  return `${cap(WEEKDAY.format(date).replace('.', ''))}, ${DAY_MONTH.format(date)} · ${hour}`;
}

export function sessionLine(session) {
  return `${sessionWhen(session.startsAt)} · ${session.modeLabel?.toLowerCase() ?? session.mode} · ${session.durationMin} min`;
}

/** Valor de `<input type="datetime-local">` (horário do navegador) a partir de um instante ISO. */
export function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO (UTC) a partir do valor de `datetime-local` (horário do navegador); null se inválido. */
export function fromLocalInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value ?? '')) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Erro de campo do diálogo de sessão; '' = ok. */
export function sessionDateError(value, now = new Date()) {
  const iso = fromLocalInput(value);
  if (!iso) return 'Informe a data e a hora.';
  const at = new Date(iso).getTime();
  if (at < now.getTime() - 5 * 60_000) return 'Escolha um horário a partir de agora.';
  if (at > now.getTime() + 400 * DAY) return 'Escolha uma data dentro dos próximos 12 meses.';
  return '';
}

export function durationError(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return 'Informe a duração em minutos.';
  if (n < 15) return 'A duração mínima é 15 minutos.';
  if (n > 240) return 'A duração máxima é 240 minutos.';
  return '';
}

/** Item de calendário (formato de tarefa) para uma sessão: somente leitura, tipo "mentoring". */
export function sessionAsCalendarItem(session) {
  const topic = session.topic ? `: ${session.topic}` : '';
  return {
    id: `mentoring:${session.id}`,
    title: `Mentoria${topic}`,
    kind: 'mentoring',
    status: 'open',
    dueAt: session.startsAt,
    dueAllDay: false,
    readOnly: true,
    session,
  };
}

/** Rótulo curto do motivo (para o selo e leitores de tela). */
export const REASON_LABELS = {
  invite_expired: 'Convite vencido',
  never_accessed: 'Nunca acessou',
  inactive: 'Sem atividade',
  stalled_challenge: 'Desafio parado',
  blocked: 'Bloqueada',
};

export function attentionCountText(total) {
  return total === 0 ? 'Nada pendente' : plural(total, 'item', 'itens');
}
