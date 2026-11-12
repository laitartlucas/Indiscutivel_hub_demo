// Regras puras da Central Comercial (sem DOM), testadas em web/test/commercial.test.js.
// Datas no fuso do NAVEGADOR da aluna, como em Tarefas: o "hoje" dela é o hoje do relógio dela.
import { formatMoney } from '../../shared/money.js';
import { normalizePage } from './list-state.js';
import { fromCents, toCents } from './pipeline-config.js';
import { shortDay, startOfDay, timeLabel } from './tasks.js';

// ---------- respostas de lista ----------

export { normalizePage };

/** Só as linhas, venham em `rows`, `data`, `items` ou como lista pura. */
export function listOf(result) {
  if (Array.isArray(result)) return result;
  for (const key of ['rows', 'data', 'items']) if (Array.isArray(result?.[key])) return result[key];
  return [];
}

// ---------- estado comercial do contato ----------

export const CONTACT_STATUS = Object.freeze({
  lead: { label: 'Lead', tone: 'neutral' },
  negotiating: { label: 'Em negociação', tone: 'warn' },
  client: { label: 'Cliente', tone: 'good' },
  lost: { label: 'Perdido', tone: 'bad' },
});

export const contactStatusLabel = (status) => CONTACT_STATUS[status]?.label ?? 'Lead';
export const contactStatusTone = (status) => CONTACT_STATUS[status]?.tone ?? 'neutral';

/** Filtros segmentados da lista de contatos, na ordem do funil. */
export const STATUS_SEGMENTS = [
  { id: '', label: 'Todos' },
  { id: 'lead', label: 'Leads' },
  { id: 'negotiating', label: 'Em negociação' },
  { id: 'client', label: 'Clientes' },
  { id: 'lost', label: 'Perdidos' },
];

export const isContactStatus = (value) => Object.hasOwn(CONTACT_STATUS, value);

/** Contagem de cada segmento a partir de GET /people/counts; sem a resposta, null (mostra "·"). */
export function segmentCount(counts, id) {
  if (!counts || typeof counts !== 'object') return null;
  const value = id === '' ? counts.total : counts[id];
  return Number.isInteger(value) ? value : 0;
}

export const LEAD_STATUS_LABELS = Object.freeze({ new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado', discarded: 'Descartado' });
export const LEAD_STATUS_OPTIONS = Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }));

// ---------- temperatura ----------

/**
 * A cor nunca é a única pista: a palavra (Quente/Morno/Frio) vai sempre junto. Nunca usa o tom "accent"
 * (verde de marca só em estado interativo).
 */
const TEMPERATURE_LABELS = { hot: 'Quente', warm: 'Morno', cold: 'Frio' };
const TEMPERATURE_TONES = { hot: 'bad', warm: 'warn', cold: 'neutral' };

export const temperatureLabel = (t) => TEMPERATURE_LABELS[t] ?? (t ? String(t) : '—');
export const temperatureTone = (t) => TEMPERATURE_TONES[t] ?? 'neutral';
/** Frio · Morno · Quente (ordem dos formulários). */
export const TEMPERATURE_CHOICES = ['cold', 'warm', 'hot'].map((value) => ({ value, label: TEMPERATURE_LABELS[value] }));
export const TEMPERATURE_FILTER_OPTIONS = [{ value: '', label: 'Todas' }, ...['hot', 'warm', 'cold'].map((value) => ({ value, label: TEMPERATURE_LABELS[value] }))];

// ---------- atividades e linha do tempo ----------

export const ACTIVITY_KINDS = Object.freeze({
  note: { label: 'Nota', icon: 'edit' },
  call: { label: 'Ligação', icon: 'phone' },
  email: { label: 'E-mail', icon: 'mail' },
  meeting: { label: 'Reunião', icon: 'calendar' },
  whatsapp: { label: 'WhatsApp', icon: 'chat' },
  status_change: { label: 'Situação', icon: 'refresh' },
});
/** Tipos que a aluna registra à mão. */
export const COMPOSER_KINDS = ['note', 'call', 'email', 'meeting', 'whatsapp'];

