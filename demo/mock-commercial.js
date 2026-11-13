// Central Comercial da demonstração (Entrega 2): funis com etapas próprias, oportunidades por funil, contatos (Pessoa = Contato)
// com estado comercial derivado, linha do tempo do contato, visão geral e os números comerciais por aluna para a mentora.
// Mesmo contrato do servidor (docs/superpowers/specs/2026-11-04-entrega-2-central-comercial.md), sobre o estado em memória.
// Recebe do mock principal só o que precisa (banco, relógio, XP, validação) e, do Financeiro (mock-finance.js), as vendas do contato.
import { normalizeEmail, normalizeInstagram, normalizeWhatsapp } from '../shared/contact.js';
import { overviewQueryProblem, overviewRange, todayInBrasilia } from './finance-data.js';
import { DEFAULT_FUNNELS, defaultFunnelRows } from './funnels-data.js';
import { conversionRate } from './reports-data.js';

const DAY = 86_400_000;
const MINUTE = 60_000;
// Dia de Brasília (como o XP e as metas): os períodos da visão geral começam à meia-noite de lá.
const BRT_OFFSET = 180;
const TEMPERATURES = ['cold', 'warm', 'hot'];
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'discarded'];
const CONTACT_STATUSES = ['lead', 'negotiating', 'client', 'lost'];
const DEAL_STATUSES = ['open', 'won', 'lost'];
const ACTIVITY_KINDS = ['note', 'call', 'email', 'meeting', 'whatsapp'];
const PERIODS = ['month', 'quarter', 'year'];
const SOURCE_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_OPEN_STAGES = 10;
const STANDARD_NAMES = new Map(DEFAULT_FUNNELS.map((f) => [f.key, f.name]));
const DEAL_CONFLICT = 'Esta oportunidade foi alterada em outra aba ou outro dispositivo. Recarregue a lista e tente de novo.';
const CONTACT_CONFLICT = 'Este contato foi alterado em outra aba ou outro dispositivo. Recarregue a lista e tente de novo.';
const FUNNEL_CONFLICT = 'Este funil foi alterado em outra aba ou outro dispositivo. Recarregue e tente de novo.';

