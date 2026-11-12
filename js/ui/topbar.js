import { APP_VERSION } from '../config.js';
import { describeError } from '../lib/api.js';
import { comboboxKey, flattenGroups, safeInternalLink } from '../lib/combobox.js';
import { debounce } from '../lib/debounce.js';
import { mount } from '../lib/dom.js';
import { highlightHtml } from '../lib/highlight.js';
import { attrs, html } from '../lib/html.js';
import {
  bellLabel,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  onNotifications,
  refreshNotifications,
} from '../lib/notifications.js';
import { buildQuery } from '../lib/query.js';
import { searchShortcutLabel } from '../lib/shortcuts.js';
import { icon } from '../ih-icons.js';
import { canSeeIa, iaTopbarButton } from './ia-link.js';
import { menuKey, triggerKey } from './menu.js';
import { notificationList } from './notification-list.js';
import { createPopover } from './popover.js';
import { openShortcutsDialog } from './shortcuts-dialog.js';
import { lockScroll, unlockScroll } from './scroll-lock.js';
import { toast } from './toast.js';

/**
 * Ferramentas do topo (kit Topbar): busca global, ajuda e notificações. A marcação é desenhada por `topbarSearchHtml`
 * e `topbarToolsHtml` (o shell as encaixa no <header>); `mountTopbar` liga o comportamento e devolve a limpeza.
 */

const MOBILE = '(max-width: 768px)';
const SEARCH_DELAY_MS = 250;
const MIN_CHARS = 2;

let api = null;
/** O cliente da API é entregue uma vez pelo app (como o selo de Tarefas). */
export function configureTopbar(client) {
  api = client;
}

// ---------- marcação ----------

export function topbarSearchHtml(user) {
  const placeholder = user?.role === 'admin' || user?.role === 'staff' ? 'Buscar alunas…' : 'Buscar contatos, tarefas, produtos…';
  return html`<div class="gsearch" id="gsearch" data-mobile-open="false">
    <form class="gsearch-form" role="search" aria-label="Busca global" autocomplete="off" novalidate>
      <button type="button" class="icon-btn gsearch-back" id="gsearch-back" aria-label="Fechar a busca">${icon('arrowLeft', { size: 20 })}</button>
      <div class="gsearch-field">
        <span class="gsearch-icon" aria-hidden="true">${icon('search', { size: 17 })}</span>
        <input${attrs({
          id: 'gsearch-input',
          class: 'gsearch-input',
          type: 'search',
          role: 'combobox',
          'aria-label': 'Busca global',
          'aria-autocomplete': 'list',
          'aria-expanded': 'false',
          'aria-controls': 'gsearch-list',
          'aria-keyshortcuts': '/ Control+K Meta+K',
          placeholder,
          maxlength: '100',
          enterkeyhint: 'search',
          autocomplete: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
        })}>
        <button type="button" class="gsearch-clear" id="gsearch-clear" aria-label="Limpar a busca" hidden>${icon('close', { size: 16 })}</button>
        <kbd class="gsearch-kbd" aria-hidden="true">${searchShortcutLabel()}</kbd>
      </div>
    </form>
    <div class="gsearch-pop" id="gsearch-pop" hidden>
      <div class="gsearch-status" id="gsearch-status" role="status" aria-live="polite"></div>
      <div class="gsearch-list" id="gsearch-list" role="listbox" aria-label="Resultados da busca" hidden></div>
    </div>
  </div>`;
}

