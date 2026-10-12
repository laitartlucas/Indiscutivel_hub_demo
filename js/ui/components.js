import { APP_NAME } from '../config.js';
import { authArt, icon, logoMark } from '../ih-icons.js';
import { initials } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';

/**
 * Junta atributos extras do chamador com os fixos do componente. As chaves protegidas sempre vencem;
 * as demais só sobrescrevem `extra` quando têm valor (não undefined/null/false).
 */
function mergeAttrs(extra, fixed, protectedKeys) {
  const out = { ...extra };
  for (const [key, value] of Object.entries(fixed)) {
    if (protectedKeys.includes(key) || (value !== undefined && value !== null && value !== false)) out[key] = value;
  }
  return out;
}

const VARIANTS = new Set(['primary', 'ghost', 'danger']);
const ALERT_TONES = new Set(['info', 'danger', 'success', 'warn']);
const BADGE_TONES = new Set(['neutral', 'good', 'warn', 'bad', 'accent']);

export function button({ label, type = 'button', variant = 'primary', id, block = false, disabled = false, loading = false, busyLabel, small = false, iconStart = '', iconEnd = '', extra = {} }) {
  if (!VARIANTS.has(variant)) throw new Error(`Variante de botão inválida: ${variant}`);
  const cls = `btn btn-${variant}${block ? ' btn-block' : ''}${small ? ' btn-sm' : ''}`;
  return html`<button${attrs(mergeAttrs(extra, { type, id, class: cls, disabled: disabled || loading, 'aria-busy': loading ? 'true' : false, 'data-busy-label': busyLabel }, ['type', 'id', 'class', 'disabled']))}><span${attrs({ class: 'spinner', 'aria-hidden': 'true', hidden: !loading })}></span>${iconStart}<span>${label}</span>${iconEnd}</button>`;
}

/** `before`/`after` são fragmentos html`` opcionais ao lado do input (ex.: ícone de busca; botão de mostrar senha). */
export function field({ id, label, name = id, type = 'text', value = '', autocomplete, required = false, hint, error, inputmode, maxlength, before = '', after = '', extra = {} }) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ');
  return html`<div class="field${error ? ' has-error' : ''}">
    <label class="field-label" for="${id}">${label}</label>
    <div class="field-control">
      ${before}
      <input${attrs(mergeAttrs(extra, { id, name, type, value, autocomplete, inputmode, maxlength, class: 'field-input', required, 'aria-required': required ? 'true' : false, 'aria-invalid': error ? 'true' : false, 'aria-describedby': describedBy }, ['id', 'name', 'type', 'value', 'class']))}>
      ${after}
    </div>
    ${hint ? html`<p class="field-hint" id="${hintId}">${hint}</p>` : ''}
    <p class="field-error" id="${errorId}" role="alert">${error ?? ''}</p>
  </div>`;
}

/** Campo de busca das barras de ferramentas: lupa dentro do campo, rótulo só para leitor de tela (ver .toolbar-search). */
export function searchField({ id, label, placeholder }) {
  const before = html`<span class="field-icon" aria-hidden="true">${icon('search')}</span>`;
  return field({ id, label, name: 'q', type: 'search', before, extra: { placeholder } });
}

/** <select> com as classes de .field. `options` é uma lista de { value, label }; `value` marca a opção selecionada. */
export function selectField({ id, label, name = id, value, options }) {
  return html`<div class="field">
    <label class="field-label" for="${id}">${label}</label>
    <div class="field-control">
      <select id="${id}" name="${name}" class="field-input">
        ${options.map((o) => html`<option${attrs({ value: o.value, selected: o.value === value })}>${o.label}</option>`)}
      </select>
    </div>
  </div>`;
}

/** "Indiscutível Hub" -> INDISCUTÍVEL / HUB (o CSS põe em caixa alta); nome de uma palavra só fica numa linha. */
export function wordmark() {
  const [first, ...rest] = APP_NAME.split(' ');
  return html`<span class="wordmark"><b>${first}</b>${rest.length ? html`<span>${rest.join(' ')}</span>` : ''}</span>`;
}

/** Marca no topo do formulário das telas de acesso; só aparece quando o painel verde está escondido (até 1024 px). */
export function authBrand() {
  return html`<div class="auth-brand">${logoMark(36)}${wordmark()}</div>`;
}

/**
 * Tela de acesso 50/50 do kit: painel verde (decorativo) + coluna do formulário. `body` é o miolo da coluna
 * (cabeçalho, formulário…); o <h1> dele, referenciado por `labelledBy`, é o único título da página.
 * `topLink` (opcional, fragmento html``): a frase do canto superior direito ("Primeiro acesso? Ative sua conta").
 */
