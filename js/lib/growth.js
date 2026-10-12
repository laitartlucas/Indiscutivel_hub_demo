// Regras puras de Conquistas e Desafios (sem DOM), testadas em web/test/growth.test.js. Os números e as situações vêm do
// servidor (GET /api/v1/achievements, /challenges e /mentora/*): nada aqui inventa dado.

import { moneyToInputText, parseMoney } from '../../shared/money.js';

const nf = new Intl.NumberFormat('pt-BR');
const MONTHS_SHORT = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

export const xpText = (points) => `+${nf.format(Number(points) || 0)} XP`;

// ---------------------------------------------------------------- datas

/** 'AAAA-MM-DD' -> '01 out.' (reordena o texto: um Date em UTC mostraria o dia anterior em São Paulo). */
export function dayMonth(value) {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return m ? `${m[3]} ${MONTHS_SHORT[Number(m[2]) - 1]}` : '—';
}

/** 'AAAA-MM-DD' -> '01 out. 2026'. */
export function dayMonthYear(value) {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return m ? `${m[3]} ${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}` : '—';
}

const dayInSaoPaulo = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Instante ISO -> '12 set. 2026' no fuso de São Paulo (o mesmo dia de Brasília que o servidor usa). */
export function instantDayMonthYear(iso) {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? dayMonthYear(dayInSaoPaulo.format(new Date(time))) : '—';
}

export function instantDayMonth(iso) {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? dayMonth(dayInSaoPaulo.format(new Date(time))) : '—';
}

// ---------------------------------------------------------------- conquistas (aluna)

export const CATEGORY_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'vendas', label: 'Vendas' },
  { id: 'consistencia', label: 'Consistência' },
  { id: 'relacionamento', label: 'Relacionamento' },
  { id: 'marcos', label: 'Marcos' },
  { id: 'desafios', label: 'Desafios' },
];

const CATEGORY_ICONS = { vendas: 'gem', consistencia: 'flame', relacionamento: 'contatos', marcos: 'metas', desafios: 'desafios' };
export const categoryIcon = (category) => CATEGORY_ICONS[category] ?? 'conquistas';

/** Texto curto de quanto falta: "3 / 5", "R$ 38,5K / 50K", "5 / 7 dias", "Nível 02 / 05". Sem progresso (concedida por desafio): null. */
export function progressLabel(progress) {
  if (!progress || !Number.isFinite(progress.target)) return null;
  const { current, target, unit } = progress;
  if (unit === 'brl') return `${shortMoney(current)} / ${shortMoney(target, { prefix: false })}`;
  if (unit === 'days') return `${nf.format(Math.floor(current))} / ${nf.format(target)} dias`;
  if (unit === 'level') return `Nível ${String(Math.floor(current)).padStart(2, '0')} / ${String(target).padStart(2, '0')}`;
  return `${nf.format(Math.floor(current))} / ${nf.format(target)}`;
}

/** 38500 -> "R$ 38,5K"; 10000 -> "R$ 10K"; 1200000 -> "R$ 1,2 mi"; abaixo de mil mostra o valor inteiro. */
export function shortMoney(value, { prefix = true } = {}) {
  const n = Number(value) || 0;
  const p = prefix ? 'R$ ' : '';
  const trim = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
  if (n >= 1_000_000) return `${p}${trim(n / 1_000_000)} mi`;
  if (n >= 1000) return `${p}${trim(n / 1000)}K`;
  return `${p}${nf.format(Math.round(n * 100) / 100)}`;
}

export function filterAchievements(list, category) {
  return category === 'all' || !category ? list : list.filter((a) => a.category === category);
}

/** Desbloqueadas primeiro (mais novas antes), depois as bloqueadas pelo avanço (maior % antes), mantendo a ordem do catálogo. */
export function sortAchievements(list) {
  const rank = (a) => (a.unlocked ? 0 : 1);
  return list
    .map((a, index) => ({ a, index }))
    .sort((x, y) => {
      if (rank(x.a) !== rank(y.a)) return rank(x.a) - rank(y.a);
      if (x.a.unlocked) return (y.a.unlockedAt ?? '').localeCompare(x.a.unlockedAt ?? '') || x.index - y.index;
      return (y.a.progress?.pct ?? -1) - (x.a.progress?.pct ?? -1) || x.index - y.index;
    })
    .map((x) => x.a);
}

