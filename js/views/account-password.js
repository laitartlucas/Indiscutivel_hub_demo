import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { passwordRules } from '../lib/password-rules.js';
import { renderShell } from '../shell.js';
import { alert, button, enhancePasswordToggles, passwordField } from '../ui/components.js';
import { attachForm } from '../ui/form.js';
import { rulesBlock, syncRulesBlock } from '../ui/password-rules-block.js';
import { toast } from '../ui/toast.js';

const HINT = 'Use pelo menos 10 caracteres. Evite senhas comuns e o seu e-mail.';
const KNOWN_FIELDS = new Set(['currentPassword', 'newPassword']);

/** Troca voluntária de senha, aberta pelo Perfil (a troca obrigatória do primeiro acesso é outra tela: /trocar-senha). */
export function renderAccountPassword({ root, session, navigate }) {
  let disposed = false;
  const disposeShell = renderShell({
    root,
    session,
    navigate,
    eyebrow: html`Conta · <a class="back-link" href="#/perfil">← Meu perfil</a>`,
    heading: 'Alterar senha',
    subtitle: 'Ao trocar a senha, os outros aparelhos conectados são desconectados.',
    content: html`<section class="pf-card pf-card-narrow" aria-labelledby="pw-card-title">
      <h2 id="pw-card-title" class="visually-hidden">Troca de senha</h2>
      <div id="pw-banner"></div>
      <form id="pw-form" novalidate>
        ${passwordField({ id: 'pw-current', label: 'Senha atual', name: 'currentPassword', autocomplete: 'current-password', required: true, maxlength: 128 })}
        ${passwordField({ id: 'pw-new', label: 'Nova senha', name: 'newPassword', autocomplete: 'new-password', required: true, maxlength: 128, hint: HINT })}
        ${rulesBlock(passwordRules({}))}
        ${passwordField({ id: 'pw-confirm', label: 'Confirmar nova senha', name: 'confirm', autocomplete: 'new-password', required: true, maxlength: 128 })}
        <div class="row">
          ${button({ label: 'Salvar nova senha', type: 'submit', busyLabel: 'Salvando…' })}
          <a class="btn btn-ghost" href="#/perfil">Cancelar</a>
        </div>
      </form>
    </section>`,
  });
  enhancePasswordToggles(root);
  const formEl = root.querySelector('#pw-form');
  const bannerEl = root.querySelector('#pw-banner');

  formEl.addEventListener('input', () =>
    syncRulesBlock(root, passwordRules({
      currentPassword: formEl.elements.namedItem('currentPassword').value,
      newPassword: formEl.elements.namedItem('newPassword').value,
      confirm: formEl.elements.namedItem('confirm').value,
      email: session.state.user?.email,
    })),
  );

  attachForm(formEl, {
    validators: {
      currentPassword: (value) => (value ? null : 'Informe a senha atual.'),
      newPassword: (value, all) => {
        if ([...value].length < 10) return 'A nova senha precisa ter pelo menos 10 caracteres.';
        if (value === all.currentPassword) return 'A nova senha precisa ser diferente da atual.';
        return null;
      },
      confirm: (value, all) => (value === all.newPassword ? null : 'As senhas não conferem.'),
    },
    onSubmit: async (values, api) => {
      bannerEl.replaceChildren();
      try {
        await session.changePassword(values.currentPassword, values.newPassword);
        toast('Senha alterada com sucesso.', { tone: 'success' });
        navigate('/perfil');
      } catch (error) {
        if (disposed) return;
        const orphan = api.applyServerErrors(error.errors);
        const matched = (error.errors ?? []).some((e) => KNOWN_FIELDS.has(e.field));
        if (!matched) mount(bannerEl, alert({ tone: 'danger', message: orphan.length ? orphan.join(' ') : describeError(error) }));
      }
    },
  });

  return () => {
    disposed = true;
    disposeShell();
  };
}
