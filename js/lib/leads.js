// Regras puras de Leads (sem DOM), testadas em web/test/leads.test.js.
// Datas no fuso do NAVEGADOR da aluna, como em Tarefas: o "hoje" dela é o hoje do relógio dela.
import { formatMoney } from '../../shared/money.js';
import { shortDay, startOfDay, timeLabel } from './tasks.js';

export const STATUS_LABELS = {
  new: 'Novo',
  contacted: 'Contatado',
  qualified: 'Qualificado',
  lost: 'Perdido',
  converted: 'Convertido',
};
/** Tom do selo (components.badge): a palavra carrega o significado, a cor só reforça. */
export const STATUS_TONES = { new: 'neutral', contacted: 'warn', qualified: 'good', lost: 'bad', converted: 'accent' };
/** Situações que se escolhem à mão (Convertido só nasce da conversão). */
export const STATUS_FORM_OPTIONS = ['new', 'contacted', 'qualified', 'lost'].map((value) => ({ value, label: STATUS_LABELS[value] }));
/** Filtros segmentados da lista, na ordem do funil. */
export const STATUS_SEGMENTS = [
  { id: '', label: 'Todos' },
  { id: 'new', label: 'Novos' },
  { id: 'contacted', label: 'Contatados' },
  { id: 'qualified', label: 'Qualificados' },
  { id: 'lost', label: 'Perdidos' },
  { id: 'converted', label: 'Convertidos' },
];

/** Ordem do seletor do drawer (Frio · Morno · Quente, como no kit). */
export const TEMPERATURE_CHOICES = [
  { value: 'cold', label: 'Frio' },
  { value: 'warm', label: 'Morno' },
  { value: 'hot', label: 'Quente' },
];
export const TEMPERATURE_FILTER_OPTIONS = [{ value: '', label: 'Todas' }, ...[...TEMPERATURE_CHOICES].reverse()];

export const ACTIVITY_KINDS = {
  note: { label: 'Nota', icon: 'edit' },
  call: { label: 'Ligação', icon: 'phone' },
  email: { label: 'E-mail', icon: 'mail' },
  meeting: { label: 'Reunião', icon: 'calendar' },
  whatsapp: { label: 'WhatsApp', icon: 'chat' },
  status_change: { label: 'Situação', icon: 'refresh' },
};
/** Tipos que a aluna registra no composer (status_change é automático). */
export const COMPOSER_KINDS = ['note', 'call', 'email', 'meeting', 'whatsapp'];

export const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Mais recentes' },
  { value: 'last_activity:desc', label: 'Última atividade' },
  { value: 'name:asc', label: 'Nome (A–Z)' },
  { value: 'value:desc', label: 'Maior valor' },
];

// ---------- exibição ----------

/** "8500.00" -> "R$ 8.500"; com centavos mantém ("R$ 8.500,50"); ausente -> "—". */
export function moneyShort(value) {
  const text = formatMoney(value);
  return text.endsWith(',00') ? text.slice(0, -3) : text;
}

/** Cartões do KPI strip, só com números que a API entrega (sem taxa nem comparação inventada). */
export function kpiCards(summary) {
  const s = summary ?? { total: 0, byStatus: {}, hot: 0, estimatedValue: '0.00' };
  const by = s.byStatus ?? {};
  return [
    { id: 'total', label: 'Total', value: String(s.total ?? 0), note: (s.total ?? 0) === 1 ? 'lead' : 'leads' },
    { id: 'new', label: 'Novos', value: String(by.new ?? 0), note: '' },
    { id: 'qualified', label: 'Qualificados', value: String(by.qualified ?? 0), note: '' },
    { id: 'hot', label: 'Quentes', value: String(s.hot ?? 0), note: 'em andamento' },
    { id: 'value', label: 'Valor estimado', value: moneyShort(s.estimatedValue ?? '0.00'), note: 'em andamento', gold: true },
  ];
}

/** Contagem de cada filtro segmentado, vinda de `summary` (carteira inteira). */
export function segmentCount(summary, id) {
  if (!summary) return null;
  return id === '' ? summary.total : (summary.byStatus?.[id] ?? 0);
}

