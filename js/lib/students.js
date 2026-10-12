// Lógica pura (sem DOM) sobre o estado das alunas, usada pelas telas da mentora.

export const STATUS_LABELS = {
  active: 'Ativa',
  invite_pending: 'Convite pendente',
  invite_expired: 'Convite expirado',
  no_invite: 'Sem convite enviado',
  blocked: 'Bloqueada',
  inactive: 'Inativa',
};

const TONES = {
  active: 'good',
  invite_pending: 'warn',
  invite_expired: 'bad',
  no_invite: 'neutral',
  blocked: 'bad',
  inactive: 'neutral',
};

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** Tom do selo (badge) para o estado; estado desconhecido é neutro. */
export function statusTone(status) {
  return has(TONES, status) ? TONES[status] : 'neutral';
}

export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos os estados' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const ACTIONS = {
  active: ['block', 'deactivate'],
  invite_pending: ['block', 'deactivate'],
  invite_expired: ['block', 'deactivate'],
  no_invite: ['block', 'deactivate'],
  blocked: ['unblock', 'deactivate'],
  inactive: ['reactivate'],
};

/** Ações de ciclo de vida válidas para o estado da aluna (a lista é nova a cada chamada). */
export function availableActions(student) {
  const status = student?.status;
  return has(ACTIONS, status) ? [...ACTIONS[status]] : [];
}

const RESEND = new Set(['no_invite', 'invite_pending', 'invite_expired', 'active']);

/**
 * Aluna ativa (não bloqueada nem inativa) pode receber um link: antes de entrar é o convite de acesso; depois
 * de entrar é o link de redefinição de senha.
 */
export function canResend(student) {
  return RESEND.has(student?.status);
}

/** Rótulo do botão que gera o link: quem já ativou a conta recebe um link para redefinir a senha. */
export function resendLabel(student) {
  return student?.status === 'active' ? 'Gerar link de redefinição de senha' : 'Gerar novo link de acesso';
}

/** Aviso de sucesso depois de gerar o link (mesmo critério do rótulo). */
export function resendSuccessMessage(student) {
  return student?.status === 'active' ? 'Link de redefinição gerado.' : 'Novo link de acesso gerado.';
}

/** Rótulo do papel para a topbar: `admin` é a mentora, `user` é a aluna. */
export function roleLabel(role) {
  if (role === 'admin') return 'Mentora';
  if (role === 'staff') return 'Equipe';
  if (role === 'user') return 'Aluna';
  return '';
}
