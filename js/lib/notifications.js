// Notificações do sino: último estado conhecido, guardado aqui para que cada tela nova (o shell é redesenhado a cada
// rota) já nasça com o número certo. Atualiza no máximo uma vez por minuto por navegação, e sempre que o painel abre.
// Falha silenciosa em segundo plano: sem resposta, o sino fica como estava.
import { buildQuery } from './query.js';
import { safeInternalLink } from './combobox.js';
import { tzOffsetMinutes } from './tasks.js';

export const REFRESH_INTERVAL_MS = 60_000;
/** Quantas notificações o painel do sino carrega (as não lidas vêm primeiro). */
export const PANEL_LIMIT = 10;

/** Ícone e tom (cores do kit) de cada tipo de notificação. */
export const KIND_META = {
  welcome: { icon: 'sparkle', tone: 'green' },
  task_overdue: { icon: 'clock', tone: 'wine' },
  daily_summary: { icon: 'calendar', tone: 'sage' },
  password_reset: { icon: 'lock', tone: 'sage' },
  invite_accepted: { icon: 'check', tone: 'gold' },
  invite_expired: { icon: 'alert', tone: 'wine' },
  goal_reached: { icon: 'metas', tone: 'gold' },
  achievement_unlocked: { icon: 'conquistas', tone: 'gold' },
  challenge_completed: { icon: 'check', tone: 'gold' },
  challenge_published: { icon: 'desafios', tone: 'green' },
  mentoring_session_scheduled: { icon: 'calendar', tone: 'green' },
  two_factor_reset: { icon: 'lock', tone: 'wine' },
};
const FALLBACK_META = { icon: 'bell', tone: 'paper' };
export const kindMeta = (kind) => (Object.hasOwn(KIND_META, kind) ? KIND_META[kind] : FALLBACK_META);

/** Link seguro da notificação (rota interna) ou null. */
export const notificationLink = (item) => safeInternalLink(item?.link);

let api = null;
let state = { status: 'idle', items: [], unreadCount: 0, error: null };
let lastFetch = 0;
let inflight = null;
let generation = 0;
const listeners = new Set();

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener(state);
    } catch (error) {
      console.error('Erro em ouvinte de notificações', error);
    }
  }
}

function set(patch) {
  state = { ...state, ...patch };
  emit();
}

export function configureNotifications(client) {
  api = client;
}

export function getNotifications() {
  return state;
}

export function onNotifications(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Esquece tudo (saída da conta). */
export function resetNotifications() {
  generation += 1;
  lastFetch = 0;
  inflight = null;
  state = { status: 'idle', items: [], unreadCount: 0, error: null };
  emit();
}

/**
 * Busca a primeira página. Sem `force`, respeita o intervalo de um minuto (navegações seguidas não repetem a consulta).
 * Só mostra "carregando" ou erro quando ainda não há nada para exibir; com dados antigos na mão, uma falha é silenciosa.
 * Nunca rejeita; o erro fica em `state.error`.
 */
export function refreshNotifications({ force = false } = {}) {
  if (!api) return Promise.resolve();
  if (inflight) return inflight;
  if (!force && Date.now() - lastFetch < REFRESH_INTERVAL_MS) return Promise.resolve();
  const mine = generation;
  lastFetch = Date.now();
  if (state.status === 'idle' || state.status === 'error') set({ status: 'loading', error: null });
  inflight = api
    .get(`/api/v1/notifications${buildQuery({ limit: PANEL_LIMIT, tzOffset: tzOffsetMinutes() })}`)
    .then((res) => {
      if (mine !== generation) return;
      set({ status: 'ready', items: Array.isArray(res?.data) ? res.data : [], unreadCount: Number.isInteger(res?.unreadCount) ? res.unreadCount : 0, error: null });
    })
    .catch((error) => {
      if (mine !== generation) return;
      // Com dados antigos na mão, o sino segue como estava.
      if (state.status === 'ready') return;
      set({ status: 'error', error });
    })
    .finally(() => {
      if (mine === generation) inflight = null;
    });
  return inflight;
}

/**
 * Marca uma notificação como lida. Otimista quando ela está no painel (volta atrás e relança o erro se o servidor
 * recusar); se não está (página 2 da lista completa), só avisa o servidor e atualiza o número do sino.
 */
export async function markNotificationRead(id) {
  const item = state.items.find((n) => n.id === id);
  if (item?.readAt) return;
  if (item) {
    const stamp = new Date().toISOString();
    set({ items: state.items.map((n) => (n.id === id ? { ...n, readAt: stamp } : n)), unreadCount: Math.max(0, state.unreadCount - 1) });
  }
  try {
    await api.post(`/api/v1/notifications/${encodeURIComponent(id)}/read`);
  } catch (error) {
    if (item) set({ items: state.items.map((n) => (n.id === id ? { ...n, readAt: null } : n)), unreadCount: state.unreadCount + 1 });
    throw error;
  }
  if (!item) refreshNotifications({ force: true });
}

/** Marca todas como lidas (otimista, com volta atrás em erro). */
export async function markAllNotificationsRead() {
  const before = state;
  const stamp = new Date().toISOString();
  set({ items: state.items.map((n) => (n.readAt ? n : { ...n, readAt: stamp })), unreadCount: 0 });
  try {
    await api.post('/api/v1/notifications/read-all');
  } catch (error) {
    set({ items: before.items, unreadCount: before.unreadCount });
    throw error;
  }
}

/** Texto do rótulo do sino para leitor de tela. */
export function bellLabel(unreadCount) {
  if (!Number.isInteger(unreadCount) || unreadCount <= 0) return 'Notificações';
  return `Notificações, ${unreadCount} ${unreadCount === 1 ? 'nova' : 'novas'}`;
}
