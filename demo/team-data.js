// Espelho de server/src/domain/permissions.ts e da política de acesso das rotas (server/test/helpers/access-table.ts) para a demonstração.
// Um teste de paridade (server/test/unit/team-data.test.ts) confere que continuam iguais.

export const PERMISSIONS = [
  'students.view',
  'students.manage',
  'notes.manage',
  'sessions.manage',
  'followup.view',
  'followup.manage',
  'business.view',
  'revenue.view',
  'reports.view',
  'challenges.manage',
  'achievements.manage',
  'settings.manage',
];

export const PERMISSION_GROUPS = [
  {
    id: 'students',
    label: 'ALUNAS',
    permissions: [
      { key: 'students.view', label: 'Ver alunas', description: 'Painel, lista, perfil e progresso' },
      { key: 'students.manage', label: 'Cadastrar e gerenciar alunas', description: 'Criar, editar, bloquear, convidar e redefinir senha' },
      { key: 'notes.manage', label: 'Notas privadas', description: 'Ler e escrever as notas da mentoria' },
      { key: 'sessions.manage', label: 'Sessões de mentoria', description: 'Marcar, editar e cancelar sessões' },
      { key: 'followup.view', label: 'Ver acompanhamento', description: 'Engajamento semanal e alunas em risco' },
      { key: 'followup.manage', label: 'Gerenciar acompanhamento', description: 'Check-ins e plano de ação' },
      { key: 'business.view', label: 'Indicadores de negócio das alunas', description: 'Contatos novos, oportunidades e vendas em R$, sem nomes de clientes' },
      { key: 'revenue.view', label: 'Faturamento das alunas', description: 'Faturamento autodeclarado, marcos e PAD GOLD de cada aluna' },
    ],
  },
  {
    id: 'growth',
    label: 'CRESCIMENTO E ANÁLISES',
    permissions: [
      { key: 'challenges.manage', label: 'Gerenciar desafios', description: 'Criar, editar e publicar desafios' },
      { key: 'achievements.manage', label: 'Gerenciar conquistas', description: 'Criar, editar e arquivar conquistas' },
      { key: 'reports.view', label: 'Ver relatórios da mentoria', description: 'Resultados consolidados, sem valores em R$' },
    ],
  },
  {
    id: 'admin',
    label: 'ADMINISTRAÇÃO',
    permissions: [{ key: 'settings.manage', label: 'Alterar configurações', description: 'Nome, boas-vindas e padrões da mentoria' }],
  },
];

export const SYSTEM_ROLES = {
  assistant: { name: 'Mentora assistente', permissions: PERMISSIONS.filter((p) => p !== 'settings.manage') },
  readonly: { name: 'Leitura', permissions: ['students.view', 'followup.view', 'reports.view'] },
};

/** Ordem canônica e sem repetição; null se alguma chave não existe. */
export function normalizePermissions(list) {
  const set = new Set();
  for (const item of list) {
    if (typeof item !== 'string' || !PERMISSIONS.includes(item)) return null;
    set.add(item);
  }
  return PERMISSIONS.filter((p) => set.has(p));
}

const SEG = '[^/]+';
const re = (pattern) => new RegExp(`^${pattern}$`);

/**
 * Política das rotas de mentoria (sem o prefixo /api/v1/): [método, caminho, 'permission:<chave>' | 'owner'].
 * Rota de mentoria que não está aqui não existe na demonstração para a equipe (403).
 */
