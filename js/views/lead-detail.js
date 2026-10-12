import { describeError } from '../lib/api.js';
import { whatsappUrl } from '../lib/contact-links.js';
import { mount } from '../lib/dom.js';
import { formatWhatsapp } from '../../shared/contact.js';
import { dateFormatter } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import {
  ACTIVITY_KINDS,
  COMPOSER_KINDS,
  STATUS_FORM_OPTIONS,
  activityBodyError,
  activityMeta,
  groupTimeline,
  leadSubtitle,
  moneyShort,
  nextOpenTask,
  whenLabel,
} from '../lib/leads.js';
import { KIND_LABELS, dueLabel, tzOffsetMinutes } from '../lib/tasks.js';
import { sourceLabel } from '../lib/sources.js';
import { buildQuery } from '../lib/query.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, selectField, skeleton } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { actionMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { openTaskDialog } from './task-dialogs.js';
import { openConvertDialog, openLeadDialog } from './lead-dialogs.js';
import { leadAvatar, statusBadge, temperatureBadge } from './leads.js';

const PAGE = 20;

const infoRow = (label, value) => html`<div class="lead-info-row"><dt>${label}</dt><dd>${value}</dd></div>`;

function infoCard(lead) {
  const wa = whatsappUrl(lead.whatsapp);
  return html`<section class="lead-card" aria-labelledby="lead-info-title">
    <h2 id="lead-info-title" class="lead-card-title">Informações</h2>
    <dl class="lead-info">
      ${infoRow('E-mail', lead.email ?? '—')}
      ${infoRow('WhatsApp', lead.whatsapp ? (wa ? html`<a href="${wa}" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp de ${lead.name} (nova aba)">${formatWhatsapp(lead.whatsapp)}</a>` : formatWhatsapp(lead.whatsapp)) : '—')}
      ${infoRow('Instagram', lead.instagram ?? '—')}
      ${infoRow('Empresa', lead.company ?? '—')}
      ${infoRow('Cargo', lead.jobTitle ?? '—')}
      ${infoRow('Origem', sourceLabel(lead.source))}
      ${infoRow('Criado em', dateFormatter.format(new Date(lead.createdAt)))}
    </dl>
    ${lead.notes ? html`<div class="lead-notes"><h3 class="lead-notes-title">Observações</h3><p>${lead.notes}</p></div>` : ''}
  </section>`;
}

function taskCard(task) {
  return html`<section class="lead-next" aria-labelledby="lead-next-title">
    <h2 id="lead-next-title" class="lead-next-eyebrow">Próxima tarefa</h2>
    <p class="lead-next-title">${task.title}</p>
    <p class="lead-next-meta">${dueLabel(task)} · ${KIND_LABELS[task.kind] ?? task.kind}</p>
    <a class="lead-next-link" href="#/tarefas">Ver tarefas ${icon('arrowRight', { size: 14 })}</a>
  </section>`;
}

function opportunityCard(lead) {
  if (lead.status === 'converted') {
    return html`<section class="lead-card lead-deal" aria-labelledby="lead-deal-title">
      <h2 id="lead-deal-title" class="lead-card-title">Oportunidade criada</h2>
      <p class="muted">Convertido em ${dateFormatter.format(new Date(lead.convertedAt))}.${lead.convertedDealId ? '' : ' A oportunidade foi excluída depois.'}</p>
      ${lead.convertedDealId ? html`<a class="lead-link-strong" href="#/oportunidades">Ver no funil ${icon('arrowRight', { size: 14 })}</a>` : ''}
    </section>`;
  }
  return html`<section class="lead-empty-deal" aria-labelledby="lead-deal-title">
    <h2 id="lead-deal-title" class="lead-empty-deal-title">Nenhuma oportunidade vinculada</h2>
    <p>Quando a conversa evoluir, transforme este lead em oportunidade no funil.</p>
    <button type="button" class="lead-link-strong lead-link-button" data-action="convert">Criar oportunidade ${icon('arrowRight', { size: 14 })}</button>
  </section>`;
}

function activityItem(activity, first, now) {
  const kind = ACTIVITY_KINDS[activity.kind] ?? ACTIVITY_KINDS.note;
  const manual = activity.kind !== 'status_change';
  return html`<li${attrs({ class: `tl-item${first ? ' is-latest' : ''}${manual ? '' : ' is-auto'}`, 'data-activity-id': activity.id })}>
    <span class="tl-icon" aria-hidden="true">${icon(kind.icon, { size: 16 })}</span>
    <div class="tl-body">
      <div class="tl-head">
        <span class="tl-kind">${kind.label}</span>
        <span class="tl-when">${activityMeta(activity, now)}</span>
        ${manual ? actionMenu({ label: `Mais ações da atividade ${kind.label} de ${whenLabel(activity.occurredAt, now)}`, id: activity.id, items: [{ label: 'Excluir atividade', action: 'delete-activity', id: activity.id, tone: 'danger' }] }) : ''}
      </div>
      <p class="tl-text">${activity.body}</p>
    </div>
  </li>`;
}

function timeline(activities, total, now) {
  if (activities.length === 0) {
    return emptyState({ iconName: 'clock', title: 'Nenhuma atividade registrada', message: 'Registre uma nota, ligação ou reunião para montar o histórico deste lead.' });
  }
  let first = true;
  return html`${groupTimeline(activities, now).map(
    (group) => html`<section class="tl-day" aria-label="${group.label}">
      <h3 class="tl-day-title">${group.label}</h3>
      <ol class="tl-list">${group.items.map((item) => {
        const isFirst = first;
        first = false;
        return activityItem(item, isFirst, now);
      })}</ol>
    </section>`,
  )}
  ${activities.length < total ? html`<div class="tl-more"><button type="button" class="btn btn-ghost" data-action="more">Carregar mais (${total - activities.length})</button></div>` : ''}`;
}

function composer() {
  return html`<form class="composer" id="composer" novalidate aria-label="Registrar atividade">
    <div class="composer-kinds" role="radiogroup" aria-label="Tipo de atividade">${COMPOSER_KINDS.map(
      (k, i) => html`<button${attrs({ type: 'button', role: 'radio', class: 'composer-kind', 'data-kind': k, 'aria-checked': String(i === 0), tabindex: i === 0 ? '0' : '-1' })}>${ACTIVITY_KINDS[k].label}</button>`,
    )}</div>
    <div class="composer-row">
      <div class="field composer-field">
        <label class="sr-only" for="activity-body">Descreva a atividade</label>
        <div class="field-control"><input id="activity-body" class="field-input" type="text" maxlength="1000" autocomplete="off" placeholder="Ex.: Ligação de alinhamento sobre a proposta…" aria-describedby="activity-error"></div>
      </div>
      <button type="submit" class="btn btn-primary" id="activity-submit"><span class="spinner" aria-hidden="true" hidden></span><span>Registrar</span></button>
    </div>
    <p class="field-error" id="activity-error" role="alert"></p>
  </form>`;
}

export function renderLeadDetail({ root, session, api, navigate, params }) {
  const base = `/api/v1/leads/${encodeURIComponent(params.id)}`;
  let disposed = false;
  let seq = 0;
  let lead = null;
  let activities = [];
  let total = 0;
  let kind = 'note';
  let submitting = false;
  let built = false;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'leads',
    heading: 'Lead',
    eyebrow: html`CRM · <a class="back-link" href="#/leads">← Leads</a>`,
    subtitle: html`<span id="lead-subtitle"></span>`,
    actions: html`<span class="profile-actions" id="lead-actions"></span>`,
    content: html`<div id="lead-page" aria-live="off">${skeleton(4)}</div>`,
  });

  const page = root.querySelector('#lead-page');
  const heading = root.querySelector('h1');
  const subtitleEl = root.querySelector('#lead-subtitle');
  const actionsEl = root.querySelector('#lead-actions');
  let hero;
  let timelineEl;
  let sideEl;
  let nextTask = null;

  const stillHere = (mine) => !disposed && mine === seq;

  function paintHeader() {
    heading.textContent = lead ? lead.name : 'Lead';
    mount(subtitleEl, html`${lead ? leadSubtitle(lead) : ''}`);
    mount(
      actionsEl,
      lead
        ? html`${lead.status === 'converted' ? '' : button({ label: 'Criar oportunidade', extra: { 'data-action': 'convert' } })}
          ${button({ label: 'Criar tarefa', variant: 'ghost', extra: { 'data-action': 'task' } })}
          ${button({ label: 'Editar', variant: 'ghost', extra: { 'data-action': 'edit' } })}
          ${actionMenu({ label: `Mais ações de ${lead.name}`, id: lead.id, items: [{ label: 'Excluir lead', action: 'delete', id: lead.id, tone: 'danger' }] })}`
        : html``,
    );
  }

  function paintHero() {
    mount(
      hero,
      html`${leadAvatar(lead, 'xl')}
        <div class="lead-hero-main">
          <div class="lead-badges">${statusBadge(lead.status)}${temperatureBadge(lead.temperature)}</div>
          ${lead.status === 'converted'
            ? html`<p class="muted lead-hero-note">Este lead já virou oportunidade; a situação dele não muda mais.</p>`
            : selectField({ id: 'lead-status-select', label: 'Alterar situação', name: 'status', value: lead.status, options: STATUS_FORM_OPTIONS })}
        </div>
        <div class="lead-hero-value"><span class="lead-kpi-label">Valor estimado</span><span class="lead-hero-amount">${lead.estimatedValue ? moneyShort(lead.estimatedValue) : '—'}</span></div>`,
    );
  }

  function paintSide() {
    mount(sideEl, html`${infoCard(lead)}${nextTask ? taskCard(nextTask) : ''}${opportunityCard(lead)}`);
  }

  function paintTimeline() {
    mount(timelineEl, timeline(activities, total, new Date()));
  }

  function paintAll() {
    paintHeader();
    paintHero();
    paintSide();
    paintTimeline();
  }

  function buildPage() {
    mount(
      page,
      html`<section class="lead-hero" id="lead-hero" aria-label="Resumo do lead"></section>
        <div class="lead-grid">
          <section class="lead-card lead-timeline-card" aria-labelledby="lead-timeline-title">
            <h2 id="lead-timeline-title" class="lead-card-title">Linha do tempo</h2>
            ${composer()}
            <div id="lead-timeline" aria-live="off"></div>
          </section>
          <div class="lead-side" id="lead-side"></div>
        </div>`,
    );
    hero = page.querySelector('#lead-hero');
    timelineEl = page.querySelector('#lead-timeline');
    sideEl = page.querySelector('#lead-side');
    built = true;
    wirePage();
  }

  function paintFailure(content) {
    built = false;
    mount(page, content);
    mount(subtitleEl, html``);
    mount(actionsEl, html``);
    heading.textContent = 'Lead';
  }

  const notFound = () =>
    html`<section class="lead-card" aria-label="Lead não encontrado">${emptyState({
      iconName: 'leads',
      title: 'Lead não encontrado',
      message: 'Ele pode ter sido excluído ou o endereço está incorreto.',
      action: html`<a class="btn btn-primary" href="#/leads">Voltar para Leads</a>`,
    })}</section>`;

  const retryAlert = (error) =>
    html`<div class="stack">
      ${alert({ tone: 'danger', title: 'Não foi possível carregar o lead', message: describeError(error) })}
      <div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div>
    </div>`;

  /** Tarefa aberta mais próxima da Pessoa em que o lead virou: só existe depois da conversão (tarefa só se vincula a Pessoa/Oportunidade). */
  async function loadNextTask(mine) {
    if (!lead?.convertedPersonId) {
      nextTask = null;
      return;
    }
    try {
      const result = await api.get(`/api/v1/tasks${buildQuery({ personId: lead.convertedPersonId, view: 'all', limit: 50, tzOffset: tzOffsetMinutes() })}`);
      if (!stillHere(mine)) return;
      nextTask = nextOpenTask(result.data);
    } catch {
      // apoio: sem a tarefa, o bloco simplesmente não aparece
      nextTask = null;
    }
  }

  /** `silent`: recarga depois de uma ação, sem trocar a tela por um esqueleto. */
  async function load({ silent = false } = {}) {
    const mine = ++seq;
    if (!silent || !built) mount(page, skeleton(4));
    try {
      const [fresh, firstPage] = await Promise.all([api.get(base), api.get(`${base}/activities${buildQuery({ limit: PAGE, offset: 0 })}`)]);
      if (!stillHere(mine)) return;
      lead = fresh;
      activities = firstPage.data;
      total = firstPage.page.total;
      await loadNextTask(mine);
      if (!stillHere(mine)) return;
      if (!built) buildPage();
      paintAll();
    } catch (error) {
      if (!stillHere(mine)) return;
      if (error?.status === 404) paintFailure(notFound());
      else if (silent && built) toast(describeError(error), { tone: 'danger' });
      else paintFailure(retryAlert(error));
    }
  }

  async function loadMore() {
    const mine = seq;
    try {
      const next = await api.get(`${base}/activities${buildQuery({ limit: PAGE, offset: activities.length })}`);
      if (!stillHere(mine)) return;
      activities = [...activities, ...next.data];
      total = next.page.total;
      paintTimeline();
    } catch (error) {
      if (!disposed) toast(describeError(error), { tone: 'danger' });
    }
  }

  // ---------- ações ----------

  async function convert() {
    const outcome = await openConvertDialog({ api, lead });
    if (disposed) return;
    if (outcome.saved) toast('Oportunidade criada. O lead foi marcado como convertido.', { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load({ silent: true });
  }

  async function edit() {
    const outcome = await openLeadDialog({ api, lead });
    if (disposed) return;
    if (outcome.saved) toast('Lead atualizado.', { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load({ silent: true });
  }

  async function createTask() {
    const person = lead.convertedPersonId ? { id: lead.convertedPersonId, name: lead.name } : null;
    const outcome = await openTaskDialog({
      api,
      preset: {
        title: `Follow-up com ${lead.name}`,
        person,
        dealId: lead.convertedDealId ?? undefined,
        description: person ? undefined : 'Este lead ainda não é uma pessoa no CRM: a tarefa fica sem vínculo e leva o nome dele no título. Depois de criar a oportunidade, vincule as próximas tarefas à pessoa.',
      },
    });
    if (disposed) return;
    if (outcome.saved) {
      toast('Tarefa criada.', { tone: 'success' });
      await load({ silent: true });
    }
  }

  async function removeLead() {
    const confirmed = await confirmDialog({
      title: `Excluir ${lead.name}?`,
      message: 'O lead e toda a linha do tempo dele serão apagados. Pessoa e oportunidade já criadas a partir dele continuam. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!confirmed || disposed) return;
    try {
      await api.delete(base);
      toast('Lead excluído.', { tone: 'success' });
      navigate('/leads');
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
      await load({ silent: true });
    }
  }

  async function removeActivity(id) {
    const activity = activities.find((a) => a.id === id);
    if (!activity) return;
    const confirmed = await confirmDialog({
      title: 'Excluir atividade?',
      message: `“${activity.body.length > 80 ? `${activity.body.slice(0, 80)}…` : activity.body}” será excluída da linha do tempo. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!confirmed || disposed) return;
    try {
      await api.delete(`${base}/activities/${encodeURIComponent(id)}`);
      if (disposed) return;
      toast('Atividade excluída.', { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await load({ silent: true });
  }

  async function changeStatus(select) {
    const status = select.value;
    if (status === lead.status) return;
    select.disabled = true;
    try {
      await api.patch(base, { status, version: lead.version });
      if (disposed) return;
      toast('Situação atualizada.', { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await load({ silent: true });
  }

  async function submitActivity(form) {
    if (submitting) return;
    const input = form.querySelector('#activity-body');
    const errorEl = form.querySelector('#activity-error');
    const message = activityBodyError(input.value);
    errorEl.textContent = message ?? '';
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    submitting = true;
    const submit = form.querySelector('#activity-submit');
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    form.querySelector('.spinner').hidden = false;
    try {
      await api.post(`${base}/activities`, { kind, body: input.value.trim() });
      if (disposed) return;
      input.value = '';
      toast('Atividade registrada.', { tone: 'success' });
      await load({ silent: true });
    } catch (error) {
      if (disposed) return;
      const field = error?.errors?.find((e) => e.field === 'body');
      errorEl.textContent = field?.message ?? describeError(error);
      input.setAttribute('aria-invalid', 'true');
    } finally {
      submitting = false;
      if (!disposed) {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        submit.querySelector('.spinner').hidden = true;
        input.focus();
      }
    }
  }

  // ---------- eventos ----------

  function wirePage() {
    const form = page.querySelector('#composer');
    const kinds = [...form.querySelectorAll('[data-kind]')];
    const pick = (option, { focus = false } = {}) => {
      kind = option.dataset.kind;
      for (const other of kinds) {
        other.setAttribute('aria-checked', String(other === option));
        other.tabIndex = other === option ? 0 : -1;
      }
      if (focus) option.focus();
    };
    form.querySelector('.composer-kinds').addEventListener('click', (event) => {
      const option = event.target.closest('[data-kind]');
      if (option) pick(option);
    });
    form.querySelector('.composer-kinds').addEventListener('keydown', (event) => {
      const index = kinds.indexOf(document.activeElement);
      const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (index < 0 || !move) return;
      event.preventDefault();
      pick(kinds[(index + move + kinds.length) % kinds.length], { focus: true });
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitActivity(form);
    });
    form.querySelector('#activity-body').addEventListener('input', (event) => {
      form.querySelector('#activity-error').textContent = '';
      event.target.removeAttribute('aria-invalid');
    });
    hero.addEventListener('change', (event) => {
      if (event.target.id === 'lead-status-select') changeStatus(event.target);
    });
  }

  const actions = { convert, edit, task: createTask, delete: removeLead, more: loadMore, retry: () => load() };
  const onClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'delete-activity') return void removeActivity(target.dataset.id);
    if (Object.hasOwn(actions, action) && lead !== null) actions[action]();
    else if (action === 'retry') load();
  };
  page.addEventListener('click', onClick);
  actionsEl.addEventListener('click', onClick);

  load();

  return () => {
    disposed = true;
    page.removeEventListener('click', onClick);
    disposeShell();
  };
}