export function topbarToolsHtml(user) {
  const state = getNotifications();
  const unread = state.unreadCount;
  return html`<button type="button" class="topbar-btn topbar-search-btn" id="gsearch-open" aria-label="Buscar" aria-haspopup="dialog" aria-expanded="false" aria-controls="gsearch">${icon('search', { size: 20 })}</button>
    <div class="topbar-pop">
      <button type="button" class="topbar-btn" id="help-btn" aria-label="Ajuda" title="Ajuda" aria-haspopup="menu" aria-expanded="false" aria-controls="help-panel">${icon('help', { size: 20 })}</button>
      <div class="help-panel" id="help-panel" hidden>
        <div role="menu" aria-label="Ajuda" id="help-menu">
          <a class="help-item" role="menuitem" tabindex="-1" href="#/ajuda" data-help="center"><span class="help-item-icon" aria-hidden="true">${icon('info', { size: 17 })}</span><span class="help-item-text"><b>Central de ajuda</b><small>Como usar cada tela</small></span></a>
          <button type="button" class="help-item" role="menuitem" tabindex="-1" data-help="shortcuts"><span class="help-item-icon" aria-hidden="true">${icon('sparkle', { size: 17 })}</span><span class="help-item-text"><b>Atalhos do teclado</b><small>Busca, menus e calendário</small></span></button>
        </div>
        <p class="help-foot">Indiscutível Hub · versão ${APP_VERSION}</p>
      </div>
    </div>
    ${canSeeIa(user) ? iaTopbarButton() : ''}
    <div class="topbar-pop">
      <button type="button" class="topbar-btn" id="bell-btn" aria-label="${bellLabel(unread)}" title="Notificações" aria-haspopup="dialog" aria-expanded="false" aria-controls="notif-panel">${icon('bell', { size: 20 })}<span class="topbar-dot" id="bell-dot"${unread > 0 ? '' : attrs({ hidden: true })} aria-hidden="true"></span></button>
      <div class="notif-panel" id="notif-panel" role="dialog" aria-labelledby="notif-title" tabindex="-1" hidden>
        <span class="notif-notch" aria-hidden="true"></span>
        <div class="notif-head"><h2 id="notif-title">Notificações</h2><button type="button" class="notif-link" id="notif-read-all">Marcar todas como lidas</button></div>
        <div class="notif-tabs" role="tablist" aria-label="Filtrar notificações">
          <button type="button" role="tab" id="notif-tab-all" class="notif-tab" aria-selected="true" aria-controls="notif-body" data-tab="all">Todas</button>
          <button type="button" role="tab" id="notif-tab-unread" class="notif-tab" aria-selected="false" aria-controls="notif-body" tabindex="-1" data-tab="unread">Não lidas · <span id="notif-unread-n">${unread}</span></button>
        </div>
        <div class="notif-body" id="notif-body" role="tabpanel" aria-labelledby="notif-tab-all"></div>
        <a class="notif-foot" id="notif-all" href="#/notificacoes">Ver todas as notificações</a>
      </div>
    </div>
    <span class="topbar-divider" aria-hidden="true"></span>`;
}

// ---------- montagem ----------

const isEditable = (el) => el instanceof Element && (el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null);

/**
 * @param {object} o
 * @param {HTMLElement} o.root raiz do app
 * @param {object} o.parts partes do shell que ficam inertes com a busca em tela cheia: { sidebar, main, bottomNav, topbar }
 * @returns {() => void} limpeza dos ouvintes globais
 */
