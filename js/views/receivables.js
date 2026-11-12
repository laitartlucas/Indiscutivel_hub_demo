import { describeError } from '../lib/api.js';
import { RECEIVABLE_SEGMENTS, dueRelative, installmentLabel, installmentStatusLabel, installmentStatusTone, isReceivableStatus, money, toCents, todayIso } from '../lib/finance.js';
import { normalizePage, pageOffset, recoveryOffset } from '../lib/list-state.js';
import { mount } from '../lib/dom.js';
import { formatDateOnly } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery, hashParam, pageInfo } from '../lib/query.js';
import { renderShell } from '../shell.js';
import { badge, button, emptyState } from '../ui/components.js';
import { COMMERCIAL_EYEBROW, commercialTabs } from '../ui/commercial-tabs.js';
import { createListLoader } from '../ui/list-view.js';
import { dataTable, pager } from '../ui/table.js';
import { toast } from '../ui/toast.js';
import { hasPayable, openPaymentDialog } from './sale-dialogs.js';
import { saleHref } from './sales.js';

const LIMIT = 20;

/** Selo da parcela (Vencida, Paga em parte, Em aberto...): a palavra sempre vai junto com a cor. */
export function installmentBadge(status) {
  return badge(installmentStatusLabel(status), installmentStatusTone(status));
}

function columns(today) {
  return [
    {
      key: 'dueOn',
      label: 'Vencimento',
      nowrap: true,
      render: (r) => html`<span class="fin-due"><span>${formatDateOnly(r.dueOn)}</span><span${attrs({ class: `fin-due-rel${r.status === 'overdue' ? ' is-late' : ''}` })}>${dueRelative(r.dueOn, today)}</span></span>`,
    },
    {
      key: 'personName',
      label: 'Cliente',
      render: (r) => html`<a class="lead-cell fin-cell" href="${saleHref(r.saleId)}"><span class="lead-cell-text"><span class="lead-cell-name">${r.personName ?? '—'}</span><span class="lead-cell-sub">${r.saleDescription ?? ''}</span></span></a>`,
    },
    { key: 'number', label: 'Parcela', nowrap: true, render: (r) => installmentLabel(r.number) },
    { key: 'amount', label: 'Valor', align: 'end', nowrap: true, optional: true, render: (r) => money(r.amount) },
    { key: 'remaining', label: 'Falta', align: 'end', nowrap: true, render: (r) => html`<strong>${money(r.remaining)}</strong>` },
    { key: 'status', label: 'Situação', nowrap: true, render: (r) => installmentBadge(r.status) },
    {
      key: 'actions',
      label: 'Ações',
      nowrap: true,
      render: (r) => button({ label: 'Registrar pagamento', variant: 'ghost', small: true, extra: { 'data-action': 'pay', 'data-id': r.id, 'aria-label': `Registrar pagamento de ${installmentLabel(r.number)} de ${r.personName ?? 'cliente'}` } }),
    },
  ];
}

function segments(current) {
  return html`${RECEIVABLE_SEGMENTS.map((s) => html`<button${attrs({ type: 'button', class: 'segment', 'data-segment': s.id, 'aria-pressed': String(s.id === current) })}>${s.label}</button>`)}`;
}

function totalsHtml(totals) {
  const tiles = [
    { label: 'Vencido', value: totals ? money(totals.overdue ?? '0.00') : '·', note: 'parcelas que já passaram do vencimento', bad: Boolean(totals) && toCents(totals.overdue ?? '0') > 0 },
    { label: 'Em aberto', value: totals ? money(totals.open ?? '0.00') : '·', note: 'tudo o que falta receber' },
  ];
  return html`<section class="fin-kpis fin-kpis-2" aria-label="Totais a receber">${tiles.map(
    (t) => html`<div${attrs({ class: `fin-kpi${t.bad ? ' is-bad' : ''}`, role: 'group', 'aria-label': t.label })}><span class="lead-kpi-label">${t.label}</span><span class="fin-kpi-value">${t.value}</span><span class="lead-kpi-note">${t.note}</span></div>`,
  )}</section>`;
}

