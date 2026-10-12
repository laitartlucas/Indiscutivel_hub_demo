import { ApiError, describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { APP_NAME } from '../config.js';
import { doneLong, dayMonthYear, durationText, rewardText, segments, stateMeta, whenText, xpText } from '../lib/growth.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';

/** Detalhe do desafio (aluna): ações, participar/sair e marcar as ações manuais. As automáticas se calculam sozinhas. */

function notFound() {
  return emptyState({
    iconName: 'desafios',
    title: 'Desafio não encontrado',
    message: 'Ele pode ter sido encerrado pela sua mentora ou o endereço está incorreto.',
    action: html`<a class="btn btn-primary" href="#/desafios">Voltar para Desafios</a>`,
  });
}

function retryBlock(error) {
  return html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar o desafio', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;
}

function progressBar(c) {
  const segs = segments(c.progress);
  const label = `Progresso: ${doneLong(c)}`;
  if (segs) {
    return html`<div class="chal-segs" role="progressbar" aria-valuemin="0" aria-valuemax="${c.progress.total}" aria-valuenow="${c.progress.done}" aria-label="${label}">${segs.map((on) => html`<span${attrs({ class: `chal-seg${on ? ' is-on' : ''}` })}></span>`)}</div>`;
  }
  return html`<div class="chal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${c.progress.pct}" aria-label="${label}"><div${attrs({ class: 'chal-bar-fill', 'data-w': String(c.progress.pct) })}></div></div>`;
}

function heroCard(c) {
  const meta = stateMeta(c.state);
  const reward = rewardText(c);
  const canJoin = !c.enrolled && c.phase !== 'ended';
  const canLeave = c.enrolled && !c.completedAt && c.phase !== 'ended';
  return html`<section class="chal-hero chal-hero--detail" aria-label="Resumo do desafio">
    <svg class="chal-hero-art" width="520" height="360" viewBox="0 0 520 360" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor"><path d="M0 330 L130 170 L210 250 L300 110 L400 210 L520 60" stroke-opacity="0.35"></path><path d="M0 360 L130 220 L210 290 L300 170 L400 260 L520 130" stroke-opacity="0.12"></path></g><circle cx="300" cy="110" r="4" fill="currentColor"></circle></svg>
    <div class="chal-hero-main">
      <div class="chal-pills"><span class="chal-pill chal-pill--gold">${meta.label.toUpperCase()}</span><span class="chal-pill">${whenText(c)}</span><span class="chal-pill">${durationText(c.durationDays)} · ${dayMonthYear(c.startsOn)} a ${dayMonthYear(c.endsOn)}</span></div>
      ${c.description ? html`<p class="chal-hero-desc">${c.description}</p>` : ''}
      <div class="chal-hero-progress">
        <div class="chal-hero-row"><span class="chal-hero-count">${c.progress.done} <span class="chal-hero-total">/ ${c.progress.total}</span></span>${reward ? html`<span class="chal-hero-reward">${reward}</span>` : ''}</div>
        ${progressBar(c)}
      </div>
      ${c.completedAt ? html`<p class="chal-hero-note" role="status">Você concluiu este desafio. A recompensa já foi somada ao seu XP.</p>` : ''}
      ${!c.enrolled && c.phase === 'ended' ? html`<p class="chal-hero-note">Este desafio já terminou.</p>` : ''}
      ${c.enrolled && c.phase === 'ended' && !c.completedAt ? html`<p class="chal-hero-note">O período terminou antes de você concluir todas as ações.</p>` : ''}
      ${c.enrolled && c.phase === 'upcoming' ? html`<p class="chal-hero-note">Você está inscrita. As ações liberam quando o desafio começar.</p>` : ''}
      <div class="chal-hero-buttons">
        ${canJoin ? html`<button type="button" class="chal-cta" data-action="join">Participar do desafio ${icon('arrowRight', { size: 16, stroke: 2 })}</button>` : ''}
        ${canLeave ? html`<button type="button" class="chal-ghost" data-action="leave">Sair do desafio</button>` : ''}
      </div>
    </div>
  </section>`;
}

function actionItem(c, a, busy) {
  const editable = c.enrolled && !c.completedAt && c.phase === 'active' && !a.automatic;
  const progress = a.automatic && a.current !== null ? `${Math.min(a.current, a.target)} / ${a.target}` : null;
  const inner = a.automatic
    ? html`<span${attrs({ class: `chal-check${a.done ? ' is-on' : ''}`, 'aria-hidden': 'true' })}>${a.done ? icon('check', { size: 12, stroke: 3 }) : ''}</span>`
    : html`<input${attrs({ type: 'checkbox', class: 'chal-checkbox', id: `act-${a.id}`, 'data-action-id': a.id, checked: a.done, disabled: !editable || busy, 'aria-describedby': a.hint ? `act-${a.id}-hint` : false })}>`;
  const body = html`<span class="chal-action-text"><span class="chal-action-title">${a.title}</span>${a.hint ? html`<span class="chal-action-hint" id="act-${a.id}-hint">${a.hint}${progress ? html` · <strong>${progress}</strong>` : ''}</span>` : ''}</span>`;
  return html`<li${attrs({ class: `chal-action${a.done ? ' is-done' : ''}` })}>${a.automatic
    ? html`<span class="chal-action-label">${inner}${body}<span class="sr-only">${a.done ? 'Feita' : 'Pendente'}</span></span>`
    : html`<label class="chal-action-label" for="act-${a.id}">${inner}${body}</label>`}${a.xp > 0 ? html`<span class="chal-action-xp">${xpText(a.xp)}</span>` : ''}</li>`;
}

export function renderChallengeDetail({ root, session, api, navigate, params }) {
  let disposed = false;
  let gen = 0;
  let data = null;
  let busy = false;
  const id = params.id;

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'challenges',
    heading: 'Desafio',
    eyebrow: html`Crescimento · <a class="back-link" href="#/desafios">← Desafios</a>`,
    content: html`<div class="growth" id="chal-detail" aria-busy="true">${skeleton(4)}</div>`,
  });
  const body = root.querySelector('#chal-detail');
  const h1 = root.querySelector('h1');

  function paint() {
    if (h1) h1.textContent = data.title;
    document.title = `${data.title} — ${APP_NAME}`;
    const pending = data.actions.filter((a) => !a.done).length;
    mount(body, html`${heroCard(data)}
      <section class="growth-card" aria-labelledby="chal-actions-title">
        <div class="growth-card-head"><h2 id="chal-actions-title">Ações do desafio</h2><span class="growth-card-note">${data.actions.length === 0 ? 'Sem ações cadastradas' : pending === 0 ? 'Todas feitas' : `${pending} ${pending === 1 ? 'pendente' : 'pendentes'}`}</span></div>
        ${data.enrolled || data.actions.length === 0 ? '' : html`<p class="muted">Participe do desafio para marcar as ações e ganhar XP.</p>`}
        ${data.actions.length === 0 ? emptyState({ title: 'Este desafio ainda não tem ações', message: 'Sua mentora está preparando as ações.' }) : html`<ul class="chal-actions">${data.actions.map((a) => actionItem(data, a, busy))}</ul>`}
      </section>`);
    applySizes(body);
  }

  async function load() {
    const mine = ++gen;
    body.setAttribute('aria-busy', 'true');
    mount(body, skeleton(4));
    try {
      const result = await api.get(`/api/v1/challenges/${id}`);
      if (disposed || mine !== gen) return;
      data = result;
      paint();
    } catch (error) {
      if (disposed || mine !== gen) return;
      mount(body, error instanceof ApiError && error.status === 404 ? notFound() : retryBlock(error));
    }
    body.setAttribute('aria-busy', 'false');
  }

  /** Executa uma chamada que devolve o desafio atualizado; em erro, avisa e recarrega o que o servidor sabe. */
  async function act(run, { focusSelector = null } = {}) {
    if (busy) return;
    busy = true;
    // Só bloqueia os controles (sem redesenhar): a caixa marcada continua marcada até o servidor responder.
    for (const control of body.querySelectorAll('.chal-checkbox, [data-action]')) control.disabled = true;
    try {
      const result = await run();
      if (disposed) return;
      data = result;
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
      busy = false;
      await load();
      return;
    }
    busy = false;
    paint();
    if (focusSelector) body.querySelector(focusSelector)?.focus();
  }

  body.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'retry') return void load();
    if (action === 'join') {
      await act(() => api.post(`/api/v1/challenges/${id}/join`), { focusSelector: '.chal-checkbox:not(:disabled), [data-action="leave"]' });
      if (!disposed && data?.enrolled) toast('Você entrou no desafio.', { tone: 'success' });
    } else if (action === 'leave') {
      const ok = await confirmDialog({
        title: 'Sair do desafio?',
        message: 'O seu progresso neste desafio será apagado. O XP que você já ganhou fica com você e não se repete se voltar.',
        confirmLabel: 'Sair do desafio',
        tone: 'danger',
      });
      if (!ok || disposed) return;
      await act(() => api.post(`/api/v1/challenges/${id}/leave`), { focusSelector: '[data-action="join"]' });
    }
  });

  body.addEventListener('change', (event) => {
    const box = event.target.closest('.chal-checkbox');
    if (!box) return;
    const actionId = box.dataset.actionId;
    const url = `/api/v1/challenges/${id}/actions/${actionId}/done`;
    act(() => (box.checked ? api.post(url) : api.delete(url)), { focusSelector: `#act-${CSS.escape(actionId)}` });
  });

  load();

  return () => {
    disposed = true;
    dispose();
  };
}
