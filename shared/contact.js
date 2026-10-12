// Lógica pura (sem DOM, sem Node): usada pelo navegador e importada pelo servidor.

const fail = (message) => ({ ok: false, message });
const EMPTY = { ok: true, value: null };

/**
 * Normaliza um WhatsApp para dígitos com DDI ("5511912345678").
 * Com "+" ou "00" no início o número é internacional completo; sem isso, 10–11 dígitos = Brasil sem DDI.
 */
export function normalizeWhatsapp(input) {
  if (input === null || input === undefined) return EMPTY;
  if (typeof input !== 'string') return fail('Informe o WhatsApp como texto.');
  const s = input.trim();
  if (s === '') return EMPTY;
  if (!/^\+?[\d\s().-]+$/.test(s)) return fail('Use apenas números, espaços, parênteses e hífen.');

  let digits = s.replace(/\D/g, '');
  let international = s.startsWith('+');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }

  if (international && digits.startsWith('0')) return fail('Código do país inválido: não pode começar com 0.');

  if (!international) {
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    else if (!((digits.length === 12 || digits.length === 13) && digits.startsWith('55'))) {
      return fail('Informe o DDD e o número (exemplo: 11 91234-5678) ou use + e o código do país.');
    }
  }

  if (digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);
    if (!/^[1-9]\d$/.test(ddd)) return fail('DDD inválido.');
    if (number.length !== 8 && number.length !== 9) return fail('Número brasileiro incompleto. Use DDD + 8 ou 9 dígitos.');
    if (number.length === 9 && !number.startsWith('9')) return fail('Celular brasileiro com 9 dígitos precisa começar com 9.');
    return { ok: true, value: digits };
  }

  if (digits.length < 11 || digits.length > 15) return fail('Número internacional inválido. Inclua o código do país (11 a 15 dígitos).');
  return { ok: true, value: digits };
}

/** "5511912345678" -> "+55 (11) 91234-5678"; fixo -> "+55 (11) 3123-4567"; outros -> "+<dígitos>". */
export function formatWhatsapp(digits) {
  if (typeof digits !== 'string' || !/^\d{10,15}$/.test(digits)) return '';
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);
    const split = number.length - 4;
    return `+55 (${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
  }
  return `+${digits}`;
}

/** "@Maria.Souza" ou "maria" -> "@maria.souza". Aceita 1–30 caracteres [a-z0-9._]. */
export function normalizeInstagram(input) {
  if (input === null || input === undefined) return EMPTY;
  if (typeof input !== 'string') return fail('Informe o Instagram como texto.');
  const s = input.trim();
  if (s === '') return EMPTY;
  const handle = (s.startsWith('@') ? s.slice(1) : s).toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) return fail('Instagram inválido. Use até 30 letras, números, ponto ou sublinhado.');
  return { ok: true, value: `@${handle}` };
}

/** E-mail em minúsculas com validação simples (o servidor não envia e-mails nesta fase). */
export function normalizeEmail(input) {
  if (input === null || input === undefined) return EMPTY;
  if (typeof input !== 'string') return fail('Informe o e-mail como texto.');
  const s = input.trim().toLowerCase();
  if (s === '') return EMPTY;
  if (s.length > 254 || /[\u0000-\u001f\u007f]/.test(s) || s.endsWith('.') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return fail('Informe um e-mail válido, como nome@empresa.com.');
  return { ok: true, value: s };
}
