// Faturamento AUTODECLARADO e marcos (Entrega 6): regras puras, espelho de server/src/domain/revenue.ts para a demonstração.
// O teste de paridade do servidor (server/test/unit/revenue-domain.test.ts) confere que as duas versões dão o mesmo resultado.
// Não é o faturamento comercial (vendas da Entrega 3).
//
// Dinheiro: centavos INTEIROS por dentro; na entrada e na saída, texto decimal "1500.00". Meses 'AAAA-MM'; instantes em ISO.
// O mês de um instante é o de Brasília (UTC-3, sem horário de verão, como o XP e a jornada).

/** Os quatro marcos, em ordem. O de 100k também dá o status PAD GOLD. */
export const MILESTONES = [
  { milestone: 10000, label: '10k Mentorias' },
  { milestone: 30000, label: '30k Mentorias' },
  { milestone: 50000, label: '50k Mentorias' },
  { milestone: 100000, label: '100k Mentorias' },
];

export const PAD_GOLD_MILESTONE = 100000;

/** Valor máximo de um lançamento: R$ 100.000.000,00 (em centavos). */
export const MAX_AMOUNT_CENTS = 10_000_000_000;
/** Observação: até 500 caracteres. */
export const NOTE_MAX = 500;

const BRASILIA_OFFSET_MS = 180 * 60_000;

// ---------------------------------------------------------------- dinheiro

/** Centavos de um valor ("1500.00", "1500", "1500.5" ou número). Valor inválido (negativo, mais de 2 casas, texto) = null. */
export function toCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    const cents = Math.round(value * 100);
    if (Math.abs(value * 100 - cents) > 1e-6) return null;
    return cents;
  }
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** "1500.00" a partir de centavos. */
export function fromCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Valor aceito num lançamento: de 0 a R$ 100.000.000,00, até 2 casas. Devolve os centavos ou null. */
export function parseAmount(value) {
  const cents = toCents(value);
  return cents === null || cents > MAX_AMOUNT_CENTS ? null : cents;
}

// ---------------------------------------------------------------- meses

/** 'AAAA-MM' que existe (de 2000-01 a 2100-12). */
export function isValidMonth(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  return value >= '2000-01' && value <= '2100-12';
}

/** Mês de Brasília de um instante (ISO ou Date). */
export function monthKey(at) {
  const ms = typeof at === 'string' ? Date.parse(at) : at.getTime();
  return new Date(ms - BRASILIA_OFFSET_MS).toISOString().slice(0, 7);
}

/** Mês de um dia 'AAAA-MM-DD' (ou o próprio 'AAAA-MM'). */
export function monthOfDay(day) {
  return day.slice(0, 7);
}

/** Primeiro dia do mês ('AAAA-MM' → 'AAAA-MM-01'), como o banco guarda. */
export function monthStart(month) {
  return `${month}-01`;
}

