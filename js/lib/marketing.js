// Regras puras do Marketing (sem DOM), testadas em web/test/marketing.test.js.
// O servidor (server/src/domain/marketing.ts) calcula os indicadores; aqui ficam os rótulos, a formatação, o texto
// das fórmulas ("Como calculamos"), as mesmas fórmulas para prévias (engajamento do Instagram) e as validações.
import { parseMoney } from '../../shared/money.js';
import { fromCents, isIsoDate, money, toCents } from './finance.js';

// ---------- canais e situação da campanha ----------

export const CHANNELS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'email', label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'event', label: 'Evento' },
  { value: 'organic', label: 'Orgânico' },
  { value: 'referral', label: 'Indicação' },
  { value: 'other', label: 'Outro' },
];
export const isChannel = (value) => CHANNELS.some((c) => c.value === value);
export const channelLabel = (value) => CHANNELS.find((c) => c.value === value)?.label ?? '—';
export const CHANNEL_FILTER_OPTIONS = [{ value: '', label: 'Todos os canais' }, ...CHANNELS];

export const CAMPAIGN_STATUS = Object.freeze({
  planned: { label: 'Planejada', tone: 'warn' },
  active: { label: 'Ativa', tone: 'good' },
  ended: { label: 'Encerrada', tone: 'neutral' },
  archived: { label: 'Arquivada', tone: 'neutral' },
});
export const campaignStatusLabel = (s) => CAMPAIGN_STATUS[s]?.label ?? 'Planejada';
export const campaignStatusTone = (s) => CAMPAIGN_STATUS[s]?.tone ?? 'neutral';
export const isCampaignStatus = (value) => Object.hasOwn(CAMPAIGN_STATUS, value);

export const CAMPAIGN_SEGMENTS = [
  { id: '', label: 'Todas' },
  { id: 'planned', label: 'Planejadas' },
  { id: 'active', label: 'Ativas' },
  { id: 'ended', label: 'Encerradas' },
  { id: 'archived', label: 'Arquivadas' },
];

/**
 * Opções de "Campanha" nos formulários: só as não arquivadas, mais a atual do registro (mesmo arquivada, ou só com o
 * nome se a lista não veio). `emptyLabel`: o que significa deixar em branco ("Nenhuma", "Mesma do contato").
 */
export function campaignOptions(campaigns, { currentId = null, currentName = null, emptyLabel = 'Nenhuma' } = {}) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  const options = list
    .filter((c) => !c.archived || c.id === currentId)
    .map((c) => ({ value: c.id, label: c.archived ? `${c.name} (arquivada)` : c.name }));
  if (currentId && !options.some((o) => o.value === currentId)) options.push({ value: currentId, label: currentName ?? 'Campanha atual' });
  return [{ value: '', label: emptyLabel }, ...options];
}

// ---------- fórmulas (as mesmas do servidor; usadas em prévias e testes) ----------

const round = (value, digits) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** CPL = investimento ÷ leads (texto R$); sem leads → null. */
export function cpl(investment, leads) {
  const n = Number(leads);
  if (!n) return null;
  return fromCents(Math.round(toCents(investment) / n));
}

/** CAC = investimento ÷ clientes novos (texto R$); sem clientes novos → null. */
export function cac(investment, newClients) {
  const n = Number(newClients);
  if (!n) return null;
  return fromCents(Math.round(toCents(investment) / n));
}

/** Taxa de conversão = clientes novos ÷ leads × 100 (uma casa); sem leads → null. */
export function conversionRate(newClients, leads) {
  const n = Number(leads);
  if (!n) return null;
  return round((Number(newClients) / n) * 100, 1);
}

/** ROAS = receita ÷ investimento (duas casas); sem investimento → null. */
export function roas(revenue, investment) {
  const inv = toCents(investment);
  if (inv <= 0) return null;
  return round(toCents(revenue) / inv, 2);
}

/** ROI = (receita − investimento) ÷ investimento × 100 (uma casa); sem investimento → null. */
export function roi(revenue, investment) {
  const inv = toCents(investment);
  if (inv <= 0) return null;
  return round(((toCents(revenue) - inv) / inv) * 100, 1);
}

