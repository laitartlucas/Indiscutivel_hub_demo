import { isSafeHtml } from './html.js';

/** Único ponto do app que escreve HTML no DOM: só aceita SafeHtml. */
export function mount(el, safe) {
  if (!isSafeHtml(safe)) throw new Error('mount() exige html`...` (SafeHtml)');
  el.innerHTML = safe.value;
}

/** Move o foco para o <h1> da tela (leitores de tela anunciam a nova página). */
export function focusHeading(root) {
  const h1 = root.querySelector('h1');
  if (!h1) return;
  h1.setAttribute('tabindex', '-1');
  h1.focus({ preventScroll: true });
}

export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ? [...parts[0]][0] : '';
  const last = parts.length > 1 ? [...parts[parts.length - 1]][0] : '';
  return (first + last).toUpperCase() || '?';
}
