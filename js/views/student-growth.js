import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { activityText, goalsSentence, levelText, miniBars, sessionLine, sessionWhen } from '../lib/mentora.js';
import { icon } from '../ih-icons.js';
import { applySizes } from '../lib/widths.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { confirmCancelSession, confirmDeleteNote, NOTE_MAX, noteError, openNoteDialog, openSessionDialog } from './mentoring-dialogs.js';

// Seções de mentoria do Perfil da aluna (kit M-PerfilAluna): KPIs, atividade, desafios, atividades recentes, metas,
// conquistas, Notas privadas e Próxima sessão. Só sinais de MENTORIA: nenhum R$ nem dado do CRM da aluna.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' });
const DAY_HOUR = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const STATUS_TEXT = { scheduled: 'Marcada', done: 'Realizada', cancelled: 'Cancelada' };

const isGrowth = (v) => !!v && typeof v === 'object' && !!v.level && !!v.goals && !!v.achievements && Array.isArray(v.recent) && Array.isArray(v.challenges) && !!v.activity;

function retry(which, message = 'Não foi possível carregar este cartão.') {
  return html`<div class="stack">${alert({ tone: 'danger', message })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', small: true, extra: { 'data-action': 'retry', 'data-which': which } })}</div></div>`;
}

function kpi({ label, value, pct, note, dark = false, id }) {
  return html`<div${attrs({ class: `mp-pkpi${dark ? ' is-dark' : ''}`, role: 'group', 'aria-label': label, 'data-kpi': id })}>
    <span class="mp-pkpi-label">${label}</span>
    <span class="mp-pkpi-value">${value}</span>
    ${pct === null ? '' : html`<div class="mp-track" aria-hidden="true"><div class="mp-fill" data-w="${pct}"></div></div>`}
    <span class="mp-pkpi-note">${note}</span>
  </div>`;
}

function renderKpis(g) {
  const goalsPct = g.goals.total ? Math.round((g.goals.ok / g.goals.total) * 100) : 0;
  const achPct = g.achievements.total ? Math.round((g.achievements.unlocked / g.achievements.total) * 100) : 0;
  return html`${kpi({
      id: 'level',
      label: levelText(g.level.n).toUpperCase(),
      value: `${g.xp.toLocaleString('pt-BR')} XP`,
      pct: g.progressPct,
      note: g.next ? `${g.next.missing.toLocaleString('pt-BR')} XP para o ${levelText(g.next.n)} · ${g.level.name}` : `${g.level.name} · nível máximo`,
      dark: true,
    })}
    ${kpi({ id: 'month-xp', label: 'XP DO MÊS', value: `+${g.xpMonth.toLocaleString('pt-BR')}`, pct: null, note: 'pontos ganhos neste mês' })}
    ${kpi({ id: 'goals', label: 'METAS DO MÊS', value: g.goals.total ? `${g.goals.ok} de ${g.goals.total}` : '—', pct: g.goals.total ? goalsPct : null, note: goalsSentence(g.goals) })}
    ${kpi({ id: 'achievements', label: 'CONQUISTAS', value: `${g.achievements.unlocked} de ${g.achievements.total}`, pct: achPct, note: 'desbloqueadas' })}
    ${kpi({ id: 'days', label: 'DIAS ATIVOS', value: `${g.activity.activeDays14} de 14`, pct: Math.round((g.activity.activeDays14 / 14) * 100), note: `${plural(g.activity.activeDays28, 'dia', 'dias')} com atividade em 28 dias` })}`;
}

function renderActivity(g) {
  const days = g.activity.last14;
  const total = days.reduce((sum, n) => sum + n, 0);
  return html`<div class="dash-card-head"><h2 id="pg-activity-title">Atividade</h2><span class="mp-muted">Últimos 14 dias</span></div>
    ${total === 0
      ? emptyState({ title: 'Sem atividade nos últimos 14 dias.', message: 'Quando ela usar o Hub, os dias com atividade aparecem aqui.' })
      : html`<svg class="mp-bars-mini mp-bars-big" width="280" height="64" viewBox="0 0 70 22" preserveAspectRatio="none" role="img" aria-label="${activityText(days)}">${miniBars(days).map(
          (b) => html`<rect${attrs({ class: b.on ? 'is-on' : 'is-off', x: String(b.x), y: String(b.y), width: String(b.w), height: String(b.h), rx: '1' })}></rect>`,
        )}</svg>
        <p class="mp-bars-axis" aria-hidden="true"><span>há 14 dias</span><span>Hoje</span></p>`}
    <p class="mp-muted">Último acesso: <strong>${g.lastAccessAt ? DAY_HOUR.format(new Date(g.lastAccessAt)) : 'nunca acessou'}</strong></p>`;
}

