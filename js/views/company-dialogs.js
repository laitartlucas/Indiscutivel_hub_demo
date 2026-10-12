import { attrs, html } from '../lib/html.js';
import { SEGMENT_FORM_OPTIONS, STATE_OPTIONS, cityError, companyNameError, companyNotesError, websiteError } from '../lib/companies.js';
import { field, selectField } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';

// Diálogos de Empresa (Nova/Editar e confirmação de exclusão). Nenhum chama toast() nem recarrega:
// devolvem `{ saved, hadFailure }` (ver openTrackedFormDialog) e quem chama decide a mensagem e o que recarregar.

const orNull = (value) => (value.trim() === '' ? null : value.trim());

function companyDialogBody(company) {
  return html`${field({ id: 'company-name', label: 'Nome', name: 'name', required: true, maxlength: 120, value: company?.name ?? '' })}
    <div class="form-grid form-grid-2">
      ${selectField({ id: 'company-segment', label: 'Segmento', name: 'segment', value: company?.segment ?? '', options: SEGMENT_FORM_OPTIONS })}
      ${field({ id: 'company-website', label: 'Site', name: 'website', type: 'url', hint: 'Começa com https://', value: company?.website ?? '' })}
    </div>
    <div class="form-grid form-grid-city">
      ${field({ id: 'company-city', label: 'Cidade', name: 'city', maxlength: 80, value: company?.city ?? '' })}
      ${selectField({ id: 'company-state', label: 'UF', name: 'state', value: company?.state ?? '', options: STATE_OPTIONS })}
    </div>
    <div class="field">
      <label class="field-label" for="company-notes">Observações</label>
      <div class="field-control"><textarea${attrs({ id: 'company-notes', name: 'notes', class: 'field-input', rows: '4', maxlength: '1000', 'aria-describedby': 'company-notes-error' })}>${company?.notes ?? ''}</textarea></div>
      <p class="field-error" id="company-notes-error" role="alert"></p>
    </div>`;
}

/** Nova empresa (`company` ausente) ou edição. */
export function openCompanyDialog({ api, company = null }) {
  const isEdit = Boolean(company);
  return openTrackedFormDialog({
    title: isEdit ? 'Editar empresa' : 'Nova empresa',
    description: isEdit ? undefined : 'Uma conta com quem você se relaciona. Depois, vincule as pessoas a ela.',
    submitLabel: isEdit ? 'Salvar' : 'Salvar empresa',
    body: companyDialogBody(company),
    validators: { name: companyNameError, city: cityError, website: websiteError, notes: companyNotesError },
    onSubmit: async (values) => {
      const body = {
        name: values.name.trim(),
        segment: values.segment || null,
        city: orNull(values.city),
        state: values.state || null,
        website: orNull(values.website),
        notes: orNull(values.notes),
      };
      if (isEdit) await api.patch(`/api/v1/companies/${company.id}`, { ...body, version: company.version });
      else await api.post('/api/v1/companies', body);
    },
  });
}

export function confirmDeleteCompany(company) {
  const n = company.contactsCount ?? 0;
  const people =
    n === 0
      ? 'Nenhuma pessoa está vinculada a ela.'
      : `${n === 1 ? 'A pessoa vinculada continua cadastrada' : `As ${n} pessoas vinculadas continuam cadastradas`}, só sem empresa.`;
  return confirmDialog({
    title: `Excluir ${company.name}?`,
    message: `${people} As oportunidades não são apagadas. Esta ação não pode ser desfeita.`,
    confirmLabel: 'Excluir',
    tone: 'danger',
  });
}
