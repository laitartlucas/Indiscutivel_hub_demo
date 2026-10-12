import { ApiError, describeError } from '../lib/api.js';
import { debounce } from '../lib/debounce.js';
import { initials, mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery } from '../lib/query.js';
import { lastAccessText } from '../lib/mentora.js';
import { MEMBER_STATUS_FILTERS, MEMBER_STATUS_LABELS, memberActions, memberStatusTone, resendLabelFor } from '../lib/team.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { button, emptyState, searchField, selectField } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { createListLoader } from '../ui/list-view.js';
import { actionMenu } from '../ui/menu.js';
import { dataTable } from '../ui/table.js';
import { toast } from '../ui/toast.js';
import { accessCreatedDialog, changeRoleBody, inviteDialogBody, invitePayload, inviteValidators, memberRoleError } from './team-dialogs.js';

const SEARCH_DELAY_MS = 300;
const EMAIL_TAKEN_MESSAGE = 'Já existe uma conta com esse e-mail.';

/** O servidor responde 409 `email_taken` sem lista de campos; vira erro no campo E-mail (o diálogo continua aberto e preenchido). */
function withEmailFieldError(error) {
  if (error instanceof ApiError && error.code === 'email_taken') {
    return new ApiError({ status: error.status, code: error.code, detail: error.detail, requestId: error.requestId, errors: [{ field: 'email', message: EMAIL_TAKEN_MESSAGE }] });
  }
  return error;
}

const memberAvatar = (member) => html`<span class="tm-avatar${member.isOwner ? ' is-owner' : ''}" aria-hidden="true">${initials(member.name)}</span>`;

const statusCell = (member) =>
  html`<span class="tm-status tm-status--${memberStatusTone(member.status)}"><span class="tm-dot" aria-hidden="true"></span>${MEMBER_STATUS_LABELS[member.status] ?? member.status}</span>`;

function rowMenu(member) {
  const labels = {
    'change-role': 'Mudar papel',
    resend: resendLabelFor(member),
    'cancel-invite': 'Cancelar convite',
    block: 'Bloquear acesso',
    unblock: 'Reativar acesso',
    remove: 'Remover da equipe',
  };
  return actionMenu({
    label: `Mais ações de ${member.name}`,
    id: member.id,
    items: memberActions(member).map((action) => ({ label: labels[action], action, id: member.id, ...(action === 'remove' || action === 'block' ? { tone: 'danger' } : {}) })),
  });
}

const COLUMNS = [
  {
    key: 'name',
    label: 'Pessoa',
    render: (m) => html`<span class="tm-person">${memberAvatar(m)}<span class="tm-person-text"><span class="tm-person-name">${m.name}</span><span class="tm-person-sub">${m.email}</span></span></span>`,
  },
  { key: 'role', label: 'Papel', nowrap: true, render: (m) => html`<span class="tm-role${m.isOwner ? ' is-owner' : ''}">${m.roleName}</span>` },
  { key: 'status', label: 'Estado', nowrap: true, render: statusCell },
  {
    key: 'lastLoginAt',
    label: 'Último acesso',
    nowrap: true,
    optional: true,
    render: (m) => html`<span${attrs({ title: m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString('pt-BR') : false })}>${m.lastLoginAt ? lastAccessText(m.lastLoginAt) : '—'}</span>`,
  },
  {
    key: 'actions',
    label: 'Ações',
    nowrap: true,
    render: (m) => (m.isOwner ? html`<span class="mp-muted"><span class="sr-only">A conta da proprietária não tem ações. </span>Fixa</span>` : rowMenu(m)),
  },
];

function emptyTeam(filtered) {
  if (filtered) {
    return emptyState({
      iconName: 'search',
      title: 'Nada encontrado',
      message: 'Tente outro termo de busca ou remova os filtros.',
      action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear-filters' } }),
    });
  }
  return emptyState({
    iconName: 'equipe',
    title: 'Ninguém na equipe ainda',
    message: 'Convide uma pessoa para ajudar a conduzir a mentoria. Ela vê só o que o papel permitir e nunca os dados de negócio das alunas.',
    action: button({ label: 'Convidar por e-mail', extra: { 'data-action': 'invite' } }),
  });
}

function roleOptions(roles) {
  return [{ value: '', label: 'Todos os papéis' }, ...roles.map((r) => ({ value: r.id, label: r.name }))];
}

