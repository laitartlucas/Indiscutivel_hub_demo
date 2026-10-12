import { html } from '../lib/html.js';
import { mount } from '../lib/dom.js';
import { lockScroll, unlockScroll } from './scroll-lock.js';

let counter = 0;

/** Diálogo modal nativo. Resolve true se confirmado, false se cancelado (botão, Esc ou clique no fundo). */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'primary' }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const uid = `dialog-${++counter}`;
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.setAttribute('aria-labelledby', `${uid}-title`);
    dialog.setAttribute('aria-describedby', `${uid}-desc`);
    mount(dialog, html`<div class="dialog-body"><h2 id="${uid}-title">${title}</h2><p id="${uid}-desc">${message}</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-cancel>${cancelLabel}</button>
        <button type="button" class="btn btn-${tone === 'danger' ? 'danger' : 'primary'}" data-confirm>${confirmLabel}</button>
      </div></div>`);
    let result = false;
    let pressedOnBackdrop = false;
    dialog.querySelector('[data-confirm]').addEventListener('click', () => { result = true; dialog.close(); });
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    // Clique no fundo = alvo é o próprio dialog E o ponto está fora do seu retângulo (cantos
    // arredondados e bordas do dialog não contam). Só fecha se o clique começou e terminou no fundo:
    // arrastar de dentro para fora não fecha.
    const onBackdrop = (event) => {
      if (event.target !== dialog) return false;
      const r = dialog.getBoundingClientRect();
      return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
    };
    dialog.addEventListener('pointerdown', (event) => { pressedOnBackdrop = onBackdrop(event); });
    dialog.addEventListener('click', (event) => {
      if (pressedOnBackdrop && onBackdrop(event)) dialog.close();
      pressedOnBackdrop = false;
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      unlockScroll();
      if (opener instanceof HTMLElement) opener.focus();
      resolve(result);
    });
    document.body.append(dialog);
    lockScroll();
    dialog.showModal();
    // Em ações destrutivas o foco inicial fica no botão seguro (cancelar).
    dialog.querySelector(tone === 'danger' ? '[data-cancel]' : '[data-confirm]').focus();
  });
}
