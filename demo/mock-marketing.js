// Marketing da demonstração (Entrega 4): campanhas (arquivar, não apagar; situação derivada), investimentos, métricas do
// Instagram lançadas à mão (sem sobreposição de período), visão geral com CPL/CAC/ROAS/ROI, a campanha de contatos e
// oportunidades (com herança) e os números de marketing por aluna para a mentora. Mesmo contrato do servidor
// (docs/superpowers/specs/2026-11-06-entrega-4-marketing.md), sobre o estado em memória. Fórmulas só em marketing-data.js.
import { fromCents, periodRange, toCents, todayInBrasilia } from './finance-data.js';
import {
  campaignSeries, campaignStatus, CAMPAIGN_STATUSES, CHANNELS, engagementRate, instagramGrowth, marketingReport, metricsByCampaign, metricsFor, periodsOverlap,
} from './marketing-data.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const PERIODS = ['month', 'quarter', 'year'];
const MAX_CAMPAIGNS = 200;
const CAMPAIGN_CONFLICT = 'Esta campanha foi alterada em outra aba ou outro dispositivo. Recarregue e tente de novo.';
const SPEND_CONFLICT = 'Este investimento foi alterado em outra aba ou outro dispositivo. Recarregue e tente de novo.';
const INSTAGRAM_CONFLICT = 'Este lançamento foi alterado em outra aba ou outro dispositivo. Recarregue e tente de novo.';
const IG_COUNTS = ['newFollowers', 'reach', 'impressions', 'interactions', 'profileVisits', 'linkClicks', 'leads'];

