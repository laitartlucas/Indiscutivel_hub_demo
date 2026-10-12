import { formatMoney } from '../../shared/money.js';
import { formatWhatsapp } from '../../shared/contact.js';
import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { dateFormatter } from '../lib/format.js';
import { attrs, html } from '../lib/html.js';
import { locationLabel, moneyShort, segmentLabel } from '../lib/companies.js';
import { whenLabel } from '../lib/leads.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, emptyState, personCell, skeleton } from '../ui/components.js';
import { stageLabel, temperatureLabel, temperatureTone } from '../ui/kanban.js';
import { actionMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import { loadPipelineConfig } from '../lib/pipeline-config.js';
import { companyLogo } from './companies.js';
import { confirmDeleteCompany, openCompanyDialog } from './company-dialogs.js';

const STAGE_TONES = { arrived: 'neutral', talking: 'warn', proposal: 'warn', won: 'good', lost: 'bad' };

const infoRow = (label, value) => html`<div class="lead-info-row"><dt>${label}</dt><dd>${value}</dd></div>`;

function infoCard(company) {
  return html`<section class="lead-card" aria-labelledby="co-info-title">
    <h2 id="co-info-title" class="lead-card-title">Informações</h2>
    <dl class="lead-info">
      ${infoRow('Segmento', segmentLabel(company.segment) ?? '—')}
      ${infoRow('Cidade', locationLabel(company) || '—')}
      ${infoRow('Site', company.website ? html`<a href="${company.website}" target="_blank" rel="noopener noreferrer" aria-label="Abrir o site de ${company.name} (nova aba)">${company.website.replace(/^https:\/\//, '')}</a>` : '—')}
      ${infoRow('Última atividade', whenLabel(company.lastActivityAt))}
      ${infoRow('Cadastrada em', dateFormatter.format(new Date(company.createdAt)))}
    </dl>
  </section>`;
}

function notesCard(company) {
  return html`<section class="lead-card" aria-labelledby="co-notes-title">
    <h2 id="co-notes-title" class="lead-card-title">Notas</h2>
    ${company.notes
      ? html`<p class="co-notes">${company.notes}</p>`
      : html`<p class="muted co-none">Nenhuma nota ainda.</p><button type="button" class="lead-link-strong lead-link-button" data-action="edit">Adicionar nota ${icon('arrowRight', { size: 14 })}</button>`}
  </section>`;
}

function contactsCard(company) {
  const people = company.people ?? [];
  return html`<section class="lead-card" aria-labelledby="co-contacts-title">
    <div class="od-card-head"><h2 id="co-contacts-title" class="lead-card-title">Contatos</h2><span class="od-card-count">${people.length}</span></div>
    ${people.length === 0
      ? html`<p class="muted co-none">Nenhuma pessoa vinculada. Vincule uma pessoa a esta empresa em <a href="#/pessoas">Pessoas</a>.</p>`
      : html`<ul class="co-list">${people.map(
          (p) => html`<li class="co-list-row">
            <span class="co-list-main">${personCell(p.name)}<span class="co-list-sub">${[p.whatsapp ? formatWhatsapp(p.whatsapp) : null, p.email].filter(Boolean).join(' · ')}</span></span>
            <span class="co-list-aside">${p.openDealsCount} ${p.openDealsCount === 1 ? 'oportunidade aberta' : 'oportunidades abertas'}</span>
          </li>`,
        )}</ul>`}
  </section>`;
}

function dealsCard(company) {
  const deals = company.deals ?? [];
  return html`<section class="lead-card" aria-labelledby="co-deals-title">
    <div class="od-card-head"><h2 id="co-deals-title" class="lead-card-title">Oportunidades</h2><span class="od-card-count">${deals.length}</span></div>
    ${deals.length === 0
      ? html`<p class="muted co-none">Nenhuma oportunidade das pessoas desta empresa.</p>`
      : html`<ul class="co-list">${deals.map(
          (d) => html`<li class="co-list-row">
            <a${attrs({ class: 'co-list-main co-list-link', href: `#/oportunidades/${d.id}` })}><span class="co-list-name">${d.personName}</span><span class="co-list-sub">${formatMoney(d.value)}</span></a>
            <span class="co-list-aside">${badge(stageLabel(d.stage), STAGE_TONES[d.stage] ?? 'neutral')}${badge(temperatureLabel(d.temperature), temperatureTone(d.temperature))}</span>
          </li>`,
        )}</ul>`}
  </section>`;
}

export function renderCompanyDetail({ root, session, api, navigate, params }) {
  const base = `/api/v1/companies/${encodeURIComponent(params.id)}`;
  let disposed = false;
  let seq = 0;
  let company = null;
  let built = false;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'companies',
    heading: 'Empresa',
    eyebrow: html`CRM · <a class="back-link" href="#/empresas">← Empresas</a>`,
    subtitle: html`<span id="company-subtitle"></span>`,
    actions: html`<span class="profile-actions" id="company-actions"></span>`,
    content: html`<div id="company-page" aria-live="off">${skeleton(4)}</div>`,
  });

  const page = root.querySelector('#company-page');
  const heading = root.querySelector('h1');
  const subtitleEl = root.querySelector('#company-subtitle');
  const actionsEl = root.querySelector('#company-actions');
  const stillHere = (mine) => !disposed && mine === seq;

  function paintHeader() {
    heading.textContent = company ? company.name : 'Empresa';
    mount(subtitleEl, html`${company ? [segmentLabel(company.segment), locationLabel(company)].filter(Boolean).join(' · ') : ''}`);
    mount(
      actionsEl,
      company
        ? html`${button({ label: 'Editar', variant: 'ghost', extra: { 'data-action': 'edit' } })}
          ${actionMenu({ label: `Mais ações de ${company.name}`, id: company.id, items: [{ label: 'Excluir empresa', action: 'delete', id: company.id, tone: 'danger' }] })}`
        : html``,
    );
  }

  function paintBody() {
    mount(
      page,
      html`<section class="lead-hero co-hero" aria-label="Resumo da empresa">
          ${companyLogo(company, 'xl')}
          <div class="lead-hero-main">
            <div class="lead-badges">${company.segment ? badge(segmentLabel(company.segment), 'neutral') : ''}</div>
            ${company.website ? html`<a class="co-site" href="${company.website}" target="_blank" rel="noopener noreferrer" aria-label="Abrir o site de ${company.name} (nova aba)">${company.website.replace(/^https:\/\//, '')}</a>` : ''}
          </div>
          <dl class="co-stats">
            <div class="co-stat"><dt class="lead-kpi-label">Contatos</dt><dd class="co-stat-value">${company.contactsCount}</dd></div>
            <div class="co-stat"><dt class="lead-kpi-label">Oportunidades abertas</dt><dd class="co-stat-value">${company.openDealsCount}</dd></div>
            <div class="co-stat"><dt class="lead-kpi-label">Valor do pipeline</dt><dd class="co-stat-value is-gold">${moneyShort(company.pipelineValue)}</dd></div>
          </dl>
        </section>
        <div class="lead-grid">
          <div class="lead-side">${contactsCard(company)}${dealsCard(company)}</div>
          <div class="lead-side">${infoCard(company)}${notesCard(company)}</div>
        </div>`,
    );
    built = true;
  }

  function paintFailure(content) {
    built = false;
    mount(page, content);
    mount(subtitleEl, html``);
    mount(actionsEl, html``);
    heading.textContent = 'Empresa';
  }

  const notFound = () =>
    html`<section class="lead-card" aria-label="Empresa não encontrada">${emptyState({
      iconName: 'empresas',
      title: 'Empresa não encontrada',
      message: 'Ela pode ter sido excluída ou o endereço está incorreto.',
      action: html`<a class="btn btn-primary" href="#/empresas">Voltar para Empresas</a>`,
    })}</section>`;

  const retryAlert = (error) =>
    html`<div class="stack">
      ${alert({ tone: 'danger', title: 'Não foi possível carregar a empresa', message: describeError(error) })}
      <div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div>
    </div>`;

  /** `silent`: recarga depois de uma ação, sem trocar a tela por um esqueleto. */
  async function load({ silent = false } = {}) {
    const mine = ++seq;
    if (!silent || !built) mount(page, skeleton(4));
    try {
      const [fresh] = await Promise.all([api.get(base), loadPipelineConfig(api)]);
      if (!stillHere(mine)) return;
      company = fresh;
      paintHeader();
      paintBody();
    } catch (error) {
      if (!stillHere(mine)) return;
      if (error?.status === 404) paintFailure(notFound());
      else if (silent && built) toast(describeError(error), { tone: 'danger' });
      else paintFailure(retryAlert(error));
    }
  }

  async function edit() {
    const outcome = await openCompanyDialog({ api, company });
    if (disposed) return;
    if (outcome.saved) toast('Empresa atualizada.', { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load({ silent: true });
  }

  async function remove() {
    if (!(await confirmDeleteCompany(company)) || disposed) return;
    try {
      await api.delete(base);
      toast('Empresa excluída.', { tone: 'success' });
      navigate('/empresas');
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
      await load({ silent: true });
    }
  }

  const actions = { edit, delete: remove, retry: () => load() };
  const onClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'retry') return void load();
    if (Object.hasOwn(actions, action) && company !== null) actions[action]();
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
