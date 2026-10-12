import { formatMoney, moneyToInputText, parseMoney } from '../../shared/money.js';
import { dealNotesError, expectedCloseError } from '../lib/deal-detail.js';
import { html } from '../lib/html.js';
import { field, selectField } from '../ui/components.js';
import { temperatureLabel } from '../ui/kanban.js';
import { personPickerField } from '../ui/person-picker.js';

// Corpos e validadores dos diálogos de Oportunidade (deals-dialogs.js) e opções dos <select> da tela
// (deals.js). Só montam HTML e validam texto — nenhum acesso à API aqui.

// Os rótulos vêm de kanban.js (única fonte); aqui só muda a ordem de cada lista.
const temperatureOptions = (values) => values.map((value) => ({ value, label: temperatureLabel(value) }));
export const TEMPERATURE_FILTER_OPTIONS = [{ value: '', label: 'Todas' }, ...temperatureOptions(['hot', 'warm', 'cold'])];
const TEMPERATURE_FORM_OPTIONS = temperatureOptions(['cold', 'warm', 'hot']);

export function productFilterOptions(products) {
  return [{ value: '', label: 'Todos' }, ...products.map((p) => ({ value: p.id, label: p.name }))];
}

function productFormOptions(products) {
  return [{ value: '', label: 'Nenhum (valor manual)' }, ...products.map((p) => ({ value: p.id, label: `${p.name} — ${formatMoney(p.price)}` }))];
}

/**
 * Igual à regra do servidor (`createBody.refine` em server/src/routes/deals.ts): valor obrigatório a
 * menos que um produto tenha sido escolhido (o preço é copiado dele). `all.productId` vem do 2º
 * argumento que attachForm() passa a cada validador — o valor atual de TODOS os campos do formulário.
 */
export function valueError(value, all) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return all.productId ? null : 'Informe o valor da oportunidade ou um produto para copiar o preço.';
  }
  const result = parseMoney(trimmed);
  return result.ok ? null : result.message;
}

/** Mesmo formato do lostReasonSchema do servidor (trim, 1–500). O caractere de controle é raro
 * demais para valer a complexidade de checar aqui também — se passar, o servidor recusa e o erro
 * genérico (toast + recarga) cobre o caso, como em qualquer outra mutação desta tela. */
export function lostReasonError(value) {
  const trimmed = value.trim();
  if (!trimmed) return 'Informe o motivo da perda.';
  if (trimmed.length > 500) return 'Motivo muito longo (máximo 500).';
  return null;
}

/**
 * Corpo do diálogo de criação. `presetPerson` ({ id, name }, opcional): usado pelo atalho "Nova
 * oportunidade" da tela de Clientes (views/clients.js) — a Pessoa já é conhecida (a própria linha do
 * Cliente), então o combobox de busca dá lugar a um texto fixo com o nome, e o `personId` vai direto
 * no campo oculto (sem precisar de `attachPersonPicker()`, que exige o combobox no DOM). Sem
 * `presetPerson`, o combobox de busca por nome.
 */
export function dealDialogBody(products, presetPerson) {
  return html`${presetPerson
      ? html`<div class="field">
          <p class="field-label">Pessoa</p>
          <p class="field-static">${presetPerson.name}</p>
          <input type="hidden" name="personId" value="${presetPerson.id}">
        </div>`
      : personPickerField({
          inputId: 'deal-person-search',
          hint: 'Digite ao menos 2 letras do nome e escolha uma pessoa da lista de sugestões.',
        })}
    ${selectField({ id: 'deal-product', label: 'Produto (opcional)', name: 'productId', value: '', options: productFormOptions(products) })}
    ${field({
      id: 'deal-value',
      label: 'Valor (R$)',
      name: 'value',
      inputmode: 'decimal',
      hint: 'Deixe em branco para copiar o valor do produto escolhido acima. Exemplo: 4.800,00',
      value: '',
    })}
    ${selectField({ id: 'deal-temperature', label: 'Temperatura', name: 'temperature', value: 'warm', options: TEMPERATURE_FORM_OPTIONS })}`;
}

/**
 * Corpo do diálogo de edição: mesmos campos de valor/produto/temperatura de `dealDialogBody()`, mas a
 * Pessoa é só contexto de leitura (texto fixo, sem campo — o PATCH do servidor não aceita `personId`,
 * ver patchBody em server/src/routes/deals.ts) e os três campos vêm preenchidos com o estado atual da
 * Oportunidade. Ao contrário da criação, o PATCH NÃO recopia o preço do produto se o valor ficar em
 * branco (repo.update: "só valida; não recopia o valor") — por isso o aviso do campo é outro (a mesma
 * dica da criação enganaria: sugeriria uma cópia que não acontece).
 */
export { dealNotesError, expectedCloseError };

export function dealEditDialogBody(deal, products) {
  return html`<div class="field">
      <p class="field-label">Pessoa</p>
      <p class="field-static">${deal.personName}</p>
    </div>
    ${selectField({ id: 'deal-product', label: 'Produto (opcional)', name: 'productId', value: deal.productId ?? '', options: productFormOptions(products) })}
    ${field({
      id: 'deal-value',
      label: 'Valor (R$)',
      name: 'value',
      inputmode: 'decimal',
      hint: 'Deixe em branco só se escolher um produto acima — o valor não é recalculado sozinho ao trocar de produto. Exemplo: 4.800,00',
      value: moneyToInputText(deal.value),
    })}
    ${selectField({ id: 'deal-temperature', label: 'Temperatura', name: 'temperature', value: deal.temperature, options: TEMPERATURE_FORM_OPTIONS })}
    ${field({ id: 'deal-expected', label: 'Previsão de fechamento', name: 'expectedCloseOn', type: 'date', hint: 'Opcional. Só informa; não muda o funil nem o Painel.', value: deal.expectedCloseOn ?? '' })}
    <div class="field">
      <label class="field-label" for="deal-notes">Notas</label>
      <div class="field-control"><textarea id="deal-notes" name="notes" class="field-input" rows="3" maxlength="1000" aria-describedby="deal-notes-error">${deal.notes ?? ''}</textarea></div>
      <p class="field-error" id="deal-notes-error" role="alert"></p>
    </div>`;
}

export function lostReasonDialogBody() {
  return html`<div class="field">
    <label class="field-label" for="deal-lost-reason">Motivo</label>
    <div class="field-control">
      <textarea id="deal-lost-reason" name="lostReason" class="field-input" rows="3" maxlength="500" required aria-required="true" aria-describedby="deal-lost-reason-error"></textarea>
    </div>
    <p class="field-error" id="deal-lost-reason-error" role="alert"></p>
  </div>`;
}
