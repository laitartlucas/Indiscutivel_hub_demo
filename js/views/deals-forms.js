import { formatMoney, moneyToInputText, parseMoney } from '../../shared/money.js';
import { formatWhatsapp } from '../../shared/contact.js';
import { LOST_REASONS, TEMPERATURE_CHOICES, TEMPERATURE_FILTER_OPTIONS } from '../lib/commercial.js';
import { dealNotesError, expectedCloseError } from '../lib/deal-detail.js';
import { attrs, html } from '../lib/html.js';
import { openStages } from '../lib/pipeline-config.js';
import { field, selectField } from '../ui/components.js';
import { personPickerField } from '../ui/person-picker.js';
import { campaignField } from './marketing-ui.js';

// Corpos e validadores dos diálogos de Oportunidade (deals-dialogs.js) e opções dos <select> das telas.
// Só montam HTML e validam texto — nenhum acesso à API aqui.

export { TEMPERATURE_FILTER_OPTIONS, dealNotesError, expectedCloseError };
const TEMPERATURE_FORM_OPTIONS = TEMPERATURE_CHOICES;

export function productFilterOptions(products) {
  return [{ value: '', label: 'Todos' }, ...products.map((p) => ({ value: p.id, label: p.name }))];
}

function productFormOptions(products) {
  return [{ value: '', label: 'Nenhum (valor manual)' }, ...products.map((p) => ({ value: p.id, label: `${p.name} — ${formatMoney(p.price)}` }))];
}

/** Opções de funil: só os ativos (e o atual, se estiver inativo). */
export function funnelOptions(funnels, currentId = null) {
  return funnels.filter((f) => f.active || f.id === currentId).map((f) => ({ value: f.id, label: f.active ? f.name : `${f.name} (inativo)` }));
}

/** Etapas em que uma oportunidade pode NASCER: só as em andamento do funil. */
export function stageOptions(funnel) {
  return openStages(funnel).map((s) => ({ value: s.id, label: `${s.name} · ${s.probability}%` }));
}

/** Valor: obrigatório a menos que um produto tenha sido escolhido (o preço é copiado dele). */
export function valueError(value, all) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return all.productId ? null : 'Informe o valor da oportunidade ou um produto para copiar o preço.';
  }
  const result = parseMoney(trimmed);
  return result.ok ? null : result.message;
}

/** Valor na edição: em branco é aceito só se houver produto (o servidor não recalcula ao trocar de produto). */
export const editValueError = valueError;

/** Mesmo limite do servidor para o motivo (1 a 500). */
export function lostReasonError(value) {
  const trimmed = value.trim();
  if (!trimmed) return 'Informe o motivo da perda.';
  if (trimmed.length > 500) return 'Motivo muito longo (máximo 500).';
  return null;
}

export const responsibleError = (value) => ([...String(value ?? '').trim()].length > 80 ? 'Nome muito longo (máximo 80).' : null);

const moneyPrefix = html`<span class="field-prefix" aria-hidden="true">R$</span>`;

function notesField(id, value = '') {
  return html`<div class="field">
    <label class="field-label" for="${id}">Observações</label>
    <div class="field-control"><textarea id="${id}" name="notes" class="field-input" rows="3" maxlength="1000" aria-describedby="${id}-error">${value}</textarea></div>
    <p class="field-error" id="${id}-error" role="alert"></p>
  </div>`;
}

/**
 * Bloco "Contato" do diálogo de criação.
 * - `presetPerson`: o contato já é conhecido (aberto da página dele): só o nome, fixo.
 * - `allowNewContact`: no quadro, escolhe entre um contato já cadastrado e um novo (nome + WhatsApp), criado junto.
 */
function contactBlock(presetPerson, allowNewContact) {
  if (presetPerson) {
    return html`<div class="field">
      <p class="field-label">Contato</p>
      <p class="field-static">${presetPerson.name}</p>
      <input type="hidden" name="personId" value="${presetPerson.id}">
    </div>`;
  }
  const picker = personPickerField({ inputId: 'deal-person-search', searchName: 'personSearch', hint: 'Digite ao menos 2 letras do nome e escolha o contato na lista.' });
  if (!allowNewContact) return picker;
  return html`${selectField({
      id: 'deal-contact-mode',
      label: 'Para quem é a oportunidade?',
      name: 'contactMode',
      value: 'existing',
      options: [
        { value: 'existing', label: 'Um contato já cadastrado' },
        { value: 'new', label: 'Um contato novo' },
      ],
    })}
    <div data-contact-mode="existing">${picker}</div>
    <div class="form-grid form-grid-2" data-contact-mode="new" hidden>
      ${field({ id: 'deal-new-name', label: 'Nome do contato', name: 'name', maxlength: 120, required: true })}
      ${field({ id: 'deal-new-whatsapp', label: 'WhatsApp (opcional)', name: 'whatsapp', hint: 'Com DDD. Exemplo: (11) 91234-5678' })}
    </div>`;
}

/** Validadores do bloco de contato, conforme o modo escolhido. */
export function contactPickError(value, all) {
  if (all.contactMode === 'new') return null;
  return value ? null : 'Selecione um contato da lista de sugestões.';
}

export function newContactNameError(value, all) {
  if (all.contactMode !== 'new') return null;
  const text = String(value ?? '').trim();
  if (!text) return 'Informe o nome do novo contato.';
  return [...text].length > 120 ? 'Nome muito longo (máximo 120).' : null;
}

