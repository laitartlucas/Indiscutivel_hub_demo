import { describeError } from '../lib/api.js';
import {
  installmentLabel,
  money,
  paymentMethodLabel,
  refundableCents,
  renegotiationBalance,
  saleEventView,
  saleSummary,
  toCents,
} from '../lib/finance.js';
import { mount } from '../lib/dom.js';
import { dateFormatter, dateTimeFormatter, formatDateOnly } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, emptyState, skeleton } from '../ui/components.js';
import { COMMERCIAL_EYEBROW, commercialTabs } from '../ui/commercial-tabs.js';
import { dataTable } from '../ui/table.js';
import { toast } from '../ui/toast.js';
import { installmentBadge } from './receivables.js';
import { hasPayable, openCancelSaleDialog, openEditSaleDialog, openPaymentDialog, openRefundDialog, openRenegotiateDialog } from './sale-dialogs.js';
import { saleStatusBadge } from './sales.js';

function summaryStrip(sale) {
  return html`<section class="lead-kpis cc-contact-kpis" aria-label="Resumo financeiro da venda">${saleSummary(sale).map(
    (k) => html`<div class="lead-kpi"><span class="lead-kpi-label">${k.label}</span><span class="lead-kpi-line"><span${attrs({ class: `lead-kpi-value cc-kpi-sm${k.gold ? ' is-gold' : ''}${k.bad ? ' fin-is-bad' : ''}` })}>${k.value}</span></span><span class="lead-kpi-note">${k.note}</span></div>`,
  )}</section>`;
}

function hero(sale) {
  const cancelled = sale.status === 'cancelled';
  const canPay = hasPayable(sale);
  const canRenegotiate = !cancelled && renegotiationBalance(sale) > 0;
  return html`<section class="od-hero fin-hero" aria-label="Resumo da venda">
    <div class="od-hero-top">
      <div class="od-hero-main">
        <div class="od-who">
          <a class="od-company" href="#/comercial/contatos/${encodeURIComponent(sale.personId)}">${icon('contatos', { size: 16 })}<strong>${sale.personName}</strong></a>
          ${sale.productName ? html`<span class="od-dot" aria-hidden="true">·</span><span>${sale.productName}</span>` : ''}
          ${sale.dealId ? html`<span class="od-dot" aria-hidden="true">·</span><a class="cc-tl-link fin-inline-link" href="#/comercial/oportunidades/${encodeURIComponent(sale.dealId)}">Ver oportunidade</a>` : ''}
        </div>
        <div class="lead-badges">${saleStatusBadge(sale.financialStatus)}${badge(sale.mode === 'installments' ? `Parcelado · ${sale.installmentsCount ?? 0}x` : 'Pagamento único', 'neutral')}</div>
        <p class="od-closed muted">Vendida em ${formatDateOnly(sale.closedOn)} · ${paymentMethodLabel(sale.paymentMethod)}</p>
        ${cancelled ? html`<p class="od-reason"><strong>Cancelada${sale.cancelledAt ? ` em ${dateFormatter.format(new Date(sale.cancelledAt))}` : ''}:</strong> ${sale.cancelReason ?? ''}</p>` : ''}
      </div>
      <div class="od-value"><span class="lead-kpi-label">Valor final</span><span class="od-value-amount">${money(sale.finalValue)}</span></div>
    </div>
    <div class="od-actions">
      ${button({ label: 'Editar', variant: 'ghost', extra: { 'data-action': 'edit' } })}
      ${canRenegotiate ? button({ label: 'Renegociar', variant: 'ghost', extra: { 'data-action': 'renegotiate' } }) : ''}
      ${cancelled ? '' : html`<button type="button" class="btn btn-lost" data-action="cancel">Cancelar venda</button>`}
      ${canPay ? html`<button type="button" class="btn btn-gold" data-action="pay">${icon('plus', { size: 16 })}<span>Registrar pagamento</span></button>` : ''}
    </div>
  </section>`;
}

