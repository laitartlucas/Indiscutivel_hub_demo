// Lógica pura (sem DOM) do aviso "sua senha foi redefinida": decide se aparece e lembra, por aparelho, que a aluna já viu.
import { dateTimeFormatter } from './format.js';

/** O aviso some sozinho depois de 30 dias. */
export const RESET_NOTICE_DAYS = 30;
export const RESET_NOTICE_KEY = 'ih:reset-notice';
const WINDOW_MS = RESET_NOTICE_DAYS * 24 * 60 * 60 * 1000;

/** `GET /api/v1/account/security-notice` -> `{ passwordResetAt: string | null }`. */
export function loadSecurityNotice(api) {
  return api.get('/api/v1/account/security-notice');
}

/**
 * Mostra o aviso quando a redefinição é dos últimos 30 dias e a aluna ainda não clicou em "Entendi" para ESSE valor.
 * Falha fechada: data ausente, malformada ou no futuro (relógio/dado estranho) = não mostra.
 * `dismissedValue` é o `passwordResetAt` guardado no aparelho: uma nova redefinição (valor diferente) volta a avisar.
 */
export function shouldShowResetNotice(passwordResetAt, dismissedValue, now = new Date()) {
  if (typeof passwordResetAt !== 'string' || passwordResetAt === '') return false;
  const at = Date.parse(passwordResetAt);
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  if (age < 0 || age > WINDOW_MS) return false;
  return dismissedValue !== passwordResetAt;
}

/** "06/10/2026 15:00" (horário de Brasília). Valor inválido vira ''. */
export function formatResetDate(passwordResetAt) {
  const at = new Date(passwordResetAt);
  return Number.isNaN(at.getTime()) ? '' : dateTimeFormatter.format(at).replace(',', '');
}

/** Lê o valor dispensado deste aparelho. Sem armazenamento (janela privada, dados bloqueados) = null. */
export function readDismissedResetNotice(storage = safeStorage()) {
  try {
    return storage ? storage.getItem(RESET_NOTICE_KEY) : null;
  } catch {
    return null;
  }
}

/** Lembra neste aparelho que a aluna viu o aviso desta redefinição. Sem armazenamento: só vale até recarregar. */
export function saveDismissedResetNotice(passwordResetAt, storage = safeStorage()) {
  try {
    storage?.setItem(RESET_NOTICE_KEY, passwordResetAt);
  } catch {
    // sem armazenamento: o aviso volta na próxima visita, o que é inofensivo
  }
}

// Só ler `localStorage` já pode lançar (acesso bloqueado): por isso o try/catch também aqui.
function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
