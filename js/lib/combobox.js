// Regras puras do combobox da busca global (sem DOM), testadas em web/test/combobox.test.js.

/**
 * Teclado no campo de busca. Devolve a ação ou null (tecla que o campo trata sozinho, como letras, Home e End).
 *  - `count`: quantos resultados há; `active`: índice ativo (-1 = nenhum); `open`: a lista está aberta;
 *  - `hasText`: o campo tem texto (Esc limpa antes de sair).
 */
export function comboboxKey({ key, count, active, open, hasText = false }) {
  switch (key) {
    case 'ArrowDown':
      if (count === 0) return null;
      if (!open) return { open: true, active: 0 };
      return { active: active < 0 ? 0 : (active + 1) % count };
    case 'ArrowUp':
      if (count === 0) return null;
      if (!open) return { open: true, active: count - 1 };
      return { active: active <= 0 ? count - 1 : active - 1 };
    case 'Enter':
      if (!open || count === 0) return { submit: true };
      return { select: active >= 0 ? active : 0 };
    case 'Escape':
      if (open) return { close: true };
      if (hasText) return { clear: true };
      return { leave: true };
    case 'Tab':
      return open ? { close: true, passThrough: true } : null;
    default:
      return null;
  }
}

/** Opções planas, na ordem em que aparecem na tela, com id estável para aria-activedescendant. */
export function flattenGroups(groups, prefix = 'gsearch-opt') {
  const options = [];
  for (const group of groups ?? []) {
    for (const item of group.items ?? []) {
      options.push({ ...item, group: group.group, groupLabel: group.label, optionId: `${prefix}-${options.length}` });
    }
  }
  return options;
}

const SAFE_LINK = /^#\/[A-Za-z0-9/_\-.%?=&+~]*$/;

/** Só aceita rota interna do app (hash). Qualquer outra coisa (https:, javascript:, //) é descartada. */
export function safeInternalLink(link) {
  return typeof link === 'string' && link.length <= 300 && SAFE_LINK.test(link) && !link.includes('//') ? link : null;
}
