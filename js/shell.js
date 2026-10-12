import { APP_NAME, LOGOUT_FAILED } from './config.js';
import { mount } from './lib/dom.js';
import { icon, logoMark } from './ih-icons.js';
import { html } from './lib/html.js';
import { can } from './lib/permissions.js';
import { roleLabel } from './lib/students.js';
import { getTasksBadge, onTasksBadge, refreshTasksBadge, resetTasksBadge } from './lib/tasks-badge.js';
import { getAvatarUrl, homePath, onAccount } from './lib/account.js';
import { avatarContent, wordmark } from './ui/components.js';
import { toast } from './ui/toast.js';
import { mountTopbar, topbarSearchHtml, topbarToolsHtml } from './ui/topbar.js';
import { refreshNotifications, resetNotifications } from './lib/notifications.js';

// "Oportunidades" ganha o próprio grupo ("Negócio") em vez de crescer "Cadastros": Produtos/Pessoas são
// cadastros (dados de apoio, sem fluxo próprio); Oportunidades é o funil de vendas em si — misturar os
// dois no mesmo rótulo confundiria mais do que ajudaria (decisão da Task 3, documentada aqui e no relatório).
const NAV_USER = [
  { id: 'home', label: 'Painel', href: '#/', icon: 'dashboard' },
  { id: 'products', label: 'Produtos', href: '#/produtos', icon: 'crm', group: 'Cadastros' },
  { id: 'people', label: 'Pessoas', href: '#/pessoas', icon: 'contatos', group: 'Cadastros' },
  { id: 'deals', label: 'Oportunidades', short: 'Negócios', href: '#/oportunidades', icon: 'pipeline', group: 'Negócio' },
  { id: 'clients', label: 'Clientes', href: '#/clientes', icon: 'empresas', group: 'Negócio', bottom: false },
  // Gestão: leads, tarefas e agenda da aluna.
  { id: 'leads', label: 'Leads', href: '#/leads', icon: 'leads', group: 'Gestão', bottom: false },
  { id: 'companies', label: 'Empresas', href: '#/empresas', icon: 'empresas', group: 'Gestão', bottom: false },
  // O selo de Tarefas é o que pede ação agora (atrasadas + as de hoje abertas).
  { id: 'tasks', label: 'Tarefas', href: '#/tarefas', icon: 'tarefas', group: 'Gestão', badge: true },
  { id: 'calendar', label: 'Calendário', href: '#/calendario', icon: 'calendar', group: 'Gestão', bottom: false },
  // Crescimento: metas do mês, desafios, conquistas, nível/XP e a evolução da comunidade (ranking opt-in). Análises: relatórios.
  { id: 'goals', label: 'Metas', href: '#/metas', icon: 'metas', group: 'Crescimento', bottom: false },
  { id: 'challenges', label: 'Desafios', href: '#/desafios', icon: 'desafios', group: 'Crescimento', bottom: false },
  { id: 'achievements', label: 'Conquistas', href: '#/conquistas', icon: 'conquistas', group: 'Crescimento', bottom: false },
  { id: 'progress', label: 'Meu progresso', href: '#/progresso', icon: 'progresso', group: 'Crescimento', bottom: false },
  { id: 'ranking', label: 'Evolução da comunidade', href: '#/ranking', icon: 'equipe', group: 'Crescimento', bottom: false },
  { id: 'reports', label: 'Relatórios', href: '#/relatorios', icon: 'relatorios', group: 'Análises', bottom: false },
  { id: 'settings', label: 'Configurações', href: '#/configuracoes', icon: 'config', group: 'Conta', bottom: false },
];
// A mentora não vê o CRM da aluna: só o Painel e o acompanhamento das alunas.
// `perm` é a permissão que a EQUIPE precisa para ver o item (a proprietária vê todos); `owner` = só a proprietária (Equipe e permissões).
const NAV_ADMIN = [
  { id: 'home', label: 'Painel', href: '#/', icon: 'dashboard' },
  { id: 'students', label: 'Minhas alunas', href: '#/alunas', icon: 'alunas', group: 'Mentoria', perm: 'students.view' },
  { id: 'followup', label: 'Acompanhamento', href: '#/acompanhamento', icon: 'acompanhamento', group: 'Mentoria', bottom: false, perm: 'followup.view' },
  // Gestão de Desafios e Conquistas: catálogo e adesão, nunca dados de negócio das alunas.
  { id: 'mg-challenges', label: 'Desafios', href: '#/gestao/desafios', icon: 'desafios', group: 'Crescimento', bottom: false, perm: 'challenges.manage' },
  { id: 'mg-achievements', label: 'Conquistas', href: '#/gestao/conquistas', icon: 'conquistas', group: 'Crescimento', bottom: false, perm: 'achievements.manage' },
  // Análises: relatórios da mentoria (só sinais de mentoria; nunca R$ nem CRM das alunas).
  { id: 'mentora-reports', label: 'Relatórios', href: '#/relatorios-mentoria', icon: 'relatorios', group: 'Análises', bottom: false, perm: 'reports.view' },
  { id: 'team', label: 'Equipe', href: '#/equipe', icon: 'equipe', group: 'Administração', bottom: false, owner: true },
  { id: 'settings', label: 'Configurações', href: '#/configuracoes', icon: 'config', group: 'Administração', bottom: false, perm: 'settings.manage' },
];

