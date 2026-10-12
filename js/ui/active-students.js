import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { icon } from '../ih-icons.js';
import {
  ACTIVE_MAX,
  chartSummary,
  deltaSpoken,
  deltaText,
  formatCount,
  lastMonths,
  PRIVACY_NOTE,
  parseCount,
  updatedAgo,
  updatedOn,
} from '../../shared/active-students.js';
import { alert, button, emptyState, field, skeleton } from './components.js';
import { openFormDialog } from './form-dialog.js';
import { toast } from './toast.js';

// "Alunas ativas": número que a aluna informa sobre as alunas DELA. Peças compartilhadas entre o Painel da aluna (cartão e diálogo),
// a lista da mentora (célula) e o Perfil (mini-gráfico). A mentora só vê o número; nunca clientes nem valores.

/** Variação do mês: ▲/▼/= com o texto falado para leitor de tela. Vazio quando não há mês anterior. */
export function deltaBadge(delta) {
  const text = deltaText(delta);
  if (!text) return '';
  const tone = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return html`<span${attrs({ class: `as-delta is-${tone}`, title: deltaSpoken(delta) })}><span aria-hidden="true">${text}</span><span class="sr-only">${deltaSpoken(delta)}</span></span>`;
}

/** Mini-gráfico de 6 meses (SVG), com resumo em texto como nome acessível. `series` = lastMonths(...). */
export function activeChart(series, { width = 264, height = 96 } = {}) {
  const known = series.filter((p) => p.count !== null);
  const max = Math.max(1, ...known.map((p) => p.count));
  const slot = width / series.length;
  const barW = Math.round(slot * 0.52);
  const top = 16;
  const base = height - 22;
  const bars = series.map((p, i) => {
    const x = Number((i * slot + (slot - barW) / 2).toFixed(1));
    const cx = Number((i * slot + slot / 2).toFixed(1));
    const h = p.count === null ? 0 : Math.max(3, Math.round((p.count / max) * (base - top)));
    return html`<g>${p.count === null
        ? html`<line${attrs({ class: 'as-chart-gap', x1: String(x), x2: String(x + barW), y1: String(base - 1), y2: String(base - 1) })}></line>`
        : html`<rect${attrs({ class: i === series.length - 1 ? 'as-chart-bar is-now' : 'as-chart-bar', x: String(x), y: String(base - h), width: String(barW), height: String(h), rx: '3' })}></rect><text${attrs({ class: 'as-chart-val', x: String(cx), y: String(base - h - 4), 'text-anchor': 'middle' })}>${p.count}</text>`}
      <text${attrs({ class: 'as-chart-label', x: String(cx), y: String(height - 6), 'text-anchor': 'middle' })}>${p.label}</text></g>`;
  });
  return html`<svg class="as-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${chartSummary(series)}">${bars}</svg>`;
}

// ---------------------------------------------------------------- cartão da aluna

function numberBlock(data, now) {
  return html`<p class="as-value"><span class="as-number">${formatCount(data.count)}</span>${deltaBadge(data.deltaMonth)}</p>
    <p class="as-meta"><span>${updatedOn(data.updatedAt)}</span><span class="as-sep" aria-hidden="true">·</span><span>${updatedAgo(data.updatedAt, now).replace(/^Atualizado /, "")}</span>${Number.isInteger(data.deltaMonth) ? html`<span class="as-sep" aria-hidden="true">·</span><span>vs. mês anterior</span>` : ''}</p>`;
}

function privacyNote() {
  return html`<p class="as-privacy">${icon('lock', { size: 14, stroke: 2 })}<span>${PRIVACY_NOTE}</span></p>`;
}

