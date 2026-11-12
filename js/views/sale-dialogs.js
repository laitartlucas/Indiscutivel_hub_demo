import { formatMoney, moneyToInputText, parseMoney } from '../../shared/money.js';
import {
  MAX_INSTALLMENTS,
  PAYMENT_METHODS,
  SALE_MODES,
  addMonths,
  closedOnError,
  countError,
  descriptionError,
  discountError,
  downAmountError,
  downDueOnError,
  extraDiscountError,
  firstDueOnError,
  fromCents,
  inputCents,
  installmentLabel,
  isPaymentMethod,
  money,
  newIdempotencyKey,
  notesError,
  originalValueError,
  paymentAmountError,
  paymentDateError,
  receivedOn,
  refundDateError,
  planItems,
  planSummary,
  reasonError,
  refundAmountError,
  refundableCents,
  renegotiationBalance,
  saleBody,
  salePreview,
  toCents,
  todayIso,
} from '../lib/finance.js';
import { mount } from '../lib/dom.js';
import { formatDateOnly } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import { checkboxField, field, selectField } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';
import { attachPersonPicker, personIdError, personPickerField } from '../ui/person-picker.js';

// Diálogos do Financeiro. Como os de Oportunidade (deals-dialogs.js), nenhum chama toast() nem recarrega: devolvem o
// desfecho `{ saved, hadFailure, ... }` e quem chama decide a mensagem e o que recarregar.

const moneyPrefix = html`<span class="field-prefix" aria-hidden="true">R$</span>`;

function textareaField({ id, name, label, value = '', rows = 3, maxlength = 1000, hint = '' }) {
  return html`<div class="field">
    <label class="field-label" for="${id}">${label}</label>
    <div class="field-control"><textarea${attrs({ id, name, class: 'field-input', rows: String(rows), maxlength: String(maxlength), 'aria-describedby': [hint ? `${id}-hint` : null, `${id}-error`].filter(Boolean).join(' ') })}>${value}</textarea></div>
    ${hint ? html`<p class="field-hint" id="${id}-hint">${hint}</p>` : ''}
    <p class="field-error" id="${id}-error" role="alert"></p>
  </div>`;
}

/** Lista da prévia de parcelas (a mesma usada no registrar venda e no renegociar). */
function previewList(items, { caption }) {
  return html`<ol class="fin-preview-list" aria-label="${caption}">${items.map(
    (i) => html`<li class="fin-preview-item"><span class="fin-preview-name">${installmentLabel(i.number)}</span><span class="fin-preview-date">${formatDateOnly(i.dueOn)}</span><strong class="fin-preview-amount">${money(i.amount)}</strong></li>`,
  )}</ol>`;
}

/** Anuncia só o resumo da prévia (e só quando ele muda), não a lista inteira a cada tecla. */
function announcePreview(preview, status) {
  const text = preview.querySelector('.fin-preview-summary, .fin-preview-empty')?.textContent ?? '';
  if (status && status.textContent !== text) status.textContent = text;
}

function previewHtml(result, { simpleNote = '', totalLabel = 'Valor final' } = {}) {
  if (!result.ok) return html`<p class="fin-preview-empty">${result.message}</p>`;
  const summary = result.items.length === 1 && result.items[0].number === 1 && simpleNote ? simpleNote : planSummary(result.items);
  const down = result.items.find((i) => i.number === 0);
  return html`<p class="fin-preview-summary">${down ? `Entrada de ${money(down.amount)} + ` : ''}${summary}</p>
    ${previewList(result.items, { caption: 'Parcelas que serão geradas' })}
    <p class="fin-preview-total"><span>${totalLabel}</span><strong>${money(result.final)}</strong></p>`;
}

// ---------- Registrar venda ----------

function productOptions(products) {
  return [{ value: '', label: 'Nenhum' }, ...products.map((p) => ({ value: p.id, label: `${p.name} — ${formatMoney(p.price)}` }))];
}

