import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { alert } from './components.js';
import { attachForm } from './form.js';
import { lockScroll, unlockScroll } from './scroll-lock.js';

let counter = 0;

/**
 * Formulário em diálogo modal nativo. Resolve true ao concluir (onSubmit sem lançar) e false ao cancelar.
 * Erros de servidor ficam nos campos/banner e o diálogo permanece aberto e preenchido.
 *
 * `onMount(dialog, formApi)` (opcional): chamado uma vez, logo depois de montar o corpo e ligar o
 * formulário (attachForm), antes do diálogo abrir. Existe só para telas com um pedaço de comportamento
 * próprio dentro do corpo (ex.: o combobox de Pessoa em views/deals-dialogs.js, ver ui/person-picker.js) que
 * precisa de um `addEventListener` no DOM recém-montado — sem isso, quem chama openFormDialog() não
 * tem como alcançar os elementos do `body` (a função só devolve uma Promise<boolean>). Não reimplementa
 * nada do fluxo existente: produtos/pessoas não passam esse parâmetro e continuam exatamente iguais.
 */
export function openFormDialog({ title, description, submitLabel = 'Salvar', busyLabel = 'Salvando…', body, validators = {}, onSubmit, onMount, className = '' }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const uid = `form-dialog-${++counter}`;
    const dialog = document.createElement('dialog');
    dialog.className = `dialog dialog-form${className ? ` ${className}` : ''}`;
    dialog.setAttribute('aria-labelledby', `${uid}-title`);
    if (description) dialog.setAttribute('aria-describedby', `${uid}-desc`);
    mount(dialog, html`<div class="dialog-body">
      <h2 id="${uid}-title">${title}</h2>
      ${description ? html`<p id="${uid}-desc" class="muted">${description}</p>` : ''}
      <form novalidate>
        <div class="form-banner" id="${uid}-banner"></div>
        ${body}
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="submit" class="btn btn-primary" data-busy-label="${busyLabel}"><span class="spinner" aria-hidden="true" hidden></span><span>${submitLabel}</span></button>
        </div>
      </form>
    </div>`);

    const form = dialog.querySelector('form');
    const banner = dialog.querySelector(`#${uid}-banner`);
    let saved = false;

    const formApi = attachForm(form, {
      validators,
      async onSubmit(values, api) {
        mount(banner, html``);
        try {
          await onSubmit(values, api);
          saved = true;
          dialog.close();
        } catch (error) {
          const orphan = api.applyServerErrors(error?.errors);
          // Erro já mapeado para um campo não repete no banner; sem campo conhecido, mostra a mensagem amigável (describeError).
          const message = orphan[0] ?? (error?.errors?.length ? null : describeError(error));
          if (message) mount(banner, alert({ tone: 'danger', message }));
        }
      },
    });
    onMount?.(dialog, formApi);

    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    // Clique no fundo NÃO fecha (o <dialog> nativo não fecha sozinho): a pessoa pode perder o que digitou.
    dialog.addEventListener('close', () => {
      unlockScroll();
      dialog.remove();
      if (opener instanceof HTMLElement) opener.focus();
      resolve(saved);
    });

    document.body.append(dialog);
    lockScroll();
    dialog.showModal();
    // Esc fecha pelo comportamento nativo do <dialog> (evento "cancel"), devolvendo false.
    form.querySelector('input, select, textarea')?.focus();
  });
}

/**
 * Como openFormDialog(), mas resolve `{ saved, hadFailure }`: `hadFailure` diz se algum envio desta
 * sessão do diálogo foi recusado (409 version_conflict, 404 porque outra aba excluiu, etc.), mesmo
 * que a pessoa depois feche sem salvar. Quem chama usa isso para recarregar a lista: sem recarregar,
 * reabrir "Editar" no mesmo item reusaria a MESMA version antiga (ou a linha fantasma) e reproduziria
 * o mesmo erro num laço sem saída.
 */
export async function openTrackedFormDialog({ onSubmit, ...options }) {
  let hadFailure = false;
  const saved = await openFormDialog({
    ...options,
    onSubmit: async (values, formApi) => {
      try {
        await onSubmit(values, formApi);
      } catch (error) {
        hadFailure = true;
        throw error;
      }
    },
  });
  return { saved, hadFailure };
}
