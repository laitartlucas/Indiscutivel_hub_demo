// Lógica pura (sem DOM): busca os dados do Painel e calcula o que a tela mostra. Fácil de testar com um `api` fake.
import { formatMoney } from '../../shared/money.js';

/**
 * Um pedido de página só para ler o total (limit=1, sem trazer linhas demais).
 * Sem `archived`: o schema de Pessoas não aceita esse parâmetro (é `.strict()` e não tem esse campo —
 * ver `server/src/routes/people.ts`), e em Produtos omitir já equivale a `archived=false` (é o default
 * do schema em `server/src/routes/products.ts`), que é o que "Produtos ativos" precisa mostrar.
 */
export function totalsQuery() {
  return '?limit=1';
}

/** Os 5 mais recentes, mais novos primeiro. */
export function recentQuery() {
  return '?limit=5&offset=0&sort=created_at&order=desc';
}

/**
 * Um fetcher por peça (total de Produtos, contagem de Contatos, recentes de Produtos, recentes de Contatos,
 * resumo das oportunidades e visão por funil). `loadDashboard` os usa para a carga inicial em paralelo; a tela
 * (`home.js`) reusa o mesmo fetcher sozinho para tentar de novo só a peça que falhou, sem tocar nas outras.
 */
export function loadProductsTotal(api) {
  return api.get(`/api/v1/products${totalsQuery()}`);
}

/** Contagem de contatos por situação (GET /people/counts): { total, lead, negotiating, client, lost }. */
export function loadPeopleTotal(api) {
  return api.get('/api/v1/people/counts');
}

export function loadProductsRecent(api) {
  return api.get(`/api/v1/products${recentQuery()}`);
}

export function loadPeopleRecent(api) {
  return api.get(`/api/v1/people${recentQuery()}`);
}

/** Resumo de todos os funis (sem `funnelId`): em negociação, ganho, perdido, conversão e as que esperam contato. */
export function loadDealsSummary(api) {
  return api.get('/api/v1/deals/summary');
}

/** Visão do mês por funil (GET /commercial/overview?period=month), para o cartão "Funis em andamento". */
export function loadCommercialOverview(api) {
  return api.get('/api/v1/commercial/overview?period=month');
}

/** Embrulha uma promessa em `{status:'ok', value}` ou `{status:'error', error}` (nunca rejeita). */
export function pack(promise) {
  return Promise.resolve(promise).then(
    (value) => ({ status: 'ok', value }),
    (error) => ({ status: 'error', error }),
  );
}

/**
 * Busca tudo em paralelo. Cada chamada falha de forma independente: uma rejeição não derruba as outras
 * (cada uma é embrulhada por `pack`). Cada campo vem `{status:'ok', value}` ou `{status:'error', error}`.
 */
export async function loadDashboard(api) {
  const [productsTotal, peopleTotal, productsRecent, peopleRecent, dealsSummary, overview] = await Promise.all([
    pack(loadProductsTotal(api)),
    pack(loadPeopleTotal(api)),
    pack(loadProductsRecent(api)),
    pack(loadPeopleRecent(api)),
    pack(loadDealsSummary(api)),
    pack(loadCommercialOverview(api)),
  ]);
  return { productsTotal, peopleTotal, productsRecent, peopleRecent, dealsSummary, overview };
}

/** Total de uma lista, venha no formato `{ total }` (Central Comercial) ou `{ page: { total } }` (demais listas). */
export function listTotal(value) {
  if (Number.isInteger(value?.total)) return value.total;
  if (Number.isInteger(value?.page?.total)) return value.page.total;
  return 0;
}

/** Linhas de uma lista, venham em `rows` (Central Comercial) ou `data` (demais listas). */
export function listRows(value) {
  if (Array.isArray(value?.rows)) return value.rows;
  return Array.isArray(value?.data) ? value.data : [];
}

// ---------- cálculos sobre o resumo de Oportunidades (GET /api/v1/deals/summary) ----------

const TZ = 'America/Sao_Paulo';
const DAY_MS = 86_400_000;

const hourFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const percentFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Como formatMoney, mas sem os centavos quando são ,00 ("R$ 15.000") e com espaço que não quebra linha depois do R$: números redondos ficam legíveis nos cartões. */
export function formatMoneyCompact(value) {
  const text = formatMoney(value).replace('R$ ', 'R$\u00a0');
  return text.endsWith(',00') ? text.slice(0, -3) : text;
}

function toCents(value) {
  const [int, frac = '0'] = String(value).split('.');
  return Number(int) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
}

function fromCents(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** "Bom dia" até 11h59, "Boa tarde" até 17h59, "Boa noite" depois (horário de Brasília). */
export function greeting(date = new Date()) {
  const hour = Number(hourFormat.format(date));
  if (hour < 12) return 'Bom dia';
  return hour < 18 ? 'Boa tarde' : 'Boa noite';
}

/** "segunda-feira · 28 de setembro" (o CSS põe em caixa alta). */
export function eyebrowDate(date = new Date()) {
  const parts = Object.fromEntries(dateFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.weekday} · ${parts.day} de ${parts.month}`;
}

/** Oportunidades em negociação (todas as etapas abertas de todos os funis): quantidade, valor e valor ponderado. */
export function openTotals(summary) {
  const open = summary?.open ?? {};
  return { count: Number(open.count ?? 0), total: open.total ?? '0.00', weighted: open.weighted ?? '0.00' };
}

/** Ticket médio das ganhas (valor ganho ÷ quantidade); null sem nenhuma ganha. */
export function wonAverage(summary) {
  const count = Number(summary?.won?.count ?? 0);
  if (count === 0) return null;
  return fromCents(Math.round(toCents(summary.won.total ?? '0.00') / count));
}

/**
 * Cartão "Funis em andamento" do Painel (a partir de GET /commercial/overview): os funis com oportunidades em
 * negociação ou ganhas no mês, os de mais negociações primeiro (no máximo `limit`), com a barra relativa ao maior
 * (mínimo 8% quando há algo).
 */
export function funnelRows(byFunnel, limit = 5) {
  const rows = (byFunnel ?? [])
    .map((f) => ({ funnelId: f.funnelId, key: f.key, name: f.name, open: Number(f.open ?? 0), won: Number(f.won ?? 0), wonTotal: f.wonTotal ?? '0.00' }))
    .filter((f) => f.open + f.won > 0)
    .sort((a, b) => b.open - a.open || b.won - a.won)
    .slice(0, limit);
  const max = Math.max(0, ...rows.map((r) => r.open));
  return rows.map((r) => ({ ...r, width: r.open === 0 || max === 0 ? 0 : Math.max(8, Math.round((r.open / max) * 100)) }));
}

/** Ganhas ÷ (ganhas + perdidas), como "12,5%"; null enquanto nada foi fechado. O servidor manda a porcentagem. */
export function conversionRate(summary) {
  const rate = summary?.conversionRate;
  if (rate === null || rate === undefined || !Number.isFinite(Number(rate))) return null;
  return `${percentFormat.format(Number(rate))}%`;
}

/** Dias inteiros entre duas datas, pelo calendário de Brasília (hoje = 0; datas futuras também dão 0). */
export function daysSince(iso, now = new Date()) {
  return Math.max(0, Math.round((Date.parse(dayKey.format(now)) - Date.parse(dayKey.format(new Date(iso)))) / DAY_MS));
}

/** "atualizada hoje" / "sem atualização há 1 dia" / "sem atualização há 4 dias". */
export function idleLabel(iso, now = new Date()) {
  const days = daysSince(iso, now);
  if (days === 0) return 'atualizada hoje';
  return `sem atualização há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}
