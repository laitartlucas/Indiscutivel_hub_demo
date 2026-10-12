import { icon } from '../ih-icons.js';
import { initials, mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { MEMBER_STATUS_LABELS, ROLE_NAME_MAX, invitePayload, memberRoleError, roleNameError } from '../lib/team.js';
import { emailError, nameError } from './student-forms.js';
import { badge, field, selectField } from '../ui/components.js';
import { lockScroll, unlockScroll } from '../ui/scroll-lock.js';
import { toast } from '../ui/toast.js';

export { invitePayload, memberRoleError, roleNameError };

let counter = 0;

export const inviteValidators = { name: nameError, email: emailError, roleId: memberRoleError };

/** Corpo do diálogo "Convidar por e-mail": nome, e-mail e papel (kit M-Usuarios). */
export function inviteDialogBody(roles) {
  const options = roles.map((role) => ({ value: role.id, label: role.name }));
  return html`${field({ id: 'team-name', label: 'Nome', name: 'name', required: true, maxlength: 120, autocomplete: 'off' })}
    ${field({ id: 'team-email', label: 'E-mail', name: 'email', type: 'email', required: true, maxlength: 254, autocomplete: 'off', inputmode: 'email', hint: 'O e-mail será o login da pessoa. Você recebe um link para enviar a ela.' })}
    ${selectField({ id: 'team-role', label: 'Papel', name: 'roleId', value: options[0]?.value ?? '', options })}`;
}

export function changeRoleBody(roles, currentId) {
  const options = roles.map((role) => ({ value: role.id, label: role.name }));
  return html`${selectField({ id: 'team-role-change', label: 'Papel', name: 'roleId', value: currentId, options })}
    <p class="field-hint">A mudança vale na próxima ação da pessoa, sem ela precisar sair e entrar de novo.</p>`;
}

export const roleNameValidators = { name: roleNameError };

/** Nome do papel (criar e renomear). */
export function roleNameBody(value = '') {
  return html`${field({ id: 'role-name', label: 'Nome do papel', name: 'name', required: true, maxlength: ROLE_NAME_MAX, autocomplete: 'off', value, hint: `Até ${ROLE_NAME_MAX} caracteres. Exemplo: Apoio de turma.` })}`;
}

async function copyText(text, input) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    input.focus();
    input.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

/**
 * Tela "Acesso criado" (kit M-ConviteEnviado): selo verde, quem é a pessoa, o papel, o link copiável (o servidor não envia e-mail
 * nesta fase) e "Gerar novo link". `reset`: o link redefine a senha de quem já ativou a conta. Resolve com 'resend' ou 'close'.
 * O link só aparece aqui: o servidor não o devolve de novo.
 */
export function accessCreatedDialog({ member, acceptUrl, reset = false }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const uid = `access-${++counter}`;
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog dialog-access';
    dialog.setAttribute('aria-labelledby', `${uid}-title`);
    dialog.setAttribute('aria-describedby', `${uid}-desc`);
    mount(dialog, html`<div class="dialog-body access-body">
      <div class="access-seal" aria-hidden="true"><span class="access-seal-ring"></span><span class="access-seal-core">${icon('mail', { size: 34, stroke: 1.3 })}</span></div>
      <h2 id="${uid}-title" class="access-title">${reset ? 'Link de redefinição criado.' : 'Acesso criado.'}</h2>
      <p id="${uid}-desc" class="access-text">${reset
        ? html`Envie o link a <strong>${member.name}</strong>. Ao usá-lo, a pessoa escolhe uma nova senha e as sessões abertas são encerradas.`
        : html`Criamos o acesso de <strong>${member.name}</strong> (${member.email}). Envie o link abaixo por onde preferir.`}</p>
      <div class="access-card">
        <span class="access-card-avatar" aria-hidden="true">${initials(member.name)}</span>
        <span class="access-card-text"><span class="access-card-name">${member.name}</span><span class="access-card-sub">${member.roleName}</span></span>
        ${badge(MEMBER_STATUS_LABELS[member.status] ?? member.status, member.status === 'active' ? 'good' : 'warn')}
      </div>
      ${field({ id: `${uid}-url`, label: reset ? 'Link de redefinição' : 'Link de acesso', value: acceptUrl, extra: { readonly: true } })}
      <p class="copy-feedback" role="status" aria-live="polite"></p>
      <p class="access-note">O link vale por 7 dias e só pode ser usado uma vez.</p>
      <div class="access-actions">
        <button type="button" class="btn btn-ghost" data-resend>Gerar novo link</button>
        <button type="button" class="btn btn-primary" data-copy>Copiar link</button>
      </div>
      <button type="button" class="btn btn-ghost access-close" data-close>Fechar</button>
    </div>`);
    const input = dialog.querySelector('input');
    const feedback = dialog.querySelector('.copy-feedback');
    let outcome = 'close';
    input.addEventListener('focus', () => input.select());
    dialog.querySelector('[data-copy]').addEventListener('click', async () => {
      if (await copyText(acceptUrl, input)) {
        feedback.textContent = 'Link copiado.';
        toast('Link copiado.', { tone: 'success' });
      } else {
        feedback.textContent = 'Não foi possível copiar sozinho. O link está selecionado: use Ctrl+C.';
        input.focus();
        input.select();
      }
    });
    dialog.querySelector('[data-resend]').addEventListener('click', () => {
      outcome = 'resend';
      dialog.close();
    });
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      unlockScroll();
      dialog.remove();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      resolve(outcome);
    });
    document.body.append(dialog);
    lockScroll();
    dialog.showModal();
    dialog.querySelector('[data-copy]').focus();
  });
}

/** Grupos de checkboxes de permissões (diálogo "Criar papel"): rótulo, descrição e `name` = a chave. */
export function permissionChecklist(groups, selected = []) {
  const on = new Set(selected);
  return html`${groups.map(
    (group, g) => html`<fieldset class="perm-fieldset"><legend class="perm-legend">${group.label}</legend>${group.permissions.map(
      (p) => html`<label class="perm-check" for="perm-new-${g}-${p.key.replace('.', '-')}"><input${attrs({ type: 'checkbox', id: `perm-new-${g}-${p.key.replace('.', '-')}`, name: p.key, class: 'check-input', checked: on.has(p.key) })}><span><b>${p.label}</b><small>${p.description}</small></span></label>`,
    )}</fieldset>`,
  )}`;
}

/** Permissões marcadas no diálogo "Criar papel" (lê o DOM: o formulário só entrega o valor "on" de qualquer caixa), em ordem canônica. */
export function checkedPermissions(root, groups) {
  const keys = groups.flatMap((g) => g.permissions.map((p) => p.key));
  const checked = new Set([...root.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.name));
  return keys.filter((key) => checked.has(key));
}
