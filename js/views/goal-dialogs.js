import { buildQuery } from '../lib/query.js';
import { attrs, html } from '../lib/html.js';
import { METRIC_OPTIONS, isMoney, metricInfo, monthOptions, monthTitle, parseTarget, targetToInput } from '../lib/goals.js';
import { tzOffsetMinutes } from '../lib/tasks.js';
import { field } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';

// Diálogos de Meta, usados por #/metas. Devolvem `{ saved, hadFailure }` (ver openTrackedFormDialog); quem chama
// recarrega a tela. O realizado nunca é digitado: só o alvo (e, ao criar, a métrica e o mês).

/** <select> com mensagem de erro própria (o selectField comum não tem). */
function selectWithError({ id, label, name = id, value, options, disabled = false }) {
  return html`<div class="field">
    <label class="field-label" for="${id}">${label}</label>
    <div class="field-control">
      <select${attrs({ id, name, class: 'field-input', disabled, 'aria-describedby': `${id}-error` })}>
        ${options.map((o) => html`<option${attrs({ value: o.value, selected: o.value === value })}>${o.label}</option>`)}
      </select>
    </div>
    <p class="field-error" id="${id}-error" role="alert"></p>
  </div>`;
}

function targetField(metric, value) {
  const info = metricInfo(metric);
  return field({
    id: 'goal-target',
    label: 'Alvo da meta',
    name: 'target',
    value,
    required: true,
    inputmode: isMoney(metric) ? 'decimal' : 'numeric',
    hint: info.hint,
    maxlength: 16,
    extra: { autocomplete: 'off' },
  });
}

/**
 * Nova meta (`goal` ausente) ou edição do alvo. `existing` = [{ month, metric }] das metas já carregadas, para avisar
 * de duplicada antes de enviar (o servidor também confere: 409 `duplicate_goal`, na mesma mensagem).
 */
export function openGoalDialog({ api, goal = null, month, existing = [] }) {
  const isEdit = Boolean(goal);
  const startMetric = goal?.metric ?? 'revenue';
  const body = isEdit
    ? html`${targetField(goal.metric, targetToInput(goal.metric, goal.target))}`
    : html`${selectWithError({ id: 'goal-metric', label: 'Métrica', name: 'metric', value: startMetric, options: METRIC_OPTIONS })}
      ${selectWithError({ id: 'goal-month', label: 'Mês', name: 'month', value: month, options: monthOptions(new Date(), month) })}
      ${targetField(startMetric, '')}`;

  const metricOf = (all) => (isEdit ? goal.metric : all.metric || startMetric);
  const duplicateMessage = (metric, monthKey) =>
    existing.some((g) => g.metric === metric && g.month === monthKey)
      ? `Você já tem uma meta de ${metricInfo(metric).label.toLowerCase()} para este mês. Edite a existente.`
      : null;
  return openTrackedFormDialog({
    title: isEdit ? 'Editar meta' : 'Nova meta',
    description: isEdit ? `${goal.label} · ${monthTitle(goal.month)}. O realizado vem dos seus dados e não pode ser alterado.` : 'O progresso é calculado sozinho, com os seus dados reais do mês.',
    submitLabel: isEdit ? 'Salvar meta' : 'Criar meta',
    body,
    validators: {
      ...(isEdit
        ? {}
        : {
            metric: (value, all) => duplicateMessage(value, all.month),
          }),
      target: (value, all) => {
        const r = parseTarget(metricOf(all), value);
        return r.ok ? null : r.message;
      },
    },
    onMount: (dialog, formApi) => {
      if (isEdit) return;
      const metric = dialog.querySelector('#goal-metric');
      const monthSelect = dialog.querySelector('#goal-month');
      const target = dialog.querySelector('#goal-target');
      const hint = dialog.querySelector('#goal-target-hint');
      metric.addEventListener('change', () => {
        const info = metricInfo(metric.value);
        hint.textContent = info.hint;
        target.setAttribute('inputmode', info.money ? 'decimal' : 'numeric');
      });
      // Trocar métrica ou mês refaz a checagem de duplicada na hora.
      const recheck = () => formApi.setError('metric', duplicateMessage(metric.value, monthSelect.value));
      metric.addEventListener('change', recheck);
      monthSelect.addEventListener('change', recheck);
    },
    onSubmit: async (values) => {
      const metric = metricOf(values);
      const parsed = parseTarget(metric, values.target);
      const target = parsed.ok ? parsed.value : values.target;
      if (isEdit) {
        await api.patch(`/api/v1/goals/${goal.id}${buildQuery({ tzOffset: tzOffsetMinutes() })}`, { target, version: goal.version });
        return;
      }
      await api.post(`/api/v1/goals${buildQuery({ tzOffset: tzOffsetMinutes() })}`, { metric, month: values.month, target });
    },
  });
}

export function confirmDeleteGoal(goal) {
  return confirmDialog({
    title: 'Excluir meta?',
    message: `A meta de ${goal.label.toLowerCase()} de ${monthTitle(goal.month)} será excluída. O XP que você já ganhou continua com você.`,
    confirmLabel: 'Excluir',
    tone: 'danger',
  });
}
