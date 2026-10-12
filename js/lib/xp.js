// Aviso de XP: o servidor devolve o campo ADITIVO `xpAwarded` na resposta de tarefa concluída, oportunidade ganha,
// lead convertido, meta atingida e ação de desafio. O campo, também aditivo, `growth` traz conquistas desbloqueadas e
// desafios concluídos. Esta camada (ligada ao cliente de API em app.js) mostra os toasts em um lugar só.
import { toast } from '../ui/toast.js';
import { growthToasts } from './growth.js';

/** Título do aviso conforme a ação que pontuou (pelo endereço chamado). */
export function xpToastTitle(method, path) {
  const p = String(path ?? '').split('?')[0];
  if (/^\/api\/v1\/tasks\//.test(p)) return 'Tarefa concluída';
  if (/\/stage-transitions$/.test(p)) return 'Oportunidade ganha';
  if (/\/leads\/[^/]+\/convert$/.test(p)) return 'Lead convertido';
  if (/^\/api\/v1\/goals/.test(p)) return 'Meta atingida';
  if (/^\/api\/v1\/challenges\/[^/]+\/actions\//.test(p)) return 'Ação concluída';
  if (/^\/api\/v1\/challenges/.test(p)) return 'Desafio';
  return 'XP recebido';
}

/** Pontos válidos de uma resposta (inteiro positivo) ou 0. */
export function xpFrom(data) {
  const points = data && typeof data === 'object' ? data.xpAwarded : undefined;
  return Number.isInteger(points) && points > 0 ? points : 0;
}

/** Listeners de "XP concedido" (telas que mostram o ganho no lugar, como o +10 XP da tarefa). */
const listeners = new Set();
export function onXpAwarded(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function announceXp(points, { method, path, growth } = {}) {
  const toasts = growthToasts(growth);
  // Consultar Conquistas/Desafios avalia e pode desbloquear: aí o aviso da conquista já leva o XP (sem toast em dobro).
  const readsGrowth = method === 'GET' && /^\/api\/v1\/(achievements|challenges)/.test(String(path ?? ''));
  if (readsGrowth && toasts.length > 0 && points > 0) {
    toasts[toasts.length - 1].detail += ` · +${points} XP`;
  } else if (points > 0) {
    toast(xpToastTitle(method, path), { tone: 'premium', detail: `+${points} XP · continue assim`, timeout: 4000 });
  }
  for (const item of toasts) toast(item.title, { tone: 'premium', detail: item.detail, timeout: 5000 });
  if (!(points > 0)) return;
  for (const listener of [...listeners]) {
    try {
      listener(points, { method, path });
    } catch (error) {
      console.error('Erro em ouvinte de XP', error);
    }
  }
}
