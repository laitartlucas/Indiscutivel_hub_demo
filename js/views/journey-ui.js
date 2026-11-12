import { ApiError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { dayMonthYear, instantDayMonthYear } from '../lib/growth.js';
import {
  FEEDBACK_MAX,
  PHASES,
  PHASE_NOTE_MAX,
  dayTitle,
  feedbackError,
  formatBytes,
  journeyErrorMessage,
  linkText,
  phaseLabel,
  phaseNoteError,
  phaseNumber,
  phaseSteps,
  phaseTitle,
  safeExternalUrl,
} from '../lib/journey.js';
import { icon } from '../ih-icons.js';
import { badge } from '../ui/components.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';
import { lockScroll, unlockScroll } from '../ui/scroll-lock.js';

// Peças compartilhadas da Jornada e dos Check-ins (aluna e mentora): cartão das 4 fases, leitura de um check-in,
// visualizador de foto e os diálogos de retorno e de mudança de fase. Nenhuma chama toast(): quem chama decide.

let counter = 0;
const uid = (prefix) => `${prefix}-${++counter}`;

// ---------------------------------------------------------------- Jornada

function stepper(current) {
  return html`<ol class="jr-steps" aria-label="Fases da mentoria">${phaseSteps(current).map(
    (s) => html`<li${attrs({ class: `jr-step is-${s.state}`, 'aria-current': s.state === 'current' ? 'step' : false })}>
      <span class="jr-step-dot" aria-hidden="true">${s.state === 'done' ? icon('check', { size: 14, stroke: 2.5 }) : phaseNumber(s.phase)}</span>
      <span class="jr-step-text"><span class="jr-step-cap">Fase ${phaseNumber(s.phase)}</span><span class="jr-step-label">${s.label}</span>${s.state === 'current' ? html`<span class="sr-only"> (fase atual)</span>` : s.state === 'done' ? html`<span class="sr-only"> (concluída)</span>` : ''}</span>
    </li>`,
  )}</ol>`;
}

function timelineItem(p, index) {
  return html`<li class="jr-tl-item">
    <span${attrs({ class: `jr-tl-dot${index === 0 ? ' is-current' : ''}`, 'aria-hidden': 'true' })}></span>
    <div class="jr-tl-body">
      <p class="jr-tl-title">${phaseTitle(p.phase)}${index === 0 ? html` ${badge('Atual', 'accent')}` : ''}</p>
      <p class="jr-tl-meta">Desde <time datetime="${p.since ?? ''}">${instantDayMonthYear(p.since)}</time>${p.changedByName ? ` · por ${p.changedByName}` : ''}</p>
      ${p.note ? html`<p class="jr-tl-note">${p.note}</p>` : ''}
    </div>
  </li>`;
}

/**
 * Cartão "Minha jornada" (aluna) / "Jornada" (mentora). `journey` = { current, history }. `action` (opcional): botão do
 * cabeçalho. `audience`: 'student' explica que nada muda sozinho; 'mentora' lembra que a aluna vê as observações.
 */
export function journeyCard(journey, { title = 'Minha jornada', headingId = uid('jr-title'), action = '', audience = 'student' } = {}) {
  const current = journey?.current ?? { phase: 1, label: phaseLabel(1), since: null, note: null };
  const history = Array.isArray(journey?.history) ? journey.history : [];
  return html`<section class="growth-card jr-card" aria-labelledby="${headingId}">
    <div class="growth-card-head"><h2 id="${headingId}">${title}</h2>${action || html`<span class="growth-card-note">${phaseTitle(current.phase)}</span>`}</div>
    ${stepper(current.phase)}
    <div class="jr-current">
      <p class="jr-current-cap">Fase atual</p>
      <p class="jr-current-name">${phaseNumber(current.phase)} · ${current.label || phaseLabel(current.phase)}</p>
      ${current.since ? html`<p class="jr-current-since">Desde ${instantDayMonthYear(current.since)}</p>` : ''}
      ${current.note && history.length === 0 ? html`<p class="jr-current-note">${current.note}</p>` : ''}
    </div>
    <div class="jr-history">
      <h3 class="eyebrow eyebrow-muted">Linha do tempo</h3>
      ${history.length === 0
        ? html`<p class="muted jr-history-empty">${audience === 'mentora' ? 'Nenhuma mudança de fase registrada ainda. Ela está na Fase 01 desde o início da mentoria.' : 'Você está na Fase 01 desde o início da mentoria. Quando a sua mentora registrar uma nova fase, ela aparece aqui com as observações dela.'}</p>`
        : html`<ol class="jr-timeline">${history.map(timelineItem)}</ol>`}
    </div>
    <p class="jr-foot">${audience === 'mentora' ? 'A fase muda só quando você registra. A aluna vê a fase, a data e a observação.' : 'A fase é registrada pela sua mentora; nada muda sozinho.'}</p>
  </section>`;
}

// ---------------------------------------------------------------- check-in (leitura)

export function linksList(links) {
  const safe = (Array.isArray(links) ? links : []).map(safeExternalUrl).filter(Boolean);
  if (safe.length === 0) return '';
  return html`<ul class="jr-links" aria-label="Links">${safe.map(
    (url) => html`<li><a${attrs({ href: url, target: '_blank', rel: 'noopener noreferrer', class: 'jr-link' })}>${icon('external', { size: 14 })}<span>${linkText(url)}</span><span class="sr-only"> (abre em nova aba)</span></a></li>`,
  )}</ul>`;
}

function photoThumb(f, { removable }) {
  return html`<li class="jr-photo">
    <button${attrs({ type: 'button', class: 'jr-photo-btn', 'data-action': 'view-photo', 'data-file': f.id, 'aria-label': `Ver foto ${f.name}` })}><img${attrs({ src: f.url, alt: '', width: '96', height: '96', loading: 'lazy', decoding: 'async' })}></button>
    ${removable ? html`<button${attrs({ type: 'button', class: 'jr-file-remove', 'data-action': 'remove-file', 'data-file': f.id, 'aria-label': `Remover foto ${f.name}` })}>${icon('trash', { size: 15 })}</button>` : ''}
  </li>`;
}

function receiptRow(f, { removable }) {
  const pdf = f.mime === 'application/pdf';
  return html`<li class="jr-receipt">
    <span class="jr-receipt-icon" aria-hidden="true">${icon(pdf ? 'attach' : 'camera', { size: 16 })}</span>
    <span class="jr-receipt-text"><span class="jr-receipt-name">${f.name}</span><span class="jr-receipt-meta">${pdf ? 'PDF' : 'Imagem'} · ${formatBytes(f.sizeBytes)}</span></span>
    <a${attrs({ class: 'btn btn-ghost btn-sm', href: f.url, download: f.name, 'aria-label': `Baixar comprovante ${f.name}` })}>${icon('download', { size: 15 })}<span>Baixar</span></a>
    ${removable ? html`<button${attrs({ type: 'button', class: 'jr-file-remove', 'data-action': 'remove-file', 'data-file': f.id, 'aria-label': `Remover comprovante ${f.name}` })}>${icon('trash', { size: 15 })}</button>` : ''}
  </li>`;
}

/** Fotos (miniaturas que abrem maiores) e comprovantes (link para baixar). `removable`: botão de remover em cada um. */
export function filesBlock(files, { removable = false } = {}) {
  const list = Array.isArray(files) ? files.filter((f) => f && typeof f.url === 'string') : [];
  const photos = list.filter((f) => f.kind === 'photo');
  const receipts = list.filter((f) => f.kind !== 'photo');
  if (list.length === 0) return '';
  return html`<div class="jr-files">
    ${photos.length ? html`<ul class="jr-photos" aria-label="Fotos">${photos.map((f) => photoThumb(f, { removable }))}</ul>` : ''}
    ${receipts.length ? html`<ul class="jr-receipts" aria-label="Comprovantes">${receipts.map((f) => receiptRow(f, { removable }))}</ul>` : ''}
  </div>`;
}

function feedbackBlock(c, audience) {
  if (c.feedback) {
    return html`<div class="jr-feedback">
      <p class="jr-feedback-cap">${audience === 'student' ? 'Retorno da mentora' : 'Retorno enviado'}${c.feedbackByName ? ` · ${c.feedbackByName}` : ''}${c.feedbackAt ? html` · <time datetime="${c.feedbackAt}">${instantDayMonthYear(c.feedbackAt)}</time>` : ''}</p>
      <p class="jr-feedback-text">${c.feedback}</p>
    </div>`;
  }
  return html`<p class="jr-feedback-wait">${audience === 'student' ? 'Aguardando o retorno da sua mentora.' : 'Ainda sem retorno.'}</p>`;
}

/**
 * Um check-in para leitura. `audience`: 'student' (histórico da aluna) ou 'mentora'. `startsOn` (opcional) numera o dia.
 * Mentora: `showStudent`/`showChallenge` põem o nome da aluna / do desafio no cabeçalho; `canFeedback` mostra o botão.
 */
export function checkinArticle(c, { audience = 'mentora', startsOn = null, showStudent = false, showChallenge = false, canFeedback = false, editable = false } = {}) {
  const id = uid('jr-ck');
  const title = startsOn ? dayTitle(startsOn, c.day) : dayMonthYear(c.day);
  const who = showStudent && c.studentName ? html`<a class="jr-checkin-who" href="#/alunas/${encodeURIComponent(c.studentId)}">${c.studentName}</a>` : '';
  return html`<article${attrs({ class: 'jr-checkin', 'aria-labelledby': id, 'data-checkin': c.id })}>
    <header class="jr-checkin-head">
      <div class="jr-checkin-title-wrap">
        ${who || showChallenge ? html`<p class="jr-checkin-context">${who}${who && showChallenge && c.challengeTitle ? html`<span aria-hidden="true"> · </span>` : ''}${showChallenge && c.challengeTitle ? html`<span>${c.challengeTitle}</span>` : ''}</p>` : ''}
        <h3 class="jr-checkin-title" id="${id}">${title}</h3>
      </div>
      <div class="jr-checkin-badges">
        ${c.completed ? badge('Dia cumprido', 'good') : badge('Cumprido: não marcado', 'neutral')}
        ${audience === 'mentora' ? (c.feedback ? badge('Com retorno', 'accent') : badge('Aguardando retorno', 'warn')) : ''}
      </div>
    </header>
    ${c.body ? html`<p class="jr-checkin-body">${c.body}</p>` : html`<p class="muted jr-checkin-body-empty">Sem texto neste dia.</p>`}
    ${linksList(c.links)}
    ${filesBlock(c.files)}
    ${feedbackBlock(c, audience)}
    <p class="jr-checkin-stamp">Registrado em <time datetime="${c.createdAt ?? ''}">${instantDayMonthYear(c.createdAt)}</time>${c.updatedAt && c.updatedAt !== c.createdAt ? html` · atualizado em <time datetime="${c.updatedAt}">${instantDayMonthYear(c.updatedAt)}</time>` : ''}</p>
    ${canFeedback || editable
      ? html`<div class="jr-checkin-actions">
          ${canFeedback ? html`<button${attrs({ type: 'button', class: 'btn btn-primary btn-sm', 'data-action': 'feedback', 'data-checkin': c.id })}>${icon('chat', { size: 15 })}<span>${c.feedback ? 'Editar retorno' : 'Dar retorno'}</span></button>` : ''}
          ${editable ? html`<button${attrs({ type: 'button', class: 'btn btn-ghost btn-sm', 'data-action': 'edit-day', 'data-day': c.day })}>${icon('edit', { size: 15 })}<span>Editar este dia</span></button>` : ''}
        </div>`
      : ''}
  </article>`;
}

// ---------------------------------------------------------------- visualizador de foto

/** Mostra a foto maior num diálogo. O foco volta a quem abriu ao fechar (Esc, botão ou clique no fundo). */
export function openPhotoViewer(file) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const id = uid('jr-viewer');
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog dialog-wide jr-viewer';
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    mount(dialog, html`<div class="dialog-body">
      <h2 id="${id}-title">${file.name}</h2>
      <div class="jr-viewer-frame"><img${attrs({ src: file.url, alt: `Foto enviada: ${file.name}`, decoding: 'async' })}></div>
      <p class="jr-viewer-meta">${formatBytes(file.sizeBytes)}${file.createdAt ? ` · enviada em ${instantDayMonthYear(file.createdAt)}` : ''}</p>
      <div class="dialog-actions">
        ${String(file.url).startsWith('data:') ? '' : html`<a${attrs({ class: 'btn btn-ghost', href: file.url, target: '_blank', rel: 'noopener noreferrer' })}>${icon('external', { size: 16 })}<span>Abrir em nova aba</span></a>`}
        <button type="button" class="btn btn-primary" data-close>Fechar</button>
      </div>
    </div>`);
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      unlockScroll();
      if (opener instanceof HTMLElement) opener.focus();
      resolve();
    });
    document.body.append(dialog);
    lockScroll();
    dialog.showModal();
    dialog.querySelector('[data-close]').focus();
  });
}

