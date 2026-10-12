import { ApiError, describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { renderShell } from '../shell.js';
import { alert, button, field, skeleton } from '../ui/components.js';
import { attachForm } from '../ui/form.js';
import { settingsNav } from '../ui/settings-nav.js';
import { toast } from '../ui/toast.js';

// Configurações da mentoria (kit M-Configuracoes): "Organização" (nome e boas-vindas mostrados às alunas, endereço de acesso)
// e "Padrões para novas alunas" (turma, programa e plano usados como valores iniciais em "Nova aluna").
// A mentora não vê dado de negócio de aluna: aqui só há texto de configuração.

const INVALID_RESPONSE = 'Resposta inesperada do servidor. Tente de novo em instantes.';
const KNOWN = new Set(['name', 'welcomeMessage', 'defaultClassName', 'defaultProgram', 'defaultPlan']);

const maxError = (max, message) => (value) => ([...value.trim()].length > max ? message : null);

export const settingsValidators = {
  name: maxError(80, 'O nome é longo demais (máximo 80).'),
  welcomeMessage: maxError(500, 'A mensagem é longa demais (máximo 500).'),
  defaultClassName: maxError(80, 'Turma longa demais (máximo 80).'),
  defaultProgram: maxError(120, 'Programa longo demais (máximo 120).'),
  defaultPlan: maxError(80, 'Plano longo demais (máximo 80).'),
};

/** Valores do formulário -> corpo da API (texto em branco limpa o campo). */
export function settingsPayload(values) {
  const out = {};
  for (const key of KNOWN) out[key] = (values[key] ?? '').trim() === '' ? null : values[key].trim();
  return out;
}

function isSettings(value) {
  return !!value && typeof value === 'object' && typeof value.accessUrl === 'string';
}

function form(s) {
  const v = (key) => s[key] ?? '';
  return html`<form id="mentoria-form" class="st-main" novalidate aria-label="Configurações da mentoria">
    <section class="cfg-card" aria-labelledby="org-title">
      <div class="cfg-card-head"><h2 id="org-title" class="cfg-card-title">Organização</h2><p class="cfg-card-sub">Como a sua mentoria aparece para as alunas.</p></div>
      <div class="cfg-banner" id="mentoria-banner"></div>
      <div class="st-pad">
        <div class="st-fields">
          ${field({ id: 'm-name', label: 'Nome da mentoria', name: 'name', maxlength: 80, value: v('name'), hint: 'Aparece para as alunas no Painel e na tela de acesso ativado.' })}
          <div class="field">
            <p class="field-label" id="m-url-label">Endereço de acesso</p>
            <p class="field-static" aria-labelledby="m-url-label" id="m-url">${s.accessUrl}</p>
            <p class="field-hint">Definido na instalação; só leitura.</p>
          </div>
          <div class="field st-span">
            <label class="field-label" for="m-welcome">Mensagem de boas-vindas</label>
            <div class="field-control"><textarea id="m-welcome" name="welcomeMessage" class="field-input" rows="3" maxlength="500" aria-describedby="m-welcome-hint m-welcome-error">${v('welcomeMessage')}</textarea></div>
            <p class="field-hint" id="m-welcome-hint">Mostrada às alunas na tela de acesso ativado e no Painel. Deixe em branco para não mostrar.</p>
            <p class="field-error" id="m-welcome-error" role="alert"></p>
          </div>
        </div>
      </div>
    </section>
    <section class="cfg-card" aria-labelledby="defaults-title">
      <div class="cfg-card-head"><h2 id="defaults-title" class="cfg-card-title">Padrões para novas alunas</h2><p class="cfg-card-sub">Valores iniciais do diálogo Nova aluna. Você pode trocá-los a cada cadastro; as alunas não veem estes padrões.</p></div>
      <div class="st-pad">
        <div class="st-fields">
          ${field({ id: 'm-class', label: 'Turma padrão', name: 'defaultClassName', maxlength: 80, value: v('defaultClassName') })}
          ${field({ id: 'm-program', label: 'Programa padrão', name: 'defaultProgram', maxlength: 120, value: v('defaultProgram') })}
          ${field({ id: 'm-plan', label: 'Plano padrão', name: 'defaultPlan', maxlength: 80, value: v('defaultPlan') })}
        </div>
      </div>
    </section>
    <div class="st-footer">
      <button type="submit" class="btn btn-primary" data-busy-label="Salvando…"><span class="spinner" aria-hidden="true" hidden></span><span>Salvar alterações</span></button>
    </div>
  </form>`;
}

export function renderSettingsMentora({ root, session, api, navigate }) {
  let disposed = false;
  let seq = 0;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'settings',
    heading: 'Configurações',
    eyebrow: 'ADMINISTRAÇÃO',
    subtitle: 'Nome, boas-vindas e padrões da sua mentoria.',
    content: html`<div class="st">${settingsNav('admin', 'organization')}<div id="settings-page" aria-live="off">${skeleton(4)}</div></div>`,
  });
  const page = root.querySelector('#settings-page');

  function wire() {
    attachForm(page.querySelector('#mentoria-form'), {
      validators: settingsValidators,
      async onSubmit(values, formApi) {
        mount(page.querySelector('#mentoria-banner'), html``);
        try {
          await api.patch('/api/v1/mentora/settings', settingsPayload(values));
          if (!disposed) toast('Configurações da mentoria salvas.', { tone: 'success' });
        } catch (error) {
          if (disposed) return;
          const orphan = formApi.applyServerErrors(error?.errors);
          const matched = (error?.errors ?? []).some((e) => KNOWN.has(e.field));
          if (!matched) mount(page.querySelector('#mentoria-banner'), alert({ tone: 'danger', message: orphan.length ? orphan.join(' ') : describeError(error) }));
        }
      },
    });
  }

  async function load() {
    const mine = ++seq;
    mount(page, skeleton(4));
    let data = null;
    let failure = null;
    try {
      data = await api.get('/api/v1/mentora/settings');
      if (!isSettings(data)) {
        data = null;
        failure = new ApiError({ status: 0, code: 'invalid_response', detail: INVALID_RESPONSE });
      }
    } catch (error) {
      failure = error;
    }
    if (disposed || mine !== seq) return;
    if (data) {
      mount(page, form(data));
      wire();
    } else {
      mount(page, html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar as configurações', message: describeError(failure) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`);
    }
  }

  page.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) load();
  });
  load();

  return () => {
    disposed = true;
    disposeShell();
  };
}
