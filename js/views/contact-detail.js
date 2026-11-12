import { formatWhatsapp } from '../../shared/contact.js';
import { describeError } from '../lib/api.js';
import {
  ACTIVITY_KINDS,
  COMPOSER_KINDS,
  LEAD_STATUS_LABELS,
  activityBodyError,
  contactPayload,
  groupTimeline,
  listOf,
  moneyShort,
  plural,
  sumValues,
  temperatureLabel,
  temperatureTone,
  timelineView,
  whenLabel,
} from '../lib/commercial.js';
import { whatsappUrl } from '../lib/contact-links.js';
import { forecastDate } from '../lib/deal-detail.js';
import { mount } from '../lib/dom.js';
import { money } from '../lib/finance.js';
import { dateFormatter, formatDateOnly } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import { activeFunnels, getFunnels, loadFunnels } from '../lib/pipeline-config.js';
import { hashParam } from '../lib/query.js';
import { sourceLabel } from '../lib/sources.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, emptyState, skeleton } from '../ui/components.js';
import { COMMERCIAL_EYEBROW, commercialTabs } from '../ui/commercial-tabs.js';
import { confirmDialog } from '../ui/dialog.js';
import { attachForm } from '../ui/form.js';
import { actionMenu } from '../ui/menu.js';
import { bindTabs, tabList, tabPanel } from '../ui/tabs.js';
import { toast } from '../ui/toast.js';
import { CONTACT_VALIDATORS, contactFields } from './contact-forms.js';
import { contactStatusBadge } from './contacts.js';
import { openCreateDealDialog } from './deals-dialogs.js';
import { openSaleDialog } from './sale-dialogs.js';
import { loadCampaignChoices } from './marketing-ui.js';
import { saleHref, saleStatusBadge } from './sales.js';
import { openTaskDialog } from './task-dialogs.js';

const TABS = ['dados', 'oportunidades', 'linha-do-tempo', 'compras'];
const TAB_LABELS = { dados: 'Dados', oportunidades: 'Oportunidades', 'linha-do-tempo': 'Linha do tempo', compras: 'Compras' };
const DEAL_STATUS = { won: ['Ganha', 'good'], lost: ['Perdida', 'bad'] };

/** Selo da oportunidade: a etapa em que está (aberta) ou o desfecho (Ganha/Perdida). */
export function dealStatusBadge(deal) {
  const closed = DEAL_STATUS[deal.status];
  return closed ? badge(closed[0], closed[1]) : badge(deal.stageName ?? 'Em andamento', 'warn');
}

function summaryStrip(contact) {
  const deals = contact.deals ?? [];
  const open = deals.filter((d) => d.status === 'open');
  const sales = (contact.sales ?? []).filter((s) => s.status !== 'cancelled');
  const items = [
    ['Em negociação', open.length ? moneyShort(sumValues(open)) : '—', open.length ? plural(open.length, 'oportunidade', 'oportunidades') : 'nenhuma aberta'],
    ['Compras', sales.length ? moneyShort(contact.contracted ?? '0.00') : '—', sales.length ? `${plural(sales.length, 'venda', 'vendas')} · recebido ${moneyShort(contact.received ?? '0.00')}` : 'nenhuma ainda'],
    ['Última atividade', contact.lastActivityAt ? whenLabel(contact.lastActivityAt) : '—', ''],
    ['Origem', sourceLabel(contact.source), [contact.campaignName ? `Campanha: ${contact.campaignName}` : null, contact.responsible ? `com ${contact.responsible}` : null].filter(Boolean).join(' · ')],
  ];
  return html`<section class="lead-kpis cc-contact-kpis" aria-label="Resumo do contato">${items.map(
    ([label, value, note]) => html`<div class="lead-kpi"><span class="lead-kpi-label">${label}</span><span class="lead-kpi-line"><span class="lead-kpi-value cc-kpi-sm">${value}</span>${note ? html`<span class="lead-kpi-note">${note}</span>` : ''}</span></div>`,
  )}</section>`;
}

