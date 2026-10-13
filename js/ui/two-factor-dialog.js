/* global Blob */
import { describeError } from '../lib/api.js';
import { copyText } from '../lib/clipboard.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { RECOVERY_FILE_NAME, classifySecondFactor, codeError, groupKey, normalizeCode, recoveryFileText } from '../lib/two-factor.js';
import { alert, button, checkboxField, enhancePasswordToggles, field, passwordField } from './components.js';
import { openFormDialog } from './form-dialog.js';
import { attachForm } from './form.js';
import { lockScroll, unlockScroll } from './scroll-lock.js';
import { toast } from './toast.js';

const BASE = '/api/v1/account/two-factor';
let counter = 0;

/** Erros de servidor mapeados para os campos do formulário; o que não tem campo vira o aviso do topo. */
async function submitting(formApi, banner, known, work) {
  mount(banner, html``);
  try {
    await work();
    return true;
  } catch (error) {
    const orphan = formApi.applyServerErrors(error?.errors);
    const matched = (error?.errors ?? []).some((e) => known.has(e.field));
    if (!matched) mount(banner, alert({ tone: 'danger', message: orphan[0] ?? describeError(error) }));
    return false;
  }
}

/** Baixa o texto como arquivo .txt gerado aqui mesmo no navegador (Blob): nenhum serviço de terceiros e nada vai à rede. */
function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Modal nativo com o comportamento dos demais diálogos: trava a rolagem, devolve o foco a quem abriu, fundo não fecha. */
function createDialog(uid, className = '') {
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = `dialog dialog-2fa${className ? ` ${className}` : ''}`;
  dialog.setAttribute('aria-labelledby', `${uid}-title`);
  return {
    dialog,
    open() {
      document.body.append(dialog);
      lockScroll();
      dialog.showModal();
    },
    onClose(after) {
      dialog.addEventListener('close', () => {
        unlockScroll();
        dialog.remove();
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        after();
      });
    },
  };
}

function setStatus(dialog, text) {
  const live = dialog.querySelector('[data-feedback]');
  if (live) live.textContent = text;
}

/** O bloco dos 10 códigos de recuperação (lista, copiar, baixar, confirmação "guardei"). Usado na ativação e ao gerar novos. */
function codesPane({ uid, codes, email, heading, intro, doneLabel }) {
  const view = html`<div class="dialog-body">
    <h2 id="${uid}-title" tabindex="-1">${heading}</h2>
    <p>${intro}</p>
    <ul class="tf-codes" aria-label="Códigos de recuperação">${codes.map((c) => html`<li><code translate="no">${c}</code></li>`)}</ul>
    <div class="tf-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-copy-codes>Copiar códigos</button>
      <button type="button" class="btn btn-ghost btn-sm" data-download-codes>Baixar .txt</button>
    </div>
    <p class="copy-feedback" role="status" data-feedback></p>
    ${checkboxField({ id: `${uid}-saved`, name: 'saved', label: 'Guardei os códigos em um lugar seguro' })}
    <div class="dialog-actions">
      <button type="button" class="btn btn-primary" data-done>${doneLabel}</button>
    </div>
  </div>`;
  function wire(dialog, finish) {
    const saved = dialog.querySelector(`#${uid}-saved`);
    const errorEl = dialog.querySelector(`#${uid}-saved-error`);
    saved.addEventListener('change', () => { errorEl.textContent = ''; saved.removeAttribute('aria-invalid'); });
    dialog.querySelector('[data-copy-codes]').addEventListener('click', async () => {
      setStatus(dialog, (await copyText(codes.join('\n'))) ? 'Códigos copiados.' : 'Não foi possível copiar. Selecione os códigos e copie à mão.');
    });
    dialog.querySelector('[data-download-codes]').addEventListener('click', () => {
      downloadText(RECOVERY_FILE_NAME, recoveryFileText(codes, { email }));
      setStatus(dialog, 'Arquivo baixado.');
    });
    dialog.querySelector('[data-done]').addEventListener('click', () => {
      if (!saved.checked) {
        errorEl.textContent = 'Confirme que guardou os códigos antes de continuar.';
        saved.setAttribute('aria-invalid', 'true');
        saved.focus();
        return;
      }
      finish();
    });
    dialog.querySelector('h2').focus();
  }
  return { view, wire };
}

/**
 * Assistente de ativação (4 passos) em diálogo: 1 senha, 2 chave no aplicativo, 3 primeiro código, 4 códigos de recuperação.
 * Resolve true se a verificação ficou ativa. No passo 4 os códigos aparecem UMA vez: Esc não fecha e só "Concluir" (com a
 * confirmação "guardei") encerra. Sem QR de terceiros: a chave é mostrada em texto (agrupada de 4 em 4) e há o link otpauth://.
 */
