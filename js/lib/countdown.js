// Lógica pura (sem DOM): a contagem regressiva do "Reenviar" da tela "Verifique seu e-mail".
// Conta por RELÓGIO (prazo absoluto), não por quantidade de ticks: aba em segundo plano ou timer atrasado não distorcem o valor.

export const RESEND_SECONDS = 45;

/** Segundos inteiros que faltam até `deadline` (ms desde a época), arredondando para cima; nunca negativo. */
export function secondsLeft(deadline, now) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** 45 -> "00:45"; 75 -> "01:15"; valores inválidos ou negativos viram "00:00". */
export function formatCountdown(seconds) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Cronômetro regressivo. `onTick(segundos)` roda a cada mudança de segundo (e uma vez ao iniciar); `onDone()` ao zerar.
 * `now`/`setTimer`/`clearTimer` são injetáveis para teste. Devolve { start(seconds), stop(), left() }.
 */
export function createCountdown({ onTick, onDone, now = () => Date.now(), setTimer = globalThis.setInterval, clearTimer = globalThis.clearInterval } = {}) {
  let timer = null;
  let deadline = 0;
  let last = -1;

  function stop() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function tick() {
    const left = secondsLeft(deadline, now());
    if (left !== last) {
      last = left;
      onTick?.(left);
    }
    if (left === 0) {
      stop();
      onDone?.();
    }
  }
  return {
    start(seconds) {
      stop();
      deadline = now() + seconds * 1000;
      last = -1;
      tick();
      if (secondsLeft(deadline, now()) > 0) timer = setTimer(tick, 250);
    },
    stop,
    left: () => secondsLeft(deadline, now()),
  };
}
