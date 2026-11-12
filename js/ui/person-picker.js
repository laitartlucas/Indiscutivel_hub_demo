import { debounce } from '../lib/debounce.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { listOf } from '../lib/commercial.js';

const SUGGESTION_LIMIT = 8;
const SEARCH_DEBOUNCE_MS = 300;
// Mesmo número citado na dica do campo ("digite ao menos 2 letras..."): produz sugestões mais úteis
// (uma letra sozinha combina com quase todo mundo) e evita um pedido a cada tecla no início da busca.
const MIN_QUERY_LENGTH = 2;

/**
 * Combobox acessível "Pessoa": não existe um
 * componente de combobox pronto no projeto (ver Restrições do plano); em vez de inventar um genérico
 * sem revisão, esta é a peça mais simples que resolve exatamente o caso de uso de Oportunidades —
 * escolher uma Pessoa já cadastrada (nunca criar uma aqui) sem vazar dado de outro dono (a busca usa
 * GET /api/v1/people?q=, já isolado por RLS/repositório, igual a qualquer outra tela).
 *
 * Estado de exibição: o `<input>` de texto mostra o que a pessoa digitou OU o nome escolhido (depois
 * de selecionar uma sugestão); o id vai para um `<input type="hidden" name="personId">` ao lado, lido
 * por attachForm()/values() como qualquer outro campo nomeado do formulário. Digitar de novo depois de
 * escolher invalida a seleção (limpa o hidden) — ver `attachPersonPicker()` abaixo: sem isso, o texto
 * poderia divergir do id enviado e a Oportunidade seria criada para a pessoa errada.
 */
export function personPickerField({ inputId = 'deal-person-search', hint, required = true, label = 'Contato', value = null, searchName } = {}) {
  const listboxId = `${inputId}-listbox`;
  const errorId = `${inputId}-error`;
  return html`<div class="field" id="${inputId}-field">
    <label class="field-label" for="${inputId}">${label}</label>
    <div class="field-control combobox-control">
      <input${attrs({
        id: inputId,
        type: 'text',
        class: 'field-input',
        autocomplete: 'off',
        role: 'combobox',
        'aria-expanded': 'false',
        'aria-controls': listboxId,
        'aria-autocomplete': 'list',
        'aria-required': required ? 'true' : false,
        name: searchName,
        value: value?.name,
        'aria-describedby': [hint ? `${inputId}-hint` : null, errorId].filter(Boolean).join(' '),
      })}>
      <ul role="listbox" id="${listboxId}" class="combobox-listbox" aria-label="Sugestões de contatos" hidden></ul>
    </div>
    <input type="hidden" name="personId" value="${value?.id ?? ''}">
    ${hint ? html`<p class="field-hint" id="${inputId}-hint">${hint}</p>` : ''}
    <p class="field-error" id="${errorId}" role="alert"></p>
  </div>`;
}

/** Validador para o campo oculto `personId` (usado em `validators` do openFormDialog). */
export function personIdError(value) {
  return value ? null : 'Selecione um contato da lista de sugestões.';
}

/**
 * Liga o comportamento do combobox dentro de um `<dialog>` já montado (chamar via `onMount` do
 * openFormDialog — ver comentário em ui/form-dialog.js). `dialog` é o elemento inteiro do diálogo,
 * não só o campo: precisamos dele para o evento nativo `cancel` (ver abaixo).
 */
export function attachPersonPicker(dialog, { api, inputId = 'deal-person-search' } = {}) {
  const input = dialog.querySelector(`#${inputId}`);
  const listbox = dialog.querySelector(`#${inputId}-listbox`);
  const hidden = dialog.querySelector(`#${inputId}-field input[type="hidden"]`);
  // `hidden` é <input type="hidden">, nunca focável: attachForm() chama .focus() nele tanto na
  // validação de envio (personId vazio) quanto num erro devolvido pelo servidor (applyServerErrors) —
  // sem isto o foco simplesmente não vai a lugar nenhum nesses dois casos (a mensagem de erro ainda
  // aparece via role="alert", mas quem usa teclado/leitor de tela não é levado até o campo visível,
  // ao contrário de todo outro campo do formulário). Redireciona para o combobox de verdade.
  hidden.focus = () => input.focus();
  let options = []; // [{ id, name }]
  let activeIndex = -1;

  function optionId(index) {
    return `${inputId}-option-${index}`;
  }

  function closeList() {
    if (options.length === 0 && listbox.hidden) return;
    options = [];
    activeIndex = -1;
    listbox.hidden = true;
    mount(listbox, html``);
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function renderList() {
    mount(
      listbox,
      html`${options.map(
        (option, index) =>
          html`<li${attrs({ role: 'option', id: optionId(index), class: `combobox-option${index === activeIndex ? ' is-active' : ''}`, 'aria-selected': index === activeIndex ? 'true' : 'false', 'data-index': String(index) })}>${option.name}</li>`,
      )}`,
    );
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (activeIndex >= 0) input.setAttribute('aria-activedescendant', optionId(activeIndex));
    else input.removeAttribute('aria-activedescendant');
  }

  function selectOption(index) {
    const option = options[index];
    if (!option) return;
    input.value = option.name;
    hidden.value = option.id;
    closeList();
  }

  const scheduleSearch = debounce(async (term) => {
    if (!dialog.isConnected) return;
    const trimmed = term.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      closeList();
      return;
    }
    let result;
    try {
      result = await api.get(`/api/v1/people?q=${encodeURIComponent(trimmed)}&limit=${SUGGESTION_LIMIT}`);
    } catch {
      if (dialog.isConnected) closeList();
      return;
    }
    // Corrida: só pinta se o texto não mudou desde o pedido (resposta lenta de uma busca já substituída).
    if (!dialog.isConnected || input.value.trim() !== trimmed) return;
    options = listOf(result).map((person) => ({ id: person.id, name: person.name }));
    activeIndex = -1;
    if (options.length === 0) closeList();
    else renderList();
  }, SEARCH_DEBOUNCE_MS);

  input.addEventListener('input', (event) => {
    // Qualquer edição do texto invalida a seleção anterior: sem uma nova escolha na lista, o envio
    // deve falhar por "Selecione uma pessoa" (personIdError), nunca reenviar um id que não bate mais
    // com o texto mostrado.
    hidden.value = '';
    scheduleSearch(event.target.value);
  });

  input.addEventListener('keydown', (event) => {
    if (options.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % options.length;
      renderList();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + options.length) % options.length;
      renderList();
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectOption(activeIndex);
    }
  });

  input.addEventListener('blur', () => closeList());

  // Evita perder o foco do input ao clicar numa sugestão: sem isso, o `blur` acima fecharia a lista
  // antes do `click` chegar a disparar em cima do <li> (mousedown vem antes de blur/click).
  listbox.addEventListener('mousedown', (event) => event.preventDefault());
  listbox.addEventListener('click', (event) => {
    const item = event.target.closest('[data-index]');
    if (!item) return;
    selectOption(Number(item.dataset.index));
  });

  // Esc, com a lista de sugestões aberta, fecha só a lista — nunca o diálogo inteiro (o <dialog>
  // nativo fecharia com "cancel" no Esc por padrão; interceptamos aqui, e um segundo Esc, já com a
  // lista fechada, cai no comportamento padrão e cancela o formulário normalmente).
  dialog.addEventListener('cancel', (event) => {
    if (listbox.hidden) return;
    event.preventDefault();
    closeList();
  });
}
