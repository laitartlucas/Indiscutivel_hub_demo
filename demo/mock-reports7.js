// Relatórios e painéis da Entrega 7 na demonstração: o bloco novo do painel da mentora (GET /mentora/overview?period), o negócio
// das alunas somado (GET /mentora/business) e os relatórios da jornada (GET /mentora/reports/journey). Mesmo contrato do servidor
// (docs/superpowers/specs/2026-11-12-entrega-7-relatorios-refinamento.md). Nenhuma fórmula nova: cada bloco por aluna é EXATAMENTE
// o corpo de /mentora/students/:id/commercial|finance|marketing (os módulos expõem `mentoraBody`), os totais somam as alunas e as
// taxas saem das funções do domínio (conversionRate, costPer, roas, roi). A série mensal do financeiro fica em mock-finance.js.
// Privacidade: nada de nome de cliente, de campanha ou descrição de venda; conquistas medidas pelo CRM nunca aparecem por aluna;
// marcos de faturamento só para quem tem `revenue.view`.
import { periodRange, todayInBrasilia } from './finance-data.js';
import { DEFAULT_FUNNELS } from './funnels-data.js';
import { isEligible } from './growth-data.js';
import { brasiliaDay, daysBetween, PHASES, phaseLabel } from './journey-data.js';
import { costPer, roas, roi } from './marketing-data.js';
import { conversionRate } from './reports-data.js';
import { fromCents, MILESTONES, toCents } from './revenue-data.js';

const PERIODS = ['month', 'quarter', 'year'];
const PERIOD_RULE = { enum: PERIODS, message: 'Período inválido.' };
/** Sem mudança de fase há mais de 90 dias: "parada" no relatório. */
export const STALLED_DAYS = 90;
const RECENT_MAX = 8;
/** Ordem dos funis nos totais: a dos 15 funis padrão, depois "Outro funil" (como o servidor). */
const FUNNEL_ORDER = [...DEFAULT_FUNNELS.map((f) => f.name), 'Outro funil'];
// Conquistas medidas pelo CRM da aluna (as mesmas de mock-mentora.js): nunca contadas nem listadas por aluna.
const CRM_RULES = ['revenue_won_total', 'deals_won_count', 'people_count', 'leads_converted_count', 'tasks_done_count'];

