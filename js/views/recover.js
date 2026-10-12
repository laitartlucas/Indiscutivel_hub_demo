import { describeError } from '../lib/api.js';
import { APP_NAME } from '../config.js';
import { createCountdown, formatCountdown, RESEND_SECONDS } from '../lib/countdown.js';
import { focusHeading, mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { icon } from '../ih-icons.js';
import { alert, authBack, authScreen, button, field } from '../ui/components.js';
import { attachForm } from '../ui/form.js';

const REQUEST_PATH = '/api/v1/auth/password-reset/request';
const TITLE_ID = 'recover-title';
const PANEL = { eyebrow: 'AMBIENTE EXCLUSIVO DA MENTORIA', headline: 'Clareza para recomeçar de onde parou.', sub: 'Seus clientes, metas e conquistas organizados em um só lugar — com a clareza de quem sabe exatamente o próximo passo.' };
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+$/.test(value);

function formScreen() {
  return authScreen({
    ...PANEL,
    labelledBy: TITLE_ID,
    body: html`${authBack()}
    <div class="auth-heading">
      <p class="auth-eyebrow auth-eyebrow--dark">RECUPERAÇÃO</p>
      <h1 id="${TITLE_ID}">Esqueci minha senha</h1>
      <p class="lead">Informe o e-mail cadastrado. Enviaremos um link seguro para você criar uma nova senha.</p>
    </div>
    <div id="recover-banner"></div>
    <div id="recover-summary"></div>
    <form id="recover-form" class="auth-stack" novalidate>
      ${field({ id: 'recover-email', label: 'E-mail', name: 'email', type: 'email', autocomplete: 'email', required: true, inputmode: 'email', maxlength: 254, extra: { placeholder: 'seu@email.com' } })}
      ${button({ label: 'Enviar link de recuperação', type: 'submit', block: true, busyLabel: 'Enviando…' })}
    </form>
    <p class="auth-help">Não lembra o e-mail cadastrado? Fale com a sua mentora.</p>`,
  });
}

function sentScreen(email) {
  return authScreen({
    ...PANEL,
    labelledBy: TITLE_ID,
    body: html`<div class="success-badge" aria-hidden="true">${icon('mail', { size: 28, stroke: 1.4 })}</div>
    <div class="auth-heading auth-heading--lg">
      <h1 id="${TITLE_ID}">Verifique seu e-mail.</h1>
      <p class="lead lead--ink">Enviamos um link de recuperação para <strong id="recover-sent-email">${email}</strong>. Por segurança, ele expira em 30 minutos.</p>
    </div>
    <div class="info-box">
      <p class="info-box-title">Não encontrou?</p>
      <p>Confira a caixa de spam ou promoções. O e-mail chega em nome do ${APP_NAME}.</p>
    </div>
    <div id="recover-banner"></div>
    <div class="auth-actions">
      <a class="btn btn-primary btn-block" href="#/entrar"><span>Voltar para o login</span></a>
      <button type="button" class="btn btn-ghost btn-block" id="recover-resend" disabled aria-live="off"><span class="spinner" aria-hidden="true" hidden></span><span id="recover-resend-label">Reenviar em ${formatCountdown(RESEND_SECONDS)}</span></button>
    </div>
    <p class="sr-only" id="recover-status" role="status"></p>`,
  });
}

/**
 * `#/recuperar`: pede o link de redefinição. A API responde igual haja ou não conta com o e-mail, e a tela também:
 * qualquer resposta de sucesso leva a "Verifique seu e-mail." (nunca revela se o e-mail existe). Falhas de rede, limite
 * de tentativas e erro do servidor mostram uma mensagem amigável e ficam no formulário.
 */
export function renderRecover({ root, api }) {
  let disposed = false;
  let countdown = null;

  function show(screen, title) {
    mount(root, screen);
    document.title = `${title} — ${APP_NAME}`;
    focusHeading(root);
  }

  function showForm(prefill = '') {
    show(formScreen(), 'Esqueci minha senha');
    const formEl = root.querySelector('#recover-form');
    const bannerEl = root.querySelector('#recover-banner');
    if (prefill) formEl.elements.namedItem('email').value = prefill;
    attachForm(formEl, {
      summary: root.querySelector('#recover-summary'),
      validators: {
        email: (value) => (!value.trim() ? 'Informe o seu e-mail.' : looksLikeEmail(value.trim()) ? null : 'Informe um e-mail válido, como nome@exemplo.com.'),
      },
      onSubmit: async (values, form) => {
        bannerEl.replaceChildren();
        const email = values.email.trim();
        try {
          await api.post(REQUEST_PATH, { email }, { allow401: true });
        } catch (error) {
          if (disposed) return;
          const orphan = form.applyServerErrors(error.errors);
          if ((error.errors ?? []).some((e) => e.field === 'email')) return;
          mount(bannerEl, alert({ tone: 'danger', message: orphan.length ? orphan.join(' ') : describeError(error) }));
          return;
        }
        if (!disposed) showSent(email);
      },
    });
  }

  function showSent(email) {
    show(sentScreen(email), 'Verifique seu e-mail');
    const resend = root.querySelector('#recover-resend');
    const label = root.querySelector('#recover-resend-label');
    const status = root.querySelector('#recover-status');
    const bannerEl = root.querySelector('#recover-banner');
    let sending = false;

    countdown?.stop();
    countdown = createCountdown({
      onTick: (left) => {
        if (disposed || sending || left === 0) return;
        label.textContent = `Reenviar em ${formatCountdown(left)}`;
      },
      onDone: () => {
        if (disposed || sending) return;
        label.textContent = 'Reenviar link';
        resend.disabled = false;
      },
    });
    countdown.start(RESEND_SECONDS);

    resend.addEventListener('click', async () => {
      if (sending || resend.disabled) return;
      sending = true;
      resend.disabled = true;
      resend.setAttribute('aria-busy', 'true');
      resend.querySelector('.spinner').hidden = false;
      label.textContent = 'Reenviando…';
      bannerEl.replaceChildren();
      status.textContent = '';
      let ok = false;
      try {
        await api.post(REQUEST_PATH, { email }, { allow401: true });
        ok = true;
      } catch (error) {
        if (!disposed) mount(bannerEl, alert({ tone: 'danger', message: describeError(error) }));
      }
      if (disposed) return;
      sending = false;
      resend.removeAttribute('aria-busy');
      resend.querySelector('.spinner').hidden = true;
      if (ok) {
        status.textContent = 'Link reenviado.';
        label.textContent = `Reenviar em ${formatCountdown(RESEND_SECONDS)}`;
        countdown.start(RESEND_SECONDS);
      } else {
        label.textContent = 'Reenviar link';
        resend.disabled = false;
      }
    });
  }

  showForm();

  return () => {
    disposed = true;
    countdown?.stop();
  };
}
