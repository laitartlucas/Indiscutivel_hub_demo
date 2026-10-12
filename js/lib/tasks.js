// Regras puras de Tarefas e Calendário (sem DOM), testadas em web/test/tasks.test.js.
// Todas as datas aqui são no fuso do NAVEGADOR da aluna: o "dia" dela é o dia do relógio dela.
// O servidor recebe o deslocamento (`tzOffset`, como Date.getTimezoneOffset()) só para saber onde o dia começa.

import { TZ_OFFSETS } from './profile.js';

export const KIND_LABELS = {
  task: 'Tarefa',
  call: 'Ligação',
  meeting: 'Reunião',
  followup: 'Follow-up',
  deadline: 'Prazo',
};
export const KIND_OPTIONS = Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }));

export const PRIORITY_LABELS = { high: 'Alta', medium: 'Média', low: 'Baixa' };
export const PRIORITY_OPTIONS = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Média' },
  { value: 'low', label: 'Baixa' },
];

export const TABS = [
  { id: 'today', label: 'Hoje' },
  { id: 'upcoming', label: 'Próximas' },
  { id: 'overdue', label: 'Atrasadas' },
  { id: 'done', label: 'Concluídas' },
];

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS_SHORT = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const MONTHS_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const WEEKDAY_HEADERS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const pad = (n) => String(n).padStart(2, '0');

let tzOverride = null;

/** Fuso escolhido no Perfil. 'auto' (ou desconhecido) volta ao fuso do navegador. */
export function setTimezonePreference(value) {
  tzOverride = Object.hasOwn(TZ_OFFSETS, value) ? TZ_OFFSETS[value] : null;
}

/** Mesmo sinal de Date.getTimezoneOffset(): minutos que faltam do horário local até o UTC (Brasília = 180). Vale o fuso escolhido no Perfil, se houver. */
export function tzOffsetMinutes(date = new Date()) {
  return tzOverride ?? date.getTimezoneOffset();
}

/** 'AAAA-MM-DD' do dia local de `date`. */
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Meia-noite local do dia de `date` (cópia). */
export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Soma `days` dias de calendário (cópia, em meia-noite local; imune a horário de verão). */
export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function parseDayKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dayKey(date) === key ? date : null;
}

export function hasTime(task) {
  return Boolean(task.dueAt) && !task.dueAllDay;
}

