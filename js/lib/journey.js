// Regras puras da Jornada (fases da aluna) e dos Check-ins dos desafios (sem DOM), testadas em web/test/journey.test.js.
// Os dados vêm do servidor (GET /journey, /challenges/:id/checkins, /mentora/checkins...): nada aqui inventa número.

import { ApiError, describeError } from './api.js';
import { dayMonthYear } from './growth.js';

// ---------------------------------------------------------------- fases

/** As 4 fases da mentoria, na ordem (os mesmos rótulos do servidor). */
export const PHASES = Object.freeze([
  { phase: 1, label: 'Método Validado' },
  { phase: 2, label: 'Autoridade' },
  { phase: 3, label: 'Escala' },
  { phase: 4, label: 'Gestão' },
]);

export const isPhase = (value) => Number.isInteger(value) && value >= 1 && value <= 4;

/** 1 -> '01'. */
export const phaseNumber = (phase) => String(isPhase(phase) ? phase : 1).padStart(2, '0');

/** 2 -> 'Autoridade' (valor fora da faixa vira a Fase 01, como no servidor). */
export function phaseLabel(phase) {
  return (PHASES.find((p) => p.phase === phase) ?? PHASES[0]).label;
}

/** 'Fase 02 · Autoridade'. */
export const phaseTitle = (phase) => `Fase ${phaseNumber(phase)} · ${phaseLabel(phase)}`;

/** As 4 etapas com a situação de cada uma em relação à fase atual: 'done' (anteriores), 'current' e 'next'. */
export function phaseSteps(current) {
  const now = isPhase(current) ? current : 1;
  return PHASES.map((p) => ({ ...p, state: p.phase < now ? 'done' : p.phase === now ? 'current' : 'next' }));
}

export const PHASE_NOTE_MAX = 1000;

export function phaseNoteError(value) {
  const text = String(value ?? '').trim();
  return text.length > PHASE_NOTE_MAX ? `A observação é longa demais (máximo ${PHASE_NOTE_MAX.toLocaleString('pt-BR')} caracteres).` : null;
}

/** Opções do filtro "Fase" da lista de alunas. */
export const PHASE_FILTER_OPTIONS = [{ value: '', label: 'Todas as fases' }, ...PHASES.map((p) => ({ value: String(p.phase), label: `${phaseNumber(p.phase)} · ${p.label}` }))];

// ---------------------------------------------------------------- datas (dia de Brasília, 'AAAA-MM-DD')

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const isIsoDay = (value) => typeof value === 'string' && ISO_DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** Dia de hoje em Brasília (UTC−3, sem horário de verão desde 2019): o mesmo critério do servidor. */
export function todayInBrasilia(now = new Date()) {
  return new Date(now.getTime() - 180 * 60_000).toISOString().slice(0, 10);
}

