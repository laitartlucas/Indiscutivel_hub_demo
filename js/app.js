import { APP_NAME } from './config.js';
import { createApi, describeError } from './lib/api.js';
import { focusHeading, mount } from './lib/dom.js';
import { html } from './lib/html.js';
import { parsePath, redirectTarget, resolveRoute } from './lib/router-core.js';
import { createSession } from './lib/session.js';
import { loadAccount, resetAccount } from './lib/account.js';
import { loadFunnels, resetFunnels } from './lib/pipeline-config.js';
import { loadSources, resetSources } from './lib/sources.js';
import { configureTasksBadge, resetTasksBadge } from './lib/tasks-badge.js';
import { configureNotifications, resetNotifications } from './lib/notifications.js';
import { button } from './ui/components.js';
import { installMenus } from './ui/menu.js';
import { configureTopbar } from './ui/topbar.js';
import { announceXp } from './lib/xp.js';
import { renderActivate } from './views/activate.js';
import { renderActivated } from './views/activated.js';
import { renderAccountPassword } from './views/account-password.js';
import { renderChangePassword } from './views/change-password.js';
import { renderCalendar } from './views/calendar.js';
import { renderCommercialActivities } from './views/commercial-activities.js';
import { renderCommercialOverview } from './views/commercial-overview.js';
import { renderContactDetail } from './views/contact-detail.js';
import { renderContacts } from './views/contacts.js';
import { renderOpportunityDetail } from './views/opportunity-detail.js';
import { renderPipeline } from './views/pipeline.js';
import { renderFirstAccess } from './views/first-access.js';
import { renderHome } from './views/home.js';
import { renderGoals } from './views/goals.js';
import { renderAchievements } from './views/achievements.js';
import { renderChallenges } from './views/challenges.js';
import { renderChallengeDetail } from './views/challenge-detail.js';
import { renderMentoraAchievements } from './views/mentora-achievements.js';
import { renderFollowup } from './views/followup.js';
import { renderMentoraChallenges } from './views/mentora-challenges.js';
import { renderMentoraReports } from './views/mentora-reports.js';
import { renderHelp } from './views/help.js';
import { renderLoading } from './views/loading.js';
import { renderNotifications } from './views/notifications.js';
import { renderPrivacy, renderTerms } from './views/legal.js';
import { renderLogin } from './views/login.js';
import { renderMentoraHome } from './views/mentora-home.js';
import { renderNotFound } from './views/not-found.js';
import { renderProgress } from './views/progress.js';
import { renderRanking } from './views/ranking.js';
import { renderReports } from './views/reports.js';
import { renderProfile } from './views/profile.js';
import { renderRecover } from './views/recover.js';
import { renderReset } from './views/reset.js';
import { renderProducts } from './views/products.js';
import { renderCampaignDetail } from './views/campaign-detail.js';
import { renderCampaigns } from './views/campaigns.js';
import { renderInstagram } from './views/instagram.js';
import { renderMarketingOverview } from './views/marketing-overview.js';
import { renderMarketingSpend } from './views/marketing-spend.js';
import { renderReceivables } from './views/receivables.js';
import { renderSaleDetail } from './views/sale-detail.js';
import { renderSales } from './views/sales.js';
import { renderSettings } from './views/settings.js';
import { renderSettingsMentora } from './views/settings-mentora.js';
import { renderStudentProfile } from './views/student-profile.js';
import { renderStudents } from './views/students.js';
import { renderStyleguide } from './views/styleguide.js';
import { renderTeam } from './views/team.js';
import { renderPermissions } from './views/permissions.js';
import { DENIED_MESSAGE } from './lib/permissions.js';
import { toast } from './ui/toast.js';
import { renderTasks } from './views/tasks.js';

installMenus();

