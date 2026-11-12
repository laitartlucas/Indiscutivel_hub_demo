import { copyText } from '../lib/clipboard.js';
import { telUrl, whatsappUrl } from '../lib/contact-links.js';
import { debounce } from '../lib/debounce.js';
import { initials, mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import {
  STATUS_SEGMENTS,
  TEMPERATURE_FILTER_OPTIONS,
  avatarTone,
  contactStatusLabel,
  contactStatusTone,
  isContactStatus,
  moneyShort,
  segmentCount,
  whenLabel,
} from '../lib/commercial.js';
import { getFunnels, loadFunnels } from '../lib/pipeline-config.js';
import { hashParam, parseSort } from '../lib/query.js';
import { sourceFilterOptions, sourceLabel } from '../lib/sources.js';
import { readViewPref, writeViewPref } from '../lib/view-pref.js';
import { formatWhatsapp } from '../../shared/contact.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { badge, button, emptyState, field, searchField, selectField } from '../ui/components.js';
import { bindViewToggle, viewToggle } from '../ui/card-grid.js';
import { COMMERCIAL_EYEBROW, commercialTabs } from '../ui/commercial-tabs.js';
import { confirmDialog } from '../ui/dialog.js';
import { createListView } from '../ui/list-view.js';
import { actionMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { openNewContactDialog } from './contact-forms.js';

export const CONTACTS_VIEW_KEY = 'ih:contacts-view';

const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Mais recentes' },
  { value: 'last_activity:desc', label: 'Última atividade' },
  { value: 'name:asc', label: 'Nome (A–Z)' },
  { value: 'name:desc', label: 'Nome (Z–A)' },
];
const DEFAULT_SORT = 'created_at:desc';
const VIEW_OPTIONS = [
  { value: 'cards', label: 'Cartões' },
  { value: 'table', label: 'Tabela' },
];
const TEXT_FILTER_DELAY_MS = 400;

const detailHref = (row) => `#/comercial/contatos/${encodeURIComponent(row.id)}`;

/** Selo do estado comercial (Lead, Em negociação, Cliente, Perdido): a palavra carrega o sentido. */
export function contactStatusBadge(status) {
  return badge(contactStatusLabel(status), contactStatusTone(status));
}

/** Círculo com as iniciais; a cor é uma de 5 variações estáveis por contato. */
export function contactAvatar(contact, size = '') {
  return html`<span${attrs({ class: `lead-avatar lead-avatar-${avatarTone(contact.id)}${size ? ` lead-avatar-${size}` : ''}`, 'aria-hidden': 'true' })}>${initials(contact.name)}</span>`;
}

function tagList(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return html`<ul class="cc-tags" aria-label="Etiquetas">${tags.map((t) => html`<li class="cc-tag">${t}</li>`)}</ul>`;
}

/** "2 em negociação · R$ 4.800 ganhos" (só o que existe). */
function dealsSummary(row) {
  const parts = [];
  if (row.dealsOpen) parts.push(`${row.dealsOpen} em negociação`);
  if (row.dealsWon) parts.push(`${moneyShort(row.wonTotal ?? '0.00')} em ${row.dealsWon === 1 ? '1 compra' : `${row.dealsWon} compras`}`);
  return parts.length ? parts.join(' · ') : '—';
}

const rowMenu = (row) =>
  actionMenu({
    label: `Mais ações de ${row.name}`,
    id: row.id,
    items: [
      { label: 'Abrir contato', action: 'open', id: row.id },
      ...(row.email ? [{ label: 'Copiar e-mail', action: 'copy-email', id: row.id }] : []),
      { separator: true },
      { label: 'Excluir contato', action: 'delete', id: row.id, tone: 'danger' },
    ],
  });

const COLUMNS = [
  {
    key: 'name',
    label: 'Nome',
    render: (row) => html`<a class="lead-cell" href="${detailHref(row)}">${contactAvatar(row)}<span class="lead-cell-text"><span class="lead-cell-name">${row.name}</span><span class="lead-cell-sub">${row.email ?? (row.whatsapp ? formatWhatsapp(row.whatsapp) : '')}</span></span></a>`,
  },
  { key: 'status', label: 'Situação', nowrap: true, render: (row) => contactStatusBadge(row.status) },
  { key: 'source', label: 'Origem', nowrap: true, optional: true, render: (row) => sourceLabel(row.source) },
  { key: 'deals', label: 'Negócios', optional: true, render: (row) => dealsSummary(row) },
  { key: 'responsible', label: 'Responsável', optional: true, render: (row) => row.responsible ?? '—' },
  { key: 'lastActivityAt', label: 'Última atividade', nowrap: true, render: (row) => (row.lastActivityAt ? whenLabel(row.lastActivityAt) : '—') },
  { key: 'actions', label: 'Ações', nowrap: true, render: (row) => rowMenu(row) },
];

function contactLine(iconName, text) {
  return html`<li class="person-card-line"><span class="person-card-line-icon" aria-hidden="true">${icon(iconName, { size: 15 })}</span><span>${text}</span></li>`;
}

/** Cartão do contato: avatar, nome (link para a ficha), situação, contatos, etiquetas e atalhos. */
function contactCard(row) {
  const wa = whatsappUrl(row.whatsapp);
  const tel = telUrl(row.whatsapp ?? row.phone);
  const hasContact = row.whatsapp || row.phone || row.instagram || row.email;
  return html`<div class="person-card-head">
      ${contactAvatar(row, 'lg')}
      <div class="person-card-id">
        <p class="person-card-name"><a class="cc-card-link" href="${detailHref(row)}">${row.name}</a></p>
        <span class="lead-badges">${contactStatusBadge(row.status)}<span class="cc-card-source">${sourceLabel(row.source)}</span></span>
      </div>
    </div>
    ${hasContact
      ? html`<ul class="person-card-lines">
          ${row.whatsapp ? contactLine('chat', formatWhatsapp(row.whatsapp)) : row.phone ? contactLine('phone', row.phone) : ''}
          ${row.email ? contactLine('mail', row.email) : ''}
          ${row.instagram ? contactLine('contatos', row.instagram) : ''}
        </ul>`
      : html`<p class="person-card-none">Sem contato cadastrado.</p>`}
    ${tagList(row.tags)}
    <p class="cc-card-deals">${dealsSummary(row)}</p>
    <div class="person-card-foot">
      <div class="person-card-quick">
        ${wa ? html`<a${attrs({ class: 'icon-btn', href: wa, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Abrir WhatsApp de ${row.name} (nova aba)` })}>${icon('chat', { size: 18 })}</a>` : ''}
        ${tel ? html`<a${attrs({ class: 'icon-btn', href: tel, 'aria-label': `Ligar para ${row.name}` })}>${icon('phone', { size: 18 })}</a>` : ''}
        ${row.email ? html`<button${attrs({ type: 'button', class: 'icon-btn', 'data-action': 'copy-email', 'data-id': row.id, 'aria-label': `Copiar e-mail de ${row.name}` })}>${icon('copy', { size: 18 })}</button>` : ''}
      </div>
      <div class="row person-card-actions">${rowMenu(row)}</div>
    </div>`;
}

function segments(counts, current) {
  return html`${STATUS_SEGMENTS.map((s) => {
    const count = segmentCount(counts, s.id);
    return html`<button${attrs({ type: 'button', class: 'segment', 'data-segment': s.id, 'aria-pressed': String(s.id === current), 'aria-label': count === null ? s.label : `${s.label}, ${count}` })}>${s.label}<span class="segment-count" aria-hidden="true">${count ?? '·'}</span></button>`;
  })}`;
}

const FILTER_KEYS = ['status', 'source', 'funnelId', 'temperature', 'tag', 'responsible'];
const hasFilters = (state) => Boolean(state.q || FILTER_KEYS.some((k) => state[k]));

function emptyContacts(state) {
  if (hasFilters(state)) {
    return emptyState({
      iconName: 'search',
      title: 'Nenhum contato encontrado',
      message: 'Tente outro termo de busca ou remova os filtros.',
      action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear-filters' } }),
    });
  }
  return emptyState({
    iconName: 'contatos',
    title: 'Nenhum contato ainda',
    message: 'Cadastre quem está conversando com você. O mesmo cadastro acompanha a pessoa de lead a cliente.',
    action: button({ label: 'Cadastrar contato', extra: { 'data-action': 'create' } }),
  });
}

const funnelFilterOptions = () => [{ value: '', label: 'Todos' }, ...getFunnels().map((f) => ({ value: f.id, label: f.active ? f.name : `${f.name} (inativo)` }))];

export function renderContacts({ root, session, api, navigate }) {
  const initialView = readViewPref(CONTACTS_VIEW_KEY, 'table');
  const initialStatus = isContactStatus(hashParam('status')) ? hashParam('status') : '';
  let counts = null;
  let disposed = false;

  const content = html`${commercialTabs('contacts')}
    <div class="segments" role="group" aria-label="Filtrar por situação" id="contacts-segments">${segments(null, initialStatus)}</div>
    <div class="toolbar">
      <div class="toolbar-search">${searchField({ id: 'contacts-search', label: 'Buscar contato', placeholder: 'Buscar por nome, e-mail, WhatsApp…' })}</div>
      <div class="toolbar-actions">
        ${selectField({ id: 'contacts-sort', label: 'Ordenar por', value: DEFAULT_SORT, options: SORT_OPTIONS })}
        ${viewToggle({ value: initialView, options: VIEW_OPTIONS })}
      </div>
    </div>
    <details class="cc-filters" id="contacts-filters">
      <summary class="cc-filters-summary">${icon('filter', { size: 16 })}<span>Mais filtros</span><span class="cc-filters-count" id="contacts-filter-count" hidden></span></summary>
      <div class="cc-filters-grid">
        ${selectField({ id: 'contacts-source', label: 'Origem', value: '', options: sourceFilterOptions() })}
        ${selectField({ id: 'contacts-funnel', label: 'Funil de entrada', value: '', options: funnelFilterOptions() })}
        ${selectField({ id: 'contacts-temperature', label: 'Temperatura', value: '', options: TEMPERATURE_FILTER_OPTIONS })}
        ${field({ id: 'contacts-tag', label: 'Etiqueta', name: 'tag', maxlength: 30, extra: { placeholder: 'Ex.: vip' } })}
        ${field({ id: 'contacts-responsible', label: 'Responsável', name: 'responsible', maxlength: 80 })}
        <div class="cc-filters-clear">${button({ label: 'Limpar filtros', variant: 'ghost', small: true, extra: { 'data-action': 'clear-filters' } })}</div>
      </div>
    </details>
    <div id="list-region" aria-live="off"></div>`;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'commercial',
    heading: 'Contatos',
    eyebrow: COMMERCIAL_EYEBROW,
    subtitle: 'Um cadastro único para cada pessoa: de lead a cliente, sem duplicar.',
    actions: button({ label: 'Novo contato', id: 'new-contact', iconStart: icon('plus') }),
    content,
  });

  const segmentsEl = root.querySelector('#contacts-segments');
  const filtersEl = root.querySelector('#contacts-filters');
  const searchInput = root.querySelector('#contacts-search');
  const inputs = {
    source: root.querySelector('#contacts-source'),
    funnelId: root.querySelector('#contacts-funnel'),
    temperature: root.querySelector('#contacts-temperature'),
    tag: root.querySelector('#contacts-tag'),
    responsible: root.querySelector('#contacts-responsible'),
  };

  const list = createListView({
    api,
    region: root.querySelector('#list-region'),
    search: searchInput,
    endpoint: '/api/v1/people',
    filters: { status: initialStatus, source: '', funnelId: '', temperature: '', tag: '', responsible: '', ...parseSort(DEFAULT_SORT) },
    caption: 'Lista de contatos',
    columns: COLUMNS,
    cards: { render: contactCard, label: 'Contatos' },
    view: initialView,
    empty: emptyContacts,
    errorTitle: 'Não foi possível carregar os contatos',
    actions: {
      create: () => createContact(),
      'clear-filters': () => clearFilters(),
    },
    rowActions: { open: (row) => navigate(`/comercial/contatos/${encodeURIComponent(row.id)}`), delete: deleteContact, 'copy-email': copyEmail },
  });

  function paintFilterCount() {
    const n = ['source', 'funnelId', 'temperature', 'tag', 'responsible'].filter((k) => list.state[k]).length;
    const badgeEl = root.querySelector('#contacts-filter-count');
    badgeEl.hidden = n === 0;
    badgeEl.textContent = n ? `${n} ${n === 1 ? 'ativo' : 'ativos'}` : '';
  }

  async function loadCounts() {
    try {
      const result = await api.get('/api/v1/people/counts');
      if (disposed) return;
      counts = result;
    } catch {
      counts = null; // sem as contagens, os segmentos mostram "·" e continuam funcionando
    }
    if (!disposed) mount(segmentsEl, segments(counts, list.state.status));
  }

  function setFilter(patch) {
    list.setFilters(patch);
    paintFilterCount();
  }

  function clearFilters() {
    for (const key of ['source', 'funnelId', 'temperature']) inputs[key].value = '';
    inputs.tag.value = '';
    inputs.responsible.value = '';
    scheduleText.cancel();
    list.resetSearch({ status: '', source: '', funnelId: '', temperature: '', tag: '', responsible: '' });
    mount(segmentsEl, segments(counts, ''));
    paintFilterCount();
  }

  async function createContact() {
    const outcome = await openNewContactDialog({ api, funnels: getFunnels() });
    if (disposed) return;
    await list.settle(outcome, 'Contato cadastrado.');
    if (outcome.saved) loadCounts();
  }

  async function copyEmail(row) {
    const ok = row.email ? await copyText(row.email) : false;
    if (disposed) return;
    toast(ok ? 'E-mail copiado.' : 'Não foi possível copiar. Selecione o e-mail e copie manualmente.', { tone: ok ? 'success' : 'danger' });
  }

  async function deleteContact(row) {
    const confirmed = await confirmDialog({
      title: `Excluir ${row.name}?`,
      message: 'Apaga o contato, as oportunidades dele (inclusive as ganhas) e a linha do tempo. As tarefas continuam, sem o vínculo. Um contato com venda registrada não pode ser excluído. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!confirmed || disposed) return;
    await list.mutate(() => api.delete(`/api/v1/people/${encodeURIComponent(row.id)}`), 'Contato excluído.');
    loadCounts();
  }

  const scheduleText = debounce((key, value) => setFilter({ [key]: value.trim() }), TEXT_FILTER_DELAY_MS);

  segmentsEl.addEventListener('click', (event) => {
    const segment = event.target.closest('[data-segment]');
    if (!segment || segment.getAttribute('aria-pressed') === 'true') return;
    for (const other of segmentsEl.querySelectorAll('[data-segment]')) other.setAttribute('aria-pressed', String(other === segment));
    setFilter({ status: segment.dataset.segment });
  });
  for (const key of ['source', 'funnelId', 'temperature']) inputs[key].addEventListener('change', (event) => setFilter({ [key]: event.target.value }));
  for (const key of ['tag', 'responsible']) inputs[key].addEventListener('input', (event) => scheduleText(key, event.target.value));
  filtersEl.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="clear-filters"]')) clearFilters();
  });
  root.querySelector('#contacts-sort').addEventListener('change', (event) => list.setFilters(parseSort(event.target.value)));
  root.querySelector('#new-contact').addEventListener('click', () => createContact());
  bindViewToggle(root, (view) => {
    writeViewPref(CONTACTS_VIEW_KEY, view);
    list.setView(view);
  });

  // Os funis (para o filtro "Funil de entrada") podem chegar depois do primeiro desenho.
  loadFunnels(api).then(() => {
    if (disposed) return;
    const value = inputs.funnelId.value;
    mount(inputs.funnelId, html`${funnelFilterOptions().map((o) => html`<option${attrs({ value: o.value, selected: o.value === value })}>${o.label}</option>`)}`);
  });

  list.load();
  loadCounts();

  return () => {
    disposed = true;
    scheduleText.cancel();
    list.dispose();
    disposeShell();
  };
}
