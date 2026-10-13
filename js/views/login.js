import { homePath } from '../lib/account.js';
import { codeError, normalizeCode, normalizeRecovery, recoveryCodeError } from '../lib/two-factor.js';
import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { clearRememberedEmail, readRememberedEmail, saveRememberedEmail } from '../lib/remember-email.js';
import { icon } from '../ih-icons.js';
import { alert, authScreen, button, checkboxField, enhancePasswordToggles, field, passwordField } from '../ui/components.js';
import { attachForm } from '../ui/form.js';

const KNOWN_FIELDS = new Set(['email', 'password']);

// Duas versões da mesma tela (kit "Login" e o link "Acessar painel da mentoria"): só mudam o cabeçalho e o link do rodapé.
// Quem decide se a pessoa é aluna ou mentora é a conta, nunca a tela escolhida.
const VARIANTS = {
  student: {
    eyebrow: 'ACESSO',
    title: 'Bem-vinda de volta.',
    lead: 'Entre para continuar de onde você parou.',
    switchText: 'Você é mentora?',
    switchLabel: 'Acessar painel da mentoria',
    switchHref: '#/entrar/mentora',
  },
  mentora: {
    eyebrow: 'MENTORIA',
    title: 'Painel da mentoria.',
    lead: 'Entre para acompanhar suas alunas e a evolução delas.',
    switchText: 'Você é aluna?',
    switchLabel: 'Acessar o meu espaço',
    switchHref: '#/entrar',
  },
};

const PANEL = {
  eyebrow: 'AMBIENTE EXCLUSIVO DA MENTORIA',
  headline: 'Transforme estratégia em crescimento.',
  sub: 'Seus clientes, metas e conquistas organizados em um só lugar — com a clareza de quem sabe exatamente o próximo passo.',
};

/** Segunda tela do login (conta com verificação em duas etapas): o mesmo estilo das telas de acesso, com o campo do código. */
function secondStep(mode, hint = null) {
  const recovery = mode === 'recovery';
  return authScreen({
    ...PANEL,
    labelledBy: 'login-title',
    body: html`<button type="button" class="auth-back auth-back--button" data-back>${icon('arrowLeft', { size: 16 })}<span>Voltar</span></button>
    <div class="auth-heading">
      <p class="auth-eyebrow auth-eyebrow--dark">VERIFICAÇÃO EM DUAS ETAPAS</p>
      <h1 id="login-title" tabindex="-1">${recovery ? 'Use um código de recuperação.' : 'Confirme que é você.'}</h1>
      <p class="lead">${recovery ? 'Digite um dos códigos de recuperação que você guardou. Cada código vale uma vez.' : 'Digite o código de 6 dígitos que o seu aplicativo autenticador está mostrando.'}</p>
    </div>
    <div id="login-banner"></div>
    <div id="login-summary"></div>
    ${hint ? html`<p class="auth-help" id="login-demo-hint">${hint}</p>` : ''}
    <form id="login-2fa-form" class="auth-stack" novalidate>
      ${recovery
        ? field({ id: 'login-recovery', label: 'Código de recuperação', name: 'recoveryCode', autocomplete: 'off', required: true, maxlength: 24, hint: 'Exemplo: ABCDE-FGHJK', extra: { spellcheck: 'false', autocapitalize: 'characters' } })
        : field({ id: 'login-code', label: 'Código de 6 dígitos', name: 'code', autocomplete: 'one-time-code', inputmode: 'numeric', required: true, maxlength: 9, extra: { spellcheck: 'false', autocapitalize: 'off', enterkeyhint: 'done' } })}
      ${button({ label: 'Verificar', type: 'submit', block: true, busyLabel: 'Verificando…', iconEnd: icon('arrowRight') })}
    </form>
    <p class="auth-switch"><button type="button" class="auth-link auth-link--button" data-switch>${recovery ? 'Usar o código do aplicativo' : 'Usar um código de recuperação'}</button></p>`,
  });
}

function form(variant, rememberedEmail, remember = rememberedEmail !== '') {
  const v = VARIANTS[variant];
  return authScreen({
    ...PANEL,
    labelledBy: 'login-title',
    topLink: html`Primeiro acesso? <a href="#/primeiro-acesso">Ative sua conta</a>`,
    body: html`<div class="auth-heading">
      <p class="auth-eyebrow auth-eyebrow--dark">${v.eyebrow}</p>
      <h1 id="login-title">${v.title}</h1>
      <p class="lead">${v.lead}</p>
    </div>
    <div id="login-banner"></div>
    <div id="login-summary"></div>
    <form id="login-form" class="auth-stack" novalidate>
      <div class="auth-fields">
        ${field({ id: 'login-email', label: 'E-mail', name: 'email', type: 'email', value: rememberedEmail, autocomplete: 'username', required: true, inputmode: 'email', maxlength: 254 })}
        ${passwordField({ id: 'login-password', label: 'Senha', name: 'password', autocomplete: 'current-password', required: true, maxlength: 128 })}
        <div class="auth-row">
          ${checkboxField({ id: 'login-remember', name: 'remember', label: 'Lembrar acesso', checked: remember })}
          <a class="auth-link" href="#/recuperar">Esqueci minha senha</a>
        </div>
      </div>
      ${button({ label: 'Entrar', type: 'submit', block: true, busyLabel: 'Entrando…', iconEnd: icon('arrowRight') })}
    </form>
    <p class="auth-note"><span>Ambiente protegido · acesso por convite</span></p>
    <p class="auth-switch">${v.switchText} <a href="${v.switchHref}">${v.switchLabel}</a></p>`,
  });
}

