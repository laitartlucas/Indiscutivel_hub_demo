import { PERIODS, formatRate, moneyShort, plural } from '../lib/commercial.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery } from '../lib/query.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';

// Cartão "Comercial" no perfil da aluna, para a mentora (e a equipe com a permissão business.view): só NÚMEROS
// agregados (GET /mentora/students/:id/commercial). Nunca nomes, contatos ou clientes da aluna.

const PRIVACY_NOTE = 'Números agregados. Os clientes da aluna continuam privados.';

/** Indicadores do cartão, só com o que a API entrega. */
export function studentCommercialItems(data) {
  return [
    { label: 'Novos contatos', value: String(data?.newContacts ?? 0) },
    { label: 'Em negociação', value: moneyShort(data?.open?.total ?? '0.00'), note: plural(Number(data?.open?.count ?? 0), 'oportunidade', 'oportunidades') },
    { label: 'Ganhas', value: moneyShort(data?.won?.total ?? '0.00'), note: plural(Number(data?.won?.count ?? 0), 'venda', 'vendas') },
    { label: 'Perdidas', value: String(data?.lost?.count ?? 0) },
    { label: 'Conversão', value: formatRate(data?.conversionRate) },
  ];
}

function body(data) {
  const funnels = (data?.byFunnel ?? []).filter((f) => Number(f.open ?? 0) + Number(f.won ?? 0) + Number(f.lost ?? 0) > 0);
  return html`<dl class="sc-kpis">${studentCommercialItems(data).map(
      (k) => html`<div class="sc-kpi"><dt>${k.label}</dt><dd><span class="sc-kpi-value">${k.value}</span>${k.note ? html`<span class="sc-kpi-note">${k.note}</span>` : ''}</dd></div>`,
    )}</dl>
    ${funnels.length === 0
      ? html`<p class="muted sc-none">Nenhuma oportunidade movimentada no período.</p>`
      : html`<div class="table-wrap" role="region" aria-label="Oportunidades por funil" tabindex="0"><table class="data-table data-table--dense">
          <caption class="sr-only">Oportunidades da aluna por funil no período</caption>
          <thead><tr><th scope="col">Funil</th><th scope="col" class="cell-end">Em negociação</th><th scope="col" class="cell-end">Ganhas</th><th scope="col" class="cell-end">Perdidas</th></tr></thead>
          <tbody>${funnels.map((f) => html`<tr><th scope="row">${f.name}</th><td class="cell-end">${f.open ?? 0}</td><td class="cell-end">${f.won ?? 0}</td><td class="cell-end">${f.lost ?? 0}</td></tr>`)}</tbody>
        </table></div>`}`;
}

/** Monta o cartão em `host` e devolve a limpeza. */
export function mountStudentCommercial({ host, api, studentId }) {
  let disposed = false;
  let seq = 0;
  let period = 'month';

  mount(
    host,
    html`<section class="dash-card sc-card" aria-labelledby="sc-title">
      <div class="dash-card-head"><h2 id="sc-title">Comercial</h2>
        <div class="segments sc-periods" role="group" aria-label="Período">${PERIODS.map((p) => html`<button${attrs({ type: 'button', class: 'segment', 'data-period': p.value, 'aria-pressed': String(p.value === period) })}>${p.label}</button>`)}</div>
      </div>
      <div id="sc-body" aria-live="off">${skeleton(3)}</div>
      <p class="sc-note">${PRIVACY_NOTE}</p>
    </section>`,
  );
  const region = host.querySelector('#sc-body');
  const periods = host.querySelector('.sc-periods');

  async function load() {
    const mine = ++seq;
    region.setAttribute('aria-busy', 'true');
    try {
      const data = await api.get(`/api/v1/mentora/students/${encodeURIComponent(studentId)}/commercial${buildQuery({ period })}`);
      if (disposed || mine !== seq) return;
      mount(region, body(data));
    } catch (error) {
      if (disposed || mine !== seq) return;
      if (error?.status === 404 || error?.status === 403) {
        mount(region, emptyState({ title: 'Indicadores indisponíveis', message: 'Não foi possível ver os números comerciais desta aluna.' }));
      } else {
        mount(region, html`<div class="stack">${alert({ tone: 'danger', message: 'Não foi possível carregar os indicadores comerciais agora.' })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', small: true, extra: { 'data-action': 'sc-retry' } })}</div></div>`);
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
    if (event.target.closest('[data-action="sc-retry"]')) load();
  });

  load();
  return () => {
    disposed = true;
  };
}
