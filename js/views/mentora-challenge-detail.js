import { ApiError } from '../lib/api.js';
import { APP_NAME } from '../config.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { dayMonthYear, instantDayMonthYear } from '../lib/growth.js';
import { PARTICIPANT_FILTERS, checkinsHash, journeyErrorMessage, participantCounts, participantStatus, phaseTitle } from '../lib/journey.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, emptyState, skeleton } from '../ui/components.js';
import { dataTable } from '../ui/table.js';

// Detalhe do desafio (mentora, #/gestao/desafios/:id): Participantes. Todas as alunas a quem o desafio se destina, com
// a situação (concluiu, em dia, atrasada, não começou), quantos check-ins, o último dia registrado e os retornos
// pendentes; cada linha leva aos check-ins dela já filtrados. Só sinais de mentoria: nada do CRM das alunas.

const STATUS_LABEL = { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' };

function filterSegments(counts, current) {
  return html`<span class="segments-label" id="mcd-filter-label">Situação</span><div class="segments" role="group" aria-labelledby="mcd-filter-label">${PARTICIPANT_FILTERS.map((f) => {
    const n = counts[f.id] ?? 0;
    return html`<button${attrs({ type: 'button', class: 'segment', 'data-filter': f.id, 'aria-pressed': String(f.id === current), 'aria-label': `${f.label}, ${n}` })}>${f.label}<span class="segment-count" aria-hidden="true">${n}</span></button>`;
  })}</div>`;
}

function columns(challengeId) {
  return [
    { key: 'studentName', label: 'Aluna', render: (r) => html`<a class="mp-student" href="#/alunas/${encodeURIComponent(r.studentId)}"><span class="mp-student-text"><span class="mp-student-name">${r.studentName}</span></span></a>` },
    { key: 'status', label: 'Situação', nowrap: true, render: (r) => {
      const meta = participantStatus(r.status);
      return html`${badge(meta.label, meta.tone)}${r.completedAt ? html`<span class="jr-cell-sub">em ${instantDayMonthYear(r.completedAt)}</span>` : ''}`;
    } },
    { key: 'phase', label: 'Fase', nowrap: true, optional: true, render: (r) => (Number.isInteger(r.phase) ? phaseTitle(r.phase) : '—') },
    { key: 'checkins', label: 'Check-ins', nowrap: true, align: 'end', render: (r) => String(r.checkins ?? 0) },
    { key: 'lastCheckinDay', label: 'Último check-in', nowrap: true, render: (r) => (r.lastCheckinDay ? dayMonthYear(r.lastCheckinDay) : html`<span class="mp-muted">Nenhum</span>`) },
    { key: 'pendingFeedback', label: 'Sem retorno', nowrap: true, align: 'end', render: (r) => (r.pendingFeedback > 0 ? badge(String(r.pendingFeedback), 'warn') : html`<span class="mp-muted">0</span>`) },
    { key: 'actions', label: 'Ações', nowrap: true, render: (r) => (r.checkins > 0
      ? html`<a class="btn btn-ghost btn-sm" href="${checkinsHash({ challengeId, studentId: r.studentId })}" aria-label="Ver check-ins de ${r.studentName}">Ver check-ins</a>`
      : html`<span class="mp-muted">—</span>`) },
  ];
}

export function renderMentoraChallengeDetail({ root, session, api, navigate, params }) {
  const id = params.id;
  let disposed = false;
  let seq = 0;
  let data = null;
  let filter = '';

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'mg-challenges',
    heading: 'Desafio',
    eyebrow: html`Crescimento · <a class="back-link" href="#/gestao/desafios">← Desafios</a>`,
    subtitle: html`<span id="mcd-subtitle"></span>`,
    actions: html`<a class="btn btn-ghost" href="${checkinsHash({ challengeId: id })}">${icon('check', { size: 16, stroke: 2 })}<span>Check-ins deste desafio</span></a>`,
    content: html`<div class="growth" id="mcd-body" aria-busy="true">${skeleton(5)}</div>`,
  });
  const body = root.querySelector('#mcd-body');
  const h1 = root.querySelector('h1');
  const subtitle = root.querySelector('#mcd-subtitle');

  function paintTable() {
    const host = body.querySelector('#mcd-table');
    if (!host) return;
    const rows = data.rows.filter((r) => !filter || (r.status ?? 'not_started') === filter);
    mount(host, rows.length === 0
      ? emptyState({ title: filter ? 'Nenhuma aluna nesta situação' : 'Nenhuma aluna neste desafio', message: filter ? 'Escolha outra situação acima.' : 'O desafio ainda não se destina a nenhuma aluna ativa.' })
      : dataTable({ caption: `Participantes de ${data.challenge.title}`, columns: columns(id), rows, rowKey: (r) => r.studentId, dense: true }));
  }

  function paint() {
    const c = data.challenge;
    if (h1) h1.textContent = c.title;
    document.title = `${c.title} — ${APP_NAME}`;
    mount(subtitle, html`${STATUS_LABEL[c.status] ?? ''}${c.startsOn ? ` · ${dayMonthYear(c.startsOn)} a ${dayMonthYear(c.endsOn)}` : ''}`);
    const counts = participantCounts(data.rows);
    const pending = data.rows.reduce((sum, r) => sum + (Number(r.pendingFeedback) || 0), 0);
    mount(body, html`<section class="growth-card" aria-labelledby="mcd-title">
      <div class="growth-card-head"><h2 id="mcd-title">Participantes</h2><span class="growth-card-note">${counts[''] === 1 ? '1 aluna' : `${counts['']} alunas`} · ${counts.completed} ${counts.completed === 1 ? 'concluiu' : 'concluíram'}${pending ? ` · ${pending} ${pending === 1 ? 'check-in' : 'check-ins'} sem retorno` : ''}</span></div>
      <p class="jr-hint">Em dia: registrou check-in nos últimos 3 dias. Atrasada: inscrita e sem check-in há mais de 3 dias, com o desafio em andamento. Não começou: ainda não entrou ou não registrou nada.</p>
      <div class="segments-row" id="mcd-filters">${filterSegments(counts, filter)}</div>
      <div id="mcd-table"></div>
    </section>`);
    paintTable();
  }

  async function load() {
    const mine = ++seq;
    body.setAttribute('aria-busy', 'true');
    try {
      const result = await api.get(`/api/v1/mentora/challenges/${encodeURIComponent(id)}/participants`);
      if (disposed || mine !== seq) return;
      if (!result?.challenge || !Array.isArray(result.rows)) throw new ApiError({ status: 0, code: 'invalid_response', detail: 'Resposta inesperada do servidor. Tente de novo em instantes.' });
      data = result;
      paint();
    } catch (error) {
      if (disposed || mine !== seq) return;
      if (error instanceof ApiError && error.status === 404) {
        mount(body, emptyState({ iconName: 'desafios', title: 'Desafio não encontrado', message: 'Ele pode ter sido excluído ou o endereço está incorreto.', action: html`<a class="btn btn-primary" href="#/gestao/desafios">Voltar para Desafios</a>` }));
      } else if (error instanceof ApiError && error.status === 403) {
        mount(body, emptyState({ iconName: 'lock', title: 'Sem acesso aos participantes', message: 'Ver as alunas de um desafio exige a permissão de ver alunas. Peça à mentora para liberar no seu papel.' }));
      } else {
        mount(body, html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar os participantes', message: journeyErrorMessage(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`);
      }
    }
    body.setAttribute('aria-busy', 'false');
  }

  body.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) return void load();
    const choice = event.target.closest('[data-filter]');
    if (!choice || !data || choice.dataset.filter === filter) return;
    filter = choice.dataset.filter;
    for (const b of body.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed', String(b === choice));
    paintTable();
  });

  load();
  return () => {
    disposed = true;
    dispose();
  };
}