export function openTwoFactorSetup({ api, email }) {
  return new Promise((resolve) => {
    const uid = `tf-${++counter}`;
    const { dialog, open, onClose } = createDialog(uid);
    let enabled = false;
    let locked = false;
    let setup = null;
    // Esc fecha nos passos 1 a 3; no passo 4 não, para ninguém perder os códigos sem querer.
    dialog.addEventListener('cancel', (event) => { if (locked) event.preventDefault(); });
    onClose(() => resolve(enabled));

    function stepPassword() {
      mount(dialog, html`<div class="dialog-body">
        <h2 id="${uid}-title" tabindex="-1">Ativar a verificação em duas etapas</h2>
        <p class="tf-step">Passo 1 de 4</p>
        <p>Além da senha, você vai digitar um código de 6 dígitos gerado por um aplicativo autenticador no seu celular. Primeiro, confirme a sua senha.</p>
        <form novalidate>
          <div class="form-banner"></div>
          ${passwordField({ id: `${uid}-password`, label: 'Senha atual', name: 'password', autocomplete: 'current-password', required: true, maxlength: 128 })}
          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
            ${button({ label: 'Continuar', type: 'submit', busyLabel: 'Conferindo…' })}
          </div>
        </form>
      </div>`);
      enhancePasswordToggles(dialog);
      dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
      const form = dialog.querySelector('form');
      const banner = dialog.querySelector('.form-banner');
      attachForm(form, {
        validators: { password: (v) => (v ? null : 'Informe a sua senha.') },
        onSubmit: async (values, formApi) => {
          const ok = await submitting(formApi, banner, new Set(['password']), async () => {
            setup = await api.post(`${BASE}/setup`, { password: values.password });
            if (!setup || typeof setup.secret !== 'string' || typeof setup.otpauthUri !== 'string') throw new Error('invalid');
          });
          if (ok) stepKey();
        },
      });
      form.elements.namedItem('password').focus();
    }

    function stepKey() {
      mount(dialog, html`<div class="dialog-body">
        <h2 id="${uid}-title" tabindex="-1">Adicione a conta ao aplicativo</h2>
        <p class="tf-step">Passo 2 de 4</p>
        <ol class="tf-list">
          <li>Abra o seu aplicativo autenticador (Google Authenticator, Authy, 1Password, Microsoft Authenticator ou outro).</li>
          <li>Escolha <strong>Adicionar conta</strong> e depois <strong>Inserir chave de configuração</strong>.</li>
          <li>Digite a chave abaixo, com o tipo <strong>baseada em tempo</strong>. No celular, o botão <strong>Abrir no aplicativo</strong> faz isso por você.</li>
        </ol>
        <div class="tf-keybox">
          <p class="tf-key-label" id="${uid}-keylabel">Chave de configuração</p>
          <p class="tf-key" id="${uid}-key" translate="no" aria-labelledby="${uid}-keylabel">${groupKey(setup.secret)}</p>
          <div class="tf-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-copy-key>Copiar chave</button>
            <a class="btn btn-ghost btn-sm" href="${setup.otpauthUri}" data-open-app>Abrir no aplicativo</a>
          </div>
          <p class="copy-feedback" role="status" data-feedback></p>
        </div>
        <p class="field-hint">Não compartilhe esta chave com ninguém. Ela vale só para a sua conta.</p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="button" class="btn btn-primary" data-next>Já adicionei</button>
        </div>
      </div>`);
      dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
      dialog.querySelector('[data-copy-key]').addEventListener('click', async () => {
        setStatus(dialog, (await copyText(setup.secret)) ? 'Chave copiada.' : 'Não foi possível copiar. Selecione a chave e copie à mão.');
      });
      dialog.querySelector('[data-next]').addEventListener('click', stepCode);
      dialog.querySelector('h2').focus();
    }

    function stepCode() {
      mount(dialog, html`<div class="dialog-body">
        <h2 id="${uid}-title" tabindex="-1">Digite o código do aplicativo</h2>
        <p class="tf-step">Passo 3 de 4</p>
        <p>Confirme que deu certo: digite o código de 6 dígitos que o aplicativo está mostrando agora.</p>
        <form novalidate>
          <div class="form-banner"></div>
          ${field({ id: `${uid}-code`, label: 'Código de 6 dígitos', name: 'code', autocomplete: 'one-time-code', inputmode: 'numeric', maxlength: 9, required: true, hint: setup.demoHint ? `O código muda a cada 30 segundos. ${setup.demoHint}` : 'O código muda a cada 30 segundos.', extra: { spellcheck: 'false', autocapitalize: 'off' } })}
          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost" data-back>Voltar</button>
            ${button({ label: 'Ativar', type: 'submit', busyLabel: 'Ativando…' })}
          </div>
        </form>
      </div>`);
      dialog.querySelector('[data-back]').addEventListener('click', stepKey);
      const form = dialog.querySelector('form');
      const banner = dialog.querySelector('.form-banner');
      attachForm(form, {
        validators: { code: codeError },
        onSubmit: async (values, formApi) => {
          let codes = null;
          const ok = await submitting(formApi, banner, new Set(['code']), async () => {
            const result = await api.post(`${BASE}/enable`, { code: normalizeCode(values.code) });
            if (!Array.isArray(result?.recoveryCodes) || result.recoveryCodes.length === 0) throw new Error('invalid');
            codes = result.recoveryCodes;
          });
          if (ok) stepCodes(codes);
        },
      });
      form.elements.namedItem('code').focus();
    }

    function stepCodes(codes) {
      enabled = true;
      locked = true;
      const pane = codesPane({
        uid,
        codes,
        email,
        heading: 'Guarde os códigos de recuperação',
        intro: 'A verificação em duas etapas está ativa. Se você perder o celular, cada código abaixo entra uma vez no lugar do código do aplicativo. Eles aparecem só agora: copie ou baixe e guarde em um lugar seguro.',
        doneLabel: 'Concluir',
      });
      mount(dialog, pane.view);
      pane.wire(dialog, () => { locked = false; dialog.close(); });
    }

    stepPassword();
    open();
    dialog.querySelector('input')?.focus();
  });
}

