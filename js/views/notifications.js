import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { markAllNotificationsRead, markNotificationRead, onNotifications } from '../lib/notifications.js';
import { buildQuery, pageInfo } from '../lib/query.js';
import { tzOffsetMinutes } from '../lib/tasks.js';
import { renderShell } from '../shell.js';
import { icon } from '../ih-icons.js';
import { button, emptyState, skeleton } from '../ui/components.js';
import { notificationList } from '../ui/notification-list.js';
import { pager } from '../ui/table.js';
import { toast } from '../ui/toast.js';

const LIMIT = 20;

/** Lista completa das notificações (#/notificacoes): abas Todas e Não lidas, paginada. Vale para aluna e mentora. */
export function renderNotifications({ root, session, api, navigate }) {
  const isMentora = session.state.user?.role === 'admin' || session.state.user?.role === 'staff';
  let filter = 'all';
  let offset = 0;
  let result = null; // { data, page, unreadCount }
  let failure = null;
  let loading = true;
  let sequence = 0;

  const content = html`<div class="card notif-page">
    <div class="notif-tabs notif-tabs-page" role="tablist" aria-label="Filtrar notificações">
      <button type="button" role="tab" id="np-tab-all" class="notif-tab" aria-selected="true" aria-controls="np-body" data-tab="all">Todas</button>
      <button type="button" role="tab" id="np-tab-unread" class="notif-tab" aria-selected="false" aria-controls="np-body" tabindex="-1" data-tab="unread">Não lidas<span id="np-unread-n"></span></button>
    </div>
    <div id="np-body" role="tabpanel" aria-labelledby="np-tab-all" class="notif-page-body"></div>
  </div>`;
  const cleanupShell = renderShell({
    root,
    session,
    navigate,
    active: null,
    heading: 'Notificações',
    eyebrow: 'Conta',
    subtitle: isMentora ? 'Avisos sobre as suas alunas e sobre a sua conta.' : 'Avisos sobre as suas tarefas e sobre a sua conta.',
    actions: button({ label: 'Marcar todas como lidas', id: 'np-read-all', variant: 'ghost', iconStart: icon('check') }),
    content,
  });

  const body = root.querySelector('#np-body');
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const readAll = root.querySelector('#np-read-all');
  const unreadLabel = root.querySelector('#np-unread-n');

  function paint() {
    const unread = result?.unreadCount ?? 0;
    unreadLabel.textContent = unread > 0 ? ` · ${unread}` : '';
    readAll.disabled = unread === 0;
    body.setAttribute('aria-busy', String(loading));
    if (loading && !result) {
      mount(body, skeleton(4));
    } else if (failure) {
      mount(
        body,
        html`<div class="notif-state" role="alert"><p class="notif-state-title">Não foi possível carregar as notificações</p><p>${describeError(failure)}</p>${button({ label: 'Tentar novamente', variant: 'ghost', iconStart: icon('refresh'), extra: { 'data-action': 'retry' } })}</div>`,
      );
    } else if (!result || result.data.length === 0) {
      mount(
        body,
        filter === 'unread'
          ? emptyState({ iconName: 'bell', title: 'Nada novo por aqui', message: 'Você leu tudo. Quando houver um aviso novo, ele aparece aqui.' })
          : emptyState({ iconName: 'bell', title: 'Tudo em dia', message: 'Ainda não há notificações. Avisos de tarefas atrasadas e da sua conta aparecem aqui.' }),
      );
    } else {
      const info = pageInfo({ limit: LIMIT, offset, total: result.page.total });
      mount(body, html`${notificationList(result.data)}${pager({ info, total: result.page.total })}`);
    }
  }

  async function load({ quiet = false } = {}) {
    const mine = ++sequence;
    loading = true;
    failure = null;
    if (!quiet) paint();
    try {
      const res = await api.get(`/api/v1/notifications${buildQuery({ filter, limit: LIMIT, offset, tzOffset: tzOffsetMinutes() })}`);
      if (mine !== sequence) return;
      // Página que esvaziou (marcou tudo como lida na aba "Não lidas"): volta para a anterior.
      if (res.data.length === 0 && offset > 0) {
        offset = Math.max(0, Math.floor((res.page.total - 1) / LIMIT) * LIMIT);
        return load({ quiet });
      }
      result = res;
    } catch (error) {
      if (mine !== sequence) return;
      failure = error;
    }
    loading = false;
    paint();
  }

  function selectTab(next, { focus = false } = {}) {
    filter = next;
    offset = 0;
    for (const t of tabs) {
      const on = t.dataset.tab === next;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) body.setAttribute('aria-labelledby', t.id);
      if (on && focus) t.focus();
    }
    result = null;
    load();
  }

  for (const t of tabs) t.addEventListener('click', () => selectTab(t.dataset.tab));
  root.querySelector('.notif-tabs').addEventListener('keydown', (event) => {
    const order = tabs.map((t) => t.dataset.tab);
    const at = order.indexOf(filter);
    let next = null;
    if (event.key === 'ArrowRight') next = order[(at + 1) % order.length];
    else if (event.key === 'ArrowLeft') next = order[(at - 1 + order.length) % order.length];
    else if (event.key === 'Home') next = order[0];
    else if (event.key === 'End') next = order.at(-1);
    if (!next) return;
    event.preventDefault();
    selectTab(next, { focus: true });
  });

  readAll.addEventListener('click', async () => {
    try {
      await markAllNotificationsRead();
      toast('Todas as notificações foram marcadas como lidas.');
    } catch {
      toast('Não foi possível marcar como lidas. Tente de novo.', { tone: 'danger' });
    }
    load({ quiet: true });
  });

  body.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-action="retry"]')) {
      load();
      return;
    }
    const page = event.target.closest('[data-page]');
    if (page && !page.disabled) {
      offset = Math.max(0, offset + (page.dataset.page === 'next' ? LIMIT : -LIMIT));
      load();
      return;
    }
    const item = event.target.closest('[data-notif-id]');
    if (!item || item.dataset.unread !== 'true') return;
    const id = item.dataset.notifId;
    markNotificationRead(id)
      .then(() => {
        // Item sem link continua na tela: reflete a leitura na hora.
        if (item.tagName === 'BUTTON') load({ quiet: true });
      })
      .catch(() => toast('Não foi possível marcar como lida. Tente de novo.', { tone: 'danger' }));
  });

  // O sino marca/atualiza por conta própria; esta página só acompanha o número de não lidas.
  const stop = onNotifications((state) => {
    if (result && state.unreadCount !== result.unreadCount && state.status === 'ready') {
      result = { ...result, unreadCount: state.unreadCount };
      unreadLabel.textContent = state.unreadCount > 0 ? ` · ${state.unreadCount}` : '';
      readAll.disabled = state.unreadCount === 0;
    }
  });

  load();
  return () => {
    sequence += 1;
    stop();
    cleanupShell();
  };
}
