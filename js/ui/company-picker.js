import { debounce } from '../lib/debounce.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';

const SUGGESTION_LIMIT = 8;
const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/**
 * Combobox acessível "Empresa" do formulário de Pessoa (opcional). Escolhe uma Empresa já cadastrada ou cria uma
 * nova na hora: a última opção da lista é `Criar empresa “texto”`.
 *
 * Estado do formulário (dois campos ocultos, lidos por attachForm()/values()):
 *  - `companyId`: a Empresa escolhida da lista;
 *  - `companyNew`: o nome de uma Empresa a CRIAR no envio (nada é criado antes de a Pessoa ser salva, então cancelar o
 *    diálogo não deixa empresa sobrando).
 * Digitar de novo depois de escolher invalida os dois (o texto nunca diverge do que será enviado). Texto vazio = sem Empresa.
 */
export function companyPickerField({ inputId = 'person-company-search', value = null, hint = 'Opcional. Digite ao menos 2 letras para buscar ou criar uma empresa.' } = {}) {
  const listboxId = `${inputId}-listbox`;
  const errorId = `${inputId}-error`;
  return html`<div class="field" id="${inputId}-field">
    <label class="field-label" for="${inputId}">Empresa</label>
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
        name: 'companySearch',
        maxlength: '120',
        value: value?.name,
        'aria-describedby': `${inputId}-hint ${errorId}`,
      })}>
      <ul role="listbox" id="${listboxId}" class="combobox-listbox" aria-label="Sugestões de empresas" hidden></ul>
    </div>
    <input type="hidden" name="companyId" value="${value?.id ?? ''}">
    <input type="hidden" name="companyNew" value="">
    <p class="field-hint" id="${inputId}-hint">${hint}</p>
    <p class="field-error" id="${errorId}" role="alert"></p>
  </div>`;
}

/** O texto digitado precisa virar uma escolha (da lista ou "Criar"), senão a Empresa sumiria sem aviso. */
export function companyLinkError(_value, all) {
  const typed = (all.companySearch ?? '').trim();
  if (typed === '') return null;
  return all.companyId || all.companyNew ? null : 'Escolha uma empresa da lista, crie uma nova ou apague o texto.';
}

/** Liga o combobox dentro de um `<dialog>` já montado (chame no `onMount` do openFormDialog). */
export function attachCompanyPicker(dialog, { api, inputId = 'person-company-search' } = {}) {
  const input = dialog.querySelector(`#${inputId}`);
  const listbox = dialog.querySelector(`#${inputId}-listbox`);
  const field = dialog.querySelector(`#${inputId}-field`);
  const hiddenId = field.querySelector('input[name="companyId"]');
  const hiddenNew = field.querySelector('input[name="companyNew"]');
  const hint = field.querySelector('.field-hint');
  const hintText = hint.textContent;
  // Campos ocultos não recebem foco: o foco do erro de envio vai ao combobox de verdade.
  hiddenId.focus = () => input.focus();
  hiddenNew.focus = () => input.focus();
  let options = []; // [{ id?, name, create? }]
  let activeIndex = -1;

  const optionId = (index) => `${inputId}-option-${index}`;

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
          html`<li${attrs({ role: 'option', id: optionId(index), class: `combobox-option${index === activeIndex ? ' is-active' : ''}${option.create ? ' combobox-option-create' : ''}`, 'aria-selected': index === activeIndex ? 'true' : 'false', 'data-index': String(index) })}>${option.create ? `Criar empresa “${option.name}”` : option.name}</li>`,
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
    if (option.create) {
      hiddenId.value = '';
      hiddenNew.value = option.name;
      hint.textContent = `A empresa “${option.name}” será criada ao salvar a pessoa.`;
    } else {
      hiddenId.value = option.id;
      hiddenNew.value = '';
      hint.textContent = hintText;
    }
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
      result = await api.get(`/api/v1/companies?q=${encodeURIComponent(trimmed)}&limit=${SUGGESTION_LIMIT}&sort=name`);
    } catch {
      result = { data: [] };
    }
    // Corrida: só pinta se o texto não mudou desde o pedido.
    if (!dialog.isConnected || input.value.trim() !== trimmed) return;
    options = result.data.map((company) => ({ id: company.id, name: company.name }));
    const exact = options.some((o) => o.name.toLocaleLowerCase('pt-BR') === trimmed.toLocaleLowerCase('pt-BR'));
    if (!exact) options.push({ name: trimmed, create: true });
    activeIndex = -1;
    renderList();
  }, SEARCH_DEBOUNCE_MS);

  input.addEventListener('input', (event) => {
    hiddenId.value = '';
    hiddenNew.value = '';
    hint.textContent = hintText;
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
  listbox.addEventListener('mousedown', (event) => event.preventDefault());
  listbox.addEventListener('click', (event) => {
    const item = event.target.closest('[data-index]');
    if (item) selectOption(Number(item.dataset.index));
  });
  // Esc com a lista aberta fecha só a lista, nunca o diálogo inteiro.
  dialog.addEventListener('cancel', (event) => {
    if (listbox.hidden) return;
    event.preventDefault();
    closeList();
  });
}

/**
 * Devolve o id da Empresa a gravar na Pessoa: a escolhida, a criada agora (reaproveitando a criada numa tentativa
 * anterior que falhou depois) ou null. Se o nome já existir (409), usa a existente de mesmo nome.
 */
export async function resolveCompanyId(api, values, created) {
  if (values.companyId) return values.companyId;
  const name = (values.companyNew ?? '').trim();
  if (!name) return null;
  const key = name.toLocaleLowerCase('pt-BR');
  if (created.has(key)) return created.get(key);
  let id = null;
  try {
    id = (await api.post('/api/v1/companies', { name })).id;
  } catch (error) {
    if (error?.code !== 'duplicate_company_name') throw error;
    const found = await api.get(`/api/v1/companies?q=${encodeURIComponent(name)}&limit=20`);
    id = found.data.find((c) => c.name.toLocaleLowerCase('pt-BR') === key)?.id ?? null;
    if (!id) throw error;
  }
  created.set(key, id);
  return id;
}
