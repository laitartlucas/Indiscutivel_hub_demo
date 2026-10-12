import { icon } from '../ih-icons.js';
import { html } from '../lib/html.js';
import { metCount } from '../lib/password-rules.js';

/**
 * Medidor de segmentos + lista de requisitos das telas de senha (kit "Redefinir senha"). Um segmento por requisito:
 * o medidor nunca promete mais do que a lista. `rules` é a lista de lib/password-rules.js (só os ids e rótulos importam).
 */
export function rulesBlock(rules) {
  return html`<div class="pw-rules" id="pw-rules">
    <div class="pw-meter" aria-hidden="true">${rules.map(() => html`<span></span>`)}</div>
    <div class="pw-meter-label"><span>Requisitos atendidos</span><b id="pw-count">0 de ${rules.length}</b></div>
    <ul class="pw-checklist">${rules.map(
      (rule) => html`<li data-rule="${rule.id}" data-met="false"><span class="pw-mark" aria-hidden="true">${icon('check', { size: 15, stroke: 2 })}</span><span>${rule.label}</span><span class="sr-only" data-status>(pendente)</span></li>`,
    )}</ul>
  </div>`;
}

/** Atualiza o bloco montado por `rulesBlock` dentro de `root` com o resultado atual dos requisitos. */
export function syncRulesBlock(root, rules) {
  const met = metCount(rules);
  root.querySelectorAll('.pw-meter span').forEach((segment, index) => segment.toggleAttribute('data-on', index < met));
  root.querySelector('#pw-count').textContent = `${met} de ${rules.length}`;
  for (const rule of rules) {
    const item = root.querySelector(`[data-rule="${rule.id}"]`);
    item.dataset.met = String(rule.met);
    item.querySelector('[data-status]').textContent = rule.met ? '(atendido)' : '(pendente)';
  }
}

/**
 * Bloco das telas de redefinição e ativação (kit "Redefinir senha"): medidor de FORÇA de 4 segmentos ("Força da senha" + rótulo)
 * seguido do checklist dos requisitos. O medidor é guia; os requisitos do checklist são os que o servidor exige.
 */
export function strengthBlock(rules) {
  return html`<div class="pw-rules" id="pw-rules">
    <div class="pw-meter" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
    <div class="pw-meter-label" aria-live="polite"><span>Força da senha</span><b id="pw-strength">—</b></div>
    <ul class="pw-checklist">${rules.map(
      (rule) => html`<li data-rule="${rule.id}" data-met="false"><span class="pw-mark" aria-hidden="true">${icon('check', { size: 15, stroke: 2 })}</span><span>${rule.label}</span><span class="sr-only" data-status>(pendente)</span></li>`,
    )}</ul>
  </div>`;
}

/** Atualiza o bloco de `strengthBlock`: `strength` vem de lib/password-strength.js; `rules`, de lib/password-rules.js. */
export function syncStrengthBlock(root, rules, strength) {
  root.querySelectorAll('.pw-meter span').forEach((segment, index) => segment.toggleAttribute('data-on', index < strength.score));
  root.querySelector('#pw-strength').textContent = strength.label || '—';
  for (const rule of rules) {
    const item = root.querySelector(`[data-rule="${rule.id}"]`);
    item.dataset.met = String(rule.met);
    item.querySelector('[data-status]').textContent = rule.met ? '(atendido)' : '(pendente)';
  }
}
