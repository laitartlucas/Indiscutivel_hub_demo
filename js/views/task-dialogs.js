import { html } from '../lib/html.js';
import { KIND_OPTIONS, PRIORITY_OPTIONS, buildDue, dueDateError, dueTimeError, notesError, splitDue, titleError } from '../lib/tasks.js';
import { field, selectField } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';
import { attachPersonPicker, personPickerField } from '../ui/person-picker.js';

// Diálogos de Tarefa, usados pela lista (#/tarefas), pelo calendário (#/calendario) e pelo Painel.
// Nenhum chama toast() nem recarrega: devolvem `{ saved, hadFailure }` (ver openTrackedFormDialog) e
// quem chama decide a mensagem e o que recarregar.

const PICKER_ID = 'task-person-search';

/** Vínculo com Pessoa: o texto digitado precisa virar uma escolha da lista (senão o vínculo sumiria sem aviso). */
function personLinkError(value, all) {
  return !value && (all.personSearch ?? '').trim() !== '' ? 'Escolha uma pessoa da lista de sugestões ou apague o texto.' : null;
}

function taskDialogBody(existing, preset) {
  const due = existing ? splitDue(existing) : { date: preset?.date ?? '', time: '' };
  const person = existing?.personId ? { id: existing.personId, name: existing.personName ?? existing.dealPersonName ?? '' } : (!existing && preset?.person) || null;
  return html`${field({ id: 'task-title', label: 'Título', name: 'title', required: true, maxlength: 120, value: existing?.title ?? preset?.title ?? '' })}
    <div class="form-grid form-grid-2">
      ${selectField({ id: 'task-kind', label: 'Tipo', name: 'kind', value: existing?.kind ?? 'task', options: KIND_OPTIONS })}
      ${selectField({ id: 'task-priority', label: 'Prioridade', name: 'priority', value: existing?.priority ?? 'medium', options: PRIORITY_OPTIONS })}
    </div>
    <div class="form-grid form-grid-2">
      ${field({ id: 'task-due-date', label: 'Data', name: 'dueDate', type: 'date', value: due.date })}
      ${field({ id: 'task-due-time', label: 'Hora', name: 'dueTime', type: 'time', value: due.time, hint: 'Sem hora, vale o dia inteiro.' })}
    </div>
    ${personPickerField({ inputId: PICKER_ID, label: 'Pessoa (opcional)', required: false, value: person, searchName: 'personSearch', hint: 'Digite ao menos 2 letras para buscar.' })}
    <div class="field">
      <label class="field-label" for="task-notes">Anotações (opcional)</label>
      <div class="field-control"><textarea id="task-notes" name="notes" class="field-input" rows="3" maxlength="1000" aria-describedby="task-notes-error">${existing?.notes ?? ''}</textarea></div>
      <p class="field-error" id="task-notes-error" role="alert"></p>
    </div>`;
}

/**
 * Nova tarefa (`task` ausente) ou edição. `preset.date` ('AAAA-MM-DD') pré-preenche a data (clique num dia do calendário).
 * `preset.title`, `preset.person` ({ id, name }), `preset.dealId` e `preset.description` (frase sob o título do diálogo) servem à criação a partir de
 * um Lead: com Pessoa, a tarefa já nasce vinculada; sem ela (lead ainda não convertido), nasce sem vínculo.
 * Trocar a Pessoa solta a Oportunidade antiga (o vínculo com a Oportunidade só vale junto da Pessoa dela).
 */
export function openTaskDialog({ api, task = null, preset = null }) {
  const isEdit = Boolean(task);
  return openTrackedFormDialog({
    title: isEdit ? 'Editar tarefa' : 'Nova tarefa',
    description: !isEdit ? preset?.description : undefined,
    body: taskDialogBody(task, preset),
    validators: { title: titleError, dueDate: dueDateError, dueTime: dueTimeError, personId: personLinkError, notes: notesError },
    onMount: (dialog) => attachPersonPicker(dialog, { api, inputId: PICKER_ID }),
    onSubmit: async (values) => {
      const due = buildDue(values.dueDate, values.dueTime);
      const body = {
        title: values.title.trim(),
        kind: values.kind,
        priority: values.priority,
        dueAt: due.dueAt,
        dueAllDay: due.dueAllDay,
        personId: values.personId || null,
        notes: values.notes.trim() === '' ? null : values.notes,
      };
      if (!isEdit) {
        // A Oportunidade do preset só vale junto da Pessoa do preset (se a aluna trocou a Pessoa, o vínculo cai).
        if (preset?.dealId && body.personId && body.personId === preset.person?.id) body.dealId = preset.dealId;
        await api.post('/api/v1/tasks', body);
        return;
      }
      if ((task.personId ?? null) !== body.personId) body.dealId = null;
      await api.patch(`/api/v1/tasks/${task.id}`, { ...body, version: task.version });
    },
  });
}

export function confirmDeleteTask(task) {
  return confirmDialog({
    title: 'Excluir tarefa?',
    message: `“${task.title}” será excluída definitivamente. Esta ação não pode ser desfeita.`,
    confirmLabel: 'Excluir',
    tone: 'danger',
  });
}
