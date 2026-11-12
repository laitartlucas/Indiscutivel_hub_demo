/* global atob */
// Jornada e check-ins da demonstração (Entrega 5): fases manuais da aluna (com histórico), check-ins por dia nos desafios,
// evidências (só imagens, já reduzidas pelo navegador), feedback da mentora e os avisos. Mesmo contrato do servidor
// (docs/superpowers/specs/2026-11-12-entrega-5-jornada-desafios.md; server/src/routes/journey.ts e services/journey.ts),
// sobre o estado em memória. Regras puras em journey-data.js.
//
// Arquivos na demonstração: o conteúdo fica guardado como data URL (só neste navegador). O campo `url` de cada arquivo É essa
// data URL (no servidor é a rota de download), para que `<img src>` e os links de abrir/baixar funcionem sem servidor e dentro
// da CSP (img-src 'self' data:). As rotas de download (GET /checkin-files/:id e /mentora/checkin-files/:id) também existem e
// devolvem os bytes com os mesmos cabeçalhos do servidor.
import { isEligible, phaseOf as challengePhaseOf } from './growth-data.js';
import { brasiliaDay, checkinDayState, checkinWindow, currentPhase, fileFits, isValidDay, isValidLink, participantStatus, PHASES, phaseLabel, storageUsed, CHECKIN_LIMITS } from './journey-data.js';

/** Caracteres de direção e de formatação (bidi) que disfarçam a extensão real de um nome de arquivo (igual ao servidor). */
const BIDI_RANGES = [[0x061c, 0x061c], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]];
const BIDI_SOURCE = `[${BIDI_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('')}]`;
const BIDI_CHARS = new RegExp(BIDI_SOURCE);
const BIDI_ALL = new RegExp(BIDI_SOURCE, 'g');
const FILE_EXTENSION = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

const KB = 1024;
/** Limites da demonstração (o servidor aceita imagem de 2 MB, PDF de 3 MB e 50 MB por aluna). */
export const DEMO_FILE_MAX_BYTES = 400 * KB;
export const DEMO_STORAGE_LIMIT_BYTES = 3 * KB * KB;
export const DEMO_PDF_MESSAGE = 'Na demonstração, envie só imagens (o PDF funciona no sistema real).';
const KINDS = ['photo', 'receipt'];
const STATUSES = ['pending_feedback', 'reviewed'];
const VERSION_CONFLICT = 'Este check-in foi alterado em outra aba ou outro dispositivo. Recarregue e tente de novo.';
const CLOSED = 'O prazo para registrar check-ins deste desafio terminou.';

