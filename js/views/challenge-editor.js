import { ApiError, describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { dayMonthYear, durationText, instantDayMonthYear, mentoraStatus, CHALLENGE_STATUS_META, xpText } from '../lib/growth.js';
import { attrs, html } from '../lib/html.js';
import { icon } from '../ih-icons.js';
import { alert, field, selectField } from '../ui/components.js';
import { attachForm } from '../ui/form.js';
import { lockScroll, unlockScroll } from '../ui/scroll-lock.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';

/**
 * Editor de desafio da mentora (kit M-Desafios) em gaveta lateral. Rascunho: edita tudo e tem "Salvar rascunho" e
 * "Publicar desafio". Publicado ou arquivado: só nome e descrição mudam; mostra a adesão (nomes e % de cada aluna) e permite
 * arquivar. Devolve `{ changed }`: verdadeiro quando algo foi salvo, publicado ou arquivado (quem chama recarrega a lista).
 */

let counter = 0;

const KIND_OPTIONS = [
  { value: 'manual', label: 'A aluna marca' },
  { value: 'auto_task_done_count', label: 'Automática: tarefas concluídas' },
  { value: 'auto_lead_created', label: 'Automática: leads criados' },
  { value: 'auto_deal_won', label: 'Automática: oportunidades ganhas' },
  { value: 'auto_people_added', label: 'Automática: pessoas cadastradas' },
];

const textarea = ({ id, name, label, value, rows = 3, maxlength, hint }) => html`<div class="field">
  <label class="field-label" for="${id}">${label}</label>
  <div class="field-control"><textarea${attrs({ id, name, class: 'field-input', rows, maxlength, 'aria-describedby': `${hint ? `${id}-hint ` : ''}${id}-error` })}>${value}</textarea></div>
  ${hint ? html`<p class="field-hint" id="${id}-hint">${hint}</p>` : ''}
  <p class="field-error" id="${id}-error" role="alert"></p>
</div>`;

function titleError(value) {
  const text = value.trim();
  if (text === '') return 'Informe o nome do desafio.';
  return [...text].length > 80 ? 'O nome é longo demais (máximo 80).' : null;
}
const descriptionError = (value) => ([...value.trim()].length > 500 ? 'A descrição é longa demais (máximo 500).' : null);
function durationError(value) {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return 'Informe a duração em dias, de 1 a 90.';
  const n = Number(text);
  return n < 1 || n > 90 ? 'A duração vai de 1 a 90 dias.' : null;
}
const startError = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? null : 'Informe a data de início.');
function rewardError(value) {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return 'Informe um número inteiro (use 0 para nenhum XP).';
  return Number(text) > 2000 ? 'O XP máximo é 2.000.' : null;
}

/** Linha de uma ação: n é só um identificador único do campo (não muda ao reordenar). */
function actionRow(n, action) {
  const kind = action?.kind ?? 'manual';
  const auto = kind !== 'manual';
  return html`<li class="mg-action-row" data-row="${n}">
    <span class="mg-action-n" aria-hidden="true" data-ordinal></span>
    <div class="mg-action-fields">
      ${field({ id: `act-${n}-title`, label: 'Ação', name: `act-${n}-title`, maxlength: 120, value: action?.title ?? '', extra: { 'data-field': 'title' } })}
      ${selectField({ id: `act-${n}-kind`, label: 'Tipo', name: `act-${n}-kind`, value: kind, options: KIND_OPTIONS })}
      ${field({ id: `act-${n}-xp`, label: 'XP', name: `act-${n}-xp`, inputmode: 'numeric', value: String(action?.xp ?? 0), extra: { 'data-field': 'xp' } })}
      <div class="mg-action-target"${auto ? '' : html` hidden`}>${field({ id: `act-${n}-target`, label: 'Quantidade no período', name: `act-${n}-target`, inputmode: 'numeric', value: String(action?.target ?? 1), hint: 'A ação se completa sozinha quando a aluna chega a esse número.', extra: { 'data-field': 'target' } })}</div>
      <input type="hidden" name="act-${n}-id" value="${action?.id ?? ''}">
    </div>
    <div class="mg-action-tools">
      <button type="button" class="mg-icon-btn" data-row-action="up" aria-label="Subir esta ação">${icon('chevronUp', { size: 18 })}</button>
      <button type="button" class="mg-icon-btn" data-row-action="down" aria-label="Descer esta ação">${icon('chevronDown', { size: 18 })}</button>
      <button type="button" class="mg-icon-btn" data-row-action="remove" aria-label="Remover esta ação">${icon('trash', { size: 18 })}</button>
    </div>
  </li>`;
}