function renderChallenges(g) {
  return html`<div class="dash-card-head"><h2 id="pg-challenges-title">Desafios</h2><span class="mp-muted">${g.challenges.length ? plural(g.challenges.length, 'participação', 'participações') : ''}</span></div>
    ${g.challenges.length === 0
      ? emptyState({ title: 'Nenhum desafio ainda.', message: 'Quando ela participar de um desafio, o andamento aparece aqui.' })
      : html`<ul class="mp-challenges" aria-labelledby="pg-challenges-title">${g.challenges.map(
          (c) => html`<li class="mp-challenge">
            <p class="mp-challenge-head"><strong>${c.title}</strong><span class="mp-chip">${c.state === 'completed' ? 'Concluído' : c.state === 'ended' ? 'Encerrado' : 'Em andamento'}</span></p>
            <div class="mp-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${c.pct}" aria-label="${c.title}: ${c.pct}% concluído"><div class="mp-fill" data-w="${c.pct}"></div></div>
            <p class="mp-muted">${c.done} de ${c.total} ${c.total === 1 ? 'ação' : 'ações'} · ${c.pct}%</p>
          </li>`,
        )}</ul>`}`;
}

function renderRecent(g) {
  return html`<h2 id="pg-recent-title">Atividades recentes</h2>
    ${g.recent.length === 0
      ? emptyState({ title: 'Nada por aqui ainda.', message: 'As ações dela no Hub aparecem aqui, sem mostrar o conteúdo.' })
      : html`<ul class="mp-recent" aria-labelledby="pg-recent-title">${g.recent.map(
          (r) => html`<li><span class="mp-recent-dot" aria-hidden="true"></span><span class="mp-recent-text"><span class="mp-recent-label">${r.label}</span><span class="mp-muted">${DAY_HOUR.format(new Date(r.occurredAt))} · +${r.points} XP</span></span></li>`,
        )}</ul>`}`;
}

function renderGoals(g) {
  const pct = g.goals.total ? Math.round((g.goals.ok / g.goals.total) * 100) : 0;
  return html`<h2 id="pg-goals-title">Metas do mês</h2>
    ${g.goals.total === 0
      ? emptyState({ title: 'Sem metas neste mês.', message: 'Ela ainda não definiu metas para este mês.' })
      : html`<p class="mp-goals-count"><strong>${g.goals.ok} de ${g.goals.total}</strong> <span class="mp-muted">atingidas ou no ritmo</span></p>
        <div class="mp-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Metas atingidas ou no ritmo: ${g.goals.ok} de ${g.goals.total}"><div class="mp-fill" data-w="${pct}"></div></div>
        <p class="mp-muted">Por privacidade, a mentoria vê só a contagem. Os valores das metas ficam com a aluna.</p>`}`;
}

function renderAchievements(g) {
  const items = g.achievements.items;
  return html`<div class="dash-card-head"><h2 id="pg-ach-title">Conquistas</h2><span class="mp-muted">${g.achievements.unlocked} de ${g.achievements.total}</span></div>
    ${items.length === 0
      ? emptyState({ title: 'Nenhuma conquista ainda.', message: 'As conquistas desbloqueadas por ela aparecem aqui.' })
      : html`<ul class="mp-badges" aria-labelledby="pg-ach-title">${items.map((a) => html`<li class="mp-badge" title="${a.title}"><span class="mp-badge-icon" aria-hidden="true">${icon('conquistas', { size: 16 })}</span><span class="mp-badge-text"><span class="mp-badge-title">${a.title}</span><span class="mp-muted">${DAY_MONTH.format(new Date(a.unlockedAt))}</span></span></li>`)}</ul>`}`;
}

