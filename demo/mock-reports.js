// Ranking ("Evolução da comunidade") e Relatórios da demonstração: as mesmas regras e formatos do servidor
// (server/src/repositories/ranking.ts + função SQL ranking_month, server/src/repositories/reports.ts) sobre o estado em memória.
// Recebe do mock principal só o que precisa (banco, relógio, validação de consulta, helpers de dinheiro e metas).
import { advancePct, conversionRate, displayName, initialsOfShown, levelNumberFor, localDate, onTimeRate, pathRank, PATH, PERIODS, planPeriod, shiftMonth, dayStart } from './reports-data.js';

const RANKING_LIMIT = 20;
const DAY = 86_400_000;

export function createReportsDemo(d) {
  const db = () => d.getDb();
  const tzSpec = { tzOffset: { int: [-840, 840] } };
  const inside = (iso, start, end) => iso != null && Date.parse(iso) >= start.getTime() && Date.parse(iso) < end.getTime();
  const mine = (list, u) => list.filter((row) => row.ownerId === u.id);

  // ---------------------------------------------------------------- Ranking

  const normClass = (name) => {
    const text = String(name ?? '').trim().toLowerCase();
    return text === '' ? null : text;
  };
  const optedIn = (u) => u.role === 'user' && u.active && !u.manuallyBlocked && db().preferences[u.id]?.rankingVisible === true;

  function getRanking(searchParams) {
    const u = d.requireStudent();
    const { tzOffset } = d.readQuery(searchParams, tzSpec, { tzOffset: 0 });
    const now = d.clock();
    const month = localDate(now, tzOffset).slice(0, 7);
    if (!optedIn(u)) return { status: 200, body: { participating: false, month, scope: null, className: null, total: null, position: null, data: [] } };

    // Só o mês CORRENTE no fuso de quem consulta (nenhuma outra janela existe).
    const start = dayStart(`${month}-01`, tzOffset);
    const end = dayStart(`${shiftMonth(month, 1)}-01`, tzOffset);
    const cls = normClass(u.className);
    const pool = db().users.filter((x) => optedIn(x) && (cls === null || normClass(x.className) === cls));
    const rows = pool.map((x) => {
      const events = db().xpEvents.filter((e) => e.ownerId === x.id);
      return {
        id: x.id,
        shown: displayName(x.name),
        level: levelNumberFor(events.reduce((n, e) => n + e.points, 0)),
        monthXp: events.filter((e) => inside(e.occurredAt, start, end)).reduce((n, e) => n + e.points, 0),
      };
    });
    rows.sort((a, b) => b.monthXp - a.monthXp || a.shown.localeCompare(b.shown, 'pt-BR') || (a.id < b.id ? -1 : 1));
    const entries = rows.map((r, index) => ({ ...r, position: 1 + rows.filter((o) => o.monthXp > r.monthXp).length, index }));
    const shown = entries.filter((r) => r.index < RANKING_LIMIT || r.id === u.id);
    const mineRow = entries.find((r) => r.id === u.id);
    return {
      status: 200,
      body: {
        participating: true,
        month,
        scope: cls ? 'class' : 'mentoria',
        className: cls ? u.className.trim() : null,
        total: entries.length,
        position: mineRow.position,
        data: shown.map((r) => ({
          position: r.position,
          name: r.shown,
          initials: initialsOfShown(r.shown),
          level: { n: r.level, name: d.levelName(r.level) },
          monthXp: r.monthXp,
          me: r.id === u.id,
        })),
      },
    };
  }

  // ---------------------------------------------------------------- Relatórios

  function closedDeals(u, w) {
    const closed = mine(db().deals, u).filter((x) => (x.stage === 'won' || x.stage === 'lost') && inside(x.closedAt, w.start, w.end));
    const won = closed.filter((x) => x.stage === 'won');
    return { won: won.length, lost: closed.length - won.length, cents: won.reduce((n, x) => n + d.toCents(x.value), 0) };
  }

  const leadsIn = (u, w) => mine(db().leads, u).filter((l) => inside(l.createdAt, w.start, w.end));

  /** Das oportunidades criadas no período, quantas chegaram pelo menos a cada etapa do caminho (etapa atual + histórico real). */
  function funnel(u, w) {
    const cohort = mine(db().deals, u).filter((x) => inside(x.createdAt, w.start, w.end));
    const ranks = cohort.map((x) => {
      const history = db().dealHistory.filter((h) => h.dealId === x.id).map((h) => pathRank(h.toStage));
      return Math.max(pathRank(x.stage), ...history, 0);
    });
    return { cohort: cohort.length, counts: PATH.map((_, level) => ranks.filter((r) => r >= level).length) };
  }

  function taskStats(u, w) {
    const done = mine(db().tasks, u).filter((t) => t.status === 'done' && inside(t.doneAt, w.start, w.end));
    const withDue = done.filter((t) => t.dueAt != null);
    // No prazo: concluída até o prazo (exatamente no prazo vale); tarefa de dia inteiro vale até o fim do dia do prazo.
    const onTime = withDue.filter((t) => Date.parse(t.doneAt) < Date.parse(t.dueAt) + (t.dueAllDay ? DAY : 1));
    return { done: done.length, withDue: withDue.length, onTime: onTime.length };
  }

  function getOverview(searchParams) {
    const u = d.requireStudent();
    const query = d.readQuery(searchParams, { period: { enum: PERIODS, message: 'Período inválido.' }, ...tzSpec }, { period: '30d', tzOffset: 0 });
    const now = d.clock();
    const plan = planPeriod(query.period, now, query.tzOffset);
    const cur = closedDeals(u, plan.current);
    const prev = closedDeals(u, plan.previous);
    const curLeads = leadsIn(u, plan.current);
    const prevLeads = leadsIn(u, plan.previous);
    const flow = funnel(u, plan.current);
    const labels = d.stageLabels(u);
    const tasks = taskStats(u, plan.current);
    const names = new Map(d.effectiveSources(u).map((s) => [s.key, s.label]));
    const bySource = new Map();
    for (const l of curLeads) bySource.set(l.source, (bySource.get(l.source) ?? 0) + 1);

    const buckets = plan.buckets.map((b) => {
      const closed = mine(db().deals, u).filter((x) => (x.stage === 'won' || x.stage === 'lost') && inside(x.closedAt, b.start, b.end));
      const won = closed.filter((x) => x.stage === 'won');
      return {
        key: b.key,
        label: b.label,
        sales: d.fromCents(won.reduce((n, x) => n + d.toCents(x.value), 0)),
        won: won.length,
        lost: closed.length - won.length,
        tasksDone: mine(db().tasks, u).filter((t) => t.status === 'done' && inside(t.doneAt, b.start, b.end)).length,
      };
    });

    const pace = d.goalPace(u, query.tzOffset);
    return {
      status: 200,
      body: {
        period: plan.period,
        range: { from: plan.current.from, to: plan.current.to },
        previousRange: { from: plan.previous.from, to: plan.previous.to },
        granularity: plan.granularity,
        kpis: {
          salesWon: { current: d.fromCents(cur.cents), previous: d.fromCents(prev.cents) },
          dealsWon: { current: cur.won, previous: prev.won },
          conversionRate: { current: conversionRate(cur.won, cur.lost), previous: conversionRate(prev.won, prev.lost) },
          newLeads: { current: curLeads.length, previous: prevLeads.length },
        },
        buckets,
        funnel: {
          cohort: flow.cohort,
          stages: PATH.map((key, i) => ({ key, label: labels.get(key) ?? key, count: flow.counts[i], advancePct: i === 0 ? null : advancePct(flow.counts[i - 1], flow.counts[i]) })),
        },
        sources: [...bySource.entries()]
          .map(([key, count]) => ({ key, label: names.get(key) ?? key, count }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR')),
        tasks: { done: tasks.done, withDue: tasks.withDue, onTimePct: onTimeRate(tasks.onTime, tasks.withDue) },
        hasData: cur.won + cur.lost + curLeads.length + flow.cohort + tasks.done > 0,
        goals: pace.total > 0 ? pace : null,
      },
    };
  }

  return {
    routes: [
      ['GET', /^ranking$/, (_m, q) => getRanking(q)],
      ['GET', /^reports\/overview$/, (_m, q) => getOverview(q)],
    ],
  };
}
