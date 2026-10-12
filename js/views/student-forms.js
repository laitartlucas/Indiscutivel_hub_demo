import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { nameError } from '../lib/validators.js';
import { field } from '../ui/components.js';
import { lockScroll, unlockScroll } from '../ui/scroll-lock.js';
import { toast } from '../ui/toast.js';

// Os limites e as mensagens espelham server/src/routes/students.ts: o servidor continua sendo a
// autoridade; aqui só se avisa cedo, no campo, sem perder o que foi digitado.

export { nameError };

export const DATES_ORDER_MESSAGE = 'A data de término não pode ser anterior à de entrada.';

export function emailError(value) {
  const text = value.trim();
  if (!text) return 'Informe o e-mail.';
  if (text.length > 254) return 'E-mail muito longo.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) return 'Informe um e-mail válido.';
  return null;
}

/** Telefone é opcional; com valor, só dígitos, +, parênteses, hífen e espaço (8 a 20 caracteres). */
export function phoneError(value) {
  const text = value.trim();
  if (!text) return null;
  if (text.length > 20) return 'Telefone muito longo.';
  return /^[0-9+()\-\s]{8,20}$/.test(text) ? null : 'Informe um telefone válido.';
}

/** Validador de data de término: `all` são os valores do formulário (precisa de `joinedOn`). Datas AAAA-MM-DD comparam como texto. */
export function datesError(endsOn, all = {}) {
  const joinedOn = all.joinedOn ?? '';
  return joinedOn && endsOn && endsOn < joinedOn ? DATES_ORDER_MESSAGE : null;
}

function maxLengthError(max, message) {
  return (value) => (value.trim().length > max ? message : null);
}

/**
 * Validadores do formulário da aluna. Na edição o e-mail é só leitura (não existe campo `email`), então
 * não entra: um validador sem campo bloquearia o envio para sempre.
 */
export function studentValidators(existing) {
  return {
    name: nameError,
    ...(existing ? {} : { email: emailError }),
    phone: phoneError,
    className: maxLengthError(80, 'Turma muito longa (máximo 80).'),
    program: maxLengthError(120, 'Programa muito longo (máximo 120).'),
    plan: maxLengthError(80, 'Plano muito longo (máximo 80).'),
    endsOn: datesError,
  };
}

/** Campo opcional em branco (após aparar) vira `null`: o servidor limpa/ignora; texto digitado segue como veio. */
const textOrNull = (value) => {
  const text = (value ?? '').trim();
  return text === '' ? null : text;
};

/**
 * Valores do formulário -> corpo da API. A foto (`photoUrl`) fica de fora de propósito: as fotos ainda não são
 * exibidas (a CSP só aceita `img-src 'self' data:`), então o diálogo não tem o campo e o corpo não a envia.
 * O servidor e a API continuam aceitando `photoUrl`. Na criação o corpo leva `email` e `sendAccess`; na edição o e-mail
 * não vai (o servidor recusa).
 */
export function studentPayload(values, { existing = null, sendAccess = false } = {}) {
  const body = {
    name: values.name.trim(),
    phone: textOrNull(values.phone),
    className: textOrNull(values.className),
    program: textOrNull(values.program),
    plan: textOrNull(values.plan),
    joinedOn: textOrNull(values.joinedOn),
    endsOn: textOrNull(values.endsOn),
  };
  return existing ? body : { ...body, email: values.email.trim(), sendAccess };
}

/**
 * Corpo do diálogo da aluna. Sem `existing`: criação, com e-mail editável e a caixa "Gerar o link de
 * acesso agora". Com `existing` (StudentDto): edição — o e-mail é o login e aparece só como texto, e os
 * campos vêm preenchidos.
 */