/** Engajamento = interações ÷ alcance × 100 (uma casa); sem alcance → null. */
export function engagementRate(interactions, reach) {
  const r = Number(reach);
  if (!r) return null;
  return round((Number(interactions) / r) * 100, 1);
}

/** "Como calculamos": o texto das fórmulas, igual ao da especificação. */
export const FORMULAS = [
  { term: 'Investimento', text: 'soma dos investimentos lançados com data no período (por campanha: só os dela).' },
  { term: 'Leads', text: 'contatos criados no período (por campanha: com aquela campanha; por origem: agrupados pela origem).' },
  { term: 'CPL (custo por lead)', text: 'investimento ÷ leads. Sem leads, não há CPL.' },
  { term: 'Oportunidades', text: 'oportunidades abertas no período; por campanha, pela campanha da oportunidade.' },
  {
    term: 'Vendas e Receita atribuída',
    text: 'vendas ativas com data no período e o valor final delas. Atribuição única: a campanha da oportunidade da venda; venda sem oportunidade usa a campanha do contato. Uma venda nunca conta para duas campanhas.',
  },
  { term: 'Clientes novos', text: 'contatos cuja primeira venda ativa cai no período.' },
  { term: 'CAC (custo de aquisição de cliente)', text: 'investimento ÷ clientes novos. Sem clientes novos, não há CAC.' },
  { term: 'Taxa de conversão', text: 'clientes novos ÷ leads × 100 (uma casa decimal). Sem leads, não há taxa.' },
  { term: 'ROAS', text: 'receita atribuída ÷ investimento (duas casas, ex.: 3,25). Sem investimento, não há ROAS.' },
  { term: 'ROI', text: '(receita atribuída − investimento) ÷ investimento × 100 (uma casa, %). Sem investimento, não há ROI.' },
  { term: 'Engajamento (Instagram)', text: 'interações ÷ alcance × 100 (uma casa). Sem alcance, não há engajamento.' },
];

/** Nota sobre a visão geral: o que entra nas vendas sem campanha. */
export const OVERVIEW_NOTE = 'Na visão geral, a receita atribuída e as vendas incluem também as vendas sem campanha; a tabela por campanha mostra só as atribuídas, e a linha "Sem campanha" fecha a conta.';

// ---------- formatação ----------

const intFormat = new Intl.NumberFormat('pt-BR');
const oneDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export const formatCount = (v) => (isNum(v) ? intFormat.format(Number(v)) : '—');
/** "12,5%"; null → "—". */
export const formatPct = (v) => (isNum(v) ? `${oneDecimal.format(Number(v))}%` : '—');
/** ROAS "3,25×"; null → "—". */
export const formatRoas = (v) => (isNum(v) ? `${twoDecimals.format(Number(v))}×` : '—');
/** R$ ou "—" quando o indicador não existe (null). */
export const moneyOrDash = (v) => (v === null || v === undefined || v === '' ? '—' : money(String(v)));
/** "+12" / "−3" / "0"; null → "—". */
export function signedCount(v) {
  if (!isNum(v)) return '—';
  const n = Number(v);
  return n > 0 ? `+${intFormat.format(n)}` : n < 0 ? `−${intFormat.format(-n)}` : '0';
}
/** "+12,5%" / "−3,0%"; null → "—". */
export function signedPct(v) {
  if (!isNum(v)) return '—';
  const n = Number(v);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${oneDecimal.format(Math.abs(n))}%`;
}
/** Diferença em pontos percentuais ("+1,2 p.p."); null → "—". */
export function signedPoints(v) {
  if (!isNum(v)) return '—';
  const n = Number(v);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${oneDecimal.format(Math.abs(n))} p.p.`;
}
/** Tom da variação: subir é bom (good), cair é ruim (bad), sem base é neutro. */
export const deltaTone = (v) => (!isNum(v) || Number(v) === 0 ? 'neutral' : Number(v) > 0 ? 'good' : 'bad');

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "2026-11" → "nov/26". */
export function monthLabel(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key ?? ''));
  return m ? `${MONTHS[Number(m[2]) - 1]}/${m[1].slice(2)}` : String(key ?? '');
}

