import { describeError } from '../lib/api.js';
import { focusHeading, mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { describeInviteError } from '../lib/invite-errors.js';
import { activationRules } from '../lib/password-rules.js';
import { passwordStrength } from '../lib/password-strength.js';
import { icon, logoMark } from '../ih-icons.js';
import { alert, authScreen, button, checkboxField, enhancePasswordToggles, field, passwordField, skeleton } from '../ui/components.js';
import { attachForm } from '../ui/form.js';
import { strengthBlock, syncStrengthBlock } from '../ui/password-rules-block.js';

const HINT = 'Use pelo menos 10 caracteres. Evite senhas comuns e o seu e-mail.';
const KNOWN_FIELDS = new Set(['password']);
const TITLE_ID = 'activate-title';
const TERMS_ERROR = 'Aceite os termos de uso e a política de privacidade para continuar.';

const SIGN_IN_LINK = html`<a class="btn btn-primary btn-block" href="#/entrar"><span>Entrar</span></a>`;

// Mesmo painel verde nos três estados (carregando, erro do link, formulário): só o miolo muda (kit "Primeiro acesso").
function screen(body) {
  return authScreen({
    eyebrow: 'CONVITE PESSOAL',
    headline: 'Seu espaço de crescimento está pronto.',
    sub: 'Um ambiente reservado para organizar clientes, metas e conquistas — preparado pela sua mentora.',
    labelledBy: TITLE_ID,
    wide: true,
    body,
  });
}

function loadingBody() {
  return html`<div class="auth-heading">
      <p class="auth-eyebrow auth-eyebrow--dark">PRIMEIRO ACESSO</p>
      <h1 id="${TITLE_ID}">Abrindo o seu convite…</h1>
    </div>
    ${skeleton(3)}`;
}

function errorBody({ message, hint, signIn, retry }) {
  return html`<div class="auth-heading">
      <p class="auth-eyebrow auth-eyebrow--dark">PRIMEIRO ACESSO</p>
      <h1 id="${TITLE_ID}">Não foi possível abrir este convite</h1>
      <p class="lead" id="activate-error">${message}</p>
      ${hint ? html`<p class="lead">${hint}</p>` : ''}
    </div>
    ${signIn ? SIGN_IN_LINK : ''}
    ${retry ? button({ label: 'Tentar de novo', id: 'activate-retry', block: true }) : ''}`;
}

// A API não devolve o nome de quem convidou (só o da convidada): o cartão diz "Sua mentora" e mostra o convite pessoal.
function formBody(invite) {
  // Convite de EQUIPE (a mentora convida quem a ajuda): mesmo fluxo, texto próprio.
  const team = invite.kind === 'team';
  return html`<div class="auth-heading">
      <p class="auth-eyebrow auth-eyebrow--dark">PRIMEIRO ACESSO</p>
      <h1 id="${TITLE_ID}" class="auth-title--md">${team ? 'Bem-vinda à equipe da mentoria.' : 'Bem-vinda ao seu novo espaço de crescimento.'}</h1>
      <p class="lead">${team ? 'Seu acesso foi criado pela mentora. Você vê só o que o seu papel permite.' : 'Seu acesso foi criado pela sua mentora.'}</p>
    </div>
    <div class="invite-card">
      <span class="invite-avatar" aria-hidden="true">${logoMark(22)}</span>
      <div class="invite-card-text"><span class="invite-card-title">${team ? 'A mentora convidou você para a equipe' : 'Sua mentora convidou você'}</span><span class="invite-card-sub">Convite pessoal para ${invite.name}</span></div>
      <span class="pill-gold">Convite válido</span>
    </div>
    <div id="activate-banner"></div>
    <div id="activate-summary"></div>
    <form id="activate-form" class="auth-stack auth-stack--24" novalidate>
      ${field({ id: 'activate-email', label: 'E-mail', name: 'email', type: 'email', value: invite.email, autocomplete: 'username', extra: { readonly: true } })}
      <div class="auth-grid-2">
        ${passwordField({ id: 'activate-password', label: 'Nova senha', name: 'password', autocomplete: 'new-password', required: true, maxlength: 128, hint: HINT, extra: { placeholder: 'Mínimo 10 caracteres' } })}
        ${passwordField({ id: 'activate-confirm', label: 'Confirmar senha', name: 'confirm', autocomplete: 'new-password', required: true, maxlength: 128, extra: { placeholder: 'Repita a senha' } })}
      </div>
      ${strengthBlock(activationRules({}))}
      ${checkboxField({
        id: 'activate-terms',
        name: 'terms',
        summaryLabel: 'Termos de uso',
        required: true,
        label: html`Li e aceito os <a href="#/termos" target="_blank" rel="noopener noreferrer">termos de uso<span class="sr-only"> (abre em nova aba)</span></a> e a <a href="#/privacidade" target="_blank" rel="noopener noreferrer">política de privacidade<span class="sr-only"> (abre em nova aba)</span></a>.`,
      })}
      ${button({ label: 'Ativar meu acesso', type: 'submit', block: true, busyLabel: 'Ativando…', iconEnd: icon('arrowRight') })}
    </form>`;
}

/**
 * Tela pública `/convite/:token`. O token só existe aqui (vindo da rota) e nos corpos dos POST: nunca vai para o
 * título da página, para o texto da tela nem para o console. Ao ativar, a sessão abre e o roteador leva a "Acesso ativado".
 */
export function renderActivate({ root, session, api, navigate, params }) {
  const token = params.token;
  let disposed = false;
  let loadId = 0; // ignora a resposta de uma abertura antiga se "Tentar de novo" já iniciou outra

  function show(body) {
    mount(root, screen(body));
    focusHeading(root); // o <h1> novo é o anúncio da mudança de estado
  }

  function showError(error) {
    show(errorBody(describeInviteError(error)));
    root.querySelector('#activate-retry')?.addEventListener('click', load);
  }

  function showForm(invite) {
    show(formBody(invite));
    enhancePasswordToggles(root);

    const formEl = root.querySelector('#activate-form');
    const bannerEl = root.querySelector('#activate-banner');

    function syncRules() {
      const password = formEl.elements.namedItem('password').value;
      syncStrengthBlock(
        root,
        activationRules({ newPassword: password, confirm: formEl.elements.namedItem('confirm').value, email: invite.email }),
        passwordStrength(password, invite.email),
      );
    }
    formEl.addEventListener('input', syncRules);

    function setBanner(content) {
      if (disposed) return;
      if (content) mount(bannerEl, content);
      else bannerEl.replaceChildren();
    }

    attachForm(formEl, {
      summary: root.querySelector('#activate-summary'),
      validators: {
        password: (value) => ([...value].length < 10 ? 'A senha precisa ter pelo menos 10 caracteres.' : null),
        confirm: (value, all) => (value === all.password ? null : 'As senhas não conferem.'),
        terms: () => (formEl.elements.namedItem('terms').checked ? null : TERMS_ERROR),
      },
      onSubmit: async (values, form) => {
        setBanner(null);
        try {
          // Dá certo: a sessão abre e o roteador troca a tela por "Acesso ativado" (o link gasto não fica no histórico).
          const result = await session.activate(token, values.password);
          // Conta com verificação em duas etapas: a senha foi definida, mas a sessão só abre pelo login (com o segundo passo).
          if (result?.twoFactorRequired && !disposed) navigate('/entrar');
        } catch (error) {
          if (disposed) return;
          const orphan = form.applyServerErrors(error.errors);
          const matchedField = (error.errors ?? []).some((e) => KNOWN_FIELDS.has(e.field));
          if (matchedField) return;
          if (orphan.length) return setBanner(alert({ tone: 'danger', message: orphan.join(' ') }));
          const info = describeInviteError(error);
          const text = [info.message, info.hint].filter(Boolean).join(' ');
          // Convite usado por outra aba no meio do caminho: o caminho agora é entrar.
          if (info.signIn) setBanner(html`${alert({ tone: 'danger', message: text })}<a class="btn btn-ghost btn-block" href="#/entrar"><span>Entrar</span></a>`);
          else setBanner(alert({ tone: 'danger', message: text || describeError(error) }));
        }
      },
    });
  }

  async function load() {
    const mine = ++loadId;
    show(loadingBody());
    try {
      const invite = await api.post('/api/v1/invites/lookup', { token }, { allow401: true });
      if (disposed || mine !== loadId) return;
      if (!invite || typeof invite.email !== 'string') throw new Error('invalid_response');
      showForm(invite);
    } catch (error) {
      if (disposed || mine !== loadId) return;
      showError(error);
    }
  }

  load();

  return () => {
    disposed = true;
  };
}
