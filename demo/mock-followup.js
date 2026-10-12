// Acompanhamento semanal (engajamento, plano de ação, check-ins) e Relatórios da mentoria, na demonstração.
// As mesmas regras e formatos do servidor (server/src/services/mentora-followup.ts + funções SQL da migração 0020) sobre o estado em memória.
// Só sinais de mentoria: o mock nunca devolve R$, pessoas, leads, empresas, oportunidades, tarefas nem alvos de meta.
// Diferença consciente: o servidor conta "uso por módulo" nas tabelas de cada módulo; a demonstração só tem CRM para a aluna demo,
// então conta os eventos de XP de cada tipo (tarefa concluída, lead, oportunidade ganha, pessoa, meta, desafio) e as empresas cadastradas.
import {
  addDays,
  CHECKIN_NOTE_MAX,
  checkinDateError,
  daysInWindow,
  dueOf,
  elapsedDaysOf,
  FOLLOWUP_TZ,
  FOLLOWUP_WEEKS,
  mondayOf,
  MODULE_LABELS,
  MODULES,
  meanPct,
  periodEngagement,
  PLAN_MAX,
  riskCompare,
  STATE_LABELS,
  stateOf,
  trendOf,
  weekError,
  weekPct,
  weeksEnding,
} from './followup-data.js';
import { daysBetween, INACTIVE_DAYS, lastSeen } from './mentora-data.js';
import { PERIODS, planPeriod } from './reports-data.js';

const TZ = FOLLOWUP_TZ;
const MINUTE = 60_000;
const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SORTS = ['risk', 'name', 'engagement'];
const VERSION_CONFLICT = 'Este plano foi alterado em outra aba ou outro dispositivo. Recarregue e tente de novo.';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Eventos de XP que contam para cada módulo na demonstração.
const MODULE_KINDS = {
  tarefas: ['task_done'],
  leads: ['lead_converted', 'lead_activity'],
  oportunidades: ['deal_won'],
  pessoas: ['person_created'],
  metas: ['goal_reached'],
  desafios: ['challenge_action', 'challenge_completed'],
};