/** "8500.00" -> "R$ 8.500"; com centavos mantém ("R$ 8.500,50"); ausente -> "—". */
export function moneyShort(value) {
  const text = formatMoney(value);
  return text.endsWith(',00') ? text.slice(0, -3) : text;
}

/** Cor do avatar: uma de 5 variações fixas por id (estável entre telas). */
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

function dayHeading(date, now) {
  const diff = dayDiff(date, now);
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  return date.getFullYear() === now.getFullYear() ? `${shortDay(date, now)} ${date.getFullYear()}` : shortDay(date, now);
}

/** Instante de um item da linha do tempo: `at` (timeline) ou `occurredAt` (atividades). */
const itemInstant = (item) => item?.at ?? item?.occurredAt;

/**
 * Agrupa a linha do tempo por dia local, mantendo a ordem recebida (mais recente primeiro).
 * Devolve [{ key: 'AAAA-MM-DD', label, items }]. Item com data inválida vai para o fim, em "Sem data".
 */
export function groupTimeline(items, now = new Date()) {
  const groups = [];
  const index = new Map();
  for (const item of items ?? []) {
    const date = new Date(itemInstant(item));
    const valid = itemInstant(item) && !Number.isNaN(date.getTime());
    const key = valid ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : 'sem-data';
    if (!index.has(key)) {
      const group = { key, label: valid ? dayHeading(date, now) : 'Sem data', items: [] };
      index.set(key, group);
      groups.push(group);
    }
    index.get(key).items.push(item);
  }
  const undated = groups.findIndex((g) => g.key === 'sem-data');
  if (undated >= 0 && undated !== groups.length - 1) groups.push(groups.splice(undated, 1)[0]);
  return groups;
}

/**
 * Como mostrar um item de GET /people/:id/timeline: ícone, título, texto e se a aluna pode excluí-lo
 * (só atividades registradas à mão; mudanças de etapa e oportunidades abertas são automáticas).
 */
export function timelineView(item) {
  if (item?.type === 'stage') {
    const won = item.toStageName && item.toStatus === 'won';
    return {
      icon: 'pipeline',
      title: 'Mudança de etapa',
      text: [item.funnelName, item.fromStageName && item.toStageName ? `${item.fromStageName} → ${item.toStageName}` : item.toStageName].filter(Boolean).join(' · '),
      manual: false,
      tone: won ? 'won' : 'auto',
    };
  }
  if (item?.type === 'deal') {
    return {
      icon: 'plus',
      title: 'Oportunidade aberta',
      text: [item.funnelName, item.toStageName, item.value ? moneyShort(item.value) : null].filter(Boolean).join(' · '),
      manual: false,
      tone: 'auto',
    };
  }
  const kind = ACTIVITY_KINDS[item?.kind] ?? ACTIVITY_KINDS.note;
  return { icon: kind.icon, title: kind.label, text: item?.body ?? '', manual: item?.kind !== 'status_change', tone: 'manual' };
}

// ---------- motivo da perda ----------

export const LOST_REASONS = ['Sem resposta', 'Sem orçamento', 'Sem fit', 'Adiou a decisão', 'Escolheu outra opção', 'Outro'];

/** Texto enviado como `lostReason`: o motivo escolhido e, se houver, o detalhe ("Sem orçamento — volta em março"). */
export function lostReasonText(choice, detail) {
  const extra = String(detail ?? '').trim();
  if (!choice || choice === 'Outro') return extra;
  return extra ? `${choice} — ${extra}` : choice;
}

export function lostReasonChoiceError(choice) {
  return LOST_REASONS.includes(choice) ? null : 'Escolha um motivo.';
}

/** Detalhe: obrigatório só em "Outro"; o texto final cabe em 500 caracteres. */
export function lostReasonDetailError(detail, choice) {
  const text = String(detail ?? '').trim();
  if (choice === 'Outro' && !text) return 'Conte em poucas palavras o motivo.';
  if (lostReasonText(choice, text).length > 500) return 'Motivo muito longo (máximo 500).';
  return null;
}

// ---------- visão geral (GET /commercial/overview) e resumo do funil (GET /deals/summary) ----------

export const PERIODS = [
  { value: 'month', label: 'Este mês' },
  { value: 'quarter', label: 'Este trimestre' },
  { value: 'year', label: 'Este ano' },
];
export const isPeriod = (value) => PERIODS.some((p) => p.value === value);

const percentFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const countFormat = new Intl.NumberFormat('pt-BR');

/**
 * Taxa de conversão como "33,3%"; null/indefinida -> "—". O servidor manda a porcentagem (0 a 100, uma casa),
 * como em Relatórios (server/src/domain/reports.ts, conversionRate).
 */
export function formatRate(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(Number(rate))) return '—';
  return `${percentFormat.format(Number(rate))}%`;
}

/** "—" / "Mesmo dia" / "1 dia" / "12 dias". */
export function daysLabel(days) {
  if (days === null || days === undefined || !Number.isFinite(Number(days))) return '—';
  const n = Math.round(Number(days));
  if (n <= 0) return 'Mesmo dia';
  return `${countFormat.format(n)} ${n === 1 ? 'dia' : 'dias'}`;
}

export const plural = (n, one, many) => `${countFormat.format(n)} ${n === 1 ? one : many}`;

/** Indicadores do topo da Visão geral, só com o que a API entrega. */
export function overviewKpis(o) {
  const open = o?.open ?? { count: 0, total: '0.00', weighted: '0.00' };
  const won = o?.won ?? { count: 0, total: '0.00' };
  const lost = o?.lost ?? { count: 0, total: '0.00' };
  return [
    { id: 'new', label: 'Novos contatos', value: countFormat.format(o?.newContacts ?? 0), note: 'no período' },
    { id: 'open', label: 'Em negociação', value: moneyShort(open.total), note: `${plural(open.count, 'oportunidade', 'oportunidades')} · ponderado ${moneyShort(open.weighted ?? '0.00')}` },
    { id: 'won', label: 'Ganhas', value: moneyShort(won.total), note: plural(won.count, 'venda', 'vendas'), gold: true },
    { id: 'lost', label: 'Perdidas', value: countFormat.format(lost.count), note: lost.total && toCents(lost.total) > 0 ? moneyShort(lost.total) : 'no período' },
    { id: 'conversion', label: 'Conversão', value: formatRate(o?.conversionRate), note: 'ganhas ÷ (ganhas + perdidas)' },
    { id: 'cycle', label: 'Tempo médio', value: daysLabel(o?.avgDaysToClose), note: 'da abertura ao fechamento' },
  ];
}

/** Barras "Contatos por situação": largura relativa à maior contagem (mínimo 4% quando há algo). */
export function statusBars(byStatus) {
  const rows = ['lead', 'negotiating', 'client', 'lost'].map((status) => ({ status, label: CONTACT_STATUS[status].label, count: Number(byStatus?.[status] ?? 0) }));
  const max = Math.max(0, ...rows.map((r) => r.count));
  return rows.map((r) => ({ ...r, width: max === 0 || r.count === 0 ? 0 : Math.max(4, Math.round((r.count / max) * 100)) }));
}

/** Tabela por funil: só os funis com algum movimento, os de mais oportunidades primeiro; barra relativa ao maior. */
export function funnelRows(byFunnel) {
  const rows = (byFunnel ?? [])
    .map((f) => ({ ...f, open: Number(f.open ?? 0), won: Number(f.won ?? 0), lost: Number(f.lost ?? 0) }))
    .map((f) => ({ ...f, volume: f.open + f.won + f.lost }))
    .filter((f) => f.volume > 0)
    .sort((a, b) => b.volume - a.volume || String(a.name).localeCompare(String(b.name), 'pt-BR'));
  const max = Math.max(0, ...rows.map((r) => r.volume));
  return rows.map((r) => ({ ...r, width: max === 0 ? 0 : Math.max(4, Math.round((r.volume / max) * 100)) }));
}