function dealRow(deal) {
  const forecast = deal.status === 'open' ? forecastDate(deal.expectedCloseOn) : null;
  return html`<li><a class="cc-deal" href="#/comercial/oportunidades/${encodeURIComponent(deal.id)}">
    <span class="cc-deal-main">
      <span class="cc-deal-title">${deal.funnelName ?? 'Funil'}</span>
      <span class="cc-deal-sub">${[deal.productName, deal.status === 'lost' && deal.lostReason ? `Motivo: ${deal.lostReason}` : null, forecast ? `Previsão ${forecast}` : null].filter(Boolean).join(' · ') || 'Sem produto'}</span>
    </span>
    <span class="cc-deal-side">${dealStatusBadge(deal)}<strong class="cc-deal-value">${moneyShort(deal.value)}</strong></span>
  </a></li>`;
}

function dealsPanel(contact) {
  const deals = contact.deals ?? [];
  const head = html`<div class="od-card-head"><h2 class="lead-card-title">Oportunidades</h2>${button({ label: 'Nova oportunidade', small: true, iconStart: icon('plus', { size: 16 }), extra: { 'data-action': 'new-deal' } })}</div>`;
  if (deals.length === 0) {
    return html`<section class="lead-card">${head}${emptyState({
      title: 'Nenhuma oportunidade ainda',
      message: 'Quando a conversa evoluir, abra uma oportunidade no funil certo. O contato continua o mesmo: nada é duplicado.',
    })}</section>`;
  }
  const order = { open: 0, won: 1, lost: 2 };
  const sorted = [...deals].sort((a, b) => order[a.status] - order[b.status]);
  return html`<section class="lead-card">${head}<ul class="cc-deal-list">${sorted.map(dealRow)}</ul></section>`;
}

function saleRow(sale) {
  const next = sale.status !== 'cancelled' && sale.nextDueOn ? ` · próximo vencimento ${formatDateOnly(sale.nextDueOn)}` : '';
  return html`<li><a class="cc-deal" href="${saleHref(sale.id)}">
    <span class="cc-deal-main">
      <span class="cc-deal-title">${sale.description}</span>
      <span class="cc-deal-sub">Vendida em ${formatDateOnly(sale.closedOn)} · recebido ${money(sale.received)} de ${money(sale.finalValue)}${next}</span>
    </span>
    <span class="cc-deal-side">${saleStatusBadge(sale.financialStatus)}<strong class="cc-deal-value">${moneyShort(sale.finalValue)}</strong></span>
  </a></li>`;
}

/** Oportunidades ganhas que ainda não têm venda registrada ("Registrar depois"). */
function wonWithoutSale(contact) {
  const sales = contact.sales ?? [];
  return (contact.deals ?? []).filter((d) => d.status === 'won' && !sales.some((s) => s.dealId === d.id));
}

function purchasesPanel(contact) {
  const sales = contact.sales ?? [];
  const pending = wonWithoutSale(contact);
  const head = html`<div class="od-card-head"><h2 class="lead-card-title">Compras</h2>${button({ label: 'Nova venda', small: true, iconStart: icon('plus', { size: 16 }), extra: { 'data-action': 'new-sale' } })}</div>`;
  const list =
    sales.length === 0
      ? emptyState({ title: 'Nenhuma venda registrada', message: 'Registre a venda ao ganhar uma oportunidade, ou uma venda avulsa em “Nova venda”. O recebido só conta quando você lança os pagamentos.' })
      : html`<ul class="cc-deal-list">${sales.map(saleRow)}</ul>
        <dl class="fin-totals" aria-label="Totais das compras ativas">
          <div><dt>Contratado</dt><dd>${money(contact.contracted ?? '0.00')}</dd></div>
          <div><dt>Recebido</dt><dd>${money(contact.received ?? '0.00')}</dd></div>
          <div><dt>Saldo</dt><dd>${money(contact.pending ?? '0.00')}</dd></div>
        </dl>`;
  const later = pending.length
    ? html`<div class="fin-pending"><p class="fin-pending-title">Oportunidades ganhas sem venda registrada</p>${pending.map(
        (d) => html`<div class="fin-pending-item"><span>${d.productName ?? d.funnelName ?? 'Oportunidade'} · ${moneyShort(d.value)}${d.closedAt ? ` · ganha em ${dateFormatter.format(new Date(d.closedAt))}` : ''}</span>${button({ label: 'Registrar venda', variant: 'ghost', small: true, extra: { 'data-action': 'sale-for-deal', 'data-id': d.id, 'aria-label': `Registrar venda da oportunidade de ${moneyShort(d.value)}` } })}</div>`,
      )}</div>`
    : '';
  return html`<section class="lead-card">${head}${list}${later}</section>`;
}