const dayLabel = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export function createJourneyDemo(d) {
  const { Errors, createIssues, requireBody, onlyKeys, readQuery, UUID, CONTROL_CHARS, MULTILINE_CONTROL_CHARS } = d;
  const db = () => d.getDb();
  const table = (name) => (db()[name] ??= []);
  const today = () => brasiliaDay(d.clock());
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const userName = (id) => (id ? (db().users.find((u) => u.id === id)?.name ?? null) : null);
  const mentora = () => db().users.find((u) => u.role === 'admin');
  const fieldError = (field, message) => Errors.validation([{ field, message }]);
  /** Id de caminho: fora do formato = 404 (como o servidor). */
  const parseId = (raw, message) => {
    if (typeof raw !== 'string' || !UUID.test(raw)) throw Errors.notFound(message);
    return raw;
  };
  const parseDay = (raw) => {
    if (!isValidDay(raw)) throw fieldError('day', 'Informe o dia no formato AAAA-MM-DD.');
    return raw;
  };

  // ---------------------------------------------------------------- leitura dos campos (mesmas mensagens do servidor)

  /** Texto opcional aparado: undefined = não mexe; null ou vazio = null. */
  function readText(value, field, max, tooLong, invalid, issues) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return void issues.add(field, 'Dados inválidos.');
    const s = value.trim();
    if (s.length > max) return void issues.add(field, tooLong);
    if (MULTILINE_CONTROL_CHARS.test(s)) return void issues.add(field, invalid);
    return s === '' ? null : s;
  }

  function readLinks(value, issues) {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return void issues.add('links', 'Dados inválidos.');
    if (value.length > CHECKIN_LIMITS.links) return void issues.add('links', `No máximo ${CHECKIN_LIMITS.links} links.`);
    const out = [];
    value.forEach((item, i) => {
      if (typeof item !== 'string') return void issues.add(`links.${i}`, 'Link inválido.');
      const s = item.trim();
      if (s.length > CHECKIN_LIMITS.linkChars) return void issues.add(`links.${i}`, `Link longo demais (máximo ${CHECKIN_LIMITS.linkChars} caracteres).`);
      if (!isValidLink(s)) return void issues.add(`links.${i}`, 'Use um link que comece com https:// ou http://.');
      out.push(s);
    });
    return out;
  }

  /** Confere a data URL e devolve { mime, sizeBytes } ou { error } (mensagem do campo `dataUrl`). Na demonstração, só imagens. */
  function checkImage(kind, dataUrl) {
    if (/^data:application\/pdf[;,]/i.test(dataUrl)) return { error: DEMO_PDF_MESSAGE };
    const match = /^data:image\/(jpeg|png|webp);base64,/.exec(dataUrl);
    if (!match) return { error: kind === 'photo' ? 'Use uma imagem PNG, JPEG ou WebP.' : DEMO_PDF_MESSAGE };
    const payload = dataUrl.slice(match[0].length);
    if (payload.length < 16 || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return { error: 'O arquivo está corrompido.' };
    const sizeBytes = (payload.length / 4) * 3 - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
    if (sizeBytes > DEMO_FILE_MAX_BYTES) return { error: 'Na demonstração, cada imagem pode ter até 400 KB. Reduza a foto e tente de novo.' };
    let bytes;
    try {
      bytes = Uint8Array.from(atob(payload.slice(0, 64)), (c) => c.charCodeAt(0));
    } catch {
      return { error: 'O arquivo está corrompido.' };
    }
    const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
    const okMagic =
      (match[1] === 'jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (match[1] === 'png' && bytes[0] === 0x89 && ascii(1, 8) === 'PNG\r\n\u001a\n') ||
      (match[1] === 'webp' && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP');
    if (!okMagic) return { error: 'O conteúdo não é um arquivo do tipo informado.' };
    return { mime: `image/${match[1]}`, sizeBytes };
  }

  // ---------------------------------------------------------------- fases

  const phasesOf = (studentId) => table('studentPhases').filter((p) => p.studentId === studentId);
  /** Fase atual (1–4) de uma aluna; sem registro = 1. */
  const phaseOf = (studentId) => currentPhase(phasesOf(studentId));

  const phaseDto = (p) => ({ phase: p.phase, label: phaseLabel(p.phase), since: p.createdAt, note: p.note ?? null, changedByName: userName(p.changedBy) });

  function journeyOf(student) {
    const history = phasesOf(student.id)
      .map((p, index) => ({ p, index }))
      .sort((a, b) => cmp(b.p.createdAt, a.p.createdAt) || b.index - a.index)
      .map(({ p }) => phaseDto(p));
    const current = history[0] ?? { phase: 1, label: phaseLabel(1), since: student.createdAt, note: null, changedByName: null };
    return { current, history };
  }

  const studentOf = (raw) => {
    const id = parseId(raw, 'Aluna não encontrada.');
    const found = db().users.find((u) => u.id === id && u.role === 'user');
    if (!found) throw Errors.notFound('Aluna não encontrada.');
    return found;
  };

  const withPhases = (j) => ({ ...j, phases: PHASES.map((p) => ({ phase: p.phase, label: p.label })) });

  function getJourney(searchParams) {
    const u = d.requireStudent();
    readQuery(searchParams, {}, {});
    return { status: 200, body: withPhases(journeyOf(u)) };
  }

  function mentoraJourney(id, searchParams) {
    d.requireAuth('admin');
    const student = studentOf(id);
    readQuery(searchParams, {}, {});
    return { status: 200, body: withPhases(journeyOf(student)) };
  }

  function changePhase(id, body) {
    d.requireAuth('admin');
    const student = studentOf(id);
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['phase', 'note'], issues);
    if (!Number.isInteger(b.phase) || b.phase < 1 || b.phase > 4) issues.add('phase', 'Escolha a fase.');
    const note = readText(b.note, 'note', 1000, 'A observação é longa demais (máximo 1.000 caracteres).', 'A observação contém caracteres inválidos.', issues);
    issues.throwIfAny();
    if (phaseOf(student.id) === b.phase) throw Errors.conflict('same_phase', 'A aluna já está nesta fase.');
    const row = { id: d.newId(), studentId: student.id, phase: b.phase, note: note ?? null, changedBy: d.actor().id, createdAt: d.stamp() };
    table('studentPhases').push(row);
    d.addNotification(student, {
      kind: 'phase_changed', title: 'Nova fase da jornada', body: `Você está na Fase ${String(row.phase).padStart(2, '0')}: ${phaseLabel(row.phase)}.`, link: '#/progresso',
      dedupeKey: `phase:${row.id}`, createdAt: row.createdAt,
    });
    return { status: 200, body: journeyOf(student) };
  }

  // ---------------------------------------------------------------- check-ins

  const filesOf = (checkinId) => table('checkinFiles').filter((f) => f.checkinId === checkinId).sort((a, b) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id));
  const usedBytes = (studentId) => storageUsed(table('checkinFiles').filter((f) => f.studentId === studentId));
  const fileDto = (f) => ({ id: f.id, kind: f.kind, mime: f.mime, name: f.name, sizeBytes: f.sizeBytes, url: f.dataUrl, createdAt: f.createdAt });

  function checkinDto(c) {
    return {
      id: c.id, challengeId: c.challengeId, day: c.day, body: c.body, links: [...c.links], completed: c.completed, feedback: c.feedback, feedbackAt: c.feedbackAt,
      feedbackByName: c.feedback ? userName(c.feedbackBy) : null, files: filesOf(c.id).map(fileDto), version: c.version, createdAt: c.createdAt, updatedAt: c.updatedAt,
    };
  }

  /** Bytes de um arquivo, com os cabeçalhos do servidor (regra 6 da especificação). */
  function fileResponse(f) {
    const bytes = Uint8Array.from(atob(f.dataUrl.slice(f.dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    const type = f.mime === 'application/pdf' ? 'attachment' : 'inline';
    // Como no servidor: a extensão vem do tipo gravado (nunca do nome) e sem caracteres de direção (bidi).
    const base = f.name.replace(BIDI_ALL, '').replace(/.[^.]*$/, '').trim().slice(0, 100) || 'arquivo';
    const full = base + (FILE_EXTENSION[f.mime] ?? '');
    const ascii = full.replace(/[^A-Za-z0-9._-]/g, '_');
    const encoded = encodeURIComponent(full).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return {
      status: 200,
      binary: {
        bytes,
        headers: {
          'content-type': f.mime,
          'x-content-type-options': 'nosniff',
          'content-disposition': `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
          'cache-control': 'private, no-store',
        },
      },
    };
  }

  /** Como growth.visible(): publicado, da mentora dela e destinado à turma dela; senão 404. */
  function visibleChallenge(u, id) {
    const c = db().challenges.find((x) => x.id === id && x.mentoraId === mentora()?.id && x.status === 'published' && isEligible(x.classNames, u.className));
    if (!c) throw Errors.notFound('Desafio não encontrado.');
    return c;
  }

  /** Escrita: inscrita (409 not_enrolled), dia no período e até hoje (400 day), prazo aberto (409 checkin_closed). */
  function assertWritable(u, c, day) {
    if (!db().challengeEnrollments.some((e) => e.userId === u.id && e.challengeId === c.id)) throw Errors.conflict('not_enrolled', 'Participe do desafio para registrar check-ins.');
    const state = checkinDayState(c, day, today());
    if (state === 'out_of_period') throw fieldError('day', 'Escolha um dia dentro do período do desafio, até hoje.');
    if (state === 'closed') throw Errors.conflict('checkin_closed', CLOSED);
  }

  const findCheckin = (u, c, day) => table('challengeCheckins').find((x) => x.studentId === u.id && x.challengeId === c.id && x.day === day);

  function insertCheckin(u, c, day, fields) {
    const at = d.stamp();
    const row = {
      id: d.newId(), studentId: u.id, challengeId: c.id, day, body: fields.body ?? null, links: fields.links ?? [], completed: fields.completed ?? false,
      feedback: null, feedbackBy: null, feedbackAt: null, version: 1, createdAt: at, updatedAt: at,
    };
    table('challengeCheckins').push(row);
    return row;
  }

  /** Aviso para a mentora dona: um por aluna, desafio e dia (a chave evita repetir). */
  function notifyReceived(u, c, day) {
    const owner = mentora();
    if (!owner) return;
    d.addNotification(owner, {
      kind: 'checkin_received', title: 'Novo check-in', body: `${u.name} · ${c.title} · ${dayLabel(day)}`, link: '#/gestao/checkins',
      dedupeKey: `checkin:${u.id}:${c.id}:${day}`, createdAt: d.stamp(),
    });
  }

  function listCheckins(id, searchParams) {
    const u = d.requireStudent();
    const challengeId = parseId(id, 'Desafio não encontrado.');
    readQuery(searchParams, {}, {});
    const c = visibleChallenge(u, challengeId);
    const rows = table('challengeCheckins')
      .filter((x) => x.studentId === u.id && x.challengeId === c.id)
      .sort((a, b) => cmp(b.day, a.day))
      .map(checkinDto);
    return { status: 200, body: { rows, closed: checkinWindow(c, today()).closed, storage: { usedBytes: usedBytes(u.id), limitBytes: DEMO_STORAGE_LIMIT_BYTES } } };
  }

  function putCheckin(id, rawDay, body) {
    const u = d.requireStudent();
    const challengeId = parseId(id, 'Desafio não encontrado.');
    const day = parseDay(rawDay);
    const b = requireBody(body ?? {});
    const issues = createIssues();
    onlyKeys(b, ['body', 'links', 'completed', 'version'], issues);
    const text = readText(b.body, 'body', 2000, 'O texto é longo demais (máximo 2.000 caracteres).', 'O texto contém caracteres inválidos.', issues);
    const links = readLinks(b.links, issues);
    if (b.completed !== undefined && typeof b.completed !== 'boolean') issues.add('completed', 'Dados inválidos.');
    if (b.version !== undefined && (!Number.isInteger(b.version) || b.version < 1)) issues.add('version', 'Informe a versão.');
    issues.throwIfAny();
    const c = visibleChallenge(u, challengeId);
    assertWritable(u, c, day);
    const existing = findCheckin(u, c, day);
    let row;
    if (!existing) {
      row = insertCheckin(u, c, day, { body: text, links, completed: b.completed });
    } else {
      // Já existe (talvez criado em outra aba): atualizar exige a versão que a tela tem.
      if (b.version === undefined || existing.version !== b.version) throw Errors.conflict('version_conflict', VERSION_CONFLICT);
      if (text !== undefined) existing.body = text;
      if (links !== undefined) existing.links = links;
      if (b.completed !== undefined) existing.completed = b.completed;
      existing.version += 1;
      existing.updatedAt = d.stamp();
      row = existing;
    }
    notifyReceived(u, c, day);
    return { status: 200, body: checkinDto(row) };
  }

  function addFile(id, rawDay, body) {
    const u = d.requireStudent();
    const challengeId = parseId(id, 'Desafio não encontrado.');
    const day = parseDay(rawDay);
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['kind', 'name', 'dataUrl'], issues);
    if (!KINDS.includes(b.kind)) issues.add('kind', 'Tipo de arquivo inválido.');
    let name;
    if (typeof b.name !== 'string' || b.name.trim() === '') issues.add('name', 'Informe o nome do arquivo.');
    else if (b.name.trim().length > 120) issues.add('name', 'Nome de arquivo longo demais (máximo 120).');
    else if (CONTROL_CHARS.test(b.name.trim()) || BIDI_CHARS.test(b.name)) issues.add('name', 'O nome contém caracteres inválidos.');
    else name = b.name.trim();
    if (typeof b.dataUrl !== 'string') issues.add('dataUrl', 'Envie o arquivo.');
    issues.throwIfAny();
    const image = checkImage(b.kind, b.dataUrl);
    if (image.error) throw fieldError('dataUrl', image.error);
    const c = visibleChallenge(u, challengeId);
    assertWritable(u, c, day);
    const existing = findCheckin(u, c, day);
    const fits = fileFits({ filesInCheckin: existing ? filesOf(existing.id).length : 0, usedBytes: usedBytes(u.id) }, image.sizeBytes, DEMO_STORAGE_LIMIT_BYTES);
    if (fits === 'file_limit') throw Errors.conflict('file_limit', `Cada check-in aceita até ${CHECKIN_LIMITS.filesPerCheckin} arquivos.`);
    if (fits === 'storage_full') throw Errors.conflict('storage_full', 'O espaço da demonstração (3 MB, só neste navegador) acabou. Remova arquivos para enviar novos.');
    const row = existing ?? insertCheckin(u, c, day, {});
    const at = d.stamp();
    table('checkinFiles').push({ id: d.newId(), checkinId: row.id, studentId: u.id, kind: b.kind, mime: image.mime, name, sizeBytes: image.sizeBytes, dataUrl: b.dataUrl, createdAt: at });
    row.updatedAt = at;
    notifyReceived(u, c, day);
    return { status: 201, body: checkinDto(row) };
  }

  function removeFile(id, rawDay, rawFileId) {
    const u = d.requireStudent();
    const challengeId = parseId(id, 'Desafio não encontrado.');
    const day = parseDay(rawDay);
    const fileId = parseId(rawFileId, 'Arquivo não encontrado.');
    const c = visibleChallenge(u, challengeId);
    if (checkinWindow(c, today()).closed) throw Errors.conflict('checkin_closed', CLOSED);
    const row = findCheckin(u, c, day);
    if (!row) throw Errors.notFound('Arquivo não encontrado.');
    const file = table('checkinFiles').find((f) => f.id === fileId && f.checkinId === row.id && f.studentId === u.id);
    if (!file) throw Errors.notFound('Arquivo não encontrado.');
    db().checkinFiles = table('checkinFiles').filter((f) => f.id !== file.id);
    row.updatedAt = d.stamp();
    return { status: 200, body: checkinDto(row) };
  }

  function downloadOwn(rawFileId, searchParams) {
    const u = d.requireStudent();
    const fileId = parseId(rawFileId, 'Arquivo não encontrado.');
    readQuery(searchParams, {}, {});
    const file = table('checkinFiles').find((f) => f.id === fileId && f.studentId === u.id);
    if (!file) throw Errors.notFound('Arquivo não encontrado.');
    return fileResponse(file);
  }

  // ---------------------------------------------------------------- mentora (a dona; a equipe age como ela)

  const ownedChallenges = () => new Map(db().challenges.filter((c) => c.mentoraId === mentora()?.id).map((c) => [c.id, c]));
  const isStudent = (id) => db().users.some((u) => u.id === id && u.role === 'user');

  function downloadMentora(rawFileId, searchParams) {
    d.requireAuth('admin');
    const fileId = parseId(rawFileId, 'Arquivo não encontrado.');
    readQuery(searchParams, {}, {});
    const owned = ownedChallenges();
    const file = table('checkinFiles').find((f) => f.id === fileId && isStudent(f.studentId));
    const checkin = file ? table('challengeCheckins').find((c) => c.id === file.checkinId) : null;
    if (!file || !checkin || !owned.has(checkin.challengeId)) throw Errors.notFound('Arquivo não encontrado.');
    return fileResponse(file);
  }

  function mentoraCheckins(searchParams) {
    d.requireAuth('admin');
    const query = readQuery(searchParams, { challengeId: 'uuid', studentId: 'uuid', status: { enum: STATUSES, message: 'Situação inválida.' }, ...d.PAGING }, { ...d.PAGING_DEFAULTS });
    const owned = ownedChallenges();
    const rows = table('challengeCheckins')
      .filter((x) => owned.has(x.challengeId) && isStudent(x.studentId))
      .filter((x) => !query.challengeId || x.challengeId === query.challengeId)
      .filter((x) => !query.studentId || x.studentId === query.studentId)
      .filter((x) => !query.status || (query.status === 'reviewed' ? x.feedback !== null : x.feedback === null))
      .sort((a, b) => cmp(b.day, a.day) || cmp(b.updatedAt, a.updatedAt) || cmp(a.id, b.id));
    return {
      status: 200,
      body: {
        rows: rows.slice(query.offset, query.offset + query.limit).map((x) => ({ ...checkinDto(x), studentId: x.studentId, studentName: userName(x.studentId), challengeTitle: owned.get(x.challengeId).title })),
        total: rows.length,
      },
    };
  }

  function participants(id, searchParams) {
    d.requireAuth('admin');
    const challengeId = parseId(id, 'Desafio não encontrado.');
    readQuery(searchParams, {}, {});
    const c = ownedChallenges().get(challengeId);
    if (!c) throw Errors.notFound('Desafio não encontrado.');
    const day = today();
    const enrollments = new Map(db().challengeEnrollments.filter((e) => e.challengeId === c.id).map((e) => [e.userId, e]));
    // Destinadas: as alunas da turma do desafio (rascunho ainda não é de ninguém) + quem já está inscrita.
    const rows = db()
      .users.filter((u) => u.role === 'user' && (enrollments.has(u.id) || (c.status !== 'draft' && u.active && !u.manuallyBlocked && isEligible(c.classNames, u.className))))
      .map((u) => {
        const e = enrollments.get(u.id);
        const mine = table('challengeCheckins').filter((x) => x.studentId === u.id && x.challengeId === c.id);
        const lastCheckinDay = mine.reduce((max, x) => (max === null || x.day > max ? x.day : max), null);
        const joinedAt = e?.joinedAt ?? null;
        const completedAt = e?.completedAt ?? null;
        return {
          studentId: u.id, studentName: u.name, phase: phaseOf(u.id), joinedAt, completedAt, checkins: mine.length, lastCheckinDay,
          pendingFeedback: mine.filter((x) => x.feedback === null).length, status: participantStatus({ completedAt, joinedAt, lastCheckinDay }, c, day),
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName, 'pt-BR') || a.studentId.localeCompare(b.studentId));
    return {
      status: 200,
      body: { challenge: { id: c.id, title: c.title, startsOn: c.startsOn, endsOn: c.endsOn, status: c.status, phase: challengePhaseOf(day, c.startsOn, c.endsOn) }, rows },
    };
  }

  function giveFeedback(id, body) {
    d.requireAuth('admin');
    const checkinId = parseId(id, 'Check-in não encontrado.');
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['feedback', 'version'], issues);
    const feedback = readText(b.feedback, 'feedback', 1000, 'O feedback é longo demais (máximo 1.000 caracteres).', 'O feedback contém caracteres inválidos.', issues);
    if ((feedback === undefined || feedback === null) && !issues.list.some((x) => x.field === 'feedback')) issues.add('feedback', 'Escreva o feedback.');
    if (!Number.isInteger(b.version) || b.version < 1) issues.add('version', 'Informe a versão.');
    issues.throwIfAny();
    const owned = ownedChallenges();
    const row = table('challengeCheckins').find((x) => x.id === checkinId && owned.has(x.challengeId) && isStudent(x.studentId));
    if (!row) throw Errors.notFound('Check-in não encontrado.');
    if (row.version !== b.version) throw Errors.conflict('version_conflict', VERSION_CONFLICT);
    const at = d.stamp();
    Object.assign(row, { feedback, feedbackBy: d.actor().id, feedbackAt: at, version: row.version + 1, updatedAt: at });
    const student = db().users.find((u) => u.id === row.studentId);
    d.addNotification(student, {
      kind: 'checkin_feedback', title: 'Feedback no seu check-in', body: `${owned.get(row.challengeId).title} · ${dayLabel(row.day)}`, link: `#/desafios/${row.challengeId}`,
      dedupeKey: `checkin-feedback:${row.id}:${row.version}`, createdAt: at,
    });
    const dto = checkinDto(row);
    // Como no servidor: equipe com "Gerenciar desafios" e sem "Ver alunas" dá o feedback, mas não recebe o check-in de volta.
    const who = d.actor();
    if (who?.role === 'staff' && !d.permissionsOf(who).includes('students.view')) {
      return { status: 200, body: { id: dto.id, feedback: dto.feedback, feedbackAt: dto.feedbackAt, feedbackByName: dto.feedbackByName, version: dto.version } };
    }
    return { status: 200, body: dto };
  }

  const SEG = '([^/]+)';
  const routes = [
    ['GET', /^journey$/, (_m, q) => getJourney(q)],
    ['GET', new RegExp(`^challenges/${SEG}/checkins$`), (m, q) => listCheckins(m[1], q)],
    ['PUT', new RegExp(`^challenges/${SEG}/checkins/${SEG}$`), (m, _q, body) => putCheckin(m[1], m[2], body)],
    ['POST', new RegExp(`^challenges/${SEG}/checkins/${SEG}/files$`), (m, _q, body) => addFile(m[1], m[2], body)],
    ['DELETE', new RegExp(`^challenges/${SEG}/checkins/${SEG}/files/${SEG}$`), (m) => removeFile(m[1], m[2], m[3])],
    ['GET', new RegExp(`^checkin-files/${SEG}$`), (m, q) => downloadOwn(m[1], q)],

    ['GET', new RegExp(`^mentora/students/${SEG}/journey$`), (m, q) => mentoraJourney(m[1], q)],
    ['POST', new RegExp(`^mentora/students/${SEG}/phase$`), (m, _q, body) => changePhase(m[1], body)],
    ['GET', /^mentora\/checkins$/, (_m, q) => mentoraCheckins(q)],
    ['GET', new RegExp(`^mentora/challenges/${SEG}/participants$`), (m, q) => participants(m[1], q)],
    ['POST', new RegExp(`^mentora/checkins/${SEG}/feedback$`), (m, _q, body) => giveFeedback(m[1], body)],
    ['GET', new RegExp(`^mentora/checkin-files/${SEG}$`), (m, q) => downloadMentora(m[1], q)],
  ];

  return { routes, phaseOf };
}