export function createCommercialDemo(d) {
  const { Errors, createIssues, requireBody, onlyKeys, readVersion, readQuery, readMoney, toCents, fromCents, fold, byText, sortRows, UUID, CONTROL_CHARS, MULTILINE_CONTROL_CHARS } = d;
  const db = () => d.getDb();
  const finance = d.finance;
  const marketing = d.marketing;
  const mine = (list, u) => list.filter((row) => row.ownerId === u.id);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const money = (rows) => fromCents(rows.reduce((n, x) => n + toCents(x.value), 0));
  /** Meia-noite de Brasília de uma data AAAA-MM-DD, em ms. */
  const dayStart = (date) => Date.parse(`${date}T00:00:00Z`) + BRT_OFFSET * MINUTE;
  const isRealDate = (s) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

  // ---------------------------------------------------------------- funis

  /** Garante os 15 funis padrão da aluna (idempotente por chave, como crm_seed_default_funnels). */
  function ensureFunnels(u) {
    const have = new Set(mine(db().funnels, u).map((f) => f.key));
    const rows = defaultFunnelRows(u.id, d.stamp(), { funnel: () => d.newId(), stage: () => d.newId() }, have);
    if (!rows.funnels.length) return;
    db().funnels.push(...rows.funnels);
    db().funnelStages.push(...rows.stages);
    d.persist();
  }

  const funnelsOf = (u) => mine(db().funnels, u).sort((a, b) => a.position - b.position || cmp(a.id, b.id));
  const stagesOf = (funnelId) => db().funnelStages.filter((s) => s.funnelId === funnelId).sort((a, b) => a.position - b.position);
  const stageDto = (s) => ({ id: s.id, name: s.name, position: s.position, probability: s.probability, kind: s.kind });
  const dealsOf = (u) => mine(db().deals, u);

  function funnelDto(u, f) {
    const open = dealsOf(u).filter((x) => x.funnelId === f.id && x.stage === 'open');
    return {
      id: f.id, key: f.key, name: f.name, position: f.position, active: f.active, version: f.version,
      stages: stagesOf(f.id).map(stageDto), openCount: open.length, openTotal: money(open),
    };
  }

  function findFunnel(u, id) {
    const row = UUID.test(id) ? db().funnels.find((f) => f.id === id && f.ownerId === u.id) : null;
    if (!row) throw Errors.notFound('Funil não encontrado.');
    return row;
  }

  function listFunnels(searchParams) {
    const u = d.requireStudent();
    readQuery(searchParams, {}, {});
    ensureFunnels(u);
    return { status: 200, body: { funnels: funnelsOf(u).map((f) => funnelDto(u, f)) } };
  }

  function readShortName(value, field, required, issues) {
    if (typeof value !== 'string' || value.trim() === '') return void issues.add(field, required);
    const s = value.trim();
    if (s.length > 40) return void issues.add(field, 'Nome muito longo (máximo 40).');
    if (CONTROL_CHARS.test(s)) return void issues.add(field, 'O nome contém caracteres inválidos.');
    return s;
  }

  function patchFunnel(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['name', 'active', 'version'], issues);
    const patch = {};
    if (b.name !== undefined) patch.name = readShortName(b.name, 'name', 'Informe o nome do funil.', issues);
    if (b.active !== undefined) {
      if (typeof b.active !== 'boolean') issues.add('active', 'Dados inválidos.');
      else patch.active = b.active;
    }
    const version = readVersion(b.version, issues);
    if (b.name === undefined && b.active === undefined) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    const row = findFunnel(u, id);
    if (row.version !== version) throw Errors.conflict('conflict', FUNNEL_CONFLICT);
    Object.assign(row, patch, { version: row.version + 1, updatedAt: d.stamp() });
    return { status: 200, body: funnelDto(u, row) };
  }

  /**
   * Lista completa e ordenada (mesmas regras da rota do servidor): de 1 a 10 abertas primeiro, depois exatamente uma "ganha" e uma
   * "perdida" (nesta ordem, 100% e 0% forçados). Sem `id` = etapa nova; etapa existente não muda de tipo; etapa omitida que ainda
   * tem oportunidades = 409 `stage_in_use`.
   */
  function putStages(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['version', 'stages'], issues);
    const version = readVersion(b.version, issues);
    const parsed = [];
    if (!Array.isArray(b.stages) || b.stages.length < 3) issues.add('stages', 'Informe ao menos uma etapa aberta, a ganha e a perdida.');
    else if (b.stages.length > MAX_OPEN_STAGES + 2) issues.add('stages', `No máximo ${MAX_OPEN_STAGES} etapas abertas.`);
    else {
      const names = new Set();
      const ids = new Set();
      b.stages.forEach((s, i) => {
        const at = (part) => `stages.${i}.${part}`;
        if (!d.isPlainObject(s)) return void issues.add(`stages.${i}`, 'Dados inválidos.');
        for (const key of Object.keys(s)) if (!['id', 'name', 'probability', 'kind'].includes(key)) issues.add(`stages.${i}`, `Campo não permitido: ${key}.`);
        const kind = ['open', 'won', 'lost'].includes(s.kind) ? s.kind : void issues.add(at('kind'), 'Tipo de etapa inválido.');
        const name = readShortName(s.name, at('name'), 'Informe o nome da etapa.', issues);
        if (name !== undefined) {
          const folded = name.toLocaleLowerCase('pt-BR');
          if (names.has(folded)) issues.add(at('name'), 'Cada etapa precisa de um nome diferente.');
          names.add(folded);
        }
        if (typeof s.probability !== 'number') issues.add(at('probability'), 'Informe a probabilidade.');
        else if (!Number.isInteger(s.probability)) issues.add(at('probability'), 'Use um número inteiro de 0 a 100.');
        else if (s.probability < 0 || s.probability > 100) issues.add(at('probability'), 'A probabilidade vai de 0 a 100.');
        if (s.id !== undefined) {
          if (typeof s.id !== 'string' || !UUID.test(s.id)) issues.add(at('id'), 'Identificador inválido.');
          else if (ids.has(s.id)) issues.add(at('id'), 'Etapa repetida.');
          ids.add(s.id);
        }
        // Ganha e perdida valem sempre 100% e 0% (forçado, como no servidor).
        parsed.push({ id: s.id, name, probability: kind === 'won' ? 100 : kind === 'lost' ? 0 : s.probability, kind });
      });
      const kinds = parsed.map((s) => s.kind);
      const open = kinds.filter((k) => k === 'open').length;
      const shapeOk =
        open >= 1 && open <= MAX_OPEN_STAGES && kinds.length === open + 2 && kinds.slice(0, open).every((k) => k === 'open') && kinds[open] === 'won' && kinds[open + 1] === 'lost';
      if (!shapeOk) issues.add('stages', `Use de 1 a ${MAX_OPEN_STAGES} etapas abertas e, no fim, exatamente uma etapa ganha e uma perdida.`);
    }
    issues.throwIfAny();
    const funnel = findFunnel(u, id);
    if (funnel.version !== version) throw Errors.conflict('conflict', FUNNEL_CONFLICT);
    const current = stagesOf(funnel.id);
    parsed.forEach((s, i) => {
      if (s.id === undefined) return;
      const found = current.find((x) => x.id === s.id);
      if (!found) throw Errors.validation([{ field: `stages.${i}.id`, message: 'Etapa não encontrada neste funil.' }]);
      if (found.kind !== s.kind) throw Errors.validation([{ field: `stages.${i}.kind`, message: 'Uma etapa existente não muda de tipo. Crie uma etapa nova.' }]);
    });
    const kept = new Set(parsed.map((s) => s.id).filter(Boolean));
    if (current.some((s) => !kept.has(s.id) && db().deals.some((x) => x.stageId === s.id))) {
      throw Errors.conflict('stage_in_use', 'Uma etapa removida ainda tem oportunidades. Mova-as para outra etapa antes de removê-la.');
    }
    const next = parsed.map((s, i) => ({ id: s.id ?? d.newId(), ownerId: u.id, funnelId: funnel.id, name: s.name, position: i + 1, probability: s.probability, kind: s.kind }));
    db().funnelStages = [...db().funnelStages.filter((s) => s.funnelId !== funnel.id), ...next];
    Object.assign(funnel, { version: funnel.version + 1, updatedAt: d.stamp() });
    return { status: 200, body: funnelDto(u, funnel) };
  }

  // ---------------------------------------------------------------- oportunidades

  function dealDto(u, row) {
    const person = db().people.find((p) => p.id === row.personId && p.ownerId === u.id);
    const funnel = db().funnels.find((f) => f.id === row.funnelId);
    const stage = db().funnelStages.find((s) => s.id === row.stageId);
    const product = row.productId ? db().products.find((p) => p.id === row.productId && p.ownerId === u.id) : null;
    return {
      id: row.id, personId: row.personId, personName: person?.name ?? '', funnelId: row.funnelId, funnelName: funnel?.name ?? '',
      stageId: row.stageId, stageName: stage?.name ?? '', status: row.stage, productId: row.productId, productName: product?.name ?? null,
      value: row.value, campaignId: row.campaignId ?? null, campaignName: marketing.campaignName(u, row.campaignId), temperature: row.temperature, lostReason: row.lostReason, responsible: row.responsible ?? null, openedAt: row.openedAt,
      closedAt: row.closedAt, expectedCloseOn: row.expectedCloseOn, notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version,
    };
  }

  const DATE_RULE = { pattern: DATE, message: 'Data inválida.' };
  const DEAL_QUERY = {
    funnelId: 'uuid',
    stageId: 'uuid',
    status: { enum: DEAL_STATUSES, message: 'Situação inválida.' },
    from: DATE_RULE,
    to: DATE_RULE,
    responsible: 'text',
    productId: 'uuid',
    temperature: { enum: TEMPERATURES, message: 'Temperatura inválida.' },
    q: 'text',
    sort: { enum: ['created_at', 'value', 'expected_close_on'] },
    order: { enum: ['asc', 'desc'] },
    limit: { int: [1, 500] },
    offset: { int: [0, 1_000_000] },
  };

  function readRange(query) {
    const issues = createIssues();
    if (query.from && !isRealDate(query.from)) issues.add('from', 'Data inválida.');
    if (query.to && !isRealDate(query.to)) issues.add('to', 'Data inválida.');
    if (query.from && query.to && query.from > query.to) issues.add('to', 'O início precisa ser antes do fim.');
    issues.throwIfAny();
  }

  function listDeals(searchParams) {
    const u = d.requireStudent();
    const query = readQuery(searchParams, DEAL_QUERY, { sort: 'created_at', order: 'desc', limit: 100, offset: 0 });
    readRange(query);
    const people = new Map(mine(db().people, u).map((p) => [p.id, p]));
    let rows = dealsOf(u).filter((x) => people.has(x.personId));
    if (query.funnelId) rows = rows.filter((x) => x.funnelId === query.funnelId);
    if (query.stageId) rows = rows.filter((x) => x.stageId === query.stageId);
    if (query.status) rows = rows.filter((x) => x.stage === query.status);
    // `from`/`to` (AAAA-MM-DD, inclusive) sobre a abertura, no dia de Brasília.
    if (query.from) rows = rows.filter((x) => Date.parse(x.openedAt) >= dayStart(query.from));
    if (query.to) rows = rows.filter((x) => Date.parse(x.openedAt) < dayStart(query.to) + DAY);
    if (query.responsible) rows = rows.filter((x) => (x.responsible ?? '').toLowerCase() === query.responsible.toLowerCase());
    if (query.productId) rows = rows.filter((x) => x.productId === query.productId);
    if (query.temperature) rows = rows.filter((x) => x.temperature === query.temperature);
    if (query.q) rows = rows.filter((x) => fold(people.get(x.personId).name).includes(fold(query.q)));
    const keys = { created_at: (x) => x.createdAt, value: (x) => toCents(x.value), expected_close_on: (x) => x.expectedCloseOn };
    rows = sortRows(rows, keys[query.sort], query.order, { nullsLast: query.sort === 'expected_close_on' });
    return { status: 200, body: { rows: rows.slice(query.offset, query.offset + query.limit).map((x) => dealDto(u, x)), total: rows.length } };
  }

  /** Soma de valor x probabilidade da etapa atual, arredondada uma vez no fim (como o numeric do banco). */
  const weightedCents = (rows) => Math.round(rows.reduce((n, x) => n + toCents(x.value) * (db().funnelStages.find((s) => s.id === x.stageId)?.probability ?? 0), 0) / 100);

  /** Dias médios entre abrir e ganhar (uma casa decimal) ou null. */
  function avgDaysToClose(won) {
    if (!won.length) return null;
    const total = won.reduce((n, x) => n + (Date.parse(x.closedAt) - Date.parse(x.openedAt)), 0);
    return Math.round((total / won.length / DAY) * 10) / 10;
  }

  function dealsSummary(searchParams) {
    const u = d.requireStudent();
    const query = readQuery(searchParams, { funnelId: 'uuid' }, {});
    const people = new Map(mine(db().people, u).map((p) => [p.id, p]));
    let rows = dealsOf(u).filter((x) => people.has(x.personId));
    let stages;
    if (query.funnelId) {
      // Funil que não é da aluna: tudo zerado e sem etapas (como a consulta filtrada do servidor).
      const funnel = mine(db().funnels, u).find((f) => f.id === query.funnelId);
      rows = rows.filter((x) => x.funnelId === query.funnelId);
      stages = (funnel ? stagesOf(funnel.id) : []).map((s) => {
        const inStage = rows.filter((x) => x.stageId === s.id);
        return { stageId: s.id, name: s.name, kind: s.kind, probability: s.probability, count: inStage.length, total: money(inStage) };
      });
    }
    const open = rows.filter((x) => x.stage === 'open');
    const won = rows.filter((x) => x.stage === 'won');
    const lost = rows.filter((x) => x.stage === 'lost');
    const waiting = sortRows(open, (x) => x.updatedAt, 'asc')
      .slice(0, 3)
      .map((x) => ({ id: x.id, personName: people.get(x.personId).name, value: x.value, stageName: db().funnelStages.find((s) => s.id === x.stageId)?.name ?? '', updatedAt: x.updatedAt }));
    return {
      status: 200,
      body: {
        ...(stages ? { stages } : {}),
        open: { count: open.length, total: money(open), weighted: fromCents(weightedCents(open)) },
        won: { count: won.length, total: money(won) },
        lost: { count: lost.length, total: money(lost) },
        conversionRate: conversionRate(won.length, lost.length),
        avgDaysToClose: avgDaysToClose(won),
        waiting,
      },
    };
  }

  function readUuid(value, field, issues) {
    if (typeof value !== 'string' || !UUID.test(value)) return void issues.add(field, 'Identificador inválido.');
    return value;
  }

  function readTemperature(value, issues) {
    if (!TEMPERATURES.includes(value)) return void issues.add('temperature', 'Temperatura inválida.');
    return value;
  }

  /** Texto de uma linha, 1 a `max` caracteres; vazio = null. */
  function readLine(value, field, max, issues) {
    if (value === null) return null;
    if (typeof value !== 'string') return void issues.add(field, 'Dados inválidos.');
    const s = value.trim();
    if (s.length > max) return void issues.add(field, `Texto muito longo (máximo ${max}).`);
    if (CONTROL_CHARS.test(s)) return void issues.add(field, 'O texto contém caracteres inválidos.');
    return s === '' ? null : s;
  }

  /** Texto de várias linhas, até `max` caracteres; vazio = null. */
  function readText(value, field, max, issues) {
    if (value === null) return null;
    if (typeof value !== 'string') return void issues.add(field, 'Dados inválidos.');
    const s = value.trim();
    if (s.length > max) return void issues.add(field, `Texto muito longo (máximo ${max}).`);
    if (MULTILINE_CONTROL_CHARS.test(s)) return void issues.add(field, 'O texto contém caracteres inválidos.');
    return s === '' ? null : s;
  }

  function readExpectedCloseOn(value, issues) {
    if (value === null) return null;
    if (typeof value !== 'string' || !isRealDate(value) || Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2100) {
      return void issues.add('expectedCloseOn', 'Informe uma data válida.');
    }
    return value;
  }

  const ownProduct = (u, id) => mine(db().products, u).find((p) => p.id === id);

  function createDeal(body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['personId', 'funnelId', 'stageId', 'productId', 'value', 'temperature', 'expectedCloseOn', 'notes', 'responsible', 'campaignId'], issues);
    const personId = readUuid(b.personId, 'personId', issues);
    const funnelId = readUuid(b.funnelId, 'funnelId', issues);
    const stageId = b.stageId === undefined || b.stageId === null ? null : readUuid(b.stageId, 'stageId', issues);
    const productId = b.productId === undefined || b.productId === null ? null : readUuid(b.productId, 'productId', issues);
    const value = b.value === undefined ? undefined : readMoney(b.value, issues, 'value');
    const temperature = b.temperature === undefined ? 'warm' : readTemperature(b.temperature, issues);
    const expectedCloseOn = b.expectedCloseOn === undefined ? null : readExpectedCloseOn(b.expectedCloseOn, issues);
    const notes = b.notes === undefined ? null : readText(b.notes, 'notes', 1000, issues);
    const responsible = b.responsible === undefined ? null : readLine(b.responsible, 'responsible', 80, issues);
    const campaignId = b.campaignId === undefined ? undefined : marketing.readCampaignRef(u, b.campaignId, issues);
    issues.throwIfAny();

    ensureFunnels(u);
    const refs = createIssues();
    const person = mine(db().people, u).find((p) => p.id === personId);
    if (!person) refs.add('personId', 'Contato não encontrado.');
    const funnel = db().funnels.find((f) => f.id === funnelId && f.ownerId === u.id);
    if (!funnel) refs.add('funnelId', 'Funil não encontrado.');
    else if (!funnel.active) refs.add('funnelId', 'Este funil está desativado.');
    const open = funnel ? stagesOf(funnel.id).filter((s) => s.kind === 'open') : [];
    const stage = stageId ? open.find((s) => s.id === stageId) : open[0];
    if (funnel?.active && !stage) refs.add('stageId', 'Escolha uma etapa aberta deste funil.');
    if (productId && !ownProduct(u, productId)) refs.add('productId', 'Produto não encontrado.');
    refs.throwIfAny();

    const firstDeal = !dealsOf(u).some((x) => x.personId === person.id);
    const at = d.stamp();
    const row = {
      id: d.newId(), ownerId: u.id, personId: person.id, funnelId: funnel.id, stageId: stage.id, stage: 'open', productId,
      value: value ?? (productId ? ownProduct(u, productId).price : '0.00'), temperature, lostReason: null, responsible,
      // Sem campanha informada: herda a do contato (Marketing).
      campaignId: campaignId === undefined ? (person.campaignId ?? null) : campaignId,
      openedAt: at, closedAt: null, expectedCloseOn, notes, createdAt: at, updatedAt: at, version: 1,
    };
    db().deals.push(row);
    // A primeira oportunidade de um contato é a "conversão": +30 XP uma vez por contato (chave `contact-converted:<contato>`).
    const xp = firstDeal ? d.awardXp(u, 'lead_converted', `contact-converted:${person.id}`, at) : 0;
    return { status: 201, body: d.withXp(dealDto(u, row), xp) };
  }

  function findDeal(u, id) {
    const row = UUID.test(id) ? db().deals.find((x) => x.id === id && x.ownerId === u.id) : null;
    if (!row) throw Errors.notFound('Oportunidade não encontrada.');
    return row;
  }

  function getDeal(id) {
    const u = d.requireStudent();
    return { status: 200, body: dealDto(u, findDeal(u, id)) };
  }

  function patchDeal(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    const FIELDS = ['value', 'temperature', 'productId', 'expectedCloseOn', 'notes', 'responsible', 'campaignId'];
    onlyKeys(b, [...FIELDS, 'version'], issues);
    const patch = {};
    if (b.campaignId !== undefined && b.campaignId !== null) readUuid(b.campaignId, 'campaignId', issues);
    if (b.value !== undefined) patch.value = readMoney(b.value, issues, 'value');
    if (b.temperature !== undefined) patch.temperature = readTemperature(b.temperature, issues);
    if (b.productId !== undefined) patch.productId = b.productId === null ? null : readUuid(b.productId, 'productId', issues);
    if (b.expectedCloseOn !== undefined) patch.expectedCloseOn = readExpectedCloseOn(b.expectedCloseOn, issues);
    if (b.notes !== undefined) patch.notes = readText(b.notes, 'notes', 1000, issues);
    if (b.responsible !== undefined) patch.responsible = readLine(b.responsible, 'responsible', 80, issues);
    const version = readVersion(b.version, issues);
    if (!FIELDS.some((k) => b[k] !== undefined)) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    // Existência (404) e versão (409) antes das regras de referência (campanha arquivada, produto), como o servidor.
    const row = findDeal(u, id);
    if (row.version !== version) throw Errors.conflict('version_conflict', DEAL_CONFLICT);
    if (b.campaignId !== undefined) {
      const refs = createIssues();
      patch.campaignId = marketing.readCampaignRef(u, b.campaignId, refs, row.campaignId ?? null);
      refs.throwIfAny();
    }
    if (patch.productId && !ownProduct(u, patch.productId)) throw Errors.validation([{ field: 'productId', message: 'Produto não encontrado.' }]);
    Object.assign(row, patch, { version: row.version + 1, updatedAt: d.stamp() });
    return { status: 200, body: dealDto(u, row) };
  }

  function transitionDeal(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['stageId', 'lostReason', 'version', 'sale'], issues);
    const stageId = readUuid(b.stageId, 'stageId', issues);
    let lostReason;
    if (b.lostReason !== undefined && b.lostReason !== null) {
      if (typeof b.lostReason !== 'string' || b.lostReason.trim() === '') issues.add('lostReason', 'Informe o motivo da perda.');
      else if (b.lostReason.trim().length > 500) issues.add('lostReason', 'Motivo muito longo (máximo 500).');
      else if (CONTROL_CHARS.test(b.lostReason.trim())) issues.add('lostReason', 'O motivo contém caracteres inválidos.');
      else lostReason = b.lostReason.trim();
    }
    const version = readVersion(b.version, issues);
    issues.throwIfAny();
    // `sale` (Financeiro): lido junto com o corpo, como o esquema da rota do servidor.
    const prepareSale = b.sale === undefined ? null : finance.readSaleForDeal(b.sale);

    const row = findDeal(u, id);
    if (row.stageId === stageId) throw Errors.validation([{ field: 'stageId', message: 'A oportunidade já está nesta etapa.' }]);
    // A etapa precisa ser do MESMO funil da oportunidade (a FK composta do banco garante o mesmo).
    const to = db().funnelStages.find((s) => s.id === stageId && s.ownerId === u.id && s.funnelId === row.funnelId);
    if (!to) throw Errors.validation([{ field: 'stageId', message: 'Escolha uma etapa deste funil.' }]);
    if (to.kind === 'lost' && !lostReason) throw Errors.validation([{ field: 'lostReason', message: 'Informe o motivo da perda.' }]);
    if (row.version !== version) throw Errors.conflict('version_conflict', DEAL_CONFLICT);
    // Sair da etapa ganha com venda ativa: 409 (cancelar a venda antes de reabrir ou perder).
    if (row.stage === 'won' && to.kind !== 'won' && finance.dealHasActiveSale(u, row.id)) {
      throw Errors.conflict('deal_has_sale', 'Esta oportunidade tem uma venda registrada. Cancele a venda antes de reabrir.');
    }
    // Ganhar com `sale`: a venda é validada ANTES de mexer na oportunidade; ganha e venda entram juntas (ou nada muda).
    const commitSale = prepareSale ? prepareSale(u, row, to.kind) : null;
    const from = db().funnelStages.find((s) => s.id === row.stageId);
    const at = d.stamp();
    db().dealHistory.push({
      id: d.newId(), ownerId: u.id, dealId: row.id, fromStage: row.stage, toStage: to.kind, fromStageId: row.stageId, toStageId: to.id,
      fromStageName: from?.name ?? null, toStageName: to.name, changedAt: at,
    });
    const closes = to.kind !== 'open';
    Object.assign(row, {
      stageId: to.id, stage: to.kind, closedAt: closes ? at : null,
      lostReason: to.kind === 'lost' ? lostReason : null, version: row.version + 1, updatedAt: at,
    });
    // +50 XP ao ganhar; reabrir e ganhar de novo a mesma oportunidade não repete (chave `deal-won:<id>`).
    const xp = to.kind === 'won' ? d.awardXp(u, 'deal_won', `deal-won:${row.id}`, at) : 0;
    const sale = commitSale ? commitSale(at) : null;
    return { status: 200, body: d.withXp({ ...dealDto(u, row), ...(sale ? { sale: finance.fullSale(u, sale) } : {}) }, xp) };
  }

  function dealHistory(id, searchParams) {
    const u = d.requireStudent();
    readQuery(searchParams, {}, {});
    const row = findDeal(u, id);
    const body = db().dealHistory
      .filter((h) => h.dealId === row.id && h.ownerId === u.id)
      .sort((a, b) => cmp(a.changedAt, b.changedAt) || cmp(a.id, b.id))
      .map((h) => ({ fromStageId: h.fromStageId, toStageId: h.toStageId, fromStageName: h.fromStageName, toStageName: h.toStageName, fromStatus: h.fromStage, toStatus: h.toStage, changedAt: h.changedAt }));
    return { status: 200, body };
  }

  function removeDeals(ids) {
    finance.unlinkDeals(ids); // a venda fica, sem o vínculo (ON DELETE SET NULL)
    db().deals = db().deals.filter((x) => !ids.has(x.id));
    db().dealHistory = db().dealHistory.filter((h) => !ids.has(h.dealId)); // ON DELETE CASCADE
    db().tasks = db().tasks.map((t) => (ids.has(t.dealId) ? { ...t, dealId: null } : t)); // ON DELETE SET NULL
  }

  function deleteDeal(id) {
    const u = d.requireStudent();
    removeDeals(new Set([findDeal(u, id).id]));
    return { status: 204 };
  }

  // ---------------------------------------------------------------- contatos (people)

  /** Estado comercial derivado (nunca gravado): cliente (ganhou ou tem venda ativa) > em negociação > perdido > lead. */
  function statusOf(deals, activeSale = false) {
    if (activeSale || deals.some((x) => x.stage === 'won')) return 'client';
    if (deals.some((x) => x.stage === 'open')) return 'negotiating';
    if (deals.length) return 'lost';
    return 'lead';
  }

  function contactDto(u, p) {
    const own = dealsOf(u).filter((x) => x.personId === p.id);
    const won = own.filter((x) => x.stage === 'won');
    const company = p.companyId ? db().companies.find((c) => c.id === p.companyId && c.ownerId === u.id) : null;
    const last = mine(db().activities, u).filter((a) => a.personId === p.id).reduce((m, a) => (m === null || a.occurredAt > m ? a.occurredAt : m), null);
    // Última atividade: a mais recente entre atividades, oportunidades criadas e mudanças de etapa (como o servidor).
    const ownIds = new Set(own.map((x) => x.id));
    const stamps = [
      last,
      ...own.map((x) => x.createdAt),
      ...db().dealHistory.filter((h) => h.ownerId === u.id && ownIds.has(h.dealId)).map((h) => h.changedAt),
    ].filter(Boolean);
    const lastActivityAt = stamps.length ? stamps.reduce((m, x) => (x > m ? x : m)) : null;
    return {
      id: p.id, name: p.name, phone: p.phone ?? null, whatsapp: p.whatsapp, instagram: p.instagram, email: p.email, source: p.source, tags: [...(p.tags ?? [])],
      notes: p.notes ?? null, responsible: p.responsible ?? null, temperature: p.temperature ?? 'warm', leadStatus: p.leadStatus ?? 'new',
      entryFunnelId: p.entryFunnelId ?? null, status: statusOf(own, finance.hasActiveSale(u, p.id)), dealsOpen: own.filter((x) => x.stage === 'open').length, dealsWon: won.length,
      wonTotal: money(won), ...finance.personTotals(u, p.id), campaignId: p.campaignId ?? null, campaignName: marketing.campaignName(u, p.campaignId), lastActivityAt, companyId: company?.id ?? null, companyName: company?.name ?? null,
      createdAt: p.createdAt, updatedAt: p.updatedAt, version: p.version,
    };
  }

  const PEOPLE_QUERY = {
    q: 'text',
    status: { enum: CONTACT_STATUSES, message: 'Estado inválido.' },
    leadStatus: { enum: LEAD_STATUSES, message: 'Situação inválida.' },
    source: { pattern: SOURCE_KEY, message: 'Origem inválida.' },
    funnelId: 'uuid',
    tag: 'text',
    responsible: 'text',
    temperature: { enum: TEMPERATURES, message: 'Temperatura inválida.' },
    sort: { enum: ['name', 'created_at', 'last_activity'] },
    order: { enum: ['asc', 'desc'] },
    limit: { int: [1, 100] },
    offset: { int: [0, 1_000_000] },
    companyId: 'uuid',
  };

  function listPeople(searchParams) {
    const u = d.requireStudent();
    const query = readQuery(searchParams, PEOPLE_QUERY, { sort: 'name', order: 'asc', limit: 20, offset: 0 });
    const order = query.order;
    let rows = mine(db().people, u).map((p) => contactDto(u, p));
    if (query.status) rows = rows.filter((c) => c.status === query.status);
    if (query.leadStatus) rows = rows.filter((c) => c.leadStatus === query.leadStatus);
    if (query.source) rows = rows.filter((c) => c.source === query.source);
    if (query.temperature) rows = rows.filter((c) => c.temperature === query.temperature);
    if (query.companyId) rows = rows.filter((c) => c.companyId === query.companyId);
    if (query.funnelId) {
      const inFunnel = new Set(dealsOf(u).filter((x) => x.funnelId === query.funnelId).map((x) => x.personId));
      rows = rows.filter((c) => c.entryFunnelId === query.funnelId || inFunnel.has(c.id));
    }
    if (query.tag) rows = rows.filter((c) => c.tags.includes(query.tag));
    if (query.responsible) rows = rows.filter((c) => (c.responsible ?? '').toLowerCase() === query.responsible.toLowerCase());
    if (query.q) {
      const text = fold(query.q);
      const digits = query.q.replace(/\D/g, '');
      rows = rows.filter(
        (c) =>
          fold(c.name).includes(text) ||
          fold(c.companyName ?? '').includes(text) ||
          (c.instagram ?? '').toLowerCase().includes(text) ||
          (c.email ?? '').toLowerCase().includes(text) ||
          (digits.length >= 3 && ((c.whatsapp ?? '').includes(digits) || (c.phone ?? '').includes(digits))),
      );
    }
    const keys = { name: (c) => c.name.toLowerCase(), created_at: (c) => c.createdAt, last_activity: (c) => c.lastActivityAt };
    rows = sortRows(rows, keys[query.sort], order, query.sort === 'name' ? { compare: byText } : { nullsLast: query.sort === 'last_activity' });
    return { status: 200, body: { rows: rows.slice(query.offset, query.offset + query.limit), total: rows.length } };
  }

  function peopleCounts(searchParams) {
    const u = d.requireStudent();
    readQuery(searchParams, {}, {});
    const statuses = mine(db().people, u).map((p) => statusOf(dealsOf(u).filter((x) => x.personId === p.id), finance.hasActiveSale(u, p.id)));
    return { status: 200, body: { total: statuses.length, ...Object.fromEntries(CONTACT_STATUSES.map((s) => [s, statuses.filter((x) => x === s).length])) } };
  }

  function findPerson(u, id) {
    const row = UUID.test(id) ? db().people.find((p) => p.id === id && p.ownerId === u.id) : null;
    if (!row) throw Errors.notFound('Contato não encontrado.');
    return row;
  }

  function getPerson(id) {
    const u = d.requireStudent();
    const p = findPerson(u, id);
    const deals = dealsOf(u)
      .filter((x) => x.personId === p.id)
      .sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id))
      .map((x) => dealDto(u, x));
    return { status: 200, body: { ...contactDto(u, p), deals, sales: finance.personSales(u, p.id) } };
  }

  function readContactField(normalize, value, field, issues) {
    if (value !== null && typeof value !== 'string') return void issues.add(field, 'Dados inválidos.');
    const result = normalize(value);
    if (!result.ok) return void issues.add(field, result.message ?? 'Valor inválido.');
    return result.value ?? null;
  }

  function readTags(value, issues) {
    if (!Array.isArray(value)) return void issues.add('tags', 'Informe as etiquetas em uma lista.');
    if (value.length > 10) return void issues.add('tags', 'Use no máximo 10 etiquetas.');
    const out = [];
    for (const tag of value) {
      if (typeof tag !== 'string' || tag.trim() === '') return void issues.add('tags', 'Etiqueta vazia.');
      if (tag.trim().length > 30) return void issues.add('tags', 'Etiqueta muito longa (máximo 30).');
      if (CONTROL_CHARS.test(tag.trim())) return void issues.add('tags', 'A etiqueta contém caracteres inválidos.');
      if (!out.includes(tag.trim())) out.push(tag.trim()); // a repetida é descartada, sem erro
    }
    return out;
  }

  // `companyId` continua aceito (Empresas ficam fora da navegação, mas o vínculo existe), como no servidor.
