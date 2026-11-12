// Financeiro (Entrega 3): o dinheiro da venda em um módulo puro (sem estado), espelho EXATO de server/src/domain/finance.ts
// (mesmos nomes, assinaturas e resultados; teste de paridade em server/test/unit/finance-domain.test.ts). Centavos inteiros;
// entrada e saída em texto decimal ("1500.00"), como a API; "hoje" é o dia civil de Brasília; o resto das parcelas geradas
// vai para a última. Usado pela API falsa (mock-finance.js) e pelo exemplo (seed-finance.js).
// No fim, `periodRange` (só da demo; o teste de paridade confere contra commercialWindow do servidor).

export const PAYMENT_METHODS = ['pix', 'credit_card', 'boleto', 'transfer', 'cash', 'other'];

export const PAYMENT_METHOD_LABELS = {
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  boleto: 'Boleto',
  transfer: 'Transferência',
  cash: 'Dinheiro',
  other: 'Outro',
};

export const SALE_MODES = ['simple', 'installments'];
export const SALE_STATUSES = ['active', 'cancelled'];
export const INSTALLMENT_STATUSES = ['open', 'partial', 'paid', 'overdue', 'cancelled'];
export const FINANCIAL_STATUSES = ['open', 'partial', 'overdue', 'settled', 'cancelled'];

/** Fuso do "hoje" do financeiro (vencimento). */
export const FINANCE_TIME_ZONE = 'America/Sao_Paulo';

/** Parcelas por plano gerado ou lista explícita (o banco aceita números de 0 a 240). */
export const MAX_PLAN_INSTALLMENTS = 60;
export const MAX_INSTALLMENT_NUMBER = 240;

/** Dias à frente que contam como "a vencer" na tela A receber. */
export const UPCOMING_DAYS = 30;

// ---------------------------------------------------------------------------------------------------------------- centavos

const MONEY = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Texto decimal ("1500", "1500.5", "-10.00") ou número -> centavos inteiros. Sem passar por ponto flutuante no texto. */
export function toCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Valor inválido: ${value}`);
    return Math.round(value * 100);
  }
  const m = MONEY.exec(String(value).trim());
  if (!m) throw new Error(`Valor inválido: ${value}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] && cents !== 0 ? -cents : cents;
}

