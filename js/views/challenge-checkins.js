import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { dayMonthYear } from '../lib/growth.js';
import { prepareEvidence } from '../lib/evidence.js';
import { applySizes } from '../lib/widths.js';
import {
  BODY_MAX,
  FILES_PER_CHECKIN,
  IMAGE_TYPES,
  LINKS_MAX,
  PDF_TYPE,
  bodyError,
  canAddFile,
  checkinDays,
  closingDay,
  dayTitle,
  defaultCheckinDay,
  evidenceFileError,
  formatBytes,
  journeyErrorMessage,
  linksError,
  mapLinkErrors,
  needsReload,
  splitLinks,
  storageUsage,
  todayInBrasilia,
} from '../lib/journey.js';
import { icon } from '../ih-icons.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { attachForm } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { checkinArticle, filesBlock, openPhotoViewer } from './journey-ui.js';

// Check-ins do desafio (aluna): um registro por dia, com texto, links, "cumpri o dia", fotos e comprovantes, e o
// histórico com o retorno da mentora. `closed` (prazo de 7 dias depois do fim encerrado) deixa tudo só para leitura.

const isCheckin = (v) => !!v && typeof v === 'object' && typeof v.id === 'string' && typeof v.day === 'string' && Array.isArray(v.files);
const isList = (v) => !!v && typeof v === 'object' && Array.isArray(v.rows) && v.rows.every(isCheckin);
const filesBytes = (c) => (c?.files ?? []).reduce((sum, f) => sum + (Number(f.sizeBytes) || 0), 0);

/** Demonstração: o servidor falso pode marcar `storage.demo`; a faixa "Versão de demonstração" também denuncia. */
const isDemo = (storage) => storage?.demo === true || !!document.querySelector('.ih-demo');

function storageMeter(storage) {
  const u = storageUsage(storage);
  return html`<div class="jr-storage">
    <p class="jr-storage-row"><span>Espaço para evidências</span><strong>${u.text}</strong></p>
    <div class="xp-track xp-track-sm" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${u.pct}" aria-label="Espaço usado: ${u.text}"><div${attrs({ class: `xp-fill${u.nearlyFull ? ' jr-fill-warn' : ''}`, 'data-w': String(u.pct) })}></div></div>
    ${u.nearlyFull ? html`<p class="jr-storage-warn">Seu espaço está quase cheio. Remova arquivos que não precisa mais para liberar espaço.</p>` : ''}
  </div>`;
}

function textarea({ id, name, label, value, rows, max, hint, disabled }) {
  return html`<div class="field">
    <label class="field-label" for="${id}">${label}</label>
    <div class="field-control"><textarea${attrs({ id, name, class: 'field-input jr-textarea', rows: String(rows), maxlength: max ? String(max) : false, disabled, 'aria-describedby': `${id}-hint ${id}-error` })}>${value}</textarea></div>
    <p class="field-hint" id="${id}-hint">${hint}</p>
    <p class="field-error" id="${id}-error" role="alert"></p>
  </div>`;
}

