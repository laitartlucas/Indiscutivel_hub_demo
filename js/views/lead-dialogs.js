import { formatWhatsapp, normalizeEmail, normalizeInstagram, normalizeWhatsapp } from '../../shared/contact.js';
import { moneyToInputText, parseMoney } from '../../shared/money.js';
import { attrs, html } from '../lib/html.js';
import { defaultSourceKey, sourceOptions } from '../lib/sources.js';
import { STATUS_FORM_OPTIONS, TEMPERATURE_CHOICES, companyError, jobTitleError, leadNameError, notesError } from '../lib/leads.js';
import { field, selectField } from '../ui/components.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';
import { stageLabel } from '../ui/kanban.js';

// Diálogos de Lead (drawer de Novo/Editar e confirmação de conversão). Nenhum chama toast() nem recarrega:
// devolvem `{ saved, hadFailure }` (ver openTrackedFormDialog) e quem chama decide a mensagem e o que recarregar.

const contactError = (normalize) => (value) => {
  const result = normalize(value);
  return result.ok ? null : result.message;
};

/** Valor estimado: opcional; se preenchido, no formato de dinheiro do sistema. */
function estimatedValueError(value) {
  if (value.trim() === '') return null;
  const result = parseMoney(value);
  return result.ok ? null : result.message;
}

/** Valor da conversão: obrigatório (a Oportunidade precisa de um valor). */
function dealValueError(value) {
  if (value.trim() === '') return 'Informe o valor da oportunidade.';
  const result = parseMoney(value);
  return result.ok ? null : result.message;
}

const moneyPrefix = html`<span class="field-prefix" aria-hidden="true">R$</span>`;

/** Seletor de temperatura do kit (A-NovoLead): três botões `radio` com um campo oculto que leva o valor ao formulário. */
function temperaturePicker(value) {
  return html`<div class="field">
    <span class="field-label" id="lead-temp-label">Temperatura</span>
    <div class="temp-picker" role="radiogroup" aria-labelledby="lead-temp-label">
      ${TEMPERATURE_CHOICES.map(
        (t) => html`<button${attrs({ type: 'button', role: 'radio', class: `temp-option temp-${t.value}`, 'data-temp': t.value, 'aria-checked': String(t.value === value), tabindex: t.value === value ? '0' : '-1' })}><span class="temp-dot" aria-hidden="true"></span>${t.label}</button>`,
      )}
    </div>
    <input type="hidden" name="temperature" value="${value}">
  </div>`;
}

/** Comportamento do seletor: clique e setas (como todo radiogroup), com o foco rodando entre as opções. */
function attachTemperaturePicker(dialog) {
  const group = dialog.querySelector('.temp-picker');
  const hidden = dialog.querySelector('input[name="temperature"]');
  const options = [...group.querySelectorAll('[data-temp]')];
  const select = (option, { focus = false } = {}) => {
    for (const other of options) {
      const on = other === option;
      other.setAttribute('aria-checked', String(on));
      other.tabIndex = on ? 0 : -1;
    }
    hidden.value = option.dataset.temp;
    if (focus) option.focus();
  };
  group.addEventListener('click', (event) => {
    const option = event.target.closest('[data-temp]');
    if (option) select(option);
  });
  group.addEventListener('keydown', (event) => {
    const index = options.indexOf(document.activeElement);
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (index < 0 || !move) return;
    event.preventDefault();
    select(options[(index + move + options.length) % options.length], { focus: true });
  });
}