// ---------------------------------------------------------------- notas
function noteItem(note) {
  const edited = note.updatedAt !== note.createdAt;
  return html`<li class="mp-note" data-note-id="${note.id}">
    <p class="mp-note-body">${note.body}</p>
    <p class="mp-note-meta"><span>${edited ? 'Atualizada' : 'Criada'} em ${DAY_HOUR.format(new Date(note.updatedAt))}</span>
      <span class="mp-note-actions">${button({ label: 'Editar', variant: 'ghost', small: true, extra: { 'data-action': 'edit-note', 'data-id': note.id, 'aria-label': `Editar nota de ${DAY_MONTH.format(new Date(note.createdAt))}` } })}${button({ label: 'Excluir', variant: 'ghost', small: true, extra: { 'data-action': 'delete-note', 'data-id': note.id, 'aria-label': `Excluir nota de ${DAY_MONTH.format(new Date(note.createdAt))}` } })}</span></p>
  </li>`;
}

function renderNotes(notes, draft = '') {
  return html`<div class="dash-card-head"><h2 id="pg-notes-title">Notas da mentora</h2><span class="mp-private">${icon('lock', { size: 13, stroke: 2 })}Visível só para você</span></div>
    <form class="mp-note-form" novalidate data-form="note">
      <div class="field">
        <label class="field-label" for="pg-note-input">Nova nota</label>
        <div class="field-control"><textarea${attrs({ id: 'pg-note-input', name: 'body', class: 'field-input', rows: 3, maxlength: NOTE_MAX, placeholder: 'Adicionar nota…', 'aria-describedby': 'pg-note-error' })}>${draft}</textarea></div>
        <p class="field-error" id="pg-note-error" role="alert"></p>
      </div>
      <div class="row">${button({ label: 'Adicionar nota', type: 'submit', variant: 'ghost', id: 'pg-note-add' })}</div>
    </form>
    ${notes.length === 0
      ? html`<p class="mp-muted" id="pg-notes-empty">Nenhuma nota ainda. As notas ficam só com você.</p>`
      : html`<ul class="mp-notes" aria-labelledby="pg-notes-title">${notes.map(noteItem)}</ul>`}`;
}

// ---------------------------------------------------------------- sessão
function renderSession(data) {
  const next = data.next;
  const others = data.data.filter((s) => !next || s.id !== next.id).slice(0, 4);
  return html`<h2 id="pg-session-h" class="sr-only">Sessões de mentoria</h2>
    <section class="mp-session" aria-labelledby="pg-session-title">
      <span class="mp-session-eyebrow" id="pg-session-title">PRÓXIMA SESSÃO</span>
      ${next
        ? html`<p class="mp-session-when" data-session-id="${next.id}">${sessionLine(next)}</p>
            ${next.topic ? html`<p class="mp-session-topic">${next.topic}</p>` : ''}
            <p class="mp-session-actions">${button({ label: 'Editar', variant: 'ghost', small: true, extra: { 'data-action': 'edit-session', 'data-id': next.id, 'aria-label': `Editar a sessão de ${sessionWhen(next.startsAt)}` } })}${button({ label: 'Cancelar sessão', variant: 'ghost', small: true, extra: { 'data-action': 'cancel-session', 'data-id': next.id } })}</p>`
        : html`<p class="mp-session-when">Nenhuma sessão marcada.</p>
            <p class="mp-session-actions">${button({ label: 'Marcar sessão', variant: 'primary', small: true, extra: { 'data-action': 'schedule' } })}</p>`}
    </section>
    ${next ? html`<div class="row">${button({ label: 'Marcar outra sessão', variant: 'ghost', small: true, extra: { 'data-action': 'schedule' } })}</div>` : ''}
    ${others.length
      ? html`<h3 class="profile-subhead" id="pg-sessions-history">Outras sessões</h3><ul class="mp-sessions" aria-labelledby="pg-sessions-history">${others.map(
          (s) => html`<li class="mp-sessions-item"><span>${sessionWhen(s.startsAt)}${s.topic ? html` · ${s.topic}` : ''}</span><span class="mp-chip${s.status === 'cancelled' ? ' is-muted' : ''}">${STATUS_TEXT[s.status] ?? s.status}</span></li>`,
        )}</ul>`
      : ''}`;
}

