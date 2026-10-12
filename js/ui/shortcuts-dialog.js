import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { shortcutGroups } from '../lib/shortcuts.js';
import { lockScroll, unlockScroll } from './scroll-lock.js';

const keyCaps = (keys) => keys.map((combo, i) => html`${i > 0 ? html`<span class="kbd-or">ou</span>` : ''}<span class="kbd-combo">${combo.map((k) => html`<kbd>${k}</kbd>`)}</span>`);

/** Diálogo "Atalhos do teclado". Fecha com Esc, com o botão ou clicando no fundo; o foco volta a quem abriu. */
export function openShortcutsDialog(opener = document.activeElement) {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog shortcuts-dialog';
  dialog.setAttribute('aria-labelledby', 'shortcuts-title');
  mount(
    dialog,
    html`<div class="dialog-body"><h2 id="shortcuts-title">Atalhos do teclado</h2>
      ${shortcutGroups().map(
        (group) => html`<section class="shortcuts-group"><h3 class="shortcuts-heading">${group.title}</h3>
          <dl class="shortcuts-list">${group.items.map((item) => html`<div class="shortcuts-row"><dt>${keyCaps(item.keys)}</dt><dd>${item.text}</dd></div>`)}</dl></section>`,
      )}
      <div class="dialog-actions"><button type="button" class="btn btn-primary" data-close>Fechar</button></div></div>`,
  );
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  let pressedOnBackdrop = false;
  const onBackdrop = (event) => {
    if (event.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  dialog.addEventListener('pointerdown', (event) => {
    pressedOnBackdrop = onBackdrop(event);
  });
  dialog.addEventListener('click', (event) => {
    if (pressedOnBackdrop && onBackdrop(event)) dialog.close();
    pressedOnBackdrop = false;
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    unlockScroll();
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  });
  document.body.append(dialog);
  lockScroll();
  dialog.showModal();
  dialog.querySelector('[data-close]').focus();
}