function contactBlock(person) {
  if (person) {
    return html`<div class="field"><p class="field-label">Contato</p><p class="field-static">${person.name}</p><input type="hidden" name="personId" value="${person.id}"></div>`;
  }
  return personPickerField({ inputId: 'sale-person-search', searchName: 'personSearch', hint: 'Digite ao menos 2 letras do nome e escolha o contato na lista.' });
}

function saleDialogBody({ person, products, initial }) {
  const today = todayIso();
  return html`${contactBlock(person)}
    <div class="form-grid form-grid-2">
      ${field({ id: 'sale-description', label: 'Descrição', name: 'description', maxlength: 120, required: true, value: initial.description ?? '', hint: 'Aparece nas listas. Ex.: Mentoria individual — 6 meses' })}
      ${selectField({ id: 'sale-product', label: 'Produto (opcional)', name: 'productId', value: initial.productId ?? '', options: productOptions(products) })}
      ${field({ id: 'sale-original', label: 'Valor da venda', name: 'originalValue', inputmode: 'decimal', required: true, before: moneyPrefix, value: initial.originalValue ? moneyToInputText(initial.originalValue) : '', hint: 'Exemplo: 4.800,00' })}
      ${field({ id: 'sale-discount', label: 'Desconto (opcional)', name: 'discount', inputmode: 'decimal', before: moneyPrefix, value: '' })}
      ${field({ id: 'sale-closed', label: 'Data da venda', name: 'closedOn', type: 'date', required: true, value: initial.closedOn ?? today })}
      ${selectField({ id: 'sale-method', label: 'Forma de pagamento', name: 'paymentMethod', value: 'pix', options: PAYMENT_METHODS })}
    </div>
    <fieldset class="fin-mode">
      <legend class="field-label" id="sale-mode-legend">Como vai ser o pagamento?</legend>
      <div class="segments fin-mode-options" role="radiogroup" aria-labelledby="sale-mode-legend">${SALE_MODES.map(
        (m, i) => html`<button${attrs({ type: 'button', role: 'radio', class: 'segment', 'data-mode': m.value, 'aria-checked': String(i === 0), tabindex: i === 0 ? '0' : '-1' })}>${m.label}</button>`,
      )}</div>
      <input type="hidden" name="mode" value="simple">
    </fieldset>
    <div data-sale-mode="simple">
      ${checkboxField({ id: 'sale-received', name: 'receivedNowFlag', label: html`Já recebi este valor (o pagamento fica com a data da venda; se ela for futura, com a de hoje)` })}
    </div>
    <div data-sale-mode="installments" hidden>
      <div class="form-grid form-grid-2">
        ${field({ id: 'sale-down', label: 'Entrada (opcional)', name: 'downAmount', inputmode: 'decimal', before: moneyPrefix, value: '' })}
        ${field({ id: 'sale-down-due', label: 'Vencimento da entrada', name: 'downDueOn', type: 'date', value: initial.closedOn ?? today })}
      </div>
      ${checkboxField({ id: 'sale-down-received', name: 'downReceivedFlag', label: html`A entrada já foi paga (o pagamento fica com o vencimento dela; se ele for futuro, com a data de hoje)` })}
      <div class="form-grid form-grid-2">
        ${field({ id: 'sale-count', label: 'Número de parcelas', name: 'count', type: 'number', inputmode: 'numeric', value: '3', extra: { min: '1', max: String(MAX_INSTALLMENTS), step: '1' }, hint: `De 1 a ${MAX_INSTALLMENTS}, uma por mês.` })}
        ${field({ id: 'sale-first-due', label: 'Vencimento da 1ª parcela', name: 'firstDueOn', type: 'date', value: addMonths(initial.closedOn ?? today, 1) })}
      </div>
    </div>
    <section class="fin-preview" aria-labelledby="sale-preview-title">
      <h3 class="fin-preview-title" id="sale-preview-title">Prévia das parcelas</h3>
      <div id="sale-preview"></div>
      <p class="sr-only" id="sale-preview-status" role="status" aria-live="polite"></p>
    </section>
    ${textareaField({ id: 'sale-notes', name: 'notes', label: 'Observações (opcional)', value: '' })}`;
}