/** 'AAAA-MM-DD' + n dias. */
export function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Diferença em dias entre dois dias ISO (b − a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Número do dia dentro do desafio (o primeiro dia é o Dia 1). */
export const dayIndex = (startsOn, day) => daysBetween(startsOn, day) + 1;

/** 'Dia 3 · 14 nov. 2026'. */
export function dayTitle(startsOn, day) {
  return isIsoDay(startsOn) ? `Dia ${dayIndex(startsOn, day)} · ${dayMonthYear(day)}` : dayMonthYear(day);
}

/** Prazo para editar e anexar: até 7 dias depois do último dia do desafio. */
export const CLOSE_AFTER_DAYS = 7;
export const closingDay = (endsOn) => addDays(endsOn, CLOSE_AFTER_DAYS);

/**
 * Dias em que a aluna pode registrar check-in: do primeiro dia do desafio até hoje (ou até o último dia, se já acabou),
 * do mais recente para o mais antigo. Desafio que ainda não começou: lista vazia.
 */
export function checkinDays(startsOn, endsOn, today) {
  if (!isIsoDay(startsOn) || !isIsoDay(endsOn) || !isIsoDay(today)) return [];
  const last = today < endsOn ? today : endsOn;
  if (last < startsOn) return [];
  const out = [];
  for (let day = last; day >= startsOn && out.length < 400; day = addDays(day, -1)) out.push(day);
  return out;
}

/** Dia sugerido ao abrir: hoje, se estiver no período; senão o último dia possível (ou null). */
export function defaultCheckinDay(startsOn, endsOn, today) {
  return checkinDays(startsOn, endsOn, today)[0] ?? null;
}

// ---------------------------------------------------------------- texto e links

export const BODY_MAX = 2000;
export const FEEDBACK_MAX = 1000;
export const LINKS_MAX = 5;
export const LINK_MAX = 500;

export function bodyError(value) {
  const text = String(value ?? '').trim();
  return text.length > BODY_MAX ? `O texto é longo demais (máximo ${BODY_MAX.toLocaleString('pt-BR')} caracteres).` : null;
}

export function feedbackError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Escreva o retorno para a aluna.';
  return text.length > FEEDBACK_MAX ? `O retorno é longo demais (máximo ${FEEDBACK_MAX.toLocaleString('pt-BR')} caracteres).` : null;
}

/** Endereço aceito: http:// ou https://, com domínio, até 500 caracteres. Devolve a mensagem de erro ou null. */
export function linkError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Informe o endereço.';
  if (text.length > LINK_MAX) return `O endereço é longo demais (máximo ${LINK_MAX} caracteres).`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return 'Use um endereço completo, começando com https://.';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Use um endereço que comece com https:// ou http://.';
  if (!url.hostname || !url.hostname.includes('.')) return 'Confira o endereço: falta o domínio (ex.: instagram.com).';
  return null;
}

/** Texto do campo "Links" (um por linha) -> lista limpa (sem linhas vazias nem repetidas). */
export function splitLinks(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const link = line.trim();
    if (!link || seen.has(link)) continue;
    seen.add(link);
    out.push(link);
  }
  return out;
}

/** Erro do campo "Links" inteiro: mais de 5 ou alguma linha inválida (diz qual). */
export function linksError(text) {
  const links = splitLinks(text);
  if (links.length > LINKS_MAX) return `Informe no máximo ${LINKS_MAX} links (você colocou ${links.length}).`;
  for (let i = 0; i < links.length; i += 1) {
    const problem = linkError(links[i]);
    if (problem) return links.length === 1 ? problem : `Link ${i + 1}: ${problem}`;
  }
  return null;
}

/** Só devolve o endereço se for http(s) (o que vem do servidor também passa por aqui antes de virar <a href>). */
export function safeExternalUrl(value) {
  return typeof value === 'string' && linkError(value) === null ? value.trim() : null;
}

