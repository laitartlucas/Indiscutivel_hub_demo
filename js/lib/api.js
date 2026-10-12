export class ApiError extends Error {
  constructor({ status, code, detail, errors = [], requestId = null }) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.errors = errors;
    this.requestId = requestId;
  }
}

function sanitizeErrors(errors) {
  if (!Array.isArray(errors)) return [];
  return errors
    .filter((e) => e && typeof e === 'object' && typeof e.field === 'string' && typeof e.message === 'string')
    .map((e) => ({ field: e.field, message: e.message }));
}

/**
 * `onXp(pontos, { method, path })` (opcional) é chamado quando uma resposta bem-sucedida traz o campo ADITIVO
 * `xpAwarded` (inteiro positivo): é assim que a tela mostra o aviso "+10 XP" sem cada chamada saber da gamificação.
 */
export function createApi({ fetchImpl = globalThis.fetch?.bind(globalThis), onUnauthorized = () => {}, onXp = null } = {}) {
  async function request(method, path, body, { allow401 = false } = {}) {
    const headers = { 'x-requested-with': 'crm', accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';

    let res;
    try {
      res = await fetchImpl(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
      });
    } catch {
      throw new ApiError({
        status: 0,
        code: 'network_error',
        detail: 'Sem conexão com o servidor. Verifique a sua internet e tente de novo.',
      });
    }

    if (res.status === 204) return null;

    let data = null;
    if ((res.headers.get('content-type') ?? '').includes('json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const error = new ApiError({
        status: res.status,
        code: data?.code ?? 'http_error',
        detail: typeof data?.detail === 'string' ? data.detail : 'Algo deu errado. Tente de novo.',
        errors: sanitizeErrors(data?.errors),
        requestId: typeof data?.requestId === 'string' ? data.requestId : null,
      });
      if (res.status === 401 && !allow401) {
        try {
          onUnauthorized(error);
        } catch (handlerError) {
          console.error('onUnauthorized falhou', handlerError);
        }
      }
      throw error;
    }
    const points = data && typeof data === 'object' ? data.xpAwarded : undefined;
    // `growth` (aditivo): conquistas desbloqueadas e desafios concluídos que esta resposta provocou.
    const growth = data && typeof data === 'object' && data.growth && typeof data.growth === 'object' ? data.growth : undefined;
    const hasPoints = Number.isInteger(points) && points > 0;
    if (onXp && (hasPoints || growth)) {
      try {
        onXp(hasPoints ? points : 0, growth ? { method, path, growth } : { method, path });
      } catch (handlerError) {
        console.error('onXp falhou', handlerError);
      }
    }
    return data;
  }

  return {
    get: (path, options) => request('GET', path, undefined, options),
    post: (path, body, options) => request('POST', path, body, options),
    put: (path, body, options) => request('PUT', path, body, options),
    patch: (path, body, options) => request('PATCH', path, body, options),
    delete: (path, options) => request('DELETE', path, undefined, options),
  };
}

const FRIENDLY_CODES = new Set(['account_blocked', 'invite_used', 'invite_expired', 'invite_cancelled', 'invite_not_allowed', 'invalid_transition']);

/** Mensagem amigável em português para mostrar ao usuário (nunca detalhes internos). */
export function describeError(error) {
  if (!(error instanceof ApiError)) return 'Ocorreu um erro inesperado. Tente de novo.';
  if (error.code === 'network_error') return error.detail;
  if (error.code === 'invalid_response') return 'Resposta inesperada do servidor. Tente de novo em instantes.';
  if (error.code === 'rate_limited' || error.status === 429) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.';
  }
  if (error.code === 'invalid_credentials') {
    return 'E-mail ou senha incorretos. Confira os dados e tente de novo. Após várias tentativas, o acesso é bloqueado por alguns minutos.';
  }
  // O servidor já escreve estas mensagens em português claro, sem detalhe interno: mostra como vieram.
  if (FRIENDLY_CODES.has(error.code)) return error.detail || 'Algo deu errado. Tente de novo.';
  if (error.status >= 500) {
    const ref = error.requestId ? ` Informe o código ${error.requestId} ao suporte.` : '';
    return `Não foi possível concluir agora. Tente de novo em instantes.${ref}`;
  }
  if (error.status === 413) return 'O conteúdo enviado é grande demais.';
  return error.detail || 'Algo deu errado. Tente de novo.';
}
