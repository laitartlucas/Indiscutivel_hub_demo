import { html } from '../lib/html.js';
import { nameError } from '../lib/validators.js';
import { formatMoney, moneyToInputText, parseMoney } from '../../shared/money.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { badge, button, emptyState, field, searchField, selectField } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { createListView } from '../ui/list-view.js';
import { actionMenu } from '../ui/menu.js';

const SHOW_OPTIONS = [
  { value: 'false', label: 'Ativos' },
  { value: 'true', label: 'Arquivados' },
  { value: 'all', label: 'Todos' },
];

const DEFAULT_FILTERS = { archived: 'false' };

function productDialogBody(existing) {
  return html`${field({ id: 'product-name', label: 'Nome', name: 'name', required: true, maxlength: 120, value: existing?.name ?? '' })}
    ${field({ id: 'product-price', label: 'Valor (R$)', name: 'price', required: true, inputmode: 'decimal', hint: 'Exemplo: 4.800,00', value: existing ? moneyToInputText(existing.price) : '' })}`;
}

function priceError(value) {
  const result = parseMoney(value);
  return result.ok ? null : result.message;
}

const COLUMNS = [
  { key: 'name', label: 'Produto' },
  { key: 'price', label: 'Valor', align: 'end', nowrap: true, render: (row) => formatMoney(row.price) },
  {
    key: 'status',
    label: 'Situação',
    nowrap: true,
    render: (row) => badge(row.archivedAt ? 'Arquivado' : 'Ativo', row.archivedAt ? 'neutral' : 'good'),
  },
  {
    key: 'actions',
    label: 'Ações',
    nowrap: true,
    render: (row) => html`<div class="row">
        ${button({ label: 'Editar', variant: 'ghost', small: true, extra: { 'data-action': 'edit', 'data-id': row.id, 'aria-label': `Editar ${row.name}` } })}
        ${row.archivedAt
          ? button({ label: 'Restaurar', variant: 'ghost', small: true, extra: { 'data-action': 'restore', 'data-id': row.id, 'aria-label': `Restaurar ${row.name}` } })
          : actionMenu({ label: `Mais ações de ${row.name}`, id: row.id, items: [{ label: 'Arquivar', action: 'archive', id: row.id }] })}
      </div>`,
  },
];

function emptyProducts(state) {
  if (state.q) {
    return emptyState({
      iconName: 'search',
      title: `Nada encontrado para “${state.q}”`,
      message: 'Tente outro termo de busca.',
      action: button({ label: 'Limpar busca', variant: 'ghost', extra: { 'data-action': 'clear-search' } }),
    });
  }
  // Filtro "Arquivados" vazio não significa catálogo vazio: não sugerir "cadastre o primeiro".
  if (state.archived === 'true') {
    return emptyState({
      iconName: 'crm',
      title: 'Nenhum produto arquivado',
      message: 'Os produtos que você arquivar aparecem aqui e podem ser restaurados.',
      action: button({ label: 'Mostrar ativos', variant: 'ghost', extra: { 'data-action': 'show-active' } }),
    });
  }
  return emptyState({
    iconName: 'crm',
    title: 'Nenhum produto ainda',
    message: 'Cadastre o primeiro produto para começar a vender.',
    action: button({ label: 'Cadastrar produto', extra: { 'data-action': 'create' } }),
  });
}

export function renderProducts({ root, session, api, navigate }) {
  const content = html`<div class="toolbar">
      <div class="toolbar-search">${searchField({ id: 'products-search', label: 'Buscar produto', placeholder: 'Buscar por nome…' })}</div>
      <div class="toolbar-actions">${selectField({ id: 'products-show', label: 'Mostrar', name: 'show', value: DEFAULT_FILTERS.archived, options: SHOW_OPTIONS })}</div>
    </div>
    <div id="list-region" aria-live="off"></div>`;

  const disposeShell = renderShell({ root, session, navigate, active: 'products',
    heading: 'Produtos',
    eyebrow: 'Catálogo',
    subtitle: 'Tudo o que você vende, com preço e situação.',
    actions: button({ label: 'Novo produto', id: 'new-product', iconStart: icon('plus') }),
    content,
  });
  const showSelect = root.querySelector('#products-show');

  const list = createListView({
    api,
    region: root.querySelector('#list-region'),
    search: root.querySelector('#products-search'),
    endpoint: '/api/v1/products',
    filters: DEFAULT_FILTERS,
    caption: 'Produtos',
    columns: COLUMNS,
    empty: emptyProducts,
    errorTitle: 'Não foi possível carregar os produtos',
    actions: {
      create: () => openProductDialog(null),
      'show-active': () => {
        showSelect.value = DEFAULT_FILTERS.archived;
        list.setFilters(DEFAULT_FILTERS);
        showSelect.focus();
      },
    },
    rowActions: {
      edit: openProductDialog,
      archive: archiveProduct,
      restore: (row) => list.mutate(() => api.patch(`/api/v1/products/${row.id}`, { archived: false, version: row.version }), 'Produto restaurado.'),
    },
  });

  function openProductDialog(existing) {
    const isEdit = Boolean(existing);
    return list.formDialog(
      {
        title: isEdit ? 'Editar produto' : 'Novo produto',
        body: productDialogBody(existing),
        validators: { name: nameError, price: priceError },
        onSubmit: async (values) => {
          const name = values.name.trim();
          const price = parseMoney(values.price).value;
          if (isEdit) await api.patch(`/api/v1/products/${existing.id}`, { name, price, version: existing.version });
          else await api.post('/api/v1/products', { name, price });
        },
      },
      isEdit ? 'Produto atualizado.' : 'Produto cadastrado.',
    );
  }

  async function archiveProduct(row) {
    const confirmed = await confirmDialog({
      title: 'Arquivar produto?',
      message: 'Ele sai da lista de ativos, mas pode ser restaurado.',
      confirmLabel: 'Arquivar',
    });
    if (!confirmed || list.disposed) return;
    await list.mutate(() => api.delete(`/api/v1/products/${row.id}`), 'Produto arquivado.');
  }

  showSelect.addEventListener('change', (event) => list.setFilters({ archived: event.target.value }));
  root.querySelector('#new-product').addEventListener('click', () => openProductDialog(null));

  list.load();

  return () => {
    list.dispose();
    disposeShell();
  };
}
