// Realce do termo buscado, sem innerHTML inseguro: devolve pedaços de texto; quem desenha usa html`` (que escapa tudo).
import { html } from './html.js';

/**
 * Cada caractere vira exatamente um caractere minúsculo e sem acento, então os índices do texto dobrado valem para o
 * texto original ("Conceição" -> "conceicao"; mesma quantidade de letras).
 */
function foldChars(text) {
  let out = '';
  for (const char of String(text)) {
    const base = char.normalize('NFD')[0] ?? char;
    out += base.toLowerCase()[0] ?? base;
  }
  return out;
}

/** Pedaços [{ text, match }] do texto, marcando onde o termo aparece (sem diferenciar maiúsculas nem acentos). */
export function splitHighlight(text, query) {
  const source = String(text ?? '');
  const needle = foldChars(String(query ?? '').trim());
  if (needle === '') return [{ text: source, match: false }];
  const chars = [...source];
  const folded = [...foldChars(source)];
  const target = [...needle];
  const parts = [];
  let plain = 0;
  let i = 0;
  while (i <= folded.length - target.length) {
    let same = true;
    for (let j = 0; j < target.length; j++) {
      if (folded[i + j] !== target[j]) {
        same = false;
        break;
      }
    }
    if (same) {
      if (i > plain) parts.push({ text: chars.slice(plain, i).join(''), match: false });
      parts.push({ text: chars.slice(i, i + target.length).join(''), match: true });
      i += target.length;
      plain = i;
    } else {
      i += 1;
    }
  }
  if (plain < chars.length) parts.push({ text: chars.slice(plain).join(''), match: false });
  return parts.length ? parts : [{ text: source, match: false }];
}

/** SafeHtml com o termo dentro de <mark>. Todo o texto passa pelo escape de html``. */
export function highlightHtml(text, query) {
  return html`${splitHighlight(text, query).map((part) => (part.match ? html`<mark>${part.text}</mark>` : part.text))}`;
}