export const countsText = (unlocked, total) => `${nf.format(unlocked)} de ${nf.format(total)} ${total === 1 ? 'desbloqueada' : 'desbloqueadas'}`;

// ---------------------------------------------------------------- desafios (aluna)

export const CHALLENGE_TABS = [
  { id: 'active', label: 'Ativos' },
  { id: 'available', label: 'Disponíveis' },
  { id: 'done', label: 'Concluídos' },
];

/** Em que aba o desafio aparece. */
export function tabOf(challenge) {
  if (challenge.state === 'active') return 'active';
  if (challenge.state === 'completed' || challenge.state === 'ended') return 'done';
  return 'available';
}

export const STATE_META = {
  active: { label: 'Ativo', tone: 'ok' },
  available: { label: 'Disponível', tone: 'gold' },
  upcoming: { label: 'Em breve', tone: 'neutral' },
  completed: { label: 'Concluído', tone: 'dark' },
  ended: { label: 'Encerrado', tone: 'neutral' },
};
export const stateMeta = (state) => STATE_META[state] ?? STATE_META.available;

const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;

/** "Termina em 3 dias" / "Termina hoje" / "Começa amanhã" / "Começa em 5 dias" / "Encerrado". */
export function whenText(challenge) {
  if (challenge.phase === 'ended') return 'Encerrado';
  if (challenge.phase === 'upcoming') {
    return challenge.daysUntil === 1 ? 'Começa amanhã' : `Começa em ${plural(challenge.daysUntil, 'dia', 'dias')}`;
  }
  if (challenge.daysLeft === 0) return 'Termina hoje';
  if (challenge.daysLeft === 1) return 'Termina amanhã';
  return `Termina em ${plural(challenge.daysLeft, 'dia', 'dias')}`;
}

/** "9 / 15" (ações feitas). */
export const doneText = (challenge) => `${nf.format(challenge.progress.done)} / ${nf.format(challenge.progress.total)}`;

/** "9 de 15 ações" para leitor de tela e rodapés. */
export const doneLong = (challenge) => `${nf.format(challenge.progress.done)} de ${plural(challenge.progress.total, 'ação', 'ações')}`;

/** Duração em linguagem natural: "7 dias". */
export const durationText = (days) => plural(days, 'dia', 'dias');

/** "01 out. – 07 out." */
export const periodText = (challenge) => `${dayMonth(challenge.startsOn)} – ${dayMonth(challenge.endsOn)}`;

/** Recompensa na linha do cartão: "+500 XP" ou "+500 XP · conquista “Voz de Autoridade”". */
export function rewardText(challenge) {
  const parts = [];
  if (challenge.rewardXp > 0) parts.push(xpText(challenge.rewardXp));
  if (challenge.achievement) parts.push(`conquista “${challenge.achievement.title}”`);
  return parts.join(' · ');
}

/** Ações pendentes primeiro (na ordem), depois as feitas; no máximo `limit`. */
export function nextActions(actions, limit = 5) {
  const pending = actions.filter((a) => !a.done);
  const done = actions.filter((a) => a.done);
  return [...pending, ...done].slice(0, limit);
}

/** Segmentos da barra do desafio: ≤ 20 ações viram um segmento por ação; acima disso a tela usa barra contínua (null). */
export function segments(progress) {
  if (!progress || progress.total < 1 || progress.total > 20) return null;
  return Array.from({ length: progress.total }, (_, i) => i < progress.done);
}

/** Qual participar/continuar/ver: o rótulo do botão principal da lista. */
export function ctaLabel(challenge) {
  if (challenge.state === 'active') return 'Ver desafio';
  if (challenge.state === 'completed' || challenge.state === 'ended') return 'Ver resumo';
  return challenge.enrolled ? 'Ver desafio' : 'Ver detalhes';
}

// ---------------------------------------------------------------- aviso "Conquista desbloqueada" / "Desafio concluído"

