import { PERIODS } from '../lib/commercial.js';
import { studentMarketingItems } from '../lib/marketing.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery } from '../lib/query.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';

// Cartão "Marketing" no perfil da aluna, para a mentora (e a equipe com a permissão business.view): só NÚMEROS
// agregados (GET /mentora/students/:id/marketing). Nunca nomes de campanhas nem de contatos.

const PRIVACY_NOTE = 'Números agregados do marketing da aluna. Nomes de campanhas e de contatos continuam privados.';

function body(data) {
  return html`<dl class="sc-kpis">${studentMarketingItems(data).map(
    (k) => html`<div class="sc-kpi"><dt>${k.label}</dt><dd><span class="sc-kpi-value">${k.value}</span>${k.note ? html`<span class="sc-kpi-note">${k.note}</span>` : ''}</dd></div>`,
  )}</dl>`;
}

/** Monta o cartão em `host` e devolve a limpeza. Mesmo seletor de período (e alvos de 44 px no celular) do cartão Comercial. */
export function mountStudentMarketing({ host, api, studentId }) {
  let disposed = false;
  let seq = 0;
  let period = 'month';

  mount(
    host,
    html`<section class="dash-card sc-card" aria-labelledby="sm-title">
      <div class="dash-card-head"><h2 id="sm-title">Marketing</h2>
        <div class="segments sc-periods" role="group" aria-label="Período do marketing">${PERIODS.map((p) => html`<button${attrs({ type: 'button', class: 'segment', 'data-period': p.value, 'aria-pressed': String(p.value === period) })}>${p.label}</button>`)}</div>
      </div>
      <div id="sm-body" aria-live="off">${skeleton(2)}</div>
      <p class="sc-note">${PRIVACY_NOTE} CPL = investimento ÷ leads; CAC = investimento ÷ clientes novos; ROAS = receita ÷ investimento.</p>
    </section>`,
  );
  const region = host.querySelector('#sm-body');
  const periods = host.querySelector('.sc-periods');

  async function load() {
    const mine = ++seq;
    region.setAttribute('aria-busy', 'true');
    try {
      const data = await api.get(`/api/v1/mentora/students/${encodeURIComponent(studentId)}/marketing${buildQuery({ period })}`);
      if (disposed || mine !== seq) return;
      mount(region, body(data));
    } catch (error) {
      if (disposed || mine !== seq) return;
      if (error?.status === 404 || error?.status === 403) {
        mount(region, emptyState({ title: 'Indicadores indisponíveis', message: 'Não foi possível ver os números de marketing desta aluna.' }));
      } else {
        mount(region, html`<div class="stack">${alert({ tone: 'danger', message: 'Não foi possível carregar os indicadores de marketing agora.' })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', small: true, extra: { 'data-action': 'sm-retry' } })}</div></div>`);
      }
    }
    region.setAttribute('aria-busy', 'false');
  }

  periods.addEventListener('click', (event) => {
    const option = event.target.closest('[data-period]');
    if (!option || option.dataset.period === period) return;
    period = option.dataset.period;
    for (const other of periods.querySelectorAll('[data-period]')) other.setAttribute('aria-pressed', String(other === option));
    load();
  });
  region.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="sm-retry"]')) load();
  });

  load();
  return () => {
    disposed = true;
  };
}
