import { html } from '../lib/html.js';
import { mount } from '../lib/dom.js';
import { icon } from '../ih-icons.js';

const TONES = new Set(['info', 'success', 'warn', 'danger', 'premium']);

/**
 * Mostra um aviso: danger vai para #toast-alert-region (role="alert", assertiva); os demais para
 * #toast-region (educada). Os itens não têm papel próprio: a região pré-existente anuncia.
 * Avisos "danger" não somem sozinhos e são anunciados de forma assertiva (role="alert").
 * Os demais somem após `timeout` ms; o tempo pausa com mouse ou foco sobre o aviso.
 * O tom `premium` (XP e conquistas, kit .ih-toast--premium) tem selo dourado e uma segunda linha (`detail`); é um
 * aviso de status (role="status"), nunca assertivo.
 */
export function toast(message, { tone = 'info', timeout = 5000, detail = '' } = {}) {
  if (!TONES.has(tone)) throw new Error(`Tom de aviso inválido: ${tone}`);
  const region = document.getElementById(tone === 'danger' ? 'toast-alert-region' : 'toast-region');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast toast-${tone}`;
  if (tone === 'premium') item.setAttribute('role', 'status');
  const body =
    tone === 'premium'
      ? html`<span class="toast-badge" aria-hidden="true">${icon('check', { size: 15, stroke: 2.4 })}</span><span class="toast-text"><strong>${message}</strong>${detail ? html`<span class="toast-detail">${detail}</span>` : ''}</span>`
      : html`<span>${message}</span>`;
  mount(item, html`${body}<button type="button" class="toast-close" aria-label="Fechar aviso">×</button>`);

  let timer = null;
  let remaining = timeout;
  let startedAt = 0;
  const stop = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  };
  const remove = () => {
    stop();
    const hadFocus = item.contains(document.activeElement);
    const next = item.nextElementSibling ?? item.previousElementSibling;
    item.remove();
    if (!hadFocus) return;
    const target = next?.querySelector('.toast-close') ?? document.querySelector('h1');
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  };
  const start = () => {
    if (tone === 'danger' || timeout <= 0 || timer !== null) return;
    startedAt = Date.now();
    timer = setTimeout(remove, remaining);
  };
  item.addEventListener('mouseenter', stop);
  item.addEventListener('focusin', stop);
  item.addEventListener('mouseleave', () => { if (!item.contains(document.activeElement)) start(); });
  item.addEventListener('focusout', () => { if (!item.matches(':hover')) start(); });
  item.querySelector('.toast-close').addEventListener('click', remove);
  region.append(item);
  start();
}
