// Foto e preferências da própria conta, lidas uma vez por sessão e guardadas aqui.
// O topo, o perfil e o redirecionamento da página inicial leem deste cache (síncrono); quem muda algo avisa por set*().

import { setTimezonePreference } from './tasks.js';

let state = { avatarUrl: null, preferences: null };
let ready = null;
let generation = 0;
const listeners = new Set();

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener(state);
    } catch (error) {
      console.error('Erro em ouvinte da conta', error);
    }
  }
}

export function getAvatarUrl() {
  return state.avatarUrl;
}

export function getPreferences() {
  return state.preferences;
}

/** Rota inicial da pessoa: o Pipeline da Central Comercial se ela o escolheu (preferência 'deals'), senão o Painel. */
export function homePath() {
  return state.preferences?.homePage === 'deals' ? '/comercial/pipeline' : '/';
}

export function setAvatarUrl(url) {
  state = { ...state, avatarUrl: typeof url === 'string' && url ? url : null };
  emit();
}

export function setPreferences(preferences) {
  if (!preferences || typeof preferences !== 'object') return;
  state = { ...state, preferences };
  setTimezonePreference(preferences.timezone);
  emit();
}

export function onAccount(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Esquece tudo (sair ou trocar de conta). */
export function resetAccount() {
  generation += 1;
  ready = null;
  state = { avatarUrl: null, preferences: null };
  setTimezonePreference('auto');
  emit();
}

/** Lê foto e preferências uma vez. Nunca rejeita: sem elas valem os padrões e a próxima chamada tenta de novo. */
export function loadAccount(api) {
  if (ready) return ready;
  const mine = generation;
  ready = Promise.all([api.get('/api/v1/account/profile').catch(() => null), api.get('/api/v1/account/preferences').catch(() => null)]).then(([profile, preferences]) => {
    if (mine !== generation) return;
    if (!profile && !preferences) {
      ready = null;
      return;
    }
    if (profile) state = { ...state, avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : null };
    if (preferences) {
      state = { ...state, preferences };
      setTimezonePreference(preferences.timezone);
    }
    emit();
  });
  return ready;
}
