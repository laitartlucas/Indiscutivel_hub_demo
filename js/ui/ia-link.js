import { IA_INDISCUTIVEL_URL } from '../config.js';
import { icon } from '../ih-icons.js';
import { html } from '../lib/html.js';

/**
 * Atalhos para a IA Indiscutível (GPT treinado da mentora). Link EXTERNO: sempre nova aba, sem referrer
 * (`noopener noreferrer`), sem rastreamento. Só a aluna e a mentora proprietária o veem; a equipe (staff) não.
 */
export const IA_LABEL = 'IA Indiscutível';
export const IA_ARIA = `${IA_LABEL} (abre em nova aba)`;

/** Aluna e proprietária veem a IA; equipe e qualquer outro papel, não (falha fechada). */
export const canSeeIa = (user) => user?.role === 'user' || user?.role === 'admin';

/** Botão do topo, entre a ajuda e o sino: ícone + rótulo no desktop, só ícone no celular. */
export function iaTopbarButton() {
  return html`<a class="topbar-btn topbar-ia" id="ia-btn" href="${IA_INDISCUTIVEL_URL}" target="_blank" rel="noopener noreferrer" aria-label="${IA_ARIA}" title="${IA_ARIA}">${icon('ia', { size: 20 })}<span class="topbar-ia-label" aria-hidden="true">${IA_LABEL}</span><span class="ext-mark" aria-hidden="true">${icon('external', { size: 13 })}</span></a>`;
}

/** Item do menu lateral. O texto visível é só o rótulo; o aviso "abre em nova aba" vai no aria-label. */
export function iaNavItem() {
  return html`<a class="nav-item nav-item-ext" href="${IA_INDISCUTIVEL_URL}" target="_blank" rel="noopener noreferrer" aria-label="${IA_ARIA}" title="${IA_ARIA}">${icon('ia')}<span class="nav-item-text">${IA_LABEL}</span><span class="ext-mark" aria-hidden="true">${icon('external', { size: 13 })}</span></a>`;
}

/** Cartão discreto do Painel da aluna. */
export function iaCard() {
  return html`<section class="dash-card ia-card" aria-labelledby="ia-card-title">
    <span class="ia-card-icon" aria-hidden="true">${icon('ia', { size: 22 })}</span>
    <div class="ia-card-text"><h2 id="ia-card-title">Tire dúvidas com a IA da sua mentora</h2><p>Uma assistente treinada com o método da sua mentora, disponível a qualquer hora.</p></div>
    <a class="btn btn-ghost ia-card-btn" href="${IA_INDISCUTIVEL_URL}" target="_blank" rel="noopener noreferrer" aria-label="Abrir a ${IA_LABEL} (abre em nova aba)">Abrir a ${IA_LABEL}<span class="ext-mark" aria-hidden="true">${icon('external', { size: 14 })}</span></a>
  </section>`;
}