/** Liga a escolha do modo (botões de rádio), o produto que preenche valor/descrição e a prévia ao vivo. */
function wireSaleDialog(dialog, products) {
  const form = dialog.querySelector('form');
  const modeInput = form.elements.namedItem('mode');
  const options = [...dialog.querySelectorAll('[data-mode]')];
  const preview = dialog.querySelector('#sale-preview');
  const status = dialog.querySelector('#sale-preview-status');
  const value = (name) => form.elements.namedItem(name)?.value ?? '';

  function paintPreview() {
    const mode = value('mode');
    const original = inputCents(value('originalValue'));
    const result = salePreview({
      original,
      discount: inputCents(value('discount')) ?? 0,
      mode,
      closedOn: value('closedOn'),
      downAmount: inputCents(value('downAmount')),
      downDueOn: value('downDueOn'),
      count: Number(value('count')),
      firstDueOn: value('firstDueOn'),
    });
    const received = dialog.querySelector('#sale-received')?.checked;
    mount(preview, previewHtml(result, { simpleNote: mode === 'simple' && result.ok ? `Pagamento único de ${money(result.final)} com vencimento na data da venda${received ? `, recebido em ${formatDateOnly(receivedOn(value('closedOn')))}` : ''}` : '' }));
    announcePreview(preview, status);
  }

  function pick(option, { focus = false } = {}) {
    modeInput.value = option.dataset.mode;
    for (const other of options) {
      const on = other === option;
      other.setAttribute('aria-checked', String(on));
      other.tabIndex = on ? 0 : -1;
    }
    for (const block of dialog.querySelectorAll('[data-sale-mode]')) block.hidden = block.dataset.saleMode !== modeInput.value;
    if (focus) option.focus();
    paintPreview();
  }

  const group = dialog.querySelector('.fin-mode-options');
  group.addEventListener('click', (event) => {
    const option = event.target.closest('[data-mode]');
    if (option) pick(option);
  });
  group.addEventListener('keydown', (event) => {
    const index = options.indexOf(document.activeElement);
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (index < 0 || !move) return;
    event.preventDefault();
    pick(options[(index + move + options.length) % options.length], { focus: true });
  });

  const productSelect = dialog.querySelector('#sale-product');
  productSelect.addEventListener('change', () => {
    const product = products.find((p) => p.id === productSelect.value);
    if (!product) return;
    const original = form.elements.namedItem('originalValue');
    const description = form.elements.namedItem('description');
    if (!original.value.trim()) original.value = moneyToInputText(product.price);
    if (!description.value.trim()) description.value = product.name;
    paintPreview();
  });

  // A data da venda arrasta as datas sugeridas enquanto a aluna não as mudou.
  const closed = form.elements.namedItem('closedOn');
  const downDue = form.elements.namedItem('downDueOn');
  const firstDue = form.elements.namedItem('firstDueOn');
  let lastClosed = closed.value;
  closed.addEventListener('change', () => {
    if (downDue.value === lastClosed) downDue.value = closed.value;
    if (firstDue.value === addMonths(lastClosed, 1)) firstDue.value = addMonths(closed.value, 1);
    lastClosed = closed.value;
    paintPreview();
  });

  form.addEventListener('input', paintPreview);
  form.addEventListener('change', paintPreview);
  paintPreview();
}

/**
 * "Registrar venda". Opções:
 * - `person` ({ id, name }): contato já conhecido; sem ele, a aluna escolhe na busca;
 * - `deal`: oportunidade de origem (preenche valor, produto e descrição);
 * - `submit(body)`: envia o corpo (sem `personId`/`dealId` quando é a transição para Ganha). Padrão: POST /sales;
 * - `allowLater`: mostra "Registrar depois" (ganhar sem venda). Resolve `{ saved, hadFailure, later, result }`.
 */