/**
 * Monta as seções de mentoria dentro de `host` (já no DOM). Cada bloco carrega e falha sozinho (o servidor responde 404
 * quando a aluna não é desta mentora: o Perfil já trata isso antes). `openSession()` abre o diálogo "Marcar sessão".
 */
export function mountStudentGrowth({ host, api, student, can = () => true }) {
  const base = `/api/v1/mentora/students/${encodeURIComponent(student.id)}`;
  let disposed = false;
  let notes = [];
  let sessions = { data: [], next: null };
  const seq = { growth: 0, notes: 0, sessions: 0 };

  mount(host, html`<div class="mp-profile">
    <div class="mp-pkpis" id="pg-kpis" aria-busy="true">${skeleton(2)}</div>
    <div class="dash-split mp-psplit">
      <div class="dash-side">
        <section class="dash-card" id="pg-activity" aria-labelledby="pg-activity-title">${skeleton(2)}</section>
        <section class="dash-card" id="pg-challenges" aria-labelledby="pg-challenges-title">${skeleton(2)}</section>
      </div>
      <div class="dash-side">
        <section class="dash-card" id="pg-notes" aria-labelledby="pg-notes-title">${skeleton(3)}</section>
        <section class="dash-card mp-session-card" id="pg-session" aria-labelledby="pg-session-h">${skeleton(2)}</section>
      </div>
    </div>
    <div class="mp-trio">
      <section class="dash-card" id="pg-recent" aria-labelledby="pg-recent-title">${skeleton(3)}</section>
      <section class="dash-card" id="pg-goals" aria-labelledby="pg-goals-title">${skeleton(3)}</section>
      <section class="dash-card" id="pg-ach" aria-labelledby="pg-ach-title">${skeleton(3)}</section>
    </div>
  </div>`);
  const q = (id) => host.querySelector(id);
  const el = {
    kpis: q('#pg-kpis'),
    activity: q('#pg-activity'),
    challenges: q('#pg-challenges'),
    notes: q('#pg-notes'),
    session: q('#pg-session'),
    recent: q('#pg-recent'),
    goals: q('#pg-goals'),
    ach: q('#pg-ach'),
  };
  const growthCards = [
    [el.activity, renderActivity, 'Atividade', 'pg-activity-title'],
    [el.challenges, renderChallenges, 'Desafios', 'pg-challenges-title'],
    [el.recent, renderRecent, 'Atividades recentes', 'pg-recent-title'],
    [el.goals, renderGoals, 'Metas do mês', 'pg-goals-title'],
    [el.ach, renderAchievements, 'Conquistas', 'pg-ach-title'],
  ];

  async function loadGrowth() {
    const mine = ++seq.growth;
    el.kpis.setAttribute('aria-busy', 'true');
    let g = null;
    try {
      const result = await api.get(`${base}/growth`);
      if (isGrowth(result)) g = result;
    } catch {
      g = null;
    }
    if (disposed || mine !== seq.growth) return;
    el.kpis.setAttribute('aria-busy', 'false');
    if (!g) {
      mount(el.kpis, retry('growth', 'Não foi possível carregar o resumo de mentoria desta aluna.'));
      for (const [target, , label, titleId] of growthCards) mount(target, html`<h2 id="${titleId}">${label}</h2>${retry('growth')}`);
      return;
    }
    mount(el.kpis, renderKpis(g));
    for (const [target, render] of growthCards) mount(target, render(g));
    applySizes(host);
  }

  function paintNotes(draft = '') {
    mount(el.notes, renderNotes(notes, draft));
  }

  async function loadNotes() {
    const mine = ++seq.notes;
    try {
      const result = await api.get(`${base}/notes`);
      if (disposed || mine !== seq.notes) return;
      notes = Array.isArray(result?.data) ? result.data : [];
      paintNotes(el.notes.querySelector('#pg-note-input')?.value ?? '');
    } catch (error) {
      if (disposed || mine !== seq.notes) return;
      mount(el.notes, html`<h2 id="pg-notes-title">Notas da mentora</h2>${retry('notes', describeError(error))}`);
    }
  }

  async function loadSessions() {
    const mine = ++seq.sessions;
    try {
      const result = await api.get(`${base}/sessions`);
      if (disposed || mine !== seq.sessions) return;
      sessions = { data: Array.isArray(result?.data) ? result.data : [], next: result?.next ?? null };
      mount(el.session, renderSession(sessions));
    } catch (error) {
      if (disposed || mine !== seq.sessions) return;
      mount(el.session, html`<h2 id="pg-session-h" class="sr-only">Sessões de mentoria</h2>${retry('sessions', describeError(error))}`);
    }
  }

  async function addNote(form) {
    const input = form.querySelector('#pg-note-input');
    const error = form.querySelector('#pg-note-error');
    const problem = noteError(input.value);
    if (problem) {
      error.textContent = problem;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    const submit = form.querySelector('#pg-note-add');
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    try {
      await api.post(`${base}/notes`, { body: input.value.trim() });
      if (disposed) return;
      toast('Nota adicionada. Só você vê.', { tone: 'success' });
      input.value = '';
      await loadNotes();
      el.notes.querySelector('#pg-note-input')?.focus();
    } catch (err) {
      if (disposed) return;
      error.textContent = describeError(err);
      input.setAttribute('aria-invalid', 'true');
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  }

  async function editNote(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const result = await openNoteDialog({ api, studentId: student.id, note });
    if (disposed) return;
    if (result.saved) toast('Nota atualizada.', { tone: 'success' });
    if (result.saved || result.hadFailure) await loadNotes();
  }

  async function deleteNote(id) {
    if (!(await confirmDeleteNote()) || disposed) return;
    try {
      await api.delete(`${base}/notes/${encodeURIComponent(id)}`);
      if (disposed) return;
      toast('Nota excluída.', { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await loadNotes();
    el.notes.querySelector('#pg-note-input')?.focus();
  }

  async function schedule(session = null) {
    const result = await openSessionDialog({ api, studentId: student.id, session });
    if (disposed) return;
    if (result.saved) toast(session ? 'Sessão atualizada.' : 'Sessão marcada. A aluna recebe um aviso.', { tone: 'success' });
    if (result.saved || result.hadFailure) await loadSessions();
  }

  async function cancelSession(id) {
    const session = sessions.data.find((s) => s.id === id);
    if (!session || !(await confirmCancelSession(student.name)) || disposed) return;
    try {
      await api.patch(`${base}/sessions/${encodeURIComponent(id)}`, { status: 'cancelled', version: session.version });
      if (disposed) return;
      toast('Sessão cancelada.', { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await loadSessions();
  }

  host.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-form="note"]');
    if (!form) return;
    event.preventDefault();
    addNote(form);
  });
  host.addEventListener('input', (event) => {
    if (event.target.id !== 'pg-note-input') return;
    event.target.removeAttribute('aria-invalid');
    host.querySelector('#pg-note-error').textContent = '';
  });
  host.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, id, which } = target.dataset;
    if (action === 'retry') {
      if (which === 'notes') loadNotes();
      else if (which === 'sessions') loadSessions();
      else loadGrowth();
    } else if (action === 'edit-note') editNote(id);
    else if (action === 'delete-note') deleteNote(id);
    else if (action === 'schedule') schedule(null);
    else if (action === 'edit-session') schedule(sessions.data.find((s) => s.id === id) ?? null);
    else if (action === 'cancel-session') cancelSession(id);
  });

  // A equipe só carrega (e mostra) o que o papel permite: notas e sessões têm permissões próprias.
  const showNotes = can('notes.manage');
  const showSessions = can('sessions.manage');
  if (!showNotes) el.notes.remove();
  if (!showSessions) el.session.remove();
  loadGrowth();
  if (showNotes) loadNotes();
  if (showSessions) loadSessions();

  return {
    openSchedule: () => (showSessions ? schedule(null) : undefined),
    dispose: () => {
      disposed = true;
    },
  };
}
