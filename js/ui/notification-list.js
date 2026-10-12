import { icon } from '../ih-icons.js';
import { html } from '../lib/html.js';
import { kindMeta, notificationLink } from '../lib/notifications.js';
import { fullDateTime, relativeTime } from '../lib/time-ago.js';

/**
 * Uma notificação (kit A-Notificacoes): ícone por tipo, título, texto, tempo relativo e ponto dourado se não foi lida.
 * Com rota interna válida vira link; sem ela, botão (só marca como lida). Os dados nunca são HTML: tudo passa por html``.
 */
export function notificationItem(n, now = new Date()) {
  const meta = kindMeta(n.kind);
  const unread = !n.readAt;
  const link = notificationLink(n);
  const inner = html`<span class="notif-icon notif-icon-${meta.tone}" aria-hidden="true">${icon(meta.icon, { size: 17 })}</span>
    <span class="notif-main">
      <span class="notif-top"><span class="notif-title">${unread ? html`<span class="sr-only">Não lida: </span>` : ''}${n.title}</span><time class="notif-time" datetime="${n.createdAt}" title="${fullDateTime(n.createdAt)}">${relativeTime(n.createdAt, now)}</time></span>
      <span class="notif-text">${n.body}</span>
    </span>
    ${unread ? html`<span class="notif-dot" aria-hidden="true"></span>` : ''}`;
  return link
    ? html`<li><a class="notif-item" data-notif-id="${n.id}" data-unread="${String(unread)}" href="${link}">${inner}</a></li>`
    : html`<li><button type="button" class="notif-item" data-notif-id="${n.id}" data-unread="${String(unread)}">${inner}</button></li>`;
}

export function notificationList(items, now = new Date()) {
  return html`<ul class="notif-list">${items.map((n) => notificationItem(n, now))}</ul>`;
}