export async function openSaleDialog({ api, person = null, deal = null, products = [], submit = null, allowLater = false, title = 'Registrar venda', description = null, submitLabel = 'Registrar venda' }) {
  let result = null;
  let later = false;
  let dialogEl = null;
  const initial = {
    description: deal?.productName ?? '',
    productId: deal?.productId && products.some((p) => p.id === deal.productId) ? deal.productId : '',
    originalValue: deal?.value ?? '',
    closedOn: todayIso(),
  };
  const send =
    submit ??
    ((body, values) => api.post('/api/v1/sales', { personId: person?.id ?? values.personId, ...(deal?.id ? { dealId: deal.id } : {}), ...body }));
  const outcome = await openTrackedFormDialog({
    title,
    description: description ?? 'Fechar não é receber: a venda registra o combinado; o dinheiro só conta como recebido quando um pagamento é lançado.',
    submitLabel,
    busyLabel: 'Registrando…',
    className: 'dialog-drawer fin-dialog',
    body: saleDialogBody({ person, products, initial }),
    validators: {
      ...(person ? {} : { personId: personIdError }),
      description: descriptionError,
      originalValue: originalValueError,
      discount: discountError,
      closedOn: closedOnError,
      downAmount: downAmountError,
      downDueOn: downDueOnError,
      count: countError,
      firstDueOn: firstDueOnError,
      notes: notesError,
    },
    onMount: (dialog) => {
      dialogEl = dialog;
      if (!person) attachPersonPicker(dialog, { api, inputId: 'sale-person-search' });
      wireSaleDialog(dialog, products);
      if (allowLater) {
        const actions = dialog.querySelector('.dialog-actions');
        const laterButton = document.createElement('button');
        laterButton.type = 'button';
        laterButton.className = 'btn btn-ghost';
        laterButton.textContent = 'Registrar depois';
        laterButton.addEventListener('click', () => {
          later = true;
          dialog.close();
        });
        actions.insertBefore(laterButton, actions.querySelector('[type="submit"]'));
      }
    },
    onSubmit: async (values) => {
      const body = saleBody(values, {
        receivedNow: Boolean(dialogEl?.querySelector('#sale-received')?.checked),
        downReceivedNow: Boolean(dialogEl?.querySelector('#sale-down-received')?.checked),
      });
      result = await send(body, values);
    },
  });
  return { ...outcome, later: later && !outcome.saved, result };
}

/**
 * Ganhar uma oportunidade: abre "Registrar venda" e envia a venda JUNTO com a transição para Ganha (mesma transação).
 * "Registrar depois" fecha sem nada enviar e devolve `later: true` (quem chama faz a transição simples).
 */
export function openWinSaleDialog({ api, deal, stageId, products = [] }) {
  return openSaleDialog({
    api,
    person: { id: deal.personId, name: deal.personName },
    deal,
    products,
    allowLater: true,
    title: 'Oportunidade ganha! Registrar a venda',
    description: 'A oportunidade só fica ganha quando você registrar a venda ou escolher “Registrar depois”. Fechar não é receber: o recebido só conta com pagamentos lançados.',
    submitLabel: 'Ganhar e registrar venda',
    submit: (body) => api.post(`/api/v1/deals/${encodeURIComponent(deal.id)}/stage-transitions`, { stageId, version: deal.version, sale: body }),
  });
}

// ---------- Registrar pagamento ----------

const payable = (sale) => (sale?.installments ?? []).filter((i) => toCents(i.remaining ?? '0') > 0 && i.status !== 'cancelled');

function installmentOptions(items) {
  return items.map((i) => ({ value: i.id, label: `${installmentLabel(i.number)} · vence ${formatDateOnly(i.dueOn)} · falta ${money(i.remaining)}` }));
}

/**
 * Registrar pagamento de uma parcela. Uma chave de idempotência nova por abertura: reenviar dentro do mesmo diálogo
 * (erro de rede) reaproveita a chave e o servidor não duplica. Resolve `{ saved, hadFailure, result }` (result = Sale).
 */
