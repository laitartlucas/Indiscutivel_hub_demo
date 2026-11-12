import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { CHECKIN_STATUS_FILTERS, checkinsHash, isCheckinStatus, journeyErrorMessage } from '../lib/journey.js';
import { can } from '../lib/permissions.js';
import { buildQuery, hashParam, pageInfo } from '../lib/query.js';
import { pageOffset } from '../lib/list-state.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, selectField, skeleton } from '../ui/components.js';
import { pager } from '../ui/table.js';
import { toast } from '../ui/toast.js';
import { checkinArticle, openFeedbackDialog, openPhotoViewer } from './journey-ui.js';

// Check-ins (mentora, #/gestao/checkins): todos os check-ins das alunas, filtrados por desafio, aluna e situação
// (aguardando retorno / com retorno). Cada check-in se lê sozinho (texto, links, fotos, comprovantes, datas) e recebe
// retorno de quem tem challenges.manage. Os filtros ficam no endereço, para os links de Participantes e do perfil.

const LIMIT = 10;

function statusSegments(current) {
  return html`<span class="segments-label" id="mck-status-label">Situação</span><div class="segments" role="group" aria-labelledby="mck-status-label">${CHECKIN_STATUS_FILTERS.map(
    (s) => html`<button${attrs({ type: 'button', class: 'segment', 'data-status': s.id, 'aria-pressed': String(s.id === current) })}>${s.label}</button>`,
  )}</div>`;
}

/** Opções de um filtro; um valor vindo do endereço que não está na lista entra como "selecionado" para não sumir. */
function optionsWith(list, current, allLabel, unknownLabel) {
  const options = [{ value: '', label: allLabel }, ...list];
  if (current && !list.some((o) => o.value === current)) options.splice(1, 0, { value: current, label: unknownLabel });
  return options;
}

