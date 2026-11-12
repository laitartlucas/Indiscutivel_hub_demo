// Financeiro da demonstração (Entrega 3): vendas (contratos), parcelas com entrada opcional, pagamentos com idempotência,
// estornos, cancelamento, renegociação, contas a receber, visão financeira e os números financeiros por aluna para a mentora.
// Mesmo contrato e mesmos códigos de erro do servidor (docs/superpowers/specs/2026-11-05-entrega-3-financeiro.md,
// server/src/routes/sales.ts e server/src/repositories/sales.ts), sobre o estado em memória. O dinheiro é calculado só em
// finance-data.js (espelho de server/src/domain/finance.ts): nada derivado é gravado.
import {
  buildSalePlan, FINANCIAL_STATUSES, periodRange, fromCents, installmentRemainingCents, installmentStatus, isUpcoming, MAX_PLAN_INSTALLMENTS, PAYMENT_METHODS, refundableCents,
  renegotiationPlan, SALE_MODES, summarizeSale, toCents, todayInBrasilia,
} from './finance-data.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,80}$/;
const PERIODS = ['month', 'quarter', 'year'];
const SALE_CONFLICT = 'Esta venda foi alterada em outra aba ou outro dispositivo. Recarregue e tente de novo.';
const SALE_FIELDS = ['productId', 'description', 'originalValue', 'discount', 'closedOn', 'paymentMethod', 'mode', 'notes', 'receivedNow', 'downPayment', 'plan'];