const root = document.getElementById('app');
// `onXp`: toda resposta com o campo aditivo `xpAwarded` (tarefa concluída, oportunidade ganha, lead convertido, meta atingida, ação de desafio) vira o aviso "+N XP"; o campo `growth` vira "Conquista desbloqueada" / "Desafio concluído".
const api = createApi({ onUnauthorized: () => session.expire(), onXp: announceXp });
// Antes da primeira tela autenticada: foto, preferências (fuso, página inicial) e, para a aluna, funis e origens.
const session = createSession(api, {
  beforeReady: (user) => {
    if (user.mustChangePassword) return undefined;
    const jobs = [loadAccount(api)];
    if (user.role === 'user') jobs.push(loadFunnels(api), loadSources(api));
    return Promise.all(jobs);
  },
});
configureTasksBadge(api);
configureNotifications(api);
configureTopbar(api);
session.subscribe((state) => {
  if (state.status !== 'authenticated') {
    resetTasksBadge();
    resetNotifications();
    resetFunnels();
    resetSources();
    resetAccount();
  } else if (!state.user.mustChangePassword) {
    // Normalmente já vieram antes da primeira tela (beforeReady); isto cobre a troca de senha obrigatória e falhas anteriores.
    loadAccount(api);
    if (state.user.role === 'user') {
      loadFunnels(api);
      loadSources(api);
    }
  }
});

const VIEWS = {
  loading: { render: renderLoading, title: 'Carregando' },
  login: { render: renderLogin, title: 'Entrar' },
  loginMentora: { render: (ctx) => renderLogin({ ...ctx, variant: 'mentora' }), title: 'Entrar — mentoria' },
  firstAccess: { render: renderFirstAccess, title: 'Primeiro acesso' },
  recover: { render: renderRecover, title: 'Esqueci minha senha' },
  reset: { render: renderReset, title: 'Redefinir senha' },
  terms: { render: renderTerms, title: 'Termos de uso' },
  privacy: { render: renderPrivacy, title: 'Política de privacidade' },
  activated: { render: renderActivated, title: 'Acesso ativado' },
  changePassword: { render: renderChangePassword, title: 'Defina uma nova senha' },
  activate: { render: renderActivate, title: 'Ativar conta' },
  home: { render: renderHome, title: 'Painel' },
  mentoraHome: { render: renderMentoraHome, title: 'Painel' },
  students: { render: renderStudents, title: 'Minhas alunas' },
  studentProfile: { render: renderStudentProfile, title: 'Aluna' },
  profile: { render: renderProfile, title: 'Meu perfil' },
  products: { render: renderProducts, title: 'Produtos' },
  commercialOverview: { render: renderCommercialOverview, title: 'Comercial' },
  contacts: { render: renderContacts, title: 'Contatos' },
  contactDetail: { render: renderContactDetail, title: 'Contato' },
  pipeline: { render: renderPipeline, title: 'Pipeline' },
  opportunityDetail: { render: renderOpportunityDetail, title: 'Oportunidade' },
  activities: { render: renderCommercialActivities, title: 'Atividades' },
  sales: { render: renderSales, title: 'Vendas' },
  saleDetail: { render: renderSaleDetail, title: 'Venda' },
  receivables: { render: renderReceivables, title: 'A receber' },
  marketingOverview: { render: renderMarketingOverview, title: 'Marketing' },
  campaigns: { render: renderCampaigns, title: 'Campanhas' },
  campaignDetail: { render: renderCampaignDetail, title: 'Campanha' },
  marketingSpend: { render: renderMarketingSpend, title: 'Investimentos' },
  instagram: { render: renderInstagram, title: 'Instagram' },
  settings: { render: renderSettings, title: 'Configurações' },
  settingsMentora: { render: renderSettingsMentora, title: 'Configurações' },
  accountPassword: { render: renderAccountPassword, title: 'Alterar senha' },
  tasks: { render: renderTasks, title: 'Tarefas' },
  help: { render: renderHelp, title: 'Central de ajuda' },
  notifications: { render: renderNotifications, title: 'Notificações' },
  calendar: { render: renderCalendar, title: 'Calendário' },
  goals: { render: renderGoals, title: 'Metas' },
  progress: { render: renderProgress, title: 'Meu progresso' },
  ranking: { render: renderRanking, title: 'Evolução da comunidade' },
  reports: { render: renderReports, title: 'Relatórios' },
  achievements: { render: renderAchievements, title: 'Conquistas' },
  challenges: { render: renderChallenges, title: 'Desafios' },
  challengeDetail: { render: renderChallengeDetail, title: 'Desafio' },
  mentoraAchievements: { render: renderMentoraAchievements, title: 'Conquistas' },
  mentoraChallenges: { render: renderMentoraChallenges, title: 'Desafios' },
  followup: { render: renderFollowup, title: 'Acompanhamento' },
  mentoraReports: { render: renderMentoraReports, title: 'Relatórios da mentoria' },
  team: { render: renderTeam, title: 'Equipe' },
  permissions: { render: renderPermissions, title: 'Permissões' },
  styleguide: { render: renderStyleguide, title: 'Guia de componentes' },
  notFound: { render: renderNotFound, title: 'Página não encontrada' },
};