export async function openPaymentDialog({ api, sale, installmentId = null }) {
  const items = payable(sale);
  const idempotencyKey = newIdempotencyKey();
  const chosen = items.find((i) => i.id === installmentId) ?? items[0];
  let result = null;
  const remainingOf = (id) => toCents(items.find((i) => i.id === id)?.remaining ?? '0');
  const outcome = await openTrackedFormDialog({
    title: 'Registrar pagamento',
    description: `${sale.description} · ${sale.personName}. Lance só o que já entrou na conta.`,
    submitLabel: 'Registrar pagamento',
    busyLabel: 'Registrando…',
    className: 'fin-dialog',
    body: html`${selectField({ id: 'pay-installment', label: 'Parcela', name: 'installmentId', value: chosen?.id ?? '', options: installmentOptions(items) })}
      <div class="form-grid form-grid-2">
        ${field({ id: 'pay-amount', label: 'Valor recebido', name: 'amount', inputmode: 'decimal', required: true, before: moneyPrefix, value: chosen ? moneyToInputText(chosen.remaining) : '', hint: 'Pode ser parte da parcela.' })}
        ${field({ id: 'pay-date', label: 'Data do pagamento', name: 'paidOn', type: 'date', required: true, value: todayIso(), extra: { max: todayIso() } })}
      </div>
      ${selectField({ id: 'pay-method', label: 'Forma de pagamento', name: 'method', value: isPaymentMethod(sale.paymentMethod) ? sale.paymentMethod : 'pix', options: PAYMENT_METHODS })}
      ${textareaField({ id: 'pay-note', name: 'note', label: 'Observação (opcional)', rows: 2, maxlength: 500 })}`,
    validators: {
      installmentId: (value) => (items.some((i) => i.id === value) ? null : 'Escolha a parcela.'),
      amount: (value, all) => paymentAmountError(value, remainingOf(all.installmentId)),
      paidOn: (value) => paymentDateError(value),
      note: (value) => ([...String(value ?? '').trim()].length > 500 ? 'Observação muito longa (máximo 500).' : null),
    },
    onMount: (dialog) => {
      const select = dialog.querySelector('#pay-installment');
      const amount = dialog.querySelector('#pay-amount');
      select.addEventListener('change', () => {
        const item = items.find((i) => i.id === select.value);
        if (item) amount.value = moneyToInputText(item.remaining);
      });
    },
    onSubmit: async (values) => {
      const body = { installmentId: values.installmentId, amount: parseMoney(values.amount).value, paidOn: values.paidOn, method: values.method, idempotencyKey };
      const note = String(values.note ?? '').trim();
      if (note) body.note = note;
      result = await api.post(`/api/v1/sales/${encodeURIComponent(sale.id)}/payments`, body);
    },
  });
  return { ...outcome, result };
}

/** Há parcela com algo a receber? (sem isso, "Registrar pagamento" não abre). */
export const hasPayable = (sale) => sale?.status !== 'cancelled' && payable(sale).length > 0;

// ---------- Estornar ----------

export async function openRefundDialog({ api, sale, payment }) {
  const max = refundableCents(payment);
  const idempotencyKey = newIdempotencyKey();
  let result = null;
  const outcome = await openTrackedFormDialog({
    title: 'Estornar pagamento',
    description: `Pagamento de ${money(payment.amount)} em ${formatDateOnly(payment.paidOn)} (${installmentLabel(payment.installmentNumber)}). O estorno sai do recebido e a parcela volta a ficar em aberto.`,
    submitLabel: 'Estornar',
    busyLabel: 'Estornando…',
    className: 'fin-dialog',
    body: html`<div class="form-grid form-grid-2">
        ${field({ id: 'refund-amount', label: 'Valor a estornar', name: 'amount', inputmode: 'decimal', required: true, before: moneyPrefix, value: moneyToInputText(fromCents(max)), hint: `Máximo ${money(fromCents(max))}.` })}
        ${field({ id: 'refund-date', label: 'Data do estorno', name: 'paidOn', type: 'date', required: true, value: todayIso(), extra: { max: todayIso(), min: payment.paidOn } })}
      </div>
      ${textareaField({ id: 'refund-reason', name: 'reason', label: 'Motivo', rows: 2, maxlength: 500, hint: 'Ex.: cliente desistiu, cobrança em duplicidade.' })}`,
    validators: {
      amount: (value) => refundAmountError(value, max),
      paidOn: (value) => refundDateError(value, { paidOn: payment.paidOn }),
      reason: (value) => reasonError(value, { empty: 'Conte o motivo do estorno.' }),
    },
    onSubmit: async (values) => {
      result = await api.post(`/api/v1/sales/${encodeURIComponent(sale.id)}/payments/${encodeURIComponent(payment.id)}/refund`, {
        amount: parseMoney(values.amount).value,
        reason: values.reason.trim(),
        paidOn: values.paidOn,
        idempotencyKey,
      });
    },
  });
  return { ...outcome, result };
}