export function createFollowupDemo(d) {
  const db = () => d.getDb();
  const { Errors, createIssues, requireBody, onlyKeys, readVersion } = d;
  const localDay = (iso) => new Date(Date.parse(iso) - TZ * MINUTE).toISOString().slice(0, 10);
  const levelName = (n) => d.LEVELS[n - 1]?.name ?? d.LEVELS[0].name;

  const mentora = () => db().users.find((u) => u.role === 'admin');
  const students = () => db().users.filter((u) => u.role === 'user');
  const studentOf = (id) => {
    const found = d.UUID.test(String(id)) ? students().find((u) => u.id === id) : null;
    if (!found) throw Errors.notFound('Aluna não encontrada.');
    return found;
  };
  const plans = () => (db().followupPlans ??= []);
  const checkins = () => (db().mentoriaCheckins ??= []);

  /** Alunas ativas da mentora filtradas por turma ('' = sem turma; undefined = todas). */
  function scope(turma) {
    const key = turma === undefined ? undefined : turma.trim().toLowerCase();
    const all = students().map((u) => ({ u, dto: d.studentDto(u) }));
    const list = all.filter(({ dto }) => {
      if (dto.status !== 'active') return false;
      if (key === undefined) return true;
      const cls = dto.className?.trim().toLowerCase() ?? '';
      return key === '' ? cls === '' : cls === key;
    });
    const classNames = [...new Set(all.filter(({ dto }) => dto.status === 'active').map(({ dto }) => dto.className?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { list, classNames };
  }

  const eventsOf = (userId) => db().xpEvents.filter((e) => e.ownerId === userId);
  const planDto = (p, today) => ({ actionText: p.actionText, nextCheckinOn: p.nextCheckinOn, due: dueOf(p.nextCheckinOn, today), version: p.version, updatedAt: p.updatedAt });

  // ---------------------------------------------------------------- acompanhamento

  const FOLLOWUP_QUERY = {
    turma: 'text',
    week: { pattern: ISO_DAY, message: 'Informe uma data válida (AAAA-MM-DD).' },
    sort: { enum: SORTS, message: 'Ordenação inválida.' },
    limit: { int: [1, 100] },
    offset: { int: [0, 10_000] },
  };

  function followup(searchParams) {
    d.requireAuth('admin');
    const query = d.readQuery(searchParams, FOLLOWUP_QUERY, { sort: 'risk', limit: 20, offset: 0 });
    const turma = query.turma === undefined ? undefined : query.turma === '__none__' ? '' : query.turma;
    const now = d.clock();
    const today = localDay(now.toISOString());
    const currentWeek = mondayOf(today);
    const week = query.week ?? currentWeek;
    const error = weekError(week, today);
    if (error) throw Errors.validation([{ field: 'week', message: error }]);

    const { list, classNames } = scope(turma);
    const weeks = weeksEnding(week, today, FOLLOWUP_WEEKS);
    const items = list.map(({ u, dto }) => {
      const events = eventsOf(u.id);
      const days = new Map();
      let last = null;
      for (const e of events) {
        const day = localDay(e.occurredAt);
        if (!days.has(day)) days.set(day, true);
        if (last === null || e.occurredAt > last) last = e.occurredAt;
      }
      const cells = weeks.map((w) => {
        let n = 0;
        for (let k = 0; k < 7; k++) if (days.has(addDays(w.start, k))) n++;
        const elapsed = elapsedDaysOf(w.start, today);
        return { weekStart: w.start, activeDays: n, elapsedDays: elapsed, pct: weekPct(n, elapsed) };
      });
      const pcts = cells.map((c) => c.pct);
      const seen = lastSeen({ lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null, lastActivityAt: last ? new Date(last) : null });
      const idleDays = seen ? daysBetween(seen, now) : null;
      const atRisk = idleDays !== null && idleDays >= INACTIVE_DAYS;
      const state = stateOf({ pcts, atRisk });
      const { trend, delta } = trendOf(pcts);
      const plan = plans().find((p) => p.studentId === u.id && p.mentoraId === mentora().id);
      const checkin = checkins().find((c) => c.studentId === u.id && c.mentoraId === mentora().id && c.weekStart === week);
      return {
        id: u.id,
        name: u.name,
        avatarUrl: dto.avatarUrl,
        className: dto.className,
        weeks: cells,
        avgPct: meanPct(pcts),
        trend,
        trendDelta: delta,
        state,
        stateLabel: STATE_LABELS[state],
        atRisk,
        idleDays,
        plan: plan ? planDto(plan, today) : null,
        checkin: { done: !!checkin, doneAt: checkin?.doneAt ?? null, note: checkin?.note ?? '' },
      };
    });
    const sorted = [...items].sort((a, b) =>
      query.sort === 'name' ? a.name.localeCompare(b.name, 'pt-BR') : query.sort === 'engagement' ? a.avgPct - b.avgPct || a.name.localeCompare(b.name, 'pt-BR') : riskCompare(a, b),
    );
    return {
      status: 200,
      body: {
        week: { start: week, end: addDays(week, 6), current: week === currentWeek, previous: week > addDays(currentWeek, -7 * 52) ? addDays(week, -7) : null, next: week < currentWeek ? addDays(week, 7) : null },
        weeks,
        classNames,
        summary: {
          students: items.length,
          avgEngagement: items.length ? meanPct(items.map((i) => i.avgPct)) : null,
          checkinsDone: items.filter((i) => i.checkin.done).length,
          checkinsTotal: items.length,
          atRisk: items.filter((i) => i.atRisk).length,
          veryEngaged: items.filter((i) => i.state === 'very_engaged').length,
        },
        data: sorted.slice(query.offset, query.offset + query.limit),
        page: { limit: query.limit, offset: query.offset, total: items.length },
      },
    };
  }

  // ---------------------------------------------------------------- plano de ação

  function getPlan(id, searchParams) {
    d.requireAuth('admin');
    d.readQuery(searchParams, {}, {});
    const u = studentOf(id);
    const plan = plans().find((p) => p.studentId === u.id && p.mentoraId === mentora().id);
    return { status: 200, body: { plan: plan ? planDto(plan, localDay(d.clock().toISOString())) : null } };
  }

  function savePlan(id, body) {
    d.requireAuth('admin');
    const u = studentOf(id);
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['actionText', 'nextCheckinOn', 'version'], issues);
    let actionText;
    if (typeof b.actionText !== 'string' || b.actionText.trim() === '') issues.add('actionText', 'Escreva o plano de ação.');
    else if (b.actionText.trim().length > PLAN_MAX) issues.add('actionText', `O plano é longo demais (máximo ${PLAN_MAX} caracteres).`);
    else if (d.MULTILINE_CONTROL_CHARS.test(b.actionText.trim())) issues.add('actionText', 'O plano contém caracteres inválidos.');
    else actionText = b.actionText.trim();
    let nextCheckinOn = null;
    if (b.nextCheckinOn !== undefined && b.nextCheckinOn !== null) {
      if (typeof b.nextCheckinOn !== 'string' || !ISO_DAY.test(b.nextCheckinOn)) issues.add('nextCheckinOn', 'Informe uma data válida (AAAA-MM-DD).');
      else nextCheckinOn = b.nextCheckinOn;
    }
    let version = null;
    if (b.version !== undefined && b.version !== null) version = readVersion(b.version, issues);
    issues.throwIfAny();
    const today = localDay(d.clock().toISOString());
    if (nextCheckinOn) {
      const dateError = checkinDateError(nextCheckinOn, today);
      if (dateError) throw Errors.validation([{ field: 'nextCheckinOn', message: dateError }]);
    }
    const existing = plans().find((p) => p.studentId === u.id && p.mentoraId === mentora().id);
    if (version === null) {
      if (existing) throw Errors.conflict('version_conflict', VERSION_CONFLICT);
      const row = { studentId: u.id, mentoraId: mentora().id, actionText, nextCheckinOn, version: 1, updatedAt: d.stamp() };
      plans().push(row);
      return { status: 200, body: planDto(row, today) };
    }
    if (!existing || existing.version !== version) throw Errors.conflict('version_conflict', VERSION_CONFLICT);
    Object.assign(existing, { actionText, nextCheckinOn, version: existing.version + 1, updatedAt: d.stamp() });
    return { status: 200, body: planDto(existing, today) };
  }

  // ---------------------------------------------------------------- check-ins

  function recordCheckin(id, body) {
    d.requireAuth('admin');
    const u = studentOf(id);
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['weekStart', 'note'], issues);
    if (typeof b.weekStart !== 'string' || !ISO_DAY.test(b.weekStart)) issues.add('weekStart', 'Informe uma data válida (AAAA-MM-DD).');
    let note = null;
    if (b.note !== undefined) {
      if (typeof b.note !== 'string') issues.add('note', 'Dados inválidos.');
      else if (b.note.trim().length > CHECKIN_NOTE_MAX) issues.add('note', `A observação é longa demais (máximo ${CHECKIN_NOTE_MAX} caracteres).`);
      else if (d.MULTILINE_CONTROL_CHARS.test(b.note.trim())) issues.add('note', 'A observação contém caracteres inválidos.');
      else note = b.note.trim();
    }
    issues.throwIfAny();
    const error = weekError(b.weekStart, localDay(d.clock().toISOString()));
    if (error) throw Errors.validation([{ field: 'weekStart', message: error }]);
    let row = checkins().find((c) => c.studentId === u.id && c.weekStart === b.weekStart);
    const created = !row;
    if (!row) {
      row = { studentId: u.id, mentoraId: mentora().id, weekStart: b.weekStart, doneAt: d.stamp(), note: note ?? '' };
      checkins().push(row);
    } else if (note !== null) row.note = note;
    return { status: created ? 201 : 200, body: { studentId: u.id, weekStart: row.weekStart, done: true, doneAt: row.doneAt, note: row.note } };
  }

  function removeCheckin(id, week) {
    d.requireAuth('admin');
    const u = studentOf(id);
    if (!ISO_DAY.test(week)) throw Errors.validation([{ field: 'weekStart', message: 'Informe uma data válida (AAAA-MM-DD).' }]);
    const error = weekError(week, localDay(d.clock().toISOString()));
    if (error) throw Errors.validation([{ field: 'weekStart', message: error }]);
    db().mentoriaCheckins = checkins().filter((c) => !(c.studentId === u.id && c.weekStart === week));
    return { status: 204 };
  }

  // ---------------------------------------------------------------- relatórios

  const REPORT_QUERY = { period: { enum: PERIODS, message: 'Período inválido.' }, turma: 'text' };

  function periodKpis(ids, window) {
    let activeDays = 0;
    let goals = 0;
    const active = new Set();
    for (const id of ids) {
      const days = new Set();
      for (const e of eventsOf(id)) {
        const day = localDay(e.occurredAt);
        if (day < window.from || day > window.to) continue;
        days.add(day);
        active.add(id);
        if (e.kind === 'goal_reached') goals++;
      }
      activeDays += days.size;
    }
    return { students: ids.length, activeStudents: active.size, activeDays, goalsReached: goals };
  }

  function challengeCompletion(ids, window) {
    const idSet = new Set(ids);
    const end = window.end.getTime();
    const pcts = [];
    for (const e of db().challengeEnrollments) {
      if (!idSet.has(e.userId) || Date.parse(e.joinedAt) >= end) continue;
      const c = db().challenges.find((x) => x.id === e.challengeId);
      if (!c || c.mentoraId !== mentora().id || c.status !== 'published' || c.startsOn > window.to || c.endsOn < window.from) continue;
      const actionIds = new Set(c.actions.map((a) => a.id));
      const done = db().challengeProgress.filter((p) => p.userId === e.userId && actionIds.has(p.actionId) && Date.parse(p.doneAt) < end).length;
      pcts.push(c.actions.length > 0 ? (done / c.actions.length) * 100 : 0);
    }
    return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  }

  function reports(searchParams) {
    d.requireAuth('admin');
    const query = d.readQuery(searchParams, REPORT_QUERY, { period: '30d' });
    const turma = query.turma === undefined ? undefined : query.turma === '__none__' ? '' : query.turma;
    const now = d.clock();
    const plan = planPeriod(query.period, now, TZ);
    const { list, classNames } = scope(turma);
    const ids = list.map(({ u }) => u.id);
    const cur = periodKpis(ids, plan.current);
    const prev = periodKpis(ids, plan.previous);
    const engagement = (k, w) => periodEngagement(k.activeDays, ids.length, daysInWindow(w.from, w.to));
    const events = ids.flatMap((id) => eventsOf(id).map((e) => ({ ...e, day: localDay(e.occurredAt) })));
    const inWindow = (e) => e.day >= plan.current.from && e.day <= plan.current.to;
    const companiesIn = db().companies.filter((c) => ids.includes(c.ownerId) && localDay(c.createdAt) >= plan.current.from && localDay(c.createdAt) <= plan.current.to);

    const modules = MODULES.map((key) => {
      let actions;
      let users;
      if (key === 'empresas') {
        actions = companiesIn.length;
        users = new Set(companiesIn.map((c) => c.ownerId)).size;
      } else {
        const hits = events.filter((e) => inWindow(e) && MODULE_KINDS[key].includes(e.kind));
        actions = hits.length;
        users = new Set(hits.map((e) => e.ownerId)).size;
      }
      return { key, label: MODULE_LABELS[key], actions, students: users, pct: ids.length ? Math.round((users / ids.length) * 100) : 0 };
    });

    const today = localDay(now.toISOString());
    const [y, m] = today.slice(0, 7).split('-').map(Number);
    const goalsByMonth = Array.from({ length: 6 }, (_, k) => {
      const index = y * 12 + (m - 1) - (5 - k);
      const month = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
      return { month, label: SHORT_MONTHS[Number(month.slice(5, 7)) - 1], count: events.filter((e) => e.kind === 'goal_reached' && e.day.slice(0, 7) === month).length };
    });

    const totals = new Map(ids.map((id) => [id, eventsOf(id).reduce((n, e) => n + e.points, 0)]));
    const levels = Array.from({ length: 12 }, (_, k) => ({ n: k + 1, name: levelName(k + 1), students: ids.filter((id) => d.levelFor(totals.get(id)).level === k + 1).length }));

    const quarterStart = `${today.slice(0, 4)}-${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
    const byId = new Map(list.map(({ u, dto }) => [u.id, { u, dto }]));
    const topEvolution = ids
      .map((id) => ({ id, gained: eventsOf(id).filter((e) => localDay(e.occurredAt) >= quarterStart).reduce((n, e) => n + e.points, 0) }))
      .filter((x) => x.gained > 0)
      .sort((a, b) => b.gained - a.gained || (a.id < b.id ? -1 : 1))
      .slice(0, 20)
      .map((x) => ({ ...x, name: byId.get(x.id).u.name }))
      .sort((a, b) => b.gained - a.gained || a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 5)
      .map((x, i) => {
        const n = d.levelFor(totals.get(x.id)).level;
        return { position: i + 1, id: x.id, name: x.name, avatarUrl: byId.get(x.id).dto.avatarUrl, level: { n, name: levelName(n) }, xpGained: x.gained };
      });

    return {
      status: 200,
      body: {
        period: query.period,
        turma: turma ?? null,
        range: { from: plan.current.from, to: plan.current.to },
        previousRange: { from: plan.previous.from, to: plan.previous.to },
        classNames,
        students: ids.length,
        hasData: ids.length > 0,
        kpis: {
          activeStudents: { current: cur.activeStudents, previous: prev.activeStudents, total: ids.length },
          engagement: { current: engagement(cur, plan.current), previous: engagement(prev, plan.previous) },
          challengeCompletion: { current: challengeCompletion(ids, plan.current), previous: challengeCompletion(ids, plan.previous) },
          goalsReached: { current: cur.goalsReached, previous: prev.goalsReached },
        },
        modules,
        goalsByMonth,
        levels,
        topEvolution,
      },
    };
  }

  const SEG = '([^/]+)';
  return {
    routes: [
      ['GET', /^mentora\/followup$/, (_m, q) => followup(q)],
      ['GET', new RegExp(`^mentora/students/${SEG}/followup-plan$`), (m, q) => getPlan(m[1], q)],
      ['PUT', new RegExp(`^mentora/students/${SEG}/followup-plan$`), (m, _q, body) => savePlan(m[1], body)],
      ['POST', new RegExp(`^mentora/students/${SEG}/checkins$`), (m, _q, body) => recordCheckin(m[1], body)],
      ['DELETE', new RegExp(`^mentora/students/${SEG}/checkins/${SEG}$`), (m) => removeCheckin(m[1], m[2])],
      ['GET', /^mentora\/reports$/, (_m, q) => reports(q)],
    ],
  };
}