export function renderTeam({ root, session, api, navigate }) {
  let state = { q: '', status: '', roleId: '' };
  let data = { owner: null, data: [], roles: [] };
  let rows = [];

  const content = html`<div class="toolbar lead-toolbar">
      <div class="toolbar-search">${searchField({ id: 'team-search', label: 'Buscar pessoa da equipe', placeholder: 'Buscar por nome ou e-mail…' })}</div>
      <div class="toolbar-actions">
        ${selectField({ id: 'team-status', label: 'Estado', value: '', options: MEMBER_STATUS_FILTERS })}
        <div id="team-role-host">${selectField({ id: 'team-role-filter', label: 'Papel', value: '', options: roleOptions([]) })}</div>
        ${button({ label: 'Limpar filtros', variant: 'ghost', id: 'team-clear', extra: { hidden: true } })}
      </div>
    </div>
    <div id="list-region" aria-live="off"></div>
    <p class="tm-note">${icon('lock', { size: 14, stroke: 2 })}<span>A equipe nunca vê os dados de negócio das alunas (valores, pessoas, leads, oportunidades, tarefas). Ela atua como você, só no que o papel permite.</span></p>`;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'team',
    heading: 'Equipe',
    eyebrow: 'ADMINISTRAÇÃO',
    subtitle: 'Pessoas que ajudam você a conduzir a mentoria.',
    actions: html`<a class="btn btn-ghost" id="team-permissions-link" href="#/equipe/permissoes">${icon('permissoes', { size: 16, stroke: 2 })}<span>Permissões</span></a>${button({ label: 'Convidar por e-mail', id: 'team-invite', iconStart: icon('plus') })}`,
    content,
  });

  const region = root.querySelector('#list-region');
  const search = root.querySelector('#team-search');
  const statusSelect = root.querySelector('#team-status');
  const roleHost = root.querySelector('#team-role-host');
  const clearButton = root.querySelector('#team-clear');
  const hasFilters = () => Boolean(state.q || state.status || state.roleId);

  function paintFilters() {
    const hadFocus = roleHost.contains(document.activeElement);
    mount(roleHost, selectField({ id: 'team-role-filter', label: 'Papel', value: state.roleId, options: roleOptions(data.roles) }));
    if (hadFocus) roleHost.querySelector('select')?.focus();
    clearButton.hidden = !hasFilters();
  }

  const loader = createListLoader({
    region,
    errorTitle: 'Não foi possível carregar a equipe',
    fallback: () => search,
    fetchData: () => api.get(`/api/v1/team${buildQuery({ ...state })}`),
    paint: (result) => {
      data = { owner: result.owner, data: result.data, roles: result.roles };
      rows = [...(hasFilters() ? [] : [{ ...result.owner, isOwner: true }]), ...result.data];
      paintFilters();
      if (rows.length === 0) {
        mount(region, emptyTeam(hasFilters()));
        return;
      }
      // Só a proprietária na lista (sem ninguém convidado): mostra a linha dela E o convite para a primeira pessoa.
      const onlyOwner = !hasFilters() && result.data.length === 0;
      mount(region, html`${dataTable({ caption: 'Pessoas da equipe', columns: COLUMNS, rows, dense: true })}${onlyOwner ? emptyTeam(false) : ''}`);
    },
  });

  function setFilters(patch) {
    state = { ...state, ...patch };
    loader.load();
  }

  /** Mostra "Acesso criado" e, se pedirem outro link, gera e mostra de novo (a cada vez o anterior deixa de valer). */
  async function showAccess(result, { reset = false } = {}) {
    let current = result;
    for (let round = 0; round < 10 && current?.invite?.acceptUrl && !loader.disposed; round += 1) {
      const outcome = await accessCreatedDialog({ member: current.member, acceptUrl: current.invite.acceptUrl, reset });
      if (outcome !== 'resend' || loader.disposed) break;
      try {
        current = await api.post(`/api/v1/team/members/${encodeURIComponent(current.member.id)}/invites`, {});
        if (!loader.disposed) toast('Novo link gerado. O anterior deixou de valer.', { tone: 'success' });
      } catch (error) {
        if (!loader.disposed) toast(describeError(error), { tone: 'danger' });
        break;
      }
    }
  }

  async function openInviteDialog() {
    if (data.roles.length === 0) {
      // Ainda sem a lista de papéis (primeira carga com erro): busca antes de abrir.
      try {
        const roles = await api.get('/api/v1/team/roles');
        data = { ...data, roles: roles.roles };
      } catch (error) {
        toast(describeError(error), { tone: 'danger' });
        return;
      }
    }
    let created = null;
    await loader.formDialog(
      {
        title: 'Convidar por e-mail',
        description: 'A pessoa recebe o acesso pelo link que você envia. Ela cria a própria senha.',
        submitLabel: 'Criar acesso',
        busyLabel: 'Criando…',
        body: inviteDialogBody(data.roles),
        validators: inviteValidators,
        onSubmit: async (values) => {
          try {
            created = await api.post('/api/v1/team/members', invitePayload(values));
          } catch (error) {
            throw withEmailFieldError(error);
          }
        },
      },
      'Acesso criado.',
    );
    if (created && !loader.disposed) await showAccess(created);
  }

  async function changeRole(member) {
    await loader.formDialog(
      {
        title: `Mudar o papel de ${member.name}`,
        submitLabel: 'Salvar papel',
        busyLabel: 'Salvando…',
        body: changeRoleBody(data.roles, member.roleId),
        validators: { roleId: memberRoleError },
        onSubmit: async (values) => {
          await api.patch(`/api/v1/team/members/${encodeURIComponent(member.id)}`, { roleId: values.roleId });
        },
      },
      'Papel atualizado.',
    );
  }

  async function resend(member) {
    if (member.status === 'invite_pending') {
      const confirmed = await confirmDialog({ title: 'Gerar um novo link?', message: 'O link anterior deixa de funcionar.', confirmLabel: 'Gerar novo link', cancelLabel: 'Voltar' });
      if (!confirmed || loader.disposed) return;
    }
    let result = null;
    try {
      result = await api.post(`/api/v1/team/members/${encodeURIComponent(member.id)}/invites`, {});
    } catch (error) {
      if (!loader.disposed) toast(describeError(error), { tone: 'danger' });
    }
    if (loader.disposed) return;
    const reload = loader.load();
    if (result?.invite?.acceptUrl) await showAccess(result, { reset: member.status === 'active' });
    await reload;
  }

  const confirmThen = (options, request, message) => async (member) => {
    const confirmed = await confirmDialog(options(member));
    if (!confirmed || loader.disposed) return;
    await loader.mutate(() => request(member), message);
  };

  const rowActions = {
    'change-role': changeRole,
    resend,
    'cancel-invite': confirmThen(
      () => ({ title: 'Cancelar o convite pendente?', message: 'O link enviado deixa de funcionar. Você pode gerar um novo quando quiser.', confirmLabel: 'Cancelar convite', cancelLabel: 'Voltar' }),
      (m) => api.post(`/api/v1/team/members/${encodeURIComponent(m.id)}/invites/cancel`, {}),
      'Convite cancelado.',
    ),
    block: confirmThen(
      (m) => ({ title: `Bloquear o acesso de ${m.name}?`, message: `${m.name} será desconectada na hora e não conseguirá entrar até você reativar o acesso.`, confirmLabel: 'Bloquear acesso', cancelLabel: 'Voltar', tone: 'danger' }),
      (m) => api.post(`/api/v1/team/members/${encodeURIComponent(m.id)}/status`, { action: 'block' }),
      'Acesso bloqueado.',
    ),
    unblock: async (member) => {
      await loader.mutate(() => api.post(`/api/v1/team/members/${encodeURIComponent(member.id)}/status`, { action: 'unblock' }), 'Acesso reativado.');
    },
    remove: confirmThen(
      (m) => ({ title: `Remover ${m.name} da equipe?`, message: 'A conta e as sessões abertas dela são apagadas. Isso não pode ser desfeito.', confirmLabel: 'Remover da equipe', cancelLabel: 'Voltar', tone: 'danger' }),
      (m) => api.delete(`/api/v1/team/members/${encodeURIComponent(m.id)}`),
      'Pessoa removida da equipe.',
    ),
  };

  function clearFilters() {
    scheduleSearch.cancel();
    search.value = '';
    statusSelect.value = '';
    setFilters({ q: '', status: '', roleId: '' });
  }

  const scheduleSearch = debounce((value) => setFilters({ q: value.trim() }), SEARCH_DELAY_MS);
  search.addEventListener('input', (event) => scheduleSearch(event.target.value));
  statusSelect.addEventListener('change', (event) => setFilters({ status: event.target.value }));
  roleHost.addEventListener('change', (event) => {
    if (event.target.id === 'team-role-filter') setFilters({ roleId: event.target.value });
  });
  clearButton.addEventListener('click', () => {
    clearFilters();
    search.focus();
  });
  root.querySelector('#team-invite').addEventListener('click', openInviteDialog);
  region.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const { action } = actionButton.dataset;
    if (action === 'invite') return void openInviteDialog();
    if (action === 'clear-filters') {
      clearFilters();
      search.focus();
      return;
    }
    const member = Object.hasOwn(rowActions, action) ? rows.find((r) => r.id === actionButton.dataset.id && !r.isOwner) : null;
    if (member) loader.runLocked(member.id, () => rowActions[action](member));
  });

  loader.load();

  return () => {
    loader.dispose();
    scheduleSearch.cancel();
    disposeShell();
  };
}
