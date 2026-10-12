// Lógica pura (sem DOM): o medidor de força de 4 segmentos das telas de senha (kit "Redefinir senha").
// É um GUIA visual. Quem decide se a senha vale é o servidor (tamanho, comum, e-mail); aqui só se confere o que dá no navegador.

export const STRENGTH_LABELS = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];
const MIN_LENGTH = 10;
const GOOD_LENGTH = 14;
const EMAIL_PART_MIN = 4;

function hasEmailName(password, email) {
  const local = String(email ?? '').split('@')[0].toLowerCase();
  return local.length >= EMAIL_PART_MIN && password.toLowerCase().includes(local);
}

/**
 * { score: 0..4, label }. Cada segmento é um critério: 10+ caracteres, maiúscula e minúscula, número, e símbolo ou 14+ caracteres.
 * Senha curta demais ou com o e-mail dentro nunca passa de "Fraca" (1 segmento), mesmo com variedade de caracteres.
 */
export function passwordStrength(password, email = '') {
  const value = String(password ?? '');
  if (value === '') return { score: 0, label: '' };
  const length = [...value].length;
  const points = [
    length >= MIN_LENGTH,
    /\p{Ll}/u.test(value) && /\p{Lu}/u.test(value),
    /\p{N}/u.test(value),
    /[^\p{L}\p{N}\s]/u.test(value) || length >= GOOD_LENGTH,
  ].filter(Boolean).length;
  const blocked = length < MIN_LENGTH || hasEmailName(value, email);
  const score = blocked ? Math.min(1, Math.max(points, 1)) : points;
  return { score, label: STRENGTH_LABELS[score] };
}
