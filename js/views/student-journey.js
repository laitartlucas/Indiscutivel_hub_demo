import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { buildQuery } from '../lib/query.js';
import { checkinsHash, journeyErrorMessage } from '../lib/journey.js';
import { icon } from '../ih-icons.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { checkinArticle, journeyCard, openFeedbackDialog, openPhaseDialog, openPhotoViewer } from './journey-ui.js';

// Perfil da aluna (mentora): bloco "Jornada" (fase atual, Alterar fase com observação, histórico) e bloco "Check-ins"
// (os mais recentes da aluna em todos os desafios, com fotos, links, comprovantes e o retorno).

const RECENT_LIMIT = 5;

function retry(action, message) {
  return html`<div class="stack">${alert({ tone: 'danger', message })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', small: true, extra: { 'data-action': action } })}</div></div>`;
}

/** Monta o bloco Jornada em `host`. `can(key)` diz o que a pessoa pode (students.manage libera "Alterar fase"). */
export function mountStudentJourney({ host, api, student, can }) {
  const base = `/api/v1/mentora/students/${encodeURIComponent(student.id)}`;
  let disposed = false;
  let seq = 0;
  let journey = null;
  let busy = false;

  mount(host, html`<div id="sj-body" aria-busy="true">${skeleton(3)}</div>`);
  const body = host.querySelector('#sj-body');

  function paint() {
    const action = can('students.manage') ? button({ label: 'Alterar fase', variant: 'ghost', small: true, iconStart: icon('edit', { size: 15 }), extra: { 'data-action': 'sj-change' } }) : '';
    mount(body, journeyCard(journey, { title: 'Jornada', headingId: 'sj-title', action, audience: 'mentora' }));
  }

  async function load() {
    const mine = ++seq;
    body.setAttribute('aria-busy', 'true');
    try {
      const result = await api.get(`${base}/journey`);
      if (disposed || mine !== seq) return;
      journey = result;
      paint();
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(body, html`<section class="growth-card" aria-labelledby="sj-title"><div class="growth-card-head"><h2 id="sj-title">Jornada</h2></div>${retry('sj-retry', journeyErrorMessage(error))}</section>`);
    }
    body.setAttribute('aria-busy', 'false');
  }

  async function change() {
    if (busy || !journey) return;
    busy = true;
    try {
      const { saved, hadFailure, journey: updated } = await openPhaseDialog({ api, studentId: student.id, studentName: student.name, current: journey.current?.phase ?? 1 });
      if (disposed) return;
      if (saved) {
        if (updated?.current) journey = { ...journey, ...updated };
        toast(`Fase registrada: ${journey.current.label}. ${student.name} foi avisada.`, { tone: 'success' });
        paint();
        if (!updated?.current) await load();
        body.querySelector('[data-action="sj-change"]')?.focus();
      } else if (hadFailure) await load();
    } finally {
      busy = false;
    }
  }

  body.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'sj-retry') load();
    else if (action === 'sj-change') change();
  });

  load();
  return () => {
    disposed = true;
  };
}

/** Monta o bloco Check-ins (os mais recentes) em `host`. Retorno só com challenges.manage. */
export function mountStudentCheckins({ host, api, student, can }) {
  let disposed = false;
  let seq = 0;
  let rows = [];
  let total = 0;
  let busy = false;
  const canFeedback = can('challenges.manage');
  const allHref = checkinsHash({ studentId: student.id });

  mount(host, html`<section class="growth-card jr-ck-card" aria-labelledby="sck-title">
    <div class="growth-card-head"><h2 id="sck-title">Check-ins</h2><a class="jr-head-link" href="${allHref}">Ver todos${icon('arrowRight', { size: 15 })}</a></div>
    <div id="sck-body" class="jr-ck-body" aria-busy="true">${skeleton(3)}</div>
  </section>`);
  const body = host.querySelector('#sck-body');

  function paint() {
    if (rows.length === 0) {
      mount(body, emptyState({ title: 'Nenhum check-in ainda', message: `Quando ${student.name} registrar check-ins nos desafios, eles aparecem aqui para você ler e dar retorno.` }));
      return;
    }
    mount(body, html`<p class="growth-card-note">${total > rows.length ? `Os ${rows.length} mais recentes de ${total}.` : `${total} ${total === 1 ? 'check-in' : 'check-ins'}.`}</p>
      <div class="jr-checkins">${rows.map((c) => checkinArticle(c, { audience: 'mentora', showChallenge: true, canFeedback }))}</div>`);
  }

  async function load() {
    const mine = ++seq;
    body.setAttribute('aria-busy', 'true');
    try {
      const result = await api.get(`/api/v1/mentora/checkins${buildQuery({ studentId: student.id, limit: RECENT_LIMIT, offset: 0 })}`);
      if (disposed || mine !== seq) return;
      rows = Array.isArray(result?.rows) ? result.rows : [];
      total = Number.isInteger(result?.total) ? result.total : rows.length;
      paint();
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(body, retry('sck-retry', journeyErrorMessage(error)));
    }
    body.setAttribute('aria-busy', 'false');
  }

  async function feedback(id) {
    const checkin = rows.find((r) => r.id === id);
    if (!checkin || busy) return;
    busy = true;
    try {
      const { saved, hadFailure, checkin: updated } = await openFeedbackDialog({ api, checkin, studentName: student.name });
      if (disposed) return;
      if (saved) {
        toast(`Retorno enviado. ${student.name} foi avisada.`, { tone: 'success' });
        if (updated?.id) {
          rows = rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
          paint();
        } else await load();
        body.querySelector(`[data-action="feedback"][data-checkin="${CSS.escape(id)}"]`)?.focus();
      } else if (hadFailure) await load();
    } finally {
      busy = false;
    }
  }

  body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'sck-retry') load();
    else if (action === 'feedback') feedback(target.dataset.checkin);
    else if (action === 'view-photo') {
      const file = rows.flatMap((r) => r.files ?? []).find((f) => f.id === target.dataset.file);
      if (file) openPhotoViewer(file);
    }
  });

  load();
  return () => {
    disposed = true;
  };
}