/**
 * Falha fechada: `admin` vê o menu da mentora inteiro; `staff` só os itens que as permissões dela liberam (nunca Equipe);
 * qualquer outro valor cai no menu da aluna (as rotas e o servidor já barram o resto).
 */
export function navFor(user) {
  if (user?.role === 'admin') return NAV_ADMIN;
  if (user?.role === 'staff') return NAV_ADMIN.filter((item) => !item.owner && (!item.perm || can(user, item.perm)));
  return NAV_USER;
}
/** Mentora, Aluna ou, para a equipe, o nome do papel dela (ex.: Mentora assistente). */
const roleText = (user) => (user?.role === 'staff' && user.teamRole ? user.teamRole : roleLabel(user?.role));
const MOBILE = '(max-width: 768px)';
const TABLET = '(max-width: 1024px)'; // entre 769 e 1024 px o menu vira um trilho só de ícones
const SIDEBAR_KEY = 'ih:sidebar';

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed) {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    // sem armazenamento (janela privada, dados bloqueados): a preferência só vale nesta visita
  }
}

/** Cabeçalho de página do kit: título à esquerda (rótulo, <h1>, frase) e ações à direita. Sem nada além do título, só o <h1>. */
function pageHeader({ heading, eyebrow, subtitle, actions, large }) {
  if (!eyebrow && !subtitle && !actions) return html`<h1>${heading}</h1>`;
  return html`<div class="page-header${large ? ' page-header-large' : ''}">
    <div class="page-header-title">${eyebrow ? html`<span class="eyebrow">${eyebrow}</span>` : ''}<h1>${heading}</h1>${subtitle ? html`<p class="page-subtitle">${subtitle}</p>` : ''}</div>
    ${actions ? html`<div class="page-header-actions">${actions}</div>` : ''}
  </div>`;
}

/**
 * Esqueleto autenticado. O foco no <h1> a cada troca de rota é responsabilidade ÚNICA do roteador (app.js);
 * o shell não foca o título, para não brigar com ele. `eyebrow` (linha pequena acima), `subtitle` (frase
 * abaixo) e `actions` (botões à direita, SafeHtml) são opcionais e formam o cabeçalho de página do kit;
 * `large` usa o título grande do Painel. Devolve a limpeza dos ouvintes globais.
 */
