import { homePath } from '../lib/account.js';
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

function form(variant, rememberedEmail) {
  const v = VARIANTS[variant];
  return authScreen({
    eyebrow: 'AMBIENTE EXCLUSIVO DA MENTORIA',
    headline: 'Transforme estratégia em crescimento.',
    sub: 'Seus clientes, metas e conquistas organizados em um só lugar — com a clareza de quem sabe exatamente o próximo passo.',
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
          ${checkboxField({ id: 'login-remember', name: 'remember', label: 'Lembrar acesso', checked: rememberedEmail !== '' })}
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
  let disposed = false;

  mount(root, form(variant, readRememberedEmail()));
  enhancePasswordToggles(root);

  const formEl = root.querySelector('#login-form');
  const bannerEl = root.querySelector('#login-banner');

  function setBanner(banner) {
    if (disposed) return;
    if (banner) mount(bannerEl, alert(banner));
    else bannerEl.replaceChildren();
  }

  attachForm(formEl, {
    summary: root.querySelector('#login-summary'),
    validators: {
      email: (value) => (value.trim() ? null : 'Informe o seu e-mail.'),
      password: (value) => (value ? null : 'Informe a sua senha.'),
    },
    onSubmit: async (values, api) => {
      setBanner(null);
      let loggedIn = false;
      try {
        await session.login(values.email.trim(), values.password);
        loggedIn = true;
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
      }
      // "Lembrar acesso" guarda SÓ o e-mail (nunca a senha), e só depois de um login que deu certo.
      if (loggedIn) {
        if (formEl.elements.namedItem('remember')?.checked) saveRememberedEmail(values.email);
        else clearRememberedEmail();
      }
      // Fora do try: uma falha de navegação não é um erro de login.
      if (loggedIn) navigate(homePath());
    },
  });

  if (expired) setBanner({ tone: 'warn', message: 'Sua sessão expirou. Entre novamente.' });

  return () => {
    disposed = true;
  };
}
