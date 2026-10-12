import { homePath } from './account.js';
import { can } from './permissions.js';

/**
 * Tabela de rotas: padrão de caminho -> tela e quem pode vê-la.
 *
 * `access`:
 *  - 'anonymous': só quem NÃO entrou (login);
 *  - 'public': qualquer pessoa sem sessão; quem já entrou é levada a "/";
 *  - 'open': qualquer pessoa, com ou sem sessão (termos e política de privacidade);
 *  - 'pending': só quem precisa trocar a senha;
 *  - 'user' / 'admin' / 'staff': aluna / mentora proprietária / equipe da mentora (o papel vem da sessão);
 *  - 'team': a proprietária E a equipe (telas da própria conta: Painel, Perfil, Ajuda...);
 *  - 'mentoria': a proprietária sempre; a equipe só com a permissão `perm` (o menu e a rota usam a MESMA regra; o servidor confere de novo).
 * Um mesmo caminho pode ter uma entrada por papel (é o caso de "/": Painel da aluna ou da mentora).
 * Segmentos `:nome` capturam um valor e o entregam em `params`.
 */
const ROUTES = [
  { pattern: '/entrar', view: 'login', access: 'anonymous' },
  { pattern: '/entrar/mentora', view: 'loginMentora', access: 'anonymous' },
  { pattern: '/primeiro-acesso', view: 'firstAccess', access: 'public' },
  { pattern: '/recuperar', view: 'recover', access: 'public' },
  // Sem token (o endereço é limpo depois da consulta, ou o link veio incompleto): a tela explica e leva a pedir outro link.
  { pattern: '/redefinir', view: 'reset', access: 'public' },
  { pattern: '/redefinir/:token', view: 'reset', access: 'public' },
  { pattern: '/termos', view: 'terms', access: 'open' },
  { pattern: '/privacidade', view: 'privacy', access: 'open' },
  { pattern: '/trocar-senha', view: 'changePassword', access: 'pending' },
  { pattern: '/convite/:token', view: 'activate', access: 'public' },
  // Só logo depois de ativar a conta pelo convite (session.state.justActivated); em qualquer outro caso vai ao painel.
  { pattern: '/acesso-ativado', view: 'activated', access: 'user' },
  { pattern: '/', view: 'home', access: 'user' },
  { pattern: '/', view: 'mentoraHome', access: 'team' },
  { pattern: '/perfil', view: 'profile', access: 'user' },
  { pattern: '/perfil', view: 'profile', access: 'team' },
  { pattern: '/alterar-senha', view: 'accountPassword', access: 'user' },
  { pattern: '/alterar-senha', view: 'accountPassword', access: 'team' },
  { pattern: '/configuracoes', view: 'settingsMentora', access: 'mentoria', perm: 'settings.manage' },
  // Equipe e papéis: só a proprietária (a equipe nunca gere equipe).
  { pattern: '/equipe', view: 'team', access: 'admin' },
  { pattern: '/equipe/permissoes', view: 'permissions', access: 'admin' },
  { pattern: '/produtos', view: 'products', access: 'user' },
  { pattern: '/pessoas', view: 'people', access: 'user' },
  { pattern: '/oportunidades', view: 'deals', access: 'user' },
  { pattern: '/oportunidades/:id', view: 'dealDetail', access: 'user' },
  { pattern: '/empresas', view: 'companies', access: 'user' },
  { pattern: '/empresas/:id', view: 'companyDetail', access: 'user' },
  { pattern: '/configuracoes', view: 'settings', access: 'user' },
  { pattern: '/clientes', view: 'clients', access: 'user' },
  { pattern: '/leads', view: 'leads', access: 'user' },
  { pattern: '/leads/:id', view: 'leadDetail', access: 'user' },
  { pattern: '/tarefas', view: 'tasks', access: 'user' },
  { pattern: '/calendario', view: 'calendar', access: 'user' },
  { pattern: '/metas', view: 'goals', access: 'user' },
  { pattern: '/progresso', view: 'progress', access: 'user' },
  { pattern: '/ranking', view: 'ranking', access: 'user' },
  { pattern: '/relatorios', view: 'reports', access: 'user' },
  { pattern: '/conquistas', view: 'achievements', access: 'user' },
  { pattern: '/desafios', view: 'challenges', access: 'user' },
  { pattern: '/desafios/:id', view: 'challengeDetail', access: 'user' },
  { pattern: '/gestao/conquistas', view: 'mentoraAchievements', access: 'mentoria', perm: 'achievements.manage' },
  { pattern: '/gestao/desafios', view: 'mentoraChallenges', access: 'mentoria', perm: 'challenges.manage' },
  { pattern: '/acompanhamento', view: 'followup', access: 'mentoria', perm: 'followup.view' },
  { pattern: '/relatorios-mentoria', view: 'mentoraReports', access: 'mentoria', perm: 'reports.view' },
  { pattern: '/componentes', view: 'styleguide', access: 'user' },
  { pattern: '/ajuda', view: 'help', access: 'user' },
  { pattern: '/ajuda', view: 'help', access: 'team' },
  { pattern: '/notificacoes', view: 'notifications', access: 'user' },
  { pattern: '/notificacoes', view: 'notifications', access: 'team' },
  { pattern: '/alunas', view: 'students', access: 'mentoria', perm: 'students.view' },
  { pattern: '/alunas/:id', view: 'studentProfile', access: 'mentoria', perm: 'students.view' },
];

