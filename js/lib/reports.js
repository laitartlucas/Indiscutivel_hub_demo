// Regras puras dos Relatórios (sem DOM), testadas em web/test/reports.test.js. Todos os números vêm de
// GET /api/v1/reports/overview (calculados no servidor a partir do CRM real da aluna); aqui só se formata, compara e desenha.

const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MINUS = '−';

export const PERIODS = [
  { value: '30d', label: '30 dias', long: 'Últimos 30 dias' },
  { value: 'quarter', label: 'Trimestre', long: 'Trimestre atual' },
  { value: '12m', label: '12 meses', long: 'Últimos 12 meses' },
];
export const DEFAULT_PERIOD = '30d';

export function isPeriod(value) {
  return PERIODS.some((p) => p.value === value);
}

export function periodLong(value) {
  return PERIODS.find((p) => p.value === value)?.long ?? '';
}

/** "3100.5" -> 3100.5 (o servidor manda R$ como texto decimal). */
export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** R$ completo: "R$ 3.100,50"; inteiro sem centavos: "R$ 3.100". */
export function formatMoney(value) {
  const n = toNumber(value);
  const whole = Math.round(n * 100) % 100 === 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(n);
}

/** Valor curto de gráfico: 38.500 -> "38,5 mil"; 950 -> "950"; 0 -> "0". */
export function compactMoney(value) {
  const n = toNumber(value);
  if (n >= 1_000_000) return `${nf1.format(n / 1_000_000).replace(/,0$/, '')} mi`;
  if (n >= 1000) return `${nf1.format(n / 1000).replace(/,0$/, '')} mil`;
  return nf.format(Math.round(n));
}

/** 75 -> "75%"; 66.7 -> "66,7%"; null -> "—". */
export function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  return `${Number.isInteger(value) ? nf.format(value) : nf1.format(value)}%`;
}

/**
 * Variação em relação ao período anterior para valores absolutos (R$, contagens). SÓ existe com base de comparação:
 * período anterior igual a zero (ou ausente) não tem variação percentual -> kind 'none'. Arredonda para o inteiro mais próximo.
 */
export function variation(current, previous) {
  const cur = toNumber(current);
  const prev = toNumber(previous);
  if (previous === null || previous === undefined || !(prev > 0)) return { kind: 'none' };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { kind: 'flat', pct: 0 };
  return { kind: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) };
}

/** Variação de uma taxa em pontos percentuais (pp, 1 casa). Exige as duas taxas (null = sem base). */
export function rateVariation(current, previous) {
  if (current === null || current === undefined || previous === null || previous === undefined) return { kind: 'none' };
  const pp = Math.round((current - previous) * 10) / 10;
  if (pp === 0) return { kind: 'flat', pp: 0 };
  return { kind: pp > 0 ? 'up' : 'down', pp: Math.abs(pp) };
}

/** Texto curto da variação: "+14%", "−3%", "+1,8 pp", "Sem variação", "Sem base de comparação". */
export function variationText(v) {
  if (v.kind === 'none') return 'Sem base de comparação';
  if (v.kind === 'flat') return 'Sem variação';
  const sign = v.kind === 'up' ? '+' : MINUS;
  return v.pp !== undefined ? `${sign}${nf1.format(v.pp)} pp` : `${sign}${nf.format(v.pct)}%`;
}

/** Frase para leitor de tela e para o CSV (sem sinais no começo, para não virar fórmula): "alta de 14%", "queda de 3%". */
export function variationSentence(v) {
  if (v.kind === 'none') return 'sem base de comparação';
  if (v.kind === 'flat') return 'sem variação';
  const amount = v.pp !== undefined ? `${nf1.format(v.pp)} pontos percentuais` : `${nf.format(v.pct)}%`;
  return `${v.kind === 'up' ? 'alta' : 'queda'} de ${amount}`;
}

