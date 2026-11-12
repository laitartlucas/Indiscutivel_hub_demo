import { formatWhatsapp, normalizeEmail, normalizeInstagram, normalizeWhatsapp } from '../../shared/contact.js';
import { LEAD_STATUS_OPTIONS, TEMPERATURE_CHOICES, contactNameError, contactPayload, notesError, shortTextError, tagsError } from '../lib/commercial.js';
import { html } from '../lib/html.js';
import { defaultSourceKey, sourceOptions } from '../lib/sources.js';
import { field, selectField } from '../ui/components.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';
import { campaignField, loadCampaignChoices } from './marketing-ui.js';

// Campos do cadastro de contato: os mesmos no diálogo "Novo contato" e na aba "Dados" do contato.

const contactError = (normalize) => (value) => {
  if (!String(value ?? '').trim()) return null;
  const result = normalize(value);
  return result.ok ? null : result.message;
};

export const CONTACT_VALIDATORS = {
  name: contactNameError,
  phone: contactError(normalizeWhatsapp),
  whatsapp: contactError(normalizeWhatsapp),
  instagram: contactError(normalizeInstagram),
  email: contactError(normalizeEmail),
  tags: tagsError,
  responsible: shortTextError('Nome do responsável', 80),
  notes: notesError,
};

const funnelChoices = (funnels, currentId) => [
  { value: '', label: 'Nenhum' },
  ...funnels.filter((f) => f.active || f.id === currentId).map((f) => ({ value: f.id, label: f.active ? f.name : `${f.name} (inativo)` })),
];

/**
 * Campos do contato. `prefix` separa os ids (diálogo x aba). `showLeadStatus`: a situação do lead (Novo, Contatado,
 * Qualificado, Descartado) só vale enquanto o contato não tem oportunidades; depois quem manda é o funil.
 */
export function contactFields({ contact = null, funnels = [], campaigns = [], prefix = 'contact', showLeadStatus = true }) {
  const id = (name) => `${prefix}-${name}`;
  return html`${field({ id: id('name'), label: 'Nome', name: 'name', required: true, maxlength: 120, value: contact?.name ?? '' })}
    <div class="form-grid form-grid-2">
      ${field({ id: id('whatsapp'), label: 'WhatsApp', name: 'whatsapp', hint: 'Com DDD. Exemplo: (11) 91234-5678', value: contact?.whatsapp ? formatWhatsapp(contact.whatsapp) : '' })}
      ${field({ id: id('phone'), label: 'Telefone', name: 'phone', inputmode: 'tel', hint: 'Opcional. Outro número, com DDD.', value: contact?.phone ? formatWhatsapp(contact.phone) : '' })}
      ${field({ id: id('email'), label: 'E-mail', name: 'email', type: 'email', value: contact?.email ?? '' })}
      ${field({ id: id('instagram'), label: 'Instagram', name: 'instagram', hint: '@usuario', value: contact?.instagram ?? '' })}
      ${selectField({ id: id('source'), label: 'Origem', name: 'source', value: contact?.source ?? defaultSourceKey(), options: sourceOptions(contact?.source) })}
      ${selectField({ id: id('funnel'), label: 'Funil de entrada', name: 'entryFunnelId', value: contact?.entryFunnelId ?? '', options: funnelChoices(funnels, contact?.entryFunnelId) })}
      ${campaignField({ id: id('campaign'), campaigns, currentId: contact?.campaignId ?? null, currentName: contact?.campaignName ?? null, hint: 'A campanha que trouxe este contato (conta como lead dela).' })}
      ${selectField({ id: id('temperature'), label: 'Temperatura', name: 'temperature', value: contact?.temperature ?? '', options: [{ value: '', label: 'Sem temperatura' }, ...TEMPERATURE_CHOICES] })}
      ${showLeadStatus ? selectField({ id: id('lead-status'), label: 'Situação do lead', name: 'leadStatus', value: contact?.leadStatus ?? 'new', options: LEAD_STATUS_OPTIONS }) : ''}
      ${field({ id: id('responsible'), label: 'Responsável', name: 'responsible', maxlength: 80, hint: 'Quem cuida deste contato.', value: contact?.responsible ?? '' })}
      ${field({ id: id('tags'), label: 'Etiquetas', name: 'tags', hint: 'Separe por vírgula. Exemplo: indicação, vip', value: (contact?.tags ?? []).join(', ') })}
    </div>
    <div class="field">
      <label class="field-label" for="${id('notes')}">Observações</label>
      <div class="field-control"><textarea id="${id('notes')}" name="notes" class="field-input" rows="4" maxlength="2000" aria-describedby="${id('notes')}-error">${contact?.notes ?? ''}</textarea></div>
      <p class="field-error" id="${id('notes')}-error" role="alert"></p>
    </div>`;
}

/** Diálogo "Novo contato" (gaveta lateral). Resolve `{ saved, hadFailure, contact }`. */
export async function openNewContactDialog({ api, funnels = [] }) {
  let contact = null;
  const campaigns = await loadCampaignChoices(api);
  const outcome = await openTrackedFormDialog({
    title: 'Novo contato',
    description: 'Um cadastro só para cada pessoa: ele acompanha o contato de lead a cliente, sem duplicar.',
    submitLabel: 'Salvar contato',
    className: 'dialog-drawer',
    body: contactFields({ funnels, campaigns, prefix: 'new-contact' }),
    validators: CONTACT_VALIDATORS,
    onSubmit: async (values) => {
      contact = await api.post('/api/v1/people', contactPayload(values));
    },
  });
  return { ...outcome, contact };
}
