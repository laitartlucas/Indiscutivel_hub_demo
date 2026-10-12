import { icon } from '../ih-icons.js';
import { attrs, html } from '../lib/html.js';

/**
 * Menu de ações ("três pontos"). Dois pedaços:
 *
 * - `actionMenu()` só desenha o HTML (gatilho + lista). Cada item é um <button role="menuitem"> com os
 *   mesmos `data-action`/`data-id` dos botões comuns, então os cliques continuam sendo tratados pela
 *   delegação que cada tela já tem (o menu fecha ANTES, na fase de captura, e devolve o foco ao gatilho:
 *   quem abre um diálogo guarda o `activeElement` como destino do foco na volta).
 * - `installMenus()` liga o comportamento UMA vez no documento (abrir/fechar, setas, Home/End, Esc, Tab,
 *   clique fora, posição para cima ou para baixo conforme o espaço). Não depende da tela que está aberta.
 *
 * A lista usa `position: fixed` (ver css/components.css) para não ser cortada pela rolagem da tabela nem do
 * quadro. As regras de teclado e de posição são funções puras, testadas em web/test/menu.test.js.
 */

let counter = 0;

/**
 * Itens aceitos em `items`:
 *  - { label, action, id?, tone?: 'danger', ariaLabel?, extra? }  um comando;
 *  - { group: 'Mover para', items: [...] }                         grupo com título;
 *  - { separator: true }                                           divisor.
 */
function itemHtml(item) {
  if (item.separator) return html`<div class="menu-sep" role="separator"></div>`;
  if (item.group) {
    return html`<div class="menu-group" role="group"${attrs({ 'aria-label': item.group })}>
      <span class="menu-heading" aria-hidden="true">${item.group}</span>
      ${item.items.map(itemHtml)}
    </div>`;
  }
  const cls = `menu-item${item.tone === 'danger' ? ' menu-item-danger' : ''}`;
  return html`<button${attrs({
    type: 'button',
    role: 'menuitem',
    tabindex: '-1',
    class: cls,
    'data-action': item.action,
    'data-id': item.id,
    'aria-label': item.ariaLabel,
    ...item.extra,
  })}>${item.label}</button>`;
}

/**
 * Gatilho + lista. `label` é o nome acessível do gatilho ("Mais ações de Maria"); `id` (opcional) vai no
 * `data-id` do gatilho para o foco voltar a ele depois de a lista ser redesenhada (ui/list-focus.js).
 */
export function actionMenu({ label, items, id }) {
  const menuId = `menu-${++counter}`;
  return html`<span class="menu">
    <button${attrs({ type: 'button', class: 'menu-trigger', 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId, 'data-action': 'menu', 'data-id': id })}>${icon('more', { size: 20, stroke: 3 })}</button>
    <div${attrs({ class: 'menu-list', role: 'menu', id: menuId, 'aria-label': label, hidden: true })}>${items.map(itemHtml)}</div>
  </span>`;
}

/**
 * Teclado dentro da lista aberta. Devolve o que fazer: `{ focus: índice }`, `{ close: true, restoreFocus }`
 * ou `null` (tecla que o menu não trata). `typed` é o texto digitado (busca pela primeira letra) e
 * `labels` os rótulos dos itens, na ordem.
 */
export function menuKey({ key, index, count, labels = [] }) {
  if (count === 0) return key === 'Escape' ? { close: true, restoreFocus: true } : null;
  switch (key) {
    case 'ArrowDown':
      return { focus: (index + 1) % count };
    case 'ArrowUp':
      return { focus: (index - 1 + count) % count };
    case 'Home':
      return { focus: 0 };
    case 'End':
      return { focus: count - 1 };
    case 'Escape':
      return { close: true, restoreFocus: true };
    case 'Tab':
      return { close: true, restoreFocus: true, passThrough: true };
    default: {
      if (key.length !== 1 || key === ' ') return null;
      const lower = key.toLocaleLowerCase('pt-BR');
      for (let step = 1; step <= count; step++) {
        const next = (index + step) % count;
        if (labels[next]?.toLocaleLowerCase('pt-BR').startsWith(lower)) return { focus: next };
      }
      return null;
    }
  }
}

/** Teclado no gatilho fechado: seta para baixo abre no primeiro item; para cima, no último. Enter e Espaço abrem pelo clique. */
export function triggerKey(key) {
  if (key === 'ArrowDown') return { open: true, focus: 'first' };
  if (key === 'ArrowUp') return { open: true, focus: 'last' };
  return null;
}

const GAP = 4;
const MARGIN = 8;

/**
 * Onde pôr a lista: abaixo do gatilho se couber (ou se houver mais espaço embaixo do que em cima), senão
 * acima; alinhada à direita do gatilho e sempre dentro da janela. Tudo em pixels da janela (position: fixed).
 */
