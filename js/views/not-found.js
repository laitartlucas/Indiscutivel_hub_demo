import { mount } from '../lib/dom.js';
import { logoMark } from '../ih-icons.js';
import { html } from '../lib/html.js';

export function renderNotFound({ root }) {
  mount(root, html`<main id="main" class="center-page"><div class="not-found"><span class="not-found-mark" aria-hidden="true">${logoMark(44)}</span><h1>Página não encontrada</h1><p class="muted">O endereço que você abriu não existe ou foi movido. Volte ao início para continuar de onde parou.</p><a class="btn btn-primary" href="#/">Voltar ao início</a></div></main>`);
}