// ---------------------------------------------------------------- diálogos da mentora

/** Erro do servidor com a mensagem amigável no banner do diálogo (mantém os erros de campo). */
function friendly(error, overrides = {}) {
  if (!(error instanceof ApiError)) return error;
  const detail = overrides[error.code] ?? journeyErrorMessage(error);
  return new ApiError({ status: error.status >= 500 ? 400 : error.status, code: error.code, detail, errors: error.errors, requestId: error.requestId });
}

function textareaField({ id, name, label, value = '', max, hint, rows = 5, required = false }) {
  return html`<div class="field">
    <label class="field-label" for="${id}">${label}</label>
    <div class="field-control"><textarea${attrs({ id, name, class: 'field-input jr-textarea', rows: String(rows), maxlength: String(max), required, 'aria-required': required ? 'true' : false, 'aria-describedby': `${id}-hint ${id}-error` })}>${value}</textarea></div>
    <p class="field-hint" id="${id}-hint">${hint}</p>
    <p class="field-error" id="${id}-error" role="alert"></p>
  </div>`;
}

/** Retorno da mentora para um check-in. Resolve `{ saved, hadFailure, checkin }` (o check-in devolvido pelo servidor). */
export async function openFeedbackDialog({ api, checkin, studentName }) {
  let result = null;
  const { saved, hadFailure } = await openTrackedFormDialog({
    title: checkin.feedback ? 'Editar retorno' : 'Dar retorno',
    description: `${studentName ? `${studentName} · ` : ''}${dayMonthYear(checkin.day)}. A aluna recebe um aviso e vê o retorno no desafio.`,
    submitLabel: 'Enviar retorno',
    busyLabel: 'Enviando…',
    body: textareaField({ id: 'jr-feedback', name: 'feedback', label: 'Retorno para a aluna', value: checkin.feedback ?? '', max: FEEDBACK_MAX, hint: `Até ${FEEDBACK_MAX.toLocaleString('pt-BR')} caracteres. Substitui o retorno anterior, se houver.`, required: true }),
    validators: { feedback: feedbackError },
    onSubmit: async (values) => {
      try {
        result = await api.post(`/api/v1/mentora/checkins/${encodeURIComponent(checkin.id)}/feedback`, { feedback: values.feedback.trim(), version: checkin.version });
      } catch (error) {
        throw friendly(error, {
          version_conflict: 'A aluna alterou este check-in agora há pouco. Feche esta janela para ver a versão mais recente e envie o retorno de novo.',
        });
      }
    },
  });
  return { saved, hadFailure, checkin: result };
}

