/** Data no formato brasileiro (dd/mm/aaaa), no fuso de São Paulo. */
export const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** Data e hora no formato brasileiro (dd/mm/aaaa HH:mm), no fuso de São Paulo. */
export const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

/**
 * 'AAAA-MM-DD' (data sem hora, como o servidor devolve `joinedOn`/`endsOn`) -> 'dd/mm/aaaa'.
 * Reordena o texto em vez de criar um Date: um Date em UTC mostraria o dia anterior no fuso de São Paulo.
 * Valor ausente ou fora do formato vira '—'.
 */
export function formatDateOnly(value) {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
}

/** Dia e mês curtos ("10 out.") no fuso de São Paulo, para rodapés de cartões. */
export const shortDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short' });
