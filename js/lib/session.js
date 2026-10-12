import { ApiError } from './api.js';

function readUser(data) {
  const user = data?.user;
  if (!user || typeof user !== 'object' || typeof user.id !== 'string') {
    throw new ApiError({
      status: 502,
      code: 'invalid_response',
      detail: 'Resposta inesperada do servidor.',
    });
  }
  return user;
}

/**
 * `beforeReady(user)` (opcional) roda depois que o servidor confirma quem entrou e ANTES do estado virar autenticado: serve para
 * carregar o que a primeira tela precisa (foto, preferências, etapas, origens). Nunca pode derrubar a entrada: erros são ignorados.
 */
export function createSession(api, { beforeReady = null } = {}) {
  const prepare = async (user) => {
    if (!beforeReady) return;
    try {
      await beforeReady(user);
    } catch {
      // a tela abre mesmo assim, com os padrões
    }
  };
  /**
   * Equipe (`staff`): o papel e as permissões vêm de GET /account/permissions, lidos agora do servidor (que os confere de novo em
   * cada rota). Falha = sem permissão alguma (falha fechada: o menu mostra só o Painel). Outros papéis passam direto.
   */
  const withPermissions = async (user) => {
    if (user.role !== 'staff') return user;
    try {
      const info = await api.get('/api/v1/account/permissions');
      return { ...user, permissions: Array.isArray(info?.permissions) ? info.permissions : [], teamRole: typeof info?.teamRole === 'string' ? info.teamRole : null };
    } catch {
      return { ...user, permissions: [], teamRole: null };
    }
  };
  let state = { status: 'loading', user: null, reason: null };
  let generation = 0;
  const listeners = new Set();

  function set(next) {
    state = next;
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        console.error('Erro em ouvinte de sessão', error);
      }
    }
  }
  // Cada operação reserva um número; só a mais recente pode alterar o estado.
  const begin = () => ++generation;
  const authenticated = (user) => set({ status: 'authenticated', user, reason: null });
  const anonymous = (reason = null) => set({ status: 'anonymous', user: null, reason });

  return {
    get state() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async restore() {
      const mine = begin();
      try {
        const user = await withPermissions(readUser(await api.get('/api/v1/auth/me', { allow401: true })));
        if (mine === generation) await prepare(user);
        if (mine === generation) authenticated(user);
      } catch (error) {
        if (error?.status === 401) {
          if (mine === generation) anonymous();
        } else throw error;
      }
    },
    async login(email, password) {
      const mine = begin();
      const user = await withPermissions(readUser(await api.post('/api/v1/auth/login', { email, password }, { allow401: true })));
      if (mine === generation) await prepare(user);
      if (mine === generation) authenticated(user);
    },
    /** Ativa a conta pelo convite: o servidor abre a sessão (cookie) e devolve o usuário; só então o estado muda. */
    async activate(token, password) {
      const mine = begin();
      const user = await withPermissions(readUser(await api.post('/api/v1/invites/accept', { token, password }, { allow401: true })));
      // `justActivated` leva a aluna do link do convite à tela "Acesso ativado" (ver router-core). Some na próxima mudança de sessão.
      if (mine === generation) set({ status: 'authenticated', user, reason: null, justActivated: true });
    },
    /** Encerra o estado "acabou de ativar" sem avisar a tela (quem chama já está saindo dela). */
    clearActivation() {
      if (state.justActivated) state = { ...state, justActivated: false };
    },
    /**
     * Sempre termina no estado anônimo. Devolve true se o servidor confirmou (2xx/204, ou 401: já não havia sessão)
     * e false se não foi possível confirmar (rede ou 5xx): a sessão pode continuar válida no servidor.
     */
    async logout() {
      const mine = begin();
      let confirmed = true;
      try {
        await api.post('/api/v1/auth/logout', {}, { allow401: true });
      } catch (error) {
        confirmed = error?.status === 401;
      } finally {
        if (mine === generation) anonymous();
      }
      return confirmed;
    },
    async changePassword(currentPassword, newPassword) {
      const mine = begin();
      await api.post('/api/v1/auth/password', { currentPassword, newPassword });
      const user = await withPermissions(readUser(await api.get('/api/v1/auth/me')));
      if (mine === generation) authenticated(user);
    },
    /** Relê o usuário em `/auth/me` (ex.: depois de editar o próprio perfil) e atualiza o estado. Erros são propagados e o estado fica como estava. */
    async refresh() {
      const mine = begin();
      const user = await withPermissions(readUser(await api.get('/api/v1/auth/me')));
      if (mine === generation) authenticated(user);
    },
    /**
     * Equipe: relê as permissões no servidor e, se mudaram (a mentora trocou o papel ou revogou algo), atualiza o menu e a tela.
     * Chamado a cada troca de rota. Nunca derruba nada: erro de rede mantém o que já se sabe.
     */
    async syncPermissions() {
      if (state.status !== 'authenticated' || state.user?.role !== 'staff') return;
      const before = state.user;
      const mine = generation;
      try {
        const info = await api.get('/api/v1/account/permissions');
        if (mine !== generation || state.user !== before || !Array.isArray(info?.permissions)) return;
        const same = info.permissions.length === (before.permissions ?? []).length && info.permissions.every((p, i) => p === before.permissions[i]);
        if (same && (info.teamRole ?? null) === (before.teamRole ?? null)) return;
        authenticated({ ...before, permissions: info.permissions, teamRole: info.teamRole ?? null });
      } catch {
        // mantém o que já se sabe; o servidor continua sendo a barreira
      }
    },
    expire() {
      if (state.status !== 'authenticated') return;
      begin();
      anonymous('expired');
    },
  };
}
