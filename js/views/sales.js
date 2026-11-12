import { describeError } from '../lib/api.js';
import { isPeriod, listOf, periodRange } from '../lib/commercial.js';
import { SALE_SEGMENTS, financeKpis, isSaleStatus, money, saleStatusLabel, saleStatusTone } from '../lib/finance.js';
import { mount } from '../lib/dom.js';
import { formatDateOnly } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery, hashParam, parseSort } from '../lib/query.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { badge, button, emptyState, searchField, selectField } from '../ui/components.js';
import { COMMERCIAL_EYEBROW, commercialTabs } from '../ui/commercial-tabs.js';
import { createListView } from '../ui/list-view.js';
import { actionMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { hasPayable, openPaymentDialog, openSaleDialog } from './sale-dialogs.js';

const SORT_OPTIONS = [
  { value: 'closed_on:desc', label: 'Mais recentes' },
  { value: 'closed_on:asc', label: 'Mais antigas' },
  { value: 'final_value:desc', label: 'Maior valor' },
  { value: 'next_due:asc', label: 'Próximo vencimento' },
];
const DEFAULT_SORT = 'closed_on:desc';
// Mesmo vocabulário do quadro, mas o período aqui é sobre a data da venda.
const PERIOD_OPTIONS = [
  { value: '', label: 'Qualquer data' },
  { value: 'month', label: 'Vendidas este mês' },
  { value: 'quarter', label: 'Vendidas no trimestre' },
  { value: 'year', label: 'Vendidas este ano' },
];

export const saleHref = (id) => `#/comercial/vendas/${encodeURIComponent(id)}`;

/** Selo da situação financeira da venda (a palavra carrega o sentido). */
export function saleStatusBadge(status) {
  return badge(saleStatusLabel(status), saleStatusTone(status));
}

const rowMenu = (row) =>
  actionMenu({
    label: `Mais ações da venda ${row.description}`,
    id: row.id,
    items: [
      { label: 'Abrir venda', action: 'open', id: row.id },
      ...(row.status !== 'cancelled' && row.financialStatus !== 'settled' ? [{ label: 'Registrar pagamento', action: 'pay', id: row.id }] : []),
      { label: 'Abrir contato', action: 'contact', id: row.id },
    ],
  });

const COLUMNS = [
  {
    key: 'description',
    label: 'Venda',
    render: (row) => html`<a class="lead-cell fin-cell" href="${saleHref(row.id)}"><span class="lead-cell-text"><span class="lead-cell-name">${row.description}</span><span class="lead-cell-sub">${row.personName ?? ''}</span></span></a>`,
  },
  { key: 'closedOn', label: 'Data da venda', nowrap: true, optional: true, render: (row) => formatDateOnly(row.closedOn) },
  { key: 'finalValue', label: 'Valor', align: 'end', nowrap: true, render: (row) => money(row.finalValue) },
  { key: 'received', label: 'Recebido', align: 'end', nowrap: true, render: (row) => money(row.received) },
  { key: 'pending', label: 'Saldo', align: 'end', nowrap: true, render: (row) => (row.status === 'cancelled' ? '—' : money(row.pending)) },
  { key: 'nextDueOn', label: 'Próximo vencimento', nowrap: true, optional: true, render: (row) => (row.nextDueOn && row.status !== 'cancelled' ? formatDateOnly(row.nextDueOn) : '—') },
  { key: 'financialStatus', label: 'Situação', nowrap: true, render: (row) => saleStatusBadge(row.financialStatus) },
  { key: 'actions', label: 'Ações', nowrap: true, render: rowMenu },
];

function segments(current) {
  return html`${SALE_SEGMENTS.map((s) => html`<button${attrs({ type: 'button', class: 'segment', 'data-segment': s.id, 'aria-pressed': String(s.id === current) })}>${s.label}</button>`)}`;
}

/** Faixa de totais: número de vendas da lista, contratado e recebido do período (se houver) e a fotografia de hoje. */
function totalsHtml({ count, overview, period }) {
  const k = overview ? financeKpis(overview) : null;
  const tiles = [{ label: 'Vendas', value: count === null ? '·' : String(count), note: 'com os filtros atuais' }];
  if (k && period) tiles.push(k[0], k[1]);
  if (k) tiles.push(k[2], k[3]);
  return html`<section class="fin-kpis" aria-label="Totais">${tiles.map(
    (t) => html`<div${attrs({ class: `fin-kpi${t.gold ? ' is-gold' : ''}${t.bad ? ' is-bad' : ''}`, role: 'group', 'aria-label': t.label })}><span class="lead-kpi-label">${t.label}</span><span class="fin-kpi-value">${t.value}</span><span class="lead-kpi-note">${t.note}</span></div>`,
  )}</section>`;
}

export function renderSales({ root, session, api, navigate }) {
  const fromHash = hashParam('situacao');
  const initialStatus = isSaleStatus(fromHash) ? fromHash : '';
  const initialPeriod = isPeriod(hashParam('periodo')) ? hashParam('periodo') : '';
  let disposed = false;
  let period = initialPeriod;
  let count = null;
  let overview = null;
  let overviewSeq = 0;
  let products = null;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'commercial',
    heading: 'Vendas',
    eyebrow: COMMERCIAL_EYEBROW,
    subtitle: 'O que você vendeu e quanto já entrou. Fechar não é receber: o recebido vem dos pagamentos lançados.',
    actions: button({ label: 'Nova venda', id: 'new-sale', iconStart: icon('plus') }),
    content: html`${commercialTabs('sales')}
      <div id="sales-totals" aria-live="off"></div>
      <div class="segments" role="group" aria-label="Filtrar por situação" id="sales-segments">${segments(initialStatus)}</div>
      <div class="toolbar">
        <div class="toolbar-search">${searchField({ id: 'sales-search', label: 'Buscar venda', placeholder: 'Buscar por cliente ou descrição…' })}</div>
        <div class="toolbar-actions">
          ${selectField({ id: 'sales-period', label: 'Período', value: initialPeriod, options: PERIOD_OPTIONS })}
          ${selectField({ id: 'sales-sort', label: 'Ordenar por', value: DEFAULT_SORT, options: SORT_OPTIONS })}
        </div>
      </div>
      <div id="list-region" aria-live="off"></div>`,
  });

  const totalsEl = root.querySelector('#sales-totals');
  const segmentsEl = root.querySelector('#sales-segments');
  const paintTotals = () => mount(totalsEl, totalsHtml({ count, overview, period }));

  // A lista não devolve somas: o total de vendas vem da própria resposta e os valores, de GET /finance/overview.
  const countingApi = {
    ...api,
    get: async (url) => {
      const result = await api.get(url);
      if (!disposed && Number.isInteger(result?.total)) {
        count = result.total;
        paintTotals();
      }
      return result;
    },
  };

  const { from, to } = periodRange(initialPeriod);
  const list = createListView({
    api: countingApi,
    region: root.querySelector('#list-region'),
    search: root.querySelector('#sales-search'),
    endpoint: '/api/v1/sales',
    filters: { financialStatus: initialStatus, from, to, ...parseSort(DEFAULT_SORT) },
    caption: 'Lista de vendas',
    columns: COLUMNS,
    empty: (state) =>
      state.q || state.financialStatus || state.from
        ? emptyState({ iconName: 'search', title: 'Nenhuma venda encontrada', message: 'Tente outro termo de busca, outro período ou outra situação.', action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear-filters' } }) })
        : emptyState({
            iconName: 'crm',
            title: 'Nenhuma venda registrada',
            message: 'Ao ganhar uma oportunidade, registre a venda com as parcelas. Você também pode registrar uma venda avulsa.',
            action: button({ label: 'Registrar venda', extra: { 'data-action': 'create' } }),
          }),
    errorTitle: 'Não foi possível carregar as vendas',
    actions: { create: () => createSale(), 'clear-filters': () => clearFilters() },
    rowActions: {
      open: (row) => navigate(`/comercial/vendas/${encodeURIComponent(row.id)}`),
      contact: (row) => navigate(`/comercial/contatos/${encodeURIComponent(row.personId)}`),
      pay: (row) => pay(row),
    },
  });

  async function loadOverview() {
    const mine = ++overviewSeq;
    try {
      const result = await api.get(`/api/v1/finance/overview${buildQuery({ period: period || 'month' })}`);
      if (disposed || mine !== overviewSeq) return;
      overview = result;
    } catch {
      if (disposed || mine !== overviewSeq) return;
      overview = null; // sem os valores, a faixa mostra só a contagem
    }
    paintTotals();
  }

  function setPeriod(next) {
    period = next;
    const range = periodRange(next);
    list.setFilters({ from: range.from, to: range.to });
    loadOverview();
  }

  function clearFilters() {
    root.querySelector('#sales-period').value = '';
    mount(segmentsEl, segments(''));
    period = '';
    list.resetSearch({ financialStatus: '', from: '', to: '' });
    loadOverview();
  }

  async function ensureProducts() {
    if (products) return products;
    try {
      products = listOf(await api.get('/api/v1/products?limit=100&archived=false'));
    } catch {
      products = [];
    }
    return products;
  }

  async function createSale() {
    await ensureProducts();
    if (disposed) return;
    const outcome = await openSaleDialog({ api, products });
    if (disposed) return;
    await list.settle(outcome, 'Venda registrada.');
    if (outcome.saved) {
      loadOverview();
      if (outcome.result?.id) navigate(`/comercial/vendas/${encodeURIComponent(outcome.result.id)}`);
    }
  }

  async function pay(row) {
    let sale;
    try {
      sale = await api.get(`/api/v1/sales/${encodeURIComponent(row.id)}`);
    } catch (error) {
      if (!disposed) toast(describeError(error), { tone: 'danger' });
      return;
    }
    if (disposed) return;
    if (!hasPayable(sale)) {
      toast('Esta venda não tem parcela a receber.', { tone: 'warn' });
      return;
    }
    const outcome = await openPaymentDialog({ api, sale });
    if (disposed) return;
    await list.settle(outcome, 'Pagamento registrado.');
    if (outcome.saved) loadOverview();
  }

  segmentsEl.addEventListener('click', (event) => {
    const segment = event.target.closest('[data-segment]');
    if (!segment || segment.getAttribute('aria-pressed') === 'true') return;
    for (const other of segmentsEl.querySelectorAll('[data-segment]')) other.setAttribute('aria-pressed', String(other === segment));
    list.setFilters({ financialStatus: segment.dataset.segment });
  });
  root.querySelector('#sales-period').addEventListener('change', (event) => setPeriod(event.target.value));
  root.querySelector('#sales-sort').addEventListener('change', (event) => list.setFilters(parseSort(event.target.value)));
  root.querySelector('#new-sale').addEventListener('click', () => createSale());

  paintTotals();
  list.load();
  loadOverview();

  return () => {
    disposed = true;
    list.dispose();
    disposeShell();
  };
}

