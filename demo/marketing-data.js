// Marketing (Entrega 4): as fórmulas (CPL, CAC, conversão, ROAS, ROI, engajamento) e a atribuição num módulo puro (sem estado),
// espelho EXATO de server/src/domain/marketing.ts (mesmos nomes, assinaturas e resultados; teste de paridade em
// server/test/unit/marketing-domain.test.ts). Dinheiro em centavos por dentro, texto decimal por fora; datas são dias civis de
// Brasília; divisão por zero = null. Usado pela API falsa (mock-marketing.js) e pelo exemplo (seed-marketing.js).
import { addMonthsIso, fromCents, toCents } from './finance-data.js';

export const CHANNELS = ['instagram', 'meta_ads', 'google_ads', 'youtube', 'tiktok', 'email', 'whatsapp', 'event', 'organic', 'referral', 'other'];

export const CHANNEL_LABELS = {
  instagram: 'Instagram',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  event: 'Evento',
  organic: 'Orgânico',
  referral: 'Indicação',
  other: 'Outro',
};

export const CAMPAIGN_STATUSES = ['planned', 'active', 'ended', 'archived'];

/** Meses da série do detalhe da campanha (o corrente e os 5 anteriores). */
export const SERIES_MONTHS = 6;

// ---------------------------------------------------------------------------------------------------------------- fórmulas

/** R$ ÷ quantidade, arredondado ao centavo; null quando a quantidade é zero. CPL e CAC. */
export function costPer(amount, count) {
  if (count <= 0) return null;
  return fromCents(Math.round(toCents(amount) / count));
}

/** parte ÷ todo × 100, uma casa; null com todo zero (ou parte ausente). Conversão e engajamento. */
export function percent(part, whole) {
  if (part === null || part === undefined || whole === null || whole === undefined || whole <= 0) return null;
  return Math.round((part * 1000) / whole) / 10;
}

/** ROAS = receita ÷ investimento, duas casas; null sem investimento. */
export function roas(revenue, investment) {
  const inv = toCents(investment);
  if (inv <= 0) return null;
  return Math.round((toCents(revenue) * 100) / inv) / 100;
}

/** ROI = (receita − investimento) ÷ investimento × 100, uma casa; null sem investimento. */
export function roi(revenue, investment) {
  const inv = toCents(investment);
  if (inv <= 0) return null;
  return Math.round(((toCents(revenue) - inv) * 1000) / inv) / 10;
}

/** Engajamento do Instagram = interações ÷ alcance × 100 (uma casa); null sem alcance. */
export function engagementRate(interactions, reach) {
  return percent(interactions, reach);
}

/** Os indicadores a partir das bases `{ investment, leads, opportunities, sales, revenue, newClients }`. */
export function buildMetrics(base) {
  const investment = fromCents(toCents(base.investment));
  const revenue = fromCents(toCents(base.revenue));
  return {
    investment,
    leads: base.leads,
    cpl: costPer(investment, base.leads),
    opportunities: base.opportunities,
    sales: base.sales,
    revenue,
    newClients: base.newClients,
    cac: costPer(investment, base.newClients),
    conversionRate: percent(base.newClients, base.leads),
    roas: roas(revenue, investment),
    roi: roi(revenue, investment),
  };
}

// ---------------------------------------------------------------------------------------------------------------- campanhas

/** Situação derivada (`{ startsOn, endsOn, archived }`): arquivada; planejada (começa depois de hoje); encerrada; ativa. */
export function campaignStatus(c, today) {
  if (c.archived) return 'archived';
  if (today < c.startsOn) return 'planned';
  if (c.endsOn !== null && c.endsOn !== undefined && today > c.endsOn) return 'ended';
  return 'active';
}

/** Dois períodos [aStart, aEnd] e [bStart, bEnd] (inclusive) se cruzam? */
export function periodsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

// ---------------------------------------------------------------------------------------------------------------- atribuição
// MarketingData = { contacts: [{ id, createdOn, source, campaignId, entryFunnelId }], deals: [{ id, openedOn, campaignId, funnelId }],
//   sales: [{ id, personId, dealId, closedOn, finalValue, status, createdAt, dealCampaignId, personCampaignId, dealFunnelId }],
//   spend: [{ spentOn, amount, campaignId }] }; Period = { from, to } (inclusive).