function installmentsCard(sale) {
  const items = sale.installments ?? [];
  const canPay = sale.status !== 'cancelled';
  const columns = [
    { key: 'number', label: 'Parcela', nowrap: true, render: (i) => installmentLabel(i.number) },
    { key: 'dueOn', label: 'Vencimento', nowrap: true, render: (i) => formatDateOnly(i.dueOn) },
    { key: 'amount', label: 'Valor', align: 'end', nowrap: true, render: (i) => money(i.amount) },
    { key: 'paid', label: 'Pago', align: 'end', nowrap: true, optional: true, render: (i) => money(i.paid) },
    { key: 'remaining', label: 'Falta', align: 'end', nowrap: true, render: (i) => money(i.remaining) },
    { key: 'status', label: 'Situação', nowrap: true, render: (i) => installmentBadge(i.status) },
    {
      key: 'actions',
      label: 'Ações',
      nowrap: true,
      render: (i) =>
        canPay && toCents(i.remaining) > 0 && i.status !== 'cancelled'
          ? button({ label: 'Registrar pagamento', variant: 'ghost', small: true, extra: { 'data-action': 'pay-installment', 'data-id': i.id, 'aria-label': `Registrar pagamento da ${installmentLabel(i.number).toLowerCase()}` } })
          : '—',
    },
  ];
  return html`<section class="lead-card fin-card" aria-labelledby="fin-inst-title">
    <div class="od-card-head"><h2 id="fin-inst-title" class="lead-card-title">Parcelas</h2><span class="od-card-count">${items.length}</span></div>
    ${items.length === 0 ? html`<p class="muted od-none">Nenhuma parcela vigente.</p>` : dataTable({ caption: 'Parcelas da venda', columns, rows: items })}
  </section>`;
}

function paymentsCard(sale) {
  const payments = sale.payments ?? [];
  const columns = [
    { key: 'paidOn', label: 'Data', nowrap: true, render: (p) => formatDateOnly(p.paidOn) },
    { key: 'installment', label: 'Parcela', nowrap: true, render: (p) => installmentLabel(p.installmentNumber) },
    { key: 'kind', label: 'Tipo', nowrap: true, render: (p) => (p.refundOf ? badge('Estorno', 'bad') : badge(paymentMethodLabel(p.method), 'good')) },
    { key: 'amount', label: 'Valor', align: 'end', nowrap: true, render: (p) => html`<span${attrs({ class: toCents(p.amount) < 0 ? 'fin-negative' : false })}>${money(p.amount)}</span>` },
    {
      key: 'note',
      label: 'Observação',
      optional: true,
      render: (p) => html`${p.note ?? ''}${!p.refundOf && toCents(p.refundedTotal ?? '0') !== 0 ? html`<span class="fin-sub">Estornado: ${money(String(p.refundedTotal).replace('-', ''))}</span>` : ''}`,
    },
    {
      key: 'actions',
      label: 'Ações',
      nowrap: true,
      render: (p) => (refundableCents(p) > 0 ? button({ label: 'Estornar', variant: 'ghost', small: true, extra: { 'data-action': 'refund', 'data-id': p.id, 'aria-label': `Estornar pagamento de ${money(p.amount)} em ${formatDateOnly(p.paidOn)}` } }) : '—'),
    },
  ];
  return html`<section class="lead-card fin-card" aria-labelledby="fin-pay-title">
    <div class="od-card-head"><h2 id="fin-pay-title" class="lead-card-title">Pagamentos e estornos</h2><span class="od-card-count">${payments.length}</span></div>
    ${payments.length === 0
      ? html`<p class="muted od-none">Nenhum pagamento lançado ainda. O recebido só conta quando você registra um pagamento.</p>`
      : dataTable({ caption: 'Pagamentos e estornos da venda', columns, rows: payments })}
  </section>`;
}