/** "14:30" no relógio local. */
export function timeLabel(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dayDiff(date, now) {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** "25 set." (ou "25 set. 2025" em outro ano). */
export function shortDay(date, now = new Date()) {
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${pad(date.getDate())} ${MONTHS_SHORT[date.getMonth()]}${year}`;
}

/**
 * Prazo relativo curto (kit): "Hoje, 14:30", "Hoje", "Ontem", "Amanhã", "Qui, 01 out." (daqui a 2 dias ou mais),
 * "25 set." (antes de ontem). Sem prazo: "Sem prazo".
 */
export function dueLabel(task, now = new Date()) {
  if (!task.dueAt) return 'Sem prazo';
  const date = new Date(task.dueAt);
  if (Number.isNaN(date.getTime())) return 'Sem prazo';
  const diff = dayDiff(date, now);
  const time = hasTime(task) ? `, ${timeLabel(date)}` : '';
  if (diff === 0) return `Hoje${time}`;
  if (diff === -1) return `Ontem${time}`;
  if (diff === 1) return `Amanhã${time}`;
  if (diff > 1) return `${WEEKDAYS_SHORT[date.getDay()]}, ${shortDay(date, now)}${time}`;
  return `${shortDay(date, now)}${time}`;
}

/** Uma tarefa aberta está atrasada quando o dia do prazo já passou (mesma regra do servidor: antes do início de hoje). */
export function isOverdue(task, now = new Date()) {
  return task.status === 'open' && Boolean(task.dueAt) && new Date(task.dueAt).getTime() < startOfDay(now).getTime();
}

/** A tarefa pertence à aba? (usado para tirar da tela, sem recarregar, o que acabou de mudar de aba). */
export function belongsToTab(task, tab, now = new Date()) {
  const start = startOfDay(now).getTime();
  const end = addDays(now, 1).getTime();
  const due = task.dueAt ? new Date(task.dueAt).getTime() : null;
  switch (tab) {
    case 'done':
      return task.status === 'done';
    case 'today':
      return due !== null && due >= start && due < end;
    case 'overdue':
      return task.status === 'open' && due !== null && due < start;
    case 'upcoming':
      return task.status === 'open' && (due === null || due >= end);
    default:
      return true;
  }
}

/** Valores do formulário -> { dueAt, dueAllDay } da API. Data vazia = sem prazo; hora vazia = dia inteiro. */
export function buildDue(dateText, timeText) {
  const day = parseDayKey((dateText ?? '').trim());
  if (!day) return { dueAt: null, dueAllDay: false };
  const time = /^(\d{2}):(\d{2})$/.exec((timeText ?? '').trim());
  if (!time) return { dueAt: day.toISOString(), dueAllDay: true };
  day.setHours(Number(time[1]), Number(time[2]));
  return { dueAt: day.toISOString(), dueAllDay: false };
}

/** Tarefa -> { date: 'AAAA-MM-DD' | '', time: 'HH:MM' | '' } para preencher o formulário. */
export function splitDue(task) {
  if (!task?.dueAt) return { date: '', time: '' };
  const date = new Date(task.dueAt);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  return { date: dayKey(date), time: task.dueAllDay ? '' : timeLabel(date) };
}

/** Erro do campo de data ("AAAA-MM-DD" do <input type="date">): vazio vale; texto inválido não. */
export function dueDateError(value) {
  const text = (value ?? '').trim();
  if (text === '') return null;
  const day = parseDayKey(text);
  if (!day) return 'Informe uma data válida.';
  const year = day.getFullYear();
  return year < 2000 || year > 2099 ? 'Informe uma data válida.' : null;
}

/** A hora só vale com data. */
export function dueTimeError(value, all) {
  const text = (value ?? '').trim();
  if (text === '') return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return 'Informe uma hora válida.';
  return (all?.dueDate ?? '').trim() === '' ? 'Escolha a data para definir a hora.' : null;
}

export function titleError(value) {
  const text = value.trim();
  if (!text) return 'Informe o título da tarefa.';
  if (value.length > 120) return 'Título muito longo (máximo 120).';
  return null;
}

export function notesError(value) {
  return value.trim().length > 1000 ? 'Anotações muito longas (máximo 1000).' : null;
}

/** Anel "Foco de hoje": quantas feitas, total do dia e o tamanho do arco (circunferência 314 para r=50). */
export function focusRing(summary) {
  const done = summary?.todayDone ?? 0;
  const total = (summary?.today ?? 0) + done;
  const circumference = 314;
  return { done, total, dash: total === 0 ? 0 : Math.round((circumference * done) / total), circumference };
}

/** Contagem que fica no selo do menu: o que pede ação agora (atrasadas + as de hoje ainda abertas). */
export function pendingBadge(summary) {
  if (!summary) return 0;
  return (summary.overdue ?? 0) + (summary.today ?? 0);
}

// ---------- calendário ----------

export function monthTitle(year, month) {
  return `${MONTHS_LONG[month]} ${year}`;
}

/** "Segunda, 28 set." */
export function agendaTitle(date) {
  return `${WEEKDAYS_LONG[date.getDay()]}, ${pad(date.getDate())} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** Mês anterior/seguinte com virada de ano: { year, month } (month 0–11). */
export function shiftMonth({ year, month }, delta) {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/**
 * Grade do mês: semanas começando no domingo, 5 ou 6 linhas conforme o mês, com os dias vizinhos
 * para completar a primeira e a última semana. Cada célula: { date, key, day, inMonth }.
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = addDays(first, -first.getDay());
  const total = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
  const cells = [];
  for (let i = 0; i < total; i++) {
    const date = addDays(start, i);
    cells.push({ date, key: dayKey(date), day: date.getDate(), inMonth: date.getMonth() === month && date.getFullYear() === year });
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Intervalo [from, to) da grade inteira (inclui os dias vizinhos) como ISO, para pedir à API de uma vez. */
export function gridRange(weeks) {
  const first = weeks[0][0].date;
  const last = weeks[weeks.length - 1][6].date;
  return { from: startOfDay(first).toISOString(), to: addDays(last, 1).toISOString() };
}

/** Agrupa por dia local ('AAAA-MM-DD'); dentro do dia: com hora (cronológico), depois dia inteiro; abertas antes das feitas. */
export function groupByDay(tasks) {
  const map = new Map();
  for (const task of tasks) {
    if (!task.dueAt) continue;
    const date = new Date(task.dueAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  for (const list of map.values()) list.sort(compareInDay);
  return map;
}

function compareInDay(a, b) {
  const done = Number(a.status === 'done') - Number(b.status === 'done');
  if (done !== 0) return done;
  const timed = Number(!hasTime(a)) - Number(!hasTime(b));
  if (timed !== 0) return timed;
  return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
}

/** Linha da agenda do dia: "10:00" ou "Dia todo". */
export function agendaTime(task) {
  return hasTime(task) ? timeLabel(new Date(task.dueAt)) : 'Dia todo';
}

/** Posição da célula focada na grade após uma seta/Home/End/PageUp/PageDown; devolve a nova data ou null (tecla não tratada). */
export function gridKeyTarget(key, date) {
  switch (key) {
    case 'ArrowLeft':
      return addDays(date, -1);
    case 'ArrowRight':
      return addDays(date, 1);
    case 'ArrowUp':
      return addDays(date, -7);
    case 'ArrowDown':
      return addDays(date, 7);
    case 'Home':
      return addDays(date, -date.getDay());
    case 'End':
      return addDays(date, 6 - date.getDay());
    case 'PageUp':
      return new Date(date.getFullYear(), date.getMonth() - 1, Math.min(date.getDate(), new Date(date.getFullYear(), date.getMonth(), 0).getDate()));
    case 'PageDown':
      return new Date(date.getFullYear(), date.getMonth() + 1, Math.min(date.getDate(), new Date(date.getFullYear(), date.getMonth() + 2, 0).getDate()));
    default:
      return null;
  }
}

export { parseDayKey };
