// Regras puras do Acompanhamento e dos Relatórios da mentoria (sem DOM), testadas em web/test/followup.test.js.
// Todos os números vêm de GET /api/v1/mentora/followup e /reports (calculados no servidor a partir de SINAIS de mentoria:
// dias com atividade, contagens, níveis). Aqui só se formata, compara e desenha. Nada de R$ nem de dado do CRM.
import { periodLong, rangeLabel, rateVariation, variation, variationSentence } from './reports.js';

const MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const nf = new Intl.NumberFormat('pt-BR');

export const PLAN_MAX = 300;
export const NOTE_MAX = 500;

// ------------------------------------------------------------------ datas

/** "2026-10-01" -> "01 out." */
export function dayMonth(date) {
  const [, m, d] = String(date).split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
}

/** "2026-10-01" -> "Qui, 01 out." */
export function formatDay(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
}

/** "05 out. – 11 out." (ou "28 set. – 04 out."). */
export function weekRange(start, end) {
  return `${dayMonth(start)} – ${dayMonth(end)}`;
}

/** "S34 a S41 · 17 ago. – 11 out." para a janela de semanas. */
export function windowLabel(weeks) {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return `${first.label} a ${last.label} · ${dayMonth(first.start)} – ${dayMonth(last.end)}`;
}

// ------------------------------------------------------------------ mapa de calor

export const HEAT_LABELS = ['sem atividade', 'baixa', 'moderada', 'boa', 'excelente'];

/** Nível 0 a 4 a partir dos dias com atividade sobre os dias decorridos (0; até 29%; até 58%; abaixo de 100%; 100%). Com 7 dias: 0; 1-2; 3-4; 5-6; 7. */
export function heatLevel(activeDays, elapsedDays = 7) {
  if (!(activeDays > 0)) return 0;
  const pct = (activeDays / Math.max(1, elapsedDays)) * 100;
  if (pct <= 29) return 1;
  if (pct <= 58) return 2;
  if (pct < 100) return 3;
  return 4;
}

/** Texto da célula para leitor de tela e dica: nunca só cor. */
export function cellSentence(week, cell) {
  const days = cell.activeDays;
  const of = cell.elapsedDays ?? 7;
  const running = week.current ? ' (semana em andamento)' : '';
  return `Semana ${week.label}${running}: ${cell.pct}% de engajamento, ${days} ${days === 1 ? 'dia' : 'dias'} com atividade de ${of} (${HEAT_LABELS[heatLevel(days, of)]})`;
}

/** Resumo de uma linha inteira (aluna) para leitor de tela. */
export function rowSentence(item) {
  return `Engajamento médio de ${item.avgPct}% nas últimas 8 semanas.`;
}

export const TREND_INFO = {
  up: { text: 'Subindo', icon: 'chevronUp', tone: 'up' },
  flat: { text: 'Estável', icon: 'arrowRight', tone: 'flat' },
  down: { text: 'Em queda', icon: 'chevronDown', tone: 'down' },
};

export function trendSentence(item) {
  const info = TREND_INFO[item.trend] ?? TREND_INFO.flat;
  if (item.trend === 'flat') return `Tendência estável: média das 3 últimas semanas parecida com a das 3 anteriores.`;
  const pts = Math.abs(item.trendDelta);
  return `Tendência ${info.text.toLowerCase()}: ${pts} ${pts === 1 ? 'ponto' : 'pontos'} ${item.trend === 'up' ? 'acima' : 'abaixo'} da média das 3 semanas anteriores.`;
}

export const STATE_INFO = {
  at_risk: { label: 'Em risco', tone: 'bad' },
  very_engaged: { label: 'Muito engajada', tone: 'good' },
  no_activity: { label: 'Sem atividade', tone: 'warn' },
  steady: { label: 'Regular', tone: 'neutral' },
};

export const SORT_OPTIONS = [
  { value: 'risk', label: 'Por risco' },
  { value: 'name', label: 'Nome (A a Z)' },
  { value: 'engagement', label: 'Menor engajamento' },
];

/** Situação do próximo check-in combinado. */
export const DUE_INFO = {
  overdue: { label: 'Atrasado', tone: 'bad' },
  today: { label: 'Hoje', tone: 'warn' },
  upcoming: { label: 'Em dia', tone: 'good' },
};

export function idleText(item) {
  if (item.idleDays === null || item.idleDays === undefined) return 'Ainda sem sinal de atividade.';
  if (item.idleDays === 0) return 'Ativa hoje.';
  return `Último sinal há ${item.idleDays} ${item.idleDays === 1 ? 'dia' : 'dias'}.`;
}

// ------------------------------------------------------------------ plano de ação

export function planError(value) {
  const text = (value ?? '').trim();
  if (!text) return 'Escreva o plano de ação.';
  if (text.length > PLAN_MAX) return `O plano é longo demais (máximo ${PLAN_MAX} caracteres).`;
  return null;
}

/** Data AAAA-MM-DD válida (ou vazia). */
export function checkinDateError(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Informe uma data válida.';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return 'Informe uma data válida.';
  return null;
}

// ------------------------------------------------------------------ Relatórios da mentoria

