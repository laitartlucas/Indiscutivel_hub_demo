// Lógica pura (sem DOM): os requisitos da troca de senha que o navegador consegue conferir sozinho.
// Espelham server/src/security/password.ts (tamanho, e-mail na senha); "comum" e "repetida" só o servidor sabe.

const MIN_LENGTH = 10;
const EMAIL_PART_MIN = 4;

function containsEmailName(password, email) {
  const local = String(email ?? '').split('@')[0].toLowerCase();
  return local.length >= EMAIL_PART_MIN && password.toLowerCase().includes(local);
}

/** Requisitos da ativação por convite: não há senha atual para comparar. */
export const ACTIVATION_RULE_IDS = ['length', 'email', 'confirm'];

/**
 * Lista de requisitos (4 por padrão), na ordem em que aparecem na tela. `met` é false enquanto a senha nova está vazia.
 * `include` (opcional) limita a lista aos ids dados, mantendo a ordem.
 */
export function passwordRules({ currentPassword = '', newPassword = '', confirm = '', email = '' }, { include } = {}) {
  const typed = newPassword !== '';
  const rules = [
    { id: 'length', label: '10 ou mais caracteres', met: [...newPassword].length >= MIN_LENGTH },
    { id: 'different', label: 'Diferente da senha atual', met: typed && newPassword !== currentPassword },
    { id: 'email', label: 'Sem o seu e-mail', met: typed && !containsEmailName(newPassword, email) },
    { id: 'confirm', label: 'Confirmação igual', met: typed && newPassword === confirm },
  ];
  return include ? rules.filter((rule) => include.includes(rule.id)) : rules;
}

/** Os 3 requisitos da tela de ativação (tamanho, sem o e-mail, confirmação igual). */
export function activationRules({ newPassword = '', confirm = '', email = '' }) {
  return passwordRules({ newPassword, confirm, email }, { include: ACTIVATION_RULE_IDS });
}

export function metCount(rules) {
  return rules.filter((rule) => rule.met).length;
}
