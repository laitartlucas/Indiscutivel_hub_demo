// Ponto de entrada da versão de demonstração (substitui /js/app.js no index.html gerado por `npm run build:demo`).
// 1) instala a API falsa em globalThis.fetch ANTES de carregar o app; 2) mostra a faixa "Versão de demonstração".
// No pacote gerado este arquivo fica em demo/boot.js e o app em js/app.js (por isso o caminho '../js/app.js').
import { shouldStartCollapsed } from './banner-state.js';
import { ASSISTANT_EMAIL, createDemoApi, DEMO_PASSWORD, MENTORA_EMAIL, STUDENT_EMAIL } from './mock-api.js';

const AUTOLOGIN_KEY = 'ih-demo-autologin';
const COLLAPSED_KEY = 'ih-demo-banner-collapsed';

const demo = createDemoApi({ latencyMs: 60, fallbackFetch: globalThis.fetch?.bind(globalThis) });
globalThis.fetch = demo.fetch;

function readFlag(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeFlag(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // sem armazenamento: o recurso só não lembra
  }
}

/** Espera o formulário de login aparecer, preenche e envia. */
function fillLoginForm(email) {
  const started = Date.now();
  const timer = setInterval(() => {
    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    if (form && emailInput && passwordInput) {
      clearInterval(timer);
      for (const [input, value] of [[emailInput, email], [passwordInput, DEMO_PASSWORD]]) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      form.requestSubmit();
    } else if (Date.now() - started > 8000) {
      clearInterval(timer);
    }
  }, 50);
}

function loginAs(email) {
  if (document.getElementById('login-form')) return fillLoginForm(email);
  // Ninguém logada (o app ainda está abrindo a tela de entrada): é só esperar o formulário aparecer.
  if (demo.handle('GET', '/api/v1/auth/me').status === 401) {
    location.hash = '#/entrar';
    return fillLoginForm(email);
  }
  // Já há alguém logada: encerra a sessão falsa e recarrega na tela de entrada; o login automático roda no recarregamento.
  writeFlag(AUTOLOGIN_KEY, email);
  demo.handle('POST', '/api/v1/auth/logout', {});
  location.hash = '#/entrar';
  location.reload();
}

function restore(button) {
  if (button.dataset.confirm !== '1') {
    button.dataset.confirm = '1';
    const original = button.textContent;
    button.textContent = 'Confirmar restauração';
    setTimeout(() => {
      button.dataset.confirm = '';
      button.textContent = original;
    }, 4000);
    return;
  }
  demo.reset();
  writeFlag(AUTOLOGIN_KEY, null);
  location.hash = '#/entrar';
  location.reload();
}

const STYLE = `
/* a faixa fixa nunca cobre o fim das telas: o corpo ganha folga embaixo (maior no celular, onde há a barra de navegação) */
body { padding-bottom: 72px; }
.ih-demo { position: fixed; right: 12px; bottom: 12px; z-index: 120; max-width: calc(100vw - 24px); font: 600 12px/1.3 var(--font-sans, system-ui, sans-serif); color: var(--on-green, #fbfaf7); }
.ih-demo-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 6px 6px 6px 12px; border-radius: 12px; background: var(--green-900, #032a15);
  border: 1px solid rgba(220, 194, 137, 0.35); box-shadow: 0 8px 24px rgba(3, 42, 21, 0.28); }
.ih-demo-panel[hidden], .ih-demo-pill[hidden] { display: none; }
.ih-demo-pill { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 12px; border-radius: 999px; font: inherit; cursor: pointer; color: var(--on-green, #fbfaf7);
  background: var(--green-900, #032a15); border: 1px solid rgba(220, 194, 137, 0.45); box-shadow: 0 4px 12px rgba(3, 42, 21, 0.22); }
.ih-demo-pill::before, .ih-demo-label::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--gold-500, #dcc289); flex: none; }
.ih-demo-label { display: inline-flex; align-items: center; gap: 6px; margin-right: 2px; }
.ih-demo button { font: inherit; font-weight: 700; }
.ih-demo-actions button, .ih-demo-close { padding: 4px 10px; min-height: 28px; border-radius: 8px; cursor: pointer; color: var(--on-green, #fbfaf7); background: transparent; border: 1px solid rgba(220, 194, 137, 0.5); }
.ih-demo-close { border-color: transparent; font-size: 16px; line-height: 1; padding: 4px 9px; }
.ih-demo-actions button:hover, .ih-demo-close:hover, .ih-demo-pill:hover { background: rgba(220, 194, 137, 0.16); }
.ih-demo button:focus-visible, .ih-demo a:focus-visible { outline: 2px solid var(--gold-500, #dcc289); outline-offset: 2px; }
.ih-demo-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.ih-demo-reset { flex-basis: 100%; margin: 2px 0 0; padding: 7px 10px; border-radius: 8px; font-weight: 600; background: rgba(220, 194, 137, 0.14); color: var(--on-green, #fbfaf7); }
.ih-demo-reset[hidden] { display: none; }
/* os avisos (toasts) ficam acima da faixa, nunca por baixo dela */
.toast-stack { bottom: 72px; }
.ih-demo-reset a { color: var(--gold-500, #dcc289); font-weight: 700; text-underline-offset: 3px; }
@media (max-width: 768px) {
  body { padding-bottom: 136px; }
  .ih-demo { bottom: 78px; right: 8px; max-width: calc(100vw - 16px); }
  /* aberta no celular: UMA linha (botões que rolam de lado + fechar), nunca metade da tela */
  .ih-demo:has(.ih-demo-panel:not([hidden])) { left: 8px; max-width: none; }
  .ih-demo-panel { flex-wrap: nowrap; gap: 6px; padding: 6px 6px 6px 8px; }
  .ih-demo-label { display: none; }
  .ih-demo-actions { flex: 1 1 auto; min-width: 0; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding: 2px; }
  .ih-demo-actions::-webkit-scrollbar { display: none; }
  .ih-demo-actions button { flex: none; white-space: nowrap; min-height: 32px; }
  .ih-demo-close { flex: none; min-height: 32px; min-width: 32px; }
  .ih-demo-panel:has(.ih-demo-reset:not([hidden])) { flex-wrap: wrap; }
  .ih-demo-panel:has(.ih-demo-reset:not([hidden])) .ih-demo-actions { flex-basis: calc(100% - 44px); }
}
@media (prefers-reduced-motion: no-preference) { .ih-demo { transition: opacity 0.2s ease; } }
`;

