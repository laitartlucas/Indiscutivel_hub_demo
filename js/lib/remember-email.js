// "Lembrar acesso": guarda SÓ o e-mail (nunca a senha) no navegador, para preencher o login na próxima visita.
// Não altera a política de sessão do servidor. Todo acesso ao armazenamento é protegido (modo privado, cookies bloqueados).

export const REMEMBER_KEY = 'ih:remember-email';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readRememberedEmail(storage = defaultStorage()) {
  try {
    const value = storage?.getItem(REMEMBER_KEY);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

export function saveRememberedEmail(email, storage = defaultStorage()) {
  try {
    storage?.setItem(REMEMBER_KEY, String(email).trim());
  } catch {
    // sem armazenamento: o recurso só não lembra
  }
}

export function clearRememberedEmail(storage = defaultStorage()) {
  try {
    storage?.removeItem(REMEMBER_KEY);
  } catch {
    // idem
  }
}
