import { ApiError, describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { CHALLENGE_STATUS_META, mentoraMeta, mentoraStatus, participantsText, xpText } from '../lib/growth.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { can } from '../lib/permissions.js';
import { openChallengeEditor } from './challenge-editor.js';

/** Gestão de desafios (mentora, kit M-Desafios): cartões com situação, adesão e conclusão média; editor em gaveta. */

function retryBlock(error) {
  return html`<div class="stack">${alert({ tone: 'danger', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;
}

/** Dia local de Brasília (AAAA-MM-DD), o mesmo critério do servidor, para sugerir a data de início. */
function todayInBrasilia() {
  return new Date(Date.now() - 180 * 60_000).toISOString().slice(0, 10);
}

function row(c, canSeeStudents) {
  const key = mentoraStatus(c);
  const meta = CHALLENGE_STATUS_META[key];
  const tone = meta.tone;
  const none = c.status === 'draft' || c.participants === 0 || c.avgPct === null || c.avgPct === undefined;
  return html`<li${attrs({ class: `mg-chal-row${c.achievement ? ' is-premium' : ''}`, 'data-chal': c.id })}>
    <div class="mg-chal-main">
      <div class="mg-chal-titleline"><h3 class="mg-chal-title"><button type="button" class="mg-chal-open" data-action="open" data-id="${c.id}">${c.title}</button></h3><span class="mg-status mg-status--${tone}">${meta.label}</span></div>
      <p class="mg-chal-meta">${mentoraMeta(c)}</p>
      ${c.status === 'draft' || !canSeeStudents ? '' : html`<a class="mg-chal-link" href="#/gestao/desafios/${encodeURIComponent(c.id)}">Participantes e check-ins${icon('arrowRight', { size: 14 })}<span class="sr-only"> de ${c.title}</span></a>`}
    </div>
    <div class="mg-stat"><span class="mg-label">Participantes</span><span class="mg-value">${participantsText(c)}</span></div>
    <div class="mg-stat"><span class="mg-label">Conclusão média</span>${none
      ? html`<span class="mg-value">—</span>`
      : html`<div class="mg-bar-line"><div class="mg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${c.avgPct}" aria-label="Conclusão média de ${c.title}"><div${attrs({ class: 'mg-bar-fill', 'data-w': String(c.avgPct) })}></div></div><span class="mg-pct">${c.avgPct}%</span></div>`}</div>
    <span class="mg-chal-xp">${c.rewardXp > 0 ? xpText(c.rewardXp) : c.achievement ? 'Conquista' : 'Sem XP'}</span>
  </li>`;
}

export function renderMentoraChallenges({ root, session, api, navigate }) {
  let disposed = false;
  let gen = 0;
  let data = null;
  let opening = false;

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'mg-challenges',
    heading: 'Desafios',
    eyebrow: 'Crescimento',
    subtitle: 'Crie ciclos de ação para suas turmas e acompanhe a adesão.',
    actions: button({ label: 'Novo desafio', id: 'chal-new', iconStart: icon('plus', { size: 16, stroke: 2 }) }),
    content: html`<div class="growth" id="mg-chal-body" aria-busy="true">${skeleton(4)}</div>`,
  });
  const body = root.querySelector('#mg-chal-body');

  function paint() {
    if (data.data.length === 0) {
      mount(body, emptyState({
        iconName: 'desafios',
        title: 'Nenhum desafio criado ainda',
        message: 'Um desafio é um ciclo curto de ações, com recompensa em XP. Salve como rascunho e publique quando estiver pronto: as alunas são avisadas.',
        action: button({ label: 'Novo desafio', extra: { 'data-action': 'create' } }),
      }));
      return;
    }
    mount(body, html`<ul class="mg-chal-list" aria-label="Desafios da mentoria">${data.data.map((c) => row(c, can(session.state.user, 'students.view')))}</ul>`);
    applySizes(body);
  }

  async function load({ focusId = null } = {}) {
    const id = ++gen;
    body.setAttribute('aria-busy', 'true');
    if (!data) mount(body, skeleton(4));
    try {
      const result = await api.get('/api/v1/mentora/challenges');
      if (disposed || id !== gen) return;
      data = result;
      paint();
      if (focusId) body.querySelector(`[data-action="open"][data-id="${CSS.escape(focusId)}"]`)?.focus();
    } catch (error) {
      if (disposed || id !== gen) return;
      data = null;
      mount(body, retryBlock(error));
    }
    body.setAttribute('aria-busy', 'false');
  }

  const achievementChoices = () => (data?.achievementChoices ?? []).map((a) => ({ id: a.id, title: a.title }));

  async function loadChoices() {
    // Conquistas que um desafio pode conceder ("Ao concluir o desafio vinculado"); falhar aqui não impede de criar o desafio.
    try {
      const list = await api.get('/api/v1/mentora/achievements');
      if (data) data.achievementChoices = list.data.filter((a) => a.ruleKind === 'challenge_award');
    } catch {
      if (data) data.achievementChoices = [];
    }
  }

  async function openEditor(id) {
    if (opening || !data) return;
    opening = true;
    try {
      let challenge = null;
      if (id) {
        try {
          challenge = await api.get(`/api/v1/mentora/challenges/${id}`);
        } catch (error) {
          if (disposed) return;
          if (error instanceof ApiError && error.status === 404) {
            toast('Este desafio não existe mais.', { tone: 'danger' });
            await load();
          } else toast(describeError(error), { tone: 'danger' });
          return;
        }
      }
      await loadChoices();
      if (disposed) return;
      const { changed } = await openChallengeEditor({ api, challenge, classes: data.classes, achievements: achievementChoices(), todayIso: todayInBrasilia() });
      if (disposed) return;
      if (changed) await load({ focusId: id });
    } finally {
      opening = false;
    }
  }

  root.querySelector('#chal-new').addEventListener('click', () => openEditor(null));
  body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, id } = target.dataset;
    if (action === 'retry') load();
    else if (action === 'create') openEditor(null);
    else if (action === 'open') openEditor(id);
  });

  load();

  return () => {
    disposed = true;
    dispose();
  };
}
