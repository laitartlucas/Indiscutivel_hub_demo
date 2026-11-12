// Regras puras do Financeiro (vendas, parcelas, pagamentos), sem DOM, testadas em web/test/finance.test.js.
// O servidor (server/src/domain/finance.ts) é a fonte da verdade da situação das parcelas e da venda; aqui só há
// o que a tela precisa ANTES de enviar: a prévia das parcelas (mesma regra do servidor: o resto em centavos vai
// para a última), validações dos formulários e rótulos.
import { formatMoney, parseMoney } from '../../shared/money.js';

// ---------- dinheiro em centavos ----------

/** "1500.00" / "-12.5" / 12.5 -> centavos (inteiro). Inválido -> 0. */
export function toCents(value) {
  const text = String(value ?? '0').trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return 0;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '0').padEnd(2, '0'));
  return match[1] === '-' ? -cents : cents;
}

/** Centavos -> "1500.00" (negativo -> "-12.50"). */
export function fromCents(cents) {
  const n = Math.round(Number(cents) || 0);
  const abs = Math.abs(n);
  return `${n < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** "R$ 1.500,00"; negativo vira "− R$ 12,50" (estorno). */
export function money(value) {
  const cents = toCents(value);
  const text = formatMoney(fromCents(Math.abs(cents)));
  return cents < 0 ? `− ${text}` : text;
}

/** Texto digitado -> centavos, ou null se vazio/ inválido. */
export function inputCents(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  const parsed = parseMoney(trimmed);
  return parsed.ok ? toCents(parsed.value) : null;
}

// ---------- datas (AAAA-MM-DD, no fuso de Brasília como o servidor) ----------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const brasiliaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Hoje em Brasília, "AAAA-MM-DD". */
export function todayIso(now = new Date()) {
  return brasiliaDay.format(now);
}

const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); // month 0-11

export function isIsoDate(value) {
  const match = ISO_DATE.exec(String(value ?? ''));
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m - 1) && y >= 1900 && y <= 2999;
}

/**
 * Soma `n` meses a uma data, mantendo o dia; se o mês não tem esse dia, usa o último (31/01 + 1 mês = 28 ou 29/02).
 * Sempre a partir da data de origem (31/01 + 2 meses = 31/03, não 28/03).
 */
export function addMonths(iso, n) {
  const match = ISO_DATE.exec(String(iso ?? ''));
  if (!match) return '';
  const total = Number(match[1]) * 12 + (Number(match[2]) - 1) + n;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const day = Math.min(Number(match[3]), daysInMonth(year, month));
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Dias de `from` até `to` (AAAA-MM-DD); positivo = `to` depois. */
export function daysBetween(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  const at = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/** "vence hoje" / "vence amanhã" / "vence em 5 dias" / "venceu ontem" / "venceu há 3 dias". */
export function dueRelative(dueOn, today) {
  const diff = daysBetween(today, dueOn);
  if (diff === null) return '';
  if (diff === 0) return 'vence hoje';
  if (diff === 1) return 'vence amanhã';
  if (diff > 1) return `vence em ${diff} dias`;
  if (diff === -1) return 'venceu ontem';
  return `venceu há ${-diff} dias`;
}

// ---------- rótulos ----------

export const PAYMENT_METHODS = [
  { value: 'pix', label: 'Pix' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'other', label: 'Outro' },
];
export const isPaymentMethod = (value) => PAYMENT_METHODS.some((m) => m.value === value);
export const paymentMethodLabel = (value) => PAYMENT_METHODS.find((m) => m.value === value)?.label ?? '—';

/** Situação da parcela: a palavra sempre acompanha a cor. */
export const INSTALLMENT_STATUS = Object.freeze({
  open: { label: 'Em aberto', tone: 'neutral' },
  partial: { label: 'Paga em parte', tone: 'warn' },
  paid: { label: 'Paga', tone: 'good' },
  overdue: { label: 'Vencida', tone: 'bad' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
});
export const installmentStatusLabel = (s) => INSTALLMENT_STATUS[s]?.label ?? 'Em aberto';
export const installmentStatusTone = (s) => INSTALLMENT_STATUS[s]?.tone ?? 'neutral';

/** Situação financeira da venda. */
export const SALE_STATUS = Object.freeze({
  open: { label: 'A receber', tone: 'neutral' },
  partial: { label: 'Recebida em parte', tone: 'warn' },
  overdue: { label: 'Em atraso', tone: 'bad' },
  settled: { label: 'Quitada', tone: 'good' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
});
export const saleStatusLabel = (s) => SALE_STATUS[s]?.label ?? 'A receber';
export const saleStatusTone = (s) => SALE_STATUS[s]?.tone ?? 'neutral';
export const isSaleStatus = (value) => Object.hasOwn(SALE_STATUS, value);

/** Filtros da lista de vendas (financialStatus). */
export const SALE_SEGMENTS = [
  { id: '', label: 'Todas' },
  { id: 'open', label: 'A receber' },
  { id: 'partial', label: 'Recebidas em parte' },
  { id: 'overdue', label: 'Em atraso' },
  { id: 'settled', label: 'Quitadas' },
  { id: 'cancelled', label: 'Canceladas' },
];

/** Filtros de A receber (GET /receivables?status). */
export const RECEIVABLE_SEGMENTS = [
  { id: 'overdue', label: 'Vencidas' },
  { id: 'upcoming', label: 'Próximos 30 dias' },
  { id: 'open', label: 'Todas em aberto' },
];
export const isReceivableStatus = (value) => RECEIVABLE_SEGMENTS.some((s) => s.id === value);

/** "Entrada" (número 0) ou "Parcela 3" / "Parcela 3 de 10". */
export function installmentLabel(number, count = null) {
  if (Number(number) === 0) return 'Entrada';
  return count ? `Parcela ${number} de ${count}` : `Parcela ${number}`;
}

export const SALE_MODES = [
  { value: 'simple', label: 'Pagamento único' },
  { value: 'installments', label: 'Parcelado' },
];

// ---------- prévia das parcelas (mesma regra do servidor) ----------

export const MAX_INSTALLMENTS = 60;

/** Divide `total` centavos em `count` partes iguais; o resto vai para a última. */
export function splitCents(total, count) {
  const n = Math.trunc(count);
  if (!Number.isInteger(n) || n < 1 || total <= 0) return [];
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base));
}

/**
 * Parcelas geradas por { count, firstDueOn } a partir de um total (centavos), mensais e numeradas a partir de `startNumber`.
 * Devolve `{ ok: true, items: [{ number, dueOn, amount }] }` ou `{ ok: false, message }`.
 */
export function planItems({ total, count, firstDueOn, startNumber = 1 }) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > MAX_INSTALLMENTS) return { ok: false, message: `Escolha de 1 a ${MAX_INSTALLMENTS} parcelas.` };
  if (!isIsoDate(firstDueOn)) return { ok: false, message: 'Informe a data da primeira parcela.' };
  if (total <= 0) return { ok: false, message: 'Não há valor para parcelar.' };
  if (total < n) return { ok: false, message: 'Valor pequeno demais para tantas parcelas.' };
  const amounts = splitCents(total, n);
  return { ok: true, items: amounts.map((cents, i) => ({ number: startNumber + i, dueOn: addMonths(firstDueOn, i), amount: fromCents(cents) })) };
}

/**
 * Prévia completa do diálogo "Registrar venda": valor final, entrada (número 0) e parcelas.
 * Entradas em centavos (ou null); `mode` 'simple' = uma parcela única na data da venda.
 */
export function salePreview({ original, discount = 0, mode, closedOn, downAmount = null, downDueOn = '', count, firstDueOn }) {
  if (original === null || original === undefined || original <= 0) return { ok: false, message: 'Informe o valor da venda para ver as parcelas.' };
  const final = original - (discount ?? 0);
  if (final <= 0) return { ok: false, message: 'O desconto precisa ser menor que o valor da venda.' };
  if (mode !== 'installments') {
    if (!isIsoDate(closedOn)) return { ok: false, message: 'Informe a data da venda.' };
    return { ok: true, final: fromCents(final), items: [{ number: 1, dueOn: closedOn, amount: fromCents(final) }] };
  }
  const items = [];
  const down = downAmount ?? 0;
  if (down > 0) {
    if (down >= final) return { ok: false, message: 'A entrada precisa ser menor que o valor final.' };
    if (!isIsoDate(downDueOn)) return { ok: false, message: 'Informe o vencimento da entrada.' };
    items.push({ number: 0, dueOn: downDueOn, amount: fromCents(down) });
  }
  const plan = planItems({ total: final - down, count, firstDueOn });
  if (!plan.ok) return plan;
  return { ok: true, final: fromCents(final), items: [...items, ...plan.items] };
}

/** "10 parcelas de R$ 100,00" / "9 de R$ 33,33 e a última de R$ 33,36" (resumo falado da prévia, sem a entrada). */
export function planSummary(items) {
  const parts = (items ?? []).filter((i) => i.number !== 0);
  if (parts.length === 0) return '';
  if (parts.length === 1) return `1 parcela de ${money(parts[0].amount)}`;
  const first = parts[0].amount;
  const last = parts[parts.length - 1].amount;
  if (first === last) return `${parts.length} parcelas de ${money(first)}`;
  return `${parts.length - 1} parcelas de ${money(first)} e a última de ${money(last)}`;
}

// ---------- validações dos formulários ----------

export function descriptionError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Descreva a venda (ex.: o produto ou o serviço).';
  if ([...text].length > 120) return 'Descrição muito longa (máximo 120).';
  return null;
}

/** Valor positivo em reais. `label` entra na mensagem de "informe". */
export const positiveMoneyError = (emptyMessage) => (value) => {
  const text = String(value ?? '').trim();
  if (!text) return emptyMessage;
  const parsed = parseMoney(text);
  if (!parsed.ok) return parsed.message;
  return toCents(parsed.value) > 0 ? null : 'O valor precisa ser maior que zero.';
};

export const originalValueError = positiveMoneyError('Informe o valor da venda.');

/** Desconto: opcional; menor que o valor da venda. */
export function discountError(value, all) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = parseMoney(text);
  if (!parsed.ok) return parsed.message;
  const original = inputCents(all?.originalValue);
  if (original !== null && toCents(parsed.value) >= original) return 'O desconto precisa ser menor que o valor da venda.';
  return null;
}

export function requiredDateError(message) {
  return (value) => (isIsoDate(value) ? null : message);
}

export const closedOnError = requiredDateError('Informe a data da venda.');

const installmentsMode = (all) => all?.mode === 'installments';
const finalCents = (all) => {
  const original = inputCents(all?.originalValue);
  if (original === null) return null;
  return original - (inputCents(all?.discount) ?? 0);
};

/** Entrada (só no parcelado): opcional; menor que o valor final. */
export function downAmountError(value, all) {
  if (!installmentsMode(all)) return null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = parseMoney(text);
  if (!parsed.ok) return parsed.message;
  const cents = toCents(parsed.value);
  if (cents <= 0) return 'A entrada precisa ser maior que zero (ou deixe em branco).';
  const final = finalCents(all);
  if (final !== null && cents >= final) return 'A entrada precisa ser menor que o valor final.';
  return null;
}

export function downDueOnError(value, all) {
  if (!installmentsMode(all) || !String(all?.downAmount ?? '').trim()) return null;
  return isIsoDate(value) ? null : 'Informe o vencimento da entrada.';
}

export function countError(value, all) {
  if (all && Object.hasOwn(all, 'mode') && !installmentsMode(all)) return null;
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return `Informe de 1 a ${MAX_INSTALLMENTS} parcelas.`;
  const n = Number(text);
  if (n < 1 || n > MAX_INSTALLMENTS) return `Informe de 1 a ${MAX_INSTALLMENTS} parcelas.`;
  return null;
}

export function firstDueOnError(value, all) {
  if (all && Object.hasOwn(all, 'mode') && !installmentsMode(all)) return null;
  return isIsoDate(value) ? null : 'Informe o vencimento da primeira parcela.';
}

export const notesError = (value) => ([...String(value ?? '').trim()].length > 1000 ? 'Observações muito longas (máximo 1000).' : null);

export function reasonError(value, { empty = 'Conte o motivo.', max = 500 } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return empty;
  if ([...text].length > max) return `Texto muito longo (máximo ${max}).`;
  return null;
}

/** Pagamento: maior que zero e no máximo o que falta na parcela (centavos). */
export function paymentAmountError(value, remainingCents) {
  const text = String(value ?? '').trim();
  if (!text) return 'Informe o valor recebido.';
  const parsed = parseMoney(text);
  if (!parsed.ok) return parsed.message;
  const cents = toCents(parsed.value);
  if (cents <= 0) return 'O valor precisa ser maior que zero.';
  if (remainingCents !== null && remainingCents !== undefined && cents > remainingCents) return `Falta só ${money(fromCents(remainingCents))} nesta parcela.`;
  return null;
}

/** Data do pagamento: obrigatória e nunca depois de hoje (Brasília), como o servidor confere. */
export function paymentDateError(value, today = todayIso()) {
  if (!isIsoDate(value)) return 'Informe a data do pagamento.';
  if (value > today) return 'A data do pagamento não pode ser futura.';
  return null;
}

/** Data do estorno: nunca depois de hoje nem antes do pagamento original. */
export function refundDateError(value, { paidOn = '', today = todayIso() } = {}) {
  if (!isIsoDate(value)) return 'Informe a data do estorno.';
  if (value > today) return 'A data do estorno não pode ser futura.';
  if (isIsoDate(paidOn) && value < paidOn) return 'O estorno não pode ser anterior ao pagamento.';
  return null;
}

/** Data em que o servidor lança um "já recebido": a data informada, ou hoje se ela for futura. */
export const receivedOn = (date, today = todayIso()) => (isIsoDate(date) && date < today ? date : today);

/** Quanto ainda dá para estornar de um pagamento (centavos). `refundedTotal` pode vir positivo ou negativo. */
export function refundableCents(payment) {
  if (!payment || payment.refundOf || toCents(payment.amount) <= 0) return 0;
  return Math.max(0, toCents(payment.amount) - Math.abs(toCents(payment.refundedTotal ?? '0')));
}

export function refundAmountError(value, maxCents) {
  const text = String(value ?? '').trim();
  if (!text) return 'Informe o valor a estornar.';
  const parsed = parseMoney(text);
  if (!parsed.ok) return parsed.message;
  const cents = toCents(parsed.value);
  if (cents <= 0) return 'O valor precisa ser maior que zero.';
  if (cents > maxCents) return `Dá para estornar no máximo ${money(fromCents(maxCents))} deste pagamento.`;
  return null;
}

// ---------- corpo dos pedidos ----------

const orUndefined = (value) => {
  const text = String(value ?? '').trim();
  return text === '' ? undefined : text;
};

/**
 * Corpo de POST /sales (sem `personId`/`dealId`, que quem chama acrescenta) e do `sale` da transição para Ganha.
 * `values`: valores do formulário (texto); `flags`: { receivedNow, downReceivedNow } (caixas de seleção).
 */
export function saleBody(values, { receivedNow = false, downReceivedNow = false } = {}) {
  const body = {
    description: String(values.description ?? '').trim(),
    originalValue: parseMoney(values.originalValue).value,
    closedOn: values.closedOn,
    paymentMethod: values.paymentMethod,
    mode: values.mode === 'installments' ? 'installments' : 'simple',
  };
  const discount = inputCents(values.discount);
  if (discount) body.discount = fromCents(discount);
  if (values.productId) body.productId = values.productId;
  const notes = orUndefined(values.notes);
  if (notes) body.notes = notes;
  if (body.mode === 'simple') {
    if (receivedNow) body.receivedNow = true;
    return body;
  }
  const down = inputCents(values.downAmount);
  if (down) body.downPayment = { amount: fromCents(down), dueOn: values.downDueOn, ...(downReceivedNow ? { receivedNow: true } : {}) };
  body.plan = { count: Number(values.count), firstDueOn: values.firstDueOn };
  return body;
}

// ---------- renegociação ----------

/** Saldo que a renegociação reparcela: valor final − o já pago em cada parcela vigente (centavos). */
export function renegotiationBalance(sale) {
  const paid = (sale?.installments ?? []).reduce((n, i) => n + Math.max(0, toCents(i.paid ?? '0')), 0);
  return toCents(sale?.finalValue ?? '0') - paid;
}

/** Abatimento opcional: não pode zerar nem passar do saldo. */
export function extraDiscountError(value, balanceCents) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = parseMoney(text);
  if (!parsed.ok) return parsed.message;
  const cents = toCents(parsed.value);
  if (cents < 0) return 'Valor inválido.';
  if (cents >= balanceCents) return `O abatimento precisa ser menor que o saldo (${money(fromCents(balanceCents))}).`;
  return null;
}

// ---------- chave de idempotência ----------

/** Chave nova por abertura do diálogo de pagamento/estorno: 32 caracteres [a-f0-9] (o servidor aceita [A-Za-z0-9_-]{8,80}). */
export function newIdempotencyKey(cryptoApi = globalThis.crypto) {
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID().replace(/-/g, '');
  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- indicadores ----------

const countFormat = new Intl.NumberFormat('pt-BR');
const plural = (n, one, many) => `${countFormat.format(n)} ${n === 1 ? one : many}`;

/** Bloco Financeiro da Visão geral e topo de Vendas (GET /finance/overview). */
export function financeKpis(o) {
  const sales = Number(o?.salesCount ?? 0);
  const overdueCount = Number(o?.overdueCount ?? 0);
  return [
    { id: 'contracted', label: 'Contratado', value: money(o?.contracted ?? '0.00'), note: `${plural(sales, 'venda', 'vendas')} no período` },
    { id: 'received', label: 'Recebido', value: money(o?.received ?? '0.00'), note: 'pagamentos no período', gold: true },
    { id: 'receivable', label: 'A receber', value: money(o?.receivable ?? '0.00'), note: 'em aberto hoje' },
    { id: 'overdue', label: 'Vencido', value: money(o?.overdue ?? '0.00'), note: overdueCount ? `${plural(overdueCount, 'parcela vencida', 'parcelas vencidas')}` : 'nada vencido', bad: toCents(o?.overdue ?? '0') > 0 },
  ];
}

/** Resumo do detalhe da venda: contratado, recebido, saldo e vencido. */
export function saleSummary(sale) {
  const discount = toCents(sale?.discount ?? '0');
  return [
    { id: 'final', label: 'Contratado', value: money(sale?.finalValue ?? '0.00'), note: discount > 0 ? `${money(sale.originalValue)} − ${money(sale.discount)} de desconto` : `fechada em ${formatIsoDay(sale?.closedOn)}` },
    { id: 'received', label: 'Recebido', value: money(sale?.received ?? '0.00'), note: plural(Number(sale?.paidInstallments ?? 0), 'parcela paga', 'parcelas pagas'), gold: true },
    { id: 'pending', label: 'Saldo', value: money(sale?.pending ?? '0.00'), note: sale?.status === 'cancelled' ? 'venda cancelada' : sale?.nextDueOn ? `próximo vencimento ${formatIsoDay(sale.nextDueOn)}` : 'nada a vencer' },
    { id: 'overdue', label: 'Vencido', value: money(sale?.overdue ?? '0.00'), note: toCents(sale?.overdue ?? '0') > 0 ? 'cobre o quanto antes' : 'em dia', bad: toCents(sale?.overdue ?? '0') > 0 },
  ];
}

function formatIsoDay(value) {
  const match = ISO_DATE.exec(String(value ?? '').slice(0, 10));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
}

/** Cartão "Financeiro" da mentora (GET /mentora/students/:id/finance): só números. */
export function studentFinanceItems(d) {
  return [
    { label: 'Contratado', value: money(d?.contracted ?? '0.00'), note: plural(Number(d?.salesCount ?? 0), 'venda', 'vendas') },
    { label: 'Recebido', value: money(d?.received ?? '0.00'), note: 'no período' },
    { label: 'A receber', value: money(d?.receivable ?? '0.00'), note: 'hoje' },
    { label: 'Vencido', value: money(d?.overdue ?? '0.00'), note: plural(Number(d?.overdueCount ?? 0), 'parcela', 'parcelas') },
    { label: 'Quitadas', value: countFormat.format(Number(d?.settledCount ?? 0)), note: 'vendas pagas por inteiro' },
  ];
}

// ---------- eventos da venda ----------

const EVENT_KINDS = {
  created: { title: 'Venda registrada', icon: 'plus' },
  payment: { title: 'Pagamento registrado', icon: 'check' },
  refund: { title: 'Estorno', icon: 'refresh' },
  cancelled: { title: 'Venda cancelada', icon: 'close' },
  renegotiated: { title: 'Renegociação', icon: 'calendar' },
  edited: { title: 'Dados alterados', icon: 'edit' },
};

/**
 * Como mostrar um evento (o `detail` é livre no contrato: usamos só o que reconhecemos — valor, parcela, forma,
 * motivo, quantidade de parcelas, abatimento).
 */
export function saleEventView(event) {
  const kind = EVENT_KINDS[event?.kind] ?? { title: 'Alteração', icon: 'edit' };
  const d = event?.detail && typeof event.detail === 'object' ? event.detail : {};
  const parts = [];
  if (d.amount !== undefined && d.amount !== null) parts.push(money(String(d.amount)));
  if (d.installmentNumber !== undefined && d.installmentNumber !== null) parts.push(installmentLabel(d.installmentNumber));
  if (d.method && isPaymentMethod(d.method)) parts.push(paymentMethodLabel(d.method));
  if (d.count) parts.push(plural(Number(d.count), 'parcela', 'parcelas'));
  if (d.extraDiscount && toCents(String(d.extraDiscount)) > 0) parts.push(`abatimento de ${money(String(d.extraDiscount))}`);
  const reason = typeof d.reason === 'string' ? d.reason : '';
  return { icon: kind.icon, title: kind.title, text: parts.join(' · '), reason };
}