/** Campanha a que a venda é atribuída (UMA só): a da oportunidade; sem oportunidade, a do contato. */
export function saleCampaignId(sale) {
  return sale.dealId !== null && sale.dealId !== undefined ? sale.dealCampaignId : sale.personCampaignId;
}

/** Primeira venda ATIVA de cada contato (por data da venda, depois criação, depois id). */
export function firstSales(sales) {
  const first = new Map();
  for (const s of sales) {
    if (s.status !== 'active') continue;
    const current = first.get(s.personId);
    const before =
      !current ||
      s.closedOn < current.closedOn ||
      (s.closedOn === current.closedOn && (s.createdAt < current.createdAt || (s.createdAt === current.createdAt && s.id < current.id)));
    if (before) first.set(s.personId, s);
  }
  return [...first.values()];
}

const within = (date, p) => date >= p.from && date <= p.to;

/**
 * Indicadores de um escopo no período: `undefined` = tudo (visão geral, inclui o que não tem campanha); um id = só aquela
 * campanha; `null` = só o que não tem campanha.
 */
export function metricsFor(data, period, campaignId) {
  const match = (id) => campaignId === undefined || id === campaignId;
  const sales = data.sales.filter((s) => s.status === 'active' && within(s.closedOn, period) && match(saleCampaignId(s)));
  return buildMetrics({
    investment: fromCents(data.spend.filter((s) => within(s.spentOn, period) && match(s.campaignId)).reduce((t, s) => t + toCents(s.amount), 0)),
    leads: data.contacts.filter((c) => within(c.createdOn, period) && match(c.campaignId)).length,
    opportunities: data.deals.filter((d) => within(d.openedOn, period) && match(d.campaignId)).length,
    sales: sales.length,
    revenue: fromCents(sales.reduce((t, s) => t + toCents(s.finalValue), 0)),
    newClients: firstSales(data.sales).filter((s) => within(s.closedOn, period) && match(saleCampaignId(s))).length,
  });
}

/**
 * Indicadores de várias campanhas numa passada só (primeiras vendas calculadas uma vez): objeto com cada id pedido, na ordem
 * dada; igual a `metricsFor(data, period, id)` para cada um. Id sem números = zerado (divisões por zero = null); [] = {}.
 */
export function metricsByCampaign(data, period, campaignIds) {
  const wanted = new Set(campaignIds);
  const acc = new Map();
  const empty = () => ({ investment: 0, leads: 0, opportunities: 0, sales: 0, revenue: 0, newClients: 0 });
  const bucket = (id) => {
    if (id === null || id === undefined || !wanted.has(id)) return null;
    let b = acc.get(id);
    if (!b) acc.set(id, (b = empty()));
    return b;
  };
  for (const s of data.spend) {
    const b = within(s.spentOn, period) ? bucket(s.campaignId) : null;
    if (b) b.investment += toCents(s.amount);
  }
  for (const c of data.contacts) {
    const b = within(c.createdOn, period) ? bucket(c.campaignId) : null;
    if (b) b.leads += 1;
  }
  for (const d of data.deals) {
    const b = within(d.openedOn, period) ? bucket(d.campaignId) : null;
    if (b) b.opportunities += 1;
  }
  for (const s of data.sales) {
    if (s.status !== 'active' || !within(s.closedOn, period)) continue;
    const b = bucket(saleCampaignId(s));
    if (b) {
      b.sales += 1;
      b.revenue += toCents(s.finalValue);
    }
  }
  for (const s of firstSales(data.sales)) {
    const b = within(s.closedOn, period) ? bucket(saleCampaignId(s)) : null;
    if (b) b.newClients += 1;
  }
  const out = {};
  for (const id of campaignIds) {
    const b = acc.get(id) ?? empty();
    out[id] = buildMetrics({ ...b, investment: fromCents(b.investment), revenue: fromCents(b.revenue) });
  }
  return out;
}

const hasNumbers = (m) => toCents(m.investment) > 0 || m.leads > 0 || m.opportunities > 0 || m.sales > 0 || m.newClients > 0;

