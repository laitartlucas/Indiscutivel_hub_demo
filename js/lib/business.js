// Regras puras do "Meu negócio" (Painel da aluna), dos Relatórios reformulados (aluna e mentora) e do bloco "Negócio das
// alunas" da mentora (Entrega 7), testadas em web/test/reports-entrega7.test.js. Nenhuma fórmula nova: todos os números vêm
// prontos do servidor (GET /commercial/overview, /finance/overview, /finance/series, /marketing/overview, /mentora/overview,
// /mentora/business, /mentora/reports/journey). Aqui só se escolhe o que mostrar, formata e desenha (larguras e alturas).
// Regra de ouro: cada grupo tem UMA natureza (comercial, financeiro, marketing, faturamento autodeclarado) e nada é somado
// entre grupos.

import { PERIODS as COMMERCIAL_PERIODS, formatRate, isPeriod as isCommercialPeriod } from './commercial.js';
import { money, toCents } from './finance.js';
import { barPct, formatCount, formatRoas, moneyOrDash, metricsOf } from './marketing.js';
import { addMonthsTo, currentMonth, isMonth, monthShort, monthTitle } from './revenue.js';
import { PHASES, phaseLabel } from './journey.js';

const countFormat = new Intl.NumberFormat('pt-BR');
const plural = (n, one, many) => `${countFormat.format(n)} ${n === 1 ? one : many}`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ---------------------------------------------------------------- período (mês, trimestre, ano e mês específico)

/** Os três períodos das telas novas: os mesmos da Central Comercial, do Financeiro e do Marketing. */
export const BUSINESS_PERIODS = COMMERCIAL_PERIODS;
export const isBusinessPeriod = isCommercialPeriod;

/**
 * Filtro dos relatórios: `{ period, month }`. Com `month` ('AAAA-MM') vale o mês específico (o período fica 'month');
 * sem ele, o período corrente. Valores inválidos caem no padrão (este mês).
 */
export function normalizeFilter({ period, month } = {}, now = new Date()) {
  if (isMonth(month) && month <= currentMonth(now)) return { period: 'month', month };
  return { period: isBusinessPeriod(period) ? period : 'month', month: '' };
}

/** Parâmetros de consulta do filtro: `{ period }` ou `{ period: 'month', month }`. */
export function filterQuery(filter) {
  return filter?.month ? { period: 'month', month: filter.month } : { period: filter?.period ?? 'month' };
}

/** Opções do seletor "Mês específico": os últimos `count` meses, do mais recente ao mais antigo, com "Mês corrente" em branco. */
export function monthOptions(count = 12, now = new Date()) {
  const current = currentMonth(now);
  const list = Array.from({ length: Math.max(1, count) }, (_, i) => {
    const value = addMonthsTo(current, -i);
    return { value, label: monthTitle(value) };
  });
  return [{ value: '', label: 'Usar o período ao lado' }, ...list];
}

/** Texto do filtro para anúncios e legendas: "Este mês", "Este trimestre", "Novembro de 2026". */
export function filterLabel(filter) {
  if (filter?.month) return monthTitle(filter.month);
  return BUSINESS_PERIODS.find((p) => p.value === filter?.period)?.label ?? BUSINESS_PERIODS[0].label;
}