/** Desativar: senha E um código (o do aplicativo ou um de recuperação, no mesmo campo). Resolve true se desativou. */
export function openTwoFactorDisable({ api, hint = null }) {
  return openFormDialog({
    title: 'Desativar a verificação em duas etapas',
    description: `A conta volta a pedir só a senha. Confirme com a sua senha e um código do aplicativo (ou um código de recuperação).${hint ? ` ${hint}` : ''}`,
    submitLabel: 'Desativar',
    busyLabel: 'Desativando…',
    className: 'dialog-2fa',
    body: html`${passwordField({ id: 'tfd-password', label: 'Senha atual', name: 'password', autocomplete: 'current-password', required: true, maxlength: 128 })}
      ${field({ id: 'tfd-code', label: 'Código do aplicativo ou de recuperação', name: 'code', autocomplete: 'one-time-code', required: true, maxlength: 24, extra: { spellcheck: 'false', autocapitalize: 'characters' } })}`,
    validators: {
      password: (v) => (v ? null : 'Informe a sua senha.'),
      code: (v) => (classifySecondFactor(v) ? null : 'Digite os 6 números do aplicativo ou um código de recuperação de 10 caracteres.'),
    },
    onMount: (dialog) => enhancePasswordToggles(dialog),
    onSubmit: async (values) => {
      try {
        await api.post(`${BASE}/disable`, { password: values.password, ...classifySecondFactor(values.code) });
      } catch (error) {
        if (Array.isArray(error?.errors)) error.errors = error.errors.map((e) => (e.field === 'recoveryCode' ? { ...e, field: 'code' } : e));
        throw error;
      }
      toast('Verificação em duas etapas desativada.', { tone: 'success' });
    },
  });
}

/** Gerar novos códigos: senha + código do aplicativo; os antigos deixam de valer. Mostra os novos UMA vez. Resolve true se gerou. */
export async function openTwoFactorRegenerate({ api, email, hint = null }) {
  let codes = null;
  const confirmed = await openFormDialog({
    title: 'Gerar novos códigos de recuperação',
    description: `Os códigos atuais deixam de valer. Confirme com a sua senha e o código que o aplicativo está mostrando.${hint ? ` ${hint}` : ''}`,
    submitLabel: 'Gerar códigos',
    busyLabel: 'Gerando…',
    className: 'dialog-2fa',
    body: html`${passwordField({ id: 'tfr-password', label: 'Senha atual', name: 'password', autocomplete: 'current-password', required: true, maxlength: 128 })}
      ${field({ id: 'tfr-code', label: 'Código de 6 dígitos do aplicativo', name: 'code', autocomplete: 'one-time-code', inputmode: 'numeric', required: true, maxlength: 9, extra: { spellcheck: 'false' } })}`,
    validators: { password: (v) => (v ? null : 'Informe a sua senha.'), code: codeError },
    onMount: (dialog) => enhancePasswordToggles(dialog),
    onSubmit: async (values) => {
      const result = await api.post(`${BASE}/recovery-codes`, { password: values.password, code: normalizeCode(values.code) });
      if (!Array.isArray(result?.recoveryCodes) || result.recoveryCodes.length === 0) throw new Error('invalid');
      codes = result.recoveryCodes;
    },
  });
  if (!confirmed || !codes) return false;
  await new Promise((resolve) => {
    const uid = `tf-${++counter}`;
    const { dialog, open, onClose } = createDialog(uid);
    let locked = true;
    dialog.addEventListener('cancel', (event) => { if (locked) event.preventDefault(); });
    onClose(resolve);
    const pane = codesPane({
      uid,
      codes,
      email,
      heading: 'Novos códigos de recuperação',
      intro: 'Os códigos antigos não valem mais. Estes aparecem só agora: copie ou baixe e guarde em um lugar seguro.',
      doneLabel: 'Concluir',
    });
    mount(dialog, pane.view);
    open();
    pane.wire(dialog, () => { locked = false; dialog.close(); });
  });
  return true;
}