/** Corpo do diálogo "Nova oportunidade". */
export function dealDialogBody({ products, funnels, funnelId, presetPerson = null, allowNewContact = false, campaigns = [] }) {
  const funnel = funnels.find((f) => f.id === funnelId) ?? funnels[0] ?? null;
  return html`${contactBlock(presetPerson, allowNewContact)}
    <div class="form-grid form-grid-2">
      ${selectField({ id: 'deal-funnel', label: 'Funil', name: 'funnelId', value: funnel?.id ?? '', options: funnelOptions(funnels) })}
      ${selectField({ id: 'deal-stage', label: 'Etapa inicial', name: 'stageId', value: stageOptions(funnel)[0]?.value ?? '', options: stageOptions(funnel) })}
      ${selectField({ id: 'deal-product', label: 'Produto (opcional)', name: 'productId', value: '', options: productFormOptions(products) })}
      ${field({ id: 'deal-value', label: 'Valor', name: 'value', inputmode: 'decimal', before: moneyPrefix, hint: 'Em branco, copia o preço do produto. Exemplo: 4.800,00', value: '' })}
      ${field({ id: 'deal-expected', label: 'Previsão de fechamento (opcional)', name: 'expectedCloseOn', type: 'date', value: '' })}
      ${field({ id: 'deal-responsible', label: 'Responsável (opcional)', name: 'responsible', maxlength: 80, hint: 'Quem cuida desta negociação.', value: '' })}
      ${selectField({ id: 'deal-temperature', label: 'Temperatura', name: 'temperature', value: 'warm', options: TEMPERATURE_FORM_OPTIONS })}
      ${campaignField({ id: 'deal-campaign', campaigns, emptyLabel: 'A mesma do contato', hint: 'Em branco, usa a campanha do contato. A venda desta oportunidade conta para a campanha escolhida.' })}
    </div>
    ${notesField('deal-notes')}`;
}

/** Troca as opções de etapa quando o funil muda (chamado no onMount do diálogo). */
export function stageOptionsHtml(funnel) {
  return html`${stageOptions(funnel).map((o, i) => html`<option${attrs({ value: o.value, selected: i === 0 })}>${o.label}</option>`)}`;
}

/** Corpo do diálogo de edição: o contato e o funil são só contexto (mudar de etapa é pelo quadro ou pelo detalhe). */
export function dealEditDialogBody(deal, products, campaigns = []) {
  return html`<div class="field">
      <p class="field-label">Contato</p>
      <p class="field-static">${deal.personName}${deal.funnelName ? html` · <span class="muted">${deal.funnelName}</span>` : ''}</p>
    </div>
    <div class="form-grid form-grid-2">
      ${selectField({ id: 'deal-product', label: 'Produto (opcional)', name: 'productId', value: deal.productId ?? '', options: productFormOptions(products) })}
      ${field({
        id: 'deal-value',
        label: 'Valor',
        name: 'value',
        inputmode: 'decimal',
        before: moneyPrefix,
        hint: 'O valor não muda sozinho ao trocar de produto. Exemplo: 4.800,00',
        value: moneyToInputText(deal.value),
      })}
      ${field({ id: 'deal-expected', label: 'Previsão de fechamento', name: 'expectedCloseOn', type: 'date', hint: 'Opcional. Só informa; não muda a etapa.', value: deal.expectedCloseOn ?? '' })}
      ${field({ id: 'deal-responsible', label: 'Responsável', name: 'responsible', maxlength: 80, value: deal.responsible ?? '' })}
      ${selectField({ id: 'deal-temperature', label: 'Temperatura', name: 'temperature', value: deal.temperature ?? 'warm', options: TEMPERATURE_FORM_OPTIONS })}
      ${campaignField({ id: 'deal-campaign', campaigns, currentId: deal.campaignId ?? null, currentName: deal.campaignName ?? null, hint: 'A venda desta oportunidade conta para a campanha escolhida.' })}
    </div>
    ${notesField('deal-notes', deal.notes ?? '')}`;
}

/** Motivo da perda: um motivo sugerido (obrigatório) e um detalhe (obrigatório só em "Outro"). */
export function lostReasonDialogBody() {
  const options = [{ value: '', label: 'Escolha um motivo' }, ...LOST_REASONS.map((r) => ({ value: r, label: r }))];
  return html`<div class="field">
      <label class="field-label" for="deal-lost-choice">Motivo</label>
      <div class="field-control">
        <select id="deal-lost-choice" name="reasonChoice" class="field-input" aria-required="true" aria-describedby="deal-lost-choice-error">
          ${options.map((o) => html`<option${attrs({ value: o.value })}>${o.label}</option>`)}
        </select>
      </div>
      <p class="field-error" id="deal-lost-choice-error" role="alert"></p>
    </div>
    <div class="field">
      <label class="field-label" for="deal-lost-detail">Detalhe</label>
      <div class="field-control">
        <textarea id="deal-lost-detail" name="reasonDetail" class="field-input" rows="3" maxlength="480" aria-describedby="deal-lost-detail-hint deal-lost-detail-error"></textarea>
      </div>
      <p class="field-hint" id="deal-lost-detail-hint">Opcional, mas ajuda a entender o que aconteceu. Em "Outro", conte o motivo aqui.</p>
      <p class="field-error" id="deal-lost-detail-error" role="alert"></p>
    </div>`;
}

/** Texto do WhatsApp no formulário (com máscara), para reaproveitar. */
export const whatsappInput = (value) => (value ? formatWhatsapp(value) : '');
