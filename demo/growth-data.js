// Espelho de server/src/domain/growth.ts para a demonstração (regras de conquista, textos e conquistas padrão).
// server/test/growth-domain.test.ts confere que os números e os textos são idênticos aos do servidor.

export const ACHIEVEMENT_CATEGORIES = ['vendas', 'consistencia', 'relacionamento', 'marcos', 'desafios'];
export const CATEGORY_LABELS = { vendas: 'Vendas', consistencia: 'Consistência', relacionamento: 'Relacionamento', marcos: 'Marcos', desafios: 'Desafios' };

const int = (n) => n.toLocaleString('pt-BR');
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\s/g, ' ');
const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;

export const RULES = {
  deals_won_count: { label: 'Oportunidades ganhas', unit: 'oportunidades', decimals: false, max: 100000, describe: (n) => plural(n, 'oportunidade ganha', 'oportunidades ganhas') },
  revenue_won_total: { label: 'Valor em vendas ganhas', unit: 'R$', decimals: true, max: 100000000, describe: (n) => `${brl(n)} em vendas ganhas` },
  tasks_done_count: { label: 'Tarefas concluídas', unit: 'tarefas', decimals: false, max: 100000, describe: (n) => plural(n, 'tarefa concluída', 'tarefas concluídas') },
  leads_converted_count: { label: 'Leads convertidos', unit: 'leads', decimals: false, max: 100000, describe: (n) => `${plural(n, 'lead convertido', 'leads convertidos')} em oportunidade` },
  people_count: { label: 'Pessoas cadastradas', unit: 'pessoas', decimals: false, max: 100000, describe: (n) => plural(n, 'pessoa cadastrada', 'pessoas cadastradas') },
  streak_days: { label: 'Dias seguidos com atividade', unit: 'dias', decimals: false, max: 365, describe: (n) => `${plural(n, 'dia seguido', 'dias seguidos')} com atividade` },
  goals_reached_count: { label: 'Metas atingidas', unit: 'metas', decimals: false, max: 1000, describe: (n) => plural(n, 'meta atingida', 'metas atingidas') },
  level_reached: { label: 'Nível alcançado', unit: 'nível', decimals: false, max: 12, describe: (n) => `Chegar ao nível ${String(n).padStart(2, '0')}` },
  challenge_completed_count: { label: 'Desafios concluídos', unit: 'desafios', decimals: false, max: 1000, describe: (n) => plural(n, 'desafio concluído', 'desafios concluídos') },
  challenge_award: { label: 'Ao concluir o desafio vinculado', unit: '', decimals: false, max: 1, describe: () => 'Concluir o desafio vinculado' },
};
export const RULE_KINDS = Object.keys(RULES);
export const describeRule = (kind, value) => RULES[kind].describe(value);

// Sem as antigas "Primeiros R$ 10K" e "R$ 50K" (seed_key sales-10k e sales-50k): arquivadas na Entrega 6 (decisão B4), trocadas
// pelos marcos de faturamento autodeclarado (revenue-data.js). Quem já desbloqueou continua com o desbloqueio no histórico.
export const SEED_ACHIEVEMENTS = [
  { key: 'first-sale', title: 'Primeira venda', description: 'Primeira oportunidade marcada como ganha.', category: 'vendas', ruleKind: 'deals_won_count', ruleValue: 1, xpReward: 100 },
  { key: 'tasks-25', title: '25 tarefas', description: 'Vinte e cinco tarefas concluídas.', category: 'consistencia', ruleKind: 'tasks_done_count', ruleValue: 25, xpReward: 100 },
  { key: 'tasks-100', title: '100 tarefas', description: 'Cem tarefas concluídas.', category: 'consistencia', ruleKind: 'tasks_done_count', ruleValue: 100, xpReward: 300 },
  { key: 'streak-7', title: 'Rotina de ferro', description: 'Sete dias seguidos com atividade no Hub.', category: 'consistencia', ruleKind: 'streak_days', ruleValue: 7, xpReward: 150 },
  { key: 'streak-30', title: 'Constância de 30 dias', description: 'Trinta dias seguidos com atividade no Hub.', category: 'consistencia', ruleKind: 'streak_days', ruleValue: 30, xpReward: 400 },
  { key: 'funnel-alive', title: 'Funil vivo', description: 'Dez leads convertidos em oportunidade.', category: 'relacionamento', ruleKind: 'leads_converted_count', ruleValue: 10, xpReward: 200 },
  { key: 'network-25', title: 'Rede em crescimento', description: 'Vinte e cinco pessoas cadastradas.', category: 'relacionamento', ruleKind: 'people_count', ruleValue: 25, xpReward: 100 },
  { key: 'goal-1', title: 'Meta batida', description: 'Primeira meta do mês atingida.', category: 'marcos', ruleKind: 'goals_reached_count', ruleValue: 1, xpReward: 150 },
  { key: 'level-5', title: 'Nível 05', description: 'Chegar ao nível 05 (Consistente).', category: 'marcos', ruleKind: 'level_reached', ruleValue: 5, xpReward: 200 },
  { key: 'challenge-1', title: 'Primeiro desafio', description: 'Concluir o primeiro desafio da mentoria.', category: 'desafios', ruleKind: 'challenge_completed_count', ruleValue: 1, xpReward: 150 },
];

export const ACTION_KINDS = ['manual', 'auto_task_done_count', 'auto_lead_created', 'auto_deal_won', 'auto_people_added'];

export function describeAction(kind, target) {
  switch (kind) {
    case 'manual':
      return null;
    case 'auto_task_done_count':
      return `Conta sozinha: ${plural(target, 'tarefa concluída', 'tarefas concluídas')} no período`;
    case 'auto_lead_created':
      return `Conta sozinha: ${plural(target, 'lead criado', 'leads criados')} no período`;
    case 'auto_deal_won':
      return `Conta sozinha: ${plural(target, 'oportunidade ganha', 'oportunidades ganhas')} no período`;
    case 'auto_people_added':
      return `Conta sozinha: ${plural(target, 'pessoa cadastrada', 'pessoas cadastradas')} no período`;
    default:
      return null;
  }
}

/** Maior sequência de dias consecutivos (AAAA-MM-DD) numa lista. */
export function longestStreak(days) {
  const unique = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous = null;
  for (const day of unique) {
    const at = Date.parse(`${day}T00:00:00Z`);
    run = previous !== null && at - previous === 86_400_000 ? run + 1 : 1;
    previous = at;
    if (run > best) best = run;
  }
  return best;
}

export const endsOnFor = (startsOn, durationDays) => new Date(Date.parse(`${startsOn}T00:00:00Z`) + (durationDays - 1) * 86_400_000).toISOString().slice(0, 10);

export function phaseOf(today, startsOn, endsOn) {
  if (today < startsOn) return 'upcoming';
  if (today > endsOn) return 'ended';
  return 'active';
}

const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
export const daysLeft = (today, endsOn) => Math.max(0, dayDiff(endsOn, today));
export const daysUntil = (today, startsOn) => Math.max(0, dayDiff(startsOn, today));

export function isEligible(classNames, studentClass) {
  if (classNames.length === 0) return true;
  if (!studentClass) return false;
  const mine = studentClass.trim().toLowerCase();
  return classNames.some((name) => name.trim().toLowerCase() === mine);
}

export const completionPct = (done, total) => (total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0);

