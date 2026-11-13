// Faturamento autodeclarado do exemplo (Entrega 6): lançamentos mensais a partir do mês de entrada de cada aluna (relativos ao "agora"),
// o histórico das correções e os marcos que esses lançamentos dariam pelas mesmas regras do servidor (o exemplo é "reproduzido" em ordem
// com evaluateMilestones). Camila (aluna demo) perto de R$ 38 mil (10k e 30k; próxima 50k), Mariana PAD GOLD vigente, Beatriz com o
// 50k em revisão depois de uma correção, as outras a caminho. A mesma função serve na migração da cópia salva da versão 19.
import { addMonths, applyMilestones, entryMonth, evaluateMilestones, fromCents, monthKey, monthsBetween, summarize } from './revenue-data.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const fixedId = (kind, n) => `${kind}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uid = (n) => fixedId('10000000', n);

/** [aluna, valores mensais desde o mês de entrada (R$), correção opcional { index, to, daysAgo }]. */
const PLAN = [
  [2, [3500, 5200, 6800, 7400, 8600, 6500]], // Camila: R$ 38.000 → 10k e 30k; próxima 50k (faltam R$ 12.000)
  [3, [12000, 15000, 18000, 22000, 24000, 14000]], // Mariana: R$ 105.000 → PAD GOLD
  [4, [8000, 11000, 14000, 19000], { index: 3, to: 15000, daysAgo: 4 }], // Beatriz: passou de 50k e corrigiu para 48k → 50k em revisão
  [5, [2500, 3000, 2800, 3500, 1800]], // Fernanda: 10k
  [6, [4000, 5500, 2000]], // Luiza: 10k
  [7, [1500, 2200]], // Larissa: a caminho
  [11, [6000, 7000, 9000, 7500]], // Juliana: quase 30k
  [12, [5000, 6000, 4000, 3200]], // Tatiana: 10k (inativa)
  [10, [1200]], // Aline: primeiro mês
];

/**
 * @param {{ now: Date, users: any[] }} input
 * @returns {{ studentRevenue: any[], studentRevenueEvents: any[], revenueMilestones: any[] }}
 * Sem avisos de exemplo: os avisos de marco nascem dos lançamentos feitos na demonstração.
 */
export function buildRevenueSeed({ now, users }) {
  const t = now.getTime();
  const current = monthKey(now);
  const studentRevenue = [];
  const studentRevenueEvents = [];
  const revenueMilestones = [];

  for (const [n, amounts, correction] of PLAN) {
    const student = users.find((u) => u.id === uid(n) && u.role === 'user');
    if (!student) continue;
    const entry = entryMonth(student.joinedOn, student.createdAt);
    const months = monthsBetween(entry, current).slice(0, amounts.length);
    // Cada mês é lançado no dia 3 do mês seguinte (13h UTC); o mês corrente, um dia antes de "agora" (nunca antes do cadastro).
    const ops = months.map((month, i) => {
      const next = addMonths(month, 1);
      const planned = Date.parse(`${next}-03T13:00:00.000Z`) + n * 7 * MIN;
      const at = Math.max(Date.parse(student.createdAt) + HOUR, Math.min(planned, t - DAY + n * MIN));
      return { at, month, amount: fromCents(amounts[i] * 100), kind: 'created' };
    });
    if (correction && ops[correction.index]) {
      const at = t - correction.daysAgo * DAY;
      if (at > ops[correction.index].at) ops.push({ at, month: ops[correction.index].month, amount: fromCents(correction.to * 100), kind: 'updated' });
    }
    ops.sort((a, b) => a.at - b.at);

    const rows = new Map();
    let records = [];
    for (const op of ops) {
      const at = new Date(Math.min(op.at, t)).toISOString();
      const row = rows.get(op.month);
      if (op.kind === 'created') {
        rows.set(op.month, { id: fixedId('d1000000', studentRevenue.length + rows.size + 1), studentId: student.id, month: op.month, amount: op.amount, note: null, version: 1, createdAt: at, updatedAt: at });
        studentRevenueEvents.push({ id: fixedId('d2000000', studentRevenueEvents.length + 1), studentId: student.id, month: op.month, kind: 'created', oldAmount: null, newAmount: op.amount, actorId: student.id, createdAt: at });
      } else {
        studentRevenueEvents.push({ id: fixedId('d2000000', studentRevenueEvents.length + 1), studentId: student.id, month: op.month, kind: 'updated', oldAmount: row.amount, newAmount: op.amount, actorId: student.id, createdAt: at });
        Object.assign(row, { amount: op.amount, note: 'Corrigido: uma venda do mês foi cancelada.', version: row.version + 1, updatedAt: at });
      }
      const result = evaluateMilestones(records, summarize([...rows.values()], entry).total, at);
      records = applyMilestones(records, result, at);
    }
    studentRevenue.push(...rows.values());
    revenueMilestones.push(...records.map((r) => ({ ...r, studentId: student.id })));
  }
  return { studentRevenue, studentRevenueEvents, revenueMilestones };
}

/**
 * Migração da cópia salva da versão 19: mantém tudo, acrescenta o faturamento do exemplo (sem avisos), dá `revenue.view` à
 * "Mentora assistente" (como a migração SQL 0034) e arquiva as conquistas antigas de vendas, preservando quem já desbloqueou.
 */
export function migrateRevenue(saved, now, schema, permissions) {
  const extra = buildRevenueSeed({ now, users: saved.users ?? [] });
  const at = now.toISOString();
  const teamRoles = (saved.teamRoles ?? []).map((r) =>
    r.systemKey === 'assistant' && !r.permissions.includes('revenue.view') ? { ...r, permissions: permissions.filter((p) => p === 'revenue.view' || r.permissions.includes(p)) } : r,
  );
  const achievements = (saved.achievements ?? []).map((a) =>
    (a.seedKey === 'sales-10k' || a.seedKey === 'sales-50k') && !a.archivedAt ? { ...a, active: false, archivedAt: at, version: (a.version ?? 1) + 1 } : a,
  );
  return {
    ...saved,
    schema,
    teamRoles,
    achievements,
    studentRevenue: saved.studentRevenue ?? extra.studentRevenue,
    studentRevenueEvents: saved.studentRevenueEvents ?? extra.studentRevenueEvents,
    revenueMilestones: saved.revenueMilestones ?? extra.revenueMilestones,
  };
}