function cardBody(state, now) {
  if (state.status === 'unavailable') return html``;
  if (state.status === 'loading') return html`<div class="dash-card-head"><h2 id="as-title">Minhas alunas ativas</h2></div>${skeleton(3)}`;
  if (state.status === 'error') {
    return html`<div class="dash-card-head"><h2 id="as-title">Minhas alunas ativas</h2></div><div class="stack">${alert({ tone: 'danger', message: state.message })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;
  }
  const data = state.data;
  if (!Number.isInteger(data.count)) {
    return html`<div class="dash-card-head"><h2 id="as-title">Minhas alunas ativas</h2></div>
      ${emptyState({ iconName: 'alunas', title: 'Informe quantas alunas ativas você tem hoje', message: PRIVACY_NOTE, action: button({ label: 'Informar agora', id: 'as-update', extra: { 'data-action': 'update' } }) })}`;
  }
  return html`<div class="dash-card-head"><h2 id="as-title">Minhas alunas ativas</h2>${button({ label: 'Atualizar', variant: 'ghost', small: true, id: 'as-update', extra: { 'data-action': 'update', 'aria-label': 'Atualizar o número de alunas ativas' } })}</div>
    ${numberBlock(data, now)}
    <div class="as-chart-wrap">${activeChart(lastMonths(data.history, now.toISOString()))}</div>
    ${privacyNote()}`;
}

/** Diálogo "Atualizar": campo numérico com validação por campo (também vinda do servidor) e o aviso de privacidade. */
export async function openActiveDialog({ api, current }) {
  let saved = null;
  const ok = await openFormDialog({
    title: 'Atualizar minhas alunas ativas',
    description: PRIVACY_NOTE,
    submitLabel: 'Salvar número',
    busyLabel: 'Salvando…',
    body: field({
      id: 'active-count',
      name: 'count',
      label: 'Quantas alunas ativas você tem hoje?',
      type: 'text',
      inputmode: 'numeric',
      value: Number.isInteger(current) ? String(current) : '',
      required: true,
      autocomplete: 'off',
      maxlength: 7,
      hint: `Número inteiro, de 0 a ${ACTIVE_MAX.toLocaleString('pt-BR')}.`,
    }),
    validators: { count: (value) => {
      const parsed = parseCount(value);
      return parsed.ok ? null : parsed.message;
    } },
    onSubmit: async (values) => {
      const parsed = parseCount(values.count);
      saved = await api.put('/api/v1/account/active-students', { count: parsed.ok ? parsed.value : values.count });
    },
  });
  return ok ? saved : null;
}

/**
 * Cartão "Minhas alunas ativas" do Painel da aluna. Carrega sozinho (falha só este cartão), tenta de novo e atualiza no lugar.
 * Devolve `dispose`.
 */
export function mountActiveCard({ host, api, now = () => new Date() }) {
  let disposed = false;
  let state = { status: 'loading' };
  let seq = 0;

  function paint({ focusUpdate = false } = {}) {
    mount(host, cardBody(state, now()));
    if (focusUpdate) host.querySelector('[data-action="update"]')?.focus();
  }

  async function load() {
    const mine = ++seq;
    state = { status: 'loading' };
    paint();
    try {
      const data = await api.get('/api/v1/account/active-students');
      if (disposed || mine !== seq) return;
      state = { status: 'ready', data };
    } catch (error) {
      if (disposed || mine !== seq) return;
      // 404: servidor ainda sem a rota (versão antiga): o cartão simplesmente não aparece, sem alerta de erro.
      state = error?.status === 404 ? { status: 'unavailable' } : { status: 'error', message: describeError(error) };
    }
    host.hidden = state.status === 'unavailable';
    paint();
  }

  async function update() {
    const saved = await openActiveDialog({ api, current: state.data?.count });
    if (disposed) return;
    if (saved) {
      state = { status: 'ready', data: saved };
      toast('Número de alunas ativas atualizado.', { tone: 'success' });
    }
    paint({ focusUpdate: true });
  }

  host.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'retry') load();
    else if (action === 'update') update();
  });
  load();
  return () => {
    disposed = true;
  };
}