function dataPanel(contact, campaigns) {
  const showLeadStatus = (contact.deals ?? []).length === 0;
  return html`<section class="lead-card">
    <div class="od-card-head"><h2 class="lead-card-title">Dados do contato</h2>${contact.updatedAt ? html`<span class="od-card-count">Atualizado em ${dateFormatter.format(new Date(contact.updatedAt))}</span>` : ''}</div>
    ${showLeadStatus ? '' : html`<p class="muted cc-note">A situação deste contato vem das oportunidades dele: ${contactStatusBadge(contact.status)}</p>`}
    <form id="contact-form" novalidate aria-label="Dados do contato">
      <div class="form-banner" id="contact-form-banner"></div>
      ${contactFields({ contact, funnels: getFunnels(), campaigns, prefix: 'contact', showLeadStatus })}
      <div class="cc-form-actions"><button type="submit" class="btn btn-primary" data-busy-label="Salvando…"><span class="spinner" aria-hidden="true" hidden></span><span>Salvar alterações</span></button></div>
    </form>
  </section>`;
}

function composer() {
  return html`<form class="composer" id="composer" novalidate aria-label="Registrar atividade">
    <div class="composer-kinds" role="radiogroup" aria-label="Tipo de atividade">${COMPOSER_KINDS.map(
      (k, i) => html`<button${attrs({ type: 'button', role: 'radio', class: 'composer-kind', 'data-kind': k, 'aria-checked': String(i === 0), tabindex: i === 0 ? '0' : '-1' })}>${ACTIVITY_KINDS[k].label}</button>`,
    )}</div>
    <div class="composer-row">
      <div class="field composer-field">
        <label class="sr-only" for="activity-body">Descreva a atividade</label>
        <div class="field-control"><input id="activity-body" class="field-input" type="text" maxlength="1000" autocomplete="off" placeholder="Ex.: Liguei e combinamos de falar na sexta…" aria-describedby="activity-error"></div>
      </div>
      <button type="submit" class="btn btn-primary" id="activity-submit"><span class="spinner" aria-hidden="true" hidden></span><span>Registrar</span></button>
    </div>
    <p class="field-error" id="activity-error" role="alert"></p>
  </form>`;
}

function timelineItem(item, first, now) {
  const view = timelineView(item);
  return html`<li${attrs({ class: `tl-item${first ? ' is-latest' : ''}${view.manual ? '' : ' is-auto'}` })}>
    <span class="tl-icon" aria-hidden="true">${icon(view.icon, { size: 16 })}</span>
    <div class="tl-body">
      <div class="tl-head">
        <span class="tl-kind">${view.title}</span>
        <span class="tl-when">${whenLabel(item.at ?? item.occurredAt, now)}${view.manual ? '' : ' · automático'}</span>
        ${view.manual && item.type !== 'stage' && item.type !== 'deal'
          ? actionMenu({ label: `Mais ações da atividade ${view.title} de ${whenLabel(item.at ?? item.occurredAt, now)}`, id: item.id, items: [{ label: 'Excluir atividade', action: 'delete-activity', id: item.id, tone: 'danger' }] })
          : ''}
      </div>
      ${view.text ? html`<p class="tl-text">${view.text}</p>` : ''}
      ${item.dealId ? html`<a class="cc-tl-link" href="#/comercial/oportunidades/${encodeURIComponent(item.dealId)}">Ver oportunidade</a>` : ''}
    </div>
  </li>`;
}

function timelineList(items, failed, now) {
  if (failed) return html`<p class="muted od-none">Não foi possível carregar a linha do tempo.</p><button type="button" class="lead-link-strong lead-link-button" data-action="reload-timeline">Tentar de novo</button>`;
  if (items === null) return skeleton(3);
  if (items.length === 0) return emptyState({ iconName: 'clock', title: 'Nada registrado ainda', message: 'Registre uma nota, ligação, e-mail, reunião ou conversa no WhatsApp para montar o histórico.' });
  let first = true;
  return html`${groupTimeline(items, now).map(
    (group) => html`<section class="tl-day" aria-label="${group.label}"><h3 class="tl-day-title">${group.label}</h3>
      <ol class="tl-list">${group.items.map((item) => {
        const isFirst = first;
        first = false;
        return timelineItem(item, isFirst, now);
      })}</ol></section>`,
  )}`;
}