/** Centavos -> texto decimal com 2 casas ("1500.00", "-10.50"). */
export function fromCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new Error(`Centavos inválidos: ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Soma de valores em texto decimal, em centavos, devolvida em texto. */
export function sumMoney(values) {
  return fromCents(values.reduce((total, v) => total + toCents(v), 0));
}

// ---------------------------------------------------------------------------------------------------------------- datas

/** Dia civil (AAAA-MM-DD) de um instante em Brasília. */
export function todayInBrasilia(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: FINANCE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Soma dias a uma data AAAA-MM-DD. */
export function addDaysIso(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Soma meses a uma data AAAA-MM-DD; o dia passa do fim do mês -> último dia do mês (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonthsIso(date, months) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + months;
  const day = Number(date.slice(8, 10));
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------------------------- planos

/** N parcelas mensais iguais a partir de `firstDueOn`; o resto dos centavos vai para a última. */
export function generateInstallments(totalCents, count, firstDueOn, startNumber = 1) {
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => ({
    number: startNumber + i,
    dueOn: addMonthsIso(firstDueOn, i),
    amount: fromCents(i === count - 1 ? totalCents - base * (count - 1) : base),
  }));
}

/**
 * Parcelas para um SALDO (`balanceCents`), numeradas a partir de `startNumber`. Lista explícita: precisa somar exatamente o
 * saldo e cada parcela ser maior que zero. Saldo zero só aceita lista vazia (renegociação que quita com abatimento).
 * `field` é o prefixo do campo nos erros ("plan"). Devolve `{ ok: true, items }` ou `{ ok: false, errors }`.
 */
export function planForBalance(balanceCents, plan, startNumber = 1, field = 'plan') {
  if ('count' in plan) {
    if (!Number.isInteger(plan.count) || plan.count < 1 || plan.count > MAX_PLAN_INSTALLMENTS) {
      return { ok: false, errors: [{ field: `${field}.count`, message: `Informe de 1 a ${MAX_PLAN_INSTALLMENTS} parcelas.` }] };
    }
    if (balanceCents <= 0) return { ok: false, errors: [{ field, message: 'Não há saldo para parcelar.' }] };
    if (Math.floor(balanceCents / plan.count) < 1) {
      return { ok: false, errors: [{ field: `${field}.count`, message: 'O valor é pequeno demais para tantas parcelas.' }] };
    }
    if (startNumber + plan.count - 1 > MAX_INSTALLMENT_NUMBER) {
      return { ok: false, errors: [{ field: `${field}.count`, message: 'Esta venda já tem parcelas demais.' }] };
    }
    return { ok: true, items: generateInstallments(balanceCents, plan.count, plan.firstDueOn, startNumber) };
  }
  const items = plan.items;
  if (items.length > MAX_PLAN_INSTALLMENTS) {
    return { ok: false, errors: [{ field: `${field}.items`, message: `Informe no máximo ${MAX_PLAN_INSTALLMENTS} parcelas.` }] };
  }
  if (items.length === 0 && balanceCents > 0) return { ok: false, errors: [{ field: `${field}.items`, message: 'Informe ao menos uma parcela.' }] };
  if (startNumber + items.length - 1 > MAX_INSTALLMENT_NUMBER) {
    return { ok: false, errors: [{ field: `${field}.items`, message: 'Esta venda já tem parcelas demais.' }] };
  }
  const errors = [];
  let total = 0;
  items.forEach((item, i) => {
    const cents = toCents(item.amount);
    if (cents <= 0) errors.push({ field: `${field}.items.${i}.amount`, message: 'A parcela precisa ser maior que zero.' });
    total += cents;
  });
  if (errors.length) return { ok: false, errors };
  if (total !== balanceCents) {
    return {
      ok: false,
      errors: [{ field: `${field}.items`, message: `As parcelas somam R$ ${fromCents(total)}, mas o valor a parcelar é R$ ${fromCents(balanceCents)}.` }],
    };
  }
  return { ok: true, items: items.map((item, i) => ({ number: startNumber + i, dueOn: item.dueOn, amount: fromCents(toCents(item.amount)) })) };
}

/**
 * Parcelas de uma venda nova (`{ finalValue, closedOn, mode, downPayment?, plan? }`). Simples: uma parcela (número 1) do valor
 * final, vencendo na data da venda. Parcelado: entrada opcional (número 0, menor que o valor final) e o plano para o resto.
 * A soma é SEMPRE o valor final.
 */
export function buildSalePlan(input) {
  const finalCents = toCents(input.finalValue);
  if (finalCents <= 0) return { ok: false, errors: [{ field: 'discount', message: 'O valor final da venda precisa ser maior que zero.' }] };
  if (input.mode === 'simple') {
    if (input.plan || input.downPayment) {
      return { ok: false, errors: [{ field: 'mode', message: 'No modo simples não há entrada nem plano de parcelas.' }] };
    }
    return { ok: true, items: [{ number: 1, dueOn: input.closedOn, amount: fromCents(finalCents) }] };
  }
  if (!input.plan) return { ok: false, errors: [{ field: 'plan', message: 'Informe as parcelas.' }] };
  let balance = finalCents;
  const items = [];
  if (input.downPayment) {
    const down = toCents(input.downPayment.amount);
    if (down <= 0 || down >= finalCents) {
      return { ok: false, errors: [{ field: 'downPayment.amount', message: 'A entrada precisa ser maior que zero e menor que o valor final.' }] };
    }
    items.push({ number: 0, dueOn: input.downPayment.dueOn, amount: fromCents(down) });
    balance -= down;
  }
  const rest = planForBalance(balance, input.plan, 1);
  if (!rest.ok) return rest;
  return { ok: true, items: [...items, ...rest.items] };
}

// ---------------------------------------------------------------------------------------------------------------- situações

/** Situação de uma parcela (`{ amount, paid, dueOn }`) num dia (`today`, AAAA-MM-DD de Brasília). */
export function installmentStatus(i, today, saleCancelled = false) {
  const amount = toCents(i.amount);
  const paid = toCents(i.paid);
  if (paid >= amount) return 'paid';
  if (saleCancelled) return 'cancelled';
  if (i.dueOn < today) return 'overdue';
  if (paid > 0) return 'partial';
  return 'open';
}

/** Situação da venda a partir das situações das parcelas e do recebido líquido. */
export function saleFinancialStatus(status, finalCents, receivedCents, anyOverdue) {
  if (status === 'cancelled') return 'cancelled';
  if (receivedCents >= finalCents) return 'settled';
  if (anyOverdue) return 'overdue';
  if (receivedCents > 0) return 'partial';
  return 'open';
}

/**
 * Tudo o que a tela mostra de uma venda (`{ finalValue, status, received, installments: [{ id?, number, amount, paid, dueOn }] }`),
 * calculado de uma vez (parcelas em ordem de número).
 */
export function summarizeSale(sale, today) {
  const cancelled = sale.status === 'cancelled';
  const finalCents = toCents(sale.finalValue);
  const receivedCents = toCents(sale.received);
  let overdue = 0;
  let paidCount = 0;
  let nextDueOn = null;
  const installments = [...sale.installments]
    .sort((a, b) => a.number - b.number)
    .map((i) => {
      const status = installmentStatus(i, today, cancelled);
      const remaining = Math.max(0, toCents(i.amount) - toCents(i.paid));
      if (status === 'paid') paidCount += 1;
      if (status === 'overdue') overdue += remaining;
      if ((status === 'open' || status === 'partial' || status === 'overdue') && (nextDueOn === null || i.dueOn < nextDueOn)) nextDueOn = i.dueOn;
      return {
        ...(i.id !== undefined ? { id: i.id } : {}),
        number: i.number,
        dueOn: i.dueOn,
        amount: fromCents(toCents(i.amount)),
        paid: fromCents(toCents(i.paid)),
        remaining: fromCents(remaining),
        status,
      };
    });
  return {
    financialStatus: saleFinancialStatus(sale.status, finalCents, receivedCents, overdue > 0),
    received: fromCents(receivedCents),
    pending: fromCents(cancelled ? 0 : Math.max(0, finalCents - receivedCents)),
    overdue: fromCents(cancelled ? 0 : overdue),
    nextDueOn: cancelled ? null : nextDueOn,
    installmentsCount: installments.length,
    paidInstallments: paidCount,
    installments,
  };
}

/**
 * Renegociação (`{ installments: [{ id, number, amount, paid, dueOn }], newFinalValue, plan }`): a parcela totalmente paga fica
 * como está; a parcialmente paga fica com o valor já pago; as não pagas são substituídas. As novas cobrem o saldo (valor final
 * novo − o que ficou). Saldo zero (o abatimento quitou) = nenhuma parcela nova. Quem chama confere antes que o valor final novo
 * não fica abaixo do recebido.
 */
export function renegotiationPlan(input) {
  const keep = [];
  const supersede = [];
  for (const i of input.installments) {
    const paid = toCents(i.paid);
    if (paid <= 0) supersede.push(i.id);
    else keep.push({ id: i.id, number: i.number, amount: fromCents(Math.min(paid, toCents(i.amount))) });
  }
  const balance = toCents(input.newFinalValue) - keep.reduce((t, k) => t + toCents(k.amount), 0);
  if (balance < 0) return { ok: false, errors: [{ field: 'extraDiscount', message: 'O valor final não pode ficar abaixo do que já foi recebido.' }] };
  const start = Math.max(0, ...keep.map((k) => k.number)) + 1;
  if (balance === 0) return { ok: true, keep, supersede, create: [], balance: fromCents(0) };
  const plan = planForBalance(balance, input.plan, start);
  if (!plan.ok) return plan;
  return { ok: true, keep, supersede, create: plan.items, balance: fromCents(balance) };
}

/** Quanto ainda cabe numa parcela (centavos); nunca negativo. */
export function installmentRemainingCents(i) {
  return Math.max(0, toCents(i.amount) - toCents(i.paid));
}

/** Quanto ainda pode ser estornado de um pagamento (centavos): o original menos os estornos anteriores (positivos). */
export function refundableCents(originalAmount, refundedTotal) {
  return Math.max(0, toCents(originalAmount) - toCents(refundedTotal));
}

/** Situação da parcela na tela A receber: vencida, a vencer em até 30 dias, ou só em aberto. */
export function isUpcoming(dueOn, today) {
  return dueOn >= today && dueOn <= addDaysIso(today, UPCOMING_DAYS);
}

// ---------------------------------------------------------------------------------------------------------------- período

/** Mês, trimestre ou ano civil que contém `today` (AAAA-MM-DD), como commercialWindow do servidor: `{ from, to }` inclusive. */
export function periodRange(today, period) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const firstMonth = period === 'year' ? 0 : period === 'quarter' ? m - (m % 3) : m;
  const months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
  return { from: new Date(Date.UTC(y, firstMonth, 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(y, firstMonth + months, 0)).toISOString().slice(0, 10) };
}
