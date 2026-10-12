// `.length` conta unidades UTF-16 (code units), igual ao `.max(120)` do zod no servidor —
// nunca `[...value].length` (pontos de código), que subcontaria caracteres fora do plano básico
// (ex.: a maioria dos emojis) e deixaria passar no cliente algo que o servidor rejeita.
export function nameError(value) {
  if (!value.trim()) return 'Informe o nome.';
  if (value.length > 120) return 'Nome muito longo (máximo 120).';
  return null;
}
