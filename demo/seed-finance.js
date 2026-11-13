// Financeiro do exemplo (Entrega 3): vendas da aluna demo (Camila) e de outras alunas, com parcelas, pagamentos, um estorno, uma
// renegociação e um cancelamento. Datas RELATIVAS a hoje (dia de Brasília), para "A receber" sempre ter parcelas vencidas e a vencer.
// As parcelas e as situações saem das mesmas contas da API falsa (finance-data.js); nada aqui é real.
import { buildSalePlan, fromCents, renegotiationPlan, toCents, todayInBrasilia } from './finance-data.js';

const DAY = 86_400_000;
const id = (kind, n) => `${kind}-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * Cada venda: [aluna, contato, oportunidade|null, produto|null, descrição, valor, desconto, fechadaHáDias, forma, modo, plano, passos].
 * `plano`: null (à vista) ou { down?: [valor, venceHáDias], count, firstDueDaysAgo? } (sem firstDueDaysAgo: a 1ª vence na data da venda).
 * `passos` em ordem: ['pay', parcela, valor, háDias] | ['refund', nºDoPagamento (1..), valor, háDias, motivo] | ['cancel', háDias, motivo]
 * | ['renegotiate', háDias, motivo, abatimento, parcelas, 1ºVencimentoEmDias].
 */
export function buildFinanceSeed({ now, uid, eid, did, pid }) {
  const t = now.getTime();
  const ago = (days) => new Date(t - days * DAY).toISOString();
  const day = (daysAgo) => todayInBrasilia(new Date(t - daysAgo * DAY));
  const camila = 2;
  const SALES = [
    // Oportunidades ganhas da Camila: mentoria em 3x (2 pagas), curso à vista pago, grupo com entrada + 3x, consultoria em 2x com a 1ª vencida.
    [camila, 1, 1, 1, 'Mentoria Individual · 3 meses', '4800.00', '0.00', 35, 'pix', 'installments', { count: 3 }, [['pay', 1, '1600.00', 35], ['pay', 2, '1600.00', 4]]],
    [camila, 2, 2, 3, 'Curso Online Posicionamento Indiscutível', '997.00', '0.00', 30, 'credit_card', 'simple', null, [['pay', 1, '997.00', 30]]],
    [camila, 5, 3, 5, 'Mentoria em Grupo · 6 semanas', '2400.00', '0.00', 21, 'pix', 'installments', { down: ['600.00', 21], count: 3, firstDueDaysAgo: -9 }, [['pay', 0, '600.00', 21]]],
    [camila, 7, 4, 2, 'Consultoria Estratégica · sessão única', '1200.00', '0.00', 9, 'boleto', 'installments', { count: 2, firstDueDaysAgo: 3 }, []],
    // Vendas avulsas (para quem já é cliente ou perdeu: o estado dos contatos do exemplo não muda): diagnóstico à vista pago, workshop
    // renegociado (com abatimento) e mentoria cancelada com estorno de metade do recebido.
    [camila, 1, null, 6, 'Diagnóstico de Negócio', '350.00', '0.00', 2, 'pix', 'simple', null, [['pay', 1, '350.00', 2]]],
    [camila, 2, null, 4, 'Workshop Presencial de Vendas', '1500.00', '0.00', 70, 'boleto', 'installments', { count: 3 }, [
      ['pay', 1, '500.00', 70],
      ['renegotiate', 20, 'Atrasou a 2ª parcela: novo plano em 3x com abatimento.', '100.00', 3, -10],
      ['pay', 2, '300.00', 10],
    ]],
    [camila, 6, null, 1, 'Mentoria Individual · 3 meses', '4800.00', '0.00', 50, 'transfer', 'installments', { count: 4 }, [
      ['pay', 1, '1200.00', 50],
      ['cancel', 30, 'Desistiu antes da segunda sessão.'],
      ['refund', 1, '600.00', 29, 'Acordo de cancelamento: devolução de metade da 1ª parcela.'],
    ]],
    // Outras alunas (só os números chegam à mentora).
    [3, 3001, 3001, null, 'Mentoria de posicionamento', '6000.00', '0.00', 12, 'pix', 'installments', { count: 3 }, [['pay', 1, '2000.00', 12]]],
    [3, 3002, 3002, null, 'Imersão presencial', '3500.00', '0.00', 8, 'credit_card', 'simple', null, [['pay', 1, '3500.00', 8]]],
    [4, 4003, 4003, null, 'Consultoria de marca', '1800.00', '0.00', 6, 'boleto', 'simple', null, []],
    [7, 7002, 7002, null, 'Grupo VIP · trimestral', '1200.00', '0.00', 4, 'pix', 'installments', { count: 2 }, [['pay', 1, '600.00', 4]]],
    // Entrega 7: vendas de meses anteriores de outras alunas (séries mensais e o negócio das alunas com histórico).
    [3, 3008, 3008, null, 'Mentoria individual', '4500.00', '0.00', 120, 'pix', 'simple', null, [['pay', 1, '4500.00', 120]]],
    [3, 3009, 3009, null, 'Programa de aceleração', '7200.00', '0.00', 75, 'pix', 'installments', { count: 3 }, [['pay', 1, '2400.00', 75], ['pay', 2, '2400.00', 45], ['pay', 3, '2400.00', 15]]],
    [4, 4004, 4004, null, 'Consultoria de imagem', '2200.00', '0.00', 100, 'credit_card', 'simple', null, [['pay', 1, '2200.00', 100]]],
    [6, 6001, 6001, null, 'Sessão estratégica', '1500.00', '0.00', 90, 'pix', 'simple', null, [['pay', 1, '1500.00', 90]]],
    [6, 6002, 6002, null, 'Mentoria em grupo', '3000.00', '0.00', 40, 'boleto', 'installments', { count: 2 }, [['pay', 1, '1500.00', 40]]],
  ];

  const sales = [];
  const installments = [];
  const payments = [];
  const saleEvents = [];
  const seq = { i: 0, p: 0, e: 0 };
  const event = (ownerId, saleId, kind, detail, at) => saleEvents.push({ id: id('b8000000', ++seq.e), ownerId, saleId, kind, detail, createdAt: at });

  SALES.forEach(([n, person, deal, product, description, value, discount, closedAgo, method, mode, plan, steps], k) => {
    const ownerId = uid(n);
    const saleId = id('b5000000', k + 1);
    const closedOn = day(closedAgo);
    const created = ago(closedAgo);
    const sale = {
      id: saleId, ownerId, personId: eid(person), dealId: deal ? did(deal) : null, productId: product ? pid(product) : null, description, originalValue: value, discount,
      closedOn, paymentMethod: method, mode, notes: null, status: 'active', cancelledAt: null, cancelReason: null, version: 1, createdAt: created, updatedAt: created,
    };
    sales.push(sale);
    const finalValue = () => fromCents(toCents(sale.originalValue) - toCents(sale.discount));
    const built = buildSalePlan({
      finalValue: finalValue(), closedOn, mode,
      downPayment: plan?.down ? { amount: plan.down[0], dueOn: day(plan.down[1]) } : null,
      plan: plan ? { count: plan.count, firstDueOn: plan.firstDueDaysAgo === undefined ? closedOn : day(plan.firstDueDaysAgo) } : null,
    });
    if (!built.ok) throw new Error(`Venda do exemplo inválida: ${description}`);
    const add = (item, at) => installments.push({ id: id('b6000000', ++seq.i), ownerId, saleId, number: item.number, dueOn: item.dueOn, amount: item.amount, supersededAt: null, createdAt: at });
    built.items.forEach((item) => add(item, created));
    event(ownerId, saleId, 'created', { finalValue: finalValue(), mode, installments: built.items.length, ...(sale.dealId ? { dealId: sale.dealId } : {}) }, created);
    const own = [];
    const current = () => installments.filter((i) => i.saleId === saleId && i.supersededAt == null);
    const paid = (instId) => fromCents(own.filter((p) => p.installmentId === instId).reduce((t, p) => t + toCents(p.amount), 0));
    const received = () => fromCents(own.reduce((t, p) => t + toCents(p.amount), 0));
    const touch = (at) => Object.assign(sale, { version: sale.version + 1, updatedAt: at });
    for (const step of steps) {
      if (step[0] === 'pay') {
        const [, number, amount, daysAgo] = step;
        const inst = current().find((i) => i.number === number);
        const at = ago(daysAgo);
        const p = { id: id('b7000000', ++seq.p), ownerId, saleId, installmentId: inst.id, amount, paidOn: day(daysAgo), method, refundOf: null, note: null, idempotencyKey: `seed-payment-${seq.p}`, createdAt: at };
        payments.push(p);
        own.push(p);
        touch(at);
        event(ownerId, saleId, 'payment', { paymentId: p.id, installmentNumber: number, amount, paidOn: p.paidOn }, at);
      } else if (step[0] === 'refund') {
        const [, index, amount, daysAgo, reason] = step;
        const original = own.filter((p) => !p.refundOf)[index - 1];
        const at = ago(daysAgo);
        const r = {
          id: id('b7000000', ++seq.p), ownerId, saleId, installmentId: original.installmentId, amount: fromCents(-toCents(amount)), paidOn: day(daysAgo), method: original.method,
          refundOf: original.id, note: reason, idempotencyKey: `seed-payment-${seq.p}`, createdAt: at,
        };
        payments.push(r);
        own.push(r);
        touch(at);
        const number = installments.find((i) => i.id === original.installmentId).number;
        event(ownerId, saleId, 'refund', { paymentId: r.id, refundOf: original.id, installmentNumber: number, amount, paidOn: r.paidOn, reason }, at);
      } else if (step[0] === 'cancel') {
        const [, daysAgo, reason] = step;
        const at = ago(daysAgo);
        Object.assign(sale, { status: 'cancelled', cancelledAt: at, cancelReason: reason });
        touch(at);
        event(ownerId, saleId, 'cancelled', { reason, received: received() }, at);
      } else if (step[0] === 'renegotiate') {
        const [, daysAgo, reason, extra, count, firstDueIn] = step;
        const at = ago(daysAgo);
        const previousFinalValue = finalValue();
        const discountCents = toCents(sale.discount) + toCents(extra);
        const newFinalValue = fromCents(toCents(sale.originalValue) - discountCents);
        const withPaid = current().map((i) => ({ id: i.id, number: i.number, dueOn: i.dueOn, amount: i.amount, paid: paid(i.id) }));
        const result = renegotiationPlan({ installments: withPaid, newFinalValue, plan: { count, firstDueOn: day(-firstDueIn) } });
        if (!result.ok) throw new Error(`Renegociação do exemplo inválida: ${description}`);
        for (const keep of result.keep) installments.find((i) => i.id === keep.id).amount = keep.amount;
        for (const gone of result.supersede) installments.find((i) => i.id === gone).supersededAt = at;
        result.create.forEach((item) => add(item, at));
        Object.assign(sale, { discount: fromCents(discountCents), mode: 'installments' });
        touch(at);
        event(ownerId, saleId, 'renegotiated', {
          reason, extraDiscount: fromCents(toCents(extra)), previousFinalValue, finalValue: newFinalValue, received: received(),
          replacedInstallments: result.supersede.length, newInstallments: result.create.length,
        }, at);
      }
    }
  });
  return { sales, installments, payments, saleEvents };
}
