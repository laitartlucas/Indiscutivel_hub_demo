/**
 * Mantém o foco do teclado quando a região de uma lista é redesenhada.
 *
 * `mount()` troca o innerHTML da região: o elemento focado (botão do paginador, "Tentar de novo",
 * ou a ação da linha para onde o diálogo devolveu o foco) é destruído e o foco cai no <body> —
 * quem usa teclado ou leitor de tela volta ao topo do documento a cada página, recarga ou salvamento.
 *
 * Uso: `capture()` ANTES de redesenhar (início do carregamento) e `restore()` DEPOIS do desenho final.
 * Só age se o foco estava dentro da região; se a pessoa levou o foco para outro lugar enquanto a
 * lista carregava (ex.: a busca), não rouba o foco.
 *
 * Destino, em ordem: o mesmo botão do paginador (se ainda habilitado); o mesmo controle
 * (data-action + data-id) se ele ainda existir; a tabela (região rolável, tabindex="0");
 * o primeiro botão habilitado da região (ação do estado vazio ou "Tentar de novo"); `fallback()`.
 */
export function createListFocus(region, { fallback } = {}) {
  let intent = null;

  function enabled(el) {
    return el instanceof HTMLElement && !el.matches(':disabled') ? el : null;
  }

  function findTarget({ page, action, id }) {
    if (page) {
      const same = enabled(region.querySelector(`[data-page="${CSS.escape(page)}"]`));
      if (same) return same;
    }
    if (action) {
      const selector = `[data-action="${CSS.escape(action)}"]${id ? `[data-id="${CSS.escape(id)}"]` : ''}`;
      const same = enabled(region.querySelector(selector));
      if (same) return same;
    }
    return region.querySelector('.table-wrap') ?? enabled(region.querySelector('button:not(:disabled)'));
  }

  return {
    capture() {
      const active = document.activeElement;
      // Sem foco na região (ex.: o redesenho recursivo, quando o esqueleto já tirou o foco),
      // mantém a intenção registrada antes.
      if (!(active instanceof HTMLElement) || !region.contains(active)) return;
      intent = { page: active.dataset.page ?? null, action: active.dataset.action ?? null, id: active.dataset.id ?? null };
    },
    restore() {
      const current = intent;
      intent = null;
      if (!current) return;
      const active = document.activeElement;
      if (active && active !== document.body && !region.contains(active)) return;
      const target = findTarget(current) ?? fallback?.();
      target?.focus();
    },
  };
}