/** "2026-09-12" -> "12 set" / com ano: "12 set 2026". */
export function shortDate(date, withYear = false) {
  const [y, m, d] = String(date).split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}${withYear ? ` ${y}` : ''}`;
}

/** "12 set – 11 out 2026". */
export function rangeLabel(range) {
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  return `${shortDate(range.from, !sameYear)} – ${shortDate(range.to, true)}`;
}

/**
 * Colunas do gráfico de vendas (agrupamento por mês ou por bloco, conforme o servidor mandou): altura em % do maior valor
 * (mínimo 4% quando há venda, para a barra aparecer), rótulo e valor curto. A última coluna é a atual.
 */
export function salesColumns(buckets) {
  const max = Math.max(0, ...buckets.map((b) => toNumber(b.sales)));
  return buckets.map((b, i) => {
    const value = toNumber(b.sales);
    return {
      key: b.key,
      label: b.label,
      value,
      valueText: compactMoney(value),
      height: max === 0 || value === 0 ? 0 : Math.max(4, Math.round((value / max) * 100)),
      current: i === buckets.length - 1,
    };
  });
}

/** Ganhas x perdidas por bloco: alturas em % do maior valor de uma coluna. */
export function outcomeColumns(buckets) {
  const max = Math.max(0, ...buckets.map((b) => Math.max(b.won, b.lost)));
  const h = (n) => (max === 0 || n === 0 ? 0 : Math.max(8, Math.round((n / max) * 100)));
  return buckets.map((b) => ({ key: b.key, label: b.label, won: b.won, lost: b.lost, wonHeight: h(b.won), lostHeight: h(b.lost) }));
}

/** Tarefas concluídas por bloco. */
export function taskColumns(buckets) {
  const max = Math.max(0, ...buckets.map((b) => b.tasksDone));
  return buckets.map((b, i) => ({
    key: b.key,
    label: b.label,
    count: b.tasksDone,
    height: max === 0 || b.tasksDone === 0 ? 0 : Math.max(6, Math.round((b.tasksDone / max) * 100)),
    current: i === buckets.length - 1,
  }));
}

/** Barras de origem: as `limit` maiores e o resto somado em "Outras". Largura relativa à maior. */
export function sourceBars(sources, limit = 6) {
  const head = sources.slice(0, limit);
  const rest = sources.slice(limit);
  const items = rest.length > 0 ? [...head, { key: '_others', label: 'Outras', count: rest.reduce((n, s) => n + s.count, 0) }] : head;
  const max = Math.max(0, ...items.map((s) => s.count));
  return items.map((s) => ({ ...s, width: max === 0 ? 0 : Math.max(4, Math.round((s.count / max) * 100)) }));
}

/** Etapas do funil com a largura relativa à primeira (as que chegaram) e o texto de avanço. */
export function funnelRows(funnel) {
  const first = funnel.stages[0]?.count ?? 0;
  return funnel.stages.map((s, i) => ({
    ...s,
    width: first === 0 || s.count === 0 ? 0 : Math.max(4, Math.round((s.count / first) * 100)),
    text: i === 0 || s.advancePct === null ? `${nf.format(s.count)}` : `${nf.format(s.count)} · ${s.advancePct}% da etapa anterior`,
  }));
}

/** "Metas: 2 de 3 no ritmo". */
export function goalsText(goals) {
  return `Metas: ${goals.onTrack} de ${goals.total} no ritmo`;
}

// ------------------------------------------------------------------ exportação em CSV (gerada no navegador)

const CSV_FORMULA = /^[=+\-@\t\r]/;

/**
 * Uma célula de CSV. Texto que começa com = + - @ (ou tab/CR) é prefixado com apóstrofo para o Excel/Planilhas não
 * tratar como fórmula; aspas, ';' e quebras de linha exigem aspas duplas (as aspas internas são dobradas).
 */
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (CSV_FORMULA.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** BOM UTF-8 + separador ';' + CRLF: abre certo no Excel em português. */
export function toCsv(rows) {
  return `﻿${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

const money2 = (value) => toNumber(value).toFixed(2).replace('.', ',');

/**
 * Linhas do CSV: exatamente os números exibidos na tela (sem nada a mais). Colunas: Seção; Item; Valor; Complemento.
 * Variações saem em palavras ("alta de 14%") para não começar com sinal.
 */
export function reportRows(report) {
  const k = report.kpis;
  const line = (section, item, value, extra = '') => [section, item, value, extra];
  const rows = [['Seção', 'Item', 'Valor', 'Complemento']];
  rows.push(line('Período', periodLong(report.period), rangeLabel(report.range), `Comparado a ${rangeLabel(report.previousRange)}`));
  const compare = (v, previous) => `Período anterior: ${previous}; ${variationSentence(v)}`;
  rows.push(line('Indicadores', 'Vendas ganhas (R$)', money2(k.salesWon.current), compare(variation(k.salesWon.current, k.salesWon.previous), money2(k.salesWon.previous))));
  rows.push(line('Indicadores', 'Oportunidades ganhas', k.dealsWon.current, compare(variation(k.dealsWon.current, k.dealsWon.previous), k.dealsWon.previous)));
  rows.push(
    line(
      'Indicadores',
      'Taxa de conversão',
      k.conversionRate.current === null ? 'Sem base' : formatPercent(k.conversionRate.current),
      compare(rateVariation(k.conversionRate.current, k.conversionRate.previous), k.conversionRate.previous === null ? 'sem base' : formatPercent(k.conversionRate.previous)),
    ),
  );
  rows.push(line('Indicadores', 'Novos leads', k.newLeads.current, compare(variation(k.newLeads.current, k.newLeads.previous), k.newLeads.previous)));
  const unit = report.granularity === 'month' ? 'mês' : 'bloco de 6 dias';
  for (const b of report.buckets) rows.push(line(`Vendas por ${unit}`, b.label, money2(b.sales)));
  for (const b of report.buckets) rows.push(line(`Ganhas e perdidas por ${unit}`, b.label, b.won, `Perdidas: ${b.lost}`));
  for (const s of report.funnel.stages) rows.push(line('Funil das oportunidades criadas no período', s.label, s.count, s.advancePct === null ? '' : `${s.advancePct}% da etapa anterior`));
  for (const s of report.sources) rows.push(line('Leads por origem', s.label, s.count));
  rows.push(line('Tarefas', 'Concluídas', report.tasks.done));
  if (report.tasks.onTimePct !== null) rows.push(line('Tarefas', 'Entregues no prazo', `${report.tasks.onTimePct}%`, `${report.tasks.withDue} concluídas tinham prazo`));
  if (report.goals) rows.push(line('Metas', 'Metas do mês no ritmo', `${report.goals.onTrack} de ${report.goals.total}`));
  return rows;
}

/** Nome do arquivo: relatorio-indiscutivel-hub-12m-2026-02-01-a-2027-01-15.csv */
export function csvFilename(report) {
  return `relatorio-indiscutivel-hub-${report.period}-${report.range.from}-a-${report.range.to}.csv`;
}