export function authScreen({ eyebrow, headline, sub, labelledBy, body, topLink = null, wide = false }) {
  return html`<div class="auth-split">
    <aside class="auth-panel" aria-label="Sobre o ${APP_NAME}">
      ${authArt()}
      <div class="auth-panel-brand">${logoMark(44)}${wordmark()}</div>
      <div class="auth-panel-copy">
        <p class="auth-eyebrow">${eyebrow}</p>
        <p class="auth-panel-headline">${headline}</p>
        <p class="auth-panel-sub">${sub}</p>
      </div>
      <div class="auth-panel-foot"><span>A central de gestão e crescimento da sua mentoria.</span><span>© ${new Date().getFullYear()}</span></div>
    </aside>
    <main id="main" class="auth-form-wrap${topLink ? ' has-toplink' : ''}">${topLink ? html`<p class="auth-toplink">${topLink}</p>` : ''}<section class="auth-form${wide ? ' auth-form--wide' : ''}" aria-labelledby="${labelledBy}">${authBrand()}${body}</section></main>
  </div>`;
}

/** Caixa de seleção do kit (18 px, verde) com erro próprio. `label` é um fragmento html`` (pode ter links). Valida-se pelo `.checked`, não pelo valor. */
export function checkboxField({ id, name = id, label, summaryLabel, checked = false, required = false }) {
  const errorId = `${id}-error`;
  return html`<div class="field field-check">
    <label class="check-row" for="${id}">
      <input${attrs({ type: 'checkbox', id, name, class: 'check-input', checked, required, 'aria-required': required ? 'true' : false, 'aria-describedby': errorId, 'data-summary-label': summaryLabel })}>
      <span>${label}</span>
    </label>
    <p class="field-error" id="${errorId}" role="alert"></p>
  </div>`;
}

/** Link "voltar" no topo das telas de acesso (kit "Esqueci minha senha"). */
export function authBack({ href = '#/entrar', label = 'Voltar para o login' } = {}) {
  return html`<a class="auth-back" href="${href}">${icon('arrowLeft', { size: 16 })}<span>${label}</span></a>`;
}

/** O botão mantém o nome acessível constante ("Mostrar senha") e expõe o estado via aria-pressed. */
export function passwordField({ toggleLabel = 'Mostrar senha', ...props }) {
  const toggle = html`<button type="button" class="field-toggle" data-password-toggle="${props.id}" aria-pressed="false" aria-controls="${props.id}">${icon('eye', { size: 18 })}<span class="sr-only">${toggleLabel}</span></button>`;
  return field({ ...props, type: 'password', after: toggle });
}

/** Liga os botões "Mostrar senha" dentro de `root`. Chame depois de montar o HTML. */
export function enhancePasswordToggles(root) {
  for (const toggle of root.querySelectorAll('[data-password-toggle]')) {
    toggle.addEventListener('click', () => {
      const input = root.querySelector(`#${CSS.escape(toggle.dataset.passwordToggle)}`);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
    });
  }
}

export function alert({ tone = 'info', title, message, id }) {
  if (!ALERT_TONES.has(tone)) throw new Error(`Tom de alerta inválido: ${tone}`);
  const role = tone === 'danger' || tone === 'warn' ? 'alert' : 'status';
  return html`<div${attrs({ id, class: `alert alert-${tone}`, role })}><div>${title ? html`<p class="alert-title">${title}</p>` : ''}${message ? html`<p>${message}</p>` : ''}</div></div>`;
}

export function badge(text, tone = 'neutral') {
  if (!BADGE_TONES.has(tone)) throw new Error(`Tom de selo inválido: ${tone}`);
  return html`<span class="badge badge-${tone}">${text}</span>`;
}

/** `iconName` (opcional) desenha o selo verde com anéis dourados do kit; sem ele, só o texto (cartões pequenos). */
export function emptyState({ title, message, action, iconName }) {
  const art = iconName ? html`<div class="empty-art" aria-hidden="true"><span class="empty-icon">${icon(iconName)}</span></div>` : '';
  return html`<div class="empty">${art}<p class="empty-title">${title}</p><p>${message}</p>${action ?? ''}</div>`;
}

/** Célula de nome das tabelas (kit .ih-table__person): iniciais num círculo + nome. O círculo é só decoração. */
export function personCell(name, avatarUrl = null) {
  return html`<span class="person-cell"><span class="person-avatar" aria-hidden="true">${avatarContent(name, avatarUrl)}</span><span class="person-name">${name}</span></span>`;
}

/** Miolo de um avatar redondo: a foto (quando existe) ou as iniciais. A foto é decorativa: o nome já está ao lado. */
export function avatarContent(name, url) {
  return url ? html`<img class="avatar-img" src="${url}" alt="" width="64" height="64" decoding="async">` : html`${initials(name)}`;
}

/** Cartão de número: rótulo + valor grande. Região nomeada, nunca só cor para comunicar. */
export function statCard({ label, value, id, note, iconName }) {
  return html`<div class="stat-card" role="group"${attrs({ 'aria-label': label })}>
    ${iconName ? html`<span class="stat-card-icon" aria-hidden="true">${icon(iconName, { size: 22 })}</span>` : ''}
    <div class="stat-card-body">
      <p class="stat-card-label">${label}</p>
      <p class="stat-card-value"${attrs({ id })}>${value}</p>
      ${note ? html`<p class="stat-card-note">${note}</p>` : ''}
    </div>
  </div>`;
}

export function skeleton(lines = 3) {
  return html`<div class="skeleton" role="status" aria-label="Carregando"><span class="sr-only">Carregando…</span>${Array.from({ length: lines }, () => html`<div class="skeleton-line"></div>`)}</div>`;
}