function readOnlySummary(c) {
  const classes = c.classNames.length ? c.classNames.join(', ') : 'Todas as turmas';
  return html`<dl class="mg-readonly">
    <div><dt>Período</dt><dd>${dayMonthYear(c.startsOn)} a ${dayMonthYear(c.endsOn)} (${durationText(c.durationDays)})</dd></div>
    <div><dt>Recompensa</dt><dd>${c.rewardXp > 0 ? xpText(c.rewardXp) : 'Sem XP no desafio'}${c.achievement ? ` · conquista “${c.achievement.title}”` : ''}</dd></div>
    <div><dt>Turmas</dt><dd>${classes}</dd></div>
  </dl>
  <div class="field"><h3 class="mg-section-title">Ações (${c.actions.length})</h3>
    <ol class="mg-people">${c.actions.map((a) => html`<li class="mg-person"><span class="mg-person-name">${a.title}</span><span class="mg-person-meta">${a.xp > 0 ? xpText(a.xp) : 'Sem XP'}${a.kind === 'manual' ? '' : ' · automática'}</span></li>`)}</ol></div>
  <div class="field"><h3 class="mg-section-title">Participantes (${c.participants.length})</h3>
    ${c.participants.length === 0
      ? html`<p class="field-hint">Ninguém entrou neste desafio ainda.</p>`
      : html`<ul class="mg-people">${c.participants.map((p) => html`<li class="mg-person"><span class="mg-person-name">${p.name}</span><span class="mg-person-meta">${p.completedAt ? `Concluiu em ${instantDayMonthYear(p.completedAt)}` : `${p.pct}% · ${p.done} de ${p.total} ações`}</span></li>`)}</ul>`}</div>`;
}