const CONTACT_FIELDS = ['name', 'phone', 'whatsapp', 'instagram', 'email', 'source', 'tags', 'notes', 'responsible', 'temperature', 'leadStatus', 'entryFunnelId', 'companyId', 'campaignId'];

  /** Campos de criação/edição do contato. `patch`: ausente continua ausente. */
  function readContactFields(u, b, issues, { patch, currentSource, currentCampaign = null }) {
    const out = {};
    // Campanha que trouxe o contato (Marketing): da aluna; arquivada só se já era a dele.
    if (b.campaignId !== undefined) out.campaignId = marketing.readCampaignRef(u, b.campaignId, issues, currentCampaign);
    if (b.name !== undefined || !patch) out.name = d.readName(b.name, 'Informe o nome.', issues);
    // Telefone: mesma normalização do WhatsApp (só dígitos, com DDI), como o servidor.
    for (const [field, normalize] of [['phone', normalizeWhatsapp], ['whatsapp', normalizeWhatsapp], ['instagram', normalizeInstagram], ['email', normalizeEmail]]) {
      if (b[field] !== undefined) out[field] = readContactField(normalize, b[field], field, issues);
    }
    if (b.source !== undefined) {
      if (!d.allowedSource(u, b.source, currentSource)) issues.add('source', 'Origem inválida.');
      else out.source = b.source;
    } else if (!patch) {
      out.source = 'other';
      if (!d.allowedSource(u, 'other')) issues.add('source', 'Origem inválida.');
    }
    if (b.tags !== undefined) out.tags = readTags(b.tags, issues);
    if (b.notes !== undefined) out.notes = readText(b.notes, 'notes', 2000, issues);
    if (b.responsible !== undefined) out.responsible = readLine(b.responsible, 'responsible', 80, issues);
    if (b.temperature !== undefined) out.temperature = readTemperature(b.temperature, issues);
    if (b.leadStatus !== undefined) {
      if (!LEAD_STATUSES.includes(b.leadStatus)) issues.add('leadStatus', 'Situação inválida.');
      else out.leadStatus = b.leadStatus;
    }
    if (b.entryFunnelId !== undefined) {
      if (b.entryFunnelId === null) out.entryFunnelId = null;
      else if (typeof b.entryFunnelId !== 'string' || !UUID.test(b.entryFunnelId) || !mine(db().funnels, u).some((f) => f.id === b.entryFunnelId)) issues.add('entryFunnelId', 'Funil não encontrado.');
      else out.entryFunnelId = b.entryFunnelId;
    }
    if (b.companyId !== undefined) {
      if (b.companyId === null) out.companyId = null;
      else if (typeof b.companyId !== 'string' || !UUID.test(b.companyId)) issues.add('companyId', 'Empresa inválida.');
      else if (!mine(db().companies, u).some((c) => c.id === b.companyId)) issues.add('companyId', 'Empresa não encontrada.');
      else out.companyId = b.companyId;
    }
    return out;
  }

  function duplicateWhatsapp(name) {
    const message = name ? `Já existe um contato com esse WhatsApp: ${name}.` : 'Já existe um contato com esse WhatsApp.';
    return Errors.conflict('duplicate_whatsapp', message, [{ field: 'whatsapp', message }]);
  }

  function createPerson(body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, CONTACT_FIELDS, issues);
    const fields = readContactFields(u, b, issues, { patch: false });
    issues.throwIfAny();
    if (fields.whatsapp) {
      const existing = mine(db().people, u).find((p) => p.whatsapp === fields.whatsapp);
      if (existing) throw duplicateWhatsapp(existing.name);
    }
    const at = d.stamp();
    const row = {
      id: d.newId(), ownerId: u.id, name: fields.name, phone: null, whatsapp: null, instagram: null, email: null, source: 'other', tags: [], notes: null,
      responsible: null, temperature: 'warm', leadStatus: 'new', entryFunnelId: null, companyId: null, campaignId: null, ...fields, createdAt: at, updatedAt: at, version: 1,
    };
    db().people.push(row);
    d.awardXp(u, 'person_created', `person:${row.id}`, at); // +5 XP (teto de 25 por dia)
    return { status: 201, body: contactDto(u, row) };
  }

  function patchPerson(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, [...CONTACT_FIELDS, 'version'], issues);
    const current = UUID.test(id) ? db().people.find((p) => p.id === id && p.ownerId === u.id) : null;
    const patch = readContactFields(u, b, issues, { patch: true, currentSource: current?.source, currentCampaign: current?.campaignId ?? null });
    const version = readVersion(b.version, issues);
    if (!CONTACT_FIELDS.some((k) => b[k] !== undefined)) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    const row = findPerson(u, id);
    if (patch.whatsapp) {
      const existing = mine(db().people, u).find((p) => p.whatsapp === patch.whatsapp && p.id !== row.id);
      if (existing) throw duplicateWhatsapp(existing.name);
    }
    if (row.version !== version) throw Errors.conflict('version_conflict', CONTACT_CONFLICT);
    Object.assign(row, patch, { version: row.version + 1, updatedAt: d.stamp() });
    return { status: 200, body: contactDto(u, row) };
  }

  function deletePerson(id) {
    const u = d.requireStudent();
    const row = findPerson(u, id);
    // O histórico financeiro fica: contato com venda não pode ser apagado (FK RESTRICT no banco).
    finance.assertNoSales(u, row.id);
    removeDeals(new Set(dealsOf(u).filter((x) => x.personId === row.id).map((x) => x.id))); // ON DELETE CASCADE
    db().people = db().people.filter((p) => p.id !== row.id);
    db().activities = db().activities.filter((a) => a.personId !== row.id); // a linha do tempo vai junto
    db().tasks = db().tasks.map((t) => (t.personId === row.id ? { ...t, personId: null } : t)); // ON DELETE SET NULL
    return { status: 204 };
  }

  // ---------------------------------------------------------------- linha do tempo e atividades

  const activityDto = (a) => ({ id: a.id, personId: a.personId, kind: a.kind, body: a.body, occurredAt: a.occurredAt, createdAt: a.createdAt });

  function timeline(id, searchParams) {
    const u = d.requireStudent();
    readQuery(searchParams, {}, {});
    const p = findPerson(u, id);
    const deals = dealsOf(u).filter((x) => x.personId === p.id);
    const dealIds = new Set(deals.map((x) => x.id));
    const funnelName = (x) => db().funnels.find((f) => f.id === x.funnelId)?.name ?? '';
    const items = [
      ...mine(db().activities, u).filter((a) => a.personId === p.id).map((a) => ({ type: 'activity', at: a.occurredAt, id: a.id, kind: a.kind, body: a.body })),
      ...deals.map((x) => ({ type: 'deal', at: x.createdAt, id: x.id, dealId: x.id, funnelName: funnelName(x), value: x.value })),
      ...db().dealHistory
        .filter((h) => h.ownerId === u.id && dealIds.has(h.dealId))
        .map((h) => ({ type: 'stage', at: h.changedAt, id: h.id, dealId: h.dealId, funnelName: funnelName(deals.find((x) => x.id === h.dealId)), fromStageName: h.fromStageName, toStageName: h.toStageName })),
    ];
    items.sort((a, b) => cmp(b.at, a.at) || cmp(a.id, b.id));
    return { status: 200, body: { items: items.slice(0, 100) } };
  }

  function listPersonActivities(id, searchParams) {
    const u = d.requireStudent();
    const query = readQuery(searchParams, { limit: { int: [1, 100] } }, { limit: 50 });
    const p = findPerson(u, id);
    const items = mine(db().activities, u)
      .filter((a) => a.personId === p.id)
      .sort((a, b) => cmp(b.occurredAt, a.occurredAt) || cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id))
      .slice(0, query.limit)
      .map(activityDto);
    return { status: 200, body: { items } };
  }

  function createActivity(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['kind', 'body', 'occurredAt'], issues);
    if (!ACTIVITY_KINDS.includes(b.kind)) issues.add('kind', 'Tipo de atividade inválido.');
    let text;
    if (typeof b.body !== 'string' || b.body.trim() === '') issues.add('body', 'Descreva a atividade.');
    else if (b.body.trim().length > 1000) issues.add('body', 'Texto muito longo (máximo 1000).');
    else if (MULTILINE_CONTROL_CHARS.test(b.body.trim())) issues.add('body', 'O texto contém caracteres inválidos.');
    else text = b.body.trim();
    let occurredAt;
    if (b.occurredAt !== undefined) {
      occurredAt = d.readInstant(b.occurredAt, 'occurredAt', 'Informe uma data válida.', issues);
      if (occurredAt && Date.parse(occurredAt) > d.clock().getTime() + 5 * MINUTE) issues.add('occurredAt', 'A data da atividade não pode estar no futuro.');
    }
    issues.throwIfAny();
    const p = findPerson(u, id);
    const at = d.stamp();
    const row = { id: d.newId(), ownerId: u.id, personId: p.id, kind: b.kind, body: text, occurredAt: occurredAt ?? at, createdAt: at };
    db().activities.push(row);
    d.awardXp(u, 'lead_activity', `lead-activity:${row.id}`, at); // +3 XP (teto de 15 por dia), sem aviso na tela
    return { status: 201, body: activityDto(row) };
  }

  function deleteActivity(id, activityId) {
    const u = d.requireStudent();
    const p = findPerson(u, id);
    const row = UUID.test(activityId) ? db().activities.find((a) => a.id === activityId && a.personId === p.id && a.ownerId === u.id) : null;
    if (!row) throw Errors.notFound('Atividade não encontrada.');
    db().activities = db().activities.filter((a) => a.id !== row.id);
    return { status: 204 };
  }

  function recentActivities(searchParams) {
    const u = d.requireStudent();
    const query = readQuery(searchParams, { limit: { int: [1, 100] } }, { limit: 20 });
    const names = new Map(mine(db().people, u).map((p) => [p.id, p.name]));
    const items = mine(db().activities, u)
      .filter((a) => names.has(a.personId))
      .sort((a, b) => cmp(b.occurredAt, a.occurredAt) || cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id))
      .slice(0, query.limit)
      .map((a) => ({ id: a.id, personId: a.personId, personName: names.get(a.personId), kind: a.kind, body: a.body, occurredAt: a.occurredAt }));
    return { status: 200, body: { items } };
  }

  // ---------------------------------------------------------------- visão geral (aluna) e números para a mentora

  /** Período civil corrente INTEIRO em Brasília (mês, trimestre ou ano); `to` é o último dia incluído. `start`/`end` em ms (fim exclusivo). */
  function periodWindow(period) {
    const local = new Date(d.clock().getTime() - BRT_OFFSET * MINUTE);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const firstMonth = period === 'year' ? 0 : period === 'quarter' ? m - (m % 3) : m;
    const months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
    const first = Date.UTC(y, firstMonth, 1);
    const endExclusive = Date.UTC(y, firstMonth + months, 1);
    const from = new Date(first).toISOString().slice(0, 10);
    const to = new Date(endExclusive - DAY).toISOString().slice(0, 10);
    return { from, to, start: first + BRT_OFFSET * MINUTE, end: endExclusive + BRT_OFFSET * MINUTE };
  }

  /** Janela de dias `{ from, to }` (inclusive) em instantes de Brasília (`start`/`end` em ms, fim exclusivo), como monthWindow. */
  const rangeWindow = ({ from, to }) => ({ from, to, start: dayStart(from), end: dayStart(to) + DAY });

  /** Números de uma aluna na janela `w` (mesma conta para a visão geral dela e para a mentora). */
  function commercialNumbers(u, w) {
    const inside = (iso) => iso != null && Date.parse(iso) >= w.start && Date.parse(iso) < w.end;
    const people = mine(db().people, u);
    const ids = new Set(people.map((p) => p.id));
    const deals = dealsOf(u).filter((x) => ids.has(x.personId));
    const open = deals.filter((x) => x.stage === 'open');
    const won = deals.filter((x) => x.stage === 'won' && inside(x.closedAt));
    const lost = deals.filter((x) => x.stage === 'lost' && inside(x.closedAt));
    const byFunnel = funnelsOf(u)
      .map((f) => {
        const mineF = (rows) => rows.filter((x) => x.funnelId === f.id);
        return { f, open: mineF(open), won: mineF(won), lost: mineF(lost) };
      })
      .filter((x) => x.f.active || x.open.length + x.won.length + x.lost.length > 0);
    return { w, people, deals, open, won, lost, byFunnel, inside };
  }

  const PERIOD_QUERY = { period: { enum: PERIODS, message: 'Período inválido.' } };

  /** Etapas do funil na ordem (Entrega 7): abertas = oportunidades que estão nelas agora; ganha/perdida = fechadas na janela. */
  function stageRows(f, n) {
    return stagesOf(f.id).map((s) => {
      const rows = n.deals.filter((x) => x.funnelId === f.id && x.stageId === s.id && (s.kind === 'open' || n.inside(x.closedAt)));
      return { stageId: s.id, name: s.name, kind: s.kind, count: rows.length, total: money(rows) };
    });
  }

  function overview(searchParams) {
    const u = d.requireStudent();
    // Entrega 7: período corrente ou um mês específico AAAA-MM (o formato fino é conferido em overviewQueryProblem).
    const query = readQuery(searchParams, { ...PERIOD_QUERY, month: { pattern: /^.*$/ } }, {});
    const today = todayInBrasilia(d.clock());
    const problem = overviewQueryProblem(query, today);
    if (problem) throw Errors.validation([problem]);
    ensureFunnels(u);
    const n = commercialNumbers(u, rangeWindow(overviewRange(query, today)));
    const reasons = new Map();
    for (const x of n.lost) {
      const reason = x.lostReason?.trim() || 'Sem motivo';
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    const labels = new Map(d.leadSources(u).map((s) => [s.key, s.label]));
    const sources = new Map();
    for (const p of n.people) if (n.inside(p.createdAt)) sources.set(p.source, (sources.get(p.source) ?? 0) + 1);
    const statuses = n.people.map((p) => statusOf(n.deals.filter((x) => x.personId === p.id), finance.hasActiveSale(u, p.id)));
    return {
      status: 200,
      body: {
        period: { from: n.w.from, to: n.w.to },
        newContacts: n.people.filter((p) => n.inside(p.createdAt)).length,
        byStatus: Object.fromEntries(CONTACT_STATUSES.map((s) => [s, statuses.filter((x) => x === s).length])),
        open: { count: n.open.length, total: money(n.open), weighted: fromCents(weightedCents(n.open)) },
        won: { count: n.won.length, total: money(n.won) },
        lost: { count: n.lost.length, total: money(n.lost) },
        conversionRate: conversionRate(n.won.length, n.lost.length),
        avgDaysToClose: avgDaysToClose(n.won),
        byFunnel: n.byFunnel.map((x) => ({
          funnelId: x.f.id, key: x.f.key, name: x.f.name, open: x.open.length, won: x.won.length, lost: x.lost.length, wonTotal: money(x.won),
          conversionRate: conversionRate(x.won.length, x.lost.length),
          stages: stageRows(x.f, n),
        })),
        // Entrega 7: motivos das perdidas na janela e contatos novos por origem (rótulo da lista de origens da aluna; fora dela = a chave).
        lostReasons: [...reasons.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'pt-BR')),
        bySource: [...sources.entries()]
          .map(([source, count]) => ({ source, label: labels.get(source) ?? source, count }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR') || cmp(a.source, b.source)),
      },
    };
  }

  /** Para a mentora (e a equipe com `business.view`): só números da aluna, nunca nomes, contatos nem etapas com nome de cliente. */
  function mentoraCommercial(id, searchParams) {
    d.requireAuth('admin');
    const { period } = readQuery(searchParams, PERIOD_QUERY, { period: 'month' });
    const student = UUID.test(id) ? db().users.find((x) => x.id === id && x.role === 'user') : null;
    if (!student) throw Errors.notFound('Aluna não encontrada.');
    return { status: 200, body: mentoraBody(student, period) };
  }

  /** Corpo de GET /mentora/students/:id/commercial (também usado, por aluna, em GET /mentora/business). */
  function mentoraBody(student, period) {
    const n = commercialNumbers(student, periodWindow(period));
    return {
      period: { from: n.w.from, to: n.w.to },
      newContacts: n.people.filter((p) => n.inside(p.createdAt)).length,
      open: { count: n.open.length, total: money(n.open) },
      won: { count: n.won.length, total: money(n.won) },
      lost: { count: n.lost.length },
      conversionRate: conversionRate(n.won.length, n.lost.length),
      // Nome PADRÃO do funil pela chave (nunca o texto que a aluna digitou ao renomear): a mentora não recebe texto livre da aluna.
      byFunnel: n.byFunnel.map((x) => ({ name: STANDARD_NAMES.get(x.f.key) ?? 'Outro funil', open: x.open.length, won: x.won.length, lost: x.lost.length })),
    };
  }

  const SEG = '([^/]+)';
  return {
    routes: [
      ['GET', /^funnels$/, (_m, q) => listFunnels(q)],
      ['PATCH', new RegExp(`^funnels/${SEG}$`), (m, _q, body) => patchFunnel(m[1], body)],
      ['PUT', new RegExp(`^funnels/${SEG}/stages$`), (m, _q, body) => putStages(m[1], body)],

      ['GET', /^deals$/, (_m, q) => listDeals(q)],
      ['POST', /^deals$/, (_m, _q, body) => createDeal(body)],
      ['GET', /^deals\/summary$/, (_m, q) => dealsSummary(q)],
      ['GET', new RegExp(`^deals/${SEG}$`), (m, q) => {
        readQuery(q, {}, {});
        return getDeal(m[1]);
      }],
      ['PATCH', new RegExp(`^deals/${SEG}$`), (m, _q, body) => patchDeal(m[1], body)],
      ['DELETE', new RegExp(`^deals/${SEG}$`), (m) => deleteDeal(m[1])],
      ['POST', new RegExp(`^deals/${SEG}/stage-transitions$`), (m, _q, body) => transitionDeal(m[1], body)],
      ['GET', new RegExp(`^deals/${SEG}/history$`), (m, q) => dealHistory(m[1], q)],

      ['GET', /^people$/, (_m, q) => listPeople(q)],
      ['POST', /^people$/, (_m, _q, body) => createPerson(body)],
      ['GET', /^people\/counts$/, (_m, q) => peopleCounts(q)],
      ['GET', new RegExp(`^people/${SEG}$`), (m, q) => {
        readQuery(q, {}, {});
        return getPerson(m[1]);
      }],
      ['PATCH', new RegExp(`^people/${SEG}$`), (m, _q, body) => patchPerson(m[1], body)],
      ['DELETE', new RegExp(`^people/${SEG}$`), (m) => deletePerson(m[1])],
      ['GET', new RegExp(`^people/${SEG}/timeline$`), (m, q) => timeline(m[1], q)],
      ['GET', new RegExp(`^people/${SEG}/activities$`), (m, q) => listPersonActivities(m[1], q)],
      ['POST', new RegExp(`^people/${SEG}/activities$`), (m, _q, body) => createActivity(m[1], body)],
      ['DELETE', new RegExp(`^people/${SEG}/activities/${SEG}$`), (m) => deleteActivity(m[1], m[2])],

      ['GET', /^activities$/, (_m, q) => recentActivities(q)],
      ['GET', /^commercial\/overview$/, (_m, q) => overview(q)],
      ['GET', new RegExp(`^mentora/students/${SEG}/commercial$`), (m, q) => mentoraCommercial(m[1], q)],
    ],
    statusOf,
    mentoraBody,
  };
}
