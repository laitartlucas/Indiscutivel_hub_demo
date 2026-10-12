import { ApiError, describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { PERMISSION_KEYS } from '../lib/permissions.js';
import { OWNER_ROLE_NAME, cellLabel, changedRoles, draftFromRoles, peopleText, togglePermission } from '../lib/team.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, skeleton } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';
import { actionMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { checkedPermissions, permissionChecklist, roleNameBody, roleNameValidators } from './team-dialogs.js';

const INVALID_RESPONSE = 'Resposta inesperada do servidor. Tente de novo em instantes.';
const NOTE = 'Permissões da Proprietária são fixas. Alunas veem apenas os próprios dados — nunca os de outras alunas.';

function isRoles(value) {
  return !!value && Array.isArray(value.roles) && value.roles.every((r) => r && typeof r.id === 'string' && Array.isArray(r.permissions));
}
function isCatalog(value) {
  return !!value && Array.isArray(value.groups) && value.groups.every((g) => Array.isArray(g.permissions));
}

const check = (on, locked) =>
  html`<span class="pm-box${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}" aria-hidden="true">${on ? icon('check', { size: 13, stroke: 3 }) : ''}</span>`;

function roleHead(role) {
  const menu = role.isSystem
    ? ''
    : actionMenu({
        label: `Mais ações do papel ${role.name}`,
        id: role.id,
        items: [
          { label: 'Renomear', action: 'rename-role', id: role.id },
          { label: 'Excluir papel', action: 'delete-role', id: role.id, tone: 'danger' },
        ],
      });
  return html`<div class="pm-th" role="columnheader"><span class="pm-th-name">${role.name}</span><span class="pm-th-sub">${peopleText(role.members)}</span><span class="pm-th-tag">${role.isSystem ? 'Padrão' : 'Personalizado'}</span>${menu}</div>`;
}

function matrix(catalog, roles, draft) {
  return html`<div class="pm-wrap" role="region" aria-label="Matriz de permissões por papel" tabindex="0">
    <div class="pm-grid" role="table" aria-label="Permissões por papel">
      <div class="pm-row pm-row--head" role="row">
        <div class="pm-th pm-th--perm" role="columnheader">PERMISSÃO</div>
        <div class="pm-th" role="columnheader"><span class="pm-th-name pm-th-name--owner">${OWNER_ROLE_NAME}</span><span class="pm-th-sub">1 pessoa</span><span class="pm-th-tag">Fixa</span></div>
        ${roles.map(roleHead)}
      </div>
      ${catalog.groups.map(
        (group) => html`<div class="pm-group" role="rowgroup"><div class="pm-group-label" role="row"><span role="cell">${group.label}</span></div>
          ${group.permissions.map(
            (perm) => html`<div class="pm-row" role="row">
              <div class="pm-perm" role="rowheader"><span class="pm-perm-title">${perm.label}</span><span class="pm-perm-desc">${perm.description}</span></div>
              <div class="pm-cell" role="cell"><button${attrs({ type: 'button', class: 'pm-check', role: 'checkbox', 'aria-checked': 'true', disabled: true, 'aria-label': cellLabel(perm.label, `${OWNER_ROLE_NAME} (fixa)`) })}>${check(true, true)}</button></div>
              ${roles.map((role) => {
                const on = (draft.get(role.id) ?? new Set()).has(perm.key);
                const locked = role.isSystem;
                return html`<div class="pm-cell" role="cell"><button${attrs({ type: 'button', class: 'pm-check', role: 'checkbox', 'aria-checked': String(on), 'data-role': role.id, 'data-key': perm.key, disabled: locked, 'aria-label': cellLabel(perm.label, locked ? `${role.name} (padrão, não editável)` : role.name) })}>${check(on, locked)}</button></div>`;
              })}
            </div>`,
          )}</div>`,
      )}
    </div>
  </div>`;
}

export function renderPermissions({ root, session, api, navigate }) {
  let disposed = false;
  let seq = 0;
  let catalog = null;
  let roles = [];
  let draft = new Map();
  let saving = false;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'team',
    heading: 'Permissões',
    eyebrow: html`ADMINISTRAÇÃO · <a class="back-link" href="#/equipe">← Equipe</a>`,
    subtitle: 'O que cada papel pode ver e fazer. Alterações valem na próxima ação de cada pessoa.',
    actions: html`${button({ label: 'Criar papel', variant: 'ghost', id: 'pm-create' })}${button({ label: 'Salvar permissões', id: 'pm-save', busyLabel: 'Salvando…' })}`,
    content: html`<div id="pm-region" aria-live="off">${skeleton(5)}</div><p class="pm-note" id="pm-note">${icon('lock', { size: 14, stroke: 2 })}<span>${NOTE}</span></p><p class="sr-only" id="pm-status" role="status" aria-live="polite"></p>`,
  });
  const region = root.querySelector('#pm-region');
  const saveButton = root.querySelector('#pm-save');
  const createButton = root.querySelector('#pm-create');
  const status = root.querySelector('#pm-status');

  const dirty = () => changedRoles(draft, roles);
  const setActionsEnabled = (on) => {
    saveButton.disabled = !on;
    createButton.disabled = !on;
  };

  function paint() {
    mount(region, matrix(catalog, roles, draft));
    status.textContent = '';
  }

  async function load({ keepDraft = false } = {}) {
    const mine = ++seq;
    setActionsEnabled(false);
    mount(region, skeleton(5));
    let rolesData = null;
    let catalogData = null;
    let failure = null;
    try {
      [rolesData, catalogData] = await Promise.all([api.get('/api/v1/team/roles'), catalog ? Promise.resolve(catalog) : api.get('/api/v1/team/permissions')]);
      if (!isRoles(rolesData) || !isCatalog(catalogData)) {
        failure = new ApiError({ status: 0, code: 'invalid_response', detail: INVALID_RESPONSE });
      }
    } catch (error) {
      failure = error;
    }
    if (disposed || mine !== seq) return;
    if (failure) {
      mount(region, html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar as permissões', message: describeError(failure) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`);
      return;
    }
    catalog = catalogData;
    roles = rolesData.roles;
    draft = keepDraft ? new Map(roles.map((r) => [r.id, draft.get(r.id) ?? new Set(r.permissions)])) : draftFromRoles(roles);
    // Só as chaves que o catálogo conhece viram caixa marcada.
    const known = new Set(catalog.groups.flatMap((g) => g.permissions.map((p) => p.key)));
    for (const key of PERMISSION_KEYS) if (!known.has(key)) draft.forEach((set) => set.delete(key));
    setActionsEnabled(true);
    paint();
  }

  async function save() {
    if (saving) return;
    const changes = dirty();
    if (changes.length === 0) {
      toast('Nenhuma alteração para salvar.', { tone: 'info' });
      return;
    }
    saving = true;
    saveButton.disabled = true;
    saveButton.setAttribute('aria-busy', 'true');
    let failed = 0;
    for (const change of changes) {
      try {
        await api.patch(`/api/v1/team/roles/${encodeURIComponent(change.id)}`, { permissions: change.permissions });
      } catch (error) {
        failed += 1;
        if (!disposed) toast(describeError(error), { tone: 'danger' });
      }
    }
    saving = false;
    if (disposed) return;
    saveButton.removeAttribute('aria-busy');
    if (failed === 0) toast('Permissões salvas. Valem na próxima ação de cada pessoa.', { tone: 'success' });
    await load();
    if (!disposed) saveButton.focus();
  }

  async function createRole() {
    const { saved, hadFailure } = await openTrackedFormDialog({
      title: 'Criar papel',
      description: 'Dê um nome e marque o que esse papel pode fazer. Nenhum papel dá acesso aos dados de negócio das alunas.',
      submitLabel: 'Criar papel',
      busyLabel: 'Criando…',
      className: 'dialog-wide',
      body: html`${roleNameBody()}${permissionChecklist(catalog.groups)}`,
      validators: roleNameValidators,
      onMount: (dialog) => {
        dialogRef = dialog;
      },
      onSubmit: async (values) => {
        await api.post('/api/v1/team/roles', { name: values.name.trim(), permissions: checkedPermissions(dialogRef, catalog.groups) });
      },
    });
    if (disposed) return;
    if (saved) toast('Papel criado.', { tone: 'success' });
    if (saved || hadFailure) await load({ keepDraft: true });
  }
  let dialogRef = null;

  async function renameRole(role) {
    const { saved, hadFailure } = await openTrackedFormDialog({
      title: `Renomear o papel ${role.name}`,
      submitLabel: 'Salvar nome',
      busyLabel: 'Salvando…',
      body: roleNameBody(role.name),
      validators: roleNameValidators,
      onSubmit: async (values) => {
        await api.patch(`/api/v1/team/roles/${encodeURIComponent(role.id)}`, { name: values.name.trim() });
      },
    });
    if (disposed) return;
    if (saved) toast('Papel renomeado.', { tone: 'success' });
    if (saved || hadFailure) await load({ keepDraft: true });
  }

  async function deleteRole(role) {
    const confirmed = await confirmDialog({
      title: `Excluir o papel ${role.name}?`,
      message: role.members > 0 ? `Há ${peopleText(role.members)} com esse papel. Mude o papel delas antes de excluir.` : 'O papel é apagado. Isso não pode ser desfeito.',
      confirmLabel: 'Excluir papel',
      cancelLabel: 'Voltar',
      tone: 'danger',
    });
    if (!confirmed || disposed) return;
    try {
      await api.delete(`/api/v1/team/roles/${encodeURIComponent(role.id)}`);
      if (!disposed) toast('Papel excluído.', { tone: 'success' });
    } catch (error) {
      if (!disposed) toast(describeError(error), { tone: 'danger' });
    }
    await load({ keepDraft: true });
  }

  region.addEventListener('click', (event) => {
    const cell = event.target.closest('.pm-check[data-role]');
    if (cell && !cell.disabled) {
      draft = togglePermission(draft, roles, cell.dataset.role, cell.dataset.key);
      const on = (draft.get(cell.dataset.role) ?? new Set()).has(cell.dataset.key);
      cell.setAttribute('aria-checked', String(on));
      mount(cell, check(on, false));
      status.textContent = dirty().length ? 'Há alterações não salvas.' : 'Sem alterações.';
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset;
    if (!action) return;
    if (action.action === 'retry') load();
    const role = roles.find((r) => r.id === action.id && !r.isSystem);
    if (action.action === 'rename-role' && role) renameRole(role);
    if (action.action === 'delete-role' && role) deleteRole(role);
  });
  saveButton.addEventListener('click', save);
  createButton.addEventListener('click', () => {
    if (catalog) createRole();
  });

  load();

  return () => {
    disposed = true;
    disposeShell();
  };
}