/** "01/11/2026 a 30/11/2026"; datas inválidas viram "—". */
export function rangeLabel(from, to) {
  const day = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  };
  if (!day(from)) return '—';
  return day(to) ? `${day(from)} a ${day(to)}` : `desde ${day(from)}`;
}

// ---------- indicadores ----------

const EMPTY_METRICS = { investment: '0.00', leads: 0, cpl: null, opportunities: 0, sales: 0, revenue: '0.00', newClients: 0, cac: null, conversionRate: null, roas: null, roi: null };
export const metricsOf = (m) => ({ ...EMPTY_METRICS, ...(m && typeof m === 'object' ? m : {}) });

/**
 * Os 11 indicadores da visão geral e da campanha, cada um com a nota visível (a fórmula curta) e a explicação longa
 * (atributo `title`). Indicador sem base mostra "—" e diz por quê.
 */
export function metricTiles(m) {
  const x = metricsOf(m);
  return [
    { id: 'investment', label: 'Investimento', value: money(x.investment), note: 'lançado no período', help: FORMULAS[0].text },
    { id: 'leads', label: 'Leads', value: formatCount(x.leads), note: 'contatos novos', help: FORMULAS[1].text },
    { id: 'cpl', label: 'CPL', value: moneyOrDash(x.cpl), note: x.cpl === null ? 'sem leads no período' : 'investimento ÷ leads', help: FORMULAS[2].text },
    { id: 'opportunities', label: 'Oportunidades', value: formatCount(x.opportunities), note: 'abertas no período', help: FORMULAS[3].text },
    { id: 'sales', label: 'Vendas', value: formatCount(x.sales), note: 'ativas no período', help: FORMULAS[4].text },
    { id: 'revenue', label: 'Receita atribuída', value: money(x.revenue), note: 'valor final das vendas', help: FORMULAS[4].text, gold: true },
    { id: 'newClients', label: 'Clientes novos', value: formatCount(x.newClients), note: 'primeira compra no período', help: FORMULAS[5].text },
    { id: 'cac', label: 'CAC', value: moneyOrDash(x.cac), note: x.cac === null ? 'sem clientes novos' : 'investimento ÷ clientes novos', help: FORMULAS[6].text },
    { id: 'conversionRate', label: 'Conversão', value: formatPct(x.conversionRate), note: x.conversionRate === null ? 'sem leads no período' : 'clientes novos ÷ leads', help: FORMULAS[7].text },
    { id: 'roas', label: 'ROAS', value: formatRoas(x.roas), note: x.roas === null ? 'sem investimento' : 'receita ÷ investimento', help: FORMULAS[8].text },
    { id: 'roi', label: 'ROI', value: formatPct(x.roi), note: x.roi === null ? 'sem investimento' : '(receita − investimento) ÷ investimento', help: FORMULAS[9].text, bad: x.roi !== null && Number(x.roi) < 0 },
  ];
}

/** Cartão "Marketing" da mentora (GET /mentora/students/:id/marketing): só números. */
export function studentMarketingItems(d) {
  return [
    { label: 'Investimento', value: money(d?.investment ?? '0.00') },
    { label: 'Leads', value: formatCount(d?.leads ?? 0) },
    { label: 'CPL', value: moneyOrDash(d?.cpl ?? null) },
    { label: 'Clientes novos', value: formatCount(d?.newClients ?? 0) },
    { label: 'CAC', value: moneyOrDash(d?.cac ?? null) },
    { label: 'Receita atribuída', value: money(d?.revenue ?? '0.00') },
    { label: 'ROAS', value: formatRoas(d?.roas ?? null) },
    { label: 'ROI', value: formatPct(d?.roi ?? null) },
    { label: 'Campanhas ativas', value: formatCount(d?.activeCampaigns ?? 0) },
  ];
}

// ---------- gráficos simples (barras em %, aplicadas por data-w/data-h) ----------

/** Porcentagem de `value` em relação a `max` (0 a 100); valor positivo nunca some (mínimo 2%). */
export function barPct(value, max) {
  const v = Number(value) || 0;
  const m = Number(max) || 0;
  if (v <= 0 || m <= 0) return 0;
  return Math.max(2, Math.min(100, Math.round((v / m) * 100)));
}