export function createFinanceDemo(d) {
  const { Errors, createIssues, requireBody, readVersion, readQuery, fold, isPlainObject, UUID, CONTROL_CHARS, MULTILINE_CONTROL_CHARS } = d;
  const db = () => d.getDb();
  const table = (name) => (db()[name] ??= []);
  const mine = (list, u) => list.filter((row) => row.ownerId === u.id);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const today = () => todayInBrasilia(d.clock());
  const money = (cents) => fromCents(cents);

  const FinanceErrors = {
    saleCancelled: () => Errors.conflict('sale_cancelled', 'Esta venda está cancelada.'),
    dealHasSale: () => Errors.conflict('deal_has_sale', 'Esta oportunidade já tem uma venda registrada.'),
    overpayment: (remaining) => Errors.conflict('overpayment', `O pagamento passa do que falta nesta parcela (R$ ${remaining}).`),
    refundTooLarge: (refundable) => Errors.conflict('refund_exceeds_payment', `O estorno passa do que resta deste pagamento (R$ ${refundable}).`),
    idempotencyConflict: () => Errors.conflict('idempotency_conflict', 'Esta chave de lançamento já foi usada em outro lançamento.'),
    finalBelowReceived: (received) => Errors.conflict('final_below_received', `O valor final não pode ficar abaixo do que já foi recebido (R$ ${received}).`),
    versionConflict: () => Errors.conflict('version_conflict', SALE_CONFLICT),
    hasSales: () => Errors.conflict('has_sales', 'Este contato tem vendas registradas e não pode ser apagado.'),
  };
  const fieldError = (field, message) => Errors.validation([{ field, message }]);

  // ---------------------------------------------------------------- leitura dos campos (mesmas regras dos esquemas do servidor)

  /** Campos permitidos (objeto estrito); o erro aponta o objeto (`field`). */
  function onlyKeys(obj, allowed, issues, field = '') {
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) issues.add(field, `Campo não permitido: ${key}.`);
  }

  const isCalendarDate = (s) =>
    typeof s === 'string' && DATE.test(s) && Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2100 && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

  function readDate(value, field, issues) {
    if (!isCalendarDate(value)) return void issues.add(field, 'Informe uma data válida.');
    return value;
  }

  /** R$ como texto decimal ("1500" ou "1500.50"); `positive` exige mais que zero. Devolve o texto canônico ("1500.00"). */
  function readMoney(value, field, issues, { positive = false } = {}) {
    if (typeof value !== 'string' || !MONEY.test(value)) return void issues.add(field, 'Informe um valor válido, como 1500 ou 1500.50.');
    if (positive && toCents(value) <= 0) return void issues.add(field, 'Informe um valor maior que zero.');
    return fromCents(toCents(value));
  }

  function readUuid(value, field, issues) {
    if (typeof value !== 'string' || !UUID.test(value)) return void issues.add(field, 'Identificador inválido.');
    return value;
  }

  function readLine(value, field, max, issues, required, invalid = 'O texto contém caracteres inválidos.') {
    if (typeof value !== 'string' || value.trim() === '') return void issues.add(field, required);
    const s = value.trim();
    if (s.length > max) return void issues.add(field, `Texto muito longo (máximo ${max}).`);
    if (CONTROL_CHARS.test(s)) return void issues.add(field, invalid);
    return s;
  }

  /** Texto opcional (null limpa; vazio = null). `multiline` aceita quebras de linha. */
  function readOptionalText(value, field, max, issues, multiline) {
    if (value === null) return null;
    if (typeof value !== 'string') return void issues.add(field, 'Dados inválidos.');
    const s = value.trim();
    if (s.length > max) return void issues.add(field, `Texto muito longo (máximo ${max}).`);
    if ((multiline ? MULTILINE_CONTROL_CHARS : CONTROL_CHARS).test(s)) return void issues.add(field, 'O texto contém caracteres inválidos.');
    return s === '' ? null : s;
  }

  function readMethod(value, field, issues) {
    if (!PAYMENT_METHODS.includes(value)) return void issues.add(field, 'Forma de pagamento inválida.');
    return value;
  }

  function readKey(value, issues) {
    if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) return void issues.add('idempotencyKey', 'Chave de lançamento inválida.');
    return value;
  }

  function readBoolean(value, field, issues) {
    if (typeof value !== 'boolean') return void issues.add(field, 'Dados inválidos.');
    return value;
  }

  /** Plano: `{ count, firstDueOn }` (1 a 60) ou `{ items: [{ dueOn, amount }] }` (de `minItems` a 60). */
  function readPlan(value, field, issues, minItems) {
    const invalid = 'Informe o plano: quantidade e primeiro vencimento, ou a lista de parcelas.';
    if (!isPlainObject(value)) return void issues.add(field, invalid);
    if ('items' in value) {
      onlyKeys(value, ['items'], issues, field);
      if (!Array.isArray(value.items)) return void issues.add(`${field}.items`, invalid);
      if (value.items.length < minItems) return void issues.add(`${field}.items`, 'Informe ao menos uma parcela.');
      if (value.items.length > MAX_PLAN_INSTALLMENTS) return void issues.add(`${field}.items`, `No máximo ${MAX_PLAN_INSTALLMENTS} parcelas.`);
      let ok = true;
      const items = value.items.map((item, i) => {
        const at = `${field}.items.${i}`;
        if (!isPlainObject(item)) {
          ok = false;
          return void issues.add(at, 'Dados inválidos.');
        }
        onlyKeys(item, ['dueOn', 'amount'], issues, at);
        const dueOn = readDate(item.dueOn, `${at}.dueOn`, issues);
        const amount = readMoney(item.amount, `${at}.amount`, issues, { positive: true });
        if (dueOn === undefined || amount === undefined) ok = false;
        return { dueOn, amount };
      });
      return ok ? { items } : undefined;
    }
    if (!('count' in value)) return void issues.add(field, invalid);
    onlyKeys(value, ['count', 'firstDueOn'], issues, field);
    let count;
    if (!Number.isInteger(value.count)) issues.add(`${field}.count`, 'Dados inválidos.');
    else if (value.count < 1) issues.add(`${field}.count`, 'Informe ao menos 1 parcela.');
    else if (value.count > MAX_PLAN_INSTALLMENTS) issues.add(`${field}.count`, `No máximo ${MAX_PLAN_INSTALLMENTS} parcelas.`);
    else count = value.count;
    const firstDueOn = readDate(value.firstDueOn, `${field}.firstDueOn`, issues);
    return count !== undefined && firstDueOn !== undefined ? { count, firstDueOn } : undefined;
  }

  /**
   * Corpo da venda sem contato nem oportunidade (o `sale` da mudança de etapa) + as regras entre campos (o modo decide o que
   * vale), como `saleFieldsSchema` + `checkSaleFields` do servidor. `p` prefixa os campos nos erros ("sale.").
   */
  function readSaleFields(b, issues, p = '') {
    const out = {};
    if (b.productId !== undefined) out.productId = b.productId === null ? null : readUuid(b.productId, `${p}productId`, issues);
    out.description = readLine(b.description, `${p}description`, 120, issues, 'Descreva a venda.', 'A descrição contém caracteres inválidos.');
    out.originalValue = readMoney(b.originalValue, `${p}originalValue`, issues);
    if (b.discount !== undefined) out.discount = readMoney(b.discount, `${p}discount`, issues);
    out.closedOn = readDate(b.closedOn, `${p}closedOn`, issues);
    out.paymentMethod = readMethod(b.paymentMethod, `${p}paymentMethod`, issues);
    out.mode = SALE_MODES.includes(b.mode) ? b.mode : void issues.add(`${p}mode`, 'Modo inválido.');
    if (b.notes !== undefined) out.notes = readOptionalText(b.notes, `${p}notes`, 1000, issues, true);
    if (b.receivedNow !== undefined) out.receivedNow = readBoolean(b.receivedNow, `${p}receivedNow`, issues);
    if (b.downPayment !== undefined) {
      if (!isPlainObject(b.downPayment)) issues.add(`${p}downPayment`, 'Dados inválidos.');
      else {
        onlyKeys(b.downPayment, ['amount', 'dueOn', 'receivedNow'], issues, `${p}downPayment`);
        out.downPayment = {
          amount: readMoney(b.downPayment.amount, `${p}downPayment.amount`, issues, { positive: true }),
          dueOn: readDate(b.downPayment.dueOn, `${p}downPayment.dueOn`, issues),
          ...(b.downPayment.receivedNow !== undefined ? { receivedNow: readBoolean(b.downPayment.receivedNow, `${p}downPayment.receivedNow`, issues) } : {}),
        };
      }
    }
    if (b.plan !== undefined) out.plan = readPlan(b.plan, `${p}plan`, issues, 1);
    if (b.mode === 'simple') {
      if (b.plan !== undefined) issues.add(`${p}plan`, 'No modo simples não há plano de parcelas.');
      if (b.downPayment !== undefined) issues.add(`${p}downPayment`, 'No modo simples não há entrada.');
    } else if (b.mode === 'installments') {
      if (b.plan === undefined) issues.add(`${p}plan`, 'Informe as parcelas.');
      if (b.receivedNow !== undefined) issues.add(`${p}receivedNow`, '"Já recebido" vale só no modo simples (no parcelado, use a entrada).');
    }
    if (out.discount !== undefined && out.originalValue !== undefined && toCents(out.discount) > toCents(out.originalValue)) {
      issues.add(`${p}discount`, 'O desconto não pode passar do valor da venda.');
    }
    return out;
  }

  // ---------------------------------------------------------------- números da venda (sempre calculados)

  const currentInstallments = (sale) => table('installments').filter((i) => i.saleId === sale.id && i.supersededAt == null);
  const paymentsOf = (sale) => table('payments').filter((p) => p.saleId === sale.id);
  const finalValueOf = (sale) => money(toCents(sale.originalValue) - toCents(sale.discount));
  const paidOf = (installmentId) => money(table('payments').filter((p) => p.installmentId === installmentId).reduce((t, p) => t + toCents(p.amount), 0));
  const receivedOf = (sale) => money(paymentsOf(sale).reduce((t, p) => t + toCents(p.amount), 0));

  /** Parcelas vigentes com o pago líquido de cada uma, por número. */
  const installmentsWithPaid = (sale) =>
    currentInstallments(sale)
      .map((i) => ({ id: i.id, number: i.number, dueOn: i.dueOn, amount: i.amount, paid: paidOf(i.id) }))
      .sort((a, b) => a.number - b.number);

  const summary = (sale, at = today()) => summarizeSale({ finalValue: finalValueOf(sale), status: sale.status, received: receivedOf(sale), installments: installmentsWithPaid(sale) }, at);
  const personName = (u, id) => db().people.find((p) => p.id === id && p.ownerId === u.id)?.name ?? '';

  function saleDto(u, sale, s = summary(sale)) {
    const product = sale.productId ? db().products.find((p) => p.id === sale.productId && p.ownerId === u.id) : null;
    return {
      id: sale.id, personId: sale.personId, personName: personName(u, sale.personId), dealId: sale.dealId, productId: sale.productId, productName: product?.name ?? null,
      description: sale.description, originalValue: sale.originalValue, discount: sale.discount, finalValue: finalValueOf(sale), closedOn: sale.closedOn,
      paymentMethod: sale.paymentMethod, mode: sale.mode, notes: sale.notes, status: sale.status, financialStatus: s.financialStatus,
      received: s.received, pending: s.pending, overdue: s.overdue, nextDueOn: s.nextDueOn, installmentsCount: s.installmentsCount, paidInstallments: s.paidInstallments,
      cancelledAt: sale.cancelledAt, cancelReason: sale.cancelReason, createdAt: sale.createdAt, updatedAt: sale.updatedAt, version: sale.version,
    };
  }

  function paymentDto(p, all) {
    const refunded = all.filter((x) => x.refundOf === p.id).reduce((t, x) => t - toCents(x.amount), 0);
    return {
      id: p.id, installmentId: p.installmentId, installmentNumber: table('installments').find((i) => i.id === p.installmentId)?.number ?? null, amount: p.amount,
      paidOn: p.paidOn, method: p.method, refundOf: p.refundOf, refundedTotal: money(refunded), note: p.note, createdAt: p.createdAt,
    };
  }

  /** Venda completa: parcelas vigentes (por número), pagamentos e estornos (em ordem de lançamento) e eventos. */
  function fullSale(u, sale) {
    const s = summary(sale);
    const payments = paymentsOf(sale);
    return {
      ...saleDto(u, sale, s),
      installments: s.installments.map((i) => ({ id: i.id, number: i.number, dueOn: i.dueOn, amount: i.amount, paid: i.paid, remaining: i.remaining, status: i.status })),
      payments: [...payments].sort((a, b) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id)).map((p) => paymentDto(p, payments)),
      events: table('saleEvents')
        .filter((e) => e.saleId === sale.id)
        .sort((a, b) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id))
        .map((e) => ({ id: e.id, kind: e.kind, detail: e.detail, createdAt: e.createdAt })),
    };
  }

  const salesOf = (u) => mine(table('sales'), u);

  function findSale(u, id) {
    const row = UUID.test(id) ? table('sales').find((s) => s.id === id && s.ownerId === u.id) : null;
    if (!row) throw Errors.notFound('Venda não encontrada.');
    return row;
  }

  function addEvent(u, sale, kind, detail, at) {
    table('saleEvents').push({ id: d.newId(), ownerId: u.id, saleId: sale.id, kind, detail, createdAt: at });
  }

  const touch = (sale, at) => Object.assign(sale, { version: sale.version + 1, updatedAt: at });

  function insertPayment(u, sale, p, at) {
    const row = { id: d.newId(), ownerId: u.id, saleId: sale.id, installmentId: p.installmentId, amount: money(p.cents), paidOn: p.paidOn, method: p.method, refundOf: p.refundOf, note: p.note, idempotencyKey: p.key, createdAt: at };
    table('payments').push(row);
    return row;
  }

  // ---------------------------------------------------------------- criar venda (avulsa ou ao ganhar a oportunidade)

  /**
   * Confere as referências e o plano de uma venda já lida e devolve `commit()`, que grava tudo sem poder falhar: assim ganhar
   * a oportunidade e registrar a venda acontecem juntos (nada é gravado se a venda for recusada), como a transação do servidor.
   * `winning`: a oportunidade está sendo ganha agora (a transição grava depois desta conferência).
   */
  function prepareSale(u, input) {
    if (!mine(db().people, u).some((p) => p.id === input.personId)) throw fieldError('personId', 'Contato não encontrado.');
    if (input.dealId) {
      const deal = mine(db().deals, u).find((x) => x.id === input.dealId);
      if (!deal) throw fieldError('dealId', 'Oportunidade não encontrada.');
      if (deal.personId !== input.personId) throw fieldError('dealId', 'A oportunidade é de outro contato.');
      if (deal.stage !== 'won' && !input.winning) throw fieldError('dealId', 'A oportunidade precisa estar ganha para registrar a venda.');
      if (table('sales').some((s) => s.ownerId === u.id && s.dealId === input.dealId)) throw FinanceErrors.dealHasSale();
    }
    if (input.productId && !mine(db().products, u).some((p) => p.id === input.productId)) throw fieldError('productId', 'Produto não encontrado.');
    const original = toCents(input.originalValue);
    const discount = toCents(input.discount ?? '0');
    if (discount > original) throw fieldError('discount', 'O desconto não pode passar do valor da venda.');
    const finalValue = money(original - discount);
    const plan = buildSalePlan({ finalValue, closedOn: input.closedOn, mode: input.mode, downPayment: input.downPayment ?? null, plan: input.plan ?? null });
    if (!plan.ok) throw Errors.validation(plan.errors);

    return function commit(at = d.stamp()) {
      const sale = {
        id: d.newId(), ownerId: u.id, personId: input.personId, dealId: input.dealId ?? null, productId: input.productId ?? null, description: input.description,
        originalValue: money(original), discount: money(discount), closedOn: input.closedOn, paymentMethod: input.paymentMethod, mode: input.mode, notes: input.notes ?? null,
        status: 'active', cancelledAt: null, cancelReason: null, version: 1, createdAt: at, updatedAt: at,
      };
      table('sales').push(sale);
      const ids = new Map();
      for (const item of plan.items) {
        const row = { id: d.newId(), ownerId: u.id, saleId: sale.id, number: item.number, dueOn: item.dueOn, amount: item.amount, supersededAt: null, createdAt: at };
        table('installments').push(row);
        ids.set(item.number, row.id);
      }
      addEvent(u, sale, 'created', { finalValue, mode: input.mode, installments: plan.items.length, ...(input.dealId ? { dealId: input.dealId } : {}) }, at);
      // "Já recebido": a parcela única (simples) ou a entrada, paga na data da venda pelo meio de pagamento da venda.
      const receivedNow =
        input.mode === 'simple' && input.receivedNow ? plan.items.find((i) => i.number === 1) : input.downPayment?.receivedNow ? plan.items.find((i) => i.number === 0) : undefined;
      if (receivedNow) {
        // Nunca no futuro: a data da venda (ou o vencimento da entrada), limitada a hoje.
        const due = input.mode === 'simple' ? input.closedOn : receivedNow.dueOn;
        const now = today();
        const paidOn = due < now ? due : now;
        const payment = insertPayment(u, sale, { installmentId: ids.get(receivedNow.number), cents: toCents(receivedNow.amount), paidOn, method: input.paymentMethod, note: null, key: `auto-${d.newId()}`, refundOf: null }, at);
        addEvent(u, sale, 'payment', { paymentId: payment.id, installmentNumber: receivedNow.number, amount: receivedNow.amount, paidOn }, at);
      }
      return sale;
    };
  }

  function createSale(body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['personId', 'dealId', ...SALE_FIELDS], issues);
    const personId = readUuid(b.personId, 'personId', issues);
    const dealId = b.dealId === undefined || b.dealId === null ? null : readUuid(b.dealId, 'dealId', issues);
    const fields = readSaleFields(b, issues);
    issues.throwIfAny();
    const sale = prepareSale(u, { ...fields, personId, dealId })();
    return { status: 201, body: fullSale(u, sale) };
  }

  /**
   * Corpo `sale` da mudança de etapa: lido (com o prefixo "sale.") antes de tudo, como o esquema da rota do servidor. Devolve
   * `prepare(u, deal, toKind)`, chamado depois das conferências da transição e ANTES de mexer na oportunidade.
   */
  function readSaleForDeal(value) {
    const issues = createIssues();
    let fields;
    if (!isPlainObject(value)) issues.add('sale', 'Dados inválidos.');
    else {
      onlyKeys(value, SALE_FIELDS, issues, 'sale');
      fields = readSaleFields(value, issues, 'sale.');
    }
    issues.throwIfAny();
    return (u, deal, toKind) => {
      if (toKind !== 'won') throw fieldError('sale', 'A venda só pode ser registrada ao ganhar a oportunidade.');
      return prepareSale(u, { ...fields, personId: deal.personId, dealId: deal.id, winning: true });
    };
  }

  // ---------------------------------------------------------------- listar, detalhar e editar

  const DATE_RULE = { pattern: DATE, message: 'Informe uma data válida.' };
  const SALES_QUERY = {
    q: 'text',
    personId: 'uuid',
    financialStatus: { enum: FINANCIAL_STATUSES, message: 'Situação inválida.' },
    from: DATE_RULE,
    to: DATE_RULE,
    sort: { enum: ['closed_on', 'final_value', 'next_due'] },
    order: { enum: ['asc', 'desc'] },
    limit: { int: [1, 500] },
    offset: { int: [0, 1_000_000] },
  };

  function readRange(query) {
    const issues = createIssues();
    if (query.from && !isCalendarDate(query.from)) issues.add('from', 'Informe uma data válida.');
    if (query.to && !isCalendarDate(query.to)) issues.add('to', 'Informe uma data válida.');
    issues.throwIfAny();
    if (query.from && query.to && query.from > query.to) throw fieldError('to', 'O início precisa ser antes do fim.');
  }

  function listSales(searchParams) {
    const u = d.requireStudent();
    const query = readQuery(searchParams, SALES_QUERY, { sort: 'closed_on', order: 'desc', limit: 50, offset: 0 });
    readRange(query);
    let rows = salesOf(u).filter((s) => (!query.personId || s.personId === query.personId) && (!query.from || s.closedOn >= query.from) && (!query.to || s.closedOn <= query.to));
    if (query.q) {
      const text = fold(query.q);
      rows = rows.filter((s) => fold(s.description).includes(text) || fold(personName(u, s.personId)).includes(text));
    }
    // A situação financeira é calculada, então o filtro, a ordem e a página vêm depois do cálculo (como o servidor).
    let dtos = rows.map((s) => saleDto(u, s));
    if (query.financialStatus) dtos = dtos.filter((s) => s.financialStatus === query.financialStatus);
    const dir = query.order === 'asc' ? 1 : -1;
    const tie = (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1) * dir;
    dtos.sort((a, b) => {
      if (query.sort === 'final_value') return (toCents(a.finalValue) - toCents(b.finalValue)) * dir || tie(a, b);
      if (query.sort === 'next_due') {
        if (a.nextDueOn === b.nextDueOn) return tie(a, b);
        if (a.nextDueOn === null) return 1; // sem vencimento: sempre por último
        if (b.nextDueOn === null) return -1;
        return (a.nextDueOn < b.nextDueOn ? -1 : 1) * dir;
      }
      return a.closedOn === b.closedOn ? tie(a, b) : (a.closedOn < b.closedOn ? -1 : 1) * dir;
    });
    return { status: 200, body: { rows: dtos.slice(query.offset, query.offset + query.limit), total: dtos.length } };
  }

  function getSale(id, searchParams) {
    const u = d.requireStudent();
    readQuery(searchParams, {}, {});
    return { status: 200, body: fullSale(u, findSale(u, id)) };
  }

  /** Texto e meio de pagamento (nunca valores: esses mudam por renegociação). */
  function patchSale(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    const FIELDS = ['description', 'paymentMethod', 'notes'];
    onlyKeys(b, [...FIELDS, 'version'], issues);
    const patch = {};
    if (b.description !== undefined) patch.description = readLine(b.description, 'description', 120, issues, 'Descreva a venda.', 'A descrição contém caracteres inválidos.');
    if (b.paymentMethod !== undefined) patch.paymentMethod = readMethod(b.paymentMethod, 'paymentMethod', issues);
    if (b.notes !== undefined) patch.notes = readOptionalText(b.notes, 'notes', 1000, issues, true);
    const version = readVersion(b.version, issues);
    if (!FIELDS.some((k) => b[k] !== undefined)) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    const sale = findSale(u, id);
    if (sale.version !== version) throw FinanceErrors.versionConflict();
    const at = d.stamp();
    Object.assign(sale, patch);
    touch(sale, at);
    addEvent(u, sale, 'edited', { fields: FIELDS.filter((k) => patch[k] !== undefined) }, at);
    return { status: 200, body: fullSale(u, sale) };
  }

  // ---------------------------------------------------------------- pagamentos e estornos

  const existingByKey = (u, key) => mine(table('payments'), u).find((p) => p.idempotencyKey === key);

  /**
   * Pagamento (total ou parcial) de UMA parcela vigente. Idempotente pela chave: a mesma chave com o mesmo pedido devolve a venda
   * (200) sem lançar de novo; a mesma chave num pedido diferente = 409. Nunca acima do que falta na parcela.
   */
  function addPayment(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['installmentId', 'amount', 'paidOn', 'method', 'note', 'idempotencyKey'], issues);
    const installmentId = readUuid(b.installmentId, 'installmentId', issues);
    const amount = readMoney(b.amount, 'amount', issues, { positive: true });
    const paidOn = readDate(b.paidOn, 'paidOn', issues);
    const method = readMethod(b.method, 'method', issues);
    const note = b.note === undefined ? null : readOptionalText(b.note, 'note', 500, issues, false);
    const key = readKey(b.idempotencyKey, issues);
    issues.throwIfAny();
    const sale = findSale(u, id);
    const existing = existingByKey(u, key);
    if (existing) {
      const same = existing.saleId === sale.id && existing.installmentId === installmentId && existing.refundOf === null && toCents(existing.amount) === toCents(amount);
      if (!same) throw FinanceErrors.idempotencyConflict();
      return { status: 200, body: fullSale(u, sale) };
    }
    if (sale.status === 'cancelled') throw FinanceErrors.saleCancelled();
    if (paidOn > today()) throw fieldError('paidOn', 'A data do pagamento não pode ser futura.');
    const installment = currentInstallments(sale).find((i) => i.id === installmentId);
    if (!installment) throw fieldError('installmentId', 'Parcela não encontrada.');
    const remaining = installmentRemainingCents({ amount: installment.amount, paid: paidOf(installment.id) });
    const cents = toCents(amount);
    if (cents > remaining) throw FinanceErrors.overpayment(money(remaining));
    const at = d.stamp();
    const payment = insertPayment(u, sale, { installmentId, cents, paidOn, method, note, key, refundOf: null }, at);
    touch(sale, at);
    addEvent(u, sale, 'payment', { paymentId: payment.id, installmentNumber: installment.number, amount: money(cents), paidOn }, at);
    return { status: 201, body: fullSale(u, sale) };
  }

  /**
   * Estorno: pagamento negativo ligado ao original, com motivo; nunca acima do que resta do original. Vale também em venda
   * cancelada (o recebido continua recebido até ser estornado). Idempotente pela chave, como o pagamento.
   */
  function refundPayment(id, paymentId, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['amount', 'reason', 'paidOn', 'idempotencyKey'], issues);
    const amount = readMoney(b.amount, 'amount', issues, { positive: true });
    const reason = readLine(b.reason, 'reason', 500, issues, 'Informe o motivo do estorno.');
    const paidOn = readDate(b.paidOn, 'paidOn', issues);
    const key = readKey(b.idempotencyKey, issues);
    if (!UUID.test(paymentId)) throw Errors.notFound('Pagamento não encontrado.');
    issues.throwIfAny();
    const sale = findSale(u, id);
    const original = paymentsOf(sale).find((p) => p.id === paymentId);
    if (!original) throw Errors.notFound('Pagamento não encontrado.');
    const existing = existingByKey(u, key);
    if (existing) {
      const same = existing.saleId === sale.id && existing.refundOf === paymentId && -toCents(existing.amount) === toCents(amount);
      if (!same) throw FinanceErrors.idempotencyConflict();
      return { status: 200, body: fullSale(u, sale) };
    }
    if (original.refundOf !== null) throw Errors.conflict('not_refundable', 'Um estorno não pode ser estornado.');
    if (paidOn > today()) throw fieldError('paidOn', 'A data do pagamento não pode ser futura.');
    if (paidOn < original.paidOn) throw fieldError('paidOn', 'O estorno não pode ser anterior ao pagamento.');
    const refunded = money(paymentsOf(sale).filter((p) => p.refundOf === original.id).reduce((t, p) => t - toCents(p.amount), 0));
    const refundable = refundableCents(original.amount, refunded);
    const cents = toCents(amount);
    if (cents > refundable) throw FinanceErrors.refundTooLarge(money(refundable));
    const at = d.stamp();
    const refund = insertPayment(u, sale, { installmentId: original.installmentId, cents: -cents, paidOn, method: original.method, note: reason, key, refundOf: original.id }, at);
    touch(sale, at);
    const number = table('installments').find((i) => i.id === original.installmentId)?.number ?? null;
    addEvent(u, sale, 'refund', { paymentId: refund.id, refundOf: original.id, installmentNumber: number, amount: money(cents), paidOn, reason }, at);
    return { status: 201, body: fullSale(u, sale) };
  }

  // ---------------------------------------------------------------- cancelar e renegociar

  /** Cancela: as parcelas deixam de ser cobradas; o já recebido continua recebido. */
  function cancelSale(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['reason', 'version'], issues);
    const reason = readLine(b.reason, 'reason', 500, issues, 'Informe o motivo do cancelamento.');
    const version = readVersion(b.version, issues);
    issues.throwIfAny();
    const sale = findSale(u, id);
    if (sale.status === 'cancelled') throw FinanceErrors.saleCancelled();
    if (sale.version !== version) throw FinanceErrors.versionConflict();
    const at = d.stamp();
    Object.assign(sale, { status: 'cancelled', cancelledAt: at, cancelReason: reason });
    touch(sale, at);
    addEvent(u, sale, 'cancelled', { reason, received: receivedOf(sale) }, at);
    return { status: 200, body: fullSale(u, sale) };
  }

  /**
   * Renegociação: a parcela com algum pagamento fica com o valor já pago; as sem pagamento são substituídas; o novo plano cobre
   * o saldo. Abatimento opcional aumenta o desconto, mas o valor final nunca fica abaixo do recebido.
   */
  function renegotiate(id, body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['version', 'reason', 'extraDiscount', 'plan'], issues);
    const version = readVersion(b.version, issues);
    const reason = readLine(b.reason, 'reason', 500, issues, 'Informe o motivo da renegociação.');
    const extraDiscount = b.extraDiscount === undefined ? undefined : readMoney(b.extraDiscount, 'extraDiscount', issues);
    const plan = readPlan(b.plan, 'plan', issues, 0);
    issues.throwIfAny();
    const sale = findSale(u, id);
    if (sale.status === 'cancelled') throw FinanceErrors.saleCancelled();
    if (sale.version !== version) throw FinanceErrors.versionConflict();
    const current = installmentsWithPaid(sale);
    const receivedCents = toCents(receivedOf(sale));
    const original = toCents(sale.originalValue);
    const extra = toCents(extraDiscount ?? '0');
    // Saldo = valor final − o pago nas parcelas vigentes; o abatimento precisa ser MENOR que o saldo (sobra algo a parcelar).
    const balanceCents = toCents(finalValueOf(sale)) - current.reduce((t, i) => t + toCents(i.paid), 0);
    if (extra >= balanceCents) throw fieldError('extraDiscount', `O abatimento precisa ser menor que o saldo (R$ ${money(balanceCents)}).`);
    const discount = toCents(sale.discount) + extra;
    if (discount > original) throw fieldError('extraDiscount', 'O abatimento passa do valor da venda.');
    const finalCents = original - discount;
    if (finalCents < receivedCents) throw FinanceErrors.finalBelowReceived(money(receivedCents));
    const result = renegotiationPlan({ installments: current, newFinalValue: money(finalCents), plan });
    if (!result.ok) throw Errors.validation(result.errors);

    const at = d.stamp();
    const all = table('installments');
    const previousFinalValue = finalValueOf(sale);
    for (const k of result.keep) all.find((i) => i.id === k.id).amount = k.amount;
    for (const gone of result.supersede) all.find((i) => i.id === gone).supersededAt = at;
    for (const item of result.create) all.push({ id: d.newId(), ownerId: u.id, saleId: sale.id, number: item.number, dueOn: item.dueOn, amount: item.amount, supersededAt: null, createdAt: at });
    Object.assign(sale, { discount: money(discount), mode: 'installments' });
    touch(sale, at);
    addEvent(u, sale, 'renegotiated', {
      reason, extraDiscount: money(extra), previousFinalValue, finalValue: money(finalCents), received: money(receivedCents),
      replacedInstallments: result.supersede.length, newInstallments: result.create.length,
    }, at);
    return { status: 200, body: fullSale(u, sale) };
  }

  // ---------------------------------------------------------------- a receber e visão financeira

  /** Todas as parcelas não pagas das vendas ativas, por vencimento. */
  function unpaid(u, at = today()) {
    const rows = [];
    for (const sale of salesOf(u)) {
      if (sale.status !== 'active') continue;
      for (const i of installmentsWithPaid(sale)) {
        const status = installmentStatus(i, at);
        if (status === 'paid') continue;
        rows.push({
          row: {
            id: i.id, number: i.number, dueOn: i.dueOn, amount: i.amount, paid: i.paid, remaining: money(installmentRemainingCents(i)), status,
            saleId: sale.id, saleDescription: sale.description, personId: sale.personId, personName: personName(u, sale.personId),
          },
          closedOn: sale.closedOn,
        });
      }
    }
    rows.sort((a, b) => cmp(a.row.dueOn, b.row.dueOn) || cmp(a.closedOn, b.closedOn) || cmp(a.row.saleId, b.row.saleId) || a.row.number - b.row.number);
    return rows.map((x) => x.row);
  }

  const sumRemaining = (rows) => money(rows.reduce((t, r) => t + toCents(r.remaining), 0));

  /**
   * `overdue` = vencidas; `upcoming` = vencem de hoje até 30 dias; `open` (padrão) = todas as não pagas. `from`/`to` sobre o
   * vencimento. `totals` é a fotografia de hoje, sem filtros: a vencer (sem as vencidas) e vencido.
   */
  function receivables(searchParams) {
    const u = d.requireStudent();
    const query = readQuery(
      searchParams,
      { status: { enum: ['overdue', 'upcoming', 'open'], message: 'Situação inválida.' }, from: DATE_RULE, to: DATE_RULE, limit: { int: [1, 500] }, offset: { int: [0, 1_000_000] } },
      { status: 'open', limit: 100, offset: 0 },
    );
    readRange(query);
    const now = today();
    const all = unpaid(u, now);
    // Contrato combinado com as telas: `open` = a vencer (SEM as vencidas); `overdue` = saldo das vencidas.
    const totals = { open: sumRemaining(all.filter((r) => r.status !== 'overdue')), overdue: sumRemaining(all.filter((r) => r.status === 'overdue')) };
    const rows = all.filter(
      (r) =>
        (query.status === 'open' || (query.status === 'overdue' ? r.status === 'overdue' : isUpcoming(r.dueOn, now))) &&
        (!query.from || r.dueOn >= query.from) &&
        (!query.to || r.dueOn <= query.to),
    );
    return { status: 200, body: { rows: rows.slice(query.offset, query.offset + query.limit), total: rows.length, totals } };
  }

  /**
   * Visão geral do financeiro. No período (pela data da venda): contratado e quantidade (vendas ativas) e as vendas por situação.
   * Recebido = pagamentos líquidos com data no período (de qualquer venda). A receber, vencido e `overdueCount` (parcelas
   * vencidas) = fotografia de hoje.
   */
  function financeNumbers(u, period) {
    const now = today();
    const w = periodRange(now, period);
    const inPeriod = salesOf(u)
      .filter((s) => s.closedOn >= w.from && s.closedOn <= w.to)
      .map((s) => ({ s, sum: summary(s, now) }));
    const active = inPeriod.filter((x) => x.s.status === 'active');
    const ids = new Set(salesOf(u).map((s) => s.id));
    const received = table('payments').filter((p) => ids.has(p.saleId) && p.paidOn >= w.from && p.paidOn <= w.to).reduce((t, p) => t + toCents(p.amount), 0);
    const rows = unpaid(u, now);
    const overdueRows = rows.filter((r) => r.status === 'overdue');
    const count = (status) => inPeriod.filter((x) => x.sum.financialStatus === status).length;
    return {
      period: w,
      contracted: money(active.reduce((t, x) => t + toCents(finalValueOf(x.s)), 0)),
      salesCount: active.length,
      received: money(received),
      receivable: sumRemaining(rows),
      overdue: sumRemaining(overdueRows),
      overdueCount: overdueRows.length, // parcelas vencidas (contrato combinado com as telas)
      settledCount: count('settled'),
      partialCount: count('partial'),
      openCount: count('open'),
      cancelledCount: count('cancelled'),
      upcoming: rows.filter((r) => r.status !== 'overdue').slice(0, 5),
      overdueList: overdueRows.slice(0, 5),
    };
  }

  const PERIOD_QUERY = { period: { enum: PERIODS, message: 'Período inválido.' } };

  function overview(searchParams) {
    const u = d.requireStudent();
    const { period } = readQuery(searchParams, PERIOD_QUERY, { period: 'month' });
    return { status: 200, body: financeNumbers(u, period) };
  }

  /** Para a mentora (e a equipe com `business.view`): só números, nunca cliente, descrição, observação, motivo ou id de venda. */
  function mentoraFinance(id, searchParams) {
    d.requireAuth('admin');
    const { period } = readQuery(searchParams, PERIOD_QUERY, { period: 'month' });
    const student = UUID.test(id) ? db().users.find((x) => x.id === id && x.role === 'user') : null;
    if (!student) throw Errors.notFound('Aluna não encontrada.');
    const n = financeNumbers(student, period);
    return {
      status: 200,
      body: {
        period: n.period, contracted: n.contracted, salesCount: n.salesCount, received: n.received, receivable: n.receivable, overdue: n.overdue,
        overdueCount: n.overdueCount, settledCount: n.settledCount,
      },
    };
  }

  // ---------------------------------------------------------------- o que a Central Comercial usa (contato e oportunidade)

  /** Vendas do contato (detalhe do contato, aba Compras), as mais recentes primeiro. */
  const personSales = (u, personId) =>
    salesOf(u)
      .filter((s) => s.personId === personId)
      .map((s) => saleDto(u, s))
      .sort((a, b) => (a.closedOn === b.closedOn ? (a.createdAt < b.createdAt ? 1 : -1) : a.closedOn < b.closedOn ? 1 : -1));

  /** Somas das vendas ATIVAS do contato: valor final, recebido líquido e o que falta receber (contratado − recebido). */
  function personTotals(u, personId) {
    const active = salesOf(u).filter((s) => s.personId === personId && s.status === 'active');
    const contracted = active.reduce((t, s) => t + toCents(finalValueOf(s)), 0);
    const received = active.reduce((t, s) => t + toCents(receivedOf(s)), 0);
    return { contracted: money(contracted), received: money(received), pending: money(contracted - received) };
  }

  const SEG = '([^/]+)';
  return {
    routes: [
      ['GET', /^sales$/, (_m, q) => listSales(q)],
      ['POST', /^sales$/, (_m, _q, body) => createSale(body)],
      ['GET', new RegExp(`^sales/${SEG}$`), (m, q) => getSale(m[1], q)],
      ['PATCH', new RegExp(`^sales/${SEG}$`), (m, _q, body) => patchSale(m[1], body)],
      ['POST', new RegExp(`^sales/${SEG}/payments$`), (m, _q, body) => addPayment(m[1], body)],
      ['POST', new RegExp(`^sales/${SEG}/payments/${SEG}/refund$`), (m, _q, body) => refundPayment(m[1], m[2], body)],
      ['POST', new RegExp(`^sales/${SEG}/cancel$`), (m, _q, body) => cancelSale(m[1], body)],
      ['POST', new RegExp(`^sales/${SEG}/renegotiate$`), (m, _q, body) => renegotiate(m[1], body)],
      ['GET', /^receivables$/, (_m, q) => receivables(q)],
      ['GET', /^finance\/overview$/, (_m, q) => overview(q)],
      ['GET', new RegExp(`^mentora/students/${SEG}/finance$`), (m, q) => mentoraFinance(m[1], q)],
    ],
    /** A oportunidade tem venda ATIVA (não pode sair da etapa ganha). */
    dealHasActiveSale: (u, dealId) => salesOf(u).some((s) => s.dealId === dealId && s.status === 'active'),
    hasActiveSale: (u, personId) => salesOf(u).some((s) => s.personId === personId && s.status === 'active'),
    /** Contato com venda não pode ser apagado (FK RESTRICT no banco): 409 `has_sales`. */
    assertNoSales(u, personId) {
      if (salesOf(u).some((s) => s.personId === personId)) throw FinanceErrors.hasSales();
    },
    personTotals,
    personSales,
    readSaleForDeal,
    fullSale,
    /** Oportunidade apagada: a venda fica, sem o vínculo (ON DELETE SET NULL). */
    unlinkDeals(ids) {
      for (const s of table('sales')) if (ids.has(s.dealId)) s.dealId = null;
    },
  };
}
