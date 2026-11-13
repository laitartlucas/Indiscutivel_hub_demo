// Permissões da equipe da mentora no navegador. O servidor é a barreira REAL (cada rota confere a permissão a cada requisição);
// aqui só se ESCONDE o que a pessoa não pode usar, para o menu e as telas não oferecerem botões que dariam 403.

/** As mesmas chaves de server/src/domain/permissions.ts (lista fixa). */
export const PERMISSION_KEYS = [
  'students.view',
  'students.manage',
  'notes.manage',
  'sessions.manage',
  'followup.view',
  'followup.manage',
  // "Indicadores de negócio das alunas": só números agregados da Central Comercial (nunca nomes ou contatos).
  'business.view',
  // "Faturamento das alunas": o faturamento AUTODECLARADO de cada aluna e os marcos (Entrega 6).
  'revenue.view',
  'reports.view',
  'challenges.manage',
  'achievements.manage',
  'settings.manage',
];

export const DENIED_MESSAGE = 'Você não tem permissão para abrir essa página.';

/** A proprietária (`admin`) pode tudo; a equipe (`staff`) só o que o papel dela concede. Aluna e qualquer outro valor: nada. */
export function can(user, key) {
  if (!user || typeof user !== 'object') return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'staff') return false;
  return Array.isArray(user.permissions) && user.permissions.includes(key);
}

/** Verdadeiro se pode ao menos uma das chaves (lista vazia = nada). */
export const canAny = (user, keys) => keys.some((key) => can(user, key));

/** Só a proprietária gere equipe e papéis. */
export const isOwner = (user) => user?.role === 'admin';

/** Aluna não vê nada de equipe; admin e staff usam a área de mentoria. */
export const isTeamSide = (user) => user?.role === 'admin' || user?.role === 'staff';
