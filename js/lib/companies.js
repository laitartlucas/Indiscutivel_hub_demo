// Regras puras de Empresas (sem DOM), testadas em web/test/companies.test.js.
import { formatMoney } from '../../shared/money.js';

/** Mesma lista do servidor (SEGMENTS em server/src/repositories/companies.ts), com os rótulos em português. */
export const SEGMENT_LABELS = {
  consulting: 'Consultoria',
  strategy: 'Estratégia',
  digital_marketing: 'Marketing digital',
  health: 'Saúde',
  education: 'Educação',
  architecture: 'Arquitetura',
  law: 'Jurídico',
  finance: 'Finanças',
  retail: 'Varejo',
  technology: 'Tecnologia',
  beauty: 'Beleza e bem-estar',
  food: 'Alimentação',
  industry: 'Indústria',
  services: 'Serviços',
  other: 'Outro',
};
export const SEGMENT_OPTIONS = Object.entries(SEGMENT_LABELS).map(([value, label]) => ({ value, label }));
export const SEGMENT_FORM_OPTIONS = [{ value: '', label: 'Sem segmento' }, ...SEGMENT_OPTIONS];
export const SEGMENT_FILTER_OPTIONS = [{ value: '', label: 'Todos' }, ...SEGMENT_OPTIONS];

export const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE',
  'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];
export const STATE_OPTIONS = [{ value: '', label: 'UF' }, ...STATES.map((value) => ({ value, label: value }))];

export const SORT_OPTIONS = [
  { value: 'pipeline:desc', label: 'Valor do pipeline' },
  { value: 'name:asc', label: 'Nome (A–Z)' },
  { value: 'last_activity:desc', label: 'Última atividade' },
];

export function segmentLabel(segment) {
  return segment ? (SEGMENT_LABELS[segment] ?? segment) : null;
}

/** "São Paulo · SP", só com o que existe. */
export function locationLabel(company) {
  return [company.city, company.state].filter(Boolean).join(' · ');
}

/** "Casa Lume Arquitetura" -> "CL"; uma palavra só -> a inicial. */
export function logoLetters(name) {
  const words = String(name ?? '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? [...words[0]][0] : `${[...words[0]][0]}${[...words[words.length - 1]][0]}`;
  return letters.toUpperCase();
}

/** Cor do avatar-logo: uma de 5 variações fixas por empresa (estável entre telas). */
export function logoTone(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 5;
}

function toCents(value) {
  const [int, frac = '0'] = String(value ?? '0').split('.');
  return Number(int) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
}

/** "R$ 27.000" (sem centavos quando inteiro); ausente -> "R$ 0". */
export function moneyShort(value) {
  const text = formatMoney(typeof value === 'string' ? value : '0.00');
  return text === '—' ? 'R$ 0' : text.endsWith(',00') ? text.slice(0, -3) : text;
}

/** Largura (0 a 100) da barra do pipeline, proporcional à maior conta; com valor, no mínimo 4% para a barra aparecer. */
export function barPercent(value, max) {
  const v = toCents(value);
  const m = toCents(max);
  if (v <= 0 || m <= 0) return 0;
  return Math.min(100, Math.max(4, Math.round((v / m) * 100)));
}

/** Os 3 cartões do topo, só com números que a API entrega. */
export function kpiCards(summary) {
  const s = summary ?? { total: 0, active: 0, pipelineValue: '0.00', top: null };
  return [
    { id: 'active', label: 'Empresas ativas', value: String(s.active ?? 0), note: `de ${s.total ?? 0} ${(s.total ?? 0) === 1 ? 'cadastrada' : 'cadastradas'}` },
    { id: 'pipeline', label: 'Pipeline em empresas', value: moneyShort(s.pipelineValue), note: '' },
    s.top
      ? { id: 'top', label: 'Maior conta', value: s.top.name, note: `${moneyShort(s.top.pipelineValue)} em ${s.top.openDealsCount} ${s.top.openDealsCount === 1 ? 'oportunidade' : 'oportunidades'}`, dark: true }
      : { id: 'top', label: 'Maior conta', value: '—', note: 'Nenhuma oportunidade em andamento', dark: true },
  ];
}

// ---------- validação (espelha as regras do servidor) ----------

export function companyNameError(value) {
  if (!value.trim()) return 'Informe o nome da empresa.';
  if (value.trim().length > 120) return 'Nome muito longo (máximo 120).';
  return null;
}

export const cityError = (value) => (value.trim().length > 80 ? 'Cidade muito longa (máximo 80).' : null);

export function websiteError(value) {
  const text = value.trim();
  if (!text) return null;
  if (text.length > 200) return 'Endereço muito longo (máximo 200).';
  let url = null;
  try {
    url = new URL(text);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== 'https:' || !url.hostname.includes('.') || /\s/.test(text)) {
    return 'Informe o site começando com https://, por exemplo https://empresa.com.br.';
  }
  return null;
}

export const companyNotesError = (value) => (value.trim().length > 1000 ? 'Observações muito longas (máximo 1000).' : null);
