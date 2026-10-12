/** Objetos criados por html()/raw()/attrs(): a única fonte de confiança. */
const SAFE_SET = new WeakSet();
const MAX_DEPTH = 20;

/** @typedef {{ value: string }} SafeHtml */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  let text;
  try {
    text = String(value);
  } catch {
    text = '[objeto]';
  }
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function makeSafe(value) {
  const safe = Object.freeze({ value });
  SAFE_SET.add(safe);
  return safe;
}

export function isSafeHtml(v) {
  return typeof v === 'object' && v !== null && SAFE_SET.has(v);
}

/** Marca um texto JÁ CONFIÁVEL como HTML. Nunca use com dados de usuário. */
export function raw(text) {
  return makeSafe(String(text));
}

function render(value, depth = 0) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (isSafeHtml(value)) return value.value;
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) throw new Error('html: aninhamento excessivo');
    return value.map((v) => render(v, depth + 1)).join('');
  }
  return escapeHtml(value);
}

/**
 * Template tag: escapa TUDO que é interpolado, exceto fragmentos criados por html`` ou raw().
 * Interpole apenas em texto ou dentro de valores de atributo entre aspas duplas; nunca em
 * atributos sem aspas, em posição de nome de atributo, em <script> ou <style>. Para conjuntos
 * dinâmicos de atributos use attrs(). `true`, `false`, null e undefined renderizam vazio.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return makeSafe(out);
}

const ATTR_NAME = /^[a-z][a-z0-9-]*$/;
const URL_ATTRS = new Set(['href', 'src', 'action']);
const BLOCKED_ATTRS = new Set(['style', 'srcdoc', 'formaction']);
const STRIP = /[\u0000- \u007f]/g;

function isUnsafeUrl(value) {
  const v = String(value).replace(STRIP, '').toLowerCase();
  return v.startsWith('javascript:') || v.startsWith('data:text/html');
}

function attrValue(name, value) {
  if (name === 'class' && Array.isArray(value)) {
    for (const v of value) {
      if (v !== null && v !== undefined && typeof v === 'object') {
        throw new Error(`Atributo não permitido: valor de objeto em ${name}`);
      }
    }
    return value.filter(Boolean).join(' ');
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error(`Atributo não permitido: valor inválido em ${name}`);
  }
  if (URL_ATTRS.has(name) && isUnsafeUrl(value)) throw new Error('Atributo não permitido: valor de URL inseguro');
  return value;
}

/** Monta atributos seguros. `true` => atributo booleano; `false/null/undefined` => omitido. */
export function attrs(obj) {
  let out = '';
  for (const [name, value] of Object.entries(obj)) {
    if (!ATTR_NAME.test(name)) throw new Error(`Nome de atributo inválido: ${name}`);
    if (name.startsWith('on') || BLOCKED_ATTRS.has(name)) throw new Error(`Atributo não permitido: ${name}`);
    if (value === false || value === null || value === undefined) continue;
    out += value === true ? ` ${name}` : ` ${name}="${escapeHtml(attrValue(name, value))}"`;
  }
  return makeSafe(out);
}
