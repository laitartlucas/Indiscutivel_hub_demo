import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { skeleton } from '../ui/components.js';

export function renderLoading({ root }) {
  mount(root, html`<main id="main" class="center-page" aria-busy="true"><div class="auth-card card"><h1 class="sr-only">Carregando</h1>${skeleton(3)}</div></main>`);
}
