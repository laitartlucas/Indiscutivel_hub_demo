import { LOGOUT_FAILED } from '../config.js';
import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { passwordRules } from '../lib/password-rules.js';
import { alert, authScreen, button, enhancePasswordToggles, passwordField } from '../ui/components.js';
import { attachForm } from '../ui/form.js';
import { rulesBlock, syncRulesBlock } from '../ui/password-rules-block.js';
import { toast } from '../ui/toast.js';

const HINT = 'Use pelo menos 10 caracteres. Evite senhas comuns e o seu e-mail.';
const KNOWN_FIELDS = new Set(['currentPassword', 'newPassword']);

function form() {
  return authScreen({
    eyebrow: 'PRIMEIRO ACESSO',
    headline: 'Uma nova chave para o seu espaço.',
    sub: 'Seus clientes, metas e conquistas organizados em um só lugar — com a clareza de quem sabe exatamente o próximo passo.',
    labelledBy: 'pw-title',
    body: html`<div class="auth-heading">
      <p class="auth-eyebrow auth-eyebrow--dark">REDEFINIR SENHA</p>
      <h1 id="pw-title">Defina uma nova senha</h1>
      <p class="lead">Por segurança, troque a senha temporária antes de continuar.</p>
    </div>
    <div id="pw-banner"></div>
    <form id="pw-form" novalidate>
      ${passwordField({ id: 'pw-current', label: 'Senha atual', name: 'currentPassword', autocomplete: 'current-password', required: true, maxlength: 128 })}
      ${passwordField({ id: 'pw-new', label: 'Nova senha', name: 'newPassword', autocomplete: 'new-password', required: true, maxlength: 128, hint: HINT })}
      ${rulesBlock(passwordRules({}))}
      ${passwordField({ id: 'pw-confirm', label: 'Confirmar nova senha', name: 'confirm', autocomplete: 'new-password', required: true, maxlength: 128 })}
      ${button({ label: 'Salvar nova senha', type: 'submit', block: true, busyLabel: 'Salvando…' })}
    </form>
    <div class="auth-exit">${button({ label: 'Sair', variant: 'ghost', id: 'pw-logout', block: true })}</div>`,
  });
}

export function renderChangePassword({ root, session, navigate }) {
  let leaving = false;
  let disposed = false;

  mount(root, form());
  enhancePasswordToggles(root);

  const bannerEl = root.querySelector('#pw-banner');
  const logoutButton = root.querySelector('#pw-logout');
  const logoutSpinner = logoutButton.querySelector('.spinner');
  const formEl = root.querySelector('#pw-form');

  function syncRules() {
    syncRulesBlock(root, passwordRules({
      currentPassword: formEl.elements.namedItem('currentPassword').value,
      newPassword: formEl.elements.namedItem('newPassword').value,
      confirm: formEl.elements.namedItem('confirm').value,
      email: session.state.user?.email,
    }));
  }
  formEl.addEventListener('input', syncRules);

  function setBanner(banner) {
    if (disposed) return;
    if (banner) mount(bannerEl, alert(banner));
    else bannerEl.replaceChildren();
  }

  attachForm(root.querySelector('#pw-form'), {
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
      setBanner(null);
      try {
        await session.changePassword(values.currentPassword, values.newPassword);
        toast('Senha alterada com sucesso.', { tone: 'success' });
        navigate('/');
      } catch (error) {
        if (disposed) return; // ex.: sessão expirou no meio da operação; a tela já mudou
        const orphan = api.applyServerErrors(error.errors);
        const matchedField = (error.errors ?? []).some((e) => KNOWN_FIELDS.has(e.field));
        if (!matchedField) setBanner({ tone: 'danger', message: orphan.length ? orphan.join(' ') : describeError(error) });
      }
    },
  });

  function setLeaving(next) {
    leaving = next;
    logoutButton.disabled = next;
    if (next) logoutButton.setAttribute('aria-busy', 'true');
    else logoutButton.removeAttribute('aria-busy');
    logoutSpinner.hidden = !next;
  }

  logoutButton.addEventListener('click', async () => {
    if (leaving) return;
    setLeaving(true);
    const confirmed = await session.logout();
    if (!confirmed) toast(LOGOUT_FAILED, { tone: 'danger' });
    if (disposed) return;
    navigate('/entrar');
  });

  return () => {
    disposed = true;
  };
}
