// Lógica pura (sem DOM, sem Node): usada pelo navegador e importada pelo servidor.

const MAX_INT_DIGITS = 10;
const fail = (message) => ({ ok: false, message });

/**
 * Lê um valor em reais digitado por uma pessoa e devolve o texto canônico "4800.00".
 * Aceita 4800, 4.800, 4.800,00, 4800,5, R$ 4.800,00 e o canônico 4800.50.
 * Ponto seguido de exatamente 3 dígitos é milhar (4.800 = 4800); ponto com 1–2 dígitos é decimal (1.5).
 */
export function parseMoney(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return fail('Informe um valor válido, como 4.800,00.');
    input = String(input);
  }
  if (typeof input !== 'string') return fail('Informe o valor.');

  const s = input.trim().replace(/^r\$\s*/i, '').replace(/\s+/g, '');
  if (s === '') return fail('Informe o valor.');
  if (!/^[\d.,]+$/.test(s)) return fail('Use apenas números, ponto e vírgula. Exemplo: 4.800,00');

  let intPart;
  let fracPart = '';

  if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length !== 2) return fail('Use uma única vírgula para os centavos. Exemplo: 4.800,00');
    const [i, f] = parts;
    if (!/^([1-9]\d{0,2}(\.\d{3})+|\d+)$/.test(i)) return fail('Separador de milhar inválido. Exemplo: 4.800,00');
    // Um ponto dentro da parte decimal (ex.: "4,800.00") indica milhar/vírgula trocados (formato americano), não excesso de casas.
    if (!/^\d+$/.test(f)) return fail('Milhar e vírgula parecem trocados. No Brasil o ponto separa milhar e a vírgula os centavos. Exemplo: 4.800,00');
    if (!/^\d{1,2}$/.test(f)) return fail('Use até 2 casas decimais. Exemplo: 4.800,50');
    intPart = i.replace(/\./g, '');
    fracPart = f;
  } else if (s.includes('.')) {
    if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
      intPart = s.replace(/\./g, '');
    } else if (/^\d+\.\d{1,2}$/.test(s)) {
      [intPart, fracPart] = s.split('.');
    } else {
      return fail('Valor inválido. Exemplo: 4.800,00');
    }
  } else {
    intPart = s;
  }

  intPart = intPart.replace(/^0+(?=\d)/, '');
  if (intPart.length > MAX_INT_DIGITS) return fail('Valor alto demais.');
  return { ok: true, value: `${intPart}.${(fracPart + '00').slice(0, 2)}` };
}

const CANONICAL = /^\d{1,10}\.\d{2}$/;

/** "4800.00" -> "R$ 4.800,00". Valor fora do formato canônico -> "—". */
export function formatMoney(value) {
  if (typeof value !== 'string' || !CANONICAL.test(value)) return '—';
  const [int, frac] = value.split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}

/** "4800.00" -> "4.800,00" (texto para preencher um campo de edição). Inválido -> "". */
export function moneyToInputText(value) {
  if (typeof value !== 'string' || !CANONICAL.test(value)) return '';
  const [int, frac] = value.split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}