let cleanup = null;
let lastKey = null;
let fatal = false;

function navigate(path) {
  // Vai direto ao destino final (sem entrada extra no histórico quando a rota redireciona).
  const route = resolveRoute(parsePath(`#${path}`), session.state);
  const target = redirectTarget(route, `#${path}`) ?? path;
  if (location.hash === `#${target}`) render();
  else location.hash = target;
}

function render() {
  if (fatal) return; // a tela de erro só sai pelo botão "Tentar de novo"
  try {
    const route = resolveRoute(parsePath(location.hash), session.state);
    if (route.redirect) {
      // Equipe sem permissão para a tela pedida: vai ao Painel e diz por quê (o servidor já barraria as chamadas).
      if (route.denied) toast(DENIED_MESSAGE, { tone: 'warn' });
      location.replace(`#${redirectTarget(route, location.hash)}`);
      return;
    }
    // Evita renderizar duas vezes a mesma tela com o mesmo estado (hashchange + mudança de sessão).
    const key = `${route.view}|${JSON.stringify(route.params ?? {})}|${session.state.status}|${session.state.user?.id ?? ''}|${session.state.user?.mustChangePassword ?? ''}|${session.state.user?.name ?? ''}|${(session.state.user?.permissions ?? []).join(',')}|${session.state.user?.teamRole ?? ''}|${session.state.reason ?? ''}|${location.hash.split('?')[1] ?? ''}`;
    if (key === lastKey && route.view !== 'loading') return;

    cleanup?.();
    cleanup = null;
    // Rota apontando para uma tela não registrada nunca derruba o app: cai em "não encontrada".
    const view = VIEWS[route.view] ?? VIEWS.notFound;
    document.title = `${view.title} — ${APP_NAME}`;
    cleanup = view.render({ root, session, api, navigate, params: route.params ?? {} }) ?? null;
    lastKey = key;
    // O foco no <h1> já é o anúncio da nova tela (sem duplicar com a região viva). O carregamento é silencioso.
    if (route.view !== 'loading') focusHeading(root);
  } catch (error) {
    console.error('Falha ao renderizar a tela', error);
    renderFatal(error);
  }
}

function renderFatal(error) {
  fatal = true;
  lastKey = null;
  try {
    cleanup?.();
  } catch (cleanupError) {
    console.error('Falha ao limpar a tela', cleanupError);
  }
  cleanup = null;
  document.title = `Não foi possível carregar — ${APP_NAME}`;
  mount(root, html`<main id="main" class="center-page"><div class="stack"><h1>Não foi possível carregar</h1><p class="muted">${describeError(error)}</p>${button({ label: 'Tentar de novo', id: 'retry' })}</div></main>`);
  root.querySelector('#retry').addEventListener('click', start);
  focusHeading(root);
}

async function start() {
  fatal = false;
  lastKey = null;
  render();
  if (fatal) return;
  try {
    await session.restore();
  } catch (error) {
    renderFatal(error);
  }
}

// Equipe: a cada troca de tela relê as permissões (se a mentora mudou o papel, o menu e a tela acompanham sem recarregar).
window.addEventListener('hashchange', () => {
  render();
  session.syncPermissions();
});
session.subscribe(render);
start();
