import { PERIODS } from '../lib/commercial.js';
import { studentFinanceItems } from '../lib/finance.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery } from '../lib/query.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';

// Cartão "Financeiro" no perfil da aluna, para a mentora (e a equipe com a permissão business.view): só NÚMEROS
// agregados (GET /mentora/students/:id/finance). Nunca nomes de clientes nem descrições de vendas.

const PRIVACY_NOTE = 'Números agregados das vendas da aluna. Clientes e descrições continuam privados.';

function body(data) {
  return html`<dl class="sc-kpis">${studentFinanceItems(data).map(
    (k) => html`<div class="sc-kpi"><dt>${k.label}</dt><dd><span class="sc-kpi-value">${k.value}</span>${k.note ? html`<span class="sc-kpi-note">${k.note}</span>` : ''}</dd></div>`,
  )}</dl>`;
}

/** Monta o cartão em `host` e devolve a limpeza. Mesmo seletor de período (e alvos de 44 px no celular) do cartão Comercial. */
export function mountStudentFinance({ host, api, studentId }) {
  let disposed = false;
  let seq = 0;
  let period = 'month';

  mount(
    host,
    html`<section class="dash-card sc-card" aria-labelledby="sf-title">
      <div class="dash-card-head"><h2 id="sf-title">Financeiro</h2>
        <div class="segments sc-periods" role="group" aria-label="Período do financeiro">${PERIODS.map((p) => html`<button${attrs({ type: 'button', class: 'segment', 'data-period': p.value, 'aria-pressed': String(p.value === period) })}>${p.label}</button>`)}</div>
      </div>
      <div id="sf-body" aria-live="off">${skeleton(2)}</div>
      <p class="sc-note">${PRIVACY_NOTE} Contratado e recebido são do período; a receber e vencido, de hoje.</p>
    </section>`,
  );
  const region = host.querySelector('#sf-body');
  const periods = host.querySelector('.sc-periods');

  async function load() {
    const mine = ++seq;
    region.setAttribute('aria-busy', 'true');
    try {
      const data = await api.get(`/api/v1/mentora/students/${encodeURIComponent(studentId)}/finance${buildQuery({ period })}`);
      if (disposed || mine !== seq) return;
      mount(region, body(data));
    } catch (error) {
      if (disposed || mine !== seq) return;
      if (error?.status === 404 || error?.status === 403) {
        mount(region, emptyState({ title: 'Indicadores indisponíveis', message: 'Não foi possível ver os números financeiros desta aluna.' }));
      } else {
        mount(region, html`<div class="stack">${alert({ tone: 'danger', message: 'Não foi possível carregar os indicadores financeiros agora.' })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', small: true, extra: { 'data-action': 'sf-retry' } })}</div></div>`);
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
    if (event.target.closest('[data-action="sf-retry"]')) load();
  });

  load();
  return () => {
    disposed = true;
  };
}
