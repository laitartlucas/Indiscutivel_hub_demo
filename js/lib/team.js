// Lógica pura (sem DOM) das telas Equipe e Permissões da mentora.

import { PERMISSION_KEYS } from './permissions.js';

export const MEMBER_STATUS_LABELS = {
  active: 'Ativa',
  invite_pending: 'Convite pendente',
  invite_expired: 'Convite expirado',
  no_invite: 'Sem convite enviado',
  blocked: 'Bloqueada',
};

export const MEMBER_STATUS_FILTERS = [{ value: '', label: 'Todos os estados' }, ...Object.entries(MEMBER_STATUS_LABELS).map(([value, label]) => ({ value, label }))];

/** Cor do ponto do estado (nunca só cor: o texto do estado sempre aparece ao lado). */
const DOT = { active: 'good', invite_pending: 'warn', invite_expired: 'bad', no_invite: 'neutral', blocked: 'bad' };
export const memberStatusTone = (status) => (Object.hasOwn(DOT, status) ? DOT[status] : 'neutral');

export const ROLE_NAME_MAX = 40;
export const OWNER_ROLE_NAME = 'Proprietária';

/** Mesmas regras do servidor (routes/team.ts): 1 a 40 caracteres, sem controle. */
export function roleNameError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Informe o nome do papel.';
  if ([...text].length > ROLE_NAME_MAX) return `O nome do papel é longo demais (máximo ${ROLE_NAME_MAX}).`;
  if (/[\u0000-\u001f\u007f]/.test(text)) return 'O nome contém caracteres inválidos.';
  return null;
}

export function memberRoleError(value) {
  return String(value ?? '').trim() ? null : 'Escolha um papel.';
}

/**
 * Ações do menu "Mais ações" de uma pessoa da equipe, conforme o estado. O servidor continua sendo a autoridade.
 * 'resend' = gerar link de acesso (quem ainda não ativou) ou de redefinição de senha (quem já ativou).
 */
export function memberActions(member) {
  if (!member || member.isOwner) return [];
  const status = member.status;
  const actions = ['change-role'];
  if (status !== 'blocked') actions.push('resend');
  if (status === 'invite_pending') actions.push('cancel-invite');
  actions.push(status === 'blocked' ? 'unblock' : 'block');
  actions.push('remove');
  return actions;
}

export const resendLabelFor = (member) => (member?.status === 'active' ? 'Gerar link de redefinição de senha' : member?.status === 'no_invite' ? 'Gerar link de acesso' : 'Gerar novo link de acesso');

/** Corpo do convite: o servidor aceita só estes campos (`.strict()`). */
export function invitePayload(values) {
  return { name: String(values.name ?? '').trim(), email: String(values.email ?? '').trim(), roleId: String(values.roleId ?? '') };
}

// ---------------------------------------------------------------- matriz de permissões

/** Estado de edição da matriz: papel -> conjunto de permissões, a partir da lista do servidor. */
export function draftFromRoles(roles) {
  return new Map(roles.map((role) => [role.id, new Set(role.permissions)]));
}

/** Liga/desliga uma permissão de um papel PERSONALIZADO. Devolve um novo mapa (papéis de sistema e chaves desconhecidas não mudam). */
export function togglePermission(draft, roles, roleId, key) {
  const role = roles.find((r) => r.id === roleId);
  if (!role || role.isSystem || !PERMISSION_KEYS.includes(key)) return draft;
  const next = new Map(draft);
  const set = new Set(next.get(roleId) ?? []);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  next.set(roleId, set);
  return next;
}

/** Em ordem canônica da lista fixa. */
export const orderedPermissions = (set) => PERMISSION_KEYS.filter((key) => set.has(key));

/** Papéis personalizados cujas permissões mudaram: [{ id, permissions }] prontos para o PATCH. */
export function changedRoles(draft, roles) {
  const out = [];
  for (const role of roles) {
    if (role.isSystem) continue;
    const now = orderedPermissions(draft.get(role.id) ?? new Set());
    const before = orderedPermissions(new Set(role.permissions));
    if (now.length !== before.length || now.some((key, i) => key !== before[i])) out.push({ id: role.id, permissions: now });
  }
  return out;
}

export const peopleText = (n) => (n === 1 ? '1 pessoa' : `${n} pessoas`);

/** Rótulo acessível de uma célula da matriz. */
export const cellLabel = (permissionLabel, roleName) => `${permissionLabel}: ${roleName}`;