export const MENTORIA_POLICY = [
  ['GET', re('mentora/summary'), 'students.view'],
  ['GET', re('mentora/settings'), 'settings.manage'],
  ['PATCH', re('mentora/settings'), 'settings.manage'],
  ['GET', re('mentora/overview'), 'students.view'],
  ['GET', re('mentora/students'), 'students.view'],
  ['GET', re(`mentora/students/${SEG}/growth`), 'students.view'],
  ['GET', re(`mentora/students/${SEG}/commercial`), 'business.view'],
  ['GET', re(`mentora/students/${SEG}/finance`), 'business.view'],
  ['GET', re(`mentora/students/${SEG}/marketing`), 'business.view'],
  ['GET', re(`mentora/students/${SEG}/journey`), 'students.view'],
  ['GET', re('mentora/revenue'), 'revenue.view'],
  ['GET', re(`mentora/students/${SEG}/revenue`), 'revenue.view'],
  ['POST', re(`mentora/students/${SEG}/phase`), 'students.manage'],
  ['GET', re('mentora/checkins'), 'students.view'],
  ['POST', re(`mentora/checkins/${SEG}/feedback`), 'challenges.manage'],
  ['GET', re(`mentora/checkin-files/${SEG}`), 'students.view'],
  ['GET', re(`mentora/challenges/${SEG}/participants`), 'students.view'],
  ['GET', re(`mentora/students/${SEG}/notes`), 'notes.manage'],
  ['POST', re(`mentora/students/${SEG}/notes`), 'notes.manage'],
  ['PATCH', re(`mentora/students/${SEG}/notes/${SEG}`), 'notes.manage'],
  ['DELETE', re(`mentora/students/${SEG}/notes/${SEG}`), 'notes.manage'],
  ['GET', re(`mentora/students/${SEG}/sessions`), 'sessions.manage'],
  ['POST', re(`mentora/students/${SEG}/sessions`), 'sessions.manage'],
  ['PATCH', re(`mentora/students/${SEG}/sessions/${SEG}`), 'sessions.manage'],
  ['DELETE', re(`mentora/students/${SEG}/sessions/${SEG}`), 'sessions.manage'],
  ['GET', re('mentora/sessions'), 'sessions.manage'],
  ['GET', re('mentora/followup'), 'followup.view'],
  ['GET', re(`mentora/students/${SEG}/followup-plan`), 'followup.view'],
  ['PUT', re(`mentora/students/${SEG}/followup-plan`), 'followup.manage'],
  ['POST', re(`mentora/students/${SEG}/checkins`), 'followup.manage'],
  ['DELETE', re(`mentora/students/${SEG}/checkins/${SEG}`), 'followup.manage'],
  ['GET', re('mentora/reports'), 'reports.view'],
  // Entrega 7: negócio das alunas somado (business.view) e relatórios da jornada (reports.view).
  ['GET', re('mentora/business'), 'business.view'],
  ['GET', re('mentora/reports/journey'), 'reports.view'],
  ['GET', re('mentora/achievements'), 'achievements.manage'],
  ['GET', re(`mentora/achievements/${SEG}`), 'achievements.manage'],
  ['POST', re('mentora/achievements'), 'achievements.manage'],
  ['PATCH', re(`mentora/achievements/${SEG}`), 'achievements.manage'],
  ['DELETE', re(`mentora/achievements/${SEG}`), 'achievements.manage'],
  ['GET', re('mentora/challenges'), 'challenges.manage'],
  ['GET', re(`mentora/challenges/${SEG}`), 'challenges.manage'],
  ['POST', re('mentora/challenges'), 'challenges.manage'],
  ['PATCH', re(`mentora/challenges/${SEG}`), 'challenges.manage'],
  ['POST', re(`mentora/challenges/${SEG}/publish`), 'challenges.manage'],
  ['POST', re(`mentora/challenges/${SEG}/archive`), 'challenges.manage'],
  ['DELETE', re(`mentora/challenges/${SEG}`), 'challenges.manage'],
  ['GET', re('students'), 'students.view'],
  ['POST', re('students'), 'students.manage'],
  ['GET', re(`students/${SEG}`), 'students.view'],
  ['PATCH', re(`students/${SEG}`), 'students.manage'],
  ['GET', re(`students/${SEG}/avatar`), 'students.view'],
  ['POST', re(`students/${SEG}/status`), 'students.manage'],
  ['POST', re(`students/${SEG}/invites`), 'students.manage'],
  ['POST', re(`students/${SEG}/invites/cancel`), 'students.manage'],
];

/** Rotas da própria conta, abertas a qualquer pessoa logada (inclusive a equipe). */
export const SELF_PATHS = [/^auth\//, /^account\//, /^notifications(\/|$)/, /^search$/];
export const PUBLIC_PATHS = [/^invites\//, /^auth\/login$/, /^auth\/two-factor$/, /^auth\/password-reset\//];

/**
 * Decisão para uma requisição: { kind: 'public'|'self'|'owner'|'permission'|'student', key? }.
 * Tudo que não é público, da conta, de equipe nem de mentoria é do CRM da aluna.
 */
export function policyFor(method, path) {
  if (PUBLIC_PATHS.some((p) => p.test(path))) return { kind: 'public' };
  if (/^team(\/|$)/.test(path)) return { kind: 'owner' };
  // Redefinir a verificação em duas etapas de uma aluna: só a mentora proprietária (a equipe nunca).
  if (method === 'POST' && re(`students/${SEG}/two-factor/reset`).test(path)) return { kind: 'owner' };
  const found = MENTORIA_POLICY.find(([m, pattern]) => m === method && pattern.test(path));
  if (found) return { kind: 'permission', key: found[2] };
  if (SELF_PATHS.some((p) => p.test(path))) return { kind: 'self' };
  return { kind: 'student' };
}
