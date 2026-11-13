// Faturamento autodeclarado e marcos na demonstração (Entrega 6): lançamentos mensais da aluna, histórico das correções (só inclusão),
// marcos 10k/30k/50k/100k + PAD GOLD (nunca apagados; vigente ⇄ em revisão) e os avisos para a aluna e a mentora. Mesmo contrato do
// servidor (docs/superpowers/specs/2026-11-12-entrega-6-faturamento-conquistas.md; server/src/routes/revenue.ts e services/revenue.ts),
// sobre o estado em memória. Regras puras em revenue-data.js.
//
// Não é o faturamento comercial (vendas da Entrega 3): tabelas, rotas e rótulos separados.
import { brasiliaDay, phaseLabel } from './journey-data.js';
import {
  applyMilestones, entryMonth, evaluateMilestones, fromCents, isValidMonth, milestoneLabel, milestonesView, monthKey, monthState, nextMilestone, NOTE_MAX,
  PAD_GOLD_MILESTONE, padGoldStatus, parseAmount, summarize, toCents,
} from './revenue-data.js';

const VERSION_CONFLICT = 'Este lançamento foi alterado em outra aba ou outro dispositivo. Recarregue e tente de novo.';
const STUDENT_LINK = '#/faturamento';
const MENTORA_LINK = '#/faturamento-alunas';
const MILESTONE_FILTERS = ['10000', '30000', '50000', '100000', 'pad_gold', 'in_review'];
const EVENTS_MAX = 50;