/** Faixa de números do quadro de um funil (GET /deals/summary?funnelId). */
export function summaryMetrics(s) {
  const open = s?.open ?? { count: 0, total: '0.00', weighted: '0.00' };
  return [
    { label: 'Em negociação', value: moneyShort(open.total), note: plural(open.count, 'oportunidade', 'oportunidades') },
    { label: 'Ponderado', value: moneyShort(open.weighted ?? '0.00'), note: 'valor × probabilidade' },
    { label: 'Ganho', value: moneyShort(s?.won?.total ?? '0.00'), note: plural(s?.won?.count ?? 0, 'ganha', 'ganhas') },
    { label: 'Perdido', value: moneyShort(s?.lost?.total ?? '0.00'), note: plural(s?.lost?.count ?? 0, 'perdida', 'perdidas') },
    { label: 'Conversão', value: formatRate(s?.conversionRate), note: 'ganhas ÷ fechadas' },
    { label: 'Tempo médio', value: daysLabel(s?.avgDaysToClose), note: 'até fechar' },
  ];
}

/** Soma de `value` (texto decimal) em texto decimal. Lista vazia -> "0.00". */
export function sumValues(items) {
  return fromCents((items ?? []).reduce((total, item) => total + toCents(item?.value ?? '0'), 0));
}

/** Período do quadro (sobre `opened_at`) em { from, to } AAAA-MM-DD, pelo calendário local; '' = sem filtro. */
export function periodRange(period, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === '30d') return { from: day(new Date(y, m, now.getDate() - 29)), to: day(now) };
  if (period === 'month') return { from: day(new Date(y, m, 1)), to: day(new Date(y, m + 1, 0)) };
  if (period === 'quarter') {
    const q = Math.floor(m / 3) * 3;
    return { from: day(new Date(y, q, 1)), to: day(new Date(y, q + 3, 0)) };
  }
  if (period === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: '', to: '' };
}

export const BOARD_PERIODS = [
  { value: '', label: 'Qualquer data' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'month', label: 'Abertas este mês' },
  { value: 'quarter', label: 'Abertas no trimestre' },
  { value: 'year', label: 'Abertas este ano' },
];

// ---------- contatos: formulário ----------

export const MAX_TAGS = 10;

/** "vip, indicação ,  vip" -> ["vip", "indicação"] (sem repetir, sem vazios). */
export function parseTags(text) {
  const out = [];
  for (const raw of String(text ?? '').split(',')) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (tag && !out.some((t) => t.toLocaleLowerCase('pt-BR') === tag.toLocaleLowerCase('pt-BR'))) out.push(tag);
  }
  return out;
}

export function tagsError(text) {
  const tags = parseTags(text);
  if (tags.length > MAX_TAGS) return `Use no máximo ${MAX_TAGS} etiquetas.`;
  if (tags.some((t) => [...t].length > 30)) return 'Cada etiqueta pode ter até 30 caracteres.';
  return null;
}

export function contactNameError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Informe o nome do contato.';
  if ([...text].length > 120) return 'Nome muito longo (máximo 120).';
  return null;
}

export const shortTextError = (label, max = 120) => (value) => ([...String(value ?? '').trim()].length > max ? `${label} muito longo (máximo ${max}).` : null);

export function notesError(value) {
  return String(value ?? '').trim().length > 2000 ? 'Observações muito longas (máximo 2000).' : null;
}

export function activityBodyError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Descreva a atividade.';
  if (text.length > 1000) return 'Texto muito longo (máximo 1000).';
  return null;
}

const orNull = (value) => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

/**
 * Corpo de POST/PATCH /people a partir dos valores do formulário. Só entram as chaves que o formulário tem
 * (o diálogo rápido de "novo contato" no quadro não tem todos os campos). `leadStatus` só vai quando o campo existe.
 */
export function contactPayload(values) {
  const body = {};
  if ('name' in values) body.name = String(values.name).trim();
  for (const key of ['phone', 'whatsapp', 'instagram', 'email', 'responsible', 'notes']) if (key in values) body[key] = orNull(values[key]);
  if ('source' in values && values.source) body.source = values.source;
  // Temperatura não tem "vazio" no servidor: em branco, o campo simplesmente não vai.
  if ('temperature' in values && values.temperature) body.temperature = values.temperature;
  if ('leadStatus' in values && values.leadStatus) body.leadStatus = values.leadStatus;
  if ('entryFunnelId' in values) body.entryFunnelId = values.entryFunnelId || null;
  if ('campaignId' in values) body.campaignId = values.campaignId || null;
  if ('tags' in values) body.tags = parseTags(values.tags);
  return body;
}
