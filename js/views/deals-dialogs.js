import { formatMoney, parseMoney } from '../../shared/money.js';
import { confirmDialog } from '../ui/dialog.js';
import { openFormDialog, openTrackedFormDialog } from '../ui/form-dialog.js';
import { attachPersonPicker, personIdError } from '../ui/person-picker.js';
import { dealDialogBody, dealEditDialogBody, dealNotesError, expectedCloseError, lostReasonDialogBody, lostReasonError, valueError } from './deals-forms.js';

// Os diálogos de Oportunidade. Nenhum deles chama `toast()` nem recarrega nada: devolvem o desfecho e
// quem chama (o quadro em deals.js, ou a tela de Clientes) decide a mensagem e o que recarregar.
// Os de formulário devolvem `{ saved, hadFailure }` (ver openTrackedFormDialog): `hadFailure` diz que
// um envio foi recusado (409 de versão, 404…) mesmo que o diálogo tenha fechado sem salvar, e quem
// chama recarrega nesse caso também.

/** Corpo enviado à API para `value`: só vai se preenchido (em branco, a criação copia o preço do produto). */
function withValue(body, values) {
  const trimmedValue = values.value.trim();
  if (trimmedValue !== '') body.value = parseMoney(trimmedValue).value;
  return body;
}

/**
 * Nova oportunidade. A tela de Clientes (views/clients.js) reaproveita exatamente este fluxo para o
 * atalho "Nova oportunidade" (upsell) a partir de um Cliente — mesma validação, mesmo corpo enviado à
 * API — só muda quem chama e se `presetPerson` vem preenchido (ver `dealDialogBody()`).
 */
export function openCreateDealDialog({ api, products, presetPerson } = {}) {
  return openTrackedFormDialog({
    title: 'Nova oportunidade',
    body: dealDialogBody(products, presetPerson),
    validators: { personId: personIdError, value: valueError },
    onMount: presetPerson ? undefined : (dialog) => attachPersonPicker(dialog, { api }),
    onSubmit: async (values) => {
      const body = { personId: values.personId, temperature: values.temperature };
      if (values.productId) body.productId = values.productId;
      await api.post('/api/v1/deals', withValue(body, values));
    },
  });
}

/** Editar: se o envio falhar (409 de versão, 404 porque outra aba já excluiu), quem chama recarrega
 * mesmo com o diálogo fechado sem salvar, para não reusar uma `version` obsoleta numa próxima tentativa. */
export function openEditDealDialog({ api, deal, products }) {
  return openTrackedFormDialog({
    title: 'Editar oportunidade',
    body: dealEditDialogBody(deal, products),
    validators: { value: valueError, expectedCloseOn: expectedCloseError, notes: dealNotesError },
    onSubmit: async (values) => {
      const body = {
        temperature: values.temperature,
        productId: values.productId || null,
        expectedCloseOn: values.expectedCloseOn.trim() || null,
        notes: values.notes.trim() || null,
        version: deal.version,
      };
      await api.patch(`/api/v1/deals/${deal.id}`, withValue(body, values));
    },
  });
}

/** Diálogo dedicado ao motivo da perda: só coleta o texto, nunca chama a API (quem chama a
 * transição é o quadro). Devolve o texto ou `null` se a pessoa cancelou. */
export async function promptLostReason() {
  let reason = null;
  const saved = await openFormDialog({
    title: 'Motivo da perda',
    description: 'Conte rapidamente por que esta oportunidade foi perdida.',
    submitLabel: 'Confirmar',
    body: lostReasonDialogBody(),
    validators: { lostReason: lostReasonError },
    onSubmit: async (values) => {
      reason = values.lostReason.trim();
    },
  });
  return saved ? reason : null;
}

/** Excluir: exclusão real (DELETE /deals/:id não é arquivamento, diferente de Produtos) — a
 * confirmação avisa que não pode ser desfeita, no mesmo estilo destrutivo de Pessoas. */
export function confirmDeleteDeal(deal) {
  return confirmDialog({
    title: `Excluir oportunidade de ${deal.personName}?`,
    message: `Esta oportunidade (${formatMoney(deal.value)}) e todo o seu histórico de estágios serão excluídos definitivamente. Esta ação não pode ser desfeita.`,
    confirmLabel: 'Excluir',
    tone: 'danger',
  });
}
