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
 * Um fetcher por peça (total de Produtos, total de Pessoas, recentes de Produtos, recentes de Pessoas,
 * resumo de Oportunidades). `loadDashboard` os usa para a carga inicial em paralelo; a tela (`home.js`)
 * reusa o mesmo fetcher sozinho para tentar de novo só a peça que falhou, sem tocar nas outras.
 */
export function loadProductsTotal(api) {
  return api.get(`/api/v1/products${totalsQuery()}`);
}

export function loadPeopleTotal(api) {
  return api.get(`/api/v1/people${totalsQuery()}`);
}

export function loadProductsRecent(api) {
  return api.get(`/api/v1/products${recentQuery()}`);
}

export function loadPeopleRecent(api) {
  return api.get(`/api/v1/people${recentQuery()}`);
}

export function loadDealsSummary(api) {
  return api.get('/api/v1/deals/summary');
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
 * (cada uma é embrulhada por `pack`). Retorna sempre os 5 campos, cada um `{status:'ok', value}` ou
 * `{status:'error', error}`.
 */
export async function loadDashboard(api) {
  const [productsTotal, peopleTotal, productsRecent, peopleRecent, dealsSummary] = await Promise.all([
    pack(loadProductsTotal(api)),
    pack(loadPeopleTotal(api)),
    pack(loadProductsRecent(api)),
    pack(loadPeopleRecent(api)),
    pack(loadDealsSummary(api)),
  ]);
  return { productsTotal, peopleTotal, productsRecent, peopleRecent, dealsSummary };
}

// ---------- cálculos sobre o resumo de Oportunidades (GET /api/v1/deals/summary) ----------

const TZ = 'America/Sao_Paulo';
const OPEN_STAGES = ['arrived', 'talking', 'proposal'];
const FUNNEL_STAGES = ['arrived', 'talking', 'proposal', 'won'];
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

/** Oportunidades em aberto (chegaram + em conversa + proposta): quantidade, valor somado e quantas já passaram de "chegaram". */
export function openTotals(summary) {
  const stages = OPEN_STAGES.map((stage) => summary.stages[stage]);
  return {
    count: stages.reduce((n, s) => n + s.count, 0),
    total: fromCents(stages.reduce((n, s) => n + toCents(s.total), 0)),
    talking: summary.stages.talking.count + summary.stages.proposal.count,
  };
}

/** Linhas do funil (chegaram → ganhas), com a largura da barra relativa à maior contagem (mínimo 8% se houver algo). */
export function funnelRows(summary) {
  const max = Math.max(...FUNNEL_STAGES.map((stage) => summary.stages[stage].count));
  return FUNNEL_STAGES.map((stage) => {
    const { count, total } = summary.stages[stage];
    const width = count === 0 || max === 0 ? 0 : Math.max(8, Math.round((count / max) * 100));
    return { stage, count, total, width };
  });
}

/** Ganhas ÷ (ganhas + perdidas), como "12,5%"; null enquanto nada foi fechado. */
export function conversionRate(summary) {
  const won = summary.stages.won.count;
  const closed = won + summary.stages.lost.count;
  return closed === 0 ? null : `${percentFormat.format((won / closed) * 100)}%`;
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
