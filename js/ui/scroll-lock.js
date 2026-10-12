let locks = 0;

/** Trava a rolagem do fundo enquanto houver algum diálogo modal aberto (contador, aceita diálogos empilhados). */
export function lockScroll() {
  locks += 1;
  document.body.classList.add('modal-open');
}

export function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks === 0) document.body.classList.remove('modal-open');
}