/** Leads por origem: as origens com leads, da maior para a menor, com a largura relativa. */
export function sourceBars(bySource, labelOf = (k) => k) {
  const rows = (bySource ?? []).map((s) => ({ source: s.source, label: labelOf(s.source), leads: Number(s.leads ?? 0) })).filter((s) => s.leads > 0);
  rows.sort((a, b) => b.leads - a.leads || String(a.label).localeCompare(String(b.label), 'pt-BR'));
  const max = Math.max(0, ...rows.map((r) => r.leads));
  return rows.map((r) => ({ ...r, width: barPct(r.leads, max) }));
}

/** Investimento x receita por linha (campanhas): larguras na mesma escala (o maior valor entre os dois). */
export function moneyPairs(rows) {
  const list = (rows ?? []).map((r) => ({ ...r, inv: toCents(r.investment ?? '0'), rev: toCents(r.revenue ?? '0') })).filter((r) => r.inv > 0 || r.rev > 0);
  const max = Math.max(0, ...list.map((r) => Math.max(r.inv, r.rev)));
  return list.map((r) => ({ ...r, invWidth: barPct(r.inv, max), revWidth: barPct(r.rev, max) }));
}

/** Série mensal da campanha (6 meses): alturas de investimento e receita na mesma escala. */
export function seriesBars(series) {
  const list = (series ?? []).map((s) => ({ ...s, inv: toCents(s.investment ?? '0'), rev: toCents(s.revenue ?? '0'), leads: Number(s.leads ?? 0) }));
  const max = Math.max(0, ...list.map((s) => Math.max(s.inv, s.rev)));
  return list.map((s) => ({ ...s, label: monthLabel(s.month), invHeight: barPct(s.inv, max), revHeight: barPct(s.rev, max) }));
}

/** Seguidores e alcance por período (do mais antigo ao mais recente), cada um na sua escala. */
export function instagramBars(rows) {
  const list = [...(rows ?? [])].sort((a, b) => String(a.periodStart).localeCompare(String(b.periodStart)));
  const maxF = Math.max(0, ...list.map((r) => Number(r.followers ?? 0)));
  const maxR = Math.max(0, ...list.map((r) => Number(r.reach ?? 0)));
  return list.map((r) => ({ ...r, followersHeight: barPct(r.followers, maxF), reachHeight: barPct(r.reach, maxR) }));
}

// ---------- validações ----------

export function campaignNameError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Dê um nome à campanha.';
  if ([...text].length > 80) return 'Nome muito longo (máximo 80).';
  return null;
}

// Limites iguais aos do banco (db/migrations/0031_marketing.sql) e do servidor (server/src/routes/marketing.ts).
export const CAMPAIGN_NAME_MAX = 80;
export const OBJECTIVE_MAX = 300;
export const CAMPAIGN_NOTES_MAX = 1000;
export const SPEND_DESCRIPTION_MAX = 200;
export const INSTAGRAM_NOTES_MAX = 500;

const maxTextError = (max, message) => (value) => ([...String(value ?? '').trim()].length > max ? message : null);
export const objectiveError = maxTextError(OBJECTIVE_MAX, 'Objetivo muito longo (máximo 300).');
export const longTextError = maxTextError(CAMPAIGN_NOTES_MAX, 'Observações muito longas (máximo 1000).');
export const instagramNotesError = maxTextError(INSTAGRAM_NOTES_MAX, 'Observações muito longas (máximo 500).');

export function startsOnError(value) {
  return isIsoDate(value) ? null : 'Informe a data de início.';
}

/** Fim: opcional; nunca antes do início. */
export function endsOnError(value, all) {
  if (!String(value ?? '').trim()) return null;
  if (!isIsoDate(value)) return 'Data inválida.';
  if (isIsoDate(all?.startsOn) && value < all.startsOn) return 'O fim não pode ser antes do início.';
  return null;
}

export function spendAmountError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Informe o valor investido.';
  const parsed = parseMoney(text);
  if (!parsed.ok) return parsed.message;
  return toCents(parsed.value) > 0 ? null : 'O valor precisa ser maior que zero.';
}