export function createMarketingDemo(d) {
  const { Errors, createIssues, requireBody, readVersion, readQuery, fold, UUID, CONTROL_CHARS, MULTILINE_CONTROL_CHARS } = d;
  const db = () => d.getDb();
  const table = (name) => (db()[name] ??= []);
  const mine = (list, u) => list.filter((row) => row.ownerId === u.id);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const today = () => todayInBrasilia(d.clock());
  /** Dia de Brasília de um instante ISO. */
  const dayOf = (iso) => todayInBrasilia(new Date(iso));
  const fieldError = (field, message) => Errors.validation([{ field, message }]);

  // ---------------------------------------------------------------- leitura dos campos

  function onlyKeys(obj, allowed, issues) {
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) issues.add('', `Campo não permitido: ${key}.`);
  }
  const isCalendarDate = (s) =>
    typeof s === 'string' && DATE.test(s) && Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2100 && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  function readDate(value, field, issues) {
    if (!isCalendarDate(value)) return void issues.add(field, 'Informe uma data válida.');
    return value;
  }
  function readLine(value, field, max, issues, required) {
    if (typeof value !== 'string' || value.trim() === '') return void issues.add(field, required);
    const s = value.trim();
    if (s.length > max) return void issues.add(field, `Texto muito longo (máximo ${max}).`);
    if (CONTROL_CHARS.test(s)) return void issues.add(field, 'O texto contém caracteres inválidos.');
    return s;
  }
  /** Texto opcional (null limpa; vazio = null). */
  function readOptional(value, field, max, issues, multiline) {
    if (value === null) return null;
    if (typeof value !== 'string') return void issues.add(field, 'Dados inválidos.');
    const s = value.trim();
    if (s.length > max) return void issues.add(field, `Texto muito longo (máximo ${max}).`);
    if ((multiline ? MULTILINE_CONTROL_CHARS : CONTROL_CHARS).test(s)) return void issues.add(field, 'O texto contém caracteres inválidos.');
    return s === '' ? null : s;
  }
  function readChannel(value, issues) {
    if (!CHANNELS.includes(value)) return void issues.add('channel', 'Canal inválido.');
    return value;
  }
  function readAmount(value, issues) {
    if (typeof value !== 'string' || !MONEY.test(value)) return void issues.add('amount', 'Informe um valor válido, como 1500 ou 1500.50.');
    if (toCents(value) <= 0) return void issues.add('amount', 'Informe um valor maior que zero.');
    return fromCents(toCents(value));
  }
  function readInt(value, field, min, max, issues, nullable) {
    if (value === null && nullable) return null;
    if (!Number.isInteger(value) || value < min || value > max) return void issues.add(field, `Informe um número inteiro entre ${min} e ${max}.`);
    return value;
  }

  // ---------------------------------------------------------------- campanhas

  const campaignsOf = (u) => mine(table('campaigns'), u);
  const findOwnCampaign = (u, id) => (typeof id === 'string' && UUID.test(id) ? campaignsOf(u).find((c) => c.id === id) : undefined);

  function findCampaign(u, id) {
    const row = findOwnCampaign(u, id);
    if (!row) throw Errors.notFound('Campanha não encontrada.');
    return row;
  }

  function campaignDto(c, at = today()) {
    const archived = c.archivedAt != null;
    return {
      id: c.id, name: c.name, channel: c.channel, objective: c.objective, startsOn: c.startsOn, endsOn: c.endsOn, notes: c.notes, archived,
      status: campaignStatus({ startsOn: c.startsOn, endsOn: c.endsOn, archived }, at), version: c.version, createdAt: c.createdAt, updatedAt: c.updatedAt,
    };
  }

  // ---------------------------------------------------------------- números (uma única conta para tudo)

  /**
   * Os dados da aluna na forma de `MarketingData` (marketing-data.js): contatos (dia de criação), oportunidades (dia de abertura),
   * vendas (com a campanha da oportunidade e a do contato) e investimentos. As contas ficam todas no módulo puro.
   */
  function facts(u) {
    const people = mine(db().people, u);
    const personById = new Map(people.map((p) => [p.id, p]));
    const deals = mine(db().deals, u);
    const dealById = new Map(deals.map((x) => [x.id, x]));
    return {
      contacts: people.map((p) => ({ id: p.id, createdOn: dayOf(p.createdAt), source: p.source, campaignId: p.campaignId ?? null, entryFunnelId: p.entryFunnelId ?? null })),
      deals: deals.map((x) => ({ id: x.id, openedOn: dayOf(x.openedAt), campaignId: x.campaignId ?? null, funnelId: x.funnelId })),
      sales: mine(table('sales'), u)
        .filter((s) => personById.has(s.personId))
        .map((s) => {
          const deal = s.dealId ? dealById.get(s.dealId) : null;
          return {
            id: s.id, personId: s.personId, dealId: s.dealId ?? null, closedOn: s.closedOn, finalValue: fromCents(toCents(s.originalValue) - toCents(s.discount)), status: s.status,
            createdAt: s.createdAt, dealCampaignId: deal?.campaignId ?? null, personCampaignId: personById.get(s.personId).campaignId ?? null, dealFunnelId: deal?.funnelId ?? null,
          };
        }),
      spend: mine(table('marketingSpend'), u).map((s) => ({ spentOn: s.spentOn, amount: s.amount, campaignId: s.campaignId ?? null })),
    };
  }

  const PERIOD_RULE = { enum: PERIODS, message: 'Período inválido.' };
  const periodWindow = (period) => periodRange(today(), period);

  function listCampaigns(searchParams) {
    const u = d.requireStudent();
    const query = readQuery(
      searchParams,
      { status: { enum: CAMPAIGN_STATUSES, message: 'Situação inválida.' }, channel: { enum: CHANNELS, message: 'Canal inválido.' }, q: 'text', period: PERIOD_RULE },
      { period: 'month' },
    );
    const at = today();
    const f = facts(u);
    const w = periodWindow(query.period);
    let rows = campaignsOf(u).map((c) => campaignDto(c, at));
    if (query.status) rows = rows.filter((c) => c.status === query.status);
    if (query.channel) rows = rows.filter((c) => c.channel === query.channel);
    if (query.q) rows = rows.filter((c) => fold(c.name).includes(fold(query.q)));
    rows.sort((a, b) => cmp(b.startsOn, a.startsOn) || cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id));
    const metrics = metricsByCampaign(f, w, rows.map((c) => c.id));
    return { status: 200, body: { rows: rows.map((c) => ({ ...c, metrics: metrics[c.id] })), total: rows.length } };
  }

  function getCampaign(id, searchParams) {
    const u = d.requireStudent();
    const { period } = readQuery(searchParams, { period: PERIOD_RULE }, { period: 'month' });
    const c = findCampaign(u, id);
    const f = facts(u);
    const at = today();
    const spend = mine(table('marketingSpend'), u).filter((s) => s.campaignId === c.id).sort(bySpendDate).map((s) => spendDto(u, s));
    return { status: 200, body: { ...campaignDto(c, at), metrics: metricsFor(f, periodWindow(period), c.id), spend, series: campaignSeries(f, c.id, at) } };
  }

  const CAMPAIGN_FIELDS = ['name', 'channel', 'objective', 'startsOn', 'endsOn', 'notes'];

  function readCampaignFields(b, issues, patch) {
    const out = {};
    if (!patch || b.name !== undefined) out.name = readLine(b.name, 'name', 80, issues, 'Informe o nome da campanha.');
    if (!patch || b.channel !== undefined) out.channel = readChannel(b.channel, issues);
    if (b.objective !== undefined) out.objective = readOptional(b.objective, 'objective', 300, issues, false);
    if (!patch || b.startsOn !== undefined) out.startsOn = readDate(b.startsOn, 'startsOn', issues);
    if (b.endsOn !== undefined) out.endsOn = b.endsOn === null ? null : readDate(b.endsOn, 'endsOn', issues);
    if (b.notes !== undefined) out.notes = readOptional(b.notes, 'notes', 1000, issues, true);
    return out;
  }

  function assertUniqueName(u, name, exceptId) {
    const key = name.trim().toLocaleLowerCase('pt-BR');
    if (campaignsOf(u).some((c) => c.id !== exceptId && c.name.trim().toLocaleLowerCase('pt-BR') === key)) {
      throw Errors.conflict('duplicate_name', 'Já existe uma campanha com esse nome.', [{ field: 'name', message: 'Já existe uma campanha com esse nome.' }]);
    }
  }

  function createCampaign(body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, CAMPAIGN_FIELDS, issues);
    const fields = readCampaignFields(b, issues, false);
    if (fields.startsOn && fields.endsOn && fields.endsOn < fields.startsOn) issues.add('endsOn', 'O fim precisa ser depois do início.');
    issues.throwIfAny();
    // Teto por aluna (arquivadas incluídas), antes do nome repetido, como o servidor.
    if (campaignsOf(u).length >= MAX_CAMPAIGNS) {
      throw Errors.conflict('campaign_limit', 'Você chegou ao limite de 200 campanhas. Arquive ou reaproveite uma campanha existente.');
    }
    assertUniqueName(u, fields.name);
    const at = d.stamp();
    const row = { id: d.newId(), ownerId: u.id, objective: null, endsOn: null, notes: null, ...fields, archivedAt: null, version: 1, createdAt: at, updatedAt: at };
    table('campaigns').push(row);
    return { status: 201, body: campaignDto(row) };
  }

  function patchCampaign(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, [...CAMPAIGN_FIELDS, 'version'], issues);
    const patch = readCampaignFields(b, issues, true);
    const version = readVersion(b.version, issues);
    if (!CAMPAIGN_FIELDS.some((k) => b[k] !== undefined)) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    const row = findCampaign(u, id);
    if (row.version !== version) throw Errors.conflict('version_conflict', CAMPAIGN_CONFLICT);
    if (patch.name !== undefined) assertUniqueName(u, patch.name, row.id);
    const next = { ...row, ...patch };
    if (next.endsOn && next.endsOn < next.startsOn) throw fieldError('endsOn', 'O fim precisa ser depois do início.');
    Object.assign(row, patch, { version: row.version + 1, updatedAt: d.stamp() });
    return { status: 200, body: campaignDto(row) };
  }

  function setArchived(id, body, archived) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['version'], issues);
    const version = readVersion(b.version, issues);
    issues.throwIfAny();
    const row = findCampaign(u, id);
    if (row.version !== version) throw Errors.conflict('version_conflict', CAMPAIGN_CONFLICT);
    // Já no estado pedido: nada muda (nem a versão), como o servidor.
    if ((row.archivedAt != null) === archived) return { status: 200, body: campaignDto(row) };
    const at = d.stamp();
    Object.assign(row, { archivedAt: archived ? at : null, version: row.version + 1, updatedAt: at });
    return { status: 200, body: campaignDto(row) };
  }

  // ---------------------------------------------------------------- investimentos

  const bySpendDate = (a, b) => cmp(b.spentOn, a.spentOn) || cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id);

  function spendDto(u, s) {
    return {
      id: s.id, campaignId: s.campaignId, campaignName: s.campaignId ? (findOwnCampaign(u, s.campaignId)?.name ?? null) : null, spentOn: s.spentOn, amount: s.amount,
      channel: s.channel, description: s.description, version: s.version, createdAt: s.createdAt,
    };
  }

  const DATE_RULE = { pattern: DATE, message: 'Informe uma data válida.' };

  function listSpend(searchParams) {
    const u = d.requireStudent();
    const query = readQuery(searchParams, { campaignId: 'uuid', from: DATE_RULE, to: DATE_RULE, limit: { int: [1, 500] }, offset: { int: [0, 1_000_000] } }, { limit: 100, offset: 0 });
    if (query.from && query.to && query.from > query.to) throw fieldError('to', 'O início precisa ser antes do fim.');
    const rows = mine(table('marketingSpend'), u)
      .filter((s) => (!query.campaignId || s.campaignId === query.campaignId) && (!query.from || s.spentOn >= query.from) && (!query.to || s.spentOn <= query.to))
      .sort(bySpendDate);
    return {
      status: 200,
      body: { rows: rows.slice(query.offset, query.offset + query.limit).map((s) => spendDto(u, s)), total: rows.length, totalAmount: fromCents(rows.reduce((t, s) => t + toCents(s.amount), 0)) },
    };
  }

  /** Campanha do investimento: da aluna e não arquivada (investimento novo ou troca de campanha). */
  function readSpendCampaign(u, value, issues) {
    if (value === null) return null;
    const c = findOwnCampaign(u, value);
    if (!c) return void issues.add('campaignId', 'Campanha não encontrada.');
    if (c.archivedAt != null) return void issues.add('campaignId', 'Esta campanha está arquivada.');
    return c.id;
  }

  const SPEND_FIELDS = ['campaignId', 'spentOn', 'amount', 'channel', 'description'];

  function createSpend(body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, SPEND_FIELDS, issues);
    const campaignId = b.campaignId === undefined ? null : readSpendCampaign(u, b.campaignId, issues);
    const spentOn = readDate(b.spentOn, 'spentOn', issues);
    const amount = readAmount(b.amount, issues);
    // Sem canal: o da campanha (investimento sem campanha precisa do canal).
    const channel = b.channel !== undefined ? readChannel(b.channel, issues) : campaignId ? findOwnCampaign(u, campaignId).channel : void issues.add('channel', 'Informe o canal.');
    const description = b.description === undefined ? null : readOptional(b.description, 'description', 200, issues, false);
    issues.throwIfAny();
    const at = d.stamp();
    const row = { id: d.newId(), ownerId: u.id, campaignId, spentOn, amount, channel, description, version: 1, createdAt: at, updatedAt: at };
    table('marketingSpend').push(row);
    return { status: 201, body: spendDto(u, row) };
  }

  function findSpend(u, id) {
    const row = UUID.test(id) ? mine(table('marketingSpend'), u).find((s) => s.id === id) : null;
    if (!row) throw Errors.notFound('Investimento não encontrado.');
    return row;
  }

  function patchSpend(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, [...SPEND_FIELDS, 'version'], issues);
    const current = UUID.test(id) ? mine(table('marketingSpend'), u).find((s) => s.id === id) : null;
    const patch = {};
    // Manter a campanha (mesmo arquivada) vale; trocar só para uma não arquivada.
    if (b.campaignId !== undefined) patch.campaignId = b.campaignId !== null && b.campaignId === current?.campaignId ? b.campaignId : readSpendCampaign(u, b.campaignId, issues);
    if (b.spentOn !== undefined) patch.spentOn = readDate(b.spentOn, 'spentOn', issues);
    if (b.amount !== undefined) patch.amount = readAmount(b.amount, issues);
    if (b.channel !== undefined) patch.channel = readChannel(b.channel, issues);
    if (b.description !== undefined) patch.description = readOptional(b.description, 'description', 200, issues, false);
    const version = readVersion(b.version, issues);
    if (!SPEND_FIELDS.some((k) => b[k] !== undefined)) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    const row = findSpend(u, id);
    if (row.version !== version) throw Errors.conflict('version_conflict', SPEND_CONFLICT);
    Object.assign(row, patch, { version: row.version + 1, updatedAt: d.stamp() });
    return { status: 200, body: spendDto(u, row) };
  }

  function deleteSpend(id) {
    const u = d.requireStudent();
    const row = findSpend(u, id);
    db().marketingSpend = table('marketingSpend').filter((s) => s.id !== row.id);
    return { status: 204 };
  }

  // ---------------------------------------------------------------- Instagram (lançamento manual por período)

  const igOf = (u) => mine(table('instagramMetrics'), u).sort((a, b) => cmp(b.periodStart, a.periodStart) || cmp(a.id, b.id));

  function igDto(e) {
    return {
      id: e.id, periodStart: e.periodStart, periodEnd: e.periodEnd, followers: e.followers, newFollowers: e.newFollowers, reach: e.reach, impressions: e.impressions,
      interactions: e.interactions, profileVisits: e.profileVisits, linkClicks: e.linkClicks, leads: e.leads, engagementRate: engagementRate(e.interactions, e.reach),
      notes: e.notes, source: e.source, version: e.version,
    };
  }

  function listInstagram(searchParams) {
    const u = d.requireStudent();
    const { limit } = readQuery(searchParams, { limit: { int: [1, 100] } }, { limit: 24 });
    const rows = igOf(u);
    return { status: 200, body: { rows: rows.slice(0, limit).map(igDto), growth: instagramGrowth(rows[0] ?? null, rows[1] ?? null) } };
  }

  const IG_FIELDS = ['periodStart', 'periodEnd', 'followers', ...IG_COUNTS, 'notes'];

  function readIgFields(b, issues, patch) {
    const out = {};
    if (!patch || b.periodStart !== undefined) out.periodStart = readDate(b.periodStart, 'periodStart', issues);
    if (!patch || b.periodEnd !== undefined) out.periodEnd = readDate(b.periodEnd, 'periodEnd', issues);
    if (!patch || b.followers !== undefined) out.followers = readInt(b.followers, 'followers', 0, 100_000_000, issues, false);
    for (const k of IG_COUNTS) {
      if (b[k] !== undefined) out[k] = k === 'newFollowers' ? readInt(b[k], k, -100_000_000, 100_000_000, issues, true) : readInt(b[k], k, 0, 1_000_000_000, issues, true);
    }
    if (b.notes !== undefined) out.notes = readOptional(b.notes, 'notes', 500, issues, true);
    return out;
  }

  function checkPeriod(u, start, end, exceptId) {
    if (end < start || (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 > 366) {
      throw fieldError('periodEnd', 'O fim precisa ser depois do início (no máximo 1 ano).');
    }
    if (igOf(u).some((e) => e.id !== exceptId && periodsOverlap(start, end, e.periodStart, e.periodEnd))) {
      throw Errors.conflict('period_overlap', 'Já existe um lançamento do Instagram que cobre parte deste período.', [{ field: 'periodStart', message: 'Já existe um lançamento do Instagram que cobre parte deste período.' }]);
    }
  }

  function createInstagram(body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, IG_FIELDS, issues);
    const fields = readIgFields(b, issues, false);
    issues.throwIfAny();
    checkPeriod(u, fields.periodStart, fields.periodEnd);
    const at = d.stamp();
    const row = {
      id: d.newId(), ownerId: u.id, newFollowers: null, reach: null, impressions: null, interactions: null, profileVisits: null, linkClicks: null, leads: null, notes: null,
      ...fields, source: 'manual', version: 1, createdAt: at, updatedAt: at,
    };
    table('instagramMetrics').push(row);
    return { status: 201, body: igDto(row) };
  }

  function findIg(u, id) {
    const row = UUID.test(id) ? mine(table('instagramMetrics'), u).find((e) => e.id === id) : null;
    if (!row) throw Errors.notFound('Lançamento não encontrado.');
    return row;
  }

  function patchInstagram(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, [...IG_FIELDS, 'version'], issues);
    const patch = readIgFields(b, issues, true);
    const version = readVersion(b.version, issues);
    if (!IG_FIELDS.some((k) => b[k] !== undefined)) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    const row = findIg(u, id);
    if (row.version !== version) throw Errors.conflict('version_conflict', INSTAGRAM_CONFLICT);
    const next = { ...row, ...patch };
    if (next.periodEnd < next.periodStart) throw fieldError('periodEnd', 'O fim precisa ser depois do início.');
    if (patch.periodStart !== undefined || patch.periodEnd !== undefined) checkPeriod(u, next.periodStart, next.periodEnd, row.id);
    Object.assign(row, patch, { version: row.version + 1, updatedAt: d.stamp() });
    return { status: 200, body: igDto(row) };
  }

  function deleteInstagram(id) {
    const u = d.requireStudent();
    const row = findIg(u, id);
    db().instagramMetrics = table('instagramMetrics').filter((e) => e.id !== row.id);
    return { status: 204 };
  }

  // ---------------------------------------------------------------- visão geral e mentora

  function overview(searchParams) {
    const u = d.requireStudent();
    const { period } = readQuery(searchParams, { period: PERIOD_RULE }, { period: 'month' });
    const w = periodWindow(period);
    const f = facts(u);
    const campaigns = campaignsOf(u).map((c) => ({ id: c.id, name: c.name, channel: c.channel, archived: c.archivedAt != null }));
    const funnels = mine(db().funnels, u)
      .sort((a, b) => a.position - b.position)
      .map((fn) => ({ id: fn.id, name: fn.name, active: fn.active }));
    const report = marketingReport(f, w, campaigns, funnels);
    // O lançamento do Instagram mais recente que toca o período.
    const latest = igOf(u).find((e) => e.periodEnd >= w.from && e.periodStart <= w.to) ?? null;
    return {
      status: 200,
      body: {
        period: w, ...report, instagram: latest ? igDto(latest) : null,
      },
    };
  }

  /** Para a mentora (e a equipe com `business.view`): só números, nunca nome de campanha nem de contato. */
  function mentoraMarketing(id, searchParams) {
    d.requireAuth('admin');
    const { period } = readQuery(searchParams, { period: PERIOD_RULE }, { period: 'month' });
    const student = UUID.test(id) ? db().users.find((x) => x.id === id && x.role === 'user') : null;
    if (!student) throw Errors.notFound('Aluna não encontrada.');
    const w = periodWindow(period);
    const m = metricsFor(facts(student), w);
    const at = today();
    const activeCampaigns = campaignsOf(student).filter((c) => campaignStatus({ ...c, archived: c.archivedAt != null }, at) === 'active').length;
    return {
      status: 200,
      body: { period: w, investment: m.investment, leads: m.leads, cpl: m.cpl, newClients: m.newClients, cac: m.cac, revenue: m.revenue, roas: m.roas, roi: m.roi, activeCampaigns },
    };
  }

  // ---------------------------------------------------------------- o que a Central Comercial usa (contato e oportunidade)

  /**
   * `campaignId` de contato/oportunidade: da própria aluna; uma arquivada não pode ser ESCOLHIDA (em criação, ou trocando para
   * ela); manter a que já estava vale. Devolve o id, null ou undefined (com o erro em `issues`).
   */
  function readCampaignRef(u, value, issues, current = null) {
    if (value === null) return null;
    if (typeof value !== 'string' || !UUID.test(value)) return void issues.add('campaignId', 'Identificador inválido.');
    if (value === current) return value;
    const c = findOwnCampaign(u, value);
    if (!c) return void issues.add('campaignId', 'Campanha não encontrada.');
    if (c.archivedAt != null) return void issues.add('campaignId', 'Esta campanha está arquivada.');
    return c.id;
  }

  const SEG = '([^/]+)';
  return {
    routes: [
      ['GET', /^campaigns$/, (_m, q) => listCampaigns(q)],
      ['POST', /^campaigns$/, (_m, _q, body) => createCampaign(body)],
      ['GET', new RegExp(`^campaigns/${SEG}$`), (m, q) => getCampaign(m[1], q)],
      ['PATCH', new RegExp(`^campaigns/${SEG}$`), (m, _q, body) => patchCampaign(m[1], body)],
      ['POST', new RegExp(`^campaigns/${SEG}/archive$`), (m, _q, body) => setArchived(m[1], body, true)],
      ['POST', new RegExp(`^campaigns/${SEG}/unarchive$`), (m, _q, body) => setArchived(m[1], body, false)],
      ['GET', /^marketing\/spend$/, (_m, q) => listSpend(q)],
      ['POST', /^marketing\/spend$/, (_m, _q, body) => createSpend(body)],
      ['PATCH', new RegExp(`^marketing/spend/${SEG}$`), (m, _q, body) => patchSpend(m[1], body)],
      ['DELETE', new RegExp(`^marketing/spend/${SEG}$`), (m) => deleteSpend(m[1])],
      ['GET', /^marketing\/instagram$/, (_m, q) => listInstagram(q)],
      ['POST', /^marketing\/instagram$/, (_m, _q, body) => createInstagram(body)],
      ['PATCH', new RegExp(`^marketing/instagram/${SEG}$`), (m, _q, body) => patchInstagram(m[1], body)],
      ['DELETE', new RegExp(`^marketing/instagram/${SEG}$`), (m) => deleteInstagram(m[1])],
      ['GET', /^marketing\/overview$/, (_m, q) => overview(q)],
      ['GET', new RegExp(`^mentora/students/${SEG}/marketing$`), (m, q) => mentoraMarketing(m[1], q)],
    ],
    readCampaignRef,
    /** Nome da campanha (da aluna) ou null. */
    campaignName: (u, id) => (id ? (findOwnCampaign(u, id)?.name ?? null) : null),
  };
}