export function createReports7Demo(d) {
  const { readQuery } = d;
  const db = () => d.getDb();
  const table = (name) => (db()[name] ??= []);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR') || cmp(a.id, b.id);
  const mentora = () => db().users.find((u) => u.role === 'admin');
  const students = () => db().users.filter((u) => u.role === 'user').sort(byName);
  const today = () => todayInBrasilia(d.clock());
  const windowOf = (period) => periodRange(today(), period);
  const inWindow = (w, iso) => {
    if (!iso) return false;
    const day = brasiliaDay(iso);
    return day >= w.from && day <= w.to;
  };
  const sumMoney = (values) => fromCents(values.reduce((t, v) => t + (toCents(v) ?? 0), 0));
  const sum = (values) => values.reduce((t, v) => t + v, 0);
  const visibleCatalog = () => db().achievements.filter((a) => a.mentoraId === mentora()?.id && a.active && !a.archivedAt && !CRM_RULES.includes(a.ruleKind));
  // Distribuição pelas 4 fases: só alunas não inativadas (como o servidor).
  const phaseCounts = (list) => PHASES.map((p) => ({ phase: p.phase, label: p.label, count: list.filter((u) => u.active && d.phaseOf(u.id) === p.phase).length }));
  const ownedChallenges = () => db().challenges.filter((c) => c.mentoraId === mentora()?.id);
  /** Desafio com ação automática: a conclusão mede o CRM da aluna (nunca contada nem mostrada). */
  const hasAuto = (c) => c.actions.some((x) => x.kind !== 'manual');

  // ---------------------------------------------------------------- painel da mentora (campos novos de /mentora/overview)

  /** Os campos da Entrega 7 do painel (somados aos que já existiam). Chamado por mock-mentora.js com a mentora já conferida. */
  function overviewExtras(period) {
    const w = windowOf(period);
    const all = students();
    const owned = new Map(ownedChallenges().map((c) => [c.id, c]));
    const studentIds = new Set(all.map((u) => u.id));
    const day = today();
    // Conclusões no período, só de desafios SEM ação automática.
    const completedInPeriod = db().challengeEnrollments.filter(
      (e) => studentIds.has(e.userId) && owned.has(e.challengeId) && !hasAuto(owned.get(e.challengeId)) && inWindow(w, e.completedAt),
    ).length;
    const active = [...owned.values()].filter((c) => c.status === 'published' && c.startsOn <= day && c.endsOn >= day).length;
    const pendingFeedback = table('challengeCheckins').filter((x) => owned.has(x.challengeId) && studentIds.has(x.studentId) && x.feedback === null).length;
    return {
      period: { from: w.from, to: w.to },
      students: { active: all.filter((u) => d.statusOf(u) === 'active').length, total: all.length },
      phases: phaseCounts(all),
      challenges: { completedInPeriod, active },
      checkins: { pendingFeedback },
      recentAchievements: recentAchievements(all),
    };
  }

  function recentAchievements(all) {
    const names = new Map(all.map((u) => [u.id, u.name]));
    const catalog = new Map(visibleCatalog().map((a) => [a.id, a]));
    const items = db()
      .achievementUnlocks.filter((x) => names.has(x.userId) && catalog.has(x.achievementId))
      .map((x) => ({ studentId: x.userId, studentName: names.get(x.userId), kind: 'achievement', title: catalog.get(x.achievementId).title, at: x.unlockedAt }));
    // Marcos de faturamento VIGENTES (em revisão não entram), só para quem tem `revenue.view`.
    if (d.canSeeRevenue()) {
      for (const r of table('revenueMilestones')) {
        if (!names.has(r.studentId) || r.status !== 'active') continue;
        items.push({ studentId: r.studentId, studentName: names.get(r.studentId), kind: 'milestone', title: MILESTONES.find((m) => m.milestone === r.milestone)?.label ?? '', at: r.reachedAt });
      }
    }
    return items.sort((a, b) => cmp(b.at, a.at) || a.studentName.localeCompare(b.studentName, 'pt-BR')).slice(0, RECENT_MAX);
  }

  // ---------------------------------------------------------------- negócio das alunas (business.view)

  const withoutPeriod = (block) => Object.fromEntries(Object.entries(block).filter(([key]) => key !== 'period'));

  function commercialTotals(blocks) {
    const byFunnel = new Map();
    for (const b of blocks) {
      for (const f of b.byFunnel) {
        const acc = byFunnel.get(f.name) ?? { name: f.name, open: 0, won: 0, lost: 0 };
        acc.open += f.open;
        acc.won += f.won;
        acc.lost += f.lost;
        byFunnel.set(f.name, acc);
      }
    }
    const won = sum(blocks.map((b) => b.won.count));
    const lost = sum(blocks.map((b) => b.lost.count));
    return {
      newContacts: sum(blocks.map((b) => b.newContacts)),
      open: { count: sum(blocks.map((b) => b.open.count)), total: sumMoney(blocks.map((b) => b.open.total)) },
      won: { count: won, total: sumMoney(blocks.map((b) => b.won.total)) },
      lost: { count: lost },
      conversionRate: conversionRate(won, lost),
      byFunnel: [...byFunnel.values()].sort((a, b) => FUNNEL_ORDER.indexOf(a.name) - FUNNEL_ORDER.indexOf(b.name)),
    };
  }

  function financeTotals(blocks) {
    return {
      contracted: sumMoney(blocks.map((b) => b.contracted)),
      salesCount: sum(blocks.map((b) => b.salesCount)),
      received: sumMoney(blocks.map((b) => b.received)),
      receivable: sumMoney(blocks.map((b) => b.receivable)),
      overdue: sumMoney(blocks.map((b) => b.overdue)),
      overdueCount: sum(blocks.map((b) => b.overdueCount)),
      settledCount: sum(blocks.map((b) => b.settledCount)),
    };
  }

  function marketingTotals(blocks) {
    const investment = sumMoney(blocks.map((b) => b.investment));
    const revenue = sumMoney(blocks.map((b) => b.revenue));
    const leads = sum(blocks.map((b) => b.leads));
    const newClients = sum(blocks.map((b) => b.newClients));
    return {
      investment, leads, cpl: costPer(investment, leads), newClients, cac: costPer(investment, newClients), revenue, roas: roas(revenue, investment), roi: roi(revenue, investment),
      activeCampaigns: sum(blocks.map((b) => b.activeCampaigns)),
    };
  }

  function business(searchParams) {
    d.requireAuth('admin');
    const query = readQuery(searchParams, { period: PERIOD_RULE, ...d.PAGING }, { period: 'month', ...d.PAGING_DEFAULTS });
    const w = windowOf(query.period);
    const all = students().map((u) => ({
      studentId: u.id,
      studentName: u.name,
      commercial: withoutPeriod(d.commercial.mentoraBody(u, query.period)),
      finance: withoutPeriod(d.finance.mentoraBody(u, query.period)),
      marketing: withoutPeriod(d.marketing.mentoraBody(u, query.period)),
    }));
    const totals = {
      commercial: commercialTotals(all.map((r) => r.commercial)),
      finance: financeTotals(all.map((r) => r.finance)),
      marketing: marketingTotals(all.map((r) => r.marketing)),
    };
    // Mais vendas ganhas (valor) primeiro; empate: mais vendas, depois o nome.
    all.sort(
      (a, b) => toCents(b.commercial.won.total) - toCents(a.commercial.won.total) || b.commercial.won.count - a.commercial.won.count ||
        a.studentName.localeCompare(b.studentName, 'pt-BR') || cmp(a.studentId, b.studentId),
    );
    return { status: 200, body: { period: { from: w.from, to: w.to }, totals, rows: all.slice(query.offset, query.offset + query.limit), total: all.length } };
  }

  // ---------------------------------------------------------------- relatórios da jornada (reports.view)

  function reportsJourney(searchParams) {
    d.requireAuth('admin');
    const query = readQuery(searchParams, { period: PERIOD_RULE, phase: { int: [1, 4] }, className: 'text' }, { period: 'month' });
    const w = windowOf(query.period);
    const day = today();
    const classKey = query.className === undefined ? undefined : query.className === '__none__' ? '' : query.className.toLowerCase();
    // Os filtros de fase (atual) e de turma valem para TODOS os blocos (como o servidor).
    const scoped = students().filter(
      (u) => (classKey === undefined || (u.className?.trim().toLowerCase() ?? '') === classKey) && (query.phase === undefined || d.phaseOf(u.id) === query.phase),
    );
    const ids = new Set(scoped.map((u) => u.id));

    const phaseChanges = [];
    const lastChange = new Map();
    for (const u of scoped) {
      const rows = table('studentPhases')
        .map((p, index) => ({ p, index }))
        .filter(({ p }) => p.studentId === u.id)
        .sort((a, b) => cmp(a.p.createdAt, b.p.createdAt) || a.index - b.index)
        .map(({ p }) => p);
      let previous = 1;
      for (const p of rows) {
        if (inWindow(w, p.createdAt)) {
          phaseChanges.push({ studentId: u.id, studentName: u.name, from: previous, fromLabel: phaseLabel(previous), to: p.phase, toLabel: phaseLabel(p.phase), at: p.createdAt });
        }
        previous = p.phase;
      }
      lastChange.set(u.id, rows.at(-1)?.createdAt ?? u.createdAt);
    }
    phaseChanges.sort((a, b) => cmp(b.at, a.at) || a.studentName.localeCompare(b.studentName, 'pt-BR'));

    const stalled = scoped
      .filter((u) => u.active)
      .map((u) => {
        const since = lastChange.get(u.id);
        const phase = d.phaseOf(u.id);
        return { studentId: u.id, studentName: u.name, phase, label: phaseLabel(phase), since, days: daysBetween(brasiliaDay(since), day) };
      })
      .filter((x) => x.days > STALLED_DAYS)
      .sort((a, b) => b.days - a.days || a.studentName.localeCompare(b.studentName, 'pt-BR'));

    // Desafios do período (publicados ou arquivados que tocam o período), do mais recente ao mais antigo.
    const challenges = ownedChallenges()
      .filter((c) => c.status !== 'draft' && c.startsOn <= w.to && c.endsOn >= w.from)
      .sort((a, b) => cmp(b.startsOn, a.startsOn) || cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id))
      .map((c) => {
        const enrolled = db().challengeEnrollments.filter((e) => e.challengeId === c.id && ids.has(e.userId));
        const checkins = table('challengeCheckins').filter((x) => x.challengeId === c.id && ids.has(x.studentId));
        return {
          challengeId: c.id, title: c.title, startsOn: c.startsOn, endsOn: c.endsOn, status: c.status,
          // Destinadas: alunas ativas e não bloqueadas da turma do desafio (todas, se o desafio é para todas as turmas).
          destined: scoped.filter((u) => u.active && !u.manuallyBlocked && isEligible(c.classNames, u.className)).length,
          enrolled: enrolled.length,
          completed: hasAuto(c) ? null : enrolled.filter((e) => e.completedAt).length,
          checkinsInPeriod: checkins.filter((x) => x.day >= w.from && x.day <= w.to).length,
          pendingFeedback: checkins.filter((x) => x.feedback === null).length,
        };
      });

    const unlocks = db().achievementUnlocks.filter((x) => ids.has(x.userId) && inWindow(w, x.unlockedAt));
    const achievements = visibleCatalog()
      .map((a) => ({ achievementId: a.id, title: a.title, unlocks: unlocks.filter((x) => x.achievementId === a.id).length }))
      .sort((a, b) => b.unlocks - a.unlocks || a.title.localeCompare(b.title, 'pt-BR') || cmp(a.achievementId, b.achievementId));

    const records = table('revenueMilestones').filter((r) => ids.has(r.studentId));
    const milestones = d.canSeeRevenue()
      ? MILESTONES.map((m) => ({
        milestone: m.milestone, label: m.label,
        reached: records.filter((r) => r.milestone === m.milestone && inWindow(w, r.reachedAt)).length,
        inReview: records.filter((r) => r.milestone === m.milestone && r.status === 'in_review').length,
      }))
      : null;

    return {
      status: 200,
      body: { period: { from: w.from, to: w.to }, phases: phaseCounts(scoped), phaseChanges, stalled, challenges, achievements, milestones },
    };
  }

  return {
    routes: [
      ['GET', /^mentora\/business$/, (_m, q) => business(q)],
      ['GET', /^mentora\/reports\/journey$/, (_m, q) => reportsJourney(q)],
    ],
    overviewExtras,
    PERIOD_RULE,
  };
}
