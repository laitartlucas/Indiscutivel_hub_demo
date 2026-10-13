// Regras puras da verificação em duas etapas (sem DOM), testadas em web/test/two-factor-lib.test.js.

/** "JBSWY3DPEHPK3PXP" -> "JBSW Y3DP EHPK 3PXP" (a chave é digitada à mão em alguns aplicativos). */
export function groupKey(secret) {
  return String(secret).replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

/** O que a pessoa digitou no campo único "código do aplicativo ou de recuperação" -> { code } | { recoveryCode } | null. */
export function classifySecondFactor(input) {
  const clean = String(input ?? '').replace(/[\s-]+/g, '');
  if (/^\d{6}$/.test(clean)) return { code: clean };
  if (/^[A-Za-z0-9]{10}$/.test(clean)) return { recoveryCode: clean.toUpperCase() };
  return null;
}

/** Só os 6 dígitos (tira espaço e hífen do "123 456" do aplicativo). Devolve '' se não for um código completo. */
export function normalizeCode(input) {
  const clean = String(input ?? '').replace(/[\s-]+/g, '');
  return /^\d{6}$/.test(clean) ? clean : '';
}

/** Código de recuperação como o servidor espera: sem espaço nem hífen, em maiúsculas ("abcde-fghjk" -> "ABCDEFGHJK"). */
export function normalizeRecovery(input) {
  return String(input ?? '').replace(/[\s-]+/g, '').toUpperCase();
}

export function codeError(input) {
  return normalizeCode(input) ? null : 'Digite os 6 números mostrados no aplicativo.';
}

export function recoveryCodeError(input) {
  return /^[A-Za-z0-9]{10}$/.test(String(input ?? '').replace(/[\s-]+/g, '')) ? null : 'Digite o código de recuperação completo (10 letras e números).';
}

export function recoveryCountLabel(left) {
  if (left <= 0) return 'Você não tem mais códigos de recuperação. Gere novos.';
  return left === 1 ? '1 código de recuperação restante' : `${left} códigos de recuperação restantes`;
}

export const RECOVERY_FILE_NAME = 'codigos-de-recuperacao-indiscutivel-hub.txt';

/** O .txt baixado: um código por linha, com aviso de uso único. Gerado no navegador (nada vai a nenhum servidor de terceiros). */
export function recoveryFileText(codes, { email, date = new Date() } = {}) {
  const day = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  return [
    'Indiscutível Hub - códigos de recuperação da verificação em duas etapas',
    email ? `Conta: ${email}` : null,
    `Gerados em: ${day}`,
    '',
    'Cada código vale UMA vez e substitui o código do aplicativo se você perder o celular.',
    'Guarde este arquivo em um lugar seguro (gerenciador de senhas) e não o compartilhe.',
    '',
    ...codes,
    '',
  ].filter((line) => line !== null).join('\n');
}
