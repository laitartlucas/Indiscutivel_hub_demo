import { copyText } from '../lib/clipboard.js';
import { telUrl, whatsappUrl } from '../lib/contact-links.js';
import { dateFormatter } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import { parseSort } from '../lib/query.js';
import { nameError } from '../lib/validators.js';
import { PEOPLE_VIEW_KEY, readViewPref, writeViewPref } from '../lib/view-pref.js';
import { formatWhatsapp, normalizeEmail, normalizeInstagram, normalizeWhatsapp } from '../../shared/contact.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { badge, button, emptyState, field, personCell, searchField, selectField } from '../ui/components.js';
import { bindViewToggle, viewToggle } from '../ui/card-grid.js';
import { confirmDialog } from '../ui/dialog.js';
import { attachCompanyPicker, companyLinkError, companyPickerField, resolveCompanyId } from '../ui/company-picker.js';
import { createListView } from '../ui/list-view.js';
import { actionMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { initials } from '../lib/dom.js';
import { defaultSourceKey, sourceFilterOptions, sourceLabel, sourceOptions } from '../lib/sources.js';


const SORT_OPTIONS = [
  { value: 'name:asc', label: 'Nome (A–Z)' },
  { value: 'name:desc', label: 'Nome (Z–A)' },
  { value: 'created_at:desc', label: 'Mais recentes' },
];

const DEFAULT_SOURCE = '';
const DEFAULT_SORT = 'name:asc';

/** Campo vazio (após remover espaços) vira `null`; o servidor recebe o texto digitado e normaliza. */
function contactOrNull(value) {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function personDialogBody(existing) {
  return html`${field({ id: 'person-name', label: 'Nome', name: 'name', required: true, maxlength: 120, value: existing?.name ?? '' })}
    ${field({ id: 'person-whatsapp', label: 'WhatsApp', name: 'whatsapp', hint: 'Com DDD. Exemplo: (11) 91234-5678', value: existing?.whatsapp ? formatWhatsapp(existing.whatsapp) : '' })}
    ${field({ id: 'person-instagram', label: 'Instagram', name: 'instagram', hint: '@usuario', value: existing?.instagram ?? '' })}
    ${field({ id: 'person-email', label: 'E-mail', name: 'email', type: 'email', value: existing?.email ?? '' })}
    ${selectField({ id: 'person-source', label: 'Origem', name: 'source', value: existing?.source ?? defaultSourceKey(), options: sourceOptions(existing?.source) })}
    ${companyPickerField({ value: existing?.companyId ? { id: existing.companyId, name: existing.companyName ?? '' } : null })}`;
}

function whatsappError(value) {
  const result = normalizeWhatsapp(value);
  return result.ok ? null : result.message;
}

function instagramError(value) {
  const result = normalizeInstagram(value);
  return result.ok ? null : result.message;
}

function emailError(value) {
  const result = normalizeEmail(value);
  return result.ok ? null : result.message;
}

const COLUMNS = [
  { key: 'name', label: 'Nome', render: (row) => personCell(row.name) },
  { key: 'company', label: 'Empresa', optional: true, render: (row) => (row.companyId ? html`<a class="person-company-link" href="#/empresas/${row.companyId}">${row.companyName}</a>` : '—') },
  { key: 'whatsapp', label: 'WhatsApp', render: (row) => (row.whatsapp ? formatWhatsapp(row.whatsapp) : '—') },
  { key: 'instagram', label: 'Instagram', render: (row) => row.instagram ?? '—' },
  { key: 'source', label: 'Origem', nowrap: true, render: (row) => badge(sourceLabel(row.source), 'neutral') },
  { key: 'createdAt', label: 'Cadastro', nowrap: true, render: (row) => dateFormatter.format(new Date(row.createdAt)) },
  {
    key: 'actions',
    label: 'Ações',
    nowrap: true,
    render: (row) => html`<div class="row">
        ${button({ label: 'Editar', variant: 'ghost', small: true, extra: { 'data-action': 'edit', 'data-id': row.id, 'aria-label': `Editar ${row.name}` } })}
        ${actionMenu({ label: `Mais ações de ${row.name}`, id: row.id, items: [{ label: 'Excluir', action: 'delete', id: row.id, tone: 'danger' }] })}
      </div>`,
  },
];

const VIEW_OPTIONS = [
  { value: 'cards', label: 'Cartões' },
  { value: 'table', label: 'Tabela' },
];

/** Linha de contato do cartão: ícone + texto. Só existe se o cadastro tem o dado. */
function contactLine(iconName, text) {
  return html`<li class="person-card-line"><span class="person-card-line-icon" aria-hidden="true">${icon(iconName, { size: 15 })}</span><span>${text}</span></li>`;
}

/**
 * Cartão de uma Pessoa (kit A-Contatos): avatar, nome, origem, contatos e ações rápidas. Os atalhos
 * (WhatsApp, ligar, copiar e-mail) só usam o que o cadastro já tem; sem o dado, o atalho não aparece.
 */
function personCard(row) {
  const wa = whatsappUrl(row.whatsapp);
  const tel = telUrl(row.whatsapp);
  const hasContact = row.whatsapp || row.instagram || row.email;
  return html`<div class="person-card-head">
      <span class="person-avatar person-avatar-lg" aria-hidden="true">${initials(row.name)}</span>
      <div class="person-card-id">
        <p class="person-card-name">${row.name}</p>
        ${badge(sourceLabel(row.source), 'neutral')}
      </div>
    </div>
    ${hasContact || row.companyId
      ? html`<ul class="person-card-lines">
          ${row.companyId ? contactLine('empresas', html`<a class="person-company-link" href="#/empresas/${row.companyId}">${row.companyName}</a>`) : ''}
          ${row.whatsapp ? contactLine('chat', formatWhatsapp(row.whatsapp)) : ''}
          ${row.instagram ? contactLine('contatos', row.instagram) : ''}
          ${row.email ? contactLine('mail', row.email) : ''}
        </ul>`
      : html`<p class="person-card-none">Sem contato cadastrado.</p>`}
    <div class="person-card-foot">
      <div class="person-card-quick">
        ${wa ? html`<a${attrs({ class: 'icon-btn', href: wa, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Abrir WhatsApp de ${row.name} (nova aba)` })}>${icon('chat', { size: 18 })}</a>` : ''}
        ${tel ? html`<a${attrs({ class: 'icon-btn', href: tel, 'aria-label': `Ligar para ${row.name}` })}>${icon('phone', { size: 18 })}</a>` : ''}
        ${row.email ? html`<button${attrs({ type: 'button', class: 'icon-btn', 'data-action': 'copy-email', 'data-id': row.id, 'aria-label': `Copiar e-mail de ${row.name}` })}>${icon('copy', { size: 18 })}</button>` : ''}
      </div>
      <div class="row person-card-actions">
        ${button({ label: 'Editar', variant: 'ghost', small: true, extra: { 'data-action': 'edit', 'data-id': row.id, 'aria-label': `Editar ${row.name}` } })}
        ${actionMenu({ label: `Mais ações de ${row.name}`, id: row.id, items: [{ label: 'Excluir', action: 'delete', id: row.id, tone: 'danger' }] })}
      </div>
    </div>`;
}

function emptyPeople(state) {
  if (state.q || state.source) {
    return emptyState({
      iconName: 'search',
      title: 'Nada encontrado',
      message: 'Tente outro termo de busca ou remova os filtros.',
      action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear-filters' } }),
    });
  }
  return emptyState({
    iconName: 'contatos',
    title: 'Nenhuma pessoa ainda',
    message: 'Cadastre a primeira pessoa para começar a acompanhar seus contatos.',
    action: button({ label: 'Cadastrar pessoa', extra: { 'data-action': 'create' } }),
  });
}

export function renderPeople({ root, session, api, navigate }) {
  const initialView = readViewPref(PEOPLE_VIEW_KEY, 'cards');
  const content = html`<div class="toolbar">
      <div class="toolbar-search">${searchField({ id: 'people-search', label: 'Buscar pessoa', placeholder: 'Buscar por nome…' })}</div>
      <div class="toolbar-actions">
        ${selectField({ id: 'people-source', label: 'Origem', value: DEFAULT_SOURCE, options: sourceFilterOptions() })}
        ${selectField({ id: 'people-sort', label: 'Ordenar por', value: DEFAULT_SORT, options: SORT_OPTIONS })}
        ${viewToggle({ value: initialView, options: VIEW_OPTIONS })}
      </div>
    </div>
    <div id="list-region" aria-live="off"></div>`;

  const disposeShell = renderShell({ root, session, navigate, active: 'people',
    heading: 'Pessoas',
    eyebrow: 'CRM',
    subtitle: 'Quem está no seu relacionamento e de onde veio.',
    actions: button({ label: 'Nova pessoa', id: 'new-person', iconStart: icon('plus') }),
    content,
  });
  const sourceSelect = root.querySelector('#people-source');

  const list = createListView({
    api,
    region: root.querySelector('#list-region'),
    search: root.querySelector('#people-search'),
    endpoint: '/api/v1/people',
    filters: { source: DEFAULT_SOURCE, ...parseSort(DEFAULT_SORT) },
    caption: 'Lista de pessoas',
    columns: COLUMNS,
    cards: { render: personCard, label: 'Pessoas' },
    view: initialView,
    empty: emptyPeople,
    errorTitle: 'Não foi possível carregar as pessoas',
    actions: {
      create: () => openPersonDialog(null),
      'clear-filters': () => {
        sourceSelect.value = DEFAULT_SOURCE;
        list.resetSearch({ source: DEFAULT_SOURCE });
      },
    },
    rowActions: { edit: openPersonDialog, delete: deletePerson, 'copy-email': copyEmail },
  });

  function openPersonDialog(existing) {
    const isEdit = Boolean(existing);
    const createdCompanies = new Map(); // empresas criadas nesta abertura do diálogo (um reenvio não cria de novo)
    return list.formDialog(
      {
        title: isEdit ? 'Editar pessoa' : 'Nova pessoa',
        body: personDialogBody(existing),
        validators: { name: nameError, whatsapp: whatsappError, instagram: instagramError, email: emailError, companyId: companyLinkError },
        onMount: (dialog) => attachCompanyPicker(dialog, { api }),
        onSubmit: async (values) => {
          const body = {
            name: values.name.trim(),
            whatsapp: contactOrNull(values.whatsapp),
            instagram: contactOrNull(values.instagram),
            email: contactOrNull(values.email),
            source: values.source,
            companyId: await resolveCompanyId(api, values, createdCompanies),
          };
          if (isEdit) await api.patch(`/api/v1/people/${existing.id}`, { ...body, version: existing.version });
          else await api.post('/api/v1/people', body);
        },
      },
      isEdit ? 'Pessoa atualizada.' : 'Pessoa cadastrada.',
    );
  }

  async function copyEmail(row) {
    const ok = row.email ? await copyText(row.email) : false;
    if (list.disposed) return;
    toast(ok ? 'E-mail copiado.' : 'Não foi possível copiar. Selecione o e-mail e copie manualmente.', { tone: ok ? 'success' : 'danger' });
  }

  async function deletePerson(row) {
    const confirmed = await confirmDialog({
      title: `Excluir ${row.name}?`,
      // A FK deals.person_id é ON DELETE CASCADE (0005_deals.sql): as Oportunidades vão junto, e as
      // ganhas levam a Pessoa para fora de Clientes e da receita — a confirmação precisa dizer isso.
      message: 'Esta ação apaga a pessoa e todas as oportunidades dela (inclusive as ganhas, que deixam de contar em Clientes). Não pode ser desfeita.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!confirmed || list.disposed) return;
    await list.mutate(() => api.delete(`/api/v1/people/${row.id}`), 'Pessoa excluída.');
  }

  bindViewToggle(root, (view) => {
    writeViewPref(PEOPLE_VIEW_KEY, view);
    list.setView(view);
  });
  sourceSelect.addEventListener('change', (event) => list.setFilters({ source: event.target.value }));
  root.querySelector('#people-sort').addEventListener('change', (event) => list.setFilters(parseSort(event.target.value)));
  root.querySelector('#new-person').addEventListener('click', () => openPersonDialog(null));

  list.load();

  return () => {
    list.dispose();
    disposeShell();
  };
}
