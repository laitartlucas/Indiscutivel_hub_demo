// Painel flutuante simples (sino, ajuda): abre e fecha pelo gatilho, Esc (devolve o foco), clique fora e foco que sai.
// Só um painel fica aberto por vez. O conteúdo e o teclado interno são de quem usa.

let current = null;

/**
 * @param {object} o
 * @param {HTMLElement} o.trigger botão que abre/fecha (recebe aria-expanded)
 * @param {HTMLElement} o.panel painel (escondido com o atributo `hidden`)
 * @param {() => void} [o.onOpen] roda depois de abrir (é onde o conteúdo pede o foco)
 * @param {() => void} [o.onClose]
 */
export function createPopover({ trigger, panel, onOpen, onClose }) {
  let opened = false;

  function close({ restoreFocus = false } = {}) {
    if (!opened) return;
    opened = false;
    if (current === api) current = null;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('focusin', onFocusIn);
    onClose?.();
    if (restoreFocus && trigger.isConnected) trigger.focus();
  }

  function onKey(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    close({ restoreFocus: true });
  }

  function onOutside(event) {
    const target = event.target;
    if (target instanceof Node && (panel.contains(target) || trigger.contains(target))) return;
    close();
  }

  function onFocusIn(event) {
    const target = event.target;
    if (target instanceof Node && (panel.contains(target) || trigger.contains(target))) return;
    close();
  }

  function open() {
    if (opened) return;
    current?.close();
    opened = true;
    current = api;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('focusin', onFocusIn);
    onOpen?.();
  }

  const api = {
    open,
    close,
    toggle: () => (opened ? close({ restoreFocus: true }) : open()),
    isOpen: () => opened,
    destroy: () => close(),
  };

  trigger.addEventListener('click', () => api.toggle());
  return api;
}

/** Fecha o painel aberto, se houver (usado quando outra coisa do topo toma a cena, como a busca em tela cheia). */
export function closeOpenPopover() {
  current?.close();
}