function leadDialogBody(lead) {
  const converted = lead?.status === 'converted';
  return html`${field({ id: 'lead-name', label: 'Nome', name: 'name', required: true, maxlength: 120, value: lead?.name ?? '' })}
    <div class="form-grid form-grid-2">
      ${field({ id: 'lead-email', label: 'E-mail', name: 'email', type: 'email', value: lead?.email ?? '' })}
      ${field({ id: 'lead-whatsapp', label: 'WhatsApp', name: 'whatsapp', hint: 'Com DDD. Exemplo: (11) 91234-5678', value: lead?.whatsapp ? formatWhatsapp(lead.whatsapp) : '' })}
      ${field({ id: 'lead-instagram', label: 'Instagram', name: 'instagram', hint: '@usuario', value: lead?.instagram ?? '' })}
      ${field({ id: 'lead-company', label: 'Empresa', name: 'company', maxlength: 120, value: lead?.company ?? '' })}
      ${field({ id: 'lead-job', label: 'Cargo', name: 'jobTitle', maxlength: 120, value: lead?.jobTitle ?? '' })}
      ${selectField({ id: 'lead-source', label: 'Origem', name: 'source', value: lead?.source ?? defaultSourceKey(), options: sourceOptions(lead?.source) })}
      ${converted
        ? html`<div class="field"><p class="field-label">Situação</p><p class="field-static">Convertido em oportunidade</p></div>`
        : selectField({ id: 'lead-status', label: 'Situação', name: 'status', value: lead?.status ?? 'new', options: STATUS_FORM_OPTIONS })}
      ${field({ id: 'lead-value', label: 'Valor estimado', name: 'estimatedValue', inputmode: 'decimal', before: moneyPrefix, hint: 'Opcional. Exemplo: 12.000,00', value: lead?.estimatedValue ? moneyToInputText(lead.estimatedValue) : '' })}
    </div>
    ${temperaturePicker(lead?.temperature ?? 'warm')}
    <div class="field">
      <label class="field-label" for="lead-notes">Observações</label>
      <div class="field-control"><textarea id="lead-notes" name="notes" class="field-input" rows="4" maxlength="1000" aria-describedby="lead-notes-error">${lead?.notes ?? ''}</textarea></div>
      <p class="field-error" id="lead-notes-error" role="alert"></p>
    </div>`;
}

const orNull = (value) => (value.trim() === '' ? null : value.trim());

/** Novo lead (`lead` ausente) ou edição, em gaveta lateral (kit A-NovoLead). */
export function openLeadDialog({ api, lead = null }) {
  const isEdit = Boolean(lead);
  return openTrackedFormDialog({
    title: isEdit ? 'Editar lead' : 'Novo lead',
    description: isEdit ? undefined : 'Pessoa que demonstrou interesse e ainda não virou oportunidade.',
    submitLabel: isEdit ? 'Salvar' : 'Salvar lead',
    className: 'dialog-drawer',
    body: leadDialogBody(lead),
    validators: {
      name: leadNameError,
      email: contactError(normalizeEmail),
      whatsapp: contactError(normalizeWhatsapp),
      instagram: contactError(normalizeInstagram),
      company: companyError,
      jobTitle: jobTitleError,
      estimatedValue: estimatedValueError,
      notes: notesError,
    },
    onMount: (dialog) => attachTemperaturePicker(dialog),
    onSubmit: async (values) => {
      const estimate = values.estimatedValue.trim() === '' ? null : parseMoney(values.estimatedValue).value;
      const body = {
        name: values.name.trim(),
        email: orNull(values.email),
        whatsapp: orNull(values.whatsapp),
        instagram: orNull(values.instagram),
        company: orNull(values.company),
        jobTitle: orNull(values.jobTitle),
        source: values.source,
        temperature: values.temperature,
        estimatedValue: estimate,
        notes: orNull(values.notes),
      };
      if (values.status) body.status = values.status; // lead convertido não tem o campo (somente leitura)
      if (isEdit) await api.patch(`/api/v1/leads/${lead.id}`, { ...body, version: lead.version });
      else await api.post('/api/v1/leads', body);
    },
  });
}

// Calculada a cada abertura: o rótulo pode ter sido editado em Configurações.
const convertStageOptions = () => ['arrived', 'talking', 'proposal'].map((value) => ({ value, label: stageLabel(value) }));

/**
 * Confirmação de "Criar oportunidade": etapa inicial e valor (pré-preenchido com o valor estimado do lead).
 * Resolve `{ saved, hadFailure, result }`; `result` é a resposta de POST /leads/:id/convert.
 */
export async function openConvertDialog({ api, lead }) {
  let result = null;
  const outcome = await openTrackedFormDialog({
    title: 'Criar oportunidade',
    description: `${lead.name} vira uma Pessoa e uma Oportunidade no funil. O lead fica guardado como convertido.`,
    submitLabel: 'Criar oportunidade',
    busyLabel: 'Criando…',
    body: html`${selectField({ id: 'convert-stage', label: 'Etapa inicial no funil', name: 'dealStage', value: 'arrived', options: convertStageOptions() })}
      ${field({ id: 'convert-value', label: 'Valor da oportunidade', name: 'value', required: true, inputmode: 'decimal', before: moneyPrefix, hint: 'Exemplo: 4.800,00', value: lead.estimatedValue ? moneyToInputText(lead.estimatedValue) : '' })}`,
    validators: { value: dealValueError },
    onSubmit: async (values) => {
      result = await api.post(`/api/v1/leads/${lead.id}/convert`, { dealStage: values.dealStage, value: parseMoney(values.value).value });
    },
  });
  return { ...outcome, result };
}
