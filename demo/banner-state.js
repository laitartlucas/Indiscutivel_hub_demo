// Regra da faixa da demonstração, separada de boot.js (que tem efeitos ao carregar) para poder ser testada.

/** Telas pequenas (largura < 1100 px ou altura < 700 px) começam com a faixa recolhida; uma escolha da pessoa nesta aba vale mais. */
export function shouldStartCollapsed({ width, height, stored }) {
  if (stored === '1') return true;
  if (stored === '0') return false;
  return width < 1100 || height < 700;
}