/**
 * Visão geral do marketing no período (`campaigns`: [{ id, name, channel, archived }], `funnels`: [{ id, name, active }]).
 * `byCampaign`: as não arquivadas e as arquivadas com números (por receita, depois investimento, depois nome). `byFunnel`: na
 * ordem dada, só ativos ou com números. `bySource`: origens com leads, da maior para a menor.
 */
export function marketingReport(data, period, campaigns, funnels) {
  const metrics = metricsFor(data, period);
  const none = metricsFor(data, period, null);
  const sources = new Map();
  for (const c of data.contacts) if (within(c.createdOn, period)) sources.set(c.source, (sources.get(c.source) ?? 0) + 1);
  const perCampaign = metricsByCampaign(data, period, campaigns.map((c) => c.id));
  const byCampaign = campaigns
    .map((c) => ({ campaignId: c.id, name: c.name, channel: c.channel, archived: c.archived, metrics: perCampaign[c.id] }))
    .filter((c) => !c.archived || hasNumbers(c.metrics))
    .sort(
      (a, b) =>
        toCents(b.metrics.revenue) - toCents(a.metrics.revenue) ||
        toCents(b.metrics.investment) - toCents(a.metrics.investment) ||
        a.name.localeCompare(b.name, 'pt-BR') ||
        (a.campaignId < b.campaignId ? -1 : 1),
    )
    .map(({ campaignId, name, channel, metrics: m }) => ({ campaignId, name, channel, metrics: m }));
  const byFunnel = funnels
    .map((f) => {
      const sales = data.sales.filter((s) => s.status === 'active' && within(s.closedOn, period) && s.dealFunnelId === f.id);
      return {
        funnelId: f.id,
        name: f.name,
        active: f.active,
        leads: data.contacts.filter((c) => c.entryFunnelId === f.id && within(c.createdOn, period)).length,
        opportunities: data.deals.filter((d) => d.funnelId === f.id && within(d.openedOn, period)).length,
        sales: sales.length,
        revenue: fromCents(sales.reduce((t, s) => t + toCents(s.finalValue), 0)),
      };
    })
    .filter((f) => f.active || f.leads + f.opportunities + f.sales > 0)
    .map(({ funnelId, name, leads, opportunities, sales, revenue }) => ({ funnelId, name, leads, opportunities, sales, revenue }));
  return {
    metrics,
    bySource: [...sources.entries()].map(([source, leads]) => ({ source, leads })).sort((a, b) => b.leads - a.leads || (a.source < b.source ? -1 : 1)),
    byCampaign,
    withoutCampaign: { leads: none.leads, sales: none.sales, revenue: none.revenue },
    byFunnel,
  };
}

/** Os `count` meses (AAAA-MM) que terminam no mês de `today`, do mais antigo ao corrente. */
export function lastMonths(today, count = SERIES_MONTHS) {
  const first = `${today.slice(0, 7)}-01`;
  return Array.from({ length: count }, (_, i) => addMonthsIso(first, i - count + 1).slice(0, 7));
}

/** Último dia (AAAA-MM-DD) de um mês AAAA-MM. */
export function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Série mensal de uma campanha (investimento, leads e receita atribuída), dos últimos `SERIES_MONTHS` meses. */
export function campaignSeries(data, campaignId, today) {
  return lastMonths(today).map((month) => {
    const m = metricsFor(data, { from: `${month}-01`, to: monthEnd(month) }, campaignId);
    return { month, investment: m.investment, leads: m.leads, revenue: m.revenue };
  });
}

// ---------------------------------------------------------------------------------------------------------------- Instagram

/** Último lançamento x o anterior (`{ followers, reach, interactions }`). Sem anterior: tudo null; base zero ou ausente: aquele número null. */
export function instagramGrowth(latest, previous) {
  if (!latest || !previous) return null;
  const followersDelta = latest.followers - previous.followers;
  const reachPct = latest.reach === null || previous.reach === null ? null : percent(latest.reach - previous.reach, previous.reach);
  const a = engagementRate(latest.interactions, latest.reach);
  const b = engagementRate(previous.interactions, previous.reach);
  return {
    followersDelta,
    followersPct: percent(followersDelta, previous.followers),
    reachPct,
    engagementDelta: a === null || b === null ? null : Math.round((a - b) * 10) / 10,
  };
}