/** Texto curto para mostrar o link: domínio + caminho, sem o protocolo, cortado em 60 caracteres. */
export function linkText(value) {
  const text = String(value ?? '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

// ---------------------------------------------------------------- arquivos

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PDF_TYPE = 'application/pdf';
export const IMAGE_MAX_SIDE = 1600;
export const IMAGE_QUALITY = 0.85;
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // depois de reduzida (limite do servidor)
export const DEMO_IMAGE_MAX_BYTES = 350 * 1024; // demonstração: cada imagem fica no navegador, então o teto é menor
/** Lados máximos tentados, em ordem, até a imagem caber no teto de bytes (o primeiro é o padrão de 1600 px). */
export const IMAGE_SIDES = [1600, 1280, 1024, 800];
export const IMAGE_SOURCE_MAX_BYTES = 25 * 1024 * 1024; // foto do celular antes de reduzir
export const PDF_MAX_BYTES = 3 * 1024 * 1024;
export const FILES_PER_CHECKIN = 5;
export const NAME_MAX = 120;

/** 1536 -> '1,5 KB'; 3145728 -> '3 MB'. */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || Number.isInteger(value) ? 0 : 1;
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} ${units[unit]}`;
}

/** Percentual de uso (0 a 100, inteiro) e se está quase cheio (≥ 90%). */
export function storageUsage(storage) {
  const used = Math.max(0, Number(storage?.usedBytes) || 0);
  const limit = Math.max(0, Number(storage?.limitBytes) || 0);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return { used, limit, pct, free: Math.max(0, limit - used), nearlyFull: limit > 0 && used / limit >= 0.9, text: `${formatBytes(used)} de ${formatBytes(limit)}` };
}

/** Novo tamanho para caber em `max` px no maior lado, mantendo a proporção (nunca aumenta). */
export function fitWithin(width, height, max = IMAGE_MAX_SIDE) {
  const w = Math.max(0, Math.round(Number(width) || 0));
  const h = Math.max(0, Math.round(Number(height) || 0));
  if (!w || !h) return { width: 0, height: 0, scaled: false };
  const side = Math.max(w, h);
  if (side <= max) return { width: w, height: h, scaled: false };
  const ratio = max / side;
  return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)), scaled: true };
}

/** Bytes que uma data URL base64 representa (sem o cabeçalho). */
export function dataUrlBytes(dataUrl) {
  const text = String(dataUrl ?? '');
  const comma = text.indexOf(',');
  if (comma === -1) return 0;
  const b64 = text.slice(comma + 1).replace(/\s/g, '');
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/** Nome do arquivo para o servidor: sem pastas nem caracteres de controle, até 120 caracteres; imagem reduzida vira .jpg. */
export function fileName(name, { reducedToJpeg = false } = {}) {
  let base = String(name ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!base) base = 'arquivo';
  if (reducedToJpeg) base = `${base.replace(/\.[a-z0-9]{1,5}$/i, '')}.jpg`;
  if (base.length > NAME_MAX) {
    const ext = /\.[a-z0-9]{1,5}$/i.exec(base)?.[0] ?? '';
    base = `${base.slice(0, NAME_MAX - ext.length)}${ext}`;
  }
  return base;
}

/**
 * Confere o arquivo escolhido antes de enviar. `kind`: 'photo' (só imagem) ou 'receipt' (imagem ou PDF).
 * `demo`: na demonstração só imagens. Devolve a mensagem de erro ou null.
 */
export function evidenceFileError(file, kind, { demo = false } = {}) {
  if (!file) return 'Escolha um arquivo.';
  const type = String(file.type ?? '');
  const isImage = IMAGE_TYPES.includes(type);
  const isPdf = type === PDF_TYPE;
  if (!(file.size > 0)) return 'O arquivo está vazio.';
  if (isPdf) {
    if (kind !== 'receipt') return 'Fotos precisam ser imagens (JPEG, PNG ou WebP). Para PDF, use "Adicionar comprovante".';
    if (demo) return 'Na demonstração, os comprovantes precisam ser imagens. PDF funciona na versão completa.';
    if (file.size > PDF_MAX_BYTES) return `O PDF é grande demais (${formatBytes(file.size)}). O máximo é 3 MB.`;
    return null;
  }
  if (!isImage) return kind === 'receipt' && !demo ? 'Escolha uma imagem (JPEG, PNG ou WebP) ou um PDF.' : 'Escolha uma imagem JPEG, PNG ou WebP.';
  if (file.size > IMAGE_SOURCE_MAX_BYTES) return `A imagem é grande demais (${formatBytes(file.size)}). Escolha uma de até 25 MB.`;
  return null;
}

/** Ainda cabe mais um arquivo neste check-in? */
export const canAddFile = (checkin) => (checkin?.files?.length ?? 0) < FILES_PER_CHECKIN;

// ---------------------------------------------------------------- situações

/** Situação da aluna no desafio (Participantes). */
export const PARTICIPANT_STATUS = Object.freeze({
  completed: { label: 'Concluiu', tone: 'good' },
  active: { label: 'Em dia', tone: 'accent' },
  late: { label: 'Atrasada', tone: 'bad' },
  not_started: { label: 'Não começou', tone: 'neutral' },
});
export const participantStatus = (status) => PARTICIPANT_STATUS[status] ?? PARTICIPANT_STATUS.not_started;

export const PARTICIPANT_FILTERS = [
  { id: '', label: 'Todas' },
  { id: 'completed', label: 'Concluíram' },
  { id: 'active', label: 'Em dia' },
  { id: 'late', label: 'Atrasadas' },
  { id: 'not_started', label: 'Não começaram' },
];

/** Contagem por situação para os filtros. */
export function participantCounts(rows) {
  const counts = { '': 0, completed: 0, active: 0, late: 0, not_started: 0 };
  for (const row of Array.isArray(rows) ? rows : []) {
    counts[''] += 1;
    const key = Object.hasOwn(PARTICIPANT_STATUS, row?.status) ? row.status : 'not_started';
    counts[key] += 1;
  }
  return counts;
}

/** Filtro "Situação" da tela de Check-ins da mentora. */
export const CHECKIN_STATUS_FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'pending_feedback', label: 'Aguardando retorno' },
  { id: 'reviewed', label: 'Com retorno' },
];
export const isCheckinStatus = (value) => value === 'pending_feedback' || value === 'reviewed';

// ---------------------------------------------------------------- erros amigáveis

const FRIENDLY = {
  file_limit: `Este dia já tem ${FILES_PER_CHECKIN} arquivos, o máximo por check-in. Remova um para adicionar outro.`,
  storage_full: 'Seu espaço para evidências acabou. Remova arquivos antigos que não precisa mais para liberar espaço.',
  checkin_closed: 'O prazo para editar este desafio terminou. Os check-ins ficam disponíveis só para leitura.',
  same_phase: 'A aluna já está nesta fase. Escolha outra fase para registrar a mudança.',
  version_conflict: 'Este check-in foi alterado em outra aba ou aparelho. Recarregamos a versão mais recente: confira e salve de novo.',
  not_enrolled: 'Participe do desafio para registrar check-ins.',
};

/** Mensagem amigável para os erros desta entrega (cai no describeError para o resto). */
export function journeyErrorMessage(error) {
  if (error instanceof ApiError) {
    if (Object.hasOwn(FRIENDLY, error.code)) return FRIENDLY[error.code];
    if (error.status === 413) return 'O arquivo é grande demais para enviar.';
    // O servidor (e a demonstração) explicam o problema do arquivo no campo `dataUrl`: essa mensagem é a mais útil.
    const fileProblem = error.errors?.find((e) => e.field === 'dataUrl')?.message;
    if (error.status === 400 && fileProblem) return fileProblem;
  }
  return describeError(error);
}

/** O erro pede recarregar o check-in (alterado em outro lugar ou prazo encerrado)? */
export const needsReload = (error) => error instanceof ApiError && (error.code === 'version_conflict' || error.code === 'checkin_closed' || error.status === 404);

// ---------------------------------------------------------------- endereços

/** '#/gestao/checkins?desafio=..&aluna=..&situacao=..' (só os filtros preenchidos). Os links de Participantes e do perfil usam isto. */
export function checkinsHash({ challengeId = '', studentId = '', status = '' } = {}) {
  const query = new URLSearchParams();
  if (challengeId) query.set('desafio', challengeId);
  if (studentId) query.set('aluna', studentId);
  if (isCheckinStatus(status)) query.set('situacao', status);
  const text = query.toString();
  return `#/gestao/checkins${text ? `?${text}` : ''}`;
}

/** Erros do servidor por item (`links.0`, `links.3`) viram um erro do campo "Links" que diz qual linha corrigir. */
export function mapLinkErrors(errors) {
  return (Array.isArray(errors) ? errors : []).map((e) => {
    const m = /^links\.(\d+)$/.exec(e?.field ?? '');
    return m ? { field: 'links', message: `Link ${Number(m[1]) + 1}: ${e.message}` } : e;
  });
}