export function renderShell({ root, session, navigate, active, heading, eyebrow, subtitle, actions, large = false, content }) {
  const user = session.state.user;
  const NAV = navFor(user);
  const current = (item) => (item.id === active ? html` aria-current="page"` : '');
  mount(root, html`<a class="skip-link" href="#main" data-skip>Pular para o conteúdo</a>
    <div class="shell">
      <div id="sidebar" class="sidebar" data-open="false" data-collapsed="false">
        <div class="sidebar-brand"><a class="brand-link" href="#${homePath()}" aria-label="${APP_NAME}: ir para a página inicial">${logoMark(36)}${wordmark()}</a>
          <button type="button" class="icon-btn sidebar-close" id="nav-close" aria-label="Fechar menu">${icon('close', { size: 20 })}</button></div>
        <nav class="sidebar-nav" aria-label="Navegação principal"><ul class="nav">${NAV.map(
          (item, index) =>
            html`${item.group && item.group !== NAV[index - 1]?.group ? html`<li class="nav-group-label" aria-hidden="true">${item.group}</li>` : ''}<li><a class="nav-item" href="${item.href}" title="${item.label}"${current(item)}>${icon(item.icon)}<span class="nav-item-text">${item.label}</span>${item.badge ? html`<span class="nav-badge" data-nav-badge hidden></span>` : ''}</a></li>`,
        )}</ul></nav>
        <div class="sidebar-footer">
          <button type="button" class="sidebar-btn" id="sidebar-collapse" aria-label="Recolher menu">${icon('chevronLeft')}<span class="sidebar-btn-text">Recolher menu</span></button>
          <button type="button" class="sidebar-btn" id="logout">${icon('logout')}<span class="sidebar-btn-text">Sair</span></button>
        </div>
      </div>
      <div class="scrim" hidden></div>
      <div class="shell-main">
        <header class="topbar">
          <button type="button" class="icon-btn" id="nav-toggle" aria-expanded="false" aria-controls="sidebar" aria-label="Abrir menu">${icon('menu', { size: 20 })}</button>
          <span class="topbar-brand"><a class="brand-link" href="#${homePath()}" aria-label="${APP_NAME}: ir para a página inicial">${logoMark(32)}${wordmark()}</a></span>
          ${topbarSearchHtml(user)}
          <span class="topbar-spacer"></span>
          ${topbarToolsHtml()}
          <a class="topbar-user" href="#/perfil" aria-label="Meu perfil: ${user?.name}">
            <span class="avatar" aria-hidden="true">${avatarContent(user?.name, getAvatarUrl())}</span>
            <span class="topbar-user-text"><span class="topbar-user-name" title="${user?.name}">${user?.name}</span>${roleText(user) ? html`<small class="topbar-user-meta">${roleText(user)}</small>` : ''}</span>
          </a>
        </header>
        <main id="main" class="main" tabindex="-1">${pageHeader({ heading, eyebrow, subtitle, actions, large })}${content}</main>
      </div>
      <nav class="bottom-nav" aria-label="Atalhos">${NAV.filter((item) => item.bottom !== false).map(
        (item) => html`<a href="${item.href}"${current(item)}><span>${icon(item.icon, { size: 19 })}</span>${item.short ?? item.label}</a>`,
      )}</nav>
    </div>`);

  const toggle = root.querySelector('#nav-toggle');
  const sidebar = root.querySelector('#sidebar');
  const scrim = root.querySelector('.scrim');
  const main = root.querySelector('#main');
  const topbar = root.querySelector('.topbar');
  const bottomNav = root.querySelector('.bottom-nav');
  const logout = root.querySelector('#logout');
  const collapse = root.querySelector('#sidebar-collapse');
  const mq = window.matchMedia(MOBILE);
  const tablet = window.matchMedia(TABLET);
  let collapsedPref = readCollapsed();

  // Tela estreita: gaveta fechada fica fora do Tab e da árvore de acessibilidade (o CSS também usa visibility:hidden);
  // gaveta aberta contém o foco (topo e conteúdo inertes). No desktop nada fica inerte.
  function syncInert(open) {
    const narrow = mq.matches;
    sidebar.inert = narrow && !open;
    topbar.inert = narrow && open;
    main.inert = narrow && open;
    bottomNav.inert = narrow && open;
  }

  // Trilho de ícones: escolha da usuária no desktop, forçado no tablet; na gaveta (celular) o menu é sempre completo.
  function syncRail() {
    const fixedRail = tablet.matches && !mq.matches;
    const rail = !mq.matches && (collapsedPref || fixedRail);
    sidebar.dataset.collapsed = String(rail);
    collapse.hidden = mq.matches || fixedRail;
    collapse.setAttribute('aria-label', rail ? 'Expandir menu' : 'Recolher menu');
  }

  function setOpen(open, { restoreFocus = false } = {}) {
    sidebar.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    scrim.hidden = !open;
    syncInert(open);
    if (open) sidebar.querySelector('.nav-item')?.focus();
    else if (restoreFocus) toggle.focus();
  }

  syncInert(false);
  syncRail();
  collapse.addEventListener('click', () => {
    collapsedPref = !collapsedPref;
    saveCollapsed(collapsedPref);
    syncRail();
  });
  toggle.addEventListener('click', () => setOpen(sidebar.dataset.open !== 'true', { restoreFocus: true }));
  scrim.addEventListener('click', () => setOpen(false, { restoreFocus: true }));
  root.querySelector('#nav-close').addEventListener('click', () => setOpen(false, { restoreFocus: true }));
  sidebar.addEventListener('click', (event) => {
    if (!event.target.closest('a')) return;
    setOpen(false);
    // Sem troca de rota o roteador não refoca; com troca, ele leva o foco ao h1 depois.
    main.focus();
  });
  root.querySelector('[data-skip]').addEventListener('click', (event) => {
    event.preventDefault();
    // O link fica fora da gaveta: fecha antes (main inerte não recebe foco).
    setOpen(false);
    main.focus();
  });
  let loggingOut = false;
  logout.addEventListener('click', async () => {
    if (loggingOut) return;
    loggingOut = true;
    logout.disabled = true;
    logout.setAttribute('aria-busy', 'true');
    if (!(await session.logout())) toast(LOGOUT_FAILED, { tone: 'danger' });
    resetTasksBadge();
    resetNotifications();
    navigate('/entrar');
  });

  // Selo de Tarefas: nasce com o último número conhecido e se atualiza sozinho (falha silenciosa: sem número, fica escondido).
  const badgeEl = root.querySelector('[data-nav-badge]');
  const paintBadge = (count) => {
    if (!badgeEl) return;
    const show = Number.isInteger(count) && count > 0;
    badgeEl.hidden = !show;
    badgeEl.textContent = show ? (count > 99 ? '99+' : String(count)) : '';
    const link = badgeEl.closest('a');
    if (link) link.setAttribute('aria-label', show ? `Tarefas, ${count} ${count === 1 ? 'pendente' : 'pendentes'}` : 'Tarefas');
  };
  let stopBadge = () => {};
  if (badgeEl) {
    paintBadge(getTasksBadge());
    stopBadge = onTasksBadge(paintBadge);
    refreshTasksBadge();
  }

  // Busca, ajuda e sino do topo. O sino se atualiza a cada navegação, no máximo uma vez por minuto.
  const stopTopbar = mountTopbar({ root, parts: { sidebar, main, bottomNav, topbar } });
  refreshNotifications();

  // Foto e página inicial chegam (ou mudam) depois do primeiro desenho: atualiza o topo e o atalho do logo no lugar.
  const stopAccount = onAccount(() => {
    const avatar = root.querySelector('.topbar-user .avatar');
    if (avatar) mount(avatar, avatarContent(user?.name, getAvatarUrl()));
    for (const link of root.querySelectorAll('.brand-link')) link.setAttribute('href', `#${homePath()}`);
  });

  const onKey = (event) => {
    if (event.key === 'Escape' && sidebar.dataset.open === 'true') setOpen(false, { restoreFocus: true });
  };
  const onChange = () => {
    const open = sidebar.dataset.open === 'true';
    // Ao estreitar com o foco no menu fixo, a gaveta passa a ficar inerte: leva o foco ao botão do topo (antes do inert).
    const focusWasInSidebar = sidebar.contains(document.activeElement);
    if (open && !mq.matches) setOpen(false);
    else syncInert(open);
    syncRail();
    if (mq.matches && !open && focusWasInSidebar) toggle.focus();
  };
  document.addEventListener('keydown', onKey);
  mq.addEventListener('change', onChange);
  tablet.addEventListener('change', syncRail);

  return () => {
    stopBadge();
    stopAccount();
    stopTopbar();
    document.removeEventListener('keydown', onKey);
    topbar.inert = false;
    main.inert = false;
    bottomNav.inert = false;
    mq.removeEventListener('change', onChange);
    tablet.removeEventListener('change', syncRail);
  };
}