export function studentDialogBody(existing, defaults = {}) {
  const value = (key) => existing?.[key] ?? defaults[key] ?? '';
  return html`${field({ id: 'student-name', label: 'Nome', name: 'name', required: true, maxlength: 120, autocomplete: 'off', value: value('name') })}
    ${existing
      ? html`<div class="field">
          <p class="field-label">E-mail</p>
          <p class="field-static">${existing.email}</p>
          <p class="field-hint">O e-mail é o login da aluna e não pode ser alterado aqui.</p>
        </div>`
      : field({ id: 'student-email', label: 'E-mail', name: 'email', type: 'email', required: true, maxlength: 254, autocomplete: 'off', inputmode: 'email' })}
    <div class="form-grid">
    ${field({ id: 'student-class', label: 'Turma', name: 'className', maxlength: 80, autocomplete: 'off', value: value('className') })}
    ${field({ id: 'student-program', label: 'Programa', name: 'program', maxlength: 120, autocomplete: 'off', value: value('program') })}
    ${field({ id: 'student-plan', label: 'Plano', name: 'plan', maxlength: 80, autocomplete: 'off', value: value('plan') })}
    ${field({ id: 'student-phone', label: 'Telefone', name: 'phone', type: 'tel', maxlength: 20, autocomplete: 'off', hint: 'Com DDD. Exemplo: (11) 91234-5678', value: value('phone') })}
    ${field({ id: 'student-joined', label: 'Data de entrada', name: 'joinedOn', type: 'date', value: value('joinedOn') })}
    ${field({ id: 'student-ends', label: 'Data de término', name: 'endsOn', type: 'date', value: value('endsOn') })}
    </div>
    ${existing
      ? ''
      : html`<div class="field field-check">
          <label class="check-label" for="student-send-access">
            <input type="checkbox" id="student-send-access" name="sendAccess" class="check-input" checked aria-describedby="student-send-access-hint">
            <span>Gerar o link de acesso agora</span>
          </label>
          <p class="field-hint" id="student-send-access-hint">O link deixa a aluna criar a própria senha. Você também pode gerar depois, no perfil dela.</p>
        </div>`}`;
}

/**
 * Reavalia o término no lugar assim que qualquer uma das datas muda: o formulário só valida ao sair do campo,
 * e o seletor de data do celular muda o valor sem tirar o foco; além disso o término depende da entrada.
 * Chame no `onMount` do diálogo.
 */
export function linkDatesCheck(dialog, formApi) {
  const joined = dialog.querySelector('[name="joinedOn"]');
  const ends = dialog.querySelector('[name="endsOn"]');
  if (!joined || !ends) return;
  const recheck = () => formApi.setError('endsOn', datesError(ends.value, { joinedOn: joined.value }));
  joined.addEventListener('change', recheck);
  ends.addEventListener('change', recheck);
}

let counter = 0;

async function copyText(text, input) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sem permissão ou sem a API (contexto não seguro): seleciona o texto para a pessoa copiar à mão.
    input.focus();
    input.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

/**
 * Diálogo informativo com o link de acesso da aluna (campo somente leitura + "Copiar link").
 * `reset`: o link é de redefinição de senha (aluna que já ativou a conta), com texto próprio.
 * Resolve quando o diálogo fecha. O link só aparece aqui: o servidor não o devolve de novo.
 */
export function copyLinkDialog({ student, acceptUrl, reset = false }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const uid = `copy-link-${++counter}`;
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.setAttribute('aria-labelledby', `${uid}-title`);
    dialog.setAttribute('aria-describedby', `${uid}-desc`);
    mount(dialog, html`<div class="dialog-body">
      <h2 id="${uid}-title">${reset ? 'Link de redefinição de senha de' : 'Link de acesso de'} ${student.name}</h2>
      <p id="${uid}-desc">${reset
        ? 'Envie este link à aluna. Ao usá-lo, ela escolhe uma nova senha e as sessões abertas são encerradas. Vale por 7 dias e só pode ser usado uma vez.'
        : 'Envie este link à aluna. Ele vale por 7 dias e só pode ser usado uma vez.'}</p>
      ${field({ id: `${uid}-url`, label: reset ? 'Link de redefinição' : 'Link de acesso', value: acceptUrl, extra: { readonly: true } })}
      <p class="copy-feedback" role="status" aria-live="polite"></p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-close>Fechar</button>
        <button type="button" class="btn btn-primary" data-copy>Copiar link</button>
      </div>
    </div>`);
    const input = dialog.querySelector('input');
    const feedback = dialog.querySelector('.copy-feedback');
    input.addEventListener('focus', () => input.select());
    dialog.querySelector('[data-copy]').addEventListener('click', async () => {
      const copied = await copyText(acceptUrl, input);
      if (copied) {
        feedback.textContent = 'Link copiado.';
        toast('Link copiado.', { tone: 'success' });
      } else {
        feedback.textContent = 'Não foi possível copiar sozinho. O link está selecionado: use Ctrl+C.';
        input.focus();
        input.select();
      }
    });
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      unlockScroll();
      dialog.remove();
      if (opener instanceof HTMLElement) opener.focus();
      resolve();
    });
    document.body.append(dialog);
    lockScroll();
    dialog.showModal();
    dialog.querySelector('[data-copy]').focus();
  });
}
