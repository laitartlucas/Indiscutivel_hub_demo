// Equipe e Permissões da mentora, na demonstração.
// As mesmas regras do servidor (server/src/services/team.ts + plugins/access.ts) sobre o estado em memória: a equipe (role `staff`)
// atua COMO a mentora dona, só com as permissões do papel, avaliadas a cada requisição; nunca vê nome nem contato de cliente das alunas
// (com `business.view`, só os números comerciais e financeiros de /mentora/students/:id/commercial e /finance, guardados pela tabela MENTORIA_POLICY);
// só a proprietária gere equipe e papéis.
import { normalizePermissions, PERMISSION_GROUPS, PERMISSIONS, policyFor, SYSTEM_ROLES } from './team-data.js';

const SEG = '([^/]+)';
const STATUSES = ['active', 'invite_pending', 'invite_expired', 'no_invite', 'blocked'];
const ROLE_NAME_MAX = 40;

export function createTeamDemo(d) {
  const db = () => d.getDb();
  const { Errors, createIssues, requireBody, onlyKeys } = d;
  const owner = () => db().users.find((u) => u.role === 'admin');

  // ---------------------------------------------------------------- estado

  const rolesOf = () => (db().teamRoles ??= []);
  const membersOf = () => (db().teamMembers ??= []);

  /** Cria (ou atualiza) os papéis padrão: idempotente, como na primeira consulta do servidor. */
  function ensureDefaultRoles() {
    for (const key of Object.keys(SYSTEM_ROLES)) {
      const def = SYSTEM_ROLES[key];
      const found = rolesOf().find((r) => r.systemKey === key);
      if (found) found.permissions = [...def.permissions];
      else rolesOf().push({ id: d.newId(), name: def.name, permissions: [...def.permissions], isSystem: true, systemKey: key, createdAt: d.stamp() });
    }
  }

  const roleById = (id) => rolesOf().find((r) => r.id === id) ?? null;
  const memberOf = (userId) => membersOf().find((m) => m.userId === userId) ?? null;
  const countMembers = (roleId) => membersOf().filter((m) => m.roleId === roleId).length;

  /** Permissões EFETIVAS agora: lidas do papel atual a cada chamada (nunca copiadas para a sessão). */
  function permissionsOf(user) {
    if (user.role === 'admin') return [...PERMISSIONS];
    if (user.role !== 'staff') return [];
    const member = memberOf(user.id);
    const role = member ? roleById(member.roleId) : null;
    if (!role || !user.active || user.manuallyBlocked) return [];
    return normalizePermissions(role.permissions) ?? [];
  }

  const roleDto = (r) => ({ id: r.id, name: r.name, permissions: normalizePermissions(r.permissions) ?? [], isSystem: r.isSystem, members: countMembers(r.id), createdAt: r.createdAt });

  function memberDto(user) {
    const member = memberOf(user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: member.roleId,
      roleName: roleById(member.roleId)?.name ?? '',
      status: d.statusOf(user),
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
    };
  }

  const ownerRow = () => {
    const o = owner();
    return { id: o.id, name: o.name, email: o.email, roleId: 'owner', roleName: 'Proprietária', status: 'active', lastLoginAt: o.lastLoginAt ?? null, createdAt: o.createdAt };
  };

  function findMember(id) {
    const user = d.UUID.test(String(id)) ? db().users.find((u) => u.id === id && u.role === 'staff') : null;
    if (!user || !memberOf(user.id)) {
      if (String(id) === owner().id) throw Errors.forbidden('A conta da proprietária não pode ser alterada, bloqueada nem removida.');
      throw Errors.notFound('Pessoa da equipe não encontrada.');
    }
    return user;
  }

  // ---------------------------------------------------------------- guard central (espelho de plugins/access.ts)

  /**
   * Decide se `user` pode chamar a rota. Devolve `{ actAs }`: o id da mentora dona quando a equipe age COMO ela (as rotas de mentoria
   * do mock só conhecem a `admin`), ou null. Lança 401/403; rota de equipe só para a proprietária.
   */
  function authorize(method, path, user) {
    const policy = policyFor(method, path);
    if (policy.kind === 'public') return { actAs: null };
    if (!user) return { actAs: null }; // sem sessão: cada rota responde 401 sozinha, como antes
    if (policy.kind === 'self') {
      // A busca da equipe só acha alunas com `students.view`; sem a permissão, não acha nada.
      if (user.role === 'staff' && path === 'search') {
        return permissionsOf(user).includes('students.view') ? { actAs: owner().id } : { actAs: null, empty: 'search' };
      }
      // Nome e boas-vindas da mentoria: a equipe vê os da dona.
      if (user.role === 'staff' && path === 'account/mentoria') return { actAs: owner().id };
      return { actAs: null };
    }
    if (policy.kind === 'owner') {
      if (user.role !== 'admin') throw Errors.forbidden();
      return { actAs: null };
    }
    if (policy.kind === 'permission') {
      if (user.role === 'admin') return { actAs: null };
      if (user.role === 'staff' && permissionsOf(user).includes(policy.key)) return { actAs: owner().id };
      throw Errors.forbidden();
    }
    // student: o CRM é só da aluna. A proprietária e a equipe levam 403, como no servidor.
    if (user.role === 'staff' || user.role === 'admin') throw Errors.forbidden();
    return { actAs: null };
  }

  // ---------------------------------------------------------------- validação

  function readRoleName(value, issues) {
    if (typeof value !== 'string' || value.trim() === '') return void issues.add('name', 'Informe o nome do papel.');
    const s = value.trim();
    if ([...s].length > ROLE_NAME_MAX) return void issues.add('name', `O nome do papel é longo demais (máximo ${ROLE_NAME_MAX}).`);
    if (d.CONTROL_CHARS.test(s)) return void issues.add('name', 'O nome contém caracteres inválidos.');
    return s;
  }

  function readPermissions(value, issues) {
    if (!Array.isArray(value) || value.length > 50) return void issues.add('permissions', 'Informe as permissões.');
    const clean = normalizePermissions(value);
    if (!clean) return void issues.add('permissions', 'Há uma permissão que não existe.');
    return clean;
  }

  const nameTaken = (name, exceptId) => rolesOf().some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === name.toLowerCase());

  // ---------------------------------------------------------------- rotas

  function listTeam(searchParams) {
    ensureDefaultRoles();
    const q = d.readQuery(searchParams, { q: 'text', status: { enum: STATUSES, message: 'Estado inválido.' }, roleId: 'uuid' }, {});
    let rows = membersOf().map((m) => d.findUser(m.userId)).filter(Boolean).map(memberDto);
    if (q.status) rows = rows.filter((r) => r.status === q.status);
    if (q.roleId) rows = rows.filter((r) => r.roleId === q.roleId);
    if (q.q) {
      const needle = d.fold(q.q);
      rows = rows.filter((r) => d.fold(r.name).includes(needle) || r.email.includes(needle));
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || (a.id < b.id ? -1 : 1));
    return { status: 200, body: { owner: ownerRow(), data: rows, roles: rolesOf().map((r) => ({ id: r.id, name: r.name })) } };
  }

  function listRoles(searchParams) {
    ensureDefaultRoles();
    d.readQuery(searchParams, {}, {});
    const order = (r) => (r.systemKey === 'assistant' ? 0 : r.systemKey === 'readonly' ? 1 : 2);
    const roles = [...rolesOf()].sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || order(a) - order(b) || a.name.localeCompare(b.name, 'pt-BR'));
    return { status: 200, body: { roles: roles.map(roleDto), owner: { name: 'Proprietária', permissions: [...PERMISSIONS], members: 1 } } };
  }

  function createRole(body) {
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['name', 'permissions'], issues);
    const name = readRoleName(b.name, issues);
    const permissions = readPermissions(b.permissions, issues);
    issues.throwIfAny();
    ensureDefaultRoles();
    if (nameTaken(name, null)) throw Errors.conflict('role_name_taken', 'Já existe um papel com esse nome.');
    const role = { id: d.newId(), name, permissions, isSystem: false, systemKey: null, createdAt: d.stamp() };
    rolesOf().push(role);
    return { status: 201, body: roleDto(role) };
  }

  function findRole(id) {
    const role = d.UUID.test(String(id)) ? roleById(id) : null;
    if (!role) throw Errors.notFound('Papel não encontrado.');
    return role;
  }

  function patchRole(id, body) {
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['name', 'permissions'], issues);
    const name = b.name !== undefined ? readRoleName(b.name, issues) : undefined;
    const permissions = b.permissions !== undefined ? readPermissions(b.permissions, issues) : undefined;
    if (b.name === undefined && b.permissions === undefined && !issues.list.length) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    const role = findRole(id);
    if (role.isSystem) throw Errors.conflict('role_system', 'Os papéis padrão não podem ser editados. Crie um papel personalizado.');
    if (name !== undefined && nameTaken(name, role.id)) throw Errors.conflict('role_name_taken', 'Já existe um papel com esse nome.');
    if (name !== undefined) role.name = name;
    if (permissions !== undefined) role.permissions = permissions;
    return { status: 200, body: roleDto(role) };
  }

  function deleteRole(id) {
    const role = findRole(id);
    if (role.isSystem) throw Errors.conflict('role_system', 'Os papéis padrão não podem ser excluídos.');
    if (countMembers(role.id) > 0) throw Errors.conflict('role_in_use', 'Este papel está em uso. Mude o papel das pessoas antes de excluí-lo.');
    db().teamRoles = rolesOf().filter((r) => r.id !== role.id);
    return { status: 204 };
  }

  function inviteMember(body) {
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['name', 'email', 'roleId'], issues);
    const name = d.readName(b.name, 'Informe o nome.', issues);
    let email;
    if (typeof b.email !== 'string' || b.email.trim().length < 3) issues.add('email', 'Informe o e-mail.');
    else if (b.email.trim().length > 254) issues.add('email', 'E-mail muito longo.');
    else if (d.CONTROL_CHARS.test(b.email)) issues.add('email', 'O e-mail contém caracteres inválidos.');
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email.trim())) issues.add('email', 'Informe um e-mail válido.');
    else email = b.email.trim().toLowerCase();
    if (typeof b.roleId !== 'string' || b.roleId === '') issues.add('roleId', 'Escolha um papel.');
    issues.throwIfAny();
    ensureDefaultRoles();
    if (!roleById(b.roleId)) throw Errors.validation([{ field: 'roleId', message: 'Escolha um papel válido.' }]);
    if (db().users.some((u) => u.email.toLowerCase() === email)) throw Errors.conflict('email_taken', 'Já existe uma conta com esse e-mail.');
    const user = {
      id: d.newId(), role: 'staff', email, name, phone: null, photoUrl: null, className: null, program: null, joinedOn: null, endsOn: null, plan: null,
      active: true, manuallyBlocked: false, lastLoginAt: null, passwordResetAt: null, passwordChangedAt: null, avatarData: null, password: null, createdAt: d.stamp(),
    };
    db().users.push(user);
    membersOf().push({ userId: user.id, roleId: b.roleId });
    const invite = d.issueInvite(user, false);
    return { status: 201, body: { member: memberDto(user), invite: d.inviteResult(invite) } };
  }

  function changeRole(id, body) {
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['roleId'], issues);
    if (typeof b.roleId !== 'string' || b.roleId === '') issues.add('roleId', 'Escolha um papel.');
    issues.throwIfAny();
    const user = findMember(id);
    if (!roleById(b.roleId)) throw Errors.validation([{ field: 'roleId', message: 'Escolha um papel válido.' }]);
    memberOf(user.id).roleId = b.roleId;
    return { status: 200, body: memberDto(user) };
  }

  function setStatus(id, body) {
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['action'], issues);
    if (!['block', 'unblock'].includes(b.action)) issues.add('action', 'Ação inválida.');
    issues.throwIfAny();
    const user = findMember(id);
    const block = b.action === 'block';
    if (user.manuallyBlocked === block) throw Errors.conflict('invalid_transition', 'Esta ação não vale para o estado atual da pessoa.');
    user.manuallyBlocked = block;
    if (block) {
      d.cancelPending(user.id);
      if (d.sessionUserId() === user.id) d.saveSession(null);
    }
    return { status: 200, body: memberDto(user) };
  }

  function resend(id, body) {
    const b = requireBody(body ?? {});
    if (Object.keys(b).length) throw Errors.validation([{ field: '', message: `Campo não permitido: ${Object.keys(b)[0]}.` }]);
    const user = findMember(id);
    if (user.manuallyBlocked) throw Errors.conflict('invite_not_allowed', 'Só é possível gerar um link para uma pessoa não bloqueada.');
    const activated = Boolean(user.lastLoginAt) || d.invitesOf(user.id).some((i) => i.status === 'accepted');
    d.cancelPending(user.id);
    const invite = d.issueInvite(user, activated);
    return { status: 200, body: { member: memberDto(user), invite: d.inviteResult(invite) } };
  }

  function cancelInvite(id, body) {
    const b = requireBody(body ?? {});
    if (Object.keys(b).length) throw Errors.validation([{ field: '', message: `Campo não permitido: ${Object.keys(b)[0]}.` }]);
    const user = findMember(id);
    if (d.cancelPending(user.id) === 0) throw Errors.conflict('invite_not_allowed', 'Não há convite pendente para cancelar.');
    return { status: 200, body: memberDto(user) };
  }

  function removeMember(id) {
    const user = findMember(id);
    d.cancelPending(user.id);
    db().invites = db().invites.filter((i) => i.userId !== user.id);
    db().teamMembers = membersOf().filter((m) => m.userId !== user.id);
    db().users = db().users.filter((u) => u.id !== user.id);
    if (d.sessionUserId() === user.id) d.saveSession(null);
    return { status: 204 };
  }

  const routes = [
    ['GET', /^account\/permissions$/, (_m, q) => {
      const u = d.requireAuth();
      d.readQuery(q, {}, {});
      const member = u.role === 'staff' ? memberOf(u.id) : null;
      return {
        status: 200,
        body: { role: u.role, isOwner: u.role === 'admin', teamRole: member ? (roleById(member.roleId)?.name ?? null) : null, permissions: permissionsOf(u) },
      };
    }],
    ['GET', /^team$/, (_m, q) => listTeam(q)],
    ['GET', /^team\/permissions$/, (_m, q) => {
      d.readQuery(q, {}, {});
      return { status: 200, body: { groups: PERMISSION_GROUPS } };
    }],
    ['GET', /^team\/roles$/, (_m, q) => listRoles(q)],
    ['POST', /^team\/roles$/, (_m, _q, body) => createRole(body)],
    ['PATCH', new RegExp(`^team/roles/${SEG}$`), (m, _q, body) => patchRole(m[1], body)],
    ['DELETE', new RegExp(`^team/roles/${SEG}$`), (m) => deleteRole(m[1])],
    ['POST', /^team\/members$/, (_m, _q, body) => inviteMember(body)],
    ['GET', new RegExp(`^team/members/${SEG}$`), (m) => ({ status: 200, body: memberDto(findMember(m[1])) })],
    ['PATCH', new RegExp(`^team/members/${SEG}$`), (m, _q, body) => changeRole(m[1], body)],
    ['POST', new RegExp(`^team/members/${SEG}/status$`), (m, _q, body) => setStatus(m[1], body)],
    ['POST', new RegExp(`^team/members/${SEG}/invites$`), (m, _q, body) => resend(m[1], body)],
    ['POST', new RegExp(`^team/members/${SEG}/invites/cancel$`), (m, _q, body) => cancelInvite(m[1], body)],
    ['DELETE', new RegExp(`^team/members/${SEG}$`), (m) => removeMember(m[1])],
  ];

  return { routes, authorize, permissionsOf };
}