export function openChallengeEditor({ api, challenge = null, classes = [], achievements = [], todayIso }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const uid = `chal-editor-${++counter}`;
    let current = challenge;
    let changed = false;
    let rowCounter = 0;
    const locked = Boolean(current) && current.status !== 'draft';
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog dialog-form dialog-drawer';
    dialog.setAttribute('aria-labelledby', `${uid}-title`);

    const status = current ? CHALLENGE_STATUS_META[mentoraStatus(current)] : CHALLENGE_STATUS_META.draft;
    const selectedClasses = new Set(current?.classNames ?? []);
    const classOptions = [...new Set([...classes, ...(current?.classNames ?? [])])];
    const body = locked
      ? html`${field({ id: `${uid}-name`, label: 'Nome', name: 'title', required: true, maxlength: 80, value: current.title })}
          ${textarea({ id: `${uid}-desc`, name: 'description', label: 'Descrição', value: current.description, rows: 3, maxlength: 500 })}
          ${readOnlySummary(current)}`
      : html`${field({ id: `${uid}-name`, label: 'Nome', name: 'title', required: true, maxlength: 80, value: current?.title ?? '' })}
          ${textarea({ id: `${uid}-desc`, name: 'description', label: 'Descrição', value: current?.description ?? '', rows: 3, maxlength: 500, hint: 'Opcional. A aluna lê isto no desafio.' })}
          <div class="form-grid form-grid-2">
            ${field({ id: `${uid}-days`, label: 'Duração (dias)', name: 'durationDays', inputmode: 'numeric', value: String(current?.durationDays ?? 7), hint: 'De 1 a 90 dias.' })}
            ${field({ id: `${uid}-start`, label: 'Início', name: 'startsOn', type: 'date', value: current?.startsOn ?? todayIso })}
            ${field({ id: `${uid}-reward`, label: 'Recompensa (XP)', name: 'rewardXp', inputmode: 'numeric', value: String(current?.rewardXp ?? 0), hint: 'Concedido ao concluir todas as ações.' })}
            ${selectField({ id: `${uid}-award`, label: 'Conquista ao concluir', name: 'achievementId', value: current?.achievement?.id ?? '', options: [{ value: '', label: 'Nenhuma' }, ...achievements.map((a) => ({ value: a.id, label: a.title }))] })}
          </div>
          ${achievements.length === 0 ? html`<p class="field-hint">Para conceder uma conquista ao concluir, crie antes em Conquistas uma com o critério “Ao concluir o desafio vinculado”.</p>` : ''}
          <div class="field">
            <span class="field-label" id="${uid}-classes-label">Turmas</span>
            ${classOptions.length
              ? html`<div class="mg-chips" role="group" aria-labelledby="${uid}-classes-label">${classOptions.map((name) => html`<button${attrs({ type: 'button', class: 'mg-chip', 'data-class': name, 'aria-pressed': String(selectedClasses.has(name)) })}>${name}</button>`)}</div>
                <p class="field-hint">Sem nenhuma turma marcada, o desafio vale para todas as alunas.</p>`
              : html`<p class="field-hint">As alunas ainda não têm turma cadastrada: o desafio vale para todas.</p>`}
          </div>
          <div class="mg-actions-editor">
            <h3 class="mg-section-title" id="${uid}-actions-title">Ações do desafio</h3>
            <p class="field-error" id="${uid}-actions-error" role="alert"></p>
            <ol class="mg-action-list" aria-labelledby="${uid}-actions-title" data-actions></ol>
            <button type="button" class="mg-add" data-add>${icon('plus', { size: 14, stroke: 2 })}Adicionar ação</button>
          </div>`;

    const footer = locked
      ? html`<div class="dialog-actions dialog-actions-spread">
          ${current.status === 'published' ? html`<button type="button" class="btn btn-ghost" data-archive>${icon('trash', { size: 16 })}<span>Arquivar desafio</span></button>` : html`<span></span>`}
          <div class="dialog-actions-main">
            <button type="button" class="btn btn-ghost" data-cancel>Fechar</button>
            <button type="submit" class="btn btn-primary" data-busy-label="Salvando…"><span class="spinner" aria-hidden="true" hidden></span><span>Salvar nome e descrição</span></button>
          </div></div>`
      : html`<div class="dialog-actions dialog-actions-spread">
          ${current ? html`<button type="button" class="btn btn-ghost" data-delete>${icon('trash', { size: 16 })}<span>Excluir rascunho</span></button>` : html`<span></span>`}
          <div class="dialog-actions-main">
            <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
            <button type="button" class="btn btn-ghost" data-save-draft>Salvar rascunho</button>
            <button type="submit" class="btn btn-primary" data-busy-label="Publicando…"><span class="spinner" aria-hidden="true" hidden></span><span>Publicar desafio</span></button>
          </div></div>`;

    mount(dialog, html`<div class="dialog-body">
      <p class="mg-draft-tag" id="${uid}-status">${status.label.toUpperCase()}</p>
      <h2 id="${uid}-title">${current ? (locked ? 'Desafio' : 'Editar desafio') : 'Novo desafio'}</h2>
      <form novalidate>
        <div class="form-banner" id="${uid}-banner"></div>
        ${body}
        ${footer}
      </form>
    </div>`);

    const form = dialog.querySelector('form');
    const banner = dialog.querySelector(`#${uid}-banner`);
    const list = dialog.querySelector('[data-actions]');
    const actionsError = dialog.querySelector(`#${uid}-actions-error`);
    const cancelButtons = dialog.querySelectorAll('[data-cancel]');

    // ---- ações (somente em rascunho)
    function renumber() {
      const rows = [...list.children];
      rows.forEach((row, index) => {
        row.querySelector('[data-ordinal]').textContent = String(index + 1);
        row.querySelector('[data-row-action="up"]').disabled = index === 0;
        row.querySelector('[data-row-action="down"]').disabled = index === rows.length - 1;
        row.querySelector('[data-field="title"]').setAttribute('aria-label', `Ação ${index + 1}: texto`);
        row.querySelector('select').setAttribute('aria-label', `Ação ${index + 1}: tipo`);
        row.querySelector('[data-field="xp"]').setAttribute('aria-label', `Ação ${index + 1}: XP`);
        row.querySelector('[data-field="target"]').setAttribute('aria-label', `Ação ${index + 1}: quantidade no período`);
        for (const button of row.querySelectorAll('[data-row-action]')) {
          const verb = { up: 'Subir', down: 'Descer', remove: 'Remover' }[button.dataset.rowAction];
          button.setAttribute('aria-label', `${verb} a ação ${index + 1}`);
        }
      });
    }
    function appendRow(action) {
      const holder = document.createElement('ol');
      mount(holder, actionRow(++rowCounter, action));
      const row = holder.firstElementChild;
      list.append(row);
      return row;
    }
    if (list) {
      for (const action of current?.actions ?? []) appendRow(action);
      renumber();
      dialog.querySelector('[data-add]').addEventListener('click', () => {
        if (list.children.length >= 30) {
          mount(actionsError, html`Um desafio tem no máximo 30 ações.`);
          return;
        }
        mount(actionsError, html``);
        const row = appendRow(null);
        renumber();
        row.querySelector('[data-field="title"]').focus();
      });
      list.addEventListener('click', (event) => {
        const button = event.target.closest('[data-row-action]');
        if (!button) return;
        const row = button.closest('.mg-action-row');
        const kind = button.dataset.rowAction;
        if (kind === 'remove') {
          const next = row.nextElementSibling ?? row.previousElementSibling;
          row.remove();
          renumber();
          (next?.querySelector('[data-field="title"]') ?? dialog.querySelector('[data-add]')).focus();
        } else if (kind === 'up' && row.previousElementSibling) {
          row.previousElementSibling.before(row);
          renumber();
          (row.querySelector('[data-row-action="up"]:not(:disabled)') ?? row.querySelector('[data-row-action="down"]')).focus();
        } else if (kind === 'down' && row.nextElementSibling) {
          row.nextElementSibling.after(row);
          renumber();
          (row.querySelector('[data-row-action="down"]:not(:disabled)') ?? row.querySelector('[data-row-action="up"]')).focus();
        }
      });
      list.addEventListener('change', (event) => {
        if (!event.target.matches('select')) return;
        const row = event.target.closest('.mg-action-row');
        row.querySelector('.mg-action-target').hidden = event.target.value === 'manual';
      });
      for (const chip of dialog.querySelectorAll('[data-class]')) {
        chip.addEventListener('click', () => chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')));
      }
    }

    function collectActions() {
      const rows = [...list.children];
      const problems = [];
      const actions = rows.map((row, index) => {
        const n = row.dataset.row;
        const get = (name) => form.elements.namedItem(`act-${n}-${name}`);
        const title = get('title').value.trim();
        const kind = get('kind').value;
        const xp = get('xp').value.trim();
        const target = get('target').value.trim();
        if (title === '') problems.push([`act-${n}-title`, `Informe o texto da ação ${index + 1}.`]);
        else if ([...title].length > 120) problems.push([`act-${n}-title`, 'O texto da ação é longo demais (máximo 120).']);
        if (!/^\d+$/.test(xp) || Number(xp) > 200) problems.push([`act-${n}-xp`, 'O XP da ação vai de 0 a 200.']);
        if (kind !== 'manual' && (!/^\d+$/.test(target) || Number(target) < 1 || Number(target) > 1000)) problems.push([`act-${n}-target`, 'Informe uma quantidade de 1 a 1000.']);
        const id = get('id').value;
        return { ...(id ? { id } : {}), title, xp: Number(xp) || 0, kind, target: kind === 'manual' ? 1 : Number(target) || 1 };
      });
      return { actions, problems };
    }

    function clearActionErrors() {
      for (const row of list?.children ?? []) for (const input of row.querySelectorAll('input, select')) formApi.setError(input.name, null);
      if (actionsError) mount(actionsError, html``); // desafio publicado não tem a lista de ações editável
    }

    /** Erros do servidor `actions.N.campo` viram erro no campo da linha N. */
    function mapServerErrors(errors = []) {
      const rest = [];
      const rows = [...(list?.children ?? [])];
      let first = null;
      for (const error of errors) {
        const m = /^actions\.(\d+)\.(title|xp|kind|target)$/.exec(error.field);
        const row = m ? rows[Number(m[1])] : null;
        if (row) {
          const name = `act-${row.dataset.row}-${m[2]}`;
          formApi.setError(name, error.message);
          first ??= name;
        } else if (error.field === 'actions' && actionsError) {
          mount(actionsError, html`${error.message}`);
        } else rest.push(error);
      }
      if (first) form.elements.namedItem(first)?.focus();
      return rest;
    }

    function payload() {
      const values = formApi.values();
      const selected = [...dialog.querySelectorAll('[data-class][aria-pressed="true"]')].map((chip) => chip.dataset.class);
      const { actions } = collectActions();
      return {
        title: values.title.trim(),
        description: values.description.trim(),
        durationDays: Number(values.durationDays),
        startsOn: values.startsOn,
        rewardXp: Number(values.rewardXp),
        achievementId: values.achievementId || null,
        classNames: selected,
        actions,
      };
    }

    function setBusy(busy) {
      for (const b of dialog.querySelectorAll('.dialog-actions button')) b.disabled = busy;
    }

    function close() {
      dialog.close();
    }

    async function save({ publish }) {
      mount(banner, html``);
      clearActionErrors();
      const { problems } = locked ? { problems: [] } : collectActions();
      let invalid = false;
      for (const name of locked ? ['title', 'description'] : ['title', 'description', 'durationDays', 'startsOn', 'rewardXp']) {
        const validate = { title: titleError, description: descriptionError, durationDays: durationError, startsOn: startError, rewardXp: rewardError }[name];
        const message = validate(formApi.values()[name] ?? '');
        formApi.setError(name, message);
        if (message) invalid = true;
      }
      for (const [name, message] of problems) formApi.setError(name, message);
      if (invalid || problems.length) {
        const first = form.querySelector('[aria-invalid="true"]');
        first?.focus();
        return;
      }
      setBusy(true);
      try {
        let saved;
        if (locked) {
          saved = await api.patch(`/api/v1/mentora/challenges/${current.id}`, { title: formApi.values().title.trim(), description: formApi.values().description.trim(), version: current.version });
        } else if (current) {
          saved = await api.patch(`/api/v1/mentora/challenges/${current.id}`, { ...payload(), version: current.version });
        } else {
          saved = await api.post('/api/v1/mentora/challenges', payload());
        }
        current = saved;
        changed = true;
        // Mantém os ids das ações devolvidos pelo servidor (um novo "Salvar" não recria as ações).
        [...(list?.children ?? [])].forEach((row, index) => {
          const idField = form.elements.namedItem(`act-${row.dataset.row}-id`);
          if (idField && saved.actions?.[index]) idField.value = saved.actions[index].id;
        });
        if (publish) {
          current = await api.post(`/api/v1/mentora/challenges/${saved.id}/publish`);
          toast('Desafio publicado. As alunas elegíveis foram avisadas.', { tone: 'success' });
        } else {
          toast(locked ? 'Desafio atualizado.' : 'Rascunho salvo.', { tone: 'success' });
        }
        close();
      } catch (error) {
        setBusy(false);
        const rest = mapServerErrors(error?.errors);
        const orphan = formApi.applyServerErrors(rest);
        const message = orphan[0] ?? (error?.errors?.length ? null : describeError(error));
        if (message) mount(banner, alert({ tone: 'danger', message }));
        if (error instanceof ApiError && error.code === 'version_conflict') changed = true;
        // O rascunho foi salvo mas a publicação não: o cabeçalho passa a refletir o rascunho gravado.
        if (current && current.id && !locked) dialog.querySelector(`#${uid}-title`).textContent = 'Editar desafio';
      }
    }

    const formApi = attachForm(form, {
      validators: {},
      async onSubmit() {
        await save({ publish: !locked });
      },
    });

    // Enter dentro de um campo não publica sem querer: só o botão (ou Enter nele) envia, e no rascunho nada é enviado por Enter.
    if (!locked) {
      form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.matches('input')) event.preventDefault();
      });
    }

    // Botões extras
    dialog.querySelector('[data-save-draft]')?.addEventListener('click', () => save({ publish: false }));
    for (const b of cancelButtons) b.addEventListener('click', close);
    dialog.querySelector('[data-archive]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Arquivar desafio?',
        message: 'Ele sai da lista das alunas e não pode ser publicado de novo. O histórico de quem participou fica guardado.',
        confirmLabel: 'Arquivar desafio',
        tone: 'danger',
      });
      if (!ok) return;
      setBusy(true);
      try {
        await api.post(`/api/v1/mentora/challenges/${current.id}/archive`);
        changed = true;
        toast('Desafio arquivado.', { tone: 'success' });
        close();
      } catch (error) {
        setBusy(false);
        mount(banner, alert({ tone: 'danger', message: describeError(error) }));
      }
    });
    dialog.querySelector('[data-delete]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Excluir rascunho?',
        message: 'O rascunho e as ações dele serão apagados. Isto não pode ser desfeito.',
        confirmLabel: 'Excluir rascunho',
        tone: 'danger',
      });
      if (!ok) return;
      setBusy(true);
      try {
        await api.delete(`/api/v1/mentora/challenges/${current.id}`);
        changed = true;
        toast('Rascunho excluído.', { tone: 'success' });
        close();
      } catch (error) {
        setBusy(false);
        mount(banner, alert({ tone: 'danger', message: describeError(error) }));
      }
    });

    dialog.addEventListener('close', () => {
      unlockScroll();
      dialog.remove();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      resolve({ changed });
    });

    document.body.append(dialog);
    lockScroll();
    dialog.showModal();
    form.querySelector('input, select, textarea')?.focus();
  });
}