export function mountTopbar({ root, parts }) {
  const cleanups = [mountNotifications(root), mountHelp(root), mountSearch(root, parts)];
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

// ---------- sino ----------

function mountNotifications(root) {
  const bellBtn = root.querySelector('#bell-btn');
  const panel = root.querySelector('#notif-panel');
  const body = root.querySelector('#notif-body');
  const dot = root.querySelector('#bell-dot');
  const readAll = root.querySelector('#notif-read-all');
  const unreadN = root.querySelector('#notif-unread-n');
  const tabs = [...root.querySelectorAll('[data-tab]')];
  if (!bellBtn || !panel || !body) return () => {};
  let tab = 'all';
  let signature = '';

  const popover = createPopover({
    trigger: bellBtn,
    panel,
    onOpen: () => {
      paintBody(true);
      // Ao abrir, busca de novo (a consulta também gera os avisos novos). Mostra o que já havia enquanto isso.
      refreshNotifications({ force: true });
      panel.focus({ preventScroll: true });
    },
  });

  function selectTab(next, { focus = false } = {}) {
    tab = next;
    for (const t of tabs) {
      const on = t.dataset.tab === next;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) body.setAttribute('aria-labelledby', t.id);
      if (on && focus) t.focus();
    }
    paintBody(true);
  }

  function paintBell(state) {
    bellBtn.setAttribute('aria-label', bellLabel(state.unreadCount));
    dot.hidden = !(state.unreadCount > 0);
    unreadN.textContent = String(state.unreadCount);
    readAll.disabled = !(state.unreadCount > 0);
  }

  function paintBody(force = false) {
    const state = getNotifications();
    const items = tab === 'unread' ? state.items.filter((n) => !n.readAt) : state.items;
    const next = `${tab}|${state.status}|${items.map((n) => `${n.id}:${n.readAt ? 1 : 0}`).join(',')}`;
    if (!force && next === signature) return;
    signature = next;
    const focusedId = document.activeElement instanceof Element ? document.activeElement.closest('[data-notif-id]')?.dataset.notifId : null;
    body.setAttribute('aria-busy', String(state.status === 'loading'));
    if (state.status === 'idle' || state.status === 'loading') {
      mount(body, html`<div class="notif-skeleton" role="status"><span class="sr-only">Carregando notificações…</span>${[0, 1, 2].map(() => html`<div class="notif-skeleton-row"><span class="notif-skeleton-dot"></span><span class="notif-skeleton-lines"><span class="skeleton-line"></span><span class="skeleton-line"></span></span></div>`)}</div>`);
    } else if (state.status === 'error') {
      mount(body, html`<div class="notif-state" role="alert"><p class="notif-state-title">Não foi possível carregar</p><p>${describeError(state.error)}</p><button type="button" class="btn btn-ghost btn-sm" data-notif-retry>${icon('refresh', { size: 16 })}Tentar novamente</button></div>`);
    } else if (items.length === 0) {
      mount(
        body,
        tab === 'unread'
          ? html`<div class="notif-state"><p class="notif-state-title">Nada novo por aqui</p><p>Você leu tudo. Quando houver um aviso novo, ele aparece neste painel.</p></div>`
          : html`<div class="notif-state"><p class="notif-state-title">Tudo em dia</p><p>Ainda não há notificações. Avisos de tarefas atrasadas e da sua conta aparecem aqui.</p></div>`,
      );
    } else {
      mount(body, notificationList(items));
    }
    if (focusedId) body.querySelector(`[data-notif-id="${CSS.escape(focusedId)}"]`)?.focus();
  }

  const stop = onNotifications((state) => {
    paintBell(state);
    if (popover.isOpen()) paintBody();
  });
  paintBell(getNotifications());

  for (const t of tabs) t.addEventListener('click', () => selectTab(t.dataset.tab));
  panel.querySelector('.notif-tabs').addEventListener('keydown', (event) => {
    const order = tabs.map((t) => t.dataset.tab);
    const at = order.indexOf(tab);
    let next = null;
    if (event.key === 'ArrowRight') next = order[(at + 1) % order.length];
    else if (event.key === 'ArrowLeft') next = order[(at - 1 + order.length) % order.length];
    else if (event.key === 'Home') next = order[0];
    else if (event.key === 'End') next = order.at(-1);
    if (!next) return;
    event.preventDefault();
    selectTab(next, { focus: true });
  });

  readAll.addEventListener('click', () => {
    markAllNotificationsRead().catch(() => toast('Não foi possível marcar como lidas. Tente de novo.', { tone: 'danger' }));
  });
  root.querySelector('#notif-all').addEventListener('click', () => popover.close());
  body.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-notif-retry]')) {
      panel.focus({ preventScroll: true }); // o botão some ao tentar de novo
      refreshNotifications({ force: true });
      return;
    }
    const item = event.target.closest('[data-notif-id]');
    if (!item) return;
    markNotificationRead(item.dataset.notifId).catch(() => toast('Não foi possível marcar como lida. Tente de novo.', { tone: 'danger' }));
    if (item.tagName === 'A') popover.close(); // a navegação segue pelo próprio link
  });
  // Setas movem entre as notificações (Tab continua funcionando como sempre).
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.target instanceof Element && event.target.closest('[role="tablist"]') && event.key === 'ArrowUp') return;
    const focusables = [...body.querySelectorAll('.notif-item')];
    if (focusables.length === 0) return;
    const at = focusables.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = at < 0 ? 0 : Math.min(at + 1, focusables.length - 1);
    else next = at <= 0 ? -1 : at - 1;
    event.preventDefault();
    if (next === -1) tabs.find((t) => t.dataset.tab === tab)?.focus();
    else focusables[next].focus();
  });

  return () => {
    stop();
    popover.destroy();
  };
}