export const spentOnError = (value) => (isIsoDate(value) ? null : 'Informe a data do investimento.');
export const descriptionError = (value) => ([...String(value ?? '').trim()].length > 200 ? 'Descrição muito longa (máximo 200).' : null);

const COUNT_MAX = 1_000_000_000;
const FOLLOWERS_MAX = 100_000_000;
const cleanCount = (value) => String(value ?? '').trim().replace(/\./g, '').replace('−', '-');

/** Campo numérico opcional do Instagram: vazio vale "não informado" (null); senão inteiro de 0 em diante. */
export function countFieldError(value) {
  const text = cleanCount(value);
  if (text === '') return null;
  if (!/^\d{1,10}$/.test(text)) return 'Use só números inteiros (sem vírgula).';
  return Number(text) > COUNT_MAX ? 'Número grande demais.' : null;
}

/** Seguidores: obrigatório (inteiro de 0 a 100 milhões). */
export function followersError(value) {
  const text = cleanCount(value);
  if (text === '') return 'Informe quantos seguidores o perfil tinha no fim do período.';
  if (!/^\d{1,9}$/.test(text)) return 'Use só números inteiros (sem vírgula).';
  return Number(text) > FOLLOWERS_MAX ? 'Número grande demais.' : null;
}

/** Novos seguidores: opcional e pode ser negativo (o perfil perdeu seguidores). */
export function newFollowersError(value) {
  const text = cleanCount(value);
  if (text === '') return null;
  if (!/^-?\d{1,9}$/.test(text)) return 'Use só números inteiros (pode ser negativo se perdeu seguidores).';
  return Math.abs(Number(text)) > FOLLOWERS_MAX ? 'Número grande demais.' : null;
}

/** Texto do campo -> número, ou null quando vazio ("não informado": nunca vira 0, que distorceria engajamento e crescimento). */
export const countValue = (value) => {
  const text = cleanCount(value);
  return /^-?\d+$/.test(text) ? Number(text) : null;
};

export const MAX_PERIOD_DAYS = 366;

export function periodEndError(value, all) {
  if (!isIsoDate(value)) return 'Informe o fim do período.';
  if (isIsoDate(all?.periodStart)) {
    if (value < all.periodStart) return 'O fim não pode ser antes do início.';
    const days = (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${all.periodStart}T00:00:00Z`)) / 86_400_000;
    if (days > MAX_PERIOD_DAYS) return 'O período pode ter no máximo 1 ano.';
  }
  return null;
}

export const INSTAGRAM_COUNTS = [
  { name: 'followers', label: 'Seguidores no fim do período', required: true },
  { name: 'newFollowers', label: 'Novos seguidores (opcional)' },
  { name: 'reach', label: 'Alcance (opcional)' },
  { name: 'impressions', label: 'Impressões (opcional)' },
  { name: 'interactions', label: 'Interações (opcional)' },
  { name: 'profileVisits', label: 'Visitas ao perfil (opcional)' },
  { name: 'linkClicks', label: 'Cliques no link (opcional)' },
  { name: 'leads', label: 'Leads vindos do Instagram (opcional)' },
];

/** Corpo de POST/PATCH /marketing/instagram: seguidores e período obrigatórios; os demais números em branco vão como null. */
export function instagramBody(values) {
  const body = { periodStart: values.periodStart, periodEnd: values.periodEnd };
  for (const { name } of INSTAGRAM_COUNTS) body[name] = countValue(values[name]);
  const notes = String(values.notes ?? '').trim();
  body.notes = notes || null;
  return body;
}

/** Corpo de POST/PATCH /campaigns. */
export function campaignBody(values) {
  const opt = (v) => {
    const t = String(v ?? '').trim();
    return t === '' ? null : t;
  };
  return { name: String(values.name ?? '').trim(), channel: values.channel, objective: opt(values.objective), startsOn: values.startsOn, endsOn: opt(values.endsOn), notes: opt(values.notes) };
}

/** Corpo de POST/PATCH /marketing/spend. */
export function spendBody(values) {
  const description = String(values.description ?? '').trim();
  return { spentOn: values.spentOn, amount: parseMoney(values.amount).value, channel: values.channel, campaignId: values.campaignId || null, description: description || null };
}
