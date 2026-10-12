// Painel da mentora, lista enriquecida, Perfil (crescimento, notas privadas e sessões) e sessões na visão da aluna, na demonstração.
// As mesmas regras e formatos do servidor (server/src/services/mentora-panel.ts + funções SQL da migração 0019) sobre o estado em memória.
// Só sinais de mentoria: o mock nunca devolve R$, pessoas, leads, empresas, oportunidades, tarefas nem alvos de meta.
import { CATEGORY_LABELS } from './growth-data.js';
import { ACTIVE_BAND_IDS, bandOf, compareActive, countError, deltaMonth, lastMonths, networkTotals, upsertMonth } from '../shared/active-students.js';
import {
  activityLabel,
  ATTENTION_ORDER,
  attentionFor,
  average,
  evolutionPct,
  highlightLabel,
  isAtRisk,
  lastSeen,
  MAX_ATTENTION,
  progressToNextPct,
  sessionWhenText,
  SESSION_MODE_LABELS,
  SESSION_MODES,
  SESSION_STATUSES,
  weekBounds,
  INACTIVE_DAYS,
} from './mentora-data.js';

const DAY = 86_400_000;
const MINUTE = 60_000;
const TZ = 180; // dia do XP: Brasília, como o servidor
const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const VERSION_CONFLICT = 'Esta sessão foi alterada em outra aba ou outro dispositivo. Recarregue e tente de novo.';
const SORTS = ['name', 'progress', 'level', 'last_login', 'activity', 'activeStudents'];