// ---------- Cancelar venda ----------

export async function openCancelSaleDialog({ api, sale }) {
  let result = null;
  const received = toCents(sale.received ?? '0') > 0;
  const outcome = await openTrackedFormDialog({
    title: 'Cancelar esta venda?',
    description: `As parcelas em aberto deixam de ser cobradas.${received ? ` O que já foi recebido (${money(sale.received)}) continua recebido até você estornar os pagamentos.` : ''} A venda fica no histórico como cancelada.`,
    submitLabel: 'Cancelar venda',
    busyLabel: 'Cancelando…',
    className: 'fin-dialog fin-dialog-danger',
    body: textareaField({ id: 'cancel-reason', name: 'reason', label: 'Motivo do cancelamento', rows: 3, maxlength: 500 }),
    validators: { reason: (value) => reasonError(value, { empty: 'Conte por que a venda foi cancelada.' }) },
    onSubmit: async (values) => {
      result = await api.post(`/api/v1/sales/${encodeURIComponent(sale.id)}/cancel`, { reason: values.reason.trim(), version: sale.version });
    },
  });
  return { ...outcome, result };
}

// ---------- Renegociar ----------

export async function openRenegotiateDialog({ api, sale }) {
  const balance = renegotiationBalance(sale);
  let result = null;
  const firstDefault = addMonths(todayIso(), 1);
  const outcome = await openTrackedFormDialog({
    title: 'Renegociar o saldo',
    description: `Saldo a reparcelar: ${money(fromCents(balance))}. As parcelas já pagas ficam como estão; uma parcela paga em parte fica com o valor pago e o restante entra no novo plano.`,
    submitLabel: 'Renegociar',
    busyLabel: 'Renegociando…',
    className: 'dialog-drawer fin-dialog',
    body: html`<div class="form-grid form-grid-2">
        ${field({ id: 'reneg-count', label: 'Número de parcelas', name: 'count', type: 'number', inputmode: 'numeric', value: '1', extra: { min: '1', max: String(MAX_INSTALLMENTS), step: '1' }, hint: 'Uma por mês.' })}
        ${field({ id: 'reneg-first', label: 'Vencimento da 1ª parcela', name: 'firstDueOn', type: 'date', value: firstDefault })}
        ${field({ id: 'reneg-discount', label: 'Abatimento (opcional)', name: 'extraDiscount', inputmode: 'decimal', before: moneyPrefix, hint: 'Aumenta o desconto da venda.' })}
      </div>
      <section class="fin-preview" aria-labelledby="reneg-preview-title">
        <h3 class="fin-preview-title" id="reneg-preview-title">Novas parcelas</h3>
        <div id="reneg-preview"></div>
        <p class="sr-only" id="reneg-preview-status" role="status" aria-live="polite"></p>
      </section>
      ${textareaField({ id: 'reneg-reason', name: 'reason', label: 'Motivo', rows: 2, maxlength: 500, hint: 'Ex.: cliente pediu mais prazo.' })}`,
    validators: {
      count: countError,
      firstDueOn: firstDueOnError,
      extraDiscount: (value) => extraDiscountError(value, balance),
      reason: (value) => reasonError(value, { empty: 'Conte o motivo da renegociação.' }),
    },
    onMount: (dialog) => {
      const form = dialog.querySelector('form');
      const preview = dialog.querySelector('#reneg-preview');
      const value = (name) => form.elements.namedItem(name)?.value ?? '';
      const paint = () => {
        const extra = inputCents(value('extraDiscount')) ?? 0;
        const total = balance - extra;
        const plan = planItems({ total, count: Number(value('count')), firstDueOn: value('firstDueOn') });
        mount(preview, previewHtml(plan.ok ? { ...plan, final: fromCents(total) } : plan, { totalLabel: 'Total renegociado' }));
        announcePreview(preview, dialog.querySelector('#reneg-preview-status'));
      };
      form.addEventListener('input', paint);
      paint();
    },
    onSubmit: async (values) => {
      const body = { version: sale.version, reason: values.reason.trim(), plan: { count: Number(values.count), firstDueOn: values.firstDueOn } };
      const extra = inputCents(values.extraDiscount);
      if (extra) body.extraDiscount = fromCents(extra);
      result = await api.post(`/api/v1/sales/${encodeURIComponent(sale.id)}/renegotiate`, body);
    },
  });
  return { ...outcome, result };
}

