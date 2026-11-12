/* global structuredClone, atob */
// API falsa da versão de demonstração: reproduz, em memória (com cópia em localStorage), as rotas de /api/v1
// que o front usa, com os mesmos formatos de resposta, paginação, `version` otimista e erros problem+json do servidor.
// Sem dependências. Os dados são todos fictícios (ver seed.js).
import { createGrowthDemo } from './mock-growth.js';
import { createFollowupDemo } from './mock-followup.js';
import { createMentoraDemo } from './mock-mentora.js';
import { createTeamDemo } from './mock-team.js';
import { createReportsDemo } from './mock-reports.js';
import { createCommercialDemo } from './mock-commercial.js';
import { createFinanceDemo } from './mock-finance.js';
import { createMarketingDemo } from './mock-marketing.js';
import { ASSISTANT_EMAIL, buildSeed, DEMO_PASSWORD, MENTORA_EMAIL, SCHEMA_VERSION, STUDENT_EMAIL } from './seed.js';

export { ASSISTANT_EMAIL, DEMO_PASSWORD, MENTORA_EMAIL, STUDENT_EMAIL };

const STORAGE_KEY = 'ih-demo-db';
const SESSION_KEY = 'ih-demo-session';
const API_PREFIX = '/api/v1/';
const DAY = 86_400_000;
const INVITE_TTL_MS = 7 * DAY;

// Verificação em duas etapas na demonstração: não existe segredo nem aplicativo; o código do aplicativo é sempre 123456.
const TWO_FACTOR_CODE = '123456';
const TWO_FACTOR_HINT = 'Demonstração: use 123456';
const TWO_FACTOR_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const TWO_FACTOR_RECOVERY = Array.from({ length: 10 }, (_, i) => `DEMA${'ABCDEFGHJK'[i]}-${String((i % 8) + 2).repeat(5)}`);

const SOURCE_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const DEFAULT_LEAD_SOURCES = [
  ['referral', 'Indicação'],
  ['organic', 'Orgânico'],
  ['meta_ads', 'Meta Ads'],
  ['google_ads', 'Google Ads'],
  ['event', 'Evento'],
  ['other', 'Outro'],
].map(([key, label], index) => ({ key, label, archived: false, position: index + 1 }));
const TIMEZONES = ['auto', 'America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco', 'America/Noronha', 'UTC'];
const HOME_PAGES = ['dashboard', 'deals'];
const DEFAULT_PREFERENCES = { language: 'pt-BR', currency: 'BRL', timezone: 'auto', homePage: 'dashboard', notifications: { overdueTasks: true, dailySummary: false, mentorMessages: true, security: true }, rankingVisible: false };
const AVATAR_MAX_CHARS = 150 * 1024;
const MULTILINE_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const STUDENT_STATUSES = ['active', 'invite_pending', 'invite_expired', 'no_invite', 'blocked', 'inactive'];
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMON_PASSWORDS = new Set([
  '1234567890', '12345678910', '0123456789', 'qwertyuiop', '1q2w3e4r5t', 'senha12345', 'senha123456',
  'password12', 'password123', 'passw0rd123', 'brasil2024', 'brasil2025', 'brasil2026', 'abcdefghij',
  'mudar12345', 'trocar1234', 'admin12345', 'administrador', 'iloveyou123', 'corinthians',
]);

// ---------------------------------------------------------------- erros

class HttpError extends Error {
  constructor(status, code, detail, errors) {
    super(detail);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

const Errors = {
  invalidCredentials: () =>
    new HttpError(401, 'invalid_credentials', 'E-mail ou senha inválidos. Após várias tentativas a conta é bloqueada por alguns minutos.'),
  unauthenticated: () => new HttpError(401, 'unauthenticated', 'Sessão expirada. Entre novamente.'),
  forbidden: () => new HttpError(403, 'forbidden', 'Você não tem permissão para isso.'),
  notFound: (message = 'Não encontrado.') => new HttpError(404, 'not_found', message),
  validation: (errors) => new HttpError(400, 'validation_error', 'Dados inválidos.', errors),
  conflict: (code, message, errors) => new HttpError(409, code, message, errors),
  gone: (code, message) => new HttpError(410, code, message),
  accountBlocked: () => new HttpError(401, 'account_blocked', 'Seu acesso foi temporariamente bloqueado pela sua mentora.'),
  badRequest: () => new HttpError(400, 'bad_request', 'Requisição inválida.'),
};

// ---------------------------------------------------------------- XP, níveis e metas (espelho de server/src/domain/xp.ts e goals.ts)
// Os números abaixo são conferidos contra o servidor por server/test/xp-domain.test.ts.

const XP_RULES = {
  task_done: { points: 10, dailyCap: 100 },
  deal_won: { points: 50, dailyCap: 200 },
  lead_converted: { points: 30, dailyCap: 150 },
  person_created: { points: 5, dailyCap: 25 },
  lead_activity: { points: 3, dailyCap: 15 },
  daily_access: { points: 2, dailyCap: 2 },
  goal_reached: { points: 100, dailyCap: 300 },
  // XP definido pela mentora (conquista, ação e desafio): sem valor fixo.
  achievement_unlocked: { points: 0, variable: true },
  challenge_action: { points: 0, variable: true },
  challenge_completed: { points: 0, variable: true },
};
const XP_TITLES = {
  task_done: 'Tarefa concluída',
  deal_won: 'Oportunidade ganha',
  lead_converted: 'Lead convertido em oportunidade',
  person_created: 'Nova pessoa cadastrada',
  lead_activity: 'Atividade registrada em um lead',
  daily_access: 'Primeiro acesso do dia',
  goal_reached: 'Meta do mês atingida',
  achievement_unlocked: 'Conquista desbloqueada',
  challenge_action: 'Ação de desafio concluída',
  challenge_completed: 'Desafio concluído',
};
const XP_DAY_OFFSET = 180;
const LEVELS = [
  { n: 1, name: 'Iniciante', from: 0 }, { n: 2, name: 'Aprendiz', from: 150 }, { n: 3, name: 'Praticante', from: 400 },
  { n: 4, name: 'Dedicada', from: 800 }, { n: 5, name: 'Consistente', from: 1400 }, { n: 6, name: 'Profissional', from: 2300 },
  { n: 7, name: 'Especialista', from: 3600 }, { n: 8, name: 'Estrategista', from: 5400 }, { n: 9, name: 'Referência', from: 8000 },
  { n: 10, name: 'Mestra', from: 11500 }, { n: 11, name: 'Visionária', from: 16000 }, { n: 12, name: 'Indiscutível', from: 22000 },
];
export const DEMO_XP_RULES = XP_RULES;
export const DEMO_LEVELS = LEVELS;
const GOAL_METRICS = {
  revenue: 'Faturamento',
  deals_won: 'Oportunidades ganhas',
  new_leads: 'Novos leads',
  tasks_done: 'Tarefas concluídas',
  new_people: 'Novas pessoas',
};
const GOAL_MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Nível de um total de XP (mesma função pura do servidor). */
export function levelFor(xp) {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (total >= LEVELS[i].from) index = i;
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  return {
    level: current.n, name: current.name, base: current.from, xpInto: total - current.from,
    nextAt: next ? next.from : null, xpToNext: next ? next.from - total : 0, nextLevel: next ? next.n : null, nextName: next ? next.name : null,
  };
}

// ---------------------------------------------------------------- utilidades

const ACCENTS_FROM = 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ';
const ACCENTS_TO = 'aaaaaaeeeeiiiiooooouuuucnyyaaaaaaeeeeiiiiooooouuuucny';

/** Minúsculas, sem acentos, espaços normalizados (mesma regra da busca do servidor). */
function fold(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[à-ÿ]/g, (c) => {
      const index = ACCENTS_FROM.indexOf(c);
      return index === -1 ? c : ACCENTS_TO[index];
    });
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const byText = (a, b) => collator.compare(a, b);
const copy = (value) => JSON.parse(JSON.stringify(value));
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function toCents(value) {
  const [int, frac = ''] = String(value).split('.');
  return Number(int) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
}
function fromCents(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
/** "4800" / "4800.5" -> "4800.00" (formato do NUMERIC(12,2) do servidor). */
const canonMoney = (text) => fromCents(toCents(text));

function randomBytes(n) {
  const out = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(out);
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}
function newId() {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function newToken() {
  let s = '';
  for (const x of randomBytes(32)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

/** Lê o armazenamento do navegador sem nunca lançar (modo privado, cookies bloqueados...). */
function safeStorage(kind) {
  try {
    const storage = globalThis[kind];
    if (!storage) return null;
    const probe = '__ih_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- validação

function createIssues() {
  const errors = [];
  return {
    add: (field, message) => void errors.push({ field, message }),
    get list() {
      return errors;
    },
    throwIfAny() {
      if (errors.length) throw Errors.validation(errors);
    },
  };
}

function requireBody(body) {
  if (!isPlainObject(body)) throw Errors.validation([{ field: '', message: 'Dados inválidos.' }]);
  return body;
}

function onlyKeys(body, allowed, issues) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) issues.add('', `Campo não permitido: ${key}.`);
  }
}

/** Nome obrigatório (Pessoa/Produto/Aluna): aparado, 1..120, sem caracteres de controle. */
function readName(value, requiredMessage, issues, field = 'name') {
  if (typeof value !== 'string' || value.trim() === '') return void issues.add(field, requiredMessage);
  const s = value.trim();
  if (s.length > 120) return void issues.add(field, 'Nome muito longo (máximo 120).');
  if (CONTROL_CHARS.test(s)) return void issues.add(field, 'O nome contém caracteres inválidos.');
  return s;
}

/**
 * Texto opcional: aparado, '' vira null; undefined continua undefined.
 * `validate` só roda em valor não vazio.
 */
function readOptional(value, field, max, tooLong, issues, validate) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return void issues.add(field, 'Dados inválidos.');
  const s = value.trim();
  if (s.length > max) return void issues.add(field, tooLong);
  if (CONTROL_CHARS.test(s)) return void issues.add(field, 'O texto contém caracteres inválidos.');
  if (s === '') return null;
  if (validate && !validate.test(s)) return void issues.add(field, validate.message);
  return s;
}

const phoneRule = { test: (s) => /^[0-9+()\-\s]{8,20}$/.test(s), message: 'Informe um telefone válido.' };
const readPhone = (v, issues) => readOptional(v, 'phone', 20, 'Telefone muito longo.', issues, phoneRule);

function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const year = Number(s.slice(0, 4));
  if (year < 1900 || year > 2100) return false;
  return !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}
function isHttpsUrl(s) {
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
}

function readVersion(value, issues) {
  if (!Number.isInteger(value) || value < 1) return void issues.add('version', 'Informe a versão do registro.');
  return value;
}

function readMoney(value, issues, field) {
  if (typeof value !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) {
    return void issues.add(field, 'Informe um valor válido, como 4800 ou 4800.50.');
  }
  return canonMoney(value);
}

function validatePasswordPolicy(password, email) {
  const length = [...password].length;
  if (length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'Essa senha é muito comum. Escolha outra.';
  const local = String(email ?? '').split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'A senha não pode conter o seu e-mail.';
  if (/^(.)\1+$/.test(password)) return 'A senha não pode ser um único caractere repetido.';
  return null;
}

/** Lê e valida a query string conforme `spec` ({chave: 'text'|'uuid'|'int'|{enum, message}}). */
function readQuery(searchParams, spec, defaults) {
  const issues = createIssues();
  const out = { ...defaults };
  for (const [key, raw] of searchParams) {
    const rule = spec[key];
    if (!rule) {
      issues.add('', `Parâmetro não permitido: ${key}.`);
      continue;
    }
    if (rule === 'text') {
      const s = raw.trim();
      if (s.length > 100 || CONTROL_CHARS.test(s)) issues.add(key, 'A busca contém caracteres inválidos.');
      else out[key] = s;
    } else if (rule === 'uuid') {
      if (!UUID.test(raw)) issues.add(key, 'Identificador inválido.');
      else out[key] = raw;
    } else if (rule === 'iso') {
      if (!ISO_INSTANT.test(raw) || Number.isNaN(Date.parse(raw))) issues.add(key, 'Data inválida.');
      else out[key] = new Date(Date.parse(raw)).toISOString();
    } else if (rule.int) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < rule.int[0] || n > rule.int[1]) issues.add(key, `Informe um número inteiro entre ${rule.int[0]} e ${rule.int[1]}.`);
      else out[key] = n;
    } else if (rule.pattern) {
      if (!rule.pattern.test(raw)) issues.add(key, rule.message ?? `Valor inválido para ${key}.`);
      else out[key] = raw;
    } else if (rule.enum) {
      if (!rule.enum.includes(raw)) issues.add(key, rule.message ?? `Valor inválido para ${key}.`);
      else out[key] = raw;
    }
  }
  issues.throwIfAny();
  return out;
}

const PAGING = { limit: { int: [1, 100] }, offset: { int: [0, 1_000_000] } };
const PAGING_DEFAULTS = { limit: 20, offset: 0 };

function paginate(rows, query) {
  return {
    data: rows.slice(query.offset, query.offset + query.limit),
    page: { limit: query.limit, offset: query.offset, total: rows.length },
  };
}

/** Ordenação estável com desempate por id; `nullsLast` mantém nulos no fim nas duas direções. */
function sortRows(rows, key, order, { compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0), nullsLast = false } = {}) {
  const dir = order === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (nullsLast && (x == null || y == null)) {
      if (x == null && y == null) return a.id < b.id ? -1 : 1;
      return x == null ? 1 : -1;
    }
    const c = compare(x, y) * dir;
    return c !== 0 ? c : a.id < b.id ? -1 : 1;
  });
}

// ---------------------------------------------------------------- a API

/**
 * @param {object} [options]
 * @param {{getItem:Function,setItem:Function,removeItem:Function}|null} [options.storage] cópia durável dos dados (null = só memória)
 * @param {{getItem:Function,setItem:Function,removeItem:Function}|null} [options.sessionStorage] guarda a sessão falsa
 * @param {() => Date} [options.now] relógio (padrão: agora)
 * @param {string|null} [options.baseUrl] base dos links de convite (padrão: página atual, sem o #)
 * @param {number} [options.latencyMs] atraso simulado em cada resposta
 * @param {typeof fetch} [options.fallbackFetch] usado para endereços que não são /api/v1/
 */