function phaseSelect(current) {
  const suggested = Math.min(4, current + 1) === current ? '' : String(Math.min(4, current + 1));
  return html`<div class="field">
    <label class="field-label" for="jr-phase">Nova fase</label>
    <div class="field-control"><select${attrs({ id: 'jr-phase', name: 'phase', class: 'field-input', required: true, 'aria-required': 'true', 'aria-describedby': 'jr-phase-error' })}>
      <option${attrs({ value: '', selected: suggested === '' })}>Escolha a fase</option>
      ${PHASES.map((p) => html`<option${attrs({ value: String(p.phase), selected: String(p.phase) === suggested })}>${phaseTitle(p.phase)}${p.phase === current ? ' (atual)' : ''}</option>`)}
    </select></div>
    <p class="field-error" id="jr-phase-error" role="alert"></p>
  </div>`;
}

/** Alterar a fase da aluna (students.manage). Resolve `{ saved, hadFailure, journey }`. */
export async function openPhaseDialog({ api, studentId, studentName, current }) {
  let result = null;
  const { saved, hadFailure } = await openTrackedFormDialog({
    title: 'Alterar fase',
    description: `${studentName ?? 'A aluna'} está na ${phaseTitle(current)}. A mudança fica no histórico e a aluna recebe um aviso.`,
    submitLabel: 'Registrar fase',
    busyLabel: 'Registrando…',
    className: 'dialog-wide',
    body: html`${phaseSelect(current)}
      ${textareaField({ id: 'jr-phase-note', name: 'note', label: 'Observação (opcional)', max: PHASE_NOTE_MAX, rows: 4, hint: html`<strong>A aluna vê esta observação</strong> na jornada dela, junto com a fase e a data. Até ${PHASE_NOTE_MAX.toLocaleString('pt-BR')} caracteres.` })}`,
    validators: {
      note: phaseNoteError,
      phase: (value) => {
        const picked = Number(value);
        if (!picked) return 'Escolha a nova fase.';
        if (picked === current) return 'Ela já está nesta fase. Escolha outra.';
        return null;
      },
    },
    onSubmit: async (values) => {
      const phase = Number(values.phase);
      const note = values.note.trim();
      try {
        result = await api.post(`/api/v1/mentora/students/${encodeURIComponent(studentId)}/phase`, note ? { phase, note } : { phase });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'same_phase') {
          throw new ApiError({ status: 409, code: 'same_phase', detail: journeyErrorMessage(error), errors: [{ field: 'phase', message: 'Ela já está nesta fase. Escolha outra.' }] });
        }
        throw friendly(error);
      }
    },
  });
  return { saved, hadFailure, journey: result };
}
