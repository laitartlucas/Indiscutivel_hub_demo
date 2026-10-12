import { attrs, html } from '../lib/html.js';
import { durationError, fromLocalInput, sessionDateError, toLocalInput } from '../lib/mentora.js';
import { field, selectField } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';

// Diálogos de Notas privadas e Sessões de mentoria (Perfil da aluna). Nenhum chama toast() nem recarrega: devolvem
// `{ saved, hadFailure }` (ver openTrackedFormDialog) e quem chama decide a mensagem e o que recarregar.

export const NOTE_MAX = 2000;
const MODE_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'grupo', label: 'Em grupo' },
];

export function noteError(value) {
  const text = (value ?? '').trim();
  if (!text) return 'Escreva a nota.';
  if (text.length > NOTE_MAX) return `A nota é longa demais (máximo ${NOTE_MAX.toLocaleString('pt-BR')} caracteres).`;
  return null;
}

function noteBody(note) {
  return html`<div class="field">
    <label class="field-label" for="note-body">Nota</label>
    <div class="field-control"><textarea${attrs({ id: 'note-body', name: 'body', class: 'field-input', rows: 6, maxlength: NOTE_MAX, 'aria-describedby': 'note-body-hint note-body-error' })}>${note?.body ?? ''}</textarea></div>
    <p class="field-hint" id="note-body-hint">Visível só para você. A aluna nunca vê as notas.</p>
    <p class="field-error" id="note-body-error" role="alert"></p>
  </div>`;
}

/** Editar uma nota existente (criar é inline, no cartão). */
export function openNoteDialog({ api, studentId, note }) {
  return openTrackedFormDialog({
    title: 'Editar nota',
    submitLabel: 'Salvar nota',
    body: noteBody(note),
    validators: { body: noteError },
    onSubmit: async (values) => {
      await api.patch(`/api/v1/mentora/students/${encodeURIComponent(studentId)}/notes/${encodeURIComponent(note.id)}`, { body: values.body.trim() });
    },
  });
}

export function confirmDeleteNote() {
  return confirmDialog({
    title: 'Excluir esta nota?',
    message: 'A nota é apagada de vez. Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir nota',
    cancelLabel: 'Voltar',
    tone: 'danger',
  });
}

function sessionBody(session) {
  // Sem sessão: sugere amanhã às 10h (o campo é editável; a validação barra horários passados).
  const suggestion = new Date();
  suggestion.setDate(suggestion.getDate() + 1);
  suggestion.setHours(10, 0, 0, 0);
  return html`<div class="form-grid form-grid-2">
      ${field({ id: 'session-start', label: 'Data e hora', name: 'startsAt', type: 'datetime-local', required: true, value: toLocalInput(session?.startsAt ?? suggestion.toISOString()) })}
      ${field({ id: 'session-duration', label: 'Duração (minutos)', name: 'durationMin', type: 'number', inputmode: 'numeric', required: true, value: String(session?.durationMin ?? 60), hint: 'De 15 a 240 minutos.' })}
    </div>
    ${selectField({ id: 'session-mode', label: 'Formato', name: 'mode', value: session?.mode ?? 'individual', options: MODE_OPTIONS })}
    ${field({ id: 'session-topic', label: 'Assunto (opcional)', name: 'topic', maxlength: 120, value: session?.topic ?? '', hint: 'A aluna vê o assunto no Calendário dela.' })}`;
}

/** Marcar (`session` ausente) ou editar a sessão. A aluna é avisada no sino ao marcar e quando o horário muda. */
export function openSessionDialog({ api, studentId, session = null }) {
  const base = `/api/v1/mentora/students/${encodeURIComponent(studentId)}/sessions`;
  return openTrackedFormDialog({
    title: session ? 'Editar sessão' : 'Marcar sessão',
    submitLabel: session ? 'Salvar sessão' : 'Marcar sessão',
    busyLabel: 'Salvando…',
    body: sessionBody(session),
    validators: {
      startsAt: (value) => {
        // Editar uma sessão que já passou sem mexer no horário é permitido.
        if (session && value === toLocalInput(session.startsAt)) return null;
        return sessionDateError(value) || null;
      },
      durationMin: (value) => durationError(value) || null,
      topic: (value) => (value.trim().length > 120 ? 'O assunto é longo demais (máximo 120).' : null),
    },
    onSubmit: async (values) => {
      const body = {
        startsAt: fromLocalInput(values.startsAt),
        durationMin: Number(values.durationMin),
        mode: values.mode,
        topic: values.topic.trim(),
      };
      if (session) {
        // Só envia o horário se ele mudou (o servidor recusa horário no passado).
        const patch = { ...body, version: session.version };
        if (values.startsAt === toLocalInput(session.startsAt)) delete patch.startsAt;
        await api.patch(`${base}/${encodeURIComponent(session.id)}`, patch);
      } else {
        await api.post(base, body);
      }
    },
  });
}

export function confirmCancelSession(name) {
  return confirmDialog({
    title: 'Cancelar esta sessão?',
    message: `A sessão com ${name} fica como cancelada e some do Calendário dela. Você pode marcar outra quando quiser.`,
    confirmLabel: 'Cancelar sessão',
    cancelLabel: 'Voltar',
    tone: 'danger',
  });
}
