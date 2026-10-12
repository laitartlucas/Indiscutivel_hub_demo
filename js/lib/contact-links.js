// Links de contato derivados SÓ do que o cadastro já guarda (WhatsApp em dígitos com DDI, como o servidor devolve).

const DIGITS = /^\d{10,15}$/;

/** "5511912345678" -> "https://wa.me/5511912345678"; valor fora do formato -> null. */
export function whatsappUrl(digits) {
  return typeof digits === 'string' && DIGITS.test(digits) ? `https://wa.me/${digits}` : null;
}

/** "5511912345678" -> "tel:+5511912345678"; valor fora do formato -> null. */
export function telUrl(digits) {
  return typeof digits === 'string' && DIGITS.test(digits) ? `tel:+${digits}` : null;
}