function eventsCard(sale) {
  const events = [...(sale.events ?? [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return html`<section class="lead-card" aria-labelledby="fin-events-title">
    <h2 id="fin-events-title" class="lead-card-title">Histórico</h2>
    ${events.length === 0
      ? html`<p class="muted od-none">Nada registrado ainda.</p>`
      : html`<ol class="tl-list">${events.map((e, index) => {
          const view = saleEventView(e);
          return html`<li${attrs({ class: `tl-item${index === 0 ? ' is-latest' : ''}` })}>
            <span class="tl-icon" aria-hidden="true">${icon(view.icon, { size: 16 })}</span>
            <div class="tl-body">
              <div class="tl-head"><span class="tl-kind">${view.title}</span><span class="tl-when">${e.createdAt ? dateTimeFormatter.format(new Date(e.createdAt)) : ''}</span></div>
              ${view.text ? html`<p class="tl-text">${view.text}</p>` : ''}
              ${view.reason ? html`<p class="tl-text">Motivo: ${view.reason}</p>` : ''}
            </div>
          </li>`;
        })}</ol>`}
  </section>`;
}

function notesCard(sale) {
  return html`<section class="lead-card od-card" aria-labelledby="fin-notes-title">
    <h2 id="fin-notes-title" class="lead-card-title">Observações</h2>
    ${sale.notes ? html`<p class="od-notes">${sale.notes}</p>` : html`<p class="muted od-none">Nenhuma observação.</p>`}
  </section>`;
}

export function renderSaleDetail({ root, session, api, navigate, params }) {
  const base = `/api/v1/sales/${encodeURIComponent(params.id)}`;
  let disposed = false;
  let seq = 0;
  let sale = null;
  let built = false;
  let busy = false;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'commercial',
    heading: 'Venda',
    eyebrow: html`${COMMERCIAL_EYEBROW} · <a class="back-link" href="#/comercial/vendas">← Vendas</a>`,
    content: html`${commercialTabs('sales')}<div id="sale-page" aria-live="off">${skeleton(4)}</div>`,
  });

  const page = root.querySelector('#sale-page');
  const heading = root.querySelector('h1');
  const stillHere = (mine) => !disposed && mine === seq;

  function paint() {
    heading.textContent = sale.description;
    mount(
      page,
      html`${hero(sale)}${summaryStrip(sale)}
        <div class="lead-grid">
          <div class="lead-side">${installmentsCard(sale)}${paymentsCard(sale)}</div>
          <div class="lead-side">${eventsCard(sale)}${notesCard(sale)}</div>
        </div>`,
    );
    built = true;
  }

  const notFound = () =>
    html`<section class="lead-card" aria-label="Venda não encontrada">${emptyState({
      iconName: 'crm',
      title: 'Venda não encontrada',
      message: 'O endereço pode estar incorreto.',
      action: html`<a class="btn btn-primary" href="#/comercial/vendas">Voltar para Vendas</a>`,
    })}</section>`;

  async function load({ silent = false } = {}) {
    const mine = ++seq;
    if (!silent || !built) mount(page, skeleton(4));
    try {
      const fresh = await api.get(base);
      if (!stillHere(mine)) return;
      sale = fresh;
      paint();
    } catch (error) {
      if (!stillHere(mine)) return;
      if (silent && built) return void toast(describeError(error), { tone: 'danger' });
      built = false;
      heading.textContent = 'Venda';
      mount(
        page,
        error?.status === 404
          ? notFound()
          : html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar a venda', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`,
      );
    }
  }

  /** Desfecho de um diálogo: salvou → aviso e mostra a venda devolvida (ou recarrega); falhou → recarrega (versão velha). */
  async function settle(outcome, message) {
    if (disposed) return;
    if (outcome.saved) toast(message, { tone: 'success' });
    if (outcome.saved && outcome.result?.id === sale.id && Array.isArray(outcome.result.installments)) {
      sale = outcome.result;
      paint();
      return;
    }
    if (outcome.saved || outcome.hadFailure) await load({ silent: true });
  }

  const actions = {
    pay: async () => settle(await openPaymentDialog({ api, sale }), 'Pagamento registrado.'),
    'pay-installment': async (target) => settle(await openPaymentDialog({ api, sale, installmentId: target.dataset.id }), 'Pagamento registrado.'),
    refund: async (target) => {
      const payment = (sale.payments ?? []).find((p) => p.id === target.dataset.id);
      if (payment) await settle(await openRefundDialog({ api, sale, payment }), 'Estorno registrado.');
    },
    cancel: async () => settle(await openCancelSaleDialog({ api, sale }), 'Venda cancelada. As parcelas em aberto deixaram de ser cobradas.'),
    renegotiate: async () => settle(await openRenegotiateDialog({ api, sale }), 'Venda renegociada. As novas parcelas já estão na lista.'),
    edit: async () => settle(await openEditSaleDialog({ api, sale }), 'Venda atualizada.'),
  };

  const onClick = async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'retry') return void load();
    if (busy || sale === null || !Object.hasOwn(actions, action)) return;
    busy = true; // uma ação por vez: a segunda usaria uma versão já velha
    try {
      await actions[action](target);
    } finally {
      busy = false;
    }
  };
  page.addEventListener('click', onClick);

  load();

  return () => {
    disposed = true;
    page.removeEventListener('click', onClick);
    disposeShell();
  };
}