export function renderMentoraCheckins({ root, session, api, navigate }) {
  const user = session.state.user;
  const canFeedback = can(user, 'challenges.manage');
  let disposed = false;
  let seq = 0;
  let busy = false;
  let rows = [];
  let total = 0;
  let challenges = [];
  let students = [];
  let state = {
    challengeId: hashParam('desafio'),
    studentId: hashParam('aluna'),
    status: isCheckinStatus(hashParam('situacao')) ? hashParam('situacao') : '',
    offset: 0,
  };

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'mg-checkins',
    heading: 'Check-ins',
    eyebrow: 'Crescimento',
    subtitle: 'Leia o que cada aluna registrou nos desafios e responda com o seu retorno.',
    content: html`<div class="toolbar jr-toolbar">
        <div class="toolbar-actions jr-filters">
          <div id="mck-challenge-host">${selectField({ id: 'mck-challenge', label: 'Desafio', value: state.challengeId, options: optionsWith([], state.challengeId, 'Todos os desafios', 'Desafio selecionado') })}</div>
          <div id="mck-student-host">${selectField({ id: 'mck-student', label: 'Aluna', value: state.studentId, options: optionsWith([], state.studentId, 'Todas as alunas', 'Aluna selecionada') })}</div>
          ${button({ label: 'Limpar filtros', variant: 'ghost', id: 'mck-clear', extra: { hidden: true } })}
        </div>
      </div>
      <div class="segments-row" id="mck-status">${statusSegments(state.status)}</div>
      <div id="mck-list" aria-busy="true">${skeleton(4)}</div>`,
  });

  const list = root.querySelector('#mck-list');
  const challengeHost = root.querySelector('#mck-challenge-host');
  const studentHost = root.querySelector('#mck-student-host');
  const statusHost = root.querySelector('#mck-status');
  const clearButton = root.querySelector('#mck-clear');
  const hasFilters = () => Boolean(state.challengeId || state.studentId || state.status);

  function paintFilters() {
    const focus = document.activeElement?.id;
    mount(challengeHost, selectField({ id: 'mck-challenge', label: 'Desafio', value: state.challengeId, options: optionsWith(challenges, state.challengeId, 'Todos os desafios', rows.find((r) => r.challengeId === state.challengeId)?.challengeTitle ?? 'Desafio selecionado') }));
    mount(studentHost, selectField({ id: 'mck-student', label: 'Aluna', value: state.studentId, options: optionsWith(students, state.studentId, 'Todas as alunas', rows.find((r) => r.studentId === state.studentId)?.studentName ?? 'Aluna selecionada') }));
    const focusedStatus = statusHost.contains(document.activeElement) ? document.activeElement.dataset.status : null;
    mount(statusHost, statusSegments(state.status));
    if (focusedStatus !== null && focusedStatus !== undefined) statusHost.querySelector(`[data-status="${CSS.escape(focusedStatus)}"]`)?.focus();
    if (focus === 'mck-challenge' || focus === 'mck-student') root.querySelector(`#${focus}`)?.focus();
    clearButton.hidden = !hasFilters();
  }

  function syncAddress() {
    window.history.replaceState(null, '', checkinsHash(state));
  }

  function paintList() {
    if (rows.length === 0) {
      mount(list, hasFilters()
        ? emptyState({ iconName: 'search', title: 'Nenhum check-in com esses filtros', message: 'Troque o desafio, a aluna ou a situação, ou limpe os filtros.', action: button({ label: 'Limpar filtros', variant: 'ghost', extra: { 'data-action': 'clear' } }) })
        : emptyState({ iconName: 'desafios', title: 'Nenhum check-in ainda', message: 'Quando as alunas registrarem o dia nos desafios, os check-ins aparecem aqui para você ler e dar retorno.' }));
      return;
    }
    mount(list, html`<div class="jr-checkins" aria-label="Check-ins">${rows.map((c) => checkinArticle(c, { audience: 'mentora', showStudent: true, showChallenge: true, canFeedback }))}</div>
      ${pager({ info: pageInfo({ limit: LIMIT, offset: state.offset, total }), total })}`);
  }

  async function load() {
    const mine = ++seq;
    list.setAttribute('aria-busy', 'true');
    try {
      const result = await api.get(`/api/v1/mentora/checkins${buildQuery({ challengeId: state.challengeId, studentId: state.studentId, status: state.status, limit: LIMIT, offset: state.offset })}`);
      if (disposed || mine !== seq) return;
      rows = Array.isArray(result?.rows) ? result.rows : [];
      total = Number.isInteger(result?.total) ? result.total : rows.length;
      // Página esvaziou (retornos dados em outra aba, por exemplo): volta à última página que existe.
      if (rows.length === 0 && state.offset > 0 && total > 0) {
        state = { ...state, offset: Math.floor((total - 1) / LIMIT) * LIMIT };
        return void load();
      }
      paintList();
      paintFilters();
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(list, html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar os check-ins', message: journeyErrorMessage(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`);
    }
    list.setAttribute('aria-busy', 'false');
  }

  /** Listas dos filtros: desafios publicados (gestão) e alunas. Falhar aqui não impede de ler os check-ins. */
  async function loadChoices() {
    const [chal, studs] = await Promise.allSettled([
      api.get('/api/v1/mentora/challenges'),
      (async () => {
        const all = [];
        for (let offset = 0; offset < 1000; offset += 100) {
          const page = await api.get(`/api/v1/mentora/students${buildQuery({ sort: 'name', order: 'asc', limit: 100, offset })}`);
          all.push(...(page?.data ?? []));
          if (!page?.page || all.length >= page.page.total || (page.data ?? []).length === 0) break;
        }
        return all;
      })(),
    ]);
    if (disposed) return;
    if (chal.status === 'fulfilled' && Array.isArray(chal.value?.data)) {
      challenges = chal.value.data.filter((c) => c.status !== 'draft').map((c) => ({ value: c.id, label: c.title }));
    }
    if (studs.status === 'fulfilled') students = studs.value.map((s) => ({ value: s.id, label: s.name }));
    paintFilters();
  }

  function setFilters(patch) {
    state = { ...state, ...patch, offset: 0 };
    syncAddress();
    paintFilters();
    load();
  }

  async function feedback(id) {
    const checkin = rows.find((r) => r.id === id);
    if (!checkin || busy) return;
    busy = true;
    try {
      const { saved, hadFailure, checkin: updated } = await openFeedbackDialog({ api, checkin, studentName: checkin.studentName });
      if (disposed) return;
      if (saved) {
        toast(`Retorno enviado. ${checkin.studentName ?? 'A aluna'} foi avisada.`, { tone: 'success' });
        if (updated?.id && state.status !== 'pending_feedback') {
          rows = rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
          paintList();
          list.querySelector(`[data-action="feedback"][data-checkin="${CSS.escape(id)}"]`)?.focus();
        } else {
          // No filtro "Aguardando retorno" o check-in respondido sai da lista: recarrega e leva o foco ao próximo.
          await load();
          list.querySelector('[data-action="feedback"]')?.focus();
        }
      } else if (hadFailure) await load();
    } finally {
      busy = false;
    }
  }

  challengeHost.addEventListener('change', (event) => {
    if (event.target.id === 'mck-challenge') setFilters({ challengeId: event.target.value });
  });
  studentHost.addEventListener('change', (event) => {
    if (event.target.id === 'mck-student') setFilters({ studentId: event.target.value });
  });
  statusHost.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-status]');
    if (!choice || choice.getAttribute('aria-pressed') === 'true') return;
    setFilters({ status: choice.dataset.status });
  });
  clearButton.addEventListener('click', () => {
    setFilters({ challengeId: '', studentId: '', status: '' });
    root.querySelector('#mck-challenge')?.focus();
  });
  list.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      state = { ...state, offset: pageOffset(pageButton.dataset.page, state.offset, LIMIT) };
      load();
      root.querySelector('h1')?.scrollIntoView?.({ block: 'start' });
      return;
    }
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'retry') load();
    else if (action === 'clear') {
      setFilters({ challengeId: '', studentId: '', status: '' });
      root.querySelector('#mck-challenge')?.focus();
    } else if (action === 'feedback') feedback(target.dataset.checkin);
    else if (action === 'view-photo') {
      const file = rows.flatMap((r) => r.files ?? []).find((f) => f.id === target.dataset.file);
      if (file) openPhotoViewer(file);
    }
  });

  clearButton.hidden = !hasFilters();
  load();
  loadChoices();

  return () => {
    disposed = true;
    dispose();
  };
}