export function renderContactDetail({ root, session, api, navigate, params }) {
  const base = `/api/v1/people/${encodeURIComponent(params.id)}`;
  const initialTab = TABS.includes(hashParam('aba')) ? hashParam('aba') : 'dados';
  let disposed = false;
  let seq = 0;
  let contact = null;
  let campaigns = [];
  let timeline = null;
  let timelineFailed = false;
  let products = null;
  let kind = 'note';
  let submitting = false;
  let built = false;
  let busy = false;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'commercial',
    heading: 'Contato',
    eyebrow: html`${COMMERCIAL_EYEBROW} · <a class="back-link" href="#/comercial/contatos">← Contatos</a>`,
    subtitle: html`<span id="contact-subtitle"></span>`,
    actions: html`<span class="profile-actions" id="contact-actions"></span>`,
    content: html`${commercialTabs('contacts')}<div id="contact-page" aria-live="off">${skeleton(4)}</div>`,
  });

  const page = root.querySelector('#contact-page');
  const heading = root.querySelector('h1');
  const subtitleEl = root.querySelector('#contact-subtitle');
  const actionsEl = root.querySelector('#contact-actions');
  const stillHere = (mine) => !disposed && mine === seq;
  const panel = (id) => page.querySelector(`#ct-panel-${id}`);

  function paintHeader() {
    heading.textContent = contact ? contact.name : 'Contato';
    if (!contact) {
      mount(subtitleEl, html``);
      mount(actionsEl, html``);
      return;
    }
    const leadNote = contact.status === 'lead' && contact.leadStatus ? ` · ${LEAD_STATUS_LABELS[contact.leadStatus] ?? ''}` : '';
    mount(
      subtitleEl,
      html`<span class="cc-subtitle">${contactStatusBadge(contact.status)}${contact.temperature ? badge(temperatureLabel(contact.temperature), temperatureTone(contact.temperature)) : ''}<span>${contact.createdAt ? `Contato desde ${dateFormatter.format(new Date(contact.createdAt))}` : ''}${leadNote}</span></span>`,
    );
    const wa = whatsappUrl(contact.whatsapp);
    mount(
      actionsEl,
      html`${wa ? html`<a${attrs({ class: 'btn btn-ghost', href: wa, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Abrir WhatsApp de ${contact.name} (nova aba)` })}>${icon('chat', { size: 16 })}<span>${formatWhatsapp(contact.whatsapp)}</span></a>` : ''}
        ${button({ label: 'Criar tarefa', variant: 'ghost', extra: { 'data-action': 'task' } })}
        ${button({ label: 'Nova oportunidade', iconStart: icon('plus', { size: 16 }), extra: { 'data-action': 'new-deal' } })}
        ${actionMenu({ label: `Mais ações de ${contact.name}`, id: contact.id, items: [{ label: 'Nova venda', action: 'new-sale', id: contact.id }, { separator: true }, { label: 'Excluir contato', action: 'delete', id: contact.id, tone: 'danger' }] })}`,
    );
  }

  function tabDefs() {
    const deals = contact?.deals ?? [];
    return TABS.map((id) => ({
      id,
      label: TAB_LABELS[id],
      count: id === 'oportunidades' ? deals.length : id === 'compras' ? (contact?.sales ?? []).length : null,
    }));
  }

  function buildPage() {
    mount(
      page,
      html`<div id="ct-summary"></div>
        <div class="cc-detail">
          ${tabList({ prefix: 'ct', label: 'Seções do contato', tabs: tabDefs(), current: initialTab })}
          ${TABS.map((id) => tabPanel({ prefix: 'ct', id, current: initialTab, content: html`` }))}
        </div>`,
    );
    bindTabs(page.querySelector('.cc-detail'), () => {});
    // O composer da linha do tempo é montado uma vez (o texto digitado sobrevive às recargas da lista).
    mount(panel('linha-do-tempo'), html`<section class="lead-card lead-timeline-card"><h2 class="lead-card-title">Linha do tempo</h2>${composer()}<div id="ct-timeline" aria-live="off"></div></section>`);
    wireComposer();
    built = true;
  }

  function paintCounts() {
    for (const tab of tabDefs()) {
      const el = page.querySelector(`#ct-tab-${tab.id} .tabs-count`);
      if (el && tab.count !== null) el.textContent = String(tab.count);
    }
  }

  function paintData() {
    mount(panel('dados'), dataPanel(contact, campaigns));
    wireDataForm();
  }

  function paintTimeline() {
    const host = page.querySelector('#ct-timeline');
    if (host) mount(host, timelineList(timeline, timelineFailed, new Date()));
  }

  function paintAll({ data = true } = {}) {
    paintHeader();
    mount(page.querySelector('#ct-summary'), summaryStrip(contact));
    paintCounts();
    if (data) paintData();
    mount(panel('oportunidades'), dealsPanel(contact));
    mount(panel('compras'), purchasesPanel(contact));
    paintTimeline();
  }

  const notFound = () =>
    html`<section class="lead-card" aria-label="Contato não encontrado">${emptyState({
      iconName: 'contatos',
      title: 'Contato não encontrado',
      message: 'Ele pode ter sido excluído ou o endereço está incorreto.',
      action: html`<a class="btn btn-primary" href="#/comercial/contatos">Voltar para Contatos</a>`,
    })}</section>`;

  const retryAlert = (error) =>
    html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar o contato', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;

  function paintFailure(content) {
    built = false;
    contact = null;
    paintHeader();
    mount(page, content);
  }

  async function loadTimeline(mine = seq) {
    try {
      const result = await api.get(`${base}/timeline`);
      if (!stillHere(mine)) return;
      timeline = listOf(result);
      timelineFailed = false;
    } catch {
      if (!stillHere(mine)) return;
      timelineFailed = true;
    }
    paintTimeline();
  }

  /** `silent`: recarga depois de uma ação, sem esqueleto. `data: false` não redesenha o formulário (preserva o que foi digitado). */
  async function load({ silent = false, data = true } = {}) {
    const mine = ++seq;
    if (!silent || !built) mount(page, skeleton(4));
    try {
      const [fresh, choices] = await Promise.all([api.get(base), loadCampaignChoices(api), loadFunnels(api)]);
      if (!stillHere(mine)) return;
      contact = fresh;
      campaigns = choices;
      if (!built) buildPage();
      paintAll({ data: data || !silent });
      await loadTimeline(mine);
    } catch (error) {
      if (!stillHere(mine)) return;
      if (error?.status === 404) paintFailure(notFound());
      else if (silent && built) toast(describeError(error), { tone: 'danger' });
      else paintFailure(retryAlert(error));
    }
  }

  // ---------- Dados ----------

  function wireDataForm() {
    const form = page.querySelector('#contact-form');
    if (!form) return;
    attachForm(form, {
      validators: CONTACT_VALIDATORS,
      async onSubmit(values, formApi) {
        const banner = form.querySelector('#contact-form-banner');
        mount(banner, html``);
        try {
          await api.patch(base, { ...contactPayload(values), version: contact.version });
          if (disposed) return;
          toast('Contato atualizado.', { tone: 'success' });
          await load({ silent: true });
        } catch (error) {
          if (disposed) return;
          const orphan = formApi.applyServerErrors(error?.errors);
          const conflict = error?.status === 409 && error?.code !== 'duplicate_whatsapp';
          const message = conflict
            ? 'Este contato foi alterado em outra aba. Recarregamos os dados mais recentes: confira e salve de novo.'
            : (orphan[0] ?? (error?.errors?.length ? null : describeError(error)));
          if (message) mount(banner, alert({ tone: 'danger', message }));
          if (conflict) await load({ silent: true, data: false });
        }
      },
    });
  }

  // ---------- Linha do tempo ----------

  function wireComposer() {
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
    const group = form.querySelector('.composer-kinds');
    group.addEventListener('click', (event) => {
      const option = event.target.closest('[data-kind]');
      if (option) pick(option);
    });
    group.addEventListener('keydown', (event) => {
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
  }

  async function submitActivity(form) {
    if (submitting || !contact) return;
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
    submit.querySelector('.spinner').hidden = false;
    try {
      await api.post(`${base}/activities`, { kind, body: input.value.trim() });
      if (disposed) return;
      input.value = '';
      toast('Atividade registrada.', { tone: 'success' });
      await load({ silent: true, data: false });
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

  async function removeActivity(id) {
    const item = (timeline ?? []).find((a) => a.id === id);
    if (!item) return;
    const body = String(item.body ?? '');
    const confirmed = await confirmDialog({
      title: 'Excluir atividade?',
      message: `“${body.length > 80 ? `${body.slice(0, 80)}…` : body}” sai da linha do tempo. Esta ação não pode ser desfeita.`,
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
    await load({ silent: true, data: false });
  }

  // ---------- Oportunidades, tarefa e exclusão ----------

  async function ensureProducts() {
    if (products) return products;
    try {
      products = listOf(await api.get('/api/v1/products?limit=100&archived=false'));
    } catch {
      products = []; // o diálogo segue só com "Nenhum (valor manual)"
    }
    return products;
  }

  async function newDeal() {
    await Promise.all([ensureProducts(), loadFunnels(api)]);
    if (disposed) return;
    const funnels = activeFunnels();
    if (funnels.length === 0) {
      toast('Ative ao menos um funil em Configurações para abrir oportunidades.', { tone: 'warn' });
      return;
    }
    const preferred = funnels.find((f) => f.id === contact.entryFunnelId)?.id ?? funnels[0].id;
    const outcome = await openCreateDealDialog({ api, products, funnels, funnelId: preferred, presetPerson: { id: contact.id, name: contact.name } });
    if (disposed) return;
    if (outcome.saved) toast('Oportunidade criada no funil.', { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load({ silent: true, data: false });
  }

  /** Nova venda do contato; `deal` (opcional): oportunidade ganha que ficou para "Registrar depois". */
  async function newSale(deal = null) {
    await ensureProducts();
    if (disposed) return;
    const outcome = await openSaleDialog({ api, person: { id: contact.id, name: contact.name }, deal, products });
    if (disposed) return;
    if (outcome.saved) toast('Venda registrada.', { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load({ silent: true, data: false });
  }

  async function createTask() {
    const outcome = await openTaskDialog({ api, preset: { title: `Falar com ${contact.name}`, person: { id: contact.id, name: contact.name } } });
    if (disposed) return;
    if (outcome.saved) toast('Tarefa criada.', { tone: 'success' });
  }

  async function removeContact() {
    const confirmed = await confirmDialog({
      title: `Excluir ${contact.name}?`,
      message: 'Apaga o contato, as oportunidades dele (inclusive as ganhas) e a linha do tempo. As tarefas continuam, sem o vínculo. Um contato com venda registrada não pode ser excluído. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!confirmed || disposed) return;
    try {
      await api.delete(base);
      toast('Contato excluído.', { tone: 'success' });
      navigate('/comercial/contatos');
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
      await load({ silent: true });
    }
  }

  const actions = { 'new-deal': newDeal, 'new-sale': () => newSale(), task: createTask, delete: removeContact, 'reload-timeline': () => loadTimeline() };
  const onClick = async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'retry') return void load();
    if (busy || contact === null) return;
    if (action === 'delete-activity') return void removeActivity(target.dataset.id);
    if (action === 'sale-for-deal') {
      const deal = (contact.deals ?? []).find((d) => d.id === target.dataset.id);
      if (!deal) return;
      busy = true;
      try {
        await newSale({ ...deal, personId: contact.id, personName: contact.name });
      } finally {
        busy = false;
      }
      return;
    }
    if (!Object.hasOwn(actions, action)) return;
    busy = true; // uma ação por vez: a segunda usaria uma versão já velha
    try {
      await actions[action]();
    } finally {
      busy = false;
    }
  };
  page.addEventListener('click', onClick);
  actionsEl.addEventListener('click', onClick);

  load();

  return () => {
    disposed = true;
    page.removeEventListener('click', onClick);
    actionsEl.removeEventListener('click', onClick);
    disposeShell();
  };
}