const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function createRevenueDemo(d) {
  const { Errors, createIssues, requireBody, onlyKeys, readQuery, UUID, MULTILINE_CONTROL_CHARS } = d;
  const db = () => d.getDb();
  const table = (name) => (db()[name] ??= []);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const mentora = () => db().users.find((u) => u.role === 'admin');
  const fieldError = (field, message) => Errors.validation([{ field, message }]);
  const entryOf = (student) => entryMonth(student.joinedOn, student.createdAt);

  // ---------------------------------------------------------------- leitura

  const entriesOf = (studentId) => table('studentRevenue').filter((r) => r.studentId === studentId).sort((a, b) => cmp(b.month, a.month));
  const recordsOf = (studentId) => table('revenueMilestones').filter((r) => r.studentId === studentId).sort((a, b) => a.milestone - b.milestone);

  /** Resumo (sem lançamentos): acumulado, marcos, próxima conquista e PAD GOLD (como summaryOf do servidor). */
  function summaryOf(student) {
    const rows = entriesOf(student.id);
    const entry = entryOf(student);
    const sum = summarize(rows, entry);
    const views = milestonesView(recordsOf(student.id), sum.total);
    const last = rows.reduce((acc, r) => (!acc || r.updatedAt > acc ? r.updatedAt : acc), null);
    return {
      entryMonth: entry, total: sum.total, monthCount: sum.monthCount, lastEntryAt: last, milestones: views, next: nextMilestone(sum.total, views), padGold: padGoldStatus(views),
      perEntry: sum.entries, rows,
    };
  }

  function fullView(student) {
    const { perEntry, rows, ...summary } = summaryOf(student);
    const byMonth = new Map(perEntry.map((e) => [e.month, e]));
    const entries = rows.map((r) => ({
      id: r.id, month: r.month, amount: r.amount, note: r.note, counts: byMonth.get(r.month).counts, cumulative: byMonth.get(r.month).cumulative,
      version: r.version, createdAt: r.createdAt, updatedAt: r.updatedAt,
    }));
    const events = table('studentRevenueEvents')
      .map((ev, index) => ({ ev, index }))
      .filter(({ ev }) => ev.studentId === student.id)
      .sort((a, b) => cmp(b.ev.createdAt, a.ev.createdAt) || b.index - a.index)
      .slice(0, EVENTS_MAX)
      .map(({ ev }) => ({ kind: ev.kind, month: ev.month, oldAmount: ev.oldAmount, newAmount: ev.newAmount, at: ev.createdAt }));
    return { ...summary, entries, events };
  }

  // ---------------------------------------------------------------- gravação

  const parseMonth = (raw) => {
    if (!isValidMonth(raw)) throw fieldError('month', 'Informe o mês no formato AAAA-MM.');
    return raw;
  };

  function readBody(body) {
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['amount', 'note', 'version'], issues);
    let amount;
    if (typeof b.amount !== 'number' && typeof b.amount !== 'string') issues.add('amount', 'Informe o valor.');
    else {
      const cents = parseAmount(b.amount);
      if (cents === null) issues.add('amount', 'Informe um valor entre R$ 0,00 e R$ 100.000.000,00, com até 2 casas decimais.');
      else amount = fromCents(cents);
    }
    let note = null;
    if (b.note !== undefined && b.note !== null) {
      if (typeof b.note !== 'string') issues.add('note', 'Dados inválidos.');
      else {
        const s = b.note.trim();
        if (s.length > NOTE_MAX) issues.add('note', `A observação é longa demais (máximo ${NOTE_MAX} caracteres).`);
        else if (MULTILINE_CONTROL_CHARS.test(s)) issues.add('note', 'A observação contém caracteres inválidos.');
        else note = s === '' ? null : s;
      }
    }
    if (b.version !== undefined && (!Number.isInteger(b.version) || b.version < 1)) issues.add('version', 'Informe a versão.');
    issues.throwIfAny();
    return { amount, note, version: b.version };
  }

  const addEvent = (student, month, kind, oldAmount, newAmount, at) =>
    table('studentRevenueEvents').push({ id: d.newId(), studentId: student.id, month, kind, oldAmount, newAmount, actorId: student.id, createdAt: at });

  /** Reavalia os marcos depois da gravação e grava as mudanças (nunca apaga nem recria um registro). */
  function reevaluate(student, at) {
    const { total } = summarize(entriesOf(student.id), entryOf(student));
    const before = recordsOf(student.id);
    const result = evaluateMilestones(before, total, at);
    if (result.changes.length > 0) {
      const after = applyMilestones(before, result, at).map((r) => ({ ...r, studentId: student.id }));
      db().revenueMilestones = [...table('revenueMilestones').filter((r) => r.studentId !== student.id), ...after];
    }
    return { changes: result.changes, reviewSince: at };
  }

  /** Avisos (aluna e mentora dona), com as chaves do servidor: nada duplica. `restored` volta a vigente em silêncio. */
  function notifyChanges(student, changes, reviewSince) {
    const owner = mentora();
    const now = d.stamp();
    // Um aviso de revisão por marco e por DIA (Brasília), como no servidor.
    const reviewDay = brasiliaDay(reviewSince);
    for (const change of changes) {
      const label = milestoneLabel(change.milestone) ?? String(change.milestone);
      if (change.kind === 'reached') {
        const key = `revenue-milestone:${student.id}:${change.milestone}`;
        d.addNotification(student, { kind: 'revenue_milestone', title: 'Marco de faturamento alcançado', body: `Você alcançou o marco ${label}.`, link: STUDENT_LINK, dedupeKey: key, createdAt: now });
        if (owner) d.addNotification(owner, { kind: 'revenue_milestone', title: 'Marco de faturamento', body: `${student.name} alcançou o marco ${label}.`, link: MENTORA_LINK, dedupeKey: key, createdAt: now });
        if (change.milestone === PAD_GOLD_MILESTONE) {
          const gold = `pad-gold:${student.id}`;
          d.addNotification(student, { kind: 'pad_gold', title: 'Você é PAD GOLD', body: 'Seu faturamento autodeclarado passou de R$ 100 mil.', link: STUDENT_LINK, dedupeKey: gold, createdAt: now });
          if (owner) d.addNotification(owner, { kind: 'pad_gold', title: 'Nova PAD GOLD', body: `${student.name} chegou ao status PAD GOLD.`, link: MENTORA_LINK, dedupeKey: gold, createdAt: now });
        }
      } else if (change.kind === 'in_review') {
        const key = `revenue-review:${student.id}:${change.milestone}:${reviewDay}`;
        if (owner) {
          d.addNotification(owner, {
            kind: 'revenue_review', title: 'Marco em revisão', body: `${student.name} · ${label}: o acumulado ficou abaixo do marco depois de uma correção.`, link: MENTORA_LINK, dedupeKey: key, createdAt: now,
          });
        }
        d.addNotification(student, { kind: 'revenue_review', title: 'Marco em revisão', body: `${label}: seu acumulado ficou abaixo do marco depois da correção.`, link: STUDENT_LINK, dedupeKey: key, createdAt: now });
      }
    }
  }

  function write(student, apply) {
    apply();
    const { changes, reviewSince } = reevaluate(student, d.stamp());
    const view = fullView(student);
    notifyChanges(student, changes, reviewSince);
    return { status: 200, body: { ...view, changes } };
  }

  function getRevenue(searchParams) {
    const u = d.requireStudent();
    readQuery(searchParams, {}, {});
    return { status: 200, body: fullView(u) };
  }

  function putRevenue(rawMonth, body) {
    const u = d.requireStudent();
    const month = parseMonth(rawMonth);
    const input = readBody(body);
    return write(u, () => {
      const state = monthState(month, entryOf(u), monthKey(d.clock()));
      if (state === 'future') throw fieldError('month', 'Escolha um mês até o mês atual.');
      if (state === 'before_entry') throw fieldError('month', 'Este mês é antes da sua entrada na mentoria.');
      const existing = table('studentRevenue').find((r) => r.studentId === u.id && r.month === month);
      const at = d.stamp();
      if (!existing) {
        table('studentRevenue').push({ id: d.newId(), studentId: u.id, month, amount: input.amount, note: input.note, version: 1, createdAt: at, updatedAt: at });
        addEvent(u, month, 'created', null, input.amount, at);
        return;
      }
      if (input.version === undefined || input.version !== existing.version) throw Errors.conflict('version_conflict', VERSION_CONFLICT);
      const old = existing.amount;
      Object.assign(existing, { amount: input.amount, note: input.note, version: existing.version + 1, updatedAt: at });
      addEvent(u, month, 'updated', old, input.amount, at);
    });
  }

  function deleteRevenue(rawMonth, searchParams) {
    const u = d.requireStudent();
    const month = parseMonth(rawMonth);
    const issues = createIssues();
    let version;
    for (const [key, raw] of searchParams) {
      if (key !== 'version') issues.add('', `Parâmetro não permitido: ${key}.`);
      else if (raw.trim() === '' || !Number.isInteger(Number(raw)) || Number(raw) < 1) issues.add('version', 'Informe a versão.');
      else version = Number(raw);
    }
    if (version === undefined && !issues.list.some((x) => x.field === 'version')) issues.add('version', 'Informe a versão.');
    issues.throwIfAny();
    return write(u, () => {
      const existing = table('studentRevenue').find((r) => r.studentId === u.id && r.month === month);
      if (!existing) throw Errors.notFound('Lançamento não encontrado.');
      if (existing.version !== version) throw Errors.conflict('version_conflict', VERSION_CONFLICT);
      db().studentRevenue = table('studentRevenue').filter((r) => r.id !== existing.id);
      addEvent(u, month, 'deleted', existing.amount, null, d.stamp());
    });
  }

  // ---------------------------------------------------------------- mentora (a dona; a equipe com `revenue.view` age como ela)

  const students = () => db().users.filter((u) => u.role === 'user');

  function mentoraStudentRevenue(id, searchParams) {
    d.requireAuth('admin');
    readQuery(searchParams, {}, {});
    const student = typeof id === 'string' && UUID.test(id) ? students().find((u) => u.id === id) : null;
    if (!student) throw Errors.notFound('Aluna não encontrada.');
    return { status: 200, body: fullView(student) };
  }

  /** Acumulado e PAD GOLD de uma aluna (lista de alunas da mentora, só com `revenue.view`). */
  function totalsOf(studentId) {
    const student = students().find((u) => u.id === studentId);
    if (!student) return null;
    const summary = summaryOf(student);
    return { revenueTotal: summary.total, padGold: summary.padGold };
  }

  const LIST_QUERY = {
    month: { pattern: /^\d{4}-(0[1-9]|1[0-2])$/, message: 'Informe o mês no formato AAAA-MM.' },
    q: 'text',
    phase: { int: [1, 4] },
    milestone: { enum: MILESTONE_FILTERS, message: 'Conquista inválida.' },
  };

  function mentoraRevenue(searchParams) {
    d.requireAuth('admin');
    const query = readQuery(searchParams, { ...LIST_QUERY, ...d.PAGING }, { ...d.PAGING_DEFAULTS });
    if (query.month !== undefined && !isValidMonth(query.month)) throw fieldError('month', 'Informe o mês no formato AAAA-MM.');
    const month = query.month ?? monthKey(d.clock());
    const all = students().map((s) => {
      const { perEntry, ...summary } = summaryOf(s);
      const monthEntry = perEntry.find((e) => e.month === month);
      const phase = d.phaseOf(s.id);
      return {
        studentId: s.id, studentName: s.name, phase, phaseLabel: phaseLabel(phase), monthAmount: monthEntry?.amount ?? null, monthCounts: monthEntry?.counts ?? false,
        total: summary.total, milestones: summary.milestones.map((m) => ({ milestone: m.milestone, status: m.status, reachedAt: m.reachedAt })), next: summary.next,
        padGold: summary.padGold, lastEntryAt: summary.lastEntryAt,
      };
    });
    const cents = (s) => toCents(s) ?? 0;
    const reachedIn = (at) => at !== null && monthKey(at) === month;
    // Resumo da mentoria inteira (antes dos filtros), como no servidor.
    const summary = {
      students: all.length,
      monthTotal: fromCents(all.reduce((t, r) => t + (r.monthAmount !== null && r.monthCounts ? cents(r.monthAmount) : 0), 0)),
      total: fromCents(all.reduce((t, r) => t + cents(r.total), 0)),
      padGold: all.filter((r) => r.padGold.status === 'active').length,
      inReview: all.filter((r) => r.milestones.some((m) => m.status === 'in_review')).length,
      reachedThisMonth: all.reduce((t, r) => t + r.milestones.filter((m) => reachedIn(m.reachedAt)).length, 0),
      padGoldThisMonth: all.filter((r) => r.padGold.status !== 'none' && reachedIn(r.padGold.reachedAt)).length,
    };
    const q = query.q ? fold(query.q.trim()) : '';
    const filtered = all.filter((r) => {
      if (q && !fold(r.studentName).includes(q)) return false;
      if (query.phase !== undefined && r.phase !== query.phase) return false;
      if (query.milestone === 'pad_gold') return r.padGold.status === 'active';
      if (query.milestone === 'in_review') return r.milestones.some((m) => m.status === 'in_review');
      if (query.milestone) return r.milestones.some((m) => m.milestone === Number(query.milestone) && m.status === 'active');
      return true;
    });
    filtered.sort((a, b) => cents(b.total) - cents(a.total) || a.studentName.localeCompare(b.studentName, 'pt-BR') || a.studentId.localeCompare(b.studentId));
    return {
      status: 200,
      body: {
        month,
        rows: filtered.slice(query.offset, query.offset + query.limit).map((row) => {
          const out = { ...row };
          delete out.monthCounts;
          return out;
        }),
        total: filtered.length,
        summary,
      },
    };
  }

  const SEG = '([^/]+)';
  const routes = [
    ['GET', /^revenue$/, (_m, q) => getRevenue(q)],
    ['PUT', new RegExp(`^revenue/${SEG}$`), (m, _q, body) => putRevenue(m[1], body)],
    ['DELETE', new RegExp(`^revenue/${SEG}$`), (m, q) => deleteRevenue(m[1], q)],
    ['GET', /^mentora\/revenue$/, (_m, q) => mentoraRevenue(q)],
    ['GET', new RegExp(`^mentora/students/${SEG}/revenue$`), (m, q) => mentoraStudentRevenue(m[1], q)],
  ];

  /** Depois de mudar a entrada da aluna (PATCH /students/:id com joinedOn): reavalia e avisa como numa gravação de faturamento. */
  function reevaluateStudent(student) {
    const { changes, reviewSince } = reevaluate(student, d.stamp());
    notifyChanges(student, changes, reviewSince);
    return changes;
  }

  return { routes, totalsOf, reevaluateStudent };
}
