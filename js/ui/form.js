/** Separa erros do servidor entre campos do formulário e "órfãos" (sem campo correspondente). Puro e testável. */
export function splitServerErrors(errors, knownFields) {
  const byField = {};
  const orphan = [];
  for (const error of Array.isArray(errors) ? errors : []) {
    if (knownFields.has(error.field)) {
      if (!(error.field in byField)) byField[error.field] = error.message;
    } else {
      orphan.push(error.message);
    }
  }
  return { byField, orphan };
}

/**
 * Liga um <form> ao padrão do sistema:
 *  - valida ao sair do campo e, depois de "tocado", enquanto a pessoa digita;
 *  - no envio valida tudo, foca o primeiro campo inválido e NUNCA apaga o que foi digitado;
 *  - envio único (guarda `busy`); o botão de envio fica ocupado sem redesenhar o formulário.
 * `validators`: { [name]: (valor, todosOsValores) => mensagem | null }.
 * `summary` (opcional): elemento que recebe o resumo de erros ("Corrija N campos…") com um botão por campo que leva o foco até ele.
 * O foco continua indo ao primeiro campo inválido; o resumo é um apoio visual (os erros de campo já são anunciados).
 *
 * Validação ao sair do campo NÃO roda enquanto um ponteiro está pressionado: o erro novo empurra o que vem abaixo (botão
 * de envio, caixa de aceite) e o clique, que começou no alvo, terminaria fora dele e se perderia. Ela espera o ponteiro ser
 * solto (o clique já foi entregue) e então roda.
 */
export function attachForm(form, { validators = {}, onSubmit, summary = null }) {
  let busy = false;
  let summaryShown = false;
  let summarySignature = '';
  const touched = new Set();
  let pointerDown = false;
  const deferred = new Set();
  // O botão de enviar pode ficar fora do <form> (atributo form="id"), como nos botões do cabeçalho da página.
  const submitButton = () => form.querySelector('[type="submit"]') ?? (form.id ? document.querySelector(`[type="submit"][form="${CSS.escape(form.id)}"]`) : null);

  function values() {
    const out = {};
    for (const element of form.elements) if (element.name) out[element.name] = element.value;
    return out;
  }

  function setError(name, message) {
    const input = form.elements.namedItem(name);
    if (!input || !('closest' in input)) return;
    const wrap = input.closest('.field');
    const errorEl = wrap?.querySelector('.field-error');
    if (errorEl) errorEl.textContent = message ?? '';
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    wrap?.classList.toggle('has-error', Boolean(message));
  }

  function fieldLabel(input) {
    if (input.dataset.summaryLabel) return input.dataset.summaryLabel;
    const label = input.id ? form.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
    return (label?.textContent ?? input.name).trim().replace(/s+/g, ' ');
  }

  function refreshSummary() {
    if (!summary || !summaryShown) return;
    const items = [];
    for (const name of Object.keys(validators)) {
      const input = form.elements.namedItem(name);
      const message = input?.closest?.('.field')?.querySelector('.field-error')?.textContent;
      if (message) items.push({ input, label: fieldLabel(input), message });
    }
    // Só redesenha quando o conteúdo muda: refazer o resumo no meio de um clique (blur do campo) perderia o clique no botão dele.
    const signature = items.map((item) => `${item.label}: ${item.message}`).join('|');
    if (signature === summarySignature) return;
    summarySignature = signature;
    summary.replaceChildren();
    if (!items.length) return;
    const box = document.createElement('div');
    box.className = 'alert alert-danger form-summary';
    const body = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'alert-title';
    title.textContent = items.length === 1 ? 'Corrija 1 campo para continuar' : `Corrija ${items.length} campos para continuar`;
    const list = document.createElement('ul');
    for (const item of items) {
      const li = document.createElement('li');
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'form-summary-link';
      go.textContent = `${item.label}: ${item.message}`;
      go.addEventListener('click', () => item.input.focus());
      li.append(go);
      list.append(li);
    }
    body.append(title, list);
    box.append(body);
    summary.append(box);
  }

  function validateField(name) {
    const validate = validators[name];
    if (!validate) return true;
    const all = values();
    const message = validate(all[name] ?? '', all);
    setError(name, message);
    refreshSummary();
    return !message;
  }

  function setBusy(next) {
    busy = next;
    const button = submitButton();
    if (!button) return;
    button.disabled = next;
    if (next) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
    const spinner = button.querySelector('.spinner');
    if (spinner) spinner.hidden = !next;
    const label = button.querySelector('span:not(.spinner)');
    if (label) {
      if (!label.dataset.idleLabel) label.dataset.idleLabel = label.textContent;
      label.textContent = next ? button.dataset.busyLabel || label.dataset.idleLabel : label.dataset.idleLabel;
    }
  }

  function applyServerErrors(errors) {
    const known = new Set(Object.keys(values()));
    const { byField, orphan } = splitServerErrors(errors, known);
    for (const [name, message] of Object.entries(byField)) setError(name, message);
    const first = Object.keys(byField)[0];
    if (first) {
      summaryShown = true;
      refreshSummary();
      form.elements.namedItem(first)?.focus();
    }
    return orphan;
  }

  function stopWatching() {
    document.removeEventListener('pointerdown', pressed, true);
    for (const type of ['pointerup', 'pointercancel']) document.removeEventListener(type, released, true);
  }
  function pressed() {
    // Sem desmontagem explícita: os ouvintes de documento se removem sozinhos quando o formulário sai da página.
    if (!form.isConnected) return stopWatching();
    pointerDown = true;
  }
  function released() {
    if (!pointerDown) return;
    pointerDown = false;
    // O clique é entregue logo depois do soltar, antes de qualquer temporizador: só então o layout pode mudar.
    setTimeout(() => {
      const names = [...deferred];
      deferred.clear();
      if (!form.isConnected) return;
      for (const name of names) validateField(name);
    }, 0);
  }
  document.addEventListener('pointerdown', pressed, true);
  for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, released, true);

  form.addEventListener('focusout', (event) => {
    const name = event.target?.name;
    if (!name || !validators[name]) return;
    touched.add(name);
    if (pointerDown) {
      deferred.add(name);
      return;
    }
    validateField(name);
  });
  form.addEventListener('input', (event) => {
    const name = event.target?.name;
    if (name && touched.has(name)) validateField(name);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    deferred.clear(); // o envio valida tudo agora
    let firstInvalid = null;
    for (const name of Object.keys(validators)) {
      touched.add(name);
      if (!validateField(name) && !firstInvalid) firstInvalid = name;
    }
    summaryShown = true;
    refreshSummary();
    if (firstInvalid) {
      form.elements.namedItem(firstInvalid)?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(values(), api);
    } finally {
      setBusy(false);
    }
  });

  const api = { values, setError, setBusy, applyServerErrors };
  return api;
}
