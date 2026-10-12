// O CSP não aceita style="" no HTML. Larguras/alturas que vêm de dados (barras, gráficos) ficam em data-w, data-h e
// data-b (porcentagens) e são aplicadas pela CSSOM (element.style.*), que o CSP permite, depois de pintar a tela.

/** Aplica data-w -> width, data-h -> height e data-b -> bottom (em %) aos filhos de `root` e remove os atributos. */
export function applySizes(root) {
  for (const [attr, prop] of [['data-w', 'width'], ['data-h', 'height'], ['data-b', 'bottom']]) {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      const value = Number(el.getAttribute(attr));
      if (Number.isFinite(value)) el.style[prop] = `${Math.min(100, Math.max(0, value))}%`;
      el.removeAttribute(attr);
    }
  }
}