/**
 * Os 4 indicadores com comparação ao período anterior equivalente. A variação só existe com base (período anterior > 0 ou taxa
 * conhecida): sem base o texto diz "Sem base de comparação" e nada é inventado.
 */
export function reportKpis(report) {
  const k = report.kpis;
  const prevHadActivity = k.activeStudents.previous > 0;
  const engagementDelta = prevHadActivity ? rateVariation(k.engagement.current, k.engagement.previous) : { kind: 'none' };
  const completionDelta = rateVariation(k.challengeCompletion.current, k.challengeCompletion.previous);
  return [
    {
      key: 'active',
      label: 'Alunas ativas',
      value: String(k.activeStudents.current),
      delta: variation(k.activeStudents.current, k.activeStudents.previous),
      note: `de ${k.activeStudents.total} ${k.activeStudents.total === 1 ? 'aluna' : 'alunas'} no acompanhamento`,
      dark: true,
    },
    { key: 'engagement', label: 'Engajamento médio', value: `${k.engagement.current}%`, delta: engagementDelta, note: 'dias com atividade ÷ dias do período' },
    {
      key: 'completion',
      label: 'Conclusão dos desafios',
      value: k.challengeCompletion.current === null ? '—' : `${k.challengeCompletion.current}%`,
      delta: completionDelta,
      note: k.challengeCompletion.current === null ? 'Nenhum desafio em andamento no período' : 'média de ações feitas nos desafios',
    },
    { key: 'goals', label: 'Metas atingidas', value: String(k.goalsReached.current), delta: variation(k.goalsReached.current, k.goalsReached.previous), note: 'metas das alunas batidas no período' },
  ];
}

/** Barras horizontais do uso por módulo: largura = % das alunas que usaram o módulo (mínimo 4% quando alguém usou). */
export function moduleBars(modules) {
  return modules.map((m) => ({ ...m, width: m.students === 0 ? 0 : Math.max(4, m.pct) }));
}

/** Colunas simples (metas por mês, níveis): altura em % do maior valor (mínimo 4% quando há valor). */
export function columnsOf(items, valueOf) {
  const max = Math.max(0, ...items.map(valueOf));
  return items.map((item) => {
    const value = valueOf(item);
    return { item, value, height: max === 0 || value === 0 ? 0 : Math.max(4, Math.round((value / max) * 100)) };
  });
}

export function studentsText(n) {
  return `${nf.format(n)} ${n === 1 ? 'aluna' : 'alunas'}`;
}

/** Frase do gráfico de níveis para leitor de tela. */
export function levelsSummary(levels) {
  const filled = levels.filter((l) => l.students > 0);
  if (filled.length === 0) return 'Nenhuma aluna com XP ainda.';
  return filled.map((l) => `Nível ${String(l.n).padStart(2, '0')}: ${studentsText(l.students)}`).join('; ') + '.';
}

/** null/ausente = todas; '' = sem turma. */
export function turmaLabel(turma) {
  if (turma === null || turma === undefined) return 'Todas as turmas';
  return turma === '' ? 'Sem turma' : `Turma ${turma}`;
}

const deltaWords = (delta) => variationSentence(delta);

/**
 * Linhas do CSV: exatamente os números exibidos na tela. Colunas: Seção; Item; Valor; Complemento. Variações saem em palavras
 * (nunca começam com sinal, para não virar fórmula na planilha). Sem nenhum valor em R$: a mentora não os vê.
 */
export function mentoraReportRows(report) {
  const line = (section, item, value, extra = '') => [section, item, value, extra];
  const rows = [['Seção', 'Item', 'Valor', 'Complemento']];
  rows.push(line('Período', periodLong(report.period), rangeLabel(report.range), `Comparado a ${rangeLabel(report.previousRange)}`));
  rows.push(line('Escopo', turmaLabel(report.turma), studentsText(report.students)));
  const previousOf = { active: report.kpis.activeStudents.previous, engagement: `${report.kpis.engagement.previous}%`, completion: report.kpis.challengeCompletion.previous === null ? 'sem base' : `${report.kpis.challengeCompletion.previous}%`, goals: report.kpis.goalsReached.previous };
  for (const k of reportKpis(report)) rows.push(line('Indicadores', k.label, k.value, `Período anterior: ${previousOf[k.key]}; ${deltaWords(k.delta)}`));
  for (const m of report.modules) rows.push(line('Uso por módulo', m.label, `${m.actions} ${m.actions === 1 ? 'ação' : 'ações'}`, `${studentsText(m.students)} (${m.pct}%)`));
  for (const g of report.goalsByMonth) rows.push(line('Metas atingidas por mês', g.label, g.count));
  for (const l of report.levels) rows.push(line('Distribuição de níveis', `Nível ${String(l.n).padStart(2, '0')} ${l.name}`, l.students));
  for (const t of report.topEvolution) rows.push(line('Maior evolução no trimestre', `${t.position}. ${t.name}`, `${nf.format(t.xpGained)} XP`, `Nível ${String(t.level.n).padStart(2, '0')} ${t.level.name}`));
  return rows;
}

export function mentoraCsvFilename(report) {
  return `relatorio-mentoria-${report.period}-${report.range.from}-a-${report.range.to}.csv`;
}
