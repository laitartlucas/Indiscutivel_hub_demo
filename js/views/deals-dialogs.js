import { normalizeWhatsapp } from '../../shared/contact.js';
import { formatMoney, parseMoney } from '../../shared/money.js';
import { lostReasonChoiceError, lostReasonDetailError, lostReasonText } from '../lib/commercial.js';
import { mount } from '../lib/dom.js';
import { funnelById } from '../lib/pipeline-config.js';
import { confirmDialog } from '../ui/dialog.js';
import { openFormDialog, openTrackedFormDialog } from '../ui/form-dialog.js';
import { attachPersonPicker } from '../ui/person-picker.js';
import { loadCampaignChoices } from './marketing-ui.js';
import {
  contactPickError,
  dealDialogBody,
  dealEditDialogBody,
  dealNotesError,
  expectedCloseError,
  lostReasonDialogBody,
  newContactNameError,
  responsibleError,
  stageOptionsHtml,
  valueError,
} from './deals-forms.js';

// Os diálogos de Oportunidade. Nenhum deles chama `toast()` nem recarrega nada: devolvem o desfecho e quem chama
// (o quadro, o detalhe do contato ou o da oportunidade) decide a mensagem e o que recarregar. Os de formulário
// devolvem `{ saved, hadFailure }` (ver openTrackedFormDialog): `hadFailure` diz que um envio foi recusado mesmo
// que o diálogo tenha fechado sem salvar, e quem chama recarrega nesse caso também.

const orNull = (value) => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

/** Valor só vai se preenchido (em branco, a criação copia o preço do produto). */
function withValue(body, values) {
  const trimmed = String(values.value ?? '').trim();
  if (trimmed !== '') body.value = parseMoney(trimmed).value;
  return body;
}

function whatsappError(value, all) {
  if (all.contactMode !== 'new' || !String(value ?? '').trim()) return null;
  const result = normalizeWhatsapp(value);
  return result.ok ? null : result.message;
}

/**
 * Nova oportunidade. `funnels`: os funis (ativos) para escolher; `funnelId`: o funil já escolhido (ex.: o do quadro).
 * `presetPerson` ({ id, name }): o contato já é conhecido. `allowNewContact`: no quadro, permite criar o contato junto
 * (nome + WhatsApp). Resolve `{ saved, hadFailure, deal }`.
 */
export async function openCreateDealDialog({ api, products = [], funnels, funnelId = null, presetPerson = null, allowNewContact = false }) {
  let deal = null;
  let createdPerson = null; // contato criado nesta abertura: um reenvio (ex.: valor recusado) não cria outro
  const campaigns = await loadCampaignChoices(api);
  const outcome = await openTrackedFormDialog({
    title: 'Nova oportunidade',
    description: presetPerson ? `Uma nova negociação com ${presetPerson.name}. O cadastro do contato continua o mesmo.` : 'Escolha o funil e a etapa em que a negociação começa.',
    submitLabel: 'Criar oportunidade',
    busyLabel: 'Criando…',
    className: 'dialog-drawer',
    body: dealDialogBody({ products, funnels, funnelId, presetPerson, allowNewContact, campaigns }),
    validators: {
      ...(presetPerson ? {} : { personId: contactPickError }),
      ...(allowNewContact && !presetPerson ? { name: newContactNameError, whatsapp: whatsappError } : {}),
      value: valueError,
      expectedCloseOn: expectedCloseError,
      responsible: responsibleError,
      notes: dealNotesError,
    },
    onMount: (dialog) => {
      if (!presetPerson) attachPersonPicker(dialog, { api });
      const funnelSelect = dialog.querySelector('#deal-funnel');
      const stageSelect = dialog.querySelector('#deal-stage');
      funnelSelect?.addEventListener('change', () => mount(stageSelect, stageOptionsHtml(funnelById(funnelSelect.value) ?? funnels.find((f) => f.id === funnelSelect.value))));
      const modeSelect = dialog.querySelector('#deal-contact-mode');
      modeSelect?.addEventListener('change', () => {
        for (const block of dialog.querySelectorAll('[data-contact-mode]')) block.hidden = block.dataset.contactMode !== modeSelect.value;
      });
    },
    onSubmit: async (values) => {
      let personId = values.personId;
      if (values.contactMode === 'new') {
        if (!createdPerson) {
          createdPerson = await api.post('/api/v1/people', {
            name: values.name.trim(),
            whatsapp: orNull(values.whatsapp),
            entryFunnelId: values.funnelId || null,
          });
        }
        personId = createdPerson.id;
      }
      const body = {
        personId,
        funnelId: values.funnelId,
        stageId: values.stageId || undefined,
        temperature: values.temperature,
        expectedCloseOn: orNull(values.expectedCloseOn) ?? undefined,
        responsible: orNull(values.responsible) ?? undefined,
        notes: orNull(values.notes) ?? undefined,
      };
      if (values.productId) body.productId = values.productId;
      // Sem campanha escolhida, o servidor usa a do contato.
      if (values.campaignId) body.campaignId = values.campaignId;
      deal = await api.post('/api/v1/deals', withValue(body, values));
    },
  });
  return { ...outcome, deal, createdPerson };
}

/** Editar: se o envio falhar (409 de versão, 404), quem chama recarrega mesmo com o diálogo fechado sem salvar. */
export async function openEditDealDialog({ api, deal, products = [] }) {
  const campaigns = await loadCampaignChoices(api);
  return openTrackedFormDialog({
    title: 'Editar oportunidade',
    className: 'dialog-drawer',
    body: dealEditDialogBody(deal, products, campaigns),
    validators: { value: valueError, expectedCloseOn: expectedCloseError, responsible: responsibleError, notes: dealNotesError },
    onSubmit: async (values) => {
      const body = {
        temperature: values.temperature,
        productId: values.productId || null,
        expectedCloseOn: orNull(values.expectedCloseOn),
        responsible: orNull(values.responsible),
        notes: orNull(values.notes),
        version: deal.version,
      };
      if ('campaignId' in values) body.campaignId = values.campaignId || null;
      await api.patch(`/api/v1/deals/${deal.id}`, withValue(body, values));
    },
  });
}

/**
 * Motivo da perda: só coleta o texto (motivo sugerido + detalhe), nunca chama a API.
 * Devolve o texto ou `null` se a aluna cancelou.
 */
export async function promptLostReason({ name } = {}) {
  let reason = null;
  const saved = await openFormDialog({
    title: 'Por que esta oportunidade foi perdida?',
    description: name ? `Registrar o motivo ajuda a entender o funil. O contato ${name} continua cadastrado.` : 'Registrar o motivo ajuda a entender o funil. O contato continua cadastrado.',
    submitLabel: 'Marcar como perdida',
    body: lostReasonDialogBody(),
    validators: {
      reasonChoice: (value) => lostReasonChoiceError(value),
      reasonDetail: (value, all) => lostReasonDetailError(value, all.reasonChoice),
    },
    onSubmit: async (values) => {
      reason = lostReasonText(values.reasonChoice, values.reasonDetail);
    },
  });
  return saved ? reason : null;
}

/** Excluir: exclusão real da oportunidade e do histórico dela. O contato continua. */
export function confirmDeleteDeal(deal) {
  return confirmDialog({
    title: `Excluir a oportunidade de ${deal.personName}?`,
    message: `Esta oportunidade (${formatMoney(deal.value)}) e o histórico de etapas dela serão excluídos. O contato continua cadastrado. Esta ação não pode ser desfeita.`,
    confirmLabel: 'Excluir',
    tone: 'danger',
  });
}
