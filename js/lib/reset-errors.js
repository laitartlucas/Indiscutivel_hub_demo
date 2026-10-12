// Lógica pura (sem DOM): como a tela de redefinição explica um link que não serve (consulta ou confirmação).
import { ApiError, describeError } from './api.js';

const ASK_NEW_LINK = 'Peça um novo link em "Esqueci minha senha".';

/**
 * Traduz o erro em { message, hint, retry }:
 *  - `message`: o texto do servidor (já em português, sem detalhe interno) ou a descrição genérica;
 *  - `hint`: orientação extra (nunca repete o que a mensagem já diz sobre pedir um novo link);
 *  - `retry`: falha passageira (rede, limite de tentativas ou erro do servidor): vale "Tentar de novo" em vez de pedir outro link.
 */
export function describeResetError(error) {
  const none = { hint: null, retry: false };
  if (!(error instanceof ApiError)) return { ...none, message: describeError(error), retry: true };
  if (error.code === 'reset_used' || error.code === 'reset_expired' || error.code === 'reset_cancelled' || error.status === 409 || error.status === 410) {
    const message = error.detail || 'Este link não vale mais.';
    return { ...none, message, hint: /novo/i.test(message) ? null : ASK_NEW_LINK };
  }
  if (error.status === 404 || error.status === 400) return { ...none, message: 'Link inválido.', hint: ASK_NEW_LINK };
  const transient = error.status === 0 || error.status === 429 || error.status >= 500;
  return { ...none, message: describeError(error), retry: transient };
}

/** True quando o link não tem mais conserto (a pessoa precisa pedir outro). */
export function isDeadLink(error) {
  return error instanceof ApiError && [400, 404, 409, 410].includes(error.status);
}