const EMPTY = {
  overdue: { title: 'Nada vencido', message: 'Nenhuma parcela passou do vencimento. Bom trabalho!' },
  upcoming: { title: 'Nada vence nos próximos 30 dias', message: 'Quando houver parcelas perto do vencimento, elas aparecem aqui.' },
  open: { title: 'Nada a receber', message: 'Todas as parcelas das suas vendas estão pagas. Ao registrar uma venda parcelada, as parcelas aparecem aqui.' },
};

export function renderReceivables({ root, session, api, navigate }) {
  const fromHash = hashParam('status');
  const state = { status: isReceivableStatus(fromHash) ? fromHash : 'open', offset: 0 };
  let rows = [];
  let totals = null;
  let disposed = false;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'commercial',
    heading: 'A receber',
    eyebrow: COMMERCIAL_EYEBROW,
    subtitle: 'Parcelas vencidas e a vencer. Registre o pagamento quando o dinheiro entrar.',
    actions: html`<a class="btn btn-ghost" href="#/comercial/vendas">Ver vendas</a>`,
    content: html`${commercialTabs('receivables')}
      <div id="rcv-totals">${totalsHtml(null)}</div>
      <div class="segments" role="group" aria-label="Filtrar parcelas" id="rcv-segments">${segments(state.status)}</div>
      <div id="list-region" aria-live="off"></div>`,
  });

  const region = root.querySelector('#list-region');
  const segmentsEl = root.querySelector('#rcv-segments');
  const totalsEl = root.querySelector('#rcv-totals');

  const loader = createListLoader({
    region,
    errorTitle: 'Não foi possível carregar o que há a receber',
    fallback: () => segmentsEl.querySelector('[aria-pressed="true"]'),
    fetchData: async () => {
      const raw = await api.get(`/api/v1/receivables${buildQuery({ status: state.status, limit: LIMIT, offset: state.offset })}`);
      if (raw?.totals && !disposed) {
        totals = raw.totals;
        mount(totalsEl, totalsHtml(totals));
      }
      return normalizePage(raw, { limit: LIMIT, offset: state.offset });
    },
    recover: (result) => {
      const offset = recoveryOffset(result, state.offset, LIMIT);
      if (offset === null) return false;
      state.offset = offset;
      return true;
    },
    paint: (result) => {
      rows = result.data;
      if (rows.length === 0) {
        const e = EMPTY[state.status] ?? EMPTY.open;
        mount(region, emptyState({ iconName: 'calendar', title: e.title, message: e.message }));
        return;
      }
      const { limit, offset, total } = result.page;
      mount(region, html`${dataTable({ caption: 'Parcelas a receber', columns: columns(todayIso()), rows })}${pager({ info: pageInfo({ limit, offset, total }), total })}`);
    },
  });

  async function pay(row) {
    let sale;
    try {
      sale = await api.get(`/api/v1/sales/${encodeURIComponent(row.saleId)}`);
    } catch (error) {
      if (!disposed) toast(describeError(error), { tone: 'danger' });
      return;
    }
    if (disposed) return;
    if (!hasPayable(sale)) {
      toast('Esta parcela já não tem valor a receber. Atualizamos a lista.', { tone: 'warn' });
      await loader.load();
      return;
    }
    await loader.settle(await openPaymentDialog({ api, sale, installmentId: row.id }), 'Pagamento registrado.');
  }

  region.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      state.offset = pageOffset(pageButton.dataset.page, state.offset, LIMIT);
      loader.load();
      return;
    }
    const target = event.target.closest('[data-action="pay"]');
    const row = target && rows.find((r) => r.id === target.dataset.id);
    if (row) loader.runLocked(row.id, () => pay(row));
  });
  segmentsEl.addEventListener('click', (event) => {
    const segment = event.target.closest('[data-segment]');
    if (!segment || segment.getAttribute('aria-pressed') === 'true') return;
    for (const other of segmentsEl.querySelectorAll('[data-segment]')) other.setAttribute('aria-pressed', String(other === segment));
    state.status = segment.dataset.segment;
    state.offset = 0;
    loader.load();
  });

  loader.load();

  return () => {
    disposed = true;
    loader.dispose();
    disposeShell();
  };
}