function installBanner() {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);

  let collapsed = shouldStartCollapsed({ width: window.innerWidth, height: window.innerHeight, stored: readFlag(COLLAPSED_KEY) });

  const bar = document.createElement('div');
  bar.className = 'ih-demo';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Versão de demonstração');
  bar.innerHTML = `
    <button type="button" class="ih-demo-pill" data-act="expand" aria-expanded="false" aria-controls="ih-demo-panel" aria-label="Mostrar as opções da demonstração">Demonstração</button>
    <div class="ih-demo-panel" id="ih-demo-panel">
      <span class="ih-demo-label">Versão de demonstração · dados fictícios</span>
      <span class="ih-demo-actions">
        <button type="button" data-act="student">Entrar como aluna</button>
        <button type="button" data-act="mentora">Entrar como mentora</button>
        <button type="button" data-act="assistant">Entrar como assistente</button>
        <button type="button" data-act="restore">Restaurar dados de exemplo</button>
      </span>
      <button type="button" class="ih-demo-close" data-act="collapse" aria-label="Recolher a faixa da demonstração"><span aria-hidden="true">×</span></button>
      <p class="ih-demo-reset" data-reset hidden role="status"></p>
    </div>`;
  const pill = bar.querySelector('.ih-demo-pill');
  const panel = bar.querySelector('.ih-demo-panel');
  /** Mostra o rótulo pequeno OU a faixa inteira. `persist`: lembra a escolha nesta aba. */
  function setCollapsed(next, { persist = true, focus = false } = {}) {
    collapsed = next;
    pill.hidden = !next;
    panel.hidden = next;
    pill.setAttribute('aria-expanded', String(!next));
    if (persist) writeFlag(COLLAPSED_KEY, next ? '1' : '0');
    if (focus) (next ? pill : panel.querySelector('[data-act="student"]')).focus();
  }
  setCollapsed(collapsed, { persist: false });
  bar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    const act = button.dataset.act;
    if (act === 'student') loginAs(STUDENT_EMAIL);
    else if (act === 'mentora') loginAs(MENTORA_EMAIL);
    else if (act === 'assistant') loginAs(ASSISTANT_EMAIL);
    else if (act === 'restore') restore(button);
    else setCollapsed(act === 'collapse', { focus: true });
  });
  document.body.append(bar);

  // Recuperação de senha: a demonstração não envia e-mail. Quando há um pedido válido, a faixa oferece o link no lugar dele.
  const notice = bar.querySelector('[data-reset]');
  function syncResetNotice(info) {
    notice.replaceChildren();
    notice.hidden = !info;
    if (!info) return;
    if (collapsed) setCollapsed(false, { persist: false }); // o link de redefinição substitui o e-mail: precisa estar à vista
    const link = document.createElement('a');
    link.href = info.link.slice(info.link.indexOf('#'));
    link.textContent = 'clique aqui para abrir o link de redefinição';
    notice.append('Demonstração: o e-mail não é enviado; ', link);
  }
  // Só aparece nas telas da recuperação de senha (o link vale 30 minutos e não precisa ficar em todas as telas).
  const onResetScreen = () => /^#\/(recuperar|redefinir)/.test(location.hash);
  let current = demo.resetLink();
  const refresh = () => syncResetNotice(onResetScreen() ? current : null);
  demo.onResetChange((info) => {
    current = info;
    refresh();
  });
  window.addEventListener('hashchange', refresh);
  refresh();
}

installBanner();

await import('../js/app.js');

const pending = readFlag(AUTOLOGIN_KEY);
if (pending) {
  writeFlag(AUTOLOGIN_KEY, null);
  fillLoginForm(pending);
}
