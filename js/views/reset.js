import { ApiError, describeError } from '../lib/api.js';
import { focusHeading, mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { passwordRules } from '../lib/password-rules.js';
import { passwordStrength } from '../lib/password-strength.js';
import { describeResetError, isDeadLink } from '../lib/reset-errors.js';
import { icon } from '../ih-icons.js';
import { alert, authScreen, button, enhancePasswordToggles, passwordField, skeleton } from '../ui/components.js';
import { attachForm } from '../ui/form.js';
import { strengthBlock, syncStrengthBlock } from '../ui/password-rules-block.js';
import { toast } from '../ui/toast.js';

const LOOKUP_PATH = '/api/v1/auth/password-reset/lookup';
const CONFIRM_PATH = '/api/v1/auth/password-reset/confirm';
const TITLE_ID = 'reset-title';
// Sem "Diferente da senha atual": aqui não há senha atual. O servidor também recusa senha comum, que o navegador não sabe conferir.
const RULE_IDS = ['length', 'email', 'confirm'];

function screen(body) {
  return authScreen({
    eyebrow: 'AMBIENTE EXCLUSIVO DA MENTORIA',
    headline: 'Uma nova chave para o seu espaço.',
    sub: 'Seus clientes, metas e conquistas organizados em um só lugar — com a clareza de quem sabe exatamente o próximo passo.',
    labelledBy: TITLE_ID,
    body,
  });
}

function loadingBody() {
  return html`<div class="auth-heading">
      <p class="auth-eyebrow auth-eyebrow--dark">REDEFINIR SENHA</p>
      <h1 id="${TITLE_ID}">Abrindo o seu link…</h1>
    </div>
    ${skeleton(3)}`;
}

function errorBody({ message, hint, retry }) {
  return html`<div class="auth-heading">
      <p class="auth-eyebrow auth-eyebrow--dark">REDEFINIR SENHA</p>
      <h1 id="${TITLE_ID}">Não foi possível usar este link</h1>
      <p class="lead" id="reset-error">${message}</p>
      ${hint ? html`<p class="lead">${hint}</p>` : ''}
    </div>
    <div class="auth-actions">
      ${retry ? button({ label: 'Tentar de novo', id: 'reset-retry', block: true }) : html`<a class="btn btn-primary btn-block" id="reset-new-link" href="#/recuperar"><span>Pedir um novo link</span></a>`}
      <a class="btn btn-ghost btn-block" href="#/entrar"><span>Voltar para o login</span></a>
    </div>`;
}

function formBody(email) {
  return html`<div class="auth-heading">
      <p class="auth-eyebrow auth-eyebrow--dark">REDEFINIR SENHA</p>
      <h1 id="${TITLE_ID}">Crie uma nova senha</h1>
      <p class="lead">Para <span id="reset-email">${email}</span></p>
    </div>
    <div id="reset-banner"></div>
    <div id="reset-summary"></div>
    <form id="reset-form" class="auth-stack auth-stack--26" novalidate>
      <div class="auth-fields auth-fields--tight">
        ${passwordField({ id: 'reset-password', label: 'Nova senha', name: 'password', autocomplete: 'new-password', required: true, maxlength: 128 })}
        ${strengthBlock(passwordRules({}, { include: RULE_IDS }))}
        ${passwordField({ id: 'reset-confirm', label: 'Confirmar senha', name: 'confirm', autocomplete: 'new-password', required: true, maxlength: 128 })}
      </div>
      ${button({ label: 'Salvar nova senha', type: 'submit', block: true, busyLabel: 'Salvando…', iconEnd: icon('check') })}
    </form>`;
}

/**
 * `#/redefinir/:token`. O token só existe aqui (vindo da rota) e nos corpos dos POST: nunca em outra URL, no texto da
 * tela, no título nem no console. Depois da consulta o endereço é limpo (`#/redefinir`), então ele não fica na barra
 * nem no histórico; recarregar a página pede um novo link.
 */
export function renderReset({ root, api, navigate, params }) {
  const token = params.token;
  let disposed = false;
  let loadId = 0;

  function show(body) {
    mount(root, screen(body));
    focusHeading(root);
  }

  // Troca só a parte "#/redefinir/<token>" do endereço, sem disparar a navegação (a tela continua a mesma).
  function scrubAddress() {
    try {
      if (location.hash.startsWith('#/redefinir/')) window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}#/redefinir`);
    } catch {
      // sem History API: o token só fica na barra de endereço
    }
  }

  function showError(error) {
    show(errorBody(describeResetError(error)));
    root.querySelector('#reset-retry')?.addEventListener('click', load);
  }

  function showForm(email) {
    show(formBody(email));
    enhancePasswordToggles(root);
    const formEl = root.querySelector('#reset-form');
    const bannerEl = root.querySelector('#reset-banner');

    function syncRules() {
      const password = formEl.elements.namedItem('password').value;
      syncStrengthBlock(
        root,
        passwordRules({ newPassword: password, confirm: formEl.elements.namedItem('confirm').value, email }, { include: RULE_IDS }),
        passwordStrength(password, email),
      );
    }
    formEl.addEventListener('input', syncRules);

    attachForm(formEl, {
      summary: root.querySelector('#reset-summary'),
      validators: {
        password: (value) => ([...value].length < 10 ? 'A senha precisa ter pelo menos 10 caracteres.' : null),
        confirm: (value, all) => (value === all.password ? null : 'As senhas não conferem.'),
      },
      onSubmit: async (values, form) => {
        bannerEl.replaceChildren();
        try {
          await api.post(CONFIRM_PATH, { token, password: values.password }, { allow401: true });
        } catch (error) {
          if (disposed) return;
          const orphan = form.applyServerErrors(error.errors);
          if ((error.errors ?? []).some((e) => e.field === 'password')) return;
          if (isDeadLink(error)) return showError(error); // usado, expirado ou cancelado no meio do caminho
          mount(bannerEl, alert({ tone: 'danger', message: orphan.length ? orphan.join(' ') : describeError(error) }));
          return;
        }
        if (disposed) return;
        // A senha mudou e as sessões antigas foram encerradas: o caminho é entrar com a nova.
        toast('Senha alterada. Entre com a nova senha.', { tone: 'success' });
        navigate('/entrar');
      },
    });
  }

  async function load() {
    const mine = ++loadId;
    if (!token) {
      show(errorBody(describeResetError(new ApiError({ status: 404, code: 'not_found', detail: 'Link inválido.' }))));
      return;
    }
    show(loadingBody());
    try {
      const reset = await api.post(LOOKUP_PATH, { token }, { allow401: true });
      if (disposed || mine !== loadId) return;
      if (!reset || typeof reset.email !== 'string') throw new Error('invalid_response');
      scrubAddress();
      showForm(reset.email);
    } catch (error) {
      if (disposed || mine !== loadId) return;
      if (isDeadLink(error)) scrubAddress();
      showError(error);
    }
  }

  load();

  return () => {
    disposed = true;
  };
}