export function createMentoraDemo(d) {
  const db = () => d.getDb();
  const { Errors, createIssues, requireBody, onlyKeys, readVersion } = d;
  const localDay = (iso) => new Date(Date.parse(iso) - TZ * MINUTE).toISOString().slice(0, 10);
  const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  const levelName = (n) => d.LEVELS[n - 1]?.name ?? d.LEVELS[0].name;
  const levelDto = (n) => ({ n, name: levelName(n) });

  // "Alunas ativas": número auto-informado por cada aluna (nunca calculado do CRM). Contrato em docs/design/HANDOFF.md.
  const activeOf = (u, now) => {
    const a = u.activeStudents;
    const last = a?.history?.at(-1);
    if (!last) return { count: null, updatedAt: null, deltaMonth: null };
    return { count: last.count, updatedAt: a.updatedAt, deltaMonth: deltaMonth(a.history, now.toISOString()) };
  };
  const activeDetail = (u, now) => ({ ...activeOf(u, now), history: lastMonths(u.activeStudents?.history ?? [], now.toISOString()) });

  const mentora = () => db().users.find((u) => u.role === 'admin');
  const students = () => db().users.filter((u) => u.role === 'user');
  const studentOf = (id) => {
    const found = d.UUID.test(String(id)) ? students().find((u) => u.id === id) : null;
    if (!found) throw Errors.notFound('Aluna não encontrada.');
    return found;
  };

  // ---------------------------------------------------------------- sinais (espelho das funções SQL)

  function signalsOf(u, now) {
    const events = db().xpEvents.filter((e) => e.ownerId === u.id);
    const today = localDay(now.toISOString());
    const month = today.slice(0, 7);
    const dayCounts = new Map();
    let total = 0;
    let monthXp = 0;
    let weekXp = 0;
    let last = null;
    for (const e of events) {
      total += e.points;
      const day = localDay(e.occurredAt);
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      if (day.slice(0, 7) === month) monthXp += e.points;
      if (day > addDays(today, -7) && day <= today) weekXp += e.points;
      if (last === null || e.occurredAt > last) last = e.occurredAt;
    }
    const activity = Array.from({ length: 14 }, (_, k) => dayCounts.get(addDays(today, -(13 - k))) ?? 0);
    let days28 = 0;
    for (let k = 0; k < 28; k++) if ((dayCounts.get(addDays(today, -k)) ?? 0) > 0) days28++;
    const goals = d.goalCounts(u, TZ);
    return {
      studentId: u.id,
      xpTotal: total,
      xpMonth: monthXp,
      xpWeek: weekXp,
      levelN: d.levelFor(total).level,
      goalsTotal: goals.total,
      goalsOk: goals.ok,
      lastActivityAt: last ? new Date(last) : null,
      activity,
      activeDays28: days28,
    };
  }

  function enrollmentsOf(studentId) {
    const mentoraId = mentora().id;
    return db()
      .challengeEnrollments.filter((e) => e.userId === studentId)
      .map((e) => {
        const c = db().challenges.find((x) => x.id === e.challengeId);
        if (!c || c.mentoraId !== mentoraId || c.status !== 'published') return null;
        // Privacidade (A1): só as ações marcadas pela aluna; as automáticas medem o CRM dela e não aparecem por aluna.
        const manual = c.actions.filter((a) => a.kind === 'manual');
        const ids = new Set(manual.map((a) => a.id));
        const doneRows = db().challengeProgress.filter((p) => p.userId === studentId && ids.has(p.actionId));
        const lastDone = doneRows.map((p) => p.doneAt).sort().at(-1) ?? null;
        return {
          challengeId: c.id,
          title: c.title,
          endsOn: c.endsOn,
          joinedAt: new Date(e.joinedAt),
          completedAt: e.completedAt && !c.actions.some((a) => a.kind !== 'manual') ? new Date(e.completedAt) : null,
          total: manual.length,
          done: doneRows.length,
          lastDoneAt: lastDone ? new Date(lastDone) : null,
        };
      })
      .filter(Boolean);
  }

  // Conquistas medidas pelo CRM da aluna nunca entram em contagem ou lista por aluna (A1).
  const CRM_RULES = ['revenue_won_total', 'deals_won_count', 'people_count', 'leads_converted_count', 'tasks_done_count'];
  const visibleCatalog = () => db().achievements.filter((a) => a.mentoraId === mentora().id && a.active && !a.archivedAt && !CRM_RULES.includes(a.ruleKind));
  /** Atividades recentes sem os eventos que revelariam um limiar do CRM (conquista de CRM, ação automática de desafio). */
  function maskedRecent(events) {
    const hidden = new Set();
    for (const a of db().achievements) if (CRM_RULES.includes(a.ruleKind)) hidden.add(`ach:${a.id}`);
    for (const c of db().challenges) {
      if (c.actions.some((x) => x.kind !== 'manual')) hidden.add(`chal:${c.id}`);
      for (const x of c.actions) if (x.kind !== 'manual') hidden.add(`chal-action:${x.id}`);
    }
    return events.filter((e) => !hidden.has(e.dedupeKey));
  }

  function roster(now) {
    const today = localDay(now.toISOString());
    const catalog = visibleCatalog();
    const catalogIds = new Set(catalog.map((a) => a.id));
    const items = students().map((u) => {
      const signals = signalsOf(u, now);
      const stalledRow = enrollmentsOf(u.id).find(
        (e) => !e.completedAt && e.endsOn >= today && e.done < e.total && now.getTime() - (e.lastDoneAt ?? e.joinedAt).getTime() >= INACTIVE_DAYS * DAY,
      );
      const dto = d.studentDto(u);
      const input = {
        id: u.id,
        name: u.name,
        status: dto.status,
        createdAt: new Date(u.createdAt),
        lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null,
        lastActivityAt: signals.lastActivityAt,
        stalledChallenge: stalledRow?.title ?? null,
      };
      return {
        student: dto,
        signals,
        levelN: signals.levelN,
        progressPct: progressToNextPct(signals.xpTotal, d.levelFor),
        activeDays14: signals.activity.filter((n) => n > 0).length,
        atRisk: isAtRisk(input, now),
        attention: attentionFor(input, now),
        achievementsUnlocked: db().achievementUnlocks.filter((x) => x.userId === u.id && catalogIds.has(x.achievementId)).length,
      };
    });
    return { items, achievementTotal: catalog.length };
  }

  const person = (i) => ({ id: i.student.id, name: i.student.name, avatarUrl: i.student.avatarUrl, className: i.student.className });

  // ---------------------------------------------------------------- painel

  function monthlySeries(now, months) {
    const today = localDay(now.toISOString());
    const [y, m] = today.slice(0, 7).split('-').map(Number);
    const keys = Array.from({ length: months }, (_, k) => {
      const index = y * 12 + (m - 1) - (months - 1 - k);
      return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
    });
    const todayDom = Number(today.slice(8, 10));
    const mine = new Set(students().map((s) => s.id));
    const events = db().xpEvents.filter((e) => mine.has(e.ownerId));
    return keys.map((key) => {
      const [yy, mm] = key.split('-').map(Number);
      const nextKey = `${yy + (mm === 12 ? 1 : 0)}-${String((mm % 12) + 1).padStart(2, '0')}`;
      const inMonth = events.filter((e) => localDay(e.occurredAt).slice(0, 7) === key);
      return {
        month: key,
        students: students().filter((s) => localDay(s.createdAt).slice(0, 7) < nextKey).length,
        xpTotal: inMonth.reduce((n, e) => n + e.points, 0),
        xpToDate: inMonth.filter((e) => Number(localDay(e.occurredAt).slice(8, 10)) <= todayDom).reduce((n, e) => n + e.points, 0),
        goalsReached: inMonth.filter((e) => e.kind === 'goal_reached').length,
      };
    });
  }

  const statusOfStudent = (u) => d.studentDto(u).status;

  function overview() {
    d.requireAuth('admin');
    const now = d.clock();
    const { items } = roster(now);
    const week = weekBounds(now, TZ);
    const series = monthlySeries(now, 6);
    const today = localDay(now.toISOString());
    const mine = new Set(students().map((s) => s.id));
    const dayTotals = new Map();
    for (const e of db().xpEvents) if (mine.has(e.ownerId)) dayTotals.set(localDay(e.occurredAt), (dayTotals.get(localDay(e.occurredAt)) ?? 0) + 1);
    const active = items.filter((i) => i.student.status === 'active');
    const kpis = {
      totalStudents: items.length,
      activeStudents: active.length,
      pendingInvites: items.filter((i) => i.student.status === 'invite_pending').length,
      expiredInvites: items.filter((i) => i.student.status === 'invite_expired').length,
      neverAccessed: items.filter((i) => i.student.lastLoginAt === null && i.student.status !== 'inactive').length,
      accessedLast24h: items.filter((i) => i.student.lastLoginAt && now.getTime() - Date.parse(i.student.lastLoginAt) <= DAY).length,
      atRisk: items.filter((i) => i.atRisk).length,
      sessionsThisWeek: db().mentoringSessions.filter((s) => s.mentoraId === mentora().id && s.status === 'scheduled' && Date.parse(s.startsAt) >= week.start && Date.parse(s.startsAt) < week.end).length,
    };
    const current = series.at(-1);
    const previous = series.at(-2);
    const findings = items
      .filter((i) => i.attention)
      .map((i) => ({ item: i, finding: i.attention }))
      .sort(
        (a, b) =>
          ATTENTION_ORDER.indexOf(a.finding.reason) - ATTENTION_ORDER.indexOf(b.finding.reason) ||
          (b.finding.days ?? 0) - (a.finding.days ?? 0) ||
          a.item.student.name.localeCompare(b.item.student.name, 'pt-BR'),
      );
    const actionsFor = (reason, status) => {
      const view = { key: 'view', label: 'Ver aluna' };
      if (reason === 'invite_expired' || reason === 'never_accessed') return [{ key: 'resend_invite', label: status === 'no_invite' ? 'Enviar convite' : 'Reenviar convite' }, view];
      if (reason === 'inactive' || reason === 'stalled_challenge') return [{ key: 'schedule', label: 'Marcar sessão' }, view];
      return [view];
    };
    const classes = new Map();
    for (const i of items.filter((x) => x.student.status !== 'inactive')) {
      const key = i.student.className?.trim() || 'Sem turma';
      classes.set(key, [...(classes.get(key) ?? []), i.progressPct]);
    }
    const highlights = items
      .filter((i) => i.signals.xpWeek > 0)
      .sort((a, b) => b.signals.xpWeek - a.signals.xpWeek || a.student.name.localeCompare(b.student.name, 'pt-BR'))
      .slice(0, 3)
      .map((i) => ({
        ...person(i),
        level: levelDto(i.levelN),
        weekXp: i.signals.xpWeek,
        label: highlightLabel({ xpTotal: i.signals.xpTotal, weekXp: i.signals.xpWeek, goalsOk: i.signals.goalsOk, goalsTotal: i.signals.goalsTotal, activeDays14: i.activeDays14 }, d.levelFor),
      }));
    return {
      status: 200,
      body: {
        hero: {
          students: kpis.totalStudents,
          active: kpis.activeStudents,
          evolutionPct: current && previous ? evolutionPct(current.xpToDate, previous.xpToDate) : null,
          progressAvg: average(active.map((i) => i.progressPct)),
        },
        attention: {
          total: findings.length,
          items: findings.slice(0, MAX_ATTENTION).map(({ item, finding }) => ({
            ...person(item),
            status: item.student.status,
            reason: finding.reason,
            text: finding.text,
            actions: actionsFor(finding.reason, item.student.status),
            link: `#/alunas/${item.student.id}`,
          })),
        },
        kpis,
        network: networkTotals(students().filter((u) => statusOfStudent(u) !== 'inactive').map((u) => activeOf(u, now).count)),
        evolution: series.map((p) => {
          const [y, m] = p.month.split('-');
          return {
            month: p.month,
            label: `${SHORT_MONTHS[Number(m) - 1]}${y !== String(now.getUTCFullYear()) ? `/${y.slice(2)}` : ''}`,
            avgXp: p.students > 0 ? Math.round(p.xpTotal / p.students) : 0,
            goalsReached: p.goalsReached,
          };
        }),
        byClass: [...classes.entries()]
          .map(([className, pcts]) => ({ className, students: pcts.length, avgProgressPct: average(pcts) }))
          .sort((a, b) => b.students - a.students || a.className.localeCompare(b.className, 'pt-BR')),
        activity: Array.from({ length: 14 }, (_, k) => {
          const day = addDays(today, -(13 - k));
          return { day, events: dayTotals.get(day) ?? 0 };
        }),
        highlights,
      },
    };
  }

  // ---------------------------------------------------------------- lista

  const LIST_QUERY = {
    q: 'text',
    status: { enum: [...d.STUDENT_STATUSES, 'at_risk'], message: 'Estado inválido.' },
    className: 'text',
    activeStudents: { enum: ACTIVE_BAND_IDS, message: 'Faixa de alunas ativas inválida.' },
    sort: { enum: SORTS },
    order: { enum: ['asc', 'desc'] },
    ...d.PAGING,
  };

  function listStudents(searchParams) {
    d.requireAuth('admin');
    const query = d.readQuery(searchParams, LIST_QUERY, { sort: 'name', order: 'asc', ...d.PAGING_DEFAULTS });
    const now = d.clock();
    const { items } = roster(now);
    const activeById = new Map(students().map((u) => [u.id, activeOf(u, now)]));
    const q = query.q ? d.fold(query.q) : '';
    const classKey = query.className === undefined ? undefined : query.className === '__none__' ? '' : query.className.toLowerCase();
    const scoped = items.filter((i) => {
      if (q && !d.fold(`${i.student.name} ${i.student.email}`).includes(q)) return false;
      if (classKey !== undefined) {
        const cls = i.student.className?.trim().toLowerCase() ?? '';
        if (classKey === '' ? cls !== '' : cls !== classKey) return false;
      }
      return true;
    });
    const counts = { all: scoped.length, at_risk: scoped.filter((i) => i.atRisk).length };
    for (const s of ['active', 'invite_pending', 'invite_expired', 'no_invite', 'blocked', 'inactive']) counts[s] = scoped.filter((i) => i.student.status === s).length;
    const byStatus = scoped.filter((i) => (query.status === undefined ? true : query.status === 'at_risk' ? i.atRisk : i.student.status === query.status));
    // Contagem por faixa respeita busca, turma e estado, mas não a própria faixa (para mostrar quantas teria cada uma).
    const activeCounts = Object.fromEntries(ACTIVE_BAND_IDS.map((id) => [id, 0]));
    for (const i of byStatus) activeCounts[bandOf(activeById.get(i.student.id).count)] += 1;
    const filtered = byStatus.filter((i) => query.activeStudents === undefined || bandOf(activeById.get(i.student.id).count) === query.activeStudents);
    const dir = query.order === 'asc' ? 1 : -1;
    const key = (i) => {
      switch (query.sort) {
        case 'progress': return i.levelN * 1000 + i.progressPct;
        case 'level': return i.signals.xpTotal;
        case 'activity': return i.activeDays14;
        case 'last_login': return i.student.lastLoginAt ? Date.parse(i.student.lastLoginAt) : -1;
        default: return i.student.name;
      }
    };
    filtered.sort((a, b) => {
      if (query.sort === 'activeStudents') {
        const byActive = compareActive(activeById.get(a.student.id).count, activeById.get(b.student.id).count, query.order);
        return byActive || a.student.name.localeCompare(b.student.name, 'pt-BR') || a.student.id.localeCompare(b.student.id);
      }
      const ka = key(a);
      const kb = key(b);
      const c = typeof ka === 'string' ? ka.localeCompare(kb, 'pt-BR') : ka - kb;
      return c * dir || a.student.name.localeCompare(b.student.name, 'pt-BR') || a.student.id.localeCompare(b.student.id);
    });
    const classNames = [...new Set(items.map((i) => i.student.className?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      status: 200,
      body: {
        data: filtered.slice(query.offset, query.offset + query.limit).map((i) => ({
          id: i.student.id,
          name: i.student.name,
          email: i.student.email,
          avatarUrl: i.student.avatarUrl,
          className: i.student.className,
          status: i.student.status,
          lastLoginAt: i.student.lastLoginAt,
          level: levelDto(i.levelN),
          progressPct: i.progressPct,
          xpMonth: i.signals.xpMonth,
          goals: { ok: i.signals.goalsOk, total: i.signals.goalsTotal },
          activity: i.signals.activity,
          activeDays14: i.activeDays14,
          atRisk: i.atRisk,
          activeStudents: activeById.get(i.student.id),
        })),
        page: { limit: query.limit, offset: query.offset, total: filtered.length },
        counts,
        activeCounts,
        classNames,
      },
    };
  }

  // ---------------------------------------------------------------- perfil: crescimento

  const sessionDto = (s) => ({
    id: s.id,
    studentId: s.studentId,
    startsAt: s.startsAt,
    endsAt: new Date(Date.parse(s.startsAt) + s.durationMin * MINUTE).toISOString(),
    durationMin: s.durationMin,
    mode: s.mode,
    modeLabel: SESSION_MODE_LABELS[s.mode],
    topic: s.topic,
    status: s.status,
    version: s.version,
  });

  const nextSessionOf = (studentId, now) =>
    db()
      .mentoringSessions.filter((s) => s.mentoraId === mentora().id && s.studentId === studentId && s.status === 'scheduled' && Date.parse(s.startsAt) + s.durationMin * MINUTE >= now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))[0] ?? null;

  function growth(id) {
    d.requireAuth('admin');
    const u = studentOf(id);
    const now = d.clock();
    const today = localDay(now.toISOString());
    const sig = signalsOf(u, now);
    const info = d.levelFor(sig.xpTotal);
    const catalog = visibleCatalog();
    const unlocked = db()
      .achievementUnlocks.filter((x) => x.userId === u.id)
      .map((x) => ({ unlock: x, a: catalog.find((c) => c.id === x.achievementId) }))
      .filter((x) => x.a)
      .sort((p, q) => q.unlock.unlockedAt.localeCompare(p.unlock.unlockedAt) || p.a.id.localeCompare(q.a.id));
    const recent = maskedRecent(db().xpEvents.filter((e) => e.ownerId === u.id))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10);
    const next = nextSessionOf(u.id, now);
    const dto = d.studentDto(u);
    return {
      status: 200,
      body: {
        studentId: u.id,
        level: levelDto(info.level),
        xp: sig.xpTotal,
        xpMonth: sig.xpMonth,
        progressPct: progressToNextPct(sig.xpTotal, d.levelFor),
        next: info.nextLevel ? { n: info.nextLevel, name: info.nextName, missing: info.xpToNext } : null,
        goals: { ok: sig.goalsOk, total: sig.goalsTotal },
        achievements: {
          unlocked: unlocked.length,
          total: Math.max(catalog.length, unlocked.length),
          items: unlocked.slice(0, 12).map(({ unlock, a }) => ({ id: a.id, title: a.title, category: a.category, categoryLabel: CATEGORY_LABELS[a.category] ?? a.category, unlockedAt: unlock.unlockedAt })),
        },
        challenges: enrollmentsOf(u.id).map((e) => ({
          id: e.challengeId,
          title: e.title,
          endsOn: e.endsOn,
          state: e.completedAt ? 'completed' : e.endsOn < today ? 'ended' : 'active',
          done: e.done,
          total: e.total,
          pct: e.total > 0 ? Math.floor((e.done / e.total) * 100) : 0,
        })),
        activeStudents: activeDetail(u, now),
        activity: { last14: sig.activity, activeDays14: sig.activity.filter((n) => n > 0).length, activeDays28: sig.activeDays28 },
        lastAccessAt: dto.lastLoginAt,
        lastActivityAt: lastSeen({ lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null, lastActivityAt: sig.lastActivityAt })?.toISOString() ?? null,
        recent: recent.map((r) => ({ label: activityLabel(r.kind), points: r.points, occurredAt: r.occurredAt })),
        nextSession: next ? sessionDto(next) : null,
      },
    };
  }

  // ---------------------------------------------------------------- notas

  const noteDto = (n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, updatedAt: n.updatedAt });

  function readNoteBody(body) {
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['body'], issues);
    let text;
    if (typeof b.body !== 'string' || b.body.trim() === '') issues.add('body', 'Escreva a nota.');
    else if (b.body.trim().length > 2000) issues.add('body', 'A nota é longa demais (máximo 2.000 caracteres).');
    else if (d.MULTILINE_CONTROL_CHARS.test(b.body.trim())) issues.add('body', 'A nota contém caracteres inválidos.');
    else text = b.body.trim();
    issues.throwIfAny();
    return text;
  }

  const findNote = (studentId, noteId) => {
    const note = d.UUID.test(String(noteId)) ? db().mentoriaNotes.find((n) => n.id === noteId && n.studentId === studentId && n.mentoraId === mentora().id) : null;
    if (!note) throw Errors.notFound('Nota não encontrada.');
    return note;
  };

  function listNotes(id, searchParams) {
    d.requireAuth('admin');
    d.readQuery(searchParams, {}, {});
    const u = studentOf(id);
    const rows = db().mentoriaNotes.filter((n) => n.studentId === u.id && n.mentoraId === mentora().id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    return { status: 200, body: { data: rows.map(noteDto) } };
  }

  function createNote(id, body) {
    d.requireAuth('admin');
    const u = studentOf(id);
    const text = readNoteBody(body);
    const at = d.stamp();
    const note = { id: d.newId(), mentoraId: mentora().id, studentId: u.id, body: text, createdAt: at, updatedAt: at };
    db().mentoriaNotes.push(note);
    return { status: 201, body: noteDto(note) };
  }

  function patchNote(id, noteId, body) {
    d.requireAuth('admin');
    const u = studentOf(id);
    const text = readNoteBody(body);
    const note = findNote(u.id, noteId);
    note.body = text;
    note.updatedAt = d.stamp();
    return { status: 200, body: noteDto(note) };
  }

  function deleteNote(id, noteId) {
    d.requireAuth('admin');
    const u = studentOf(id);
    const note = findNote(u.id, noteId);
    db().mentoriaNotes = db().mentoriaNotes.filter((n) => n.id !== note.id);
    return { status: 204 };
  }

  // ---------------------------------------------------------------- sessões

  function assertFuture(iso, now) {
    const at = Date.parse(iso);
    if (at < now.getTime() - 5 * MINUTE) throw Errors.validation([{ field: 'startsAt', message: 'Escolha um horário a partir de agora.' }]);
    if (at > now.getTime() + 400 * DAY) throw Errors.validation([{ field: 'startsAt', message: 'Escolha uma data dentro dos próximos 12 meses.' }]);
  }

  function readSessionFields(b, issues, { patch }) {
    const out = {};
    if (!patch || b.startsAt !== undefined) {
      if (typeof b.startsAt !== 'string' || !d.ISO_INSTANT.test(b.startsAt) || Number.isNaN(Date.parse(b.startsAt))) issues.add('startsAt', 'Informe uma data e hora válidas.');
      else out.startsAt = new Date(Date.parse(b.startsAt)).toISOString();
    }
    if (b.durationMin !== undefined) {
      if (!Number.isInteger(b.durationMin)) issues.add('durationMin', 'A duração precisa ser em minutos inteiros.');
      else if (b.durationMin < 15) issues.add('durationMin', 'A duração mínima é 15 minutos.');
      else if (b.durationMin > 240) issues.add('durationMin', 'A duração máxima é 240 minutos.');
      else out.durationMin = b.durationMin;
    } else if (!patch) out.durationMin = 60;
    if (b.mode !== undefined) {
      if (!SESSION_MODES.includes(b.mode)) issues.add('mode', 'Formato inválido.');
      else out.mode = b.mode;
    } else if (!patch) out.mode = 'individual';
    if (b.topic !== undefined) {
      if (typeof b.topic !== 'string') issues.add('topic', 'Dados inválidos.');
      else if (b.topic.trim().length > 120) issues.add('topic', 'O assunto é longo demais (máximo 120).');
      else if (d.CONTROL_CHARS.test(b.topic.trim())) issues.add('topic', 'O assunto contém caracteres inválidos.');
      else out.topic = b.topic.trim();
    } else if (!patch) out.topic = '';
    return out;
  }

  const findSession = (studentId, sessionId) => {
    const row = d.UUID.test(String(sessionId)) ? db().mentoringSessions.find((s) => s.id === sessionId && s.studentId === studentId && s.mentoraId === mentora().id) : null;
    if (!row) throw Errors.notFound('Sessão não encontrada.');
    return row;
  };

  function notifyScheduled(student, session, now) {
    d.addNotification(student, {
      kind: 'mentoring_session_scheduled',
      title: 'Mentoria marcada',
      body: `${SESSION_MODE_LABELS[session.mode]}, ${sessionWhenText(new Date(session.startsAt), db().preferences[student.id]?.timezone)}${session.topic ? `: ${session.topic}` : ''}`,
      link: '#/calendario',
      dedupeKey: `mentoring-session:${session.id}:${Math.floor(Date.parse(session.startsAt) / 1000)}`,
      createdAt: now.toISOString(),
    });
  }

  function listSessions(id, searchParams) {
    d.requireAuth('admin');
    d.readQuery(searchParams, {}, {});
    const u = studentOf(id);
    const rows = db().mentoringSessions.filter((s) => s.studentId === u.id && s.mentoraId === mentora().id).sort((a, b) => b.startsAt.localeCompare(a.startsAt) || a.id.localeCompare(b.id)).slice(0, 100);
    const next = nextSessionOf(u.id, d.clock());
    return { status: 200, body: { data: rows.map(sessionDto), next: next ? sessionDto(next) : null } };
  }

  function createSession(id, body) {
    d.requireAuth('admin');
    const u = studentOf(id);
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['startsAt', 'durationMin', 'mode', 'topic'], issues);
    const fields = readSessionFields(b, issues, { patch: false });
    issues.throwIfAny();
    const now = d.clock();
    assertFuture(fields.startsAt, now);
    const at = d.stamp();
    const row = { id: d.newId(), mentoraId: mentora().id, studentId: u.id, ...fields, status: 'scheduled', version: 1, createdAt: at, updatedAt: at };
    db().mentoringSessions.push(row);
    notifyScheduled(u, row, now);
    return { status: 201, body: sessionDto(row) };
  }

  function patchSession(id, sessionId, body) {
    d.requireAuth('admin');
    const u = studentOf(id);
    const b = requireBody(body);
    const issues = createIssues();
    const FIELDS = ['startsAt', 'durationMin', 'mode', 'topic', 'status'];
    onlyKeys(b, [...FIELDS, 'version'], issues);
    const fields = readSessionFields(b, issues, { patch: true });
    if (b.status !== undefined) {
      if (!SESSION_STATUSES.includes(b.status)) issues.add('status', 'Situação inválida.');
      else fields.status = b.status;
    }
    const version = readVersion(b.version, issues);
    issues.throwIfAny();
    const now = d.clock();
    if (fields.startsAt) assertFuture(fields.startsAt, now);
    const row = findSession(u.id, sessionId);
    if (row.version !== version) throw Errors.conflict('version_conflict', VERSION_CONFLICT);
    Object.assign(row, fields, { version: row.version + 1, updatedAt: d.stamp() });
    if (fields.startsAt !== undefined && row.status === 'scheduled') notifyScheduled(u, row, now);
    return { status: 200, body: sessionDto(row) };
  }

  function deleteSession(id, sessionId) {
    d.requireAuth('admin');
    const u = studentOf(id);
    const row = findSession(u.id, sessionId);
    db().mentoringSessions = db().mentoringSessions.filter((s) => s.id !== row.id);
    return { status: 204 };
  }

  const RANGE = { from: 'iso', to: 'iso' };

  function readRange(searchParams) {
    const q = d.readQuery(searchParams, RANGE, {});
    const issues = createIssues();
    if (!q.from) issues.add('from', 'Informe o início.');
    if (!q.to) issues.add('to', 'Informe o fim.');
    issues.throwIfAny();
    const from = Date.parse(q.from);
    const to = Date.parse(q.to);
    if (!(to > from) || to - from > 62 * DAY) throw Errors.validation([{ field: 'to', message: 'Período inválido (máximo 62 dias).' }]);
    return { from, to };
  }

  function sessionsRange(searchParams) {
    d.requireAuth('admin');
    const { from, to } = readRange(searchParams);
    const ids = new Map(students().map((s) => [s.id, s.name]));
    const rows = db()
      .mentoringSessions.filter((s) => s.mentoraId === mentora().id && ids.has(s.studentId) && Date.parse(s.startsAt) >= from && Date.parse(s.startsAt) < to)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))
      .slice(0, 500);
    return { status: 200, body: { data: rows.map((s) => ({ ...sessionDto(s), studentName: ids.get(s.studentId) })) } };
  }

  // ---------------------------------------------------------------- alunas ativas (a aluna informa o próprio número)

  function getOwnActive(searchParams) {
    const u = d.requireStudent();
    d.readQuery(searchParams, {}, {});
    return { status: 200, body: activeDetail(u, d.clock()) };
  }

  function putOwnActive(body) {
    const u = d.requireStudent();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['count'], issues);
    if (b.count === undefined || b.count === null) issues.add('count', 'Informe quantas alunas ativas você tem hoje.');
    else {
      const problem = countError(b.count);
      if (problem) issues.add('count', problem);
    }
    issues.throwIfAny();
    const now = d.clock();
    u.activeStudents = { history: upsertMonth(u.activeStudents?.history ?? [], b.count, now.toISOString()), updatedAt: d.stamp() };
    return { status: 200, body: activeDetail(u, now) };
  }

  // ---------------------------------------------------------------- lado da aluna (somente leitura)

  function studentSessions(searchParams) {
    const u = d.requireStudent();
    const { from, to } = readRange(searchParams);
    const rows = db()
      .mentoringSessions.filter((s) => s.studentId === u.id && s.status !== 'cancelled' && Date.parse(s.startsAt) >= from && Date.parse(s.startsAt) < to)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))
      .slice(0, 200);
    return { status: 200, body: { data: rows.map(sessionDto) } };
  }

  function studentNext(searchParams) {
    const u = d.requireStudent();
    d.readQuery(searchParams, {}, {});
    const now = d.clock();
    const row = db()
      .mentoringSessions.filter((s) => s.studentId === u.id && s.status === 'scheduled' && Date.parse(s.startsAt) + s.durationMin * MINUTE >= now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))[0];
    return { status: 200, body: { next: row ? sessionDto(row) : null } };
  }

  const SEG = '([^/]+)';
  return {
    routes: [
      ['GET', /^mentora\/overview$/, (_m, q) => {
        d.readQuery(q, {}, {});
        return overview();
      }],
      ['GET', /^mentora\/students$/, (_m, q) => listStudents(q)],
      ['GET', new RegExp(`^mentora/students/${SEG}/growth$`), (m, q) => {
        d.readQuery(q, {}, {});
        return growth(m[1]);
      }],
      ['GET', new RegExp(`^mentora/students/${SEG}/notes$`), (m, q) => listNotes(m[1], q)],
      ['POST', new RegExp(`^mentora/students/${SEG}/notes$`), (m, _q, body) => createNote(m[1], body)],
      ['PATCH', new RegExp(`^mentora/students/${SEG}/notes/${SEG}$`), (m, _q, body) => patchNote(m[1], m[2], body)],
      ['DELETE', new RegExp(`^mentora/students/${SEG}/notes/${SEG}$`), (m) => deleteNote(m[1], m[2])],
      ['GET', new RegExp(`^mentora/students/${SEG}/sessions$`), (m, q) => listSessions(m[1], q)],
      ['POST', new RegExp(`^mentora/students/${SEG}/sessions$`), (m, _q, body) => createSession(m[1], body)],
      ['PATCH', new RegExp(`^mentora/students/${SEG}/sessions/${SEG}$`), (m, _q, body) => patchSession(m[1], m[2], body)],
      ['DELETE', new RegExp(`^mentora/students/${SEG}/sessions/${SEG}$`), (m) => deleteSession(m[1], m[2])],
      ['GET', /^mentora\/sessions$/, (_m, q) => sessionsRange(q)],
      ['GET', /^account\/active-students$/, (_m, q) => getOwnActive(q)],
      ['PUT', /^account\/active-students$/, (_m, _q, body) => putOwnActive(body)],
      ['GET', /^mentoring\/sessions$/, (_m, q) => studentSessions(q)],
      ['GET', /^mentoring\/next$/, (_m, q) => studentNext(q)],
    ],
  };
}