export function renderLogin({ root, session, navigate, variant = 'student' }) {
  const expired = session.state.reason === 'expired';
  const passwordSet = session.state.reason === 'password_set';
  let disposed = false;
  // Estado só em memória: o desafio do segundo passo nunca vai para URL, armazenamento ou histórico.
  let email = readRememberedEmail();
  let remember = email !== '';

  function setBanner(banner) {
    if (disposed) return;
    const bannerEl = root.querySelector('#login-banner');
    if (!bannerEl) return;
    if (banner) mount(bannerEl, alert(banner));
    else bannerEl.replaceChildren();
  }

  // "Lembrar acesso" guarda SÓ o e-mail (nunca a senha), e só depois de um login que deu certo.
  function finish() {
    if (remember) saveRememberedEmail(email);
    else clearRememberedEmail();
    // Fora do try dos envios: uma falha de navegação não é um erro de login.
    navigate(homePath());
  }

  function showCredentials(banner = null) {
    mount(root, form(variant, email, remember));
    enhancePasswordToggles(root);
    const formEl = root.querySelector('#login-form');
    attachForm(formEl, {
      summary: root.querySelector('#login-summary'),
      validators: {
        email: (value) => (value.trim() ? null : 'Informe o seu e-mail.'),
        password: (value) => (value ? null : 'Informe a sua senha.'),
      },
      onSubmit: async (values, api) => {
        setBanner(null);
        let result = null;
        try {
          result = await session.login(values.email.trim(), values.password);
        } catch (error) {
          const orphan = api.applyServerErrors(error.errors);
          const matchedField = (error.errors ?? []).some((e) => KNOWN_FIELDS.has(e.field));
          if (!matchedField) {
            // Segurança: falha de autenticação (ou erro genérico) limpa só a senha; o e-mail digitado é mantido.
            const passwordInput = formEl.elements.namedItem('password');
            passwordInput.value = '';
            setBanner({ tone: 'danger', message: orphan.length ? orphan.join(' ') : describeError(error) });
            if (!disposed) passwordInput.focus();
          }
          return;
        }
        email = values.email.trim();
        remember = Boolean(formEl.elements.namedItem('remember')?.checked);
        if (result?.twoFactor) {
          // A senha estava certa, mas a conta exige o segundo passo: ainda NÃO há sessão.
          if (!disposed) showSecondStep(result.twoFactor.challenge, 'code', null, result.twoFactor.hint ?? null);
          return;
        }
        finish();
      },
    });
    if (banner) setBanner(banner);
    else if (expired) setBanner({ tone: 'warn', message: 'Sua sessão expirou. Entre novamente.' });
    else if (passwordSet) setBanner({ tone: 'info', message: 'Senha definida. Entre com o seu e-mail e a nova senha; depois pediremos o código do aplicativo autenticador.' });
  }

  function showSecondStep(challenge, mode, banner = null, hint = null) {
    mount(root, secondStep(mode, hint));
    const formEl = root.querySelector('#login-2fa-form');
    const name = mode === 'recovery' ? 'recoveryCode' : 'code';
    const input = formEl.elements.namedItem(name);
    root.querySelector('[data-back]').addEventListener('click', () => showCredentials());
    root.querySelector('[data-switch]').addEventListener('click', () => showSecondStep(challenge, mode === 'recovery' ? 'code' : 'recovery', null, hint));
    attachForm(formEl, {
      summary: root.querySelector('#login-summary'),
      validators: { [name]: mode === 'recovery' ? recoveryCodeError : codeError },
      onSubmit: async (values, api) => {
        setBanner(null);
        const factor = mode === 'recovery' ? { recoveryCode: normalizeRecovery(values.recoveryCode) } : { code: normalizeCode(values.code) };
        try {
          await session.verifyTwoFactor(challenge, factor);
        } catch (error) {
          if (disposed) return;
          if (error.code === 'two_factor_expired') {
            // Desafio vencido, esgotado ou de outro navegador: volta ao começo, sem dizer mais que isso.
            showCredentials({ tone: 'warn', message: error.detail });
            return;
          }
          const orphan = api.applyServerErrors(error.errors);
          const matchedField = (error.errors ?? []).some((e) => e.field === name);
          if (!matchedField) setBanner({ tone: 'danger', message: orphan.length ? orphan.join(' ') : describeError(error) });
          input.value = '';
          input.focus();
          return;
        }
        finish();
      },
    });
    if (banner) setBanner(banner);
    input.focus();
  }

  showCredentials();

  return () => {
    disposed = true;
  };
}
