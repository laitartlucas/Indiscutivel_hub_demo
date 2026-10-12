import { dateFormatter } from '../lib/format.js';
import { html } from '../lib/html.js';
import { parseSort } from '../lib/query.js';
import { formatMoney } from '../../shared/money.js';
import { renderShell } from '../shell.js';
import { button, emptyState, personCell, searchField, selectField } from '../ui/components.js';
import { openCreateDealDialog } from './deals-dialogs.js';
import { createListView } from '../ui/list-view.js';

const SORT_OPTIONS = [
  { value: 'name:asc', label: 'Nome (A–Z)' },
  { value: 'name:desc', label: 'Nome (Z–A)' },
  { value: 'customerSince:desc', label: 'Clientes mais recentes' },
  { value: 'customerSince:asc', label: 'Clientes mais antigos' },
];

const DEFAULT_SORT = 'name:asc';

const COLUMNS = [
  {
    key: 'name',
    label: 'Nome',
    render: (row) => (row.latestWonDealId ? html`<a class="person-company-link" href="#/oportunidades/${row.latestWonDealId}">${personCell(row.name)}</a>` : personCell(row.name)),
  },
  {
    key: 'productsPurchased',
    label: 'Produtos comprados',
    render: (row) => (row.productsPurchased.length ? row.productsPurchased.join(', ') : '—'),
  },
  { key: 'totalValue', label: 'Valor total', align: 'end', nowrap: true, render: (row) => formatMoney(row.totalValue) },
  { key: 'customerSince', label: 'Cliente desde', nowrap: true, render: (row) => dateFormatter.format(new Date(row.customerSince)) },
  {
    key: 'actions',
    label: 'Ações',
    nowrap: true,
    render: (row) => html`<div class="row">
        ${button({ label: 'Nova oportunidade', variant: 'ghost', small: true, extra: { 'data-action': 'new-deal', 'data-id': row.id, 'aria-label': `Nova oportunidade para ${row.name}` } })}
      </div>`,
  },
];

function emptyClients(state) {
  if (state.q) {
    return emptyState({
      iconName: 'search',
      title: 'Nada encontrado',
      message: 'Tente outro termo de busca.',
      action: button({ label: 'Limpar busca', variant: 'ghost', extra: { 'data-action': 'clear-search' } }),
    });
  }
  return emptyState({
    iconName: 'empresas',
    title: 'Nenhum cliente ainda',
    message: 'Quando uma Oportunidade for marcada como Ganha na tela de Oportunidades, a Pessoa aparece aqui automaticamente.',
  });
}

/**
 * Tela de Clientes (Task 4, Plano 5): lista Pessoas com pelo menos uma Oportunidade ganha — sempre
 * DERIVADO no servidor (GET /api/v1/clients, decisão documentada em routes/clients.ts), nunca uma
 * coluna/tabela própria. Só leitura: não há "Novo cliente" (a barra de ferramentas não tem botão
 * primário de propósito) — o único jeito de alguém virar Cliente é uma Oportunidade ser marcada como
 * "Ganha" na tela de Oportunidades (Task 3). A única ação por linha é "Nova oportunidade" (upsell),
 * que reaproveita o mesmo diálogo de criação de lá (`openCreateDealDialog`, exportado de views/deals-dialogs.js)
 * com a Pessoa já preenchida.
 */
export function renderClients({ root, session, api, navigate }) {
  let products = [];

  const content = html`<div class="toolbar">
      <div class="toolbar-search">${searchField({ id: 'clients-search', label: 'Buscar cliente', placeholder: 'Buscar por nome…' })}</div>
      <div class="toolbar-actions">${selectField({ id: 'clients-sort', label: 'Ordenar por', value: DEFAULT_SORT, options: SORT_OPTIONS })}</div>
    </div>
    <div id="list-region" aria-live="off"></div>`;

  const disposeShell = renderShell({ root, session, navigate, active: 'clients',
    heading: 'Clientes',
    eyebrow: 'CRM',
    subtitle: 'Pessoas com pelo menos uma oportunidade ganha.',
    content,
  });

  const list = createListView({
    api,
    region: root.querySelector('#list-region'),
    search: root.querySelector('#clients-search'),
    endpoint: '/api/v1/clients',
    filters: parseSort(DEFAULT_SORT),
    caption: 'Lista de clientes',
    columns: COLUMNS,
    empty: emptyClients,
    errorTitle: 'Não foi possível carregar os clientes',
    rowActions: { 'new-deal': openUpsellDialog },
  });

  /** Só para o <select> "Produto" do diálogo "Nova oportunidade" (produtos ativos do próprio dono).
   * Falhar aqui não impede a tela de Clientes; o diálogo só fica sem opções de produto. */
  async function loadProducts() {
    try {
      const result = await api.get('/api/v1/products?limit=100&archived=false');
      if (list.disposed) return;
      products = result.data;
    } catch {
      // sem produtos no diálogo: o campo "Valor" continua manual.
    }
  }

  /** Atalho "Nova oportunidade" (upsell) a partir de um Cliente (Task 4): reaproveita o mesmo diálogo
   * de Oportunidades (Task 3) com a Pessoa já preenchida — ver
   * views/deals-dialogs.js (openCreateDealDialog). A nova Oportunidade nasce em "arrived" (nunca "won"),
   * então nunca muda o total/produtos deste Cliente — recarregar depois é só para manter o mesmo
   * padrão do resto do app (reload-on-any-failed-mutation), não porque algo aqui ficaria desatualizado. */
  async function openUpsellDialog(row) {
    const outcome = await openCreateDealDialog({ api, products, presetPerson: { id: row.id, name: row.name } });
    await list.settle(outcome, 'Oportunidade cadastrada.');
  }

  root.querySelector('#clients-sort').addEventListener('change', (event) => list.setFilters(parseSort(event.target.value)));

  list.load();
  loadProducts();

  return () => {
    list.dispose();
    disposeShell();
  };
}