/** Primeiro e último dia de um mês 'AAAA-MM' (para filtrar a lista de vendas pela data da venda). */
export function monthBounds(month) {
  if (!isMonth(month)) return null;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

// ---------------------------------------------------------------- grupos do "Meu negócio" (uma natureza por grupo)

/** Comercial (GET /commercial/overview ou o bloco `commercial` de /mentora/business): leads, abertas, conversão, ganhas. */
export function commercialItems(o) {
  const open = o?.open ?? { count: 0, total: '0.00' };
  const won = o?.won ?? { count: 0, total: '0.00' };
  return [
    { id: 'leads', label: 'Leads', value: formatCount(o?.newContacts ?? 0), note: 'contatos novos no período' },
    { id: 'open', label: 'Oportunidades abertas', value: formatCount(open.count ?? 0), note: `${money(open.total ?? '0.00')} em negociação` },
    { id: 'conversion', label: 'Conversão', value: formatRate(o?.conversionRate), note: o?.conversionRate === null || o?.conversionRate === undefined ? 'nada ganho nem perdido ainda' : 'ganhas ÷ (ganhas + perdidas)' },
    { id: 'won', label: 'Vendas fechadas', value: money(won.total ?? '0.00'), note: plural(num(won.count), 'oportunidade ganha', 'oportunidades ganhas'), gold: true },
  ];
}

/** Contratos em aberto = vendas ativas ainda não quitadas (`openContracts` do servidor); ausente = null ("—"). */
export function openContracts(o) {
  return Number.isInteger(o?.openContracts) ? o.openContracts : null;
}

/** Financeiro (GET /finance/overview ou o bloco `finance` de /mentora/business). */
export function financeItems(o) {
  const overdueBad = toCents(o?.overdue ?? '0') > 0;
  return [
    { id: 'contracted', label: 'Contratado', value: money(o?.contracted ?? '0.00'), note: `${plural(num(o?.salesCount), 'venda', 'vendas')} no período` },
    { id: 'received', label: 'Recebido', value: money(o?.received ?? '0.00'), note: 'pagamentos no período', gold: true },
    { id: 'receivable', label: 'A receber', value: money(o?.receivable ?? '0.00'), note: 'em aberto hoje' },
    { id: 'overdue', label: 'Vencido', value: money(o?.overdue ?? '0.00'), note: num(o?.overdueCount) ? plural(num(o.overdueCount), 'parcela vencida', 'parcelas vencidas') : 'nada vencido', bad: overdueBad },
    // Só quando o servidor manda o número (a visão da aluna); o bloco da mentora não traz, e um card vazio confunde.
    ...(openContracts(o) === null ? [] : [{ id: 'openContracts', label: 'Contratos em aberto', value: formatCount(openContracts(o)), note: 'vendas ativas não quitadas' }]),
  ];
}

/**
 * Marketing: aceita a visão geral da aluna (`{ metrics, activeCampaigns? }`) ou o bloco plano da mentora
 * (`{ investment, leads, cpl, cac, roas, activeCampaigns }`). `activeCampaigns` ausente vira "—".
 */
export function marketingItems(o, activeCampaigns = o?.activeCampaigns) {
  const m = metricsOf(o?.metrics ?? o);
  const active = Number.isInteger(activeCampaigns) ? formatCount(activeCampaigns) : '—';
  return [
    { id: 'investment', label: 'Investimento', value: money(m.investment ?? '0.00'), note: 'lançado no período' },
    { id: 'leads', label: 'Leads', value: formatCount(m.leads), note: 'contatos novos' },
    { id: 'cpl', label: 'CPL', value: moneyOrDash(m.cpl), note: m.cpl === null ? 'sem leads no período' : 'investimento ÷ leads' },
    { id: 'cac', label: 'CAC', value: moneyOrDash(m.cac), note: m.cac === null ? 'sem clientes novos' : 'investimento ÷ clientes novos' },
    { id: 'roas', label: 'ROAS', value: formatRoas(m.roas), note: m.roas === null ? 'sem investimento' : 'receita ÷ investimento', gold: m.roas !== null && Number(m.roas) >= 1 },
    { id: 'activeCampaigns', label: 'Campanhas ativas', value: active, note: 'hoje' },
  ];
}

/** As `n` maiores linhas por `valueOf` (só as com valor > 0), da maior para a menor; empate pelo nome. */
export function topRows(rows, valueOf, n = 3, nameOf = (r) => r?.name ?? '') {
  return [...(rows ?? [])]
    .map((r) => ({ row: r, value: num(valueOf(r)) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value || String(nameOf(a.row)).localeCompare(String(nameOf(b.row)), 'pt-BR'))
    .slice(0, n)
    .map((x) => x.row);
}

/** Top 3 origens de leads (marketing `bySource`) e top 3 funis por receita (marketing `byFunnel`). */
export const topSources = (bySource, n = 3) => topRows(bySource, (s) => s.leads, n, (s) => s.source);
export const topFunnelsByRevenue = (byFunnel, n = 3) => topRows(byFunnel, (f) => toCents(f.revenue ?? '0'), n);

/** Grupo sem nenhum número no período: o Painel mostra o primeiro passo em vez de zeros. */
export function commercialIsEmpty(c) {
  return num(c?.newContacts) === 0 && num(c?.open?.count) === 0 && num(c?.won?.count) === 0 && num(c?.lost?.count) === 0;
}

export function financeIsEmpty(f) {
  return num(f?.salesCount) === 0 && toCents(f?.received ?? '0') === 0 && toCents(f?.receivable ?? '0') === 0 && toCents(f?.overdue ?? '0') === 0;
}

export function marketingIsEmpty(o, activeCampaigns = o?.activeCampaigns) {
  const m = metricsOf(o?.metrics ?? o);
  return toCents(m.investment ?? '0') === 0 && num(m.leads) === 0 && toCents(m.revenue ?? '0') === 0 && num(m.sales) === 0 && !(num(activeCampaigns) > 0);
}

/** Sem nada em nenhum dos três grupos. */
export function isBusinessEmpty({ commercial, finance, marketing } = {}) {
  return commercialIsEmpty(commercial) && financeIsEmpty(finance) && marketingIsEmpty(marketing);
}

// ---------------------------------------------------------------- gráficos (alturas/larguras em %, aplicadas por data-h/data-w)

/**
 * Série mensal do financeiro (GET /finance/series): contratado e recebido lado a lado, na MESMA escala (as duas são R$
 * do financeiro; nunca somadas). Mês mais antigo primeiro; o último é o corrente.
 */
export function seriesColumns(rows) {
  const list = [...(rows ?? [])].filter((r) => isMonth(r?.month)).sort((a, b) => a.month.localeCompare(b.month));
  const max = Math.max(0, ...list.map((r) => Math.max(toCents(r.contracted ?? '0'), toCents(r.received ?? '0'))));
  return list.map((r, i) => ({
    month: r.month,
    label: monthShort(r.month),
    contracted: r.contracted ?? '0.00',
    received: r.received ?? '0.00',
    salesCount: num(r.salesCount),
    contractedHeight: barPct(toCents(r.contracted ?? '0'), max),
    receivedHeight: barPct(toCents(r.received ?? '0'), max),
    current: i === list.length - 1,
  }));
}

export const seriesIsEmpty = (rows) => (rows ?? []).every((r) => toCents(r.contracted ?? '0') === 0 && toCents(r.received ?? '0') === 0);

/** Distribuição por fase (sempre as 4 fases, na ordem), com a largura relativa à maior. */
export function phaseBars(phases) {
  const byPhase = new Map((phases ?? []).map((p) => [Number(p.phase), p]));
  const rows = PHASES.map((p) => ({ phase: p.phase, label: byPhase.get(p.phase)?.label || phaseLabel(p.phase), count: num(byPhase.get(p.phase)?.count) }));
  const max = Math.max(0, ...rows.map((r) => r.count));
  return rows.map((r) => ({ ...r, width: barPct(r.count, max) }));
}

/** Barras horizontais genéricas: `[{ label, value }]` -> com `width` relativa ao maior valor. */
export function valueBars(rows) {
  const list = (rows ?? []).map((r) => ({ ...r, value: num(r.value) }));
  const max = Math.max(0, ...list.map((r) => r.value));
  return list.map((r) => ({ ...r, width: barPct(r.value, max) }));
}

/** Série de 6 meses do faturamento declarado (só totais do mês): alturas na escala do maior mês. */
export function monthTotalsColumns(rows) {
  const list = [...(rows ?? [])].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const max = Math.max(0, ...list.map((r) => (r.total === null || r.total === undefined ? 0 : toCents(r.total))));
  return list.map((r, i) => ({ ...r, label: monthShort(r.month), height: r.total === null || r.total === undefined ? 0 : barPct(toCents(r.total), max), current: i === list.length - 1 }));
}

/** Os últimos `n` meses ('AAAA-MM'), do mais antigo ao corrente. */
export function lastMonths(n = 6, now = new Date()) {
  const current = currentMonth(now);
  return Array.from({ length: n }, (_, i) => addMonthsTo(current, i - (n - 1)));
}

// ---------------------------------------------------------------- mentora

/** "Conquista" ou "Marco de faturamento" (a lista de conquistas recentes mistura os dois tipos, sem somar nada). */
export const achievementKindLabel = (kind) => (kind === 'milestone' ? 'Marco de faturamento' : 'Conquista');

/** Data curta 'dd/mm/aaaa' de um ISO (data ou data-hora). */
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** Linha de mudança de fase: "Fase 01 → Fase 02". */
export function phaseChangeText(change) {
  const from = Number(change?.from ?? change?.fromPhase);
  const to = Number(change?.to ?? change?.toPhase);
  const name = (p) => (Number.isInteger(p) && p >= 1 && p <= 4 ? `${String(p).padStart(2, '0')} · ${phaseLabel(p)}` : '—');
  return `${name(from)} → ${name(to)}`;
}
