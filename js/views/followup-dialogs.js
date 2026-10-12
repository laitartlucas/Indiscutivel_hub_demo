import { attrs, html } from '../lib/html.js';
import { checkinDateError, PLAN_MAX, planError } from '../lib/followup.js';
import { field } from '../ui/components.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';

// Diálogo do Plano de ação (Acompanhamento e Perfil da aluna). Não chama toast() nem recarrega: devolve
// `{ saved, hadFailure }` (ver openTrackedFormDialog) e quem chama decide a mensagem e o que recarregar.

function planBody(plan) {
  return html`<div class="field">
      <label class="field-label" for="plan-text">Plano de ação</label>
      <div class="field-control"><textarea${attrs({ id: 'plan-text', name: 'actionText', class: 'field-input', rows: 5, maxlength: PLAN_MAX, 'aria-describedby': 'plan-text-hint plan-text-error' })}>${plan?.actionText ?? ''}</textarea></div>
      <p class="field-hint" id="plan-text-hint">O que ela vai fazer até o próximo check-in. Visível só para você (até ${PLAN_MAX} caracteres).</p>
      <p class="field-error" id="plan-text-error" role="alert"></p>
    </div>
    ${field({ id: 'plan-next', label: 'Próximo check-in (opcional)', name: 'nextCheckinOn', type: 'date', value: plan?.nextCheckinOn ?? '', hint: 'A data combinada para a próxima conversa.' })}`;
}

/** Definir (`plan` ausente) ou editar o plano de ação de uma aluna. A versão do plano evita sobrescrever uma edição de outra aba. */
export function openPlanDialog({ api, student, plan = null }) {
  return openTrackedFormDialog({
    title: `Plano de ação de ${student.name}`,
    submitLabel: 'Salvar plano',
    busyLabel: 'Salvando…',
    body: planBody(plan),
    validators: {
      actionText: (value) => planError(value),
      nextCheckinOn: (value) => checkinDateError(value),
    },
    onSubmit: async (values) => {
      await api.put(`/api/v1/mentora/students/${encodeURIComponent(student.id)}/followup-plan`, {
        actionText: values.actionText.trim(),
        nextCheckinOn: values.nextCheckinOn ? values.nextCheckinOn : null,
        version: plan ? plan.version : null,
      });
    },
  });
}