/** Monta a seção em `host` e devolve a limpeza. `challenge` = DTO de GET /challenges/:id (startsOn, endsOn, enrolled, phase). */
export function mountChallengeCheckins({ host, api, challenge }) {
  const base = `/api/v1/challenges/${encodeURIComponent(challenge.id)}/checkins`;
  let disposed = false;
  let seq = 0;
  let data = null;
  let day = null;
  let dirty = false;
  let uploading = false;
  const today = todayInBrasilia();

  mount(host, html`<section class="growth-card jr-ck-card" aria-labelledby="ck-title">
    <div class="growth-card-head"><h2 id="ck-title">Check-ins</h2><span class="growth-card-note">Um registro por dia do desafio</span></div>
    <div id="ck-body" class="jr-ck-body" aria-busy="true">${skeleton(4)}</div>
  </section>`);
  const body = host.querySelector('#ck-body');

  const days = () => checkinDays(challenge.startsOn, challenge.endsOn, today);
  const rowOf = (d) => data?.rows.find((r) => r.day === d) ?? null;
  const readOnly = () => data?.closed === true;

  function dayOption(d) {
    const row = rowOf(d);
    const label = `${d === today ? 'Hoje · ' : ''}${dayTitle(challenge.startsOn, d)}${row ? (row.completed ? ' · cumprido' : ' · registrado') : ''}`;
    return html`<option${attrs({ value: d, selected: d === day })}>${label}</option>`;
  }

  function evidence(row) {
    const demo = isDemo(data.storage);
    const full = !canAddFile(row);
    const ro = readOnly();
    return html`<div class="jr-evidence" aria-labelledby="ck-ev-title">
      <h4 class="jr-subhead" id="ck-ev-title">Fotos e comprovantes</h4>
      <p class="jr-hint" id="ck-ev-hint">${demo
        ? 'Na demonstração, só imagens (reduzidas antes de salvar) e elas ficam só neste navegador. PDF funciona na versão completa.'
        : `Até ${FILES_PER_CHECKIN} arquivos por dia. Fotos são reduzidas antes do envio; comprovantes podem ser imagem ou PDF de até 3 MB.`}</p>
      <div id="ck-files">${filesBlock(row?.files, { removable: !ro }) || html`<p class="muted jr-files-empty">Nenhum arquivo neste dia.</p>`}</div>
      ${ro
        ? ''
        : html`<div class="jr-upload-row">
            <button${attrs({ type: 'button', class: 'btn btn-ghost btn-sm', 'data-action': 'pick', 'data-kind': 'photo', disabled: full || uploading, 'aria-describedby': 'ck-ev-hint' })}>${icon('camera', { size: 16 })}<span>Adicionar foto</span></button>
            <button${attrs({ type: 'button', class: 'btn btn-ghost btn-sm', 'data-action': 'pick', 'data-kind': 'receipt', disabled: full || uploading, 'aria-describedby': 'ck-ev-hint' })}>${icon('attach', { size: 16 })}<span>Adicionar comprovante</span></button>
            <input${attrs({ type: 'file', id: 'ck-file-photo', class: 'sr-only', accept: IMAGE_TYPES.join(','), tabindex: '-1', 'aria-hidden': 'true', 'data-kind': 'photo' })}>
            <input${attrs({ type: 'file', id: 'ck-file-receipt', class: 'sr-only', accept: (demo ? IMAGE_TYPES : [...IMAGE_TYPES, PDF_TYPE]).join(','), tabindex: '-1', 'aria-hidden': 'true', 'data-kind': 'receipt' })}>
          </div>
          ${full ? html`<p class="jr-hint">Este dia já tem ${FILES_PER_CHECKIN} arquivos, o máximo. Remova um para adicionar outro.</p>` : ''}`}
      <p class="jr-upload-status" id="ck-upload-status" role="status" aria-live="polite"></p>
      <p class="jr-upload-error" id="ck-upload-error" role="alert"></p>
      ${storageMeter(data.storage)}
    </div>`;
  }

  function editor() {
    const row = rowOf(day);
    const ro = readOnly();
    const isToday = day === today;
    return html`<div class="jr-day-pick">
        <div class="field"><label class="field-label" for="ck-day">Dia do check-in</label><div class="field-control"><select id="ck-day" class="field-input">${days().map(dayOption)}</select></div></div>
      </div>
      <div${attrs({ class: `jr-day${isToday ? ' is-today' : ''}` })}>
        <p class="jr-day-cap">${isToday ? 'Hoje' : 'Dia anterior'}</p>
        <h3 class="jr-day-title" id="ck-day-title" tabindex="-1">${dayTitle(challenge.startsOn, day)}</h3>
        ${row?.feedback ? html`<div class="jr-feedback"><p class="jr-feedback-cap">Retorno da mentora${row.feedbackByName ? ` · ${row.feedbackByName}` : ''}</p><p class="jr-feedback-text">${row.feedback}</p></div>` : ''}
        <form id="ck-form" class="jr-form" novalidate aria-labelledby="ck-day-title">
          <div id="ck-banner"></div>
          ${textarea({ id: 'ck-text', name: 'body', label: 'Como foi o seu dia no desafio?', value: row?.body ?? '', rows: 5, max: BODY_MAX, hint: `O que você fez, o que aprendeu, o que travou. Até ${BODY_MAX.toLocaleString('pt-BR')} caracteres.`, disabled: ro })}
          ${textarea({ id: 'ck-links', name: 'links', label: 'Links (opcional)', value: (row?.links ?? []).join('\n'), rows: 3, hint: `Um por linha, até ${LINKS_MAX}, começando com https:// (post, vídeo, página).`, disabled: ro })}
          <label class="check-row jr-done" for="ck-done"><input${attrs({ type: 'checkbox', id: 'ck-done', name: 'completed', class: 'check-input', checked: row?.completed === true, disabled: ro })}><span><strong>Cumpri o dia</strong><span class="jr-done-hint">Marque quando tiver feito o que o desafio pede para hoje.</span></span></label>
          ${ro ? '' : html`<div class="jr-form-actions">${button({ label: row ? 'Salvar alterações' : 'Salvar check-in', type: 'submit', busyLabel: 'Salvando…', iconStart: icon('check', { size: 16, stroke: 2 }) })}</div>`}
        </form>
        ${evidence(row)}
      </div>`;
  }

  function history() {
    const allowed = new Set(days());
    if (data.rows.length === 0) return emptyState({ title: 'Nenhum check-in ainda', message: 'Os dias que você registrar aparecem aqui, com o retorno da sua mentora.' });
    return html`<div class="jr-checkins">${data.rows.map((c) => checkinArticle(c, { audience: 'student', startsOn: challenge.startsOn, editable: !readOnly() && allowed.has(c.day) && c.day !== day }))}</div>`;
  }

  function paint() {
    const list = days();
    if (!day || !list.includes(day)) day = defaultCheckinDay(challenge.startsOn, challenge.endsOn, today);
    mount(body, html`${readOnly()
        ? alert({ tone: 'info', title: 'Check-ins encerrados', message: `O prazo para editar terminou em ${dayMonthYear(closingDay(challenge.endsOn))} (7 dias depois do fim do desafio). Tudo fica disponível para leitura.` })
        : ''}
      ${day && !readOnly() ? html`<div id="ck-editor">${editor()}</div>` : ''}
      <div class="jr-history" id="ck-history-wrap">
        <h3 class="eyebrow eyebrow-muted" id="ck-history-title">Histórico</h3>
        <div id="ck-history">${history()}</div>
      </div>`);
    dirty = false;
    bindForm();
    applyWidths();
  }

  const applyWidths = () => applySizes(body);

  /** Redesenha só o que depende do check-in salvo (arquivos, espaço, histórico, rótulos dos dias) sem tocar no que foi digitado. */
  function repaintParts() {
    const editorEl = body.querySelector('#ck-editor');
    if (editorEl) {
      const evidenceEl = editorEl.querySelector('.jr-evidence');
      if (evidenceEl) {
        const holder = document.createElement('div');
        mount(holder, evidence(rowOf(day)));
        evidenceEl.replaceWith(holder.firstElementChild);
      }
      const select = editorEl.querySelector('#ck-day');
      if (select) mount(select, html`${days().map(dayOption)}`);
      const submit = editorEl.querySelector('#ck-form [type="submit"] span:not(.spinner)');
      if (submit && rowOf(day)) {
        submit.textContent = 'Salvar alterações';
        submit.dataset.idleLabel = 'Salvar alterações';
      }
    }
    mount(body.querySelector('#ck-history'), history());
    applyWidths();
  }

  function upsert(checkin) {
    const old = rowOf(checkin.day);
    if (data.storage) data.storage = { ...data.storage, usedBytes: Math.max(0, (Number(data.storage.usedBytes) || 0) + filesBytes(checkin) - filesBytes(old)) };
    data.rows = [...data.rows.filter((r) => r.day !== checkin.day), checkin].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  }

  function bindForm() {
    const form = body.querySelector('#ck-form');
    if (!form || readOnly()) return;
    const banner = form.querySelector('#ck-banner');
    form.addEventListener('input', () => {
      dirty = true;
    });
    const formApi = attachForm(form, {
      validators: { body: bodyError, links: linksError },
      async onSubmit(values) {
        mount(banner, html``);
        const row = rowOf(day);
        const text = values.body.trim();
        const payload = { body: text || null, links: splitLinks(values.links), completed: form.querySelector('#ck-done').checked };
        if (row) payload.version = row.version;
        try {
          const saved = await api.put(`${base}/${encodeURIComponent(day)}`, payload);
          if (disposed) return;
          if (isCheckin(saved)) upsert(saved);
          dirty = false;
          toast(row ? 'Check-in atualizado.' : 'Check-in registrado.', { tone: 'success' });
          repaintParts();
        } catch (error) {
          if (disposed) return;
          const orphan = formApi.applyServerErrors(mapLinkErrors(error?.errors));
          const message = journeyErrorMessage(error);
          if (needsReload(error)) {
            toast(message, { tone: 'danger' });
            await load({ keepDay: true });
            return;
          }
          if (orphan.length || !error?.errors?.length) mount(banner, alert({ tone: 'danger', message: orphan[0] ?? message }));
        }
      },
    });
  }

  function setStatus(text) {
    const el = body.querySelector('#ck-upload-status');
    if (el) el.textContent = text;
  }
  function setUploadError(text) {
    const el = body.querySelector('#ck-upload-error');
    if (el) el.textContent = text;
  }
  function setPickersDisabled(value) {
    for (const b of body.querySelectorAll('[data-action="pick"]')) b.disabled = value || !canAddFile(rowOf(day));
  }

  async function upload(file, kind) {
    if (uploading) return;
    setUploadError('');
    const demo = isDemo(data.storage);
    const invalid = evidenceFileError(file, kind, { demo });
    if (invalid) return setUploadError(invalid);
    if (!canAddFile(rowOf(day))) return setUploadError(`Este dia já tem ${FILES_PER_CHECKIN} arquivos, o máximo. Remova um para adicionar outro.`);
    uploading = true;
    setPickersDisabled(true);
    const targetDay = day;
    try {
      setStatus(file.type === PDF_TYPE ? 'Preparando o PDF…' : 'Reduzindo a imagem…');
      const prepared = await prepareEvidence(file, { demo });
      if (disposed) return;
      if (prepared.error) {
        setStatus('');
        setUploadError(prepared.error);
        return;
      }
      const free = storageUsage(data.storage).free;
      if (data.storage && prepared.bytes > free) {
        setStatus('');
        setUploadError(`Não há espaço suficiente (${formatBytes(prepared.bytes)} para enviar, ${formatBytes(free)} livres). Remova arquivos antigos para liberar espaço.`);
        return;
      }
      setStatus(`Enviando ${kind === 'photo' ? 'a foto' : 'o comprovante'} (${formatBytes(prepared.bytes)})…`);
      const saved = await api.post(`${base}/${encodeURIComponent(targetDay)}/files`, { kind, name: prepared.name, dataUrl: prepared.dataUrl });
      if (disposed) return;
      if (isCheckin(saved)) upsert(saved);
      uploading = false;
      repaintParts();
      setStatus(kind === 'photo' ? 'Foto enviada.' : 'Comprovante enviado.');
      // O botão que abriu a escolha foi redesenhado: o foco volta para ele (ou para o título da seção, se o dia lotou).
      (body.querySelector(`[data-action="pick"][data-kind="${kind}"]:not(:disabled)`) ?? body.querySelector('#ck-day-title'))?.focus();
    } catch (error) {
      if (disposed) return;
      setStatus('');
      setUploadError(journeyErrorMessage(error));
      if (needsReload(error)) await load({ keepDay: true });
    } finally {
      uploading = false;
      if (!disposed) setPickersDisabled(false);
    }
  }

  async function removeFile(fileId) {
    const row = rowOf(day);
    const file = row?.files.find((f) => f.id === fileId);
    if (!file) return;
    const ok = await confirmDialog({
      title: 'Remover este arquivo?',
      message: `"${file.name}" sai do check-in e o espaço é liberado. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Remover arquivo',
      cancelLabel: 'Voltar',
      tone: 'danger',
    });
    if (!ok || disposed) return;
    setUploadError('');
    try {
      const saved = await api.delete(`${base}/${encodeURIComponent(day)}/files/${encodeURIComponent(fileId)}`);
      if (disposed) return;
      if (isCheckin(saved)) upsert(saved);
      else upsert({ ...row, files: row.files.filter((f) => f.id !== fileId) });
      repaintParts();
      setStatus('Arquivo removido.');
      body.querySelector('[data-action="pick"]:not(:disabled)')?.focus();
    } catch (error) {
      if (disposed) return;
      setUploadError(journeyErrorMessage(error));
      if (needsReload(error)) await load({ keepDay: true });
    }
  }

  async function chooseDay(next, { focus = true } = {}) {
    if (next === day) return;
    if (dirty) {
      const ok = await confirmDialog({ title: 'Descartar o que você escreveu?', message: 'O texto deste dia ainda não foi salvo. Se trocar de dia, ele se perde.', confirmLabel: 'Trocar de dia', cancelLabel: 'Continuar escrevendo' });
      if (!ok || disposed) {
        const select = body.querySelector('#ck-day');
        if (select) select.value = day;
        return;
      }
    }
    day = next;
    const editorEl = body.querySelector('#ck-editor');
    if (editorEl) mount(editorEl, editor());
    dirty = false;
    bindForm();
    mount(body.querySelector('#ck-history'), history());
    applyWidths();
    if (focus) body.querySelector('#ck-day-title')?.focus();
  }

  async function load({ keepDay = false } = {}) {
    const mine = ++seq;
    body.setAttribute('aria-busy', 'true');
    if (!keepDay) mount(body, skeleton(4));
    try {
      const result = await api.get(base);
      if (disposed || mine !== seq) return;
      if (!isList(result)) throw new Error('invalid');
      data = { rows: [...result.rows].sort((a, b) => (a.day < b.day ? 1 : -1)), closed: result.closed === true, storage: result.storage ?? null };
      paint();
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(body, html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar os check-ins', message: journeyErrorMessage(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', small: true, extra: { 'data-action': 'ck-retry' } })}</div></div>`);
    }
    body.setAttribute('aria-busy', 'false');
  }

  body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !body.contains(target)) return;
    const { action } = target.dataset;
    if (action === 'ck-retry') return void load();
    if (action === 'pick') return void body.querySelector(`#ck-file-${target.dataset.kind === 'photo' ? 'photo' : 'receipt'}`)?.click();
    if (action === 'remove-file') return void removeFile(target.dataset.file);
    if (action === 'edit-day') return void chooseDay(target.dataset.day);
    if (action === 'view-photo') {
      const file = data?.rows.flatMap((r) => r.files).find((f) => f.id === target.dataset.file);
      if (file) openPhotoViewer(file);
    }
  });
  body.addEventListener('change', (event) => {
    const input = event.target;
    if (input.id === 'ck-day') return void chooseDay(input.value, { focus: false });
    if (input.type === 'file' && input.files?.[0]) {
      const file = input.files[0];
      const kind = input.dataset.kind === 'photo' ? 'photo' : 'receipt';
      input.value = '';
      upload(file, kind);
    }
  });

  if (!challenge.enrolled) {
    mount(body, html`<p class="muted">Participe do desafio para registrar seus check-ins diários, com texto, links, fotos e comprovantes.</p>`);
    body.setAttribute('aria-busy', 'false');
  } else if (days().length === 0) {
    mount(body, html`<p class="muted">Os check-ins abrem no primeiro dia do desafio (${dayMonthYear(challenge.startsOn)}).</p>`);
    body.setAttribute('aria-busy', 'false');
  } else {
    load();
  }

  return () => {
    disposed = true;
  };
}
