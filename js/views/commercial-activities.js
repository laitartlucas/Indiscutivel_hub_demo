import { describeError } from '../lib/api.js';
import { ACTIVITY_KINDS, groupTimeline, listOf, whenLabel } from '../lib/commercial.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery } from '../lib/query.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { COMMERCIAL_EYEBROW, commercialTabs } from '../ui/commercial-tabs.js';

const PAGE = 50;
const MAX = 200;

function feedItem(item, first, now) {
  const kind = ACTIVITY_KINDS[item.kind] ?? ACTIVITY_KINDS.note;
  return html`<li${attrs({ class: `tl-item${first ? ' is-latest' : ''}` })}>
    <span class="tl-icon" aria-hidden="true">${icon(kind.icon, { size: 16 })}</span>
    <div class="tl-body">
      <div class="tl-head">
        <span class="tl-kind">${kind.label} · <a class="cc-feed-person" href="#/comercial/contatos/${encodeURIComponent(item.personId)}?aba=linha-do-tempo">${item.personName ?? 'Contato'}</a></span>
        <span class="tl-when">${whenLabel(item.occurredAt, now)}</span>
      </div>
      ${item.body ? html`<p class="tl-text">${item.body}</p>` : ''}
    </div>
  </li>`;
}

function feed(items, canMore, now) {
  if (items.length === 0) {
    return emptyState({
      iconName: 'clock',
      title: 'Nenhuma atividade registrada',
      message: 'Na página de cada contato você registra notas, ligações, e-mails, reuniões e conversas no WhatsApp. As mais recentes aparecem aqui.',
      action: html`<a class="btn btn-primary" href="#/comercial/contatos">Abrir contatos</a>`,
    });
  }
  let first = true;
  return html`${groupTimeline(items, now).map(
    (group) => html`<section class="tl-day" aria-label="${group.label}"><h3 class="tl-day-title">${group.label}</h3>
      <ol class="tl-list">${group.items.map((item) => {
        const isFirst = first;
        first = false;
        return feedItem(item, isFirst, now);
      })}</ol></section>`,
  )}
  ${canMore ? html`<div class="tl-more">${button({ label: 'Carregar mais', variant: 'ghost', extra: { 'data-action': 'more' } })}</div>` : ''}`;
}

export function renderCommercialActivities({ root, session, api, navigate }) {
  let disposed = false;
  let limit = PAGE;
  let seq = 0;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'commercial',
    heading: 'Atividades',
    eyebrow: COMMERCIAL_EYEBROW,
    subtitle: 'O que aconteceu com os seus contatos, do mais recente para o mais antigo.',
    actions: html`<a class="btn btn-ghost" href="#/tarefas">${icon('tarefas', { size: 16 })}<span>Ver tarefas</span></a>`,
    content: html`${commercialTabs('activities')}
      <div class="cc-activities">
        <section class="lead-card lead-timeline-card" aria-labelledby="cc-feed-title">
          <div class="od-card-head"><h2 id="cc-feed-title" class="lead-card-title">Linha do tempo de todos os contatos</h2></div>
          <div id="cc-feed" aria-live="off">${skeleton(5)}</div>
        </section>
        <aside class="lead-side">
          <section class="lead-next" aria-labelledby="cc-next-title">
            <h2 id="cc-next-title" class="lead-next-eyebrow">Próximos passos</h2>
            <p class="lead-next-title">Transforme cada conversa em uma tarefa com prazo.</p>
            <p class="lead-next-meta">As tarefas ficam em Rotina, com lembrete no sino quando atrasam.</p>
            <a class="lead-next-link" href="#/tarefas">Abrir Tarefas ${icon('arrowRight', { size: 14 })}</a>
          </section>
        </aside>
      </div>`,
  });

  const host = root.querySelector('#cc-feed');

  async function load({ keepFocus = false } = {}) {
    const mine = ++seq;
    host.setAttribute('aria-busy', 'true');
    try {
      const result = await api.get(`/api/v1/activities${buildQuery({ limit })}`);
      if (disposed || mine !== seq) return;
      const items = listOf(result);
      mount(host, feed(items, items.length >= limit && limit < MAX, new Date()));
      // "Carregar mais" some ao redesenhar: o foco vai para o novo botão (ou para a lista, se acabou).
      if (keepFocus) (host.querySelector('[data-action="more"]') ?? host.querySelector('.tl-day:last-of-type .tl-item:last-child'))?.focus?.();
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(host, html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar as atividades', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`);
    }
    host.setAttribute('aria-busy', 'false');
  }

  host.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'retry') load();
    if (action === 'more') {
      limit = Math.min(MAX, limit + PAGE);
      load({ keepFocus: true });
    }
  });

  load();

  return () => {
    disposed = true;
    disposeShell();
  };
}