/** Soma `n` meses a 'AAAA-MM' (n pode ser negativo). */
export function addMonths(month, n) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const year = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(year).padStart(4, '0')}-${String(mm + 1).padStart(2, '0')}`;
}

/** Mês de entrada na mentoria: o de `joinedOn` ('AAAA-MM-DD'); sem ela, o do cadastro (em Brasília). */
export function entryMonth(joinedOn, createdAt) {
  return joinedOn ? monthOfDay(joinedOn) : monthKey(createdAt);
}

/** O mês pode receber lançamento? 'future' (depois do mês corrente), 'before_entry' (antes da entrada) ou 'ok'. */
export function monthState(month, entry, current) {
  if (month > current) return 'future';
  if (month < entry) return 'before_entry';
  return 'ok';
}

// ---------------------------------------------------------------- acumulado

/**
 * Acumulado: soma dos lançamentos de meses ≥ mês de entrada. Devolve cada lançamento (mês DESC) com `counts` e `cumulative`,
 * o total e quantos meses contam.
 * @param {{ month: string, amount: string }[]} entries
 * @returns {{ entries: { month: string, amount: string, counts: boolean, cumulative: string|null }[], total: string, monthCount: number }}
 */
export function summarize(entries, entry) {
  const asc = [...entries].sort((a, b) => a.month.localeCompare(b.month));
  let running = 0;
  let monthCount = 0;
  const out = [];
  for (const e of asc) {
    const counts = e.month >= entry;
    if (counts) {
      running += toCents(e.amount) ?? 0;
      monthCount += 1;
    }
    out.push({ month: e.month, amount: fromCents(toCents(e.amount) ?? 0), counts, cumulative: counts ? fromCents(running) : null });
  }
  return { entries: out.reverse(), total: fromCents(running), monthCount };
}

// ---------------------------------------------------------------- marcos

/**
 * Reavaliação depois de cada gravação (regra 5): sem registro e acumulado ≥ marco ⇒ insere (vigente, alcançado agora); vigente e
 * acumulado < marco ⇒ em revisão desde agora; em revisão e acumulado ≥ marco ⇒ volta a vigente (sem novo desbloqueio). O
 * registro nunca é apagado nem recriado: a data e o total do alcance ficam.
 * @param {{ milestone: number, reachedAt: string, reachedTotal: string, status: 'active'|'in_review', reviewSince: string|null }[]} existing
 */
export function evaluateMilestones(existing, total, now) {
  const cents = toCents(total) ?? 0;
  const byMilestone = new Map(existing.map((r) => [r.milestone, r]));
  const inserts = [];
  const updates = [];
  const changes = [];
  for (const { milestone } of MILESTONES) {
    const row = byMilestone.get(milestone);
    const above = cents >= milestone * 100;
    if (!row) {
      if (above) {
        inserts.push({ milestone, reachedAt: now, reachedTotal: fromCents(cents) });
        changes.push({ milestone, kind: 'reached' });
      }
    } else if (row.status === 'active' && !above) {
      updates.push({ milestone, status: 'in_review', reviewSince: now });
      changes.push({ milestone, kind: 'in_review' });
    } else if (row.status === 'in_review' && above) {
      updates.push({ milestone, status: 'active', reviewSince: null });
      changes.push({ milestone, kind: 'restored' });
    }
  }
  return { inserts, updates, changes };
}

/** O DTO de um marco a partir do registro (ou null) e do acumulado. */
export function milestoneView(def, row, total) {
  const status = row ? row.status : 'locked';
  const gap = status === 'active' ? null : fromCents(Math.max(0, def.milestone * 100 - (toCents(total) ?? 0)));
  return {
    milestone: def.milestone,
    label: def.label,
    status,
    reachedAt: row?.reachedAt ?? null,
    reachedTotal: row?.reachedTotal ?? null,
    reviewSince: row?.reviewSince ?? null,
    gap,
  };
}

/** Os quatro marcos, em ordem. */
export function milestonesView(rows, total) {
  const byMilestone = new Map(rows.map((r) => [r.milestone, r]));
  return MILESTONES.map((def) => milestoneView(def, byMilestone.get(def.milestone), total));
}

/** Próxima conquista: o menor marco sem registro vigente acima do acumulado; `remaining` = marco − acumulado. Nenhum = null. */
export function nextMilestone(total, milestones) {
  const cents = toCents(total) ?? 0;
  const status = new Map(milestones.map((m) => [m.milestone, m.status]));
  for (const def of MILESTONES) {
    if (status.get(def.milestone) === 'active') continue;
    if (def.milestone * 100 > cents) return { milestone: def.milestone, label: def.label, remaining: fromCents(def.milestone * 100 - cents) };
  }
  return null;
}

/** PAD GOLD = situação do marco de 100k: 'none' (sem registro), 'active' ou 'in_review'. */
export function padGoldStatus(milestones) {
  const row = milestones.find((m) => m.milestone === PAD_GOLD_MILESTONE);
  if (!row || (row.status !== 'active' && row.status !== 'in_review')) return { status: 'none', reachedAt: null };
  return { status: row.status, reachedAt: row.reachedAt };
}

/** Rótulo do marco (null se não é um dos quatro). */
export function milestoneLabel(milestone) {
  return MILESTONES.find((m) => m.milestone === milestone)?.label ?? null;
}

// ---------------------------------------------------------------- só da demonstração

/** Meses de `from` a `to` (inclusive), em ordem. */
export function monthsBetween(from, to) {
  const out = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Aplica o resultado de evaluateMilestones nos registros (cópia nova, em ordem de marco). Nunca apaga um registro. */
export function applyMilestones(rows, result, at) {
  const out = rows.map((r) => ({ ...r }));
  for (const ins of result.inserts) out.push({ ...ins, status: 'active', reviewSince: null, updatedAt: at });
  for (const up of result.updates) Object.assign(out.find((r) => r.milestone === up.milestone), { status: up.status, reviewSince: up.reviewSince, updatedAt: at });
  return out.sort((a, b) => a.milestone - b.milestone);
}