export function placeMenu({ trigger, size, viewport }) {
  const below = viewport.height - trigger.bottom - GAP - MARGIN;
  const above = trigger.top - GAP - MARGIN;
  const placement = size.height <= below || below >= above ? 'down' : 'up';
  let top = placement === 'down' ? trigger.bottom + GAP : trigger.top - GAP - size.height;
  top = Math.max(MARGIN, Math.min(top, viewport.height - size.height - MARGIN));
  let left = trigger.right - size.width;
  left = Math.max(MARGIN, Math.min(left, viewport.width - size.width - MARGIN));
  return { top, left, placement };
}

// ---------- comportamento (documento) ----------

let installed = false;
let current = null; // { trigger, list }

function itemsOf(list) {
  return [...list.querySelectorAll('[role="menuitem"]')].filter((el) => !el.disabled);
}

function listOf(trigger) {
  return trigger.parentElement?.querySelector('.menu-list') ?? null;
}

export function closeMenu({ restoreFocus = false } = {}) {
  if (!current) return;
  const { trigger, list } = current;
  current = null;
  list.hidden = true;
  list.removeAttribute('data-placement');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.closest('.menu')?.classList.remove('is-open');
  if (restoreFocus && trigger.isConnected) trigger.focus();
}

/** Posiciona a lista junto ao gatilho (position: fixed). Devolve false se o gatilho saiu da janela. */
function placeList(trigger, list) {
  const rect = trigger.getBoundingClientRect();
  const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
  if (rect.bottom <= 0 || rect.top >= viewport.height || rect.right <= 0 || rect.left >= viewport.width) return false;
  const place = placeMenu({ trigger: rect, size: { width: list.offsetWidth, height: list.offsetHeight }, viewport });
  list.style.top = `${place.top}px`;
  list.style.left = `${place.left}px`;
  list.dataset.placement = place.placement;
  return true;
}

function openMenu(trigger, focusWhich = null) {
  const list = listOf(trigger);
  if (!list) return;
  closeMenu();
  list.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  trigger.closest('.menu')?.classList.add('is-open');
  placeList(trigger, list);
  current = { trigger, list };
  const items = itemsOf(list);
  // Aberto com o mouse ou toque, o foco fica no gatilho até a primeira seta; pelo teclado vai ao item pedido.
  if (focusWhich === 'last') items.at(-1)?.focus();
  else if (focusWhich) items[0]?.focus();
}

function onClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const trigger = target.closest('.menu-trigger');
  if (trigger) {
    if (current?.trigger === trigger) closeMenu({ restoreFocus: true });
    else openMenu(trigger, event.detail === 0 ? 'first' : null); // detail 0: Enter/Espaço no teclado
    return;
  }
  const item = target.closest('.menu-list [role="menuitem"]');
  // Capture: roda antes dos tratadores de clique das telas, para o foco já estar no gatilho quando o diálogo abrir.
  if (item && current) closeMenu({ restoreFocus: true });
}

function onKeydown(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (current && current.list.contains(target)) {
    const items = itemsOf(current.list);
    const result = menuKey({ key: event.key, index: items.indexOf(target), count: items.length, labels: items.map((el) => el.textContent.trim()) });
    if (!result) return;
    if ('focus' in result) {
      event.preventDefault();
      items[result.focus]?.focus();
    } else {
      if (!result.passThrough) event.preventDefault();
      closeMenu({ restoreFocus: result.restoreFocus });
    }
    return;
  }
  const trigger = target.closest('.menu-trigger');
  if (trigger) {
    if (event.key === 'Escape' && current?.trigger === trigger) {
      closeMenu({ restoreFocus: true });
      return;
    }
    const result = triggerKey(event.key);
    if (!result) return;
    event.preventDefault();
    openMenu(trigger, result.focus);
    return;
  }
  // Foco no gatilho com o menu aberto (aberto por mouse): setas entram na lista.
  if (current && event.key === 'Escape') closeMenu({ restoreFocus: true });
}

function onOutside(event) {
  if (!current) return;
  if (!current.trigger.isConnected) {
    closeMenu(); // a tela foi redesenhada com o menu aberto
    return;
  }
  const target = event.target;
  if (target instanceof Node && (current.list.contains(target) || current.trigger.contains(target))) return;
  closeMenu();
}

/** Liga o comportamento dos menus no documento. Seguro chamar mais de uma vez. */
export function installMenus() {
  if (installed) return;
  installed = true;
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('focusin', onOutside);
  // Rolar (a página, a tabela ou o quadro) ou redimensionar com a lista aberta: ela acompanha o gatilho e só
  // fecha se o gatilho sair da janela. Fechar a qualquer rolagem fechava o menu por acidente (o navegador rola
  // sozinho ao focar ou alinhar colunas), principalmente no celular.
  const follow = (event) => {
    if (!current) return;
    if (event?.target instanceof Node && current.list.contains(event.target)) return;
    if (!current.trigger.isConnected || !placeList(current.trigger, current.list)) closeMenu();
  };
  window.addEventListener('resize', follow);
  document.addEventListener('scroll', follow, true);
}