const ROLES = new Set(['user', 'admin', 'staff']);

/** A entrada da tabela vale para esta pessoa? (A proprietária entra em tudo o que é de mentoria; a equipe, só com a permissão.) */
function allows(route, user) {
  switch (route.access) {
    case 'user':
    case 'admin':
    case 'staff':
      return route.access === user.role;
    case 'team':
      return user.role === 'admin' || user.role === 'staff';
    case 'mentoria':
      return can(user, route.perm);
    default:
      return false;
  }
}

/** Entradas só da área de mentoria: a equipe que cair numa delas sem permissão volta ao Painel COM aviso. */
const isMentoriaArea = (route) => route.access === 'admin' || route.access === 'mentoria';

export function parsePath(hash) {
  let path = String(hash ?? '').replace(/^#/, '').split('#')[0].split('?')[0];
  if (!path.startsWith('/')) path = '/' + path;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

function segments(path) {
  return path === '/' ? [] : path.slice(1).split('/');
}

/** Compara segmento a segmento. Devolve `params` (valores decodificados) ou null se não casar / valor malformado. */
function matchPattern(pattern, path) {
  const want = segments(pattern);
  const have = segments(path);
  if (want.length !== have.length) return null;
  const params = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) {
      if (have[i] === '') return null;
      try {
        params[want[i].slice(1)] = decodeURIComponent(have[i]);
      } catch {
        return null; // %-sequência inválida: tratada como rota inexistente
      }
    } else if (want[i] !== have[i]) {
      return null;
    }
  }
  return params;
}

/** Todas as entradas da tabela que casam com o caminho (um caminho pode ter uma entrada por papel). */
function matchAll(path) {
  const found = [];
  for (const route of ROUTES) {
    const params = matchPattern(route.pattern, path);
    if (params) found.push({ ...route, params });
  }
  return found;
}

/** Primeira entrada da tabela que casa com o caminho, `{ pattern, view, access, params }`, ou null. */
export function matchRoute(path) {
  return matchAll(path)[0] ?? null;
}

const viewOf = (match) => ({ view: match.view, params: match.params });

export function resolveRoute(path, session) {
  if (session?.status === 'loading') return { view: 'loading' };

  const matches = matchAll(path);
  const open = matches.find((m) => m.access === 'open');
  if (open) return viewOf(open);
  const user = session?.status === 'authenticated' ? session.user : null;

  // Falha fechada: qualquer coisa que não seja um usuário autenticado é anônima.
  const anonymous = () => {
    const open = matches.find((m) => m.access === 'anonymous' || m.access === 'public');
    return open ? viewOf(open) : { redirect: '/entrar' };
  };
  if (!user || typeof user !== 'object') return anonymous();

  if (user.mustChangePassword === true) {
    const pending = matches.find((m) => m.access === 'pending');
    return pending ? viewOf(pending) : { redirect: '/trocar-senha' };
  }

  // Papel desconhecido ou ausente: sem papel, só vale o que é aberto a anônimos (nunca uma tela de aluna/mentora).
  if (!ROLES.has(user.role)) return anonymous();

  if (matches.length === 0) return { view: 'notFound' };
  // Acabou de ativar a conta: o link do convite (já gasto) leva à tela "Acesso ativado" em vez do painel.
  if (session.justActivated === true && user.role === 'user' && matches.some((m) => m.view === 'activate')) return { redirect: '/acesso-ativado' };
  if (matches.some((m) => m.view === 'activated') && session.justActivated !== true) return { redirect: '/' };
  const own = matches.find((m) => allows(m, user));
  if (own) return viewOf(own);
  // Equipe sem permissão para uma tela de mentoria (digitou o endereço, ou perdeu a permissão): Painel, com aviso.
  if (user.role === 'staff' && matches.some(isMentoriaArea)) return { redirect: '/', denied: true };
  return { redirect: user.role === 'staff' ? '/' : homePath() };
}
