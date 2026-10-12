// Lógica pura (sem DOM): como a tela de ativação explica um convite que não pôde ser aberto.
import { ApiError, describeError } from './api.js';

const ASK_NEW_LINK = 'Peça um novo link à sua mentora.';

/**
 * Traduz o erro do `lookup` em { message, hint, signIn, retry }:
 *  - `message`: o texto do servidor (já em português, sem detalhe interno) ou a descrição genérica;
 *  - `hint`: orientação extra (nunca repete o que a mensagem já diz sobre pedir um novo link);
 *  - `signIn`: mostrar o link "Entrar" (convite já usado);
 *  - `retry`: mostrar "Tentar de novo" (falha de rede, limite de tentativas ou erro do servidor).
 */
export function describeInviteError(error) {
  const none = { hint: null, signIn: false, retry: false };
  if (!(error instanceof ApiError)) return { ...none, message: describeError(error), retry: true };
  if (error.code === 'invite_used') return { ...none, message: describeError(error), signIn: true };
  if (error.code === 'invite_expired' || error.code === 'invite_cancelled') {
    const message = describeError(error);
    return { ...none, message, hint: /mentora/i.test(message) ? null : ASK_NEW_LINK };
  }
  // Link que não existe (404) ou malformado (400: o token curto demais nem chega à busca).
  if (error.status === 404 || error.status === 400) return { ...none, message: 'Link inválido.', hint: ASK_NEW_LINK };
  const transient = error.status === 0 || error.status === 429 || error.status >= 500;
  return { ...none, message: describeError(error), retry: transient };
}

/** Primeiro nome para a saudação ("Maria Souza" -> "Maria"); vazio se o nome vier em branco. */
export function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] ?? '';
}