export function createDemoApi(options = {}) {
  const clock = options.now ?? (() => new Date());
  const storage = options.storage === undefined ? safeStorage('localStorage') : options.storage;
  const sessionStore = options.sessionStorage === undefined ? safeStorage('sessionStorage') : options.sessionStorage;
  const memorySession = memoryStorage();
  const latencyMs = options.latencyMs ?? 0;
  const fallbackFetch = options.fallbackFetch;

  let db = load();
  let session = loadSession();
  let lastStamp = 0;

  function load() {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.schema === SCHEMA_VERSION && Array.isArray(parsed.users)) return parsed;
      }
    } catch {
      // cópia ilegível: recomeça do exemplo
    }
    return buildSeed(clock());
  }

  function persist() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // sem espaço ou bloqueado: segue só em memória
    }
  }

  function loadSession() {
    try {
      const raw = (sessionStore ?? memorySession).getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveSession(next) {
    session = next;
    try {
      const target = sessionStore ?? memorySession;
      if (next) target.setItem(SESSION_KEY, JSON.stringify(next));
      else target.removeItem(SESSION_KEY);
    } catch {
      // só em memória
    }
  }

  /** Instante atual em ISO, sempre crescente (evita empate de created_at em criações seguidas). */
  function stamp() {
    let ms = clock().getTime();
    if (ms <= lastStamp) ms = lastStamp + 1;
    lastStamp = ms;
    return new Date(ms).toISOString();
  }

  // ---- estado de contas

  const findUser = (id) => db.users.find((u) => u.id === id);
  const invitesOf = (userId) => db.invites.filter((i) => i.userId === userId);

  function statusOf(u) {
    if (!u.active) return 'inactive';
    if (u.manuallyBlocked) return 'blocked';
    const own = invitesOf(u.id);
    if (u.lastLoginAt || own.some((i) => i.status === 'accepted')) return 'active';
    const at = clock().toISOString();
    if (own.some((i) => i.status === 'pending' && i.expiresAt >= at)) return 'invite_pending';
    if (own.some((i) => i.status === 'pending')) return 'invite_expired';
    return 'no_invite';
  }

  const sessionUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: false, twoFactorEnabled: Boolean(u.twoFactor?.enabled) });

  function studentDto(u) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      photoUrl: u.photoUrl,
      avatarUrl: u.avatarData ?? null,
      className: u.className,
      program: u.program,
      joinedOn: u.joinedOn,
      endsOn: u.endsOn,
      plan: u.plan,
      status: statusOf(u),
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    };
  }

  function requireAuth(role) {
    const u = session ? findUser(session.userId) : null;
    if (!u || !u.active || u.manuallyBlocked) throw Errors.unauthenticated();
    if (role && u.role !== role) throw Errors.forbidden();
    return u;
  }

  // ---- DTOs de negócio (sem ownerId)

  const withoutOwner = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'ownerId'));
  const productDto = withoutOwner;

  const mine = (list, owner) => list.filter((row) => row.ownerId === owner.id);

  function replaceRow(list, id, next) {
    const index = list.findIndex((row) => row.id === id);
    list[index] = next;
    return next;
  }

  // ---- auth

  function login(body) {
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['email', 'password'], issues);
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    if (email.length < 3) issues.add('email', 'Informe o e-mail.');
    else if (email.length > 254) issues.add('email', 'E-mail muito longo.');
    else if (CONTROL_CHARS.test(email)) issues.add('email', 'O e-mail contém caracteres inválidos.');
    if (typeof b.password !== 'string' || b.password === '') issues.add('password', 'Informe a senha.');
    else if (b.password.length > 128) issues.add('password', 'A senha pode ter no máximo 128 caracteres.');
    issues.throwIfAny();

    const u = db.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    const passwordOk = Boolean(u && u.password !== null && u.password === b.password);
    if (!u || !passwordOk || !u.active) throw Errors.invalidCredentials();
    if (u.manuallyBlocked) throw Errors.accountBlocked();
    // Conta com verificação em duas etapas: a senha certa NÃO abre sessão; devolve só o desafio (como o servidor).
    if (u.twoFactor?.enabled) {
      const challenge = `demo-${newId()}-${newId()}`;
      challenges.set(challenge, { userId: u.id, attempts: 0, expiresAt: clock().getTime() + 5 * 60_000 });
      return { status: 200, body: { twoFactorRequired: true, challenge, demoHint: TWO_FACTOR_HINT } };
    }
    u.lastLoginAt = stamp();
    saveSession({ userId: u.id, sessionId: newId(), startedAt: u.lastLoginAt });
    return { status: 200, body: { user: sessionUser(u) } };
  }

  // ---- verificação em duas etapas (demonstração: o código do aplicativo é SEMPRE 123456; não há segredo de verdade)

  const challenges = new Map(); // desafios do login, só em memória (somem ao recarregar), com 5 tentativas e 5 minutos
  const twoFactorOf = (u) => (u.twoFactor ??= { enabled: false, pending: false, recovery: [] });
  const recoveryLeft = (u) => (u.twoFactor?.enabled ? u.twoFactor.recovery.filter((c) => !c.used).length : 0);
  const freshRecovery = () => TWO_FACTOR_RECOVERY.map((code) => ({ code, used: false }));
  const digitsOf = (value) => (typeof value === 'string' ? value.replace(/[\s-]+/g, '') : '');
  const goodTotp = (value) => /^\d{6}$/.test(digitsOf(value));
  const goodRecovery = (value) => /^[A-HJ-NP-Z2-9]{10}$/.test(digitsOf(value).toUpperCase());
  const recoveryMatch = (u, value) => u.twoFactor.recovery.find((c) => !c.used && c.code.replace('-', '') === digitsOf(value).toUpperCase()) ?? null;
  const wrongCode = (field = 'code') =>
    Errors.validation([{ field, message: field === 'code' ? 'Código incorreto ou vencido. Confira se o horário do celular está automático.' : 'Código de recuperação incorreto ou já usado.' }]);

  function checkPassword(b, issues) {
    if (typeof b.password !== 'string' || b.password === '') issues.add('password', 'Informe a sua senha.');
    else if (b.password.length > 128) issues.add('password', 'A senha pode ter no máximo 128 caracteres.');
    return issues;
  }

  function twoFactorStatus() {
    const u = requireAuth();
    return { status: 200, body: { enabled: Boolean(u.twoFactor?.enabled), recoveryCodesLeft: recoveryLeft(u), demoHint: TWO_FACTOR_HINT } };
  }

  function twoFactorSetup(body) {
    const u = requireAuth();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['password'], issues);
    checkPassword(b, issues).throwIfAny();
    if (u.password !== b.password) throw Errors.validation([{ field: 'password', message: 'Senha incorreta.' }]);
    if (u.twoFactor?.enabled) throw new HttpError(409, 'two_factor_already_enabled', 'A verificação em duas etapas já está ativa nesta conta.');
    twoFactorOf(u).pending = true;
    const label = `Indiscut%C3%ADvel%20Hub:${encodeURIComponent(u.email)}`;
    return {
      status: 200,
      body: {
        secret: TWO_FACTOR_SECRET,
        otpauthUri: `otpauth://totp/${label}?secret=${TWO_FACTOR_SECRET}&issuer=Indiscut%C3%ADvel%20Hub&algorithm=SHA1&digits=6&period=30`,
        expiresInSeconds: 1800,
        demoHint: TWO_FACTOR_HINT,
      },
    };
  }

  function twoFactorEnable(body) {
    const u = requireAuth();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['code'], issues);
    if (!goodTotp(b.code)) issues.add('code', 'Digite os 6 números do aplicativo.');
    issues.throwIfAny();
    if (u.twoFactor?.enabled) throw new HttpError(409, 'two_factor_already_enabled', 'A verificação em duas etapas já está ativa nesta conta.');
    if (!u.twoFactor?.pending) throw new HttpError(409, 'two_factor_not_started', 'Comece a ativação pelo primeiro passo.');
    if (digitsOf(b.code) !== TWO_FACTOR_CODE) throw wrongCode();
    Object.assign(twoFactorOf(u), { enabled: true, pending: false, recovery: freshRecovery() });
    return { status: 200, body: { recoveryCodes: [...TWO_FACTOR_RECOVERY] } };
  }

  function twoFactorDisable(body) {
    const u = requireAuth();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['password', 'code', 'recoveryCode'], issues);
    checkPassword(b, issues);
    if ((b.code === undefined) === (b.recoveryCode === undefined)) issues.add('code', 'Informe o código do aplicativo ou um código de recuperação.');
    else if (b.code !== undefined && !goodTotp(b.code)) issues.add('code', 'Digite os 6 números do aplicativo.');
    else if (b.recoveryCode !== undefined && !goodRecovery(b.recoveryCode)) issues.add('recoveryCode', 'Digite o código de recuperação completo (10 letras e números).');
    issues.throwIfAny();
    if (u.password !== b.password) throw Errors.validation([{ field: 'password', message: 'Senha incorreta.' }]);
    if (!u.twoFactor?.enabled) throw new HttpError(409, 'two_factor_not_enabled', 'A verificação em duas etapas não está ativa nesta conta.');
    const ok = b.code !== undefined ? digitsOf(b.code) === TWO_FACTOR_CODE : recoveryMatch(u, b.recoveryCode) !== null;
    if (!ok) throw wrongCode(b.code !== undefined ? 'code' : 'recoveryCode');
    delete u.twoFactor;
    return { status: 204 };
  }

  function twoFactorRegenerate(body) {
    const u = requireAuth();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['password', 'code'], issues);
    checkPassword(b, issues);
    if (!goodTotp(b.code)) issues.add('code', 'Digite os 6 números do aplicativo.');
    issues.throwIfAny();
    if (u.password !== b.password) throw Errors.validation([{ field: 'password', message: 'Senha incorreta.' }]);
    if (!u.twoFactor?.enabled) throw new HttpError(409, 'two_factor_not_enabled', 'A verificação em duas etapas não está ativa nesta conta.');
    if (digitsOf(b.code) !== TWO_FACTOR_CODE) throw wrongCode();
    u.twoFactor.recovery = freshRecovery();
    return { status: 200, body: { recoveryCodes: [...TWO_FACTOR_RECOVERY] } };
  }

  /** Segundo passo do login (público): o desafio é de uso único, vale 5 minutos e aceita 5 tentativas. */
  function twoFactorLogin(body) {
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['challenge', 'code', 'recoveryCode'], issues);
    if (typeof b.challenge !== 'string' || b.challenge.length < 20 || b.challenge.length > 100) issues.add('challenge', 'Verificação inválida.');
    if ((b.code === undefined) === (b.recoveryCode === undefined)) issues.add('code', 'Informe o código.');
    else if (b.code !== undefined && !goodTotp(b.code)) issues.add('code', 'Digite os 6 números do aplicativo.');
    else if (b.recoveryCode !== undefined && !goodRecovery(b.recoveryCode)) issues.add('recoveryCode', 'Digite o código de recuperação completo (10 letras e números).');
    issues.throwIfAny();
    const expired = () => new HttpError(401, 'two_factor_expired', 'A verificação expirou. Entre de novo com o seu e-mail e a sua senha.');
    const entry = challenges.get(b.challenge);
    if (!entry || entry.expiresAt <= clock().getTime() || entry.attempts >= 5) throw expired();
    entry.attempts += 1;
    const u = findUser(entry.userId);
    if (!u || !u.active || u.manuallyBlocked || !u.twoFactor?.enabled) throw expired();
    const recoveryHit = b.recoveryCode !== undefined ? recoveryMatch(u, b.recoveryCode) : null;
    if (b.code !== undefined ? digitsOf(b.code) !== TWO_FACTOR_CODE : !recoveryHit) {
      const left = 5 - entry.attempts;
      if (left <= 0) {
        challenges.delete(b.challenge);
        throw expired();
      }
      const field = b.code !== undefined ? 'code' : 'recoveryCode';
      const message = `${field === 'code' ? 'Código incorreto' : 'Código de recuperação incorreto'}. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`}.`;
      throw new HttpError(401, 'invalid_two_factor_code', message, [{ field, message }]);
    }
    challenges.delete(b.challenge);
    if (recoveryHit) recoveryHit.used = true;
    u.lastLoginAt = stamp();
    saveSession({ userId: u.id, sessionId: newId(), startedAt: u.lastLoginAt });
    return { status: 200, body: { user: sessionUser(u) } };
  }

  /** A mentora proprietária desativa o 2FA de uma aluna dela (perdeu o aparelho e os códigos). */
  function twoFactorReset(id, body) {
    requireAuth('admin');
    const issues = createIssues();
    onlyKeys(requireBody(body ?? {}), [], issues);
    issues.throwIfAny();
    const student = UUID.test(String(id)) ? db.users.find((x) => x.id === id && x.role === 'user') : null;
    if (!student) throw Errors.notFound('Aluna não encontrada.');
    if (!student.twoFactor?.enabled) throw new HttpError(409, 'two_factor_not_enabled', 'Esta aluna não usa a verificação em duas etapas.');
    delete student.twoFactor;
    student.twoFactorResetAt = stamp();
    if (session?.userId === student.id) saveSession(null);
    return { status: 204 };
  }

  function changePassword(body) {
    const u = requireAuth();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['currentPassword', 'newPassword'], issues);
    if (typeof b.currentPassword !== 'string' || b.currentPassword === '') issues.add('currentPassword', 'Informe a senha atual.');
    if (typeof b.newPassword !== 'string' || b.newPassword === '') issues.add('newPassword', 'Informe a nova senha.');
    else if (b.newPassword.length > 128) issues.add('newPassword', 'A senha pode ter no máximo 128 caracteres.');
    issues.throwIfAny();
    if (u.password !== b.currentPassword) throw Errors.validation([{ field: 'currentPassword', message: 'Senha atual incorreta.' }]);
    const policyError = validatePasswordPolicy(b.newPassword, u.email);
    if (policyError) throw Errors.validation([{ field: 'newPassword', message: policyError }]);
    if (b.newPassword === b.currentPassword) {
      throw Errors.validation([{ field: 'newPassword', message: 'A nova senha precisa ser diferente da atual.' }]);
    }
    // As duas contas de demonstração mantêm a senha publicada (os botões da faixa dependem dela).
    if (u.email !== MENTORA_EMAIL && u.email !== STUDENT_EMAIL) u.password = b.newPassword;
    u.passwordChangedAt = stamp();
    return { status: 204 };
  }

  // ---- conta própria

  const profileDto = (u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    phone: u.phone,
    createdAt: u.createdAt,
    passwordChangedAt: u.passwordChangedAt ?? null,
    // Na demonstração a foto é a própria data URL (não há servidor para servir o arquivo).
    avatarUrl: u.avatarData ?? null,
  });

  function getProfile() {
    return profileDto(requireAuth());
  }

  function patchProfile(body) {
    const u = requireAuth();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['name', 'phone'], issues);
    const name = b.name === undefined ? undefined : readName(b.name, 'Informe o seu nome.', issues);
    const phone = readPhone(b.phone, issues);
    if (b.name === undefined && b.phone === undefined) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    if (name !== undefined) u.name = name;
    if (phone !== undefined) u.phone = phone;
    return profileDto(u);
  }

  // ---- preferências, sessões, foto, origens de lead e mentoria

  const prefsOf = (u) => ({
    ...structuredClone(DEFAULT_PREFERENCES),
    ...(db.preferences[u.id] ?? {}),
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...(db.preferences[u.id]?.notifications ?? {}) },
  });

  function getPreferences(searchParams) {
    const u = requireAuth();
    readQuery(searchParams, {}, {});
    return { status: 200, body: prefsOf(u) };
  }

  function patchPreferences(body) {
    const u = requireAuth();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['timezone', 'homePage', 'notifications', 'rankingVisible'], issues);
    if (b.timezone !== undefined && !TIMEZONES.includes(b.timezone)) issues.add('timezone', 'Fuso horário inválido.');
    if (b.homePage !== undefined) {
      if (!HOME_PAGES.includes(b.homePage)) issues.add('homePage', 'Página inicial inválida.');
      else if (u.role !== 'user' && b.homePage === 'deals') issues.add('homePage', 'Esta página inicial não existe para a conta de mentora.');
    }
    if (b.rankingVisible !== undefined) {
      if (typeof b.rankingVisible !== 'boolean') issues.add('rankingVisible', 'Dados inválidos.');
      else if (u.role !== 'user') issues.add('rankingVisible', 'O ranking existe só para as alunas.');
    }
    let notifications;
    if (b.notifications !== undefined) {
      if (!isPlainObject(b.notifications)) issues.add('notifications', 'Dados inválidos.');
      else {
        notifications = {};
        for (const [key, value] of Object.entries(b.notifications)) {
          if (!Object.hasOwn(DEFAULT_PREFERENCES.notifications, key)) issues.add('notifications', `Campo não permitido: ${key}.`);
          else if (typeof value !== 'boolean') issues.add(`notifications.${key}`, 'Dados inválidos.');
          else notifications[key] = value;
        }
      }
    }
    if (b.timezone === undefined && b.homePage === undefined && b.rankingVisible === undefined && !(notifications && Object.keys(notifications).length)) issues.add('', 'Informe ao menos uma preferência para alterar.');
    issues.throwIfAny();
    const current = prefsOf(u);
    db.preferences[u.id] = {
      timezone: b.timezone ?? current.timezone,
      homePage: b.homePage ?? current.homePage,
      notifications: { ...current.notifications, ...notifications },
      rankingVisible: b.rankingVisible ?? current.rankingVisible,
    };
    return { status: 200, body: prefsOf(u) };
  }

  function describeUserAgent(ua) {
    const text = String(ua ?? '').slice(0, 200);
    let device = 'Aparelho desconhecido';
    if (/iPhone/i.test(text)) device = 'iPhone';
    else if (/iPad/i.test(text)) device = 'iPad';
    else if (/Android/i.test(text)) device = 'Android';
    else if (/Windows/i.test(text)) device = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(text)) device = 'Mac';
    else if (/CrOS/i.test(text)) device = 'Chromebook';
    else if (/Linux|X11/i.test(text)) device = 'Linux';
    let browser = 'Navegador';
    if (/Edg(e|A|iOS)?\//i.test(text)) browser = 'Edge';
    else if (/OPR\/|Opera/i.test(text)) browser = 'Opera';
    else if (/Firefox\/|FxiOS/i.test(text)) browser = 'Firefox';
    else if (/Chrome\/|CriOS/i.test(text)) browser = 'Chrome';
    else if (/Safari\//i.test(text)) browser = 'Safari';
    return { device, browser };
  }

  const currentSessionId = () => session?.sessionId ?? 'sessao-atual';
  const othersOf = (u) => (db.otherSessions[u.id] ??= []);

  function listSessions(searchParams) {
    const u = requireAuth();
    readQuery(searchParams, {}, {});
    const now = clock().toISOString();
    const current = {
      id: currentSessionId(),
      current: true,
      ...describeUserAgent(options.userAgent ?? globalThis.navigator?.userAgent),
      createdAt: session?.startedAt ?? now,
      lastSeenAt: now,
    };
    const others = othersOf(u).map((s) => ({ id: s.id, current: false, device: s.device, browser: s.browser, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt }));
    return { status: 200, body: { data: [current, ...others.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1))] } };
  }

  function revokeSession(id) {
    const u = requireAuth();
    if (id === currentSessionId()) throw Errors.conflict('current_session', 'Esta é a sessão atual. Para encerrá-la, use Sair.');
    const list = othersOf(u);
    const index = list.findIndex((s) => s.id === id);
    if (index < 0) throw Errors.notFound('Sessão não encontrada.');
    list.splice(index, 1);
    return { status: 204 };
  }

  function revokeOtherSessions(body) {
    const u = requireAuth();
    const b = requireBody(body ?? {});
    const issues = createIssues();
    onlyKeys(b, [], issues);
    issues.throwIfAny();
    const revoked = othersOf(u).length;
    db.otherSessions[u.id] = [];
    return { status: 200, body: { revoked } };
  }

  function checkAvatar(dataUrl) {
    if (typeof dataUrl !== 'string') return 'Envie a imagem.';
    if (dataUrl.length > AVATAR_MAX_CHARS) return 'A foto é grande demais (máximo 150 KB depois de redimensionada).';
    const match = /^data:image\/(jpeg|webp|png);base64,/.exec(dataUrl);
    if (!match) return 'Use uma imagem PNG, JPEG ou WebP.';
    const payload = dataUrl.slice(match[0].length);
    if (payload.length < 16 || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return 'A imagem está corrompida.';
    let bytes;
    try {
      bytes = Uint8Array.from(atob(payload.slice(0, 64)), (c) => c.charCodeAt(0));
    } catch {
      return 'A imagem está corrompida.';
    }
    const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
    const okMagic =
      (match[1] === 'jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (match[1] === 'png' && bytes[0] === 0x89 && ascii(1, 4) === 'PNG') ||
      (match[1] === 'webp' && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP');
    return okMagic ? null : 'O conteúdo não é uma imagem do tipo informado.';
  }

  function patchAvatar(body) {
    const u = requireAuth();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['dataUrl'], issues);
    issues.throwIfAny();
    const problem = checkAvatar(b.dataUrl);
    if (problem) throw Errors.validation([{ field: 'dataUrl', message: problem }]);
    u.avatarData = b.dataUrl;
    return { status: 200, body: profileDto(u) };
  }

  function deleteAvatar() {
    const u = requireAuth();
    u.avatarData = null;
    return { status: 200, body: profileDto(u) };
  }

  /** Origens da aluna: as salvas ou as 6 padrão. */
  const effectiveSources = (u) => db.leadSources[u.id] ?? DEFAULT_LEAD_SOURCES;
  function allowedSource(u, key, currentKey) {
    if (typeof key !== 'string' || !SOURCE_KEY.test(key)) return false;
    const found = effectiveSources(u).find((s) => s.key === key);
    return Boolean(found && (!found.archived || key === currentKey));
  }

  function getLeadSources(searchParams) {
    const u = requireStudent();
    readQuery(searchParams, {}, {});
    const saved = db.leadSources[u.id];
    return { status: 200, body: { sources: structuredClone(effectiveSources(u)), customized: Boolean(saved) } };
  }

  function putLeadSources(body) {
    const u = requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['sources'], issues);
    if (!Array.isArray(b.sources) || b.sources.length < 1) issues.add('sources', 'Informe as origens.');
    else if (b.sources.length > 30) issues.add('sources', 'Máximo de 30 origens.');
    else {
      const current = effectiveSources(u);
      const known = new Set(current.map((s) => s.key));
      const sent = new Set();
      const labels = new Set();
      b.sources.forEach((s, i) => {
        if (!isPlainObject(s)) return void issues.add(`sources.${i}`, 'Dados inválidos.');
        for (const key of Object.keys(s)) if (!['key', 'label', 'archived'].includes(key)) issues.add(`sources.${i}`, `Campo não permitido: ${key}.`);
        if (s.key !== undefined) {
          if (typeof s.key !== 'string' || !SOURCE_KEY.test(s.key)) issues.add(`sources.${i}.key`, 'Origem inválida.');
          else if (!known.has(s.key)) issues.add(`sources.${i}.key`, 'Origem desconhecida.');
          else if (sent.has(s.key)) issues.add(`sources.${i}.key`, 'Origem repetida.');
          else sent.add(s.key);
        }
        const label = typeof s.label === 'string' ? s.label.trim() : null;
        if (label === null || label === '') issues.add(`sources.${i}.label`, 'Informe o nome da origem.');
        else if ([...label].length > 40) issues.add(`sources.${i}.label`, 'Nome muito longo (máximo 40).');
        else if (CONTROL_CHARS.test(label)) issues.add(`sources.${i}.label`, 'O nome contém caracteres inválidos.');
        else if (labels.has(label.toLocaleLowerCase('pt-BR'))) issues.add(`sources.${i}.label`, 'Cada origem precisa de um nome diferente.');
        else labels.add(label.toLocaleLowerCase('pt-BR'));
        if (typeof s.archived !== 'boolean') issues.add(`sources.${i}.archived`, 'Informe se a origem está arquivada.');
      });
      if (current.some((s) => !sent.has(s.key))) issues.add('sources', 'Envie todas as origens existentes (origens não são apagadas, só arquivadas).');
      if (b.sources.every((s) => s?.archived === true)) issues.add('sources', 'Deixe ao menos uma origem ativa.');
    }
    issues.throwIfAny();
    let next = effectiveSources(u).reduce((max, s) => {
      const found = /^custom_(\d+)$/.exec(s.key);
      return found ? Math.max(max, Number(found[1])) : max;
    }, 0);
    db.leadSources[u.id] = b.sources.map((s, index) => ({ key: s.key ?? `custom_${++next}`, label: s.label.trim(), archived: s.archived, position: index + 1 }));
    return getLeadSources(new URLSearchParams());
  }

  const mentoriaPublic = () => ({ name: db.mentoria.name ?? null, welcomeMessage: db.mentoria.welcomeMessage ?? null });

  function readMentoriaSettings(searchParams) {
    requireAuth('admin');
    readQuery(searchParams, {}, {});
    return { status: 200, body: { ...db.mentoria, accessUrl: options.baseUrl ?? globalThis.location?.origin ?? 'https://demo.local' } };
  }

  function patchMentoriaSettings(body) {
    requireAuth('admin');
    const b = requireBody(body);
    const issues = createIssues();
    const FIELDS = ['name', 'welcomeMessage', 'defaultClassName', 'defaultProgram', 'defaultPlan'];
    onlyKeys(b, FIELDS, issues);
    const patch = {};
    const text = (field, max, tooLong, multiline = false) => {
      if (b[field] === undefined) return;
      if (b[field] === null) return void (patch[field] = null);
      if (typeof b[field] !== 'string') return void issues.add(field, 'Dados inválidos.');
      const s = b[field].trim();
      if ([...s].length > max) return void issues.add(field, tooLong);
      if ((multiline ? MULTILINE_CONTROL_CHARS : CONTROL_CHARS).test(s)) return void issues.add(field, 'O texto contém caracteres inválidos.');
      patch[field] = s === '' ? null : s;
    };
    text('name', 80, 'O nome é longo demais (máximo 80).');
    text('welcomeMessage', 500, 'A mensagem é longa demais (máximo 500).', true);
    text('defaultClassName', 80, 'Turma longa demais (máximo 80).');
    text('defaultProgram', 120, 'Programa longo demais (máximo 120).');
    text('defaultPlan', 80, 'Plano longo demais (máximo 80).');
    if (!FIELDS.some((k) => b[k] !== undefined)) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    db.mentoria = { ...db.mentoria, ...patch };
    return readMentoriaSettings(new URLSearchParams());
  }

  // ---- produtos

  const PRODUCT_QUERY = {
    q: 'text',
    archived: { enum: ['false', 'true', 'all'] },
    sort: { enum: ['name', 'price', 'created_at'] },
    order: { enum: ['asc', 'desc'] },
    ...PAGING,
  };

  function listProducts(searchParams) {
    const u = requireAuth();
    const query = readQuery(searchParams, PRODUCT_QUERY, { archived: 'false', sort: 'created_at', order: 'desc', ...PAGING_DEFAULTS });
    let rows = mine(db.products, u);
    if (query.archived === 'false') rows = rows.filter((p) => !p.archivedAt);
    if (query.archived === 'true') rows = rows.filter((p) => p.archivedAt);
    if (query.q) rows = rows.filter((p) => fold(p.name).includes(fold(query.q)));
    const keys = { name: (p) => p.name.toLowerCase(), price: (p) => toCents(p.price), created_at: (p) => p.createdAt };
    rows = sortRows(rows, keys[query.sort], query.order, query.sort === 'name' ? { compare: byText } : {});
    const result = paginate(rows, query);
    return { status: 200, body: { ...result, data: result.data.map(productDto) } };
  }

  function createProduct(body) {
    const u = requireAuth();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['name', 'price'], issues);
    const name = readName(b.name, 'Informe o nome do produto.', issues);
    const price = readMoney(b.price, issues, 'price');
    issues.throwIfAny();
    const at = stamp();
    const row = { id: newId(), ownerId: u.id, name, price, archivedAt: null, createdAt: at, updatedAt: at, version: 1 };
    db.products.push(row);
    return { status: 201, body: productDto(row) };
  }

  function findOwned(list, owner, id, message) {
    if (!UUID.test(id)) throw Errors.notFound(message);
    return list.find((row) => row.id === id && row.ownerId === owner.id) ?? null;
  }

  function getProduct(id) {
    const u = requireAuth();
    const row = findOwned(db.products, u, id, 'Produto não encontrado.');
    if (!row) throw Errors.notFound('Produto não encontrado.');
    return { status: 200, body: productDto(row) };
  }

  function patchProduct(id, body) {
    const u = requireAuth();
    if (!UUID.test(id)) throw Errors.notFound('Produto não encontrado.');
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['name', 'price', 'archived', 'version'], issues);
    const name = b.name === undefined ? undefined : readName(b.name, 'Informe o nome do produto.', issues);
    const price = b.price === undefined ? undefined : readMoney(b.price, issues, 'price');
    if (b.archived !== undefined && typeof b.archived !== 'boolean') issues.add('archived', 'Dados inválidos.');
    const version = readVersion(b.version, issues);
    if (b.name === undefined && b.price === undefined && b.archived === undefined) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();

    const row = findOwned(db.products, u, id, 'Produto não encontrado.');
    if (!row) throw Errors.notFound('Produto não encontrado.');
    if (row.version !== version) {
      throw Errors.conflict('version_conflict', 'Este produto foi alterado em outra aba ou outro dispositivo. Recarregue a lista e tente de novo.');
    }
    const next = { ...row, version: row.version + 1, updatedAt: stamp() };
    if (name !== undefined) next.name = name;
    if (price !== undefined) next.price = price;
    if (b.archived === true) next.archivedAt = row.archivedAt ?? next.updatedAt;
    if (b.archived === false) next.archivedAt = null;
    return { status: 200, body: productDto(replaceRow(db.products, id, next)) };
  }

  function archiveProduct(id) {
    const u = requireAuth();
    const row = findOwned(db.products, u, id, 'Produto não encontrado.');
    if (!row) throw Errors.notFound('Produto não encontrado.');
    if (!row.archivedAt) {
      const at = stamp();
      replaceRow(db.products, id, { ...row, archivedAt: at, version: row.version + 1, updatedAt: at });
    }
    return { status: 204 };
  }

  // ---- Central Comercial: contatos (/people), funis, oportunidades, linha do tempo e visão geral ficam em mock-commercial.js.

  // ---- empresas (dados de negócio da aluna; a mentora recebe 403 em todas as rotas, como no servidor)

  const SEGMENTS = ['consulting', 'strategy', 'digital_marketing', 'health', 'education', 'architecture', 'law', 'finance', 'retail', 'technology', 'beauty', 'food', 'industry', 'services', 'other'];
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  const COMPANY_VERSION_CONFLICT = 'Esta empresa foi alterada em outra aba ou outro dispositivo. Recarregue a lista e tente de novo.';
  const isOpen = (deal) => deal.stage === 'open'; // `stage` guarda só o resultado (open | won | lost), como no banco

  /** Números calculados das Pessoas vinculadas e das Oportunidades delas (mesmas regras do servidor). */
  function companyDto(u, company) {
    const people = mine(db.people, u).filter((p) => p.companyId === company.id);
    const ids = new Set(people.map((p) => p.id));
    const deals = mine(db.deals, u).filter((d) => ids.has(d.personId));
    const open = deals.filter(isOpen);
    const stamps = [company.updatedAt, ...people.map((p) => p.updatedAt), ...deals.map((d) => d.updatedAt)];
    return {
      ...withoutOwner(company),
      contactsCount: people.length,
      openDealsCount: open.length,
      pipelineValue: fromCents(open.reduce((n, d) => n + toCents(d.value), 0)),
      lastActivityAt: stamps.reduce((a, b) => (a > b ? a : b)),
    };
  }

  function companySummary(u) {
    const all = mine(db.companies, u).map((c) => companyDto(u, c));
    const top = [...all].sort((a, b) => toCents(b.pipelineValue) - toCents(a.pipelineValue) || byText(a.name, b.name) || (a.id < b.id ? -1 : 1))[0];
    return {
      total: all.length,
      active: all.filter((c) => c.openDealsCount > 0).length,
      pipelineValue: fromCents(all.reduce((n, c) => n + toCents(c.pipelineValue), 0)),
      top: top && top.openDealsCount > 0 ? { id: top.id, name: top.name, pipelineValue: top.pipelineValue, openDealsCount: top.openDealsCount } : null,
    };
  }

  const COMPANY_QUERY = {
    q: 'text',
    segment: { enum: SEGMENTS, message: 'Segmento inválido.' },
    sort: { enum: ['name', 'pipeline', 'last_activity'] },
    order: { enum: ['asc', 'desc'] },
    ...PAGING,
  };

  function listCompanies(searchParams) {
    const u = requireStudent();
    const query = readQuery(searchParams, COMPANY_QUERY, { sort: 'name', ...PAGING_DEFAULTS });
    const order = query.order ?? (query.sort === 'name' ? 'asc' : 'desc');
    let rows = mine(db.companies, u).map((c) => companyDto(u, c));
    if (query.segment) rows = rows.filter((c) => c.segment === query.segment);
    if (query.q) {
      const text = fold(query.q);
      rows = rows.filter((c) => fold(c.name).includes(text) || fold(c.city ?? '').includes(text));
    }
    const keys = { name: (c) => c.name.toLowerCase(), pipeline: (c) => toCents(c.pipelineValue), last_activity: (c) => c.lastActivityAt };
    rows = sortRows(rows, keys[query.sort], order, query.sort === 'name' ? { compare: byText } : {});
    const result = paginate(rows, { ...query, limit: query.limit, offset: query.offset });
    return { status: 200, body: { ...result, summary: companySummary(u) } };
  }

  function duplicateCompany() {
    const message = 'Já existe uma empresa com esse nome.';
    return Errors.conflict('duplicate_company_name', message, [{ field: 'name', message }]);
  }

  const isDuplicateName = (u, name, exceptId) => mine(db.companies, u).some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === name.trim().toLowerCase());

  function readCompanyNotes(value, issues) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return void issues.add('notes', 'Dados inválidos.');
    const s = value.trim();
    if (s.length > 1000) return void issues.add('notes', 'Observações muito longas (máximo 1000).');
    if (MULTILINE_CONTROL_CHARS.test(s)) return void issues.add('notes', 'As observações contêm caracteres inválidos.');
    return s === '' ? null : s;
  }

  /** Campos de criação/edição. `patch`: ausente continua ausente. */
  function readCompanyFields(b, issues, { patch }) {
    const out = {};
    if (b.name !== undefined || !patch) out.name = readName(b.name, 'Informe o nome da empresa.', issues);
    if (b.segment !== undefined) {
      if (b.segment !== null && !SEGMENTS.includes(b.segment)) issues.add('segment', 'Segmento inválido.');
      else out.segment = b.segment;
    } else if (!patch) out.segment = null;
    const city = readOptional(b.city, 'city', 80, 'Cidade muito longa (máximo 80).', issues);
    if (city !== undefined) out.city = city;
    else if (!patch) out.city = null;
    if (b.state !== undefined) {
      if (b.state === null) out.state = null;
      else if (typeof b.state !== 'string') issues.add('state', 'Dados inválidos.');
      else {
        const uf = b.state.trim().toUpperCase();
        if (uf === '') out.state = null;
        else if (!UFS.includes(uf)) issues.add('state', 'UF inválida.');
        else out.state = uf;
      }
    } else if (!patch) out.state = null;
    const website = readOptional(b.website, 'website', 200, 'Endereço muito longo (máximo 200).', issues, {
      test: (s) => !/\s/.test(s) && isHttpsUrl(s) && new URL(s).hostname.includes('.'),
      message: 'Informe o site começando com https://, por exemplo https://empresa.com.br.',
    });
    if (website !== undefined) out.website = website;
    else if (!patch) out.website = null;
    const notes = readCompanyNotes(b.notes, issues);
    if (notes !== undefined) out.notes = notes;
    else if (!patch) out.notes = null;
    return out;
  }

  function createCompany(body) {
    const u = requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['name', 'segment', 'city', 'state', 'website', 'notes'], issues);
    const fields = readCompanyFields(b, issues, { patch: false });
    issues.throwIfAny();
    if (isDuplicateName(u, fields.name)) throw duplicateCompany();
    const at = stamp();
    const row = { id: newId(), ownerId: u.id, ...fields, version: 1, createdAt: at, updatedAt: at };
    db.companies.push(row);
    return { status: 201, body: companyDto(u, row) };
  }

  function findCompany(u, id) {
    const row = findOwned(db.companies, u, id, 'Empresa não encontrada.');
    if (!row) throw Errors.notFound('Empresa não encontrada.');
    return row;
  }

  function getCompany(id) {
    const u = requireStudent();
    const row = findCompany(u, id);
    const people = mine(db.people, u).filter((p) => p.companyId === row.id);
    const ids = new Set(people.map((p) => p.id));
    const deals = mine(db.deals, u).filter((d) => ids.has(d.personId));
    const names = new Map(people.map((p) => [p.id, p.name]));
    return {
      status: 200,
      body: {
        ...companyDto(u, row),
        people: sortRows(people, (p) => p.name.toLowerCase(), 'asc', { compare: byText })
          .slice(0, 200)
          .map((p) => ({
            id: p.id,
            name: p.name,
            whatsapp: p.whatsapp,
            email: p.email,
            openDealsCount: deals.filter((d) => d.personId === p.id && isOpen(d)).length,
          })),
        deals: [...deals]
          .sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? -1 : 1))
          .slice(0, 200)
          .map((d) => ({
            id: d.id, personId: d.personId, personName: names.get(d.personId), value: d.value, stage: d.stage, temperature: d.temperature, updatedAt: d.updatedAt,
            funnelName: db.funnels.find((f) => f.id === d.funnelId)?.name ?? null, stageName: db.funnelStages.find((st) => st.id === d.stageId)?.name ?? null,
          })),
      },
    };
  }

  function patchCompany(id, body) {
    const u = requireStudent();
    if (!UUID.test(id)) throw Errors.notFound('Empresa não encontrada.');
    const b = requireBody(body);
    const issues = createIssues();
    const FIELDS = ['name', 'segment', 'city', 'state', 'website', 'notes'];
    onlyKeys(b, [...FIELDS, 'version'], issues);
    const patch = readCompanyFields(b, issues, { patch: true });
    const version = readVersion(b.version, issues);
    if (!FIELDS.some((k) => b[k] !== undefined)) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();
    const row = findCompany(u, id);
    if (row.version !== version) throw Errors.conflict('version_conflict', COMPANY_VERSION_CONFLICT);
    if (patch.name !== undefined && isDuplicateName(u, patch.name, id)) throw duplicateCompany();
    const next = replaceRow(db.companies, id, { ...row, ...patch, version: row.version + 1, updatedAt: stamp() });
    return { status: 200, body: companyDto(u, next) };
  }

  function deleteCompany(id) {
    const u = requireStudent();
    const row = findCompany(u, id);
    db.companies = db.companies.filter((c) => c.id !== row.id);
    db.people = db.people.map((p) => (p.companyId === row.id ? { ...p, companyId: null } : p)); // ON DELETE SET NULL
    return { status: 204 };
  }

  // ---- tarefas (dados de negócio da aluna; a mentora recebe 403 em todas as rotas, como no servidor)

  const TASK_PRIORITIES = ['low', 'medium', 'high'];
  const TASK_STATUSES = ['open', 'done'];
  const TASK_KINDS = ['task', 'call', 'meeting', 'followup', 'deadline'];
  const TASK_VIEWS = ['today', 'upcoming', 'overdue', 'done', 'all'];
  const TASK_MIN_DATE = Date.UTC(2000, 0, 1);
  const TASK_MAX_DATE = Date.UTC(2100, 0, 1);
  const NOTES_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
  const taskDto = withoutOwner;

  const TASK_QUERY = {
    view: { enum: TASK_VIEWS, message: 'Visão inválida.' },
    q: 'text',
    personId: 'uuid',
    dealId: 'uuid',
    from: 'iso',
    to: 'iso',
    tzOffset: { int: [-840, 840] },
    sort: { enum: ['due', 'priority', 'created'] },
    order: { enum: ['asc', 'desc'] },
    limit: { int: [1, 200] },
    offset: { int: [0, 1_000_000] },
  };

  function requireStudent() {
    const u = requireAuth();
    // O CRM é só da aluna: a mentora e a equipe levam 403.
    if (u.role !== 'user') throw Errors.forbidden();
    return u;
  }

  /** Dia local da aluna a partir do deslocamento (mesma conta do servidor: server/src/services/task-time.ts). */
  function taskDayWindow(tzOffset) {
    const localNow = clock().getTime() - tzOffset * 60_000;
    const localMidnight = Math.floor(localNow / DAY) * DAY;
    const start = localMidnight + tzOffset * 60_000;
    return { start, end: start + DAY, weekStart: start - 6 * DAY };
  }

  /** Aceita só instantes ISO com fuso (como z.iso.datetime({ offset: true })). */
  function readInstant(value, field, message, issues) {
    if (typeof value !== 'string' || !ISO_INSTANT.test(value)) {
      return void issues.add(field, message);
    }
    const ms = Date.parse(value);
    if (Number.isNaN(ms) || ms < TASK_MIN_DATE || ms >= TASK_MAX_DATE) return void issues.add(field, message);
    return new Date(ms).toISOString();
  }

  function readTaskTitle(value, issues) {
    if (typeof value !== 'string' || value.trim() === '') return void issues.add('title', 'Informe o título da tarefa.');
    const s = value.trim();
    if (s.length > 120) return void issues.add('title', 'Título muito longo (máximo 120).');
    if (CONTROL_CHARS.test(s)) return void issues.add('title', 'O título contém caracteres inválidos.');
    return s;
  }

  function readTaskNotes(value, issues) {
    if (value === null) return null;
    if (typeof value !== 'string') return void issues.add('notes', 'Dados inválidos.');
    const s = value.trim();
    if (s.length > 1000) return void issues.add('notes', 'Anotações muito longas (máximo 1000).');
    if (NOTES_CONTROL_CHARS.test(s)) return void issues.add('notes', 'As anotações contêm caracteres inválidos.');
    return s === '' ? null : s;
  }

  function readEnum(value, list, field, message, issues) {
    if (!list.includes(value)) return void issues.add(field, message);
    return value;
  }

  function readUuid(value, field, issues) {
    if (typeof value !== 'string' || !UUID.test(value)) return void issues.add(field, 'Identificador inválido.');
    return value;
  }

  function readNullableUuid(value, field, issues) {
    if (value === null) return null;
    return readUuid(value, field, issues);
  }

  /** Vínculos só com Pessoa/Oportunidade da própria aluna (400 no campo, sem dizer se existe de outra). */
  function assertTaskLinks(u, personId, dealId) {
    if (personId && !mine(db.people, u).some((p) => p.id === personId)) throw Errors.validation([{ field: 'personId', message: 'Pessoa não encontrada.' }]);
    if (dealId && !mine(db.deals, u).some((d) => d.id === dealId)) throw Errors.validation([{ field: 'dealId', message: 'Oportunidade não encontrada.' }]);
  }

  function taskListItem(u, task) {
    const person = task.personId ? db.people.find((p) => p.id === task.personId && p.ownerId === u.id) : null;
    const deal = task.dealId ? db.deals.find((d) => d.id === task.dealId && d.ownerId === u.id) : null;
    const dealPerson = deal ? db.people.find((p) => p.id === deal.personId && p.ownerId === u.id) : null;
    return { ...taskDto(task), personName: person?.name ?? null, dealPersonName: dealPerson?.name ?? null };
  }

  const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  function listTasks(searchParams) {
    const u = requireStudent();
    const query = readQuery(searchParams, TASK_QUERY, { view: 'all', tzOffset: 0, order: 'asc', limit: 50, offset: 0 });
    if (query.from && query.to && Date.parse(query.from) >= Date.parse(query.to)) {
      throw Errors.validation([{ field: 'to', message: 'O período é inválido.' }]);
    }
    const { start, end } = taskDayWindow(query.tzOffset);
    const due = (t) => (t.dueAt ? Date.parse(t.dueAt) : null);
    let rows = mine(db.tasks, u);
    if (query.view === 'today') rows = rows.filter((t) => due(t) !== null && due(t) >= start && due(t) < end);
    else if (query.view === 'overdue') rows = rows.filter((t) => t.status === 'open' && due(t) !== null && due(t) < start);
    else if (query.view === 'upcoming') rows = rows.filter((t) => t.status === 'open' && (due(t) === null || due(t) >= end));
    else if (query.view === 'done') rows = rows.filter((t) => t.status === 'done');
    if (query.from) rows = rows.filter((t) => due(t) !== null && due(t) >= Date.parse(query.from));
    if (query.to) rows = rows.filter((t) => due(t) !== null && due(t) < Date.parse(query.to));
    if (query.personId) rows = rows.filter((t) => t.personId === query.personId);
    if (query.dealId) rows = rows.filter((t) => t.dealId === query.dealId);
    let items = rows.map((t) => taskListItem(u, t));
    if (query.q) {
      const text = fold(query.q);
      items = items.filter((t) => fold(t.title).includes(text) || fold(t.personName ?? t.dealPersonName ?? '').includes(text));
    }
    const dir = query.order === 'desc' ? -1 : 1;
    const byDue = (a, b) => {
      const x = a.dueAt ? Date.parse(a.dueAt) : null;
      const y = b.dueAt ? Date.parse(b.dueAt) : null;
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return x - y;
    };
    const tie = (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
    items.sort((a, b) => {
      if (query.sort === 'priority') return dir * (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || byDue(a, b) || cmp(a.id, b.id);
      if (query.sort === 'created') return dir * cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
      if (query.view === 'done' && !query.sort) return cmp(b.doneAt, a.doneAt) || cmp(a.id, b.id);
      return Number(a.status === 'done') - Number(b.status === 'done') || dir * byDue(a, b) || tie(a, b);
    });
    return { status: 200, body: paginate(items, query) };
  }

  function tasksSummary(searchParams) {
    const u = requireStudent();
    const { tzOffset } = readQuery(searchParams, { tzOffset: { int: [-840, 840] } }, { tzOffset: 0 });
    const { start, end, weekStart } = taskDayWindow(tzOffset);
    const rows = mine(db.tasks, u);
    const due = (t) => (t.dueAt ? Date.parse(t.dueAt) : null);
    const open = rows.filter((t) => t.status === 'open');
    const done = rows.filter((t) => t.status === 'done');
    return {
      status: 200,
      body: {
        today: open.filter((t) => due(t) !== null && due(t) >= start && due(t) < end).length,
        todayDone: done.filter((t) => due(t) !== null && due(t) >= start && due(t) < end).length,
        overdue: open.filter((t) => due(t) !== null && due(t) < start).length,
        upcoming: open.filter((t) => due(t) === null || due(t) >= end).length,
        doneThisWeek: done.filter((t) => Date.parse(t.doneAt) >= weekStart).length,
        doneTotal: done.length,
        openTotal: open.length,
      },
    };
  }

  function createTask(body) {
    const u = requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['title', 'notes', 'dueAt', 'dueAllDay', 'priority', 'kind', 'personId', 'dealId'], issues);
    const title = readTaskTitle(b.title, issues);
    const notes = b.notes === undefined ? null : readTaskNotes(b.notes, issues);
    const dueAt = b.dueAt === undefined || b.dueAt === null ? null : readInstant(b.dueAt, 'dueAt', 'Informe um prazo válido.', issues);
    let dueAllDay = false;
    if (b.dueAllDay !== undefined) {
      if (typeof b.dueAllDay !== 'boolean') issues.add('dueAllDay', 'Dados inválidos.');
      else dueAllDay = b.dueAllDay;
    }
    const priority = b.priority === undefined ? 'medium' : readEnum(b.priority, TASK_PRIORITIES, 'priority', 'Prioridade inválida.', issues);
    const kind = b.kind === undefined ? 'task' : readEnum(b.kind, TASK_KINDS, 'kind', 'Tipo inválido.', issues);
    const personId = b.personId === undefined ? null : readNullableUuid(b.personId, 'personId', issues);
    const dealId = b.dealId === undefined ? null : readNullableUuid(b.dealId, 'dealId', issues);
    if (dueAllDay && b.dueAt == null) issues.add('dueAt', 'Informe o dia do prazo.');
    issues.throwIfAny();
    assertTaskLinks(u, personId, dealId);
    const at = stamp();
    const row = {
      id: newId(), ownerId: u.id, title, notes, dueAt, dueAllDay, priority, status: 'open', doneAt: null, kind,
      personId, dealId, version: 1, createdAt: at, updatedAt: at,
    };
    db.tasks.push(row);
    return { status: 201, body: taskDto(row) };
  }

  function getTask(id) {
    const u = requireStudent();
    const row = findOwned(db.tasks, u, id, 'Tarefa não encontrada.');
    if (!row) throw Errors.notFound('Tarefa não encontrada.');
    return { status: 200, body: taskDto(row) };
  }

  function patchTask(id, body) {
    const u = requireStudent();
    if (!UUID.test(id)) throw Errors.notFound('Tarefa não encontrada.');
    const b = requireBody(body);
    const issues = createIssues();
    const FIELDS = ['title', 'notes', 'dueAt', 'dueAllDay', 'priority', 'kind', 'status', 'personId', 'dealId'];
    onlyKeys(b, [...FIELDS, 'version'], issues);
    const patch = {};
    if (b.title !== undefined) patch.title = readTaskTitle(b.title, issues);
    if (b.notes !== undefined) patch.notes = readTaskNotes(b.notes, issues);
    if (b.dueAt !== undefined) patch.dueAt = b.dueAt === null ? null : readInstant(b.dueAt, 'dueAt', 'Informe um prazo válido.', issues);
    if (b.dueAllDay !== undefined) {
      if (typeof b.dueAllDay !== 'boolean') issues.add('dueAllDay', 'Dados inválidos.');
      else patch.dueAllDay = b.dueAllDay;
    }
    if (b.priority !== undefined) patch.priority = readEnum(b.priority, TASK_PRIORITIES, 'priority', 'Prioridade inválida.', issues);
    if (b.kind !== undefined) patch.kind = readEnum(b.kind, TASK_KINDS, 'kind', 'Tipo inválido.', issues);
    if (b.status !== undefined) patch.status = readEnum(b.status, TASK_STATUSES, 'status', 'Situação inválida.', issues);
    if (b.personId !== undefined) patch.personId = readNullableUuid(b.personId, 'personId', issues);
    if (b.dealId !== undefined) patch.dealId = readNullableUuid(b.dealId, 'dealId', issues);
    const version = readVersion(b.version, issues);
    if (!FIELDS.some((k) => b[k] !== undefined)) issues.add('', 'Informe ao menos um campo para alterar.');
    issues.throwIfAny();

    const row = findOwned(db.tasks, u, id, 'Tarefa não encontrada.');
    if (!row) throw Errors.notFound('Tarefa não encontrada.');
    if (row.version !== version) {
      throw Errors.conflict('version_conflict', 'Esta tarefa foi alterada em outra aba ou outro dispositivo. Recarregue a lista e tente de novo.');
    }
    const dueAt = patch.dueAt !== undefined ? patch.dueAt : row.dueAt;
    let dueAllDay = patch.dueAllDay !== undefined ? patch.dueAllDay : row.dueAllDay;
    if (dueAt === null) dueAllDay = false;
    if (patch.dueAllDay === true && dueAt === null) throw Errors.validation([{ field: 'dueAt', message: 'Informe o dia do prazo.' }]);
    assertTaskLinks(u, patch.personId, patch.dealId);
    const next = { ...row, ...patch, dueAt, dueAllDay, version: row.version + 1, updatedAt: stamp() };
    if (patch.status !== undefined && patch.status !== row.status) next.doneAt = patch.status === 'done' ? stamp() : null;
    const saved = taskDto(replaceRow(db.tasks, id, next));
    // +10 XP ao concluir; reabrir e concluir de novo não repete (chave `task:<id>`).
    const xp = patch.status === 'done' && saved.status === 'done' ? awardXp(u, 'task_done', `task:${id}`) : 0;
    return { status: 200, body: withXp(saved, xp) };
  }

  function deleteTask(id) {
    const u = requireStudent();
    const row = findOwned(db.tasks, u, id, 'Tarefa não encontrada.');
    if (!row) throw Errors.notFound('Tarefa não encontrada.');
    db.tasks = db.tasks.filter((t) => t.id !== id);
    return { status: 204 };
  }

  // ---- mentora: painel e alunas

  function mentoraSummary(searchParams) {
    requireAuth('admin');
    readQuery(searchParams, {}, {});
    const students = db.users.filter((u) => u.role === 'user');
    const since = new Date(clock().getTime() - DAY).toISOString();
    const status = new Map(students.map((s) => [s.id, statusOf(s)]));
    return {
      status: 200,
      body: {
        totalStudents: students.length,
        activeStudents: students.filter((s) => status.get(s.id) === 'active').length,
        pendingInvites: students.filter((s) => status.get(s.id) === 'invite_pending').length,
        expiredInvites: students.filter((s) => status.get(s.id) === 'invite_expired').length,
        neverAccessed: students.filter((s) => s.lastLoginAt == null && s.active).length,
        accessedLast24h: students.filter((s) => s.lastLoginAt != null && s.lastLoginAt >= since).length,
      },
    };
  }

  const STUDENT_QUERY = {
    q: 'text',
    status: { enum: STUDENT_STATUSES, message: 'Estado inválido.' },
    sort: { enum: ['name', 'created_at', 'last_login_at'] },
    order: { enum: ['asc', 'desc'] },
    ...PAGING,
  };

  function listStudents(searchParams) {
    requireAuth('admin');
    const query = readQuery(searchParams, STUDENT_QUERY, { sort: 'created_at', order: 'desc', ...PAGING_DEFAULTS });
    let rows = db.users.filter((u) => u.role === 'user').map(studentDto);
    if (query.status) rows = rows.filter((s) => s.status === query.status);
    if (query.q) {
      const text = fold(query.q);
      rows = rows.filter((s) => fold(s.name).includes(text) || s.email.includes(text) || (s.phone ?? '').includes(text));
    }
    const keys = { name: (s) => s.name, created_at: (s) => s.createdAt, last_login_at: (s) => s.lastLoginAt };
    rows = sortRows(rows, keys[query.sort], query.order, query.sort === 'name' ? { compare: byText } : { nullsLast: query.sort === 'last_login_at' });
    return { status: 200, body: paginate(rows, query) };
  }

  function readStudentFields(b, issues, { patch }) {
    const fields = {};
    if (!patch || b.name !== undefined) fields.name = readName(b.name, 'Informe o nome da aluna.', issues);
    fields.phone = readPhone(b.phone, issues);
    fields.className = readOptional(b.className, 'className', 80, 'Turma muito longa (máximo 80).', issues);
    fields.program = readOptional(b.program, 'program', 120, 'Programa muito longo (máximo 120).', issues);
    fields.joinedOn = readOptional(b.joinedOn, 'joinedOn', 10, 'Informe uma data de entrada válida.', issues, {
      test: isRealDate,
      message: 'Informe uma data de entrada válida.',
    });
    fields.endsOn = readOptional(b.endsOn, 'endsOn', 10, 'Informe uma data de término válida.', issues, {
      test: isRealDate,
      message: 'Informe uma data de término válida.',
    });
    fields.plan = readOptional(b.plan, 'plan', 80, 'Plano muito longo (máximo 80).', issues);
    fields.photoUrl = readOptional(b.photoUrl, 'photoUrl', 500, 'Endereço da foto muito longo (máximo 500).', issues, {
      test: isHttpsUrl,
      message: 'A foto precisa ser um endereço https.',
    });
    return fields;
  }

  const DATES_ORDERED = 'A data de término não pode ser anterior à de entrada.';

  function issueInvite(student, reset) {
    const at = stamp();
    const invite = {
      id: newId(),
      userId: student.id,
      token: newToken(),
      status: 'pending',
      expiresAt: new Date(clock().getTime() + INVITE_TTL_MS).toISOString(),
      sentAt: null,
      acceptedAt: null,
      createdAt: at,
      reset,
    };
    db.invites.push(invite);
    return invite;
  }

  function baseUrl() {
    if (options.baseUrl !== undefined && options.baseUrl !== null) return options.baseUrl;
    const loc = globalThis.location;
    return loc ? `${loc.origin}${loc.pathname}` : '';
  }

  const inviteResult = (invite) => ({
    id: invite.id,
    expiresAt: invite.expiresAt,
    sentAt: invite.sentAt,
    acceptUrl: `${baseUrl()}#/convite/${invite.token}`,
  });

  function cancelPending(userId) {
    let n = 0;
    for (const invite of db.invites) {
      if (invite.userId === userId && invite.status === 'pending') {
        invite.status = 'cancelled';
        n++;
      }
    }
    return n;
  }

  function createStudent(body) {
    requireAuth('admin');
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['name', 'email', 'phone', 'className', 'program', 'joinedOn', 'endsOn', 'plan', 'photoUrl', 'sendAccess'], issues);
    const fields = readStudentFields(b, issues, { patch: false });
    let email;
    if (typeof b.email !== 'string' || b.email.trim().length < 3) issues.add('email', 'Informe o e-mail.');
    else {
      const e = b.email.trim();
      if (e.length > 254) issues.add('email', 'E-mail muito longo.');
      else if (CONTROL_CHARS.test(e)) issues.add('email', 'O e-mail contém caracteres inválidos.');
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) issues.add('email', 'Informe um e-mail válido.');
      else email = e.toLowerCase();
    }
    let sendAccess = false;
    if (b.sendAccess !== undefined) {
      if (typeof b.sendAccess !== 'boolean') issues.add('sendAccess', 'Dados inválidos.');
      else sendAccess = b.sendAccess;
    }
    if (fields.joinedOn && fields.endsOn && fields.endsOn < fields.joinedOn) issues.add('endsOn', DATES_ORDERED);
    issues.throwIfAny();
    if (db.users.some((u) => u.email.toLowerCase() === email)) throw Errors.conflict('email_taken', 'Já existe uma conta com esse e-mail.');

    const row = {
      id: newId(),
      role: 'user',
      email,
      photoUrl: null,
      className: null,
      program: null,
      joinedOn: null,
      endsOn: null,
      plan: null,
      phone: null,
      active: true,
      manuallyBlocked: false,
      lastLoginAt: null,
      passwordResetAt: null,
      password: null,
      createdAt: stamp(),
    };
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) row[key] = value;
    db.users.push(row);
    const invite = sendAccess ? issueInvite(row, false) : null;
    return { status: 201, body: { student: studentDto(row), invite: invite ? inviteResult(invite) : null } };
  }

  function findStudent(id) {
    const row = UUID.test(id) ? db.users.find((u) => u.id === id && u.role === 'user') : null;
    if (!row) throw Errors.notFound('Aluna não encontrada.');
    return row;
  }

  const inviteView = (invite) => ({
    id: invite.id,
    status: invite.status === 'pending' && invite.expiresAt < clock().toISOString() ? 'expired' : invite.status,
    expiresAt: invite.expiresAt,
    sentAt: invite.sentAt,
    acceptedAt: invite.acceptedAt,
    createdAt: invite.createdAt,
  });

  function getStudent(id) {
    requireAuth('admin');
    const row = findStudent(id);
    const invites = invitesOf(row.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return { status: 200, body: { student: studentDto(row), invites: invites.map(inviteView), twoFactorEnabled: Boolean(row.twoFactor?.enabled) } };
  }

  function patchStudent(id, body) {
    requireAuth('admin');
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['name', 'phone', 'className', 'program', 'joinedOn', 'endsOn', 'plan', 'photoUrl'], issues);
    const fields = readStudentFields(b, issues, { patch: true });
    if (!Object.values(fields).some((v) => v !== undefined) && !issues.list.length) issues.add('', 'Informe ao menos um campo para alterar.');
    if (fields.joinedOn && fields.endsOn && fields.endsOn < fields.joinedOn) issues.add('endsOn', DATES_ORDERED);
    issues.throwIfAny();
    const row = findStudent(id);
    const next = { ...row };
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) next[key] = value;
    if (next.joinedOn && next.endsOn && next.endsOn < next.joinedOn) throw Errors.validation([{ field: 'endsOn', message: DATES_ORDERED }]);
    Object.assign(row, next);
    return { status: 200, body: studentDto(row) };
  }

  function transitionStudent(id, body) {
    requireAuth('admin');
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['action'], issues);
    if (!['block', 'unblock', 'deactivate', 'reactivate'].includes(b.action)) issues.add('action', 'Ação inválida.');
    issues.throwIfAny();
    const s = findStudent(id);
    const rules = {
      block: { ok: s.active && !s.manuallyBlocked, apply: () => (s.manuallyBlocked = true), revoke: true },
      unblock: { ok: s.manuallyBlocked, apply: () => (s.manuallyBlocked = false), revoke: false },
      deactivate: { ok: s.active, apply: () => (s.active = false), revoke: true },
      reactivate: { ok: !s.active, apply: () => (s.active = true), revoke: false },
    };
    const rule = rules[b.action];
    if (!rule.ok) throw Errors.conflict('invalid_transition', 'Esta ação não vale para o estado atual da aluna.');
    rule.apply();
    if (rule.revoke) {
      cancelPending(s.id);
      if (session?.userId === s.id) saveSession(null);
    }
    return { status: 200, body: studentDto(s) };
  }

  function resendInvite(id, body) {
    requireAuth('admin');
    const b = requireBody(body ?? {});
    if (Object.keys(b).length) throw Errors.validation([{ field: '', message: `Campo não permitido: ${Object.keys(b)[0]}.` }]);
    const s = findStudent(id);
    if (!s.active || s.manuallyBlocked) {
      throw Errors.conflict('invite_not_allowed', 'Só é possível gerar um link para uma aluna ativa e não bloqueada.');
    }
    const activated = Boolean(s.lastLoginAt) || invitesOf(s.id).some((i) => i.status === 'accepted');
    cancelPending(s.id);
    const invite = issueInvite(s, activated);
    return { status: 200, body: { student: studentDto(s), invite: inviteResult(invite) } };
  }

  function cancelInvite(id, body) {
    requireAuth('admin');
    const b = requireBody(body ?? {});
    if (Object.keys(b).length) throw Errors.validation([{ field: '', message: `Campo não permitido: ${Object.keys(b)[0]}.` }]);
    const s = findStudent(id);
    if (cancelPending(s.id) === 0) throw Errors.conflict('invite_not_allowed', 'Não há convite pendente para cancelar.');
    return { status: 200, body: studentDto(s) };
  }

  // ---- convites (públicos)

  function readToken(body) {
    const b = requireBody(body);
    const issues = createIssues();
    if (typeof b.token !== 'string' || b.token.length < 20 || b.token.length > 200) issues.add('token', 'Link inválido.');
    return { b, issues };
  }

  function usableInvite(token) {
    const invite = db.invites.find((i) => i.token === token);
    const user = invite ? findUser(invite.userId) : null;
    if (!invite || !user || (user.role !== 'user' && user.role !== 'staff')) throw Errors.notFound('Link inválido.');
    if (invite.status === 'accepted') throw Errors.conflict('invite_used', 'Este convite já foi usado. Entre com o seu e-mail e a sua senha.');
    if (invite.status === 'cancelled' || !user.active || user.manuallyBlocked) {
      throw Errors.gone('invite_cancelled', 'Este convite foi cancelado. Peça um novo à sua mentora.');
    }
    if (invite.expiresAt < clock().toISOString()) throw Errors.gone('invite_expired', 'Este convite expirou. Peça um novo à sua mentora.');
    return { invite, user };
  }

  function lookupInvite(body) {
    const { b, issues } = readToken(body);
    onlyKeys(b, ['token'], issues);
    issues.throwIfAny();
    const { invite, user } = usableInvite(b.token);
    return { status: 200, body: { name: user.name, email: user.email, expiresAt: invite.expiresAt, kind: user.role === 'staff' ? 'team' : 'student' } };
  }

  function acceptInvite(body) {
    const { b, issues } = readToken(body);
    onlyKeys(b, ['token', 'password'], issues);
    if (typeof b.password !== 'string' || b.password === '') issues.add('password', 'Informe a senha.');
    else if (b.password.length > 128) issues.add('password', 'A senha pode ter no máximo 128 caracteres.');
    issues.throwIfAny();
    const { invite, user } = usableInvite(b.token);
    const policyError = validatePasswordPolicy(b.password, user.email);
    if (policyError) throw Errors.validation([{ field: 'password', message: policyError }]);
    const at = stamp();
    const reset = Boolean(user.lastLoginAt) || invitesOf(user.id).some((i) => i.status === 'accepted');
    // As contas de demonstração mantêm a senha publicada; as demais passam a usar a escolhida.
    if (user.email !== STUDENT_EMAIL) user.password = b.password;
    if (reset) user.passwordResetAt = at;
    user.passwordChangedAt = at;
    user.lastLoginAt = at;
    invite.status = 'accepted';
    invite.acceptedAt = at;
    // Conta com verificação em duas etapas: define a senha, mas NÃO abre sessão (entra pelo login, que pede o segundo passo).
    if (user.twoFactor?.enabled) {
      saveSession(null);
      return { status: 200, body: { twoFactorRequired: true } };
    }
    saveSession({ userId: user.id, sessionId: newId(), startedAt: at });
    return { status: 200, body: { user: sessionUser(user) } };
  }

  // ---- recuperação de senha (o e-mail NÃO é enviado: o link de redefinição aparece na faixa da demonstração)

  const RESET_TTL_MS = 30 * 60 * 1000;
  const EMAIL_MAX_REQUESTS = 5; // por e-mail em 15 min, como o servidor real
  const resetListeners = new Set();
  const requestLog = new Map();
  const resetsOf = () => (db.resets ??= []);
  const notifyReset = () => resetListeners.forEach((fn) => fn(demoResetLink()));

  /** O pedido mais recente ainda válido, para a faixa da demonstração: { email, link, expiresAt } ou null. */
  function demoResetLink() {
    const at = clock().toISOString();
    const row = [...resetsOf()].reverse().find((r) => !r.usedAt && r.expiresAt >= at);
    const user = row ? findUser(row.userId) : null;
    return row && user ? { email: user.email, link: `${baseUrl()}#/redefinir/${row.token}`, expiresAt: row.expiresAt } : null;
  }

  function requestReset(body) {
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['email'], issues);
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    if (email.length < 3) issues.add('email', 'Informe o e-mail.');
    else if (email.length > 254) issues.add('email', 'E-mail muito longo.');
    else if (CONTROL_CHARS.test(email)) issues.add('email', 'O e-mail contém caracteres inválidos.');
    issues.throwIfAny();

    const key = email.toLowerCase();
    const windowStart = clock().getTime() - 15 * 60 * 1000;
    const recent = (requestLog.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= EMAIL_MAX_REQUESTS) throw new HttpError(429, 'rate_limited', 'Muitas tentativas. Aguarde alguns minutos.');
    requestLog.set(key, [...recent, clock().getTime()]);

    // Resposta igual haja ou não conta: só quem existe (ativa, não bloqueada e com senha) ganha um link.
    const user = db.users.find((u) => u.email.toLowerCase() === key);
    if (user && user.active && !user.manuallyBlocked && user.password !== null) {
      db.resets = resetsOf().filter((r) => r.userId !== user.id || r.usedAt);
      db.resets.push({
        id: newId(),
        userId: user.id,
        token: newToken(),
        expiresAt: new Date(clock().getTime() + RESET_TTL_MS).toISOString(),
        usedAt: null,
        createdAt: stamp(),
      });
    }
    notifyReset();
    return { status: 202, body: { ok: true } };
  }

  function usableReset(token) {
    const row = resetsOf().find((r) => r.token === token);
    const user = row ? findUser(row.userId) : null;
    if (!row || !user) throw Errors.notFound('Link inválido.');
    if (row.usedAt) throw Errors.conflict('reset_used', 'Este link já foi usado. Peça um novo em "Esqueci minha senha".');
    if (!user.active || user.manuallyBlocked) throw Errors.gone('reset_cancelled', 'Este link não vale mais. Peça um novo em "Esqueci minha senha".');
    if (row.expiresAt < clock().toISOString()) throw Errors.gone('reset_expired', 'Este link expirou. Peça um novo em "Esqueci minha senha".');
    return { row, user };
  }

  function lookupReset(body) {
    const { b, issues } = readToken(body);
    onlyKeys(b, ['token'], issues);
    issues.throwIfAny();
    const { row, user } = usableReset(b.token);
    return { status: 200, body: { email: user.email, expiresAt: row.expiresAt } };
  }

  function confirmReset(body) {
    const { b, issues } = readToken(body);
    onlyKeys(b, ['token', 'password'], issues);
    if (typeof b.password !== 'string' || b.password === '') issues.add('password', 'Informe a senha.');
    else if (b.password.length > 128) issues.add('password', 'A senha pode ter no máximo 128 caracteres.');
    issues.throwIfAny();
    const { row, user } = usableReset(b.token);
    const policyError = validatePasswordPolicy(b.password, user.email);
    if (policyError) throw Errors.validation([{ field: 'password', message: policyError }]);
    row.usedAt = stamp();
    user.passwordChangedAt = row.usedAt;
    // As contas de demonstração mantêm a senha publicada (os botões da faixa dependem dela); as demais passam a usar a escolhida.
    if (user.email !== STUDENT_EMAIL && user.email !== MENTORA_EMAIL) user.password = b.password;
    if (session && session.userId === user.id) saveSession(null); // encerra as sessões, como o servidor
    notifyReset();
    return { status: 200, body: { ok: true } };
  }

  // ---- notificações (sino) e busca global: mesmas regras do servidor (routes/notifications.ts, routes/search.ts)

  const NOTIFICATION_FILTERS = ['all', 'unread'];
  const NOTIFICATION_QUERY = {
    filter: { enum: NOTIFICATION_FILTERS, message: 'Filtro inválido.' },
    limit: { int: [1, 50] },
    offset: { int: [0, 100_000] },
    tzOffset: { int: [-840, 840] },
  };
  const NOTIFICATION_LINKS = [
    /^#\/$/,
    /^#\/(tarefas|calendario|perfil|configuracoes|alunas|leads|pessoas|oportunidades|empresas|ajuda|notificacoes|metas|progresso|conquistas|desafios|gestao\/conquistas|gestao\/desafios)$/,
    /^#\/(alunas|leads|oportunidades|empresas|desafios)\/[0-9a-f-]{36}$/i,
    /^#\/comercial(\/(contatos|pipeline|atividades))?$/,
    /^#\/comercial\/(contatos|oportunidades)\/[0-9a-f-]{36}$/i,
  ];
  const clip = (text, max) => {
    const chars = [...String(text).trim()];
    return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
  };
  const plural = (n, one, many) => (n === 1 ? one : many);
  const notificationDto = (n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt, readAt: n.readAt });

  /** Grava o aviso se ainda não existe um com a mesma chave para a pessoa (idempotente). */
  function addNotification(u, draft) {
    if (draft.link !== null && !NOTIFICATION_LINKS.some((re) => re.test(draft.link))) throw new Error('Link de notificação não permitido.');
    if (db.notifications.some((n) => n.userId === u.id && n.dedupeKey === draft.dedupeKey)) return;
    db.notifications.push({
      id: newId(), userId: u.id, kind: draft.kind, title: clip(draft.title, 120), body: clip(draft.body, 300), link: draft.link,
      dedupeKey: draft.dedupeKey, createdAt: draft.createdAt, readAt: null,
    });
  }

  /** Id do primeiro convite aceito da aluna (os seguintes são redefinições de senha). */
  function firstAcceptedInvite(userId) {
    const own = invitesOf(userId).filter((i) => i.status === 'accepted').sort((a, b) => cmp(a.acceptedAt, b.acceptedAt) || cmp(a.id, b.id));
    return own[0]?.id ?? null;
  }

  function materializeNotifications(u, tzOffset) {
    const now = clock().getTime();
    const prefs = prefsOf(u).notifications;
    // Equipe: só as boas-vindas (nenhum aviso de aluna nem de convite).
    if (u.role === 'staff') {
      if (now - Date.parse(u.createdAt) < 30 * DAY) {
        addNotification(u, { kind: 'welcome', title: 'Boas-vindas à equipe', body: 'Você ajuda a conduzir a mentoria. O menu mostra só o que o seu papel permite.', link: '#/', dedupeKey: 'welcome', createdAt: u.createdAt });
      }
      return;
    }
    if (now - Date.parse(u.createdAt) < 30 * DAY) {
      addNotification(u, u.role === 'admin'
        ? { kind: 'welcome', title: 'Boas-vindas ao Indiscutível Hub', body: 'Aqui você cadastra suas alunas, gera os links de acesso e acompanha quem já entrou. Os dados de negócio de cada aluna ficam só com ela.', link: '#/alunas', dedupeKey: 'welcome', createdAt: u.createdAt }
        : { kind: 'welcome', title: 'Boas-vindas ao Indiscutível Hub', body: 'Comece pelo Painel: ele mostra o que pede atenção hoje. Cadastre Pessoas e Leads para montar o seu funil.', link: '#/', dedupeKey: 'welcome', createdAt: u.createdAt });
    }
    if (prefs.security && u.passwordResetAt && now - Date.parse(u.passwordResetAt) < 30 * DAY) {
      addNotification(u, {
        kind: 'password_reset', title: 'Senha redefinida',
        body: 'A senha da sua conta foi redefinida por um link gerado pela sua mentora. Se não foi você, avise a sua mentora.',
        link: '#/perfil', dedupeKey: `password-reset:${Date.parse(u.passwordResetAt)}`, createdAt: u.passwordResetAt,
      });
    }
    if (u.role === 'admin') {
      const since = now - 30 * DAY;
      for (const invite of db.invites) {
        const student = findUser(invite.userId);
        if (!student || student.role !== 'user') continue;
        if (invite.status === 'accepted' && !invite.reset && invite.id === firstAcceptedInvite(student.id) && Date.parse(invite.acceptedAt) >= since) {
          addNotification(u, { kind: 'invite_accepted', title: 'Aluna ativou a conta', body: `${student.name} ativou o acesso e já pode entrar.`, link: `#/alunas/${student.id}`, dedupeKey: `invite-accepted:${invite.id}`, createdAt: invite.acceptedAt });
        } else if (invite.status === 'pending' && student.active && !student.manuallyBlocked && !student.lastLoginAt && Date.parse(invite.expiresAt) < now && Date.parse(invite.expiresAt) >= since) {
          addNotification(u, { kind: 'invite_expired', title: 'Convite expirado', body: `O convite de ${student.name} venceu sem ser usado. Gere um novo link na página dela.`, link: `#/alunas/${student.id}`, dedupeKey: `invite-expired:${invite.id}`, createdAt: invite.expiresAt });
        }
      }
      return;
    }
    const { start, end } = taskDayWindow(tzOffset);
    const tasks = mine(db.tasks, u).filter((t) => t.status === 'open' && t.dueAt);
    if (prefs.overdueTasks) {
      tasks
        .filter((t) => Date.parse(t.dueAt) < start && Date.parse(t.dueAt) >= start - 7 * DAY)
        .sort((a, b) => cmp(b.dueAt, a.dueAt) || cmp(a.id, b.id))
        .slice(0, 5)
        .forEach((t) => addNotification(u, { kind: 'task_overdue', title: 'Tarefa atrasada', body: t.title, link: '#/tarefas', dedupeKey: `task-overdue:${t.id}`, createdAt: t.dueAt }));
    }
    if (prefs.dailySummary) {
      const today = tasks.filter((t) => Date.parse(t.dueAt) >= start && Date.parse(t.dueAt) < end).length;
      const overdue = tasks.filter((t) => Date.parse(t.dueAt) < start).length;
      if (today > 0) {
        const late = overdue > 0 ? ` e ${overdue} ${plural(overdue, 'atrasada', 'atrasadas')}` : '';
        const day = new Date(clock().getTime() - tzOffset * 60_000).toISOString().slice(0, 10);
        addNotification(u, { kind: 'daily_summary', title: 'Resumo do dia', body: `Você tem ${today} ${plural(today, 'tarefa', 'tarefas')} para hoje${late}.`, link: '#/tarefas', dedupeKey: `daily-summary:${day}`, createdAt: new Date(start).toISOString() });
      }
    }
  }

  function listNotifications(searchParams) {
    const u = requireAuth();
    const query = readQuery(searchParams, NOTIFICATION_QUERY, { filter: 'all', limit: 20, offset: 0, tzOffset: 0 });
    materializeNotifications(u, query.tzOffset);
    persist(); // a consulta é GET, mas gera avisos novos: grava
    const own = db.notifications.filter((n) => n.userId === u.id);
    const rows = (query.filter === 'unread' ? own.filter((n) => !n.readAt) : own).sort(
      (a, b) => Number(Boolean(a.readAt)) - Number(Boolean(b.readAt)) || cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id),
    );
    return { status: 200, body: { ...paginate(rows.map(notificationDto), query), unreadCount: own.filter((n) => !n.readAt).length } };
  }

  function readNotification(id) {
    const u = requireAuth();
    const row = UUID.test(id) ? db.notifications.find((n) => n.id === id && n.userId === u.id) : null;
    if (!row) throw Errors.notFound('Notificação não encontrada.');
    row.readAt ??= stamp();
    return { status: 200, body: notificationDto(row) };
  }

  function readAllNotifications(body) {
    const u = requireAuth();
    const issues = createIssues();
    onlyKeys(requireBody(body ?? {}), [], issues);
    issues.throwIfAny();
    const unread = db.notifications.filter((n) => n.userId === u.id && !n.readAt);
    const at = stamp();
    for (const n of unread) n.readAt = at;
    return { status: 200, body: { updated: unread.length } };
  }

  // ---- busca global

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const joinParts = (parts) => parts.filter((p) => typeof p === 'string' && p !== '').join(' · ') || null;
  const matches = (text, needle) => fold(text ?? '').includes(needle);

  function search(searchParams) {
    const u = requireAuth();
    const { q } = readQuery(searchParams, { q: 'text' }, { q: '' });
    if (q.length < 2) throw Errors.validation([{ field: 'q', message: q === '' ? 'Digite o que você procura.' : 'Digite ao menos 2 caracteres.' }]);
    const needle = fold(q);
    const digits = q.replace(/\D/g, '');
    const phone = digits.length >= 4 ? digits : null;
    const top = (rows) => rows.slice(0, 5);
    const byName = (a, b) => byText(a.title, b.title) || cmp(a.id, b.id);
    if (u.role === 'admin') {
      // A mentora só encontra alunas (nome, e-mail, turma). Nunca dado de negócio.
      const items = db.users
        .filter((s) => s.role === 'user' && (matches(s.name, needle) || s.email.toLowerCase().includes(needle) || matches(s.className, needle)))
        .map((s) => ({ id: s.id, title: s.name, subtitle: joinParts([s.className, s.email]), link: `#/alunas/${s.id}` }))
        .sort(byName);
      return { status: 200, body: { q, data: items.length ? [{ group: 'students', label: 'Alunas', items: top(items) }] : [] } };
    }
    const people = mine(db.people, u);
    const companyOf = (p) => db.companies.find((c) => c.id === p.companyId && c.ownerId === u.id);
    const personName = (id) => people.find((p) => p.id === id)?.name;
    const stageOf = (d) => db.funnelStages.find((st) => st.id === d.stageId)?.name;
    // Central Comercial: contatos (antes Pessoas e Leads), oportunidades e clientes abrem nas rotas novas.
    const wonByPerson = new Map();
    for (const d of mine(db.deals, u).filter((x) => x.stage === 'won')) wonByPerson.set(d.personId, [...(wonByPerson.get(d.personId) ?? []), d]);
    const groups = [
      ['people', 'Contatos', people
        .filter((p) => matches(p.name, needle) || (p.email ?? '').includes(needle) || (p.instagram ?? '').includes(needle) || matches(companyOf(p)?.name, needle) || (phone && ((p.whatsapp ?? '').includes(phone) || (p.phone ?? '').includes(phone))))
        .map((p) => ({ id: p.id, title: p.name, subtitle: joinParts([companyOf(p)?.name, p.email ?? p.instagram]), link: `#/comercial/contatos/${p.id}` }))
        .sort(byName)],
      ['companies', 'Empresas', mine(db.companies, u)
        .filter((c) => matches(c.name, needle) || matches(c.city, needle))
        .map((c) => ({ id: c.id, title: c.name, subtitle: joinParts([c.city, c.state]), link: `#/empresas/${c.id}` }))
        .sort(byName)],
      ['deals', 'Oportunidades', mine(db.deals, u)
        .filter((d) => matches(personName(d.personId), needle))
        .sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id))
        .map((d) => ({ id: d.id, title: personName(d.personId), subtitle: joinParts([stageOf(d), brl.format(Number(d.value))]), link: `#/comercial/oportunidades/${d.id}` }))],
      ['tasks', 'Tarefas', mine(db.tasks, u)
        .filter((t) => matches(t.title, needle) || matches(personName(t.personId), needle))
        .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || cmp(a.dueAt ?? '9', b.dueAt ?? '9') || cmp(a.id, b.id))
        .map((t) => ({ id: t.id, title: t.title, subtitle: joinParts([t.status === 'done' ? 'Concluída' : 'Em aberto', personName(t.personId)]), link: `#/tarefas?q=${encodeURIComponent(t.title)}` }))],
      ['products', 'Produtos', mine(db.products, u)
        .filter((p) => !p.archivedAt && matches(p.name, needle))
        .map((p) => ({ id: p.id, title: p.name, subtitle: brl.format(Number(p.price)), link: `#/produtos?q=${encodeURIComponent(p.name)}` }))
        .sort(byName)],
      // Cliente = contato com ao menos uma oportunidade ganha (derivado, como o estado `client` dos contatos).
      ['clients', 'Clientes', people
        .filter((p) => wonByPerson.has(p.id) && matches(p.name, needle))
        .map((p) => ({ id: p.id, title: p.name, subtitle: `Total comprado: ${brl.format(Number(fromCents(wonByPerson.get(p.id).reduce((n, d) => n + toCents(d.value), 0))))}`, link: `#/comercial/contatos/${p.id}` }))
        .sort(byName)],
    ];
    return { status: 200, body: { q, data: groups.map(([group, label, items]) => ({ group, label, items: top(items) })).filter((g) => g.items.length) } };
  }

  // ---- XP, níveis e metas (as mesmas regras do servidor: server/src/domain/xp.ts, domain/goals.ts, services/goals.ts)

  /** Dia local fixo de Brasília para os tetos diários e o primeiro acesso do dia (igual ao servidor). */
  const xpDay = (iso) => new Date(Date.parse(iso) - XP_DAY_OFFSET * 60_000).toISOString().slice(0, 10);

  /** Concede XP uma vez por `dedupeKey`, respeitando o teto diário do tipo. Devolve os pontos concedidos agora (0 = repetido/teto). */
  function awardXp(u, kind, dedupeKey, at = stamp(), variablePoints = undefined) {
    const rule = XP_RULES[kind];
    // Conquista, ação e desafio: os pontos vêm da mentora (1 a 2000); nos demais tipos a regra fixa manda.
    const points = rule.variable ? Math.trunc(variablePoints ?? 0) : rule.points;
    if (!(points >= 1 && points <= 2000)) return 0;
    if (db.xpEvents.some((e) => e.ownerId === u.id && e.dedupeKey === dedupeKey)) return 0;
    if (rule.dailyCap !== undefined) {
      const day = xpDay(at);
      const used = db.xpEvents.filter((e) => e.ownerId === u.id && e.kind === kind && xpDay(e.occurredAt) === day).reduce((n, e) => n + e.points, 0);
      if (used + points > rule.dailyCap) return 0;
    }
    db.xpEvents.push({ id: newId(), ownerId: u.id, kind, points, dedupeKey, occurredAt: at });
    return points;
  }

  const withXp = (body, points) => (points > 0 ? { ...body, xpAwarded: points } : body);

  const tzSpec = { tzOffset: { int: [-840, 840] } };
  const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const isMonthKey = (v) => MONTH_RE.test(v) && Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 2100;
  const monthIndex = (key) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
  const monthFromIndex = (i) => `${String(Math.floor(i / 12)).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`;
  const shiftMonth = (key, delta) => monthFromIndex(monthIndex(key) + delta);
  const localDate = (ms, tz) => new Date(ms - tz * 60_000).toISOString().slice(0, 10);
  const currentMonth = (tz) => localDate(clock().getTime(), tz).slice(0, 7);
  const monthBounds = (key, tz) => ({
    start: Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1) + tz * 60_000,
    end: Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1) + tz * 60_000,
  });
  const addDaysStr = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  const mondayOf = (date) => addDaysStr(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

  /** Dias no ritmo das últimas 2 semanas; sem XP recente, ou além de um ano, não há estimativa (igual ao servidor). */
  const paceEta = (missing, xpLast14) => {
    if (!(missing > 0) || !(xpLast14 > 0)) return null;
    const eta = Math.max(1, Math.ceil(missing / (xpLast14 / 14)));
    return eta > 365 ? null : eta;
  };

  function getProgress(searchParams) {
    const u = requireStudent();
    const { tzOffset } = readQuery(searchParams, tzSpec, { tzOffset: 0 });
    const now = clock().getTime();
    const today = localDate(now, tzOffset);
    const own = db.xpEvents.filter((e) => e.ownerId === u.id);
    const byDay = new Map();
    for (const e of own) {
      const d = localDate(Date.parse(e.occurredAt), tzOffset);
      byDay.set(d, (byDay.get(d) ?? 0) + e.points);
    }
    const firstMonth = shiftMonth(today.slice(0, 7), -5);
    const monthly = Array.from({ length: 6 }, (_, i) => ({ month: shiftMonth(firstMonth, i), xp: 0 }));
    for (const [d, xp] of byDay) {
      const row = monthly.find((m) => m.month === d.slice(0, 7));
      if (row) row.xp += xp;
    }
    const firstDay = addDaysStr(mondayOf(today), -77);
    const daily = Array.from({ length: 84 }, (_, i) => {
      const date = addDaysStr(firstDay, i);
      return { date, xp: date > today ? 0 : (byDay.get(date) ?? 0) };
    });
    let paceXp = 0;
    for (let i = 0; i < 14; i++) paceXp += byDay.get(addDaysStr(today, -i)) ?? 0;
    const xp = own.reduce((n, e) => n + e.points, 0);
    const info = levelFor(xp);
    const recent = [...own].sort((a, b) => cmp(b.occurredAt, a.occurredAt) || cmp(a.id, b.id)).slice(0, 10);
    return {
      status: 200,
      body: {
        xp,
        monthXp: monthly[5].xp,
        level: { n: info.level, name: info.name },
        levelBase: info.base,
        next: info.nextLevel === null ? null : { n: info.nextLevel, name: info.nextName, at: info.nextAt, missing: info.xpToNext, etaDays: paceEta(info.xpToNext, paceXp) },
        today,
        monthly,
        daily,
        recent: recent.map((e) => ({ id: e.id, title: XP_TITLES[e.kind] ?? 'XP recebido', points: e.points, occurredAt: e.occurredAt })),
      },
    };
  }

  const goalsOf = (u) => db.goals.filter((g) => g.ownerId === u.id);
  const normalizeGoalValue = (metric, raw) => (metric === 'revenue' ? canonMoney(raw) : String(Math.trunc(Number(raw))));
  const metricLabel = (metric) => GOAL_METRICS[metric];

  /** Realizado de uma métrica em [start, end): sempre dos dados reais da aluna. */
  function measureGoal(u, metric, start, end) {
    const inside = (iso) => iso != null && Date.parse(iso) >= start && Date.parse(iso) < end;
    if (metric === 'revenue') return fromCents(mine(db.deals, u).filter((d) => d.stage === 'won' && inside(d.closedAt)).reduce((n, d) => n + toCents(d.value), 0));
    if (metric === 'deals_won') return String(mine(db.deals, u).filter((d) => d.stage === 'won' && inside(d.closedAt)).length);
    // "Novos leads" = contatos cadastrados no mês (desde a Central Comercial, todo lead é um contato).
    if (metric === 'new_leads') return String(mine(db.people, u).filter((p) => inside(p.createdAt)).length);
    if (metric === 'tasks_done') return String(mine(db.tasks, u).filter((t) => t.status === 'done' && inside(t.doneAt)).length);
    return String(mine(db.people, u).filter((p) => inside(p.createdAt)).length);
  }

  function goalDto(u, row, tz) {
    const { start, end } = monthBounds(row.month, tz);
    const progress = measureGoal(u, row.metric, start, end);
    const target = normalizeGoalValue(row.metric, row.target);
    const elapsed = Math.min(1, Math.max(0, (clock().getTime() - start) / (end - start)));
    const p = toCents(progress);
    const t = toCents(target);
    const status = p >= t ? 'atingida' : p / t >= elapsed ? 'no_ritmo' : 'atrasada';
    const remainingCents = Math.max(0, t - p);
    return {
      id: row.id, metric: row.metric, label: metricLabel(row.metric), month: row.month, target, progress,
      remaining: row.metric === 'revenue' ? fromCents(remainingCents) : String(Math.ceil(remainingCents / 100)),
      pct: Math.floor((p / t) * 100), status, version: row.version,
    };
  }

  /** Meta atingida: +100 XP (uma vez por métrica e mês, `goal:<métrica>:<mês>`) e um aviso no sino. Mês corrente ou passado, e meta criada até o fim do próprio mês. */
  function settleGoals(u, dtos, tz) {
    let awarded = 0;
    const thisMonth = currentMonth(tz);
    for (const dto of dtos) {
      if (dto.status !== 'atingida' || dto.month > thisMonth) continue;
      const row = db.goals.find((g) => g.id === dto.id);
      if (!row || Date.parse(row.createdAt) >= monthBounds(dto.month, tz).end) continue;
      const points = awardXp(u, 'goal_reached', `goal:${dto.metric}:${dto.month}`);
      if (points === 0) continue;
      awarded += points;
      addNotification(u, {
        kind: 'goal_reached', title: 'Meta atingida',
        body: `Você atingiu a meta de ${metricLabel(dto.metric).toLowerCase()} de ${GOAL_MONTH_NAMES[Number(dto.month.slice(5, 7)) - 1]} de ${dto.month.slice(0, 4)}. +${XP_RULES.goal_reached.points} XP.`,
        link: '#/metas', dedupeKey: `goal-reached:${dto.metric}:${dto.month}`, createdAt: clock().toISOString(),
      });
    }
    return awarded;
  }

  function listGoals(searchParams) {
    const u = requireStudent();
    const query = readQuery(searchParams, { month: { pattern: MONTH_RE, message: 'Informe o mês no formato AAAA-MM.' }, ...tzSpec }, { tzOffset: 0 });
    const month = query.month ?? currentMonth(query.tzOffset);
    if (!isMonthKey(month)) throw Errors.validation([{ field: 'month', message: 'Informe o mês no formato AAAA-MM.' }]);
    const order = Object.keys(GOAL_METRICS);
    const rows = goalsOf(u).filter((g) => g.month === month).sort((a, b) => order.indexOf(a.metric) - order.indexOf(b.metric));
    const data = rows.map((r) => goalDto(u, r, query.tzOffset));
    const xp = settleGoals(u, data, query.tzOffset);
    if (xp > 0) persist(); // a consulta é GET, mas pode conceder XP: grava
    const { start, end } = monthBounds(month, query.tzOffset);
    const now = clock().getTime();
    const thisMonth = currentMonth(query.tzOffset);
    const daysLeft = now < start || now >= end ? null : Math.max(0, Math.ceil((end - now) / DAY) - 1);
    return { status: 200, body: { month, daysLeft, phase: month < thisMonth ? 'past' : month > thisMonth ? 'future' : 'current', data, ...(xp > 0 ? { xpAwarded: xp } : {}) } };
  }

  function readGoalTarget(metric, value, issues) {
    if (typeof value !== 'string') return void issues.add('target', 'Informe o alvo da meta.');
    const s = value.trim();
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return void issues.add('target', 'Informe um valor válido, como 50000 ou 50000.50.');
    if (!(Number(s) > 0)) return void issues.add('target', 'O alvo precisa ser maior que zero.');
    if (metric !== 'revenue' && (!/^\d+$/.test(s) || Number(s) > 1_000_000)) return void issues.add('target', 'Para esta métrica, informe um número inteiro de até 1.000.000.');
    return s;
  }

  function createGoal(searchParams, body) {
    const u = requireStudent();
    const { tzOffset } = readQuery(searchParams, tzSpec, { tzOffset: 0 });
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['metric', 'month', 'target'], issues);
    const metric = Object.hasOwn(GOAL_METRICS, b.metric) ? b.metric : void issues.add('metric', 'Métrica inválida.');
    const month = typeof b.month === 'string' && isMonthKey(b.month) ? b.month : void issues.add('month', 'Informe o mês no formato AAAA-MM.');
    const target = metric ? readGoalTarget(metric, b.target, issues) : (typeof b.target !== 'string' ? void issues.add('target', 'Informe o alvo da meta.') : undefined);
    issues.throwIfAny();
    if (goalsOf(u).some((g) => g.metric === metric && g.month === month)) {
      const message = `Você já tem uma meta de ${metricLabel(metric).toLowerCase()} para este mês. Edite a existente.`;
      throw Errors.conflict('duplicate_goal', message, [{ field: 'metric', message }]);
    }
    const row = { id: newId(), ownerId: u.id, metric, month, target: normalizeGoalValue(metric, target), version: 1, createdAt: stamp() };
    db.goals.push(row);
    const dto = goalDto(u, row, tzOffset);
    return { status: 201, body: withXp(dto, settleGoals(u, [dto], tzOffset)) };
  }

  function patchGoal(id, searchParams, body) {
    const u = requireStudent();
    const { tzOffset } = readQuery(searchParams, tzSpec, { tzOffset: 0 });
    if (!UUID.test(id)) throw Errors.notFound('Meta não encontrada.');
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['target', 'version'], issues);
    if (typeof b.target !== 'string') issues.add('target', 'Informe o alvo da meta.');
    const version = readVersion(b.version, issues);
    issues.throwIfAny();
    const row = findOwned(db.goals, u, id, 'Meta não encontrada.');
    if (!row) throw Errors.notFound('Meta não encontrada.');
    const target = readGoalTarget(row.metric, b.target, issues);
    issues.throwIfAny();
    if (row.version !== version) throw Errors.conflict('version_conflict', 'Esta meta foi alterada em outra aba ou outro dispositivo. Recarregue e tente de novo.');
    const next = replaceRow(db.goals, id, { ...row, target: normalizeGoalValue(row.metric, target), version: row.version + 1 });
    const dto = goalDto(u, next, tzOffset);
    return { status: 200, body: withXp(dto, settleGoals(u, [dto], tzOffset)) };
  }

  function deleteGoal(id) {
    const u = requireStudent();
    const row = findOwned(db.goals, u, id, 'Meta não encontrada.');
    if (!row) throw Errors.notFound('Meta não encontrada.');
    db.goals = db.goals.filter((g) => g.id !== id);
    return { status: 204 };
  }

  function goalsHistory(searchParams) {
    const u = requireStudent();
    const query = readQuery(
      searchParams,
      { metric: { enum: Object.keys(GOAL_METRICS), message: 'Métrica inválida.' }, months: { int: [1, 12] }, month: { pattern: MONTH_RE, message: 'Informe o mês no formato AAAA-MM.' }, ...tzSpec },
      { metric: 'revenue', months: 6, tzOffset: 0 },
    );
    const end = query.month ?? currentMonth(query.tzOffset);
    const keys = Array.from({ length: query.months }, (_, i) => shiftMonth(end, i - (query.months - 1)));
    const data = keys.map((key) => {
      const { start, end: monthEnd } = monthBounds(key, query.tzOffset);
      const goal = goalsOf(u).find((g) => g.metric === query.metric && g.month === key);
      return { month: key, target: goal ? normalizeGoalValue(query.metric, goal.target) : null, progress: measureGoal(u, query.metric, start, monthEnd) };
    });
    return { status: 200, body: { metric: query.metric, data } };
  }

  function goalsQuarter(searchParams) {
    const u = requireStudent();
    const { tzOffset } = readQuery(searchParams, tzSpec, { tzOffset: 0 });
    const thisMonth = currentMonth(tzOffset);
    const year = Number(thisMonth.slice(0, 4));
    const first = Math.floor((Number(thisMonth.slice(5, 7)) - 1) / 3) * 3;
    const months = [0, 1, 2].map((i) => `${year}-${String(first + i + 1).padStart(2, '0')}`);
    const order = Object.keys(GOAL_METRICS);
    const byMetric = new Map();
    for (const g of goalsOf(u).filter((x) => months.includes(x.month)).sort((a, b) => cmp(a.month, b.month))) {
      const { start, end } = monthBounds(g.month, tzOffset);
      byMetric.set(g.metric, [...(byMetric.get(g.metric) ?? []), { month: g.month, target: normalizeGoalValue(g.metric, g.target), progress: measureGoal(u, g.metric, start, end) }]);
    }
    const data = [...byMetric.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([metric, list]) => {
        const target = list.reduce((n, i) => n + toCents(i.target), 0);
        const progress = list.reduce((n, i) => n + toCents(i.progress), 0);
        const fmt = (cents) => (metric === 'revenue' ? fromCents(cents) : String(Math.round(cents / 100)));
        return { metric, label: metricLabel(metric), target: fmt(target), progress: fmt(progress), pct: target > 0 ? Math.floor((progress / target) * 100) : 0, months: list };
      });
    return { status: 200, body: { quarter: { label: `Q${first / 3 + 1}`, year, months }, data } };
  }

  // ---- roteamento

  // Conquistas e Desafios (mesmas regras do servidor; ver mock-growth.js).
  const growth = createGrowthDemo({
    getDb: () => db, clock, stamp, newId, persist, awardXp, addNotification, levelFor, XP_DAY_OFFSET, UUID, CONTROL_CHARS, MULTILINE_CONTROL_CHARS,
    Errors, HttpError, createIssues, requireBody, onlyKeys, readVersion, requireStudent, requireAuth,
  });

  // Ranking (opt-in) e Relatórios da aluna (mesmas regras do servidor; ver mock-reports.js).
  const reports = createReportsDemo({
    getDb: () => db, clock, requireStudent, readQuery, toCents, fromCents,
    levelName: (n) => LEVELS[n - 1]?.name ?? LEVELS[0].name,
    effectiveSources,
    goalPace(u, tz) {
      const month = currentMonth(tz);
      const statuses = goalsOf(u).filter((g) => g.month === month).map((g) => goalDto(u, g, tz).status);
      return { month, total: statuses.length, onTrack: statuses.filter((s) => s !== 'atrasada').length, reached: statuses.filter((s) => s === 'atingida').length };
    },
  });

  // Painel da mentora, lista enriquecida, notas privadas e sessões de mentoria (mesmas regras do servidor; ver mock-mentora.js).
  const mentoriaPanel = createMentoraDemo({
    getDb: () => db, clock, stamp, newId, Errors, createIssues, requireBody, onlyKeys, readVersion, requireAuth, requireStudent, readQuery,
    PAGING, PAGING_DEFAULTS, STUDENT_STATUSES, fold, studentDto, levelFor, LEVELS, UUID, ISO_INSTANT, CONTROL_CHARS, MULTILINE_CONTROL_CHARS, addNotification,
    // Metas do mês corrente: só contagens (total e atingidas ou no ritmo), nunca alvo nem realizado.
    goalCounts(u, tz) {
      const month = currentMonth(tz);
      const statuses = goalsOf(u).filter((g) => g.month === month).map((g) => goalDto(u, g, tz).status);
      return { total: statuses.length, ok: statuses.filter((x) => x !== 'atrasada').length };
    },
  });

  // Acompanhamento semanal e Relatórios da mentoria (mesmas regras do servidor; ver mock-followup.js).
  const followupDemo = createFollowupDemo({
    getDb: () => db, clock, stamp, newId, Errors, createIssues, requireBody, onlyKeys, readVersion, requireAuth, readQuery,
    studentDto, levelFor, LEVELS, UUID, MULTILINE_CONTROL_CHARS,
  });

  // Equipe e permissões (mesmas regras do servidor; ver mock-team.js). O guard central roda antes de cada rota.
  const team = createTeamDemo({
    getDb: () => db, stamp, newId, Errors, createIssues, requireBody, onlyKeys, requireAuth, readQuery, readName, fold, statusOf, findUser, UUID, CONTROL_CHARS,
    issueInvite, inviteResult, cancelPending, invitesOf, sessionUserId: () => session?.userId ?? null, saveSession,
  });

  // Financeiro: vendas, parcelas, pagamentos, estornos, a receber, visão financeira e números da mentora (ver mock-finance.js).
  const finance = createFinanceDemo({
    getDb: () => db, clock, stamp, newId, Errors, createIssues, requireBody, readVersion, readQuery, fold, isPlainObject, UUID, CONTROL_CHARS, MULTILINE_CONTROL_CHARS,
    requireStudent, requireAuth,
  });

  // Marketing: campanhas, investimentos, Instagram, visão geral e números da mentora (ver mock-marketing.js).
  const marketing = createMarketingDemo({
    getDb: () => db, clock, stamp, newId, Errors, createIssues, requireBody, readVersion, readQuery, fold, UUID, CONTROL_CHARS, MULTILINE_CONTROL_CHARS,
    requireStudent, requireAuth,
  });

  // Central Comercial: funis, oportunidades, contatos, linha do tempo, visão geral e números da mentora (ver mock-commercial.js).
  const commercial = createCommercialDemo({
    getDb: () => db, persist, clock, stamp, newId, Errors, createIssues, requireBody, onlyKeys, readVersion, readQuery, readName, readMoney, readInstant,
    toCents, fromCents, fold, byText, sortRows, isPlainObject, UUID, CONTROL_CHARS, MULTILINE_CONTROL_CHARS, requireStudent, requireAuth, awardXp, withXp, allowedSource,
    finance,
    marketing,
  });

  const SEG = '([^/]+)';
  const routes = [
    ...team.routes,
    ...commercial.routes,
    ...finance.routes,
    ...marketing.routes,
    ...growth.routes,
    ...mentoriaPanel.routes,
    ...followupDemo.routes,
    ...reports.routes,
    ['POST', /^auth\/login$/, (_m, _q, body) => login(body)],
    ['POST', /^auth\/logout$/, () => {
      saveSession(null);
      return { status: 204 };
    }],
    ['GET', /^auth\/me$/, () => {
      const u = requireAuth();
      // Primeiro acesso do dia: +2 XP, uma vez por dia (só a aluna).
      if (u.role === 'user' && awardXp(u, 'daily_access', `daily:${xpDay(clock().toISOString())}`) > 0) persist();
      return { status: 200, body: { user: sessionUser(u) } };
    }],
    ['POST', /^auth\/two-factor$/, (_m, _q, body) => twoFactorLogin(body)],
    ['POST', /^auth\/password$/, (_m, _q, body) => changePassword(body)],
    ['POST', /^auth\/password-reset\/request$/, (_m, _q, body) => requestReset(body)],
    ['POST', /^auth\/password-reset\/lookup$/, (_m, _q, body) => lookupReset(body)],
    ['POST', /^auth\/password-reset\/confirm$/, (_m, _q, body) => confirmReset(body)],

    ['GET', /^account\/two-factor$/, (_m, q) => {
      readQuery(q, {}, {});
      return twoFactorStatus();
    }],
    ['POST', /^account\/two-factor\/setup$/, (_m, _q, body) => twoFactorSetup(body)],
    ['POST', /^account\/two-factor\/enable$/, (_m, _q, body) => twoFactorEnable(body)],
    ['POST', /^account\/two-factor\/disable$/, (_m, _q, body) => twoFactorDisable(body)],
    ['POST', /^account\/two-factor\/recovery-codes$/, (_m, _q, body) => twoFactorRegenerate(body)],
    ['POST', new RegExp(`^students/${SEG}/two-factor/reset$`), (m, _q, body) => twoFactorReset(m[1], body)],
    ['GET', /^account\/security-notice$/, (_m, q) => {
      const u = requireAuth();
      readQuery(q, {}, {});
      return { status: 200, body: { passwordResetAt: u.passwordResetAt } };
    }],
    ['GET', /^account\/profile$/, (_m, q) => {
      readQuery(q, {}, {});
      return { status: 200, body: getProfile() };
    }],
    ['PATCH', /^account\/profile$/, (_m, _q, body) => ({ status: 200, body: patchProfile(body) })],
    ['GET', /^account\/preferences$/, (_m, q) => getPreferences(q)],
    ['PATCH', /^account\/preferences$/, (_m, _q, body) => patchPreferences(body)],
    ['GET', /^account\/sessions$/, (_m, q) => listSessions(q)],
    ['POST', /^account\/sessions\/revoke-others$/, (_m, _q, body) => revokeOtherSessions(body)],
    ['DELETE', new RegExp(`^account/sessions/${SEG}$`), (m) => revokeSession(m[1])],
    ['PATCH', /^account\/avatar$/, (_m, _q, body) => patchAvatar(body)],
    ['DELETE', /^account\/avatar$/, () => deleteAvatar()],
    ['GET', /^account\/mentoria$/, (_m, q) => {
      requireAuth();
      readQuery(q, {}, {});
      return { status: 200, body: mentoriaPublic() };
    }],
    ['GET', /^mentora\/settings$/, (_m, q) => readMentoriaSettings(q)],
    ['PATCH', /^mentora\/settings$/, (_m, _q, body) => patchMentoriaSettings(body)],
    ['GET', /^lead-sources$/, (_m, q) => getLeadSources(q)],
    ['PUT', /^lead-sources$/, (_m, _q, body) => putLeadSources(body)],

    ['GET', /^products$/, (_m, q) => listProducts(q)],
    ['POST', /^products$/, (_m, _q, body) => createProduct(body)],
    ['GET', new RegExp(`^products/${SEG}$`), (m) => getProduct(m[1])],
    ['PATCH', new RegExp(`^products/${SEG}$`), (m, _q, body) => patchProduct(m[1], body)],
    ['DELETE', new RegExp(`^products/${SEG}$`), (m) => archiveProduct(m[1])],



    ['GET', /^notifications$/, (_m, q) => listNotifications(q)],
    ['POST', /^notifications\/read-all$/, (_m, _q, body) => readAllNotifications(body)],
    ['POST', new RegExp(`^notifications/${SEG}/read$`), (m) => readNotification(m[1])],
    ['GET', /^search$/, (_m, q) => search(q)],

    ['GET', /^progress$/, (_m, q) => getProgress(q)],
    ['GET', /^goals$/, (_m, q) => listGoals(q)],
    ['POST', /^goals$/, (_m, q, body) => createGoal(q, body)],
    ['GET', /^goals\/history$/, (_m, q) => goalsHistory(q)],
    ['GET', /^goals\/quarter$/, (_m, q) => goalsQuarter(q)],
    ['PATCH', new RegExp(`^goals/${SEG}$`), (m, q, body) => patchGoal(m[1], q, body)],
    ['DELETE', new RegExp(`^goals/${SEG}$`), (m) => deleteGoal(m[1])],

    ['GET', /^tasks$/, (_m, q) => listTasks(q)],
    ['POST', /^tasks$/, (_m, _q, body) => createTask(body)],
    ['GET', /^tasks\/summary$/, (_m, q) => tasksSummary(q)],
    ['GET', new RegExp(`^tasks/${SEG}$`), (m) => getTask(m[1])],
    ['PATCH', new RegExp(`^tasks/${SEG}$`), (m, _q, body) => patchTask(m[1], body)],
    ['DELETE', new RegExp(`^tasks/${SEG}$`), (m) => deleteTask(m[1])],


    ['GET', /^companies$/, (_m, q) => listCompanies(q)],
    ['POST', /^companies$/, (_m, _q, body) => createCompany(body)],
    ['GET', new RegExp(`^companies/${SEG}$`), (m) => getCompany(m[1])],
    ['PATCH', new RegExp(`^companies/${SEG}$`), (m, _q, body) => patchCompany(m[1], body)],
    ['DELETE', new RegExp(`^companies/${SEG}$`), (m) => deleteCompany(m[1])],


    ['GET', /^mentora\/summary$/, (_m, q) => mentoraSummary(q)],

    ['GET', /^students$/, (_m, q) => listStudents(q)],
    ['POST', /^students$/, (_m, _q, body) => createStudent(body)],
    ['GET', new RegExp(`^students/${SEG}$`), (m) => getStudent(m[1])],
    ['PATCH', new RegExp(`^students/${SEG}$`), (m, _q, body) => patchStudent(m[1], body)],
    ['POST', new RegExp(`^students/${SEG}/status$`), (m, _q, body) => transitionStudent(m[1], body)],
    ['POST', new RegExp(`^students/${SEG}/invites$`), (m, _q, body) => resendInvite(m[1], body)],
    ['POST', new RegExp(`^students/${SEG}/invites/cancel$`), (m, _q, body) => cancelInvite(m[1], body)],

    ['POST', /^invites\/lookup$/, (_m, _q, body) => lookupInvite(body)],
    ['POST', /^invites\/accept$/, (_m, _q, body) => acceptInvite(body)],
  ];

  /** Processa uma requisição já decomposta e devolve `{status, body?}` (nunca lança). */
  function handle(method, path, body) {
    const url = new URL(path, 'http://demo.local');
    const verb = String(method).toUpperCase();
    try {
      if (!url.pathname.startsWith(API_PREFIX)) throw Errors.notFound('Rota não encontrada.');
      const rest = url.pathname.slice(API_PREFIX.length);
      // Guard central ANTES de procurar a rota: política de acesso (aluna, mentora, equipe com permissão). A equipe age COMO a mentora dona.
      const caller = session ? findUser(session.userId) : null;
      const access = team.authorize(verb, rest, caller);
      for (const [routeMethod, pattern, run] of routes) {
        if (routeMethod !== verb) continue;
        const match = pattern.exec(rest);
        if (!match) continue;
        if (access.empty === 'search') return { status: 200, body: { q: url.searchParams.get('q') ?? '', data: [] } };
        const realSession = session;
        if (access.actAs) session = { ...session, userId: access.actAs };
        let result;
        try {
          result = run(match, url.searchParams, body);
        } finally {
          if (access.actAs) session = realSession;
        }
        // Depois de uma ação do CRM da aluna: avalia conquistas e desafios e devolve o campo aditivo `growth` (como o servidor).
        const actor = session ? findUser(session.userId) : null;
        result = growth.afterAction(verb, rest, result, actor?.role === 'user' ? actor : null);
        if (verb !== 'GET') persist();
        return result;
      }
      throw Errors.notFound('Rota não encontrada.');
    } catch (error) {
      if (error instanceof HttpError) {
        return {
          status: error.status,
          body: {
            type: 'about:blank',
            title: error.message,
            status: error.status,
            code: error.code,
            detail: error.message,
            ...(error.errors ? { errors: error.errors } : {}),
            requestId: `demo-${Math.abs(clock().getTime() % 1e6)}`,
          },
          problem: true,
        };
      }
      throw error;
    }
  }

  async function mockFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    if (!url.startsWith(API_PREFIX)) {
      if (fallbackFetch) return fallbackFetch(input, init);
      return respond({ status: 404, body: { code: 'not_found', detail: 'Rota não encontrada.' }, problem: true });
    }
    let body;
    if (typeof init.body === 'string' && init.body !== '') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = Symbol('invalid');
      }
    }
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    if (typeof body === 'symbol') return respond({ status: 400, body: { code: 'bad_request', detail: 'Requisição inválida.' }, problem: true });
    return respond(handle(init.method ?? 'GET', url, body));
  }

  function respond({ status, body, problem }) {
    if (status === 204 || body === undefined) return new Response(null, { status });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': problem ? 'application/problem+json' : 'application/json; charset=utf-8' },
    });
  }

  return {
    fetch: mockFetch,
    handle,
    /** O link de redefinição do pedido mais recente ({ email, link, expiresAt }) ou null: a faixa da demonstração o mostra no lugar do e-mail. */
    resetLink: demoResetLink,
    /** Avisa quando o link muda (novo pedido, uso ou restauração). Devolve a função que cancela o aviso. */
    onResetChange(fn) {
      resetListeners.add(fn);
      return () => resetListeners.delete(fn);
    },
    /** Volta aos dados de exemplo (apaga o que foi criado/alterado) e encerra a sessão. */
    reset() {
      db = buildSeed(clock());
      lastStamp = 0;
      requestLog.clear();
      saveSession(null);
      persist();
      notifyReset();
    },
    /** Só para testes: o estado atual (cópia). */
    snapshot: () => copy(db),
  };
}