/** Escolhe o que o toast diz a partir do campo aditivo `growth` da resposta (ou null quando não há o que anunciar). */
export function growthToasts(growth, points = 0) {
  const toasts = [];
  const achievements = Array.isArray(growth?.achievements) ? growth.achievements : [];
  const challenges = Array.isArray(growth?.challenges) ? growth.challenges : [];
  for (const challenge of challenges) toasts.push({ title: 'Desafio concluído', detail: challenge.title });
  if (achievements.length === 1) toasts.push({ title: 'Conquista desbloqueada', detail: achievements[0].title });
  else if (achievements.length > 1) toasts.push({ title: `${achievements.length} conquistas desbloqueadas`, detail: achievements.map((a) => a.title).join(' · ') });
  if (toasts.length && points > 0) toasts[toasts.length - 1].detail += ` · ${xpText(points)}`;
  return toasts;
}

// ---------------------------------------------------------------- mentora

export const RULE_HINTS = {
  deals_won_count: 'Quantidade de oportunidades ganhas, como 10.',
  revenue_won_total: 'Valor em reais das vendas ganhas, como 10.000,00. Só a aluna enxerga o valor dela; você vê apenas quantas desbloquearam.',
  tasks_done_count: 'Quantidade de tarefas concluídas, como 100.',
  leads_converted_count: 'Quantidade de leads convertidos, como 10.',
  people_count: 'Quantidade de pessoas cadastradas, como 25.',
  streak_days: 'Dias seguidos com atividade no Hub, como 7.',
  goals_reached_count: 'Quantidade de metas atingidas, como 1.',
  level_reached: 'Número do nível (de 1 a 12), como 5.',
  challenge_completed_count: 'Quantidade de desafios concluídos, como 1.',
  challenge_award: 'Sem valor: a conquista é concedida a quem concluir o desafio ao qual ela for vinculada.',
};

export const CHALLENGE_STATUS_META = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  scheduled: { label: 'Agendado', tone: 'gold' },
  active: { label: 'Ativo', tone: 'ok' },
  ended: { label: 'Encerrado', tone: 'neutral' },
  archived: { label: 'Arquivado', tone: 'neutral' },
};

/** Situação mostrada à mentora: combina o status salvo com a fase (publicado vira Agendado, Ativo ou Encerrado). */
export function mentoraStatus(challenge) {
  if (challenge.status === 'draft') return 'draft';
  if (challenge.status === 'archived') return 'archived';
  return challenge.phase === 'upcoming' ? 'scheduled' : challenge.phase === 'ended' ? 'ended' : 'active';
}

/** "15 ações · termina 01 out. · Turma 07" (cada parte só aparece quando existe). */
export function mentoraMeta(challenge) {
  const parts = [`${plural(challenge.actionsCount ?? challenge.actions?.length ?? 0, 'ação', 'ações')}`];
  parts.push(`${durationText(challenge.durationDays)}`);
  if (challenge.status === 'published') {
    parts.push(challenge.phase === 'upcoming' ? `começa ${dayMonth(challenge.startsOn)}` : challenge.phase === 'ended' ? `encerrou ${dayMonth(challenge.endsOn)}` : `termina ${dayMonth(challenge.endsOn)}`);
  }
  parts.push(challenge.classNames.length ? challenge.classNames.join(', ') : 'todas as turmas');
  return parts.join(' · ');
}

/** "31 de 34"? Não existe total de alunas por desafio; mostramos só quem entrou e quantas concluíram. */
export function participantsText(challenge) {
  if (challenge.status === 'draft') return '—';
  const base = plural(challenge.participants, 'participante', 'participantes');
  return challenge.completed > 0 ? `${base} · ${nf.format(challenge.completed)} ${challenge.completed === 1 ? 'concluiu' : 'concluíram'}` : base;
}

/** Texto do valor da regra no editor: reais com vírgula, contagens como inteiro. */
export function ruleValueInput(kind, value) {
  if (kind === 'challenge_award') return '';
  if (kind === 'revenue_won_total') return moneyToInputText(Number(value).toFixed(2));
  return String(Math.trunc(Number(value)));
}

/** Converte o texto digitado no valor numérico (null se inválido). Reais aceitam "10.000,50"; contagens, só dígitos. */
export function parseRuleValue(kind, text) {
  const raw = String(text ?? '').trim();
  if (kind === 'challenge_award') return 1;
  if (kind === 'revenue_won_total') {
    const parsed = parseMoney(raw);
    return parsed.ok ? Number(parsed.value) : null;
  }
  return /^\d{1,7}$/.test(raw) ? Number(raw) : null;
}
