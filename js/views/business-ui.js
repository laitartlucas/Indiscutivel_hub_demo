import { describeError } from '../lib/api.js';
import { BUSINESS_PERIODS, monthOptions } from '../lib/business.js';
import { attrs, html } from '../lib/html.js';
import { alert, button, emptyState } from '../ui/components.js';

// Peças compartilhadas da Entrega 7: o filtro de período (mês, trimestre, ano e mês específico), o grupo de indicadores de
// UMA natureza (comercial, financeiro ou marketing), barras horizontais com tabela acessível e o bloco de erro com
// "Tentar de novo". Usadas no Painel da aluna (Meu negócio), nos Relatórios da aluna e da mentora e no Painel da mentora.

/**
 * Filtro de período: botões (aria-pressed) e, com `months`, o seletor "Mês específico". Com um mês escolhido, nenhum botão
 * fica pressionado (o mês vale sozinho). `prefix` deixa os ids únicos quando há mais de um filtro na página.
 */
export function filterBar({ prefix, filter, months = 0, label = 'Período' }) {
  const periods = BUSINESS_PERIODS.map(
    (p) => html`<button${attrs({ type: 'button', class: 'segment', 'data-period': p.value, 'aria-pressed': String(!filter.month && p.value === filter.period) })}>${p.label}</button>`,
  );
  const select = months
    ? html`<div class="biz-month"><label class="biz-month-label" for="${prefix}-month">Mês específico</label>
        <select class="field-input biz-month-select" id="${prefix}-month" data-month-select>${monthOptions(months).map((o) => html`<option${attrs({ value: o.value, selected: o.value === (filter.month || '') })}>${o.label}</option>`)}</select></div>`
    : '';
  return html`<div class="biz-filter"><div class="segments" role="group" aria-label="${label}">${periods}</div>${select}</div>`;
}

/**
 * Liga o filtro de `host` (que é repintado por quem chama). `onChange({ period, month })` a cada troca; o foco volta ao
 * controle usado depois de repintar (a pessoa não perde o lugar).
 */
export function bindFilter(host, getFilter, onChange) {
  host.addEventListener('click', (event) => {
    const option = event.target.closest('[data-period]');
    if (!option || !host.contains(option)) return;
    const current = getFilter();
    if (!current.month && option.dataset.period === current.period) return;
    onChange({ period: option.dataset.period, month: '' }, `[data-period="${option.dataset.period}"]`);
  });
  host.addEventListener('change', (event) => {
    const select = event.target.closest('[data-month-select]');
    if (!select) return;
    const current = getFilter();
    onChange({ period: select.value ? 'month' : current.period, month: select.value }, `#${CSS.escape(select.id)}`);
  });
}

/** Indicadores de UMA natureza (nunca misturados): cartão com título, link para o módulo e os números. */
export function kpiGroup({ id, title, href, linkLabel, items, extra = '', note = '' }) {
  return html`<section class="lead-card biz-group" aria-labelledby="${id}-title">
    <div class="od-card-head"><h3 id="${id}-title" class="lead-card-title">${title}</h3>${href ? html`<a class="od-link-btn" href="${href}">${linkLabel}</a>` : ''}</div>
    <div class="biz-kpis">${items.map(
      (k) => html`<div${attrs({ class: `fin-kpi biz-kpi${k.gold ? ' is-gold' : ''}${k.bad ? ' is-bad' : ''}`, role: 'group', 'aria-label': k.label })}><span class="lead-kpi-label">${k.label}</span><span class="fin-kpi-value">${k.value}</span><span class="lead-kpi-note">${k.bad ? html`<span class="sr-only">Atenção: </span>` : ''}${k.note}</span></div>`,
    )}</div>
    ${extra}
    ${note ? html`<p class="rp-foot">${note}</p>` : ''}
  </section>`;
}

/** Cartão de grupo vazio: diz o primeiro passo (link para o módulo). */
export function emptyGroup({ id, title, message, href, actionLabel }) {
  return html`<section class="lead-card biz-group" aria-labelledby="${id}-title">
    <div class="od-card-head"><h3 id="${id}-title" class="lead-card-title">${title}</h3></div>
    ${emptyState({ title: 'Nada no período ainda.', message, action: html`<a class="btn btn-ghost btn-sm" href="${href}">${actionLabel}</a>` })}
  </section>`;
}

/**
 * Barras horizontais (largura em `data-w`) + tabela só para leitores de tela. `rows`: [{ label, value, width, text? }].
 */
export function barList({ rows, caption, valueHeader = 'Quantidade', fill = 'rp-source-1' }) {
  return html`<ul class="rp-sources biz-bars" aria-hidden="true">${rows.map(
      (r) => html`<li><span class="rp-source-name">${r.label}</span><span class="rp-source-track"><span${attrs({ class: `rp-source-fill ${fill}`, 'data-w': String(r.width) })}></span></span><strong class="rp-source-count">${r.text ?? r.value}</strong></li>`,
    )}</ul>
    <div class="sr-only"><table><caption>${caption}</caption><thead><tr><th scope="col">Item</th><th scope="col">${valueHeader}</th></tr></thead><tbody>${rows.map((r) => html`<tr><th scope="row">${r.label}</th><td>${r.text ?? r.value}</td></tr>`)}</tbody></table></div>`;
}

/** Erro de uma região com "Tentar de novo" (`data-action="retry"`, `data-which` diz qual região recarregar). */
export function retryBlock(error, which = '', label = '') {
  return html`<div class="stack biz-error">${alert({ tone: 'danger', message: typeof error === 'string' ? error : describeError(error) })}<div class="row">${button({
    label: 'Tentar de novo',
    variant: 'ghost',
    extra: { 'data-action': 'retry', ...(which ? { 'data-which': which } : {}), ...(label ? { 'aria-label': `Tentar de novo: ${label}` } : {}) },
  })}</div></div>`;
}

/** Lembra uma escolha simples neste aparelho (sem armazenamento: só não lembra). */
export function readSaved(key, isValid, fallback) {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveChoice(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // sem armazenamento: só não lembra
  }
}