/** Cor do avatar: uma de 5 variações fixas por lead (estável entre telas). */
export function avatarTone(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 5;
}

function dayDiff(date, now) {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** "Hoje, 14:32" / "Ontem, 18:05" / "25 set." / "25 set. 2025" (instante inválido -> "—"). */
export function whenLabel(iso, now = new Date()) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return '—';
  const diff = dayDiff(date, now);
  if (diff === 0) return `Hoje, ${timeLabel(date)}`;
  if (diff === -1) return `Ontem, ${timeLabel(date)}`;
  return shortDay(date, now);
}

/** "lead desde hoje" / "lead há 1 dia" / "lead há 10 dias" / "lead há 3 meses". */
export function leadAge(createdAt, now = new Date()) {
  const date = new Date(createdAt);
  if (!createdAt || Number.isNaN(date.getTime())) return '';
  const days = Math.max(0, -dayDiff(date, now));
  if (days === 0) return 'lead desde hoje';
  if (days === 1) return 'lead há 1 dia';
  if (days < 60) return `lead há ${days} dias`;
  return `lead há ${Math.floor(days / 30)} meses`;
}

/** "Fundadora · Lumen Marketing · lead há 10 dias": só o que existe. */
export function leadSubtitle(lead, now = new Date()) {
  return [lead.jobTitle, lead.company, leadAge(lead.createdAt, now)].filter(Boolean).join(' · ');
}

/** Rótulo do dia na linha do tempo: "Hoje", "Ontem" ou a data ("25 set. 2026"). */
function dayHeading(date, now) {
  const diff = dayDiff(date, now);
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  // shortDay já traz o ano quando é de outro ano; no mesmo ano o cabeçalho também o mostra.
  return date.getFullYear() === now.getFullYear() ? `${shortDay(date, now)} ${date.getFullYear()}` : shortDay(date, now);
}

/**
 * Agrupa a linha do tempo por dia local, mantendo a ordem recebida (mais recente primeiro).
 * Devolve [{ key: 'AAAA-MM-DD', label, items }]. Item com data inválida vai para o fim, em "Sem data".
 */
export function groupTimeline(items, now = new Date()) {
  const groups = [];
  const index = new Map();
  for (const item of items) {
    const date = new Date(item.occurredAt);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : 'sem-data';
    if (!index.has(key)) {
      const group = { key, label: valid ? dayHeading(date, now) : 'Sem data', items: [] };
      index.set(key, group);
      groups.push(group);
    }
    index.get(key).items.push(item);
  }
  return groups;
}

/** "Hoje, 14:32" para a linha do tempo; as automáticas dizem "automático". */
export function activityMeta(activity, now = new Date()) {
  const when = whenLabel(activity.occurredAt, now);
  return activity.kind === 'status_change' ? `${when} · automático` : when;
}

/** Próxima tarefa a mostrar: a aberta com prazo mais próximo (a API já devolve abertas primeiro, por prazo). */
export function nextOpenTask(tasks) {
  return (tasks ?? []).find((task) => task.status === 'open' && task.dueAt) ?? null;
}

// ---------- validação (espelha as regras do servidor) ----------

export function leadNameError(value) {
  if (!value.trim()) return 'Informe o nome do lead.';
  if (value.length > 120) return 'Nome muito longo (máximo 120).';
  return null;
}

export function shortTextError(label) {
  return (value) => (value.trim().length > 120 ? `${label} muito longo (máximo 120).` : null);
}
export const companyError = (value) => (value.trim().length > 120 ? 'Empresa muito longa (máximo 120).' : null);
export const jobTitleError = shortTextError('Cargo');

export function notesError(value) {
  return value.trim().length > 1000 ? 'Observações muito longas (máximo 1000).' : null;
}

export function activityBodyError(value) {
  const text = value.trim();
  if (!text) return 'Descreva a atividade.';
  if (text.length > 1000) return 'Texto muito longo (máximo 1000).';
  return null;
}