// ---------- ajuda ----------

function mountHelp(root) {
  const btn = root.querySelector('#help-btn');
  const panel = root.querySelector('#help-panel');
  const menu = root.querySelector('#help-menu');
  if (!btn || !panel || !menu) return () => {};
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')];
  const popover = createPopover({ trigger: btn, panel, onOpen: () => items()[0]?.focus() });

  btn.addEventListener('keydown', (event) => {
    const result = triggerKey(event.key);
    if (!result) return;
    event.preventDefault();
    popover.open();
    const list = items();
    (result.focus === 'last' ? list.at(-1) : list[0])?.focus();
  });
  menu.addEventListener('keydown', (event) => {
    const list = items();
    const result = menuKey({ key: event.key, index: list.indexOf(document.activeElement), count: list.length, labels: list.map((el) => el.textContent.trim()) });
    if (!result) return;
    if ('focus' in result) {
      event.preventDefault();
      list[result.focus]?.focus();
    } else if (result.passThrough) {
      popover.close({ restoreFocus: true });
    }
  });
  menu.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const item = event.target.closest('[data-help]');
    if (!item) return;
    popover.close();
    if (item.dataset.help === 'shortcuts') openShortcutsDialog(btn);
  });
  return () => popover.destroy();
}

// ---------- busca ----------