// ---------- Editar dados ----------

export function openEditSaleDialog({ api, sale }) {
  return openTrackedFormDialog({
    title: 'Editar venda',
    description: 'Valores e parcelas não mudam aqui: para mudar o plano, use “Renegociar”.',
    className: 'fin-dialog',
    body: html`${field({ id: 'edit-sale-description', label: 'Descrição', name: 'description', maxlength: 120, required: true, value: sale.description ?? '' })}
      ${selectField({ id: 'edit-sale-method', label: 'Forma de pagamento', name: 'paymentMethod', value: sale.paymentMethod, options: PAYMENT_METHODS })}
      ${textareaField({ id: 'edit-sale-notes', name: 'notes', label: 'Observações', value: sale.notes ?? '' })}`,
    validators: { description: descriptionError, notes: notesError },
    onSubmit: async (values) => {
      const notes = String(values.notes ?? '').trim();
      await api.patch(`/api/v1/sales/${encodeURIComponent(sale.id)}`, { description: values.description.trim(), paymentMethod: values.paymentMethod, notes: notes || null, version: sale.version });
    },
  });
}

// ---------- oportunidade ganha com venda ativa ----------

export const DEAL_HAS_SALE_MESSAGE = 'Esta oportunidade tem uma venda registrada. Cancele a venda antes de reabrir.';

/** Venda ATIVA ligada à oportunidade (null se não houver ou se não deu para consultar). */
export async function activeSaleOfDeal(api, deal) {
  try {
    const result = await api.get(`/api/v1/sales?personId=${encodeURIComponent(deal.personId)}&limit=100`);
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    return rows.find((s) => s.dealId === deal.id && s.status === 'active') ?? null;
  } catch {
    return null;
  }
}

/**
 * Explica por que a oportunidade ganha não sai de Ganha (409 deal_has_sale do servidor ou checagem prévia):
 * achando a venda, um diálogo oferece "Abrir venda"; sem ela, um aviso com a mensagem do servidor.
 */
export async function explainDealHasSale({ api, deal, navigate, sale = undefined, message = DEAL_HAS_SALE_MESSAGE }) {
  const found = sale === undefined ? await activeSaleOfDeal(api, deal) : sale;
  if (!found) {
    toast(message, { tone: 'danger' });
    return;
  }
  const open = await confirmDialog({
    title: 'Esta oportunidade tem uma venda',
    message: `${message} Venda: ${found.description} (${money(found.finalValue)}).`,
    confirmLabel: 'Abrir venda',
    cancelLabel: 'Fechar',
  });
  if (open) navigate(`/comercial/vendas/${encodeURIComponent(found.id)}`);
}