function mountSearch(root, parts) {
  const box = root.querySelector('#gsearch');
  const input = root.querySelector('#gsearch-input');
  const pop = root.querySelector('#gsearch-pop');
  const status = root.querySelector('#gsearch-status');
  const list = root.querySelector('#gsearch-list');
  const clear = root.querySelector('#gsearch-clear');
  const openBtn = root.querySelector('#gsearch-open');
  const backBtn = root.querySelector('#gsearch-back');
  if (!box || !input) return () => {};
  const mq = window.matchMedia(MOBILE);

  let query = '';
  let phase = 'idle'; // idle | hint | loading | results | empty | error
  let options = [];
  let groups = [];
  let active = -1;
  let popupOpen = false;
  let sequence = 0;
  let lastError = null;
  let mobileOpen = false;
  let inerted = [];

  const trimmed = () => input.value.trim();

  function setActive(index, { scroll = true } = {}) {
    active = index;
    for (const el of list.querySelectorAll('[role="option"]')) {
      const on = el.id === options[index]?.optionId;
      el.setAttribute('aria-selected', String(on));
    }
    if (index >= 0 && options[index]) {
      input.setAttribute('aria-activedescendant', options[index].optionId);
      if (scroll) list.querySelector(`#${options[index].optionId}`)?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function paint() {
    const hasList = phase === 'results' && options.length > 0;
    const showPop = popupOpen && (phase !== 'idle' || (mobileOpen && input.value === '')) ;
    pop.hidden = !showPop;
    list.hidden = !(showPop && hasList);
    input.setAttribute('aria-expanded', String(showPop && hasList));
    clear.hidden = input.value === '';
    box.dataset.state = phase;
    if (!showPop) {
      status.textContent = '';
      setActive(-1);
      return;
    }
    if (phase === 'results' && hasList) {
      status.hidden = true;
      status.textContent = '';
      mountResults();
    } else {
      status.hidden = false;
      list.replaceChildren();
      setActive(-1);
      paintStatus();
    }
  }

  function mountResults() {
    let index = 0;
    mount(
      list,
      html`${groups.map((group) => {
        const gid = `gsearch-g-${group.group}`;
        return html`<div role="group" aria-labelledby="${gid}"><div class="gsearch-group" id="${gid}" role="presentation">${group.label}</div>${group.items.map((item) => {
          const opt = options[index++];
          return html`<div class="gsearch-option" role="option" id="${opt.optionId}" aria-selected="false" data-index="${String(index - 1)}"><span class="gsearch-option-icon" aria-hidden="true">${icon(GROUP_ICONS[group.group] ?? 'search', { size: 16 })}</span><span class="gsearch-option-text"><span class="gsearch-option-title">${highlightHtml(item.title, query)}</span>${item.subtitle ? html`<span class="gsearch-option-sub">${highlightHtml(item.subtitle, query)}</span>` : ''}</span></div>`;
        })}</div>`;
      })}`,
    );
    list.setAttribute('aria-busy', 'false');
    setActive(Math.min(active, options.length - 1), { scroll: false });
  }

  function paintStatus() {
    if (phase === 'loading') {
      mount(status, html`<p class="gsearch-msg"><span class="spinner" aria-hidden="true"></span>Buscando…</p>`);
    } else if (phase === 'empty') {
      mount(status, html`<p class="gsearch-msg">Nada encontrado para “${query}”.</p><p class="gsearch-hint">Confira a grafia ou tente outra parte do nome.</p>`);
    } else if (phase === 'error') {
      mount(status, html`<p class="gsearch-msg gsearch-msg-error">${describeError(lastError)}</p><button type="button" class="btn btn-ghost btn-sm" data-gsearch-retry>${icon('refresh', { size: 16 })}Tentar novamente</button>`);
    } else {
      mount(status, html`<p class="gsearch-hint">Digite ao menos ${MIN_CHARS} letras para buscar.</p>`);
    }
  }

  async function run(text) {
    const mine = ++sequence;
    phase = 'loading';
    lastError = null;
    popupOpen = true;
    paint();
    try {
      const res = await api.get(`/api/v1/search${buildQuery({ q: text })}`);
      if (mine !== sequence) return;
      const raw = Array.isArray(res?.data) ? res.data : [];
      // Só entram resultados com rota interna válida (nada de link externo vindo da resposta).
      groups = raw
        .map((g) => ({ ...g, items: Array.isArray(g?.items) ? g.items.filter((i) => safeInternalLink(i?.link)) : [] }))
        .filter((g) => g.items.length);
      options = flattenGroups(groups);
      query = text;
      active = -1;
      phase = options.length ? 'results' : 'empty';
    } catch (error) {
      if (mine !== sequence) return;
      lastError = error;
      query = text;
      phase = 'error';
    }
    paint();
  }

  const scheduled = debounce((text) => run(text), SEARCH_DELAY_MS);

  function onInput() {
    const text = trimmed();
    query = text;
    popupOpen = true;
    if (text.length < MIN_CHARS) {
      scheduled.cancel();
      sequence += 1; // descarta resposta em andamento
      phase = text === '' ? 'idle' : 'hint';
      options = [];
      groups = [];
      active = -1;
      paint();
      return;
    }
    phase = 'loading';
    paint();
    scheduled(text);
  }

  function choose(index) {
    const option = options[index];
    const link = option ? safeInternalLink(option.link) : null;
    if (!link) return;
    scheduled.cancel();
    sequence += 1;
    input.value = '';
    query = '';
    phase = 'idle';
    options = [];
    groups = [];
    popupOpen = false;
    if (mobileOpen) closeMobile({ restoreFocus: false });
    paint();
    input.blur();
    location.hash = link;
  }

  input.addEventListener('input', onInput);
  input.addEventListener('focus', () => {
    popupOpen = true;
    paint();
  });
  input.addEventListener('keydown', (event) => {
    const action = comboboxKey({
      key: event.key,
      count: options.length,
      active,
      open: !list.hidden,
      hasText: input.value !== '',
    });
    if (!action) return;
    if (action.passThrough) {
      popupOpen = false;
      paint();
      return;
    }
    event.preventDefault();
    if ('active' in action) {
      popupOpen = true;
      paint();
      setActive(action.active);
    } else if ('select' in action) {
      choose(action.select);
    } else if (action.submit) {
      const text = trimmed();
      if (text.length >= MIN_CHARS) {
        scheduled.cancel();
        run(text);
      }
    } else if (action.close) {
      event.stopPropagation();
      popupOpen = false;
      paint();
    } else if (action.clear) {
      input.value = '';
      onInput();
    } else if (action.leave) {
      if (mobileOpen) closeMobile({ restoreFocus: true });
      else input.blur();
    }
  });
  box.querySelector('form').addEventListener('submit', (event) => event.preventDefault());
  clear.addEventListener('click', () => {
    input.value = '';
    onInput();
    input.focus();
  });
  // O clique nos resultados não pode tirar o foco do campo (senão a lista fecharia antes do clique).
  pop.addEventListener('mousedown', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('button')) event.preventDefault();
  });
  list.addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
    if (el) choose(Number(el.dataset.index));
  });
  list.addEventListener('mousemove', (event) => {
    const el = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
    if (el && Number(el.dataset.index) !== active) setActive(Number(el.dataset.index), { scroll: false });
  });
  status.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-gsearch-retry]')) {
      // O botão some ao tentar de novo: o foco volta ao campo antes, para a lista não fechar por perder o foco.
      input.focus();
      run(trimmed());
    }
  });
  box.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && box.contains(event.relatedTarget)) return;
    // Sem destino de foco (clicou fora, trocou de janela): fecha a lista; no celular a tela cheia só fecha pelo botão ou Esc.
    popupOpen = false;
    paint();
  });
  const onOutside = (event) => {
    if (event.target instanceof Node && (box.contains(event.target) || openBtn?.contains(event.target))) return;
    if (popupOpen) {
      popupOpen = false;
      paint();
    }
  };
  document.addEventListener('pointerdown', onOutside, true);

  // ---- tela cheia no celular
  function openMobile() {
    if (mobileOpen) return;
    mobileOpen = true;
    box.dataset.mobileOpen = 'true';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Busca');
    openBtn?.setAttribute('aria-expanded', 'true');
    const keep = new Set([box]);
    inerted = [parts.sidebar, parts.main, parts.bottomNav, ...(parts.topbar ? [...parts.topbar.children].filter((el) => !keep.has(el)) : [])].filter(Boolean);
    for (const el of inerted) el.inert = true;
    lockScroll();
    popupOpen = true;
    paint();
    input.focus();
  }

  function closeMobile({ restoreFocus = true } = {}) {
    if (!mobileOpen) return;
    mobileOpen = false;
    box.dataset.mobileOpen = 'false';
    box.removeAttribute('role');
    box.removeAttribute('aria-modal');
    box.removeAttribute('aria-label');
    openBtn?.setAttribute('aria-expanded', 'false');
    for (const el of inerted) el.inert = false;
    inerted = [];
    unlockScroll();
    popupOpen = false;
    paint();
    if (restoreFocus && openBtn?.isConnected) openBtn.focus();
  }

  openBtn?.addEventListener('click', () => (mobileOpen ? closeMobile() : openMobile()));
  backBtn?.addEventListener('click', () => closeMobile());
  const onMq = () => {
    if (!mq.matches && mobileOpen) closeMobile({ restoreFocus: false });
  };
  mq.addEventListener('change', onMq);

  // ---- atalhos: "/" e Ctrl/Cmd+K levam à busca
  const onKey = (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const slash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditable(event.target);
    const ctrlK = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
    if (!slash && !ctrlK) return;
    if (document.querySelector('dialog[open]')) return; // diálogo aberto: o fundo está inerte
    event.preventDefault();
    if (mq.matches) openMobile();
    else {
      input.focus();
      input.select();
    }
  };
  document.addEventListener('keydown', onKey);

  paint();
  return () => {
    scheduled.cancel();
    sequence += 1;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onOutside, true);
    mq.removeEventListener('change', onMq);
    if (mobileOpen) {
      for (const el of inerted) el.inert = false;
      unlockScroll();
    }
  };
}

const GROUP_ICONS = {
  people: 'contatos',
  contacts: 'contatos',
  leads: 'leads',
  companies: 'empresas',
  deals: 'pipeline',
  tasks: 'tarefas',
  products: 'crm',
  clients: 'conquistas',
  students: 'alunas',
};
