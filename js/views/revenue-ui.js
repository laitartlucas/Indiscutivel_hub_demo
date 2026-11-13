import { ApiError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { moneyToInputText } from '../../shared/money.js';
import {
  MILESTONES,
  NOTE_MAX,
  PAD_GOLD_LABEL,
  PAD_GOLD_MILESTONE,
  amountValue,
  brl,
  changeNotices,
  chartSeries,
  cumulativePoints,
  dateBR,
  eventText,
  milestonePct,
  milestoneShort,
  milestoneStatusMeta,
  milestoneText,
  monthError,
  monthLong,
  monthRange,
  monthTitle,
  nextText,
  noteError,
  padGoldStatus,
  padGoldText,
  revenueAmountError,
  revenueErrorMessage,
  revenueListHash,
} from '../lib/revenue.js';
import { buildQuery } from '../lib/query.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { alert, badge, button, emptyState, skeleton } from '../ui/components.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';
import { toast } from '../ui/toast.js';

// Peças compartilhadas do Faturamento autodeclarado (aluna e mentora): a trilha dos marcos + PAD GOLD, o gráfico mensal ×
// acumulado, a lista de lançamentos, o histórico e o diálogo de lançamento. Os números vêm do servidor.

let counter = 0;
const uid = (prefix) => `${prefix}-${++counter}`;

// ---------------------------------------------------------------- trilha dos marcos

function stateIcon(status) {
  return html`<span class="rv-ms-icon" aria-hidden="true">${icon(milestoneStatusMeta(status).icon, { size: 18, stroke: 2 })}</span>`;
}

function progressBar(pct, label) {
  return html`<div class="xp-track xp-track-sm rv-ms-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${label}"><div${attrs({ class: 'xp-fill', 'data-w': String(pct) })}></div></div>`;
}

function milestoneItem(m, total) {
  const t = milestoneText(m, total);
  const pct = milestonePct(total, m.milestone);
  return html`<li${attrs({ class: `rv-ms is-${t.status === 'in_review' ? 'review' : t.status}`, 'data-milestone': String(m.milestone) })}>
    ${stateIcon(t.status)}
    <div class="rv-ms-body">
      <p class="rv-ms-name">${t.title}</p>
      <p class="rv-ms-state">${t.label}</p>
      <p class="rv-ms-detail">${t.detail}</p>
      ${t.original ? html`<p class="rv-ms-detail">${t.original}</p>` : ''}
      ${t.status === 'locked' ? progressBar(pct, `${t.title}: ${pct}% do marco`) : ''}
    </div>
  </li>`;
}

function padGoldItem(summary) {
  const status = padGoldStatus(summary?.padGold);
  const hundred = (summary?.milestones ?? []).find((m) => Number(m.milestone) === PAD_GOLD_MILESTONE) ?? { milestone: PAD_GOLD_MILESTONE, status: 'locked', gap: null };
  const pct = milestonePct(summary?.total, PAD_GOLD_MILESTONE);
  let detail;
  if (status === 'active') detail = `Alcançado em ${dateBR(summary.padGold.reachedAt)}`;
  else if (status === 'in_review') detail = milestoneText({ ...hundred, status: 'in_review' }, summary?.total).detail;
  else detail = 'Vem junto com o marco de R$ 100 mil';
  return html`<li${attrs({ class: `rv-ms rv-ms-gold is-${status === 'in_review' ? 'review' : status}`, 'data-milestone': 'pad_gold' })}>
    <span class="rv-ms-icon" aria-hidden="true">${icon(status === 'locked' ? 'lock' : status === 'in_review' ? 'alert' : 'gem', { size: 18, stroke: 2 })}</span>
    <div class="rv-ms-body">
      <p class="rv-ms-name">${PAD_GOLD_LABEL}</p>
      <p class="rv-ms-state">${status === 'active' ? 'Status ativo' : milestoneStatusMeta(status).label}</p>
      <p class="rv-ms-detail">${detail}</p>
      ${status === 'locked' ? progressBar(pct, `${PAD_GOLD_LABEL}: ${pct}% do caminho`) : ''}
    </div>
  </li>`;
}

/** Só a lista da trilha (4 marcos + PAD GOLD). */
export function milestoneList(summary, { label = 'Marcos de faturamento' } = {}) {
  const byValue = new Map((summary?.milestones ?? []).map((m) => [Number(m.milestone), m]));
  const list = MILESTONES.map((base) => ({ ...base, status: 'locked', gap: null, ...(byValue.get(base.milestone) ?? {}) }));
  return html`<ol class="rv-track" aria-label="${label}">${list.map((m) => milestoneItem(m, summary?.total))}${padGoldItem(summary)}</ol>`;
}

/**
 * Cartão "Marcos de faturamento": acumulado, próxima conquista e a trilha com as três situações (alcançado, em revisão,
 * bloqueado), sempre com texto e ícone além da cor. `action` (opcional) vai no cabeçalho.
 */
export function milestoneCard(summary, { title = 'Marcos de faturamento', headingId = uid('rv-ms-title'), action = '', note = '' } = {}) {
  return html`<section class="growth-card rv-card" aria-labelledby="${headingId}">
    <div class="growth-card-head"><h2 id="${headingId}">${title}</h2>${action || html`<span class="growth-card-note">Acumulado: <strong>${brl(summary?.total)}</strong></span>`}</div>
    <p class="rv-next">${icon('arrowRight', { size: 16 })}<span>${nextText(summary?.next)}</span></p>
    ${milestoneList(summary)}
    ${note ? html`<p class="rv-foot">${note}</p>` : ''}
  </section>`;
}

// ---------------------------------------------------------------- gráfico mensal × acumulado

/** Colunas = faturamento do mês; linha dourada = acumulado (mesma escala). Tabela equivalente para leitor de tela. */
export function revenueChart(entries, { title = 'Evolução', headingId = uid('rv-chart-title'), limit = 12 } = {}) {
  const series = chartSeries(entries, { limit });
  return html`<section class="growth-card rv-card" aria-labelledby="${headingId}">
    <div class="growth-card-head"><h2 id="${headingId}">${title}</h2><span class="growth-card-note">${series.length ? `Últimos ${series.length} ${series.length === 1 ? 'mês' : 'meses'}` : ''}</span></div>
    ${series.length === 0
      ? html`<p class="muted rv-none">O gráfico aparece quando houver lançamentos que contam para o acumulado.</p>`
      : html`<p class="rv-legend" aria-hidden="true"><span class="rv-swatch is-month"></span>Faturamento do mês <span class="rv-swatch is-cum"></span>Acumulado</p>
        <div class="rv-chart" aria-hidden="true">
          <div class="rv-plot">
            <div class="rv-cols">${series.map((p) => html`<div class="rv-col"><span class="rv-vbar" data-h="${p.monthHeight}"></span></div>`)}</div>
            <svg class="rv-line" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false"><polyline points="${cumulativePoints(series)}"></polyline></svg>
          </div>
          <div class="rv-axis">${series.map((p) => html`<span>${p.label}</span>`)}</div>
        </div>
        <div class="sr-only"><table><caption>Faturamento autodeclarado por mês e acumulado</caption><thead><tr><th scope="col">Mês</th><th scope="col">No mês</th><th scope="col">Acumulado</th></tr></thead>
          <tbody>${series.map((p) => html`<tr><th scope="row">${monthLong(p.month)}</th><td>${brl(p.amount)}</td><td>${brl(p.cumulative)}</td></tr>`)}</tbody></table></div>`}
  </section>`;
}

// ---------------------------------------------------------------- lançamentos e histórico

/** Lista por mês (mais recente primeiro). `editable`: botões Editar/Excluir (só a aluna). `limit`: só os N primeiros. */
export function entriesList(entries, { editable = false, limit = 0 } = {}) {
  const list = (Array.isArray(entries) ? entries : []).slice(0, limit || undefined);
  if (list.length === 0) return '';
  return html`<ul class="rv-entries">${list.map(
    (e) => html`<li${attrs({ class: `rv-entry${e.counts ? '' : ' is-out'}`, 'data-month': e.month })}>
      <div class="rv-entry-main">
        <p class="rv-entry-month">${monthTitle(e.month)}${e.counts ? '' : html` ${badge('Fora do período', 'neutral')}`}</p>
        <p class="rv-entry-amount">${brl(e.amount)}</p>
        <p class="rv-entry-cum">${e.counts ? html`Acumulado até aqui: <strong>${brl(e.cumulative)}</strong>` : 'Antes da entrada na mentoria: guardado, mas não conta no acumulado.'}</p>
        ${e.note ? html`<p class="rv-entry-note">${e.note}</p>` : ''}
      </div>
      ${editable
        ? html`<div class="rv-entry-actions">
            <button${attrs({ type: 'button', class: 'btn btn-ghost btn-sm', 'data-action': 'rv-edit', 'data-month': e.month, 'aria-label': `Editar ${monthLong(e.month)}` })}>${icon('edit', { size: 15 })}<span>Editar</span></button>
            <button${attrs({ type: 'button', class: 'btn btn-ghost btn-sm', 'data-action': 'rv-delete', 'data-month': e.month, 'aria-label': `Excluir ${monthLong(e.month)}` })}>${icon('trash', { size: 15 })}<span>Excluir</span></button>
          </div>`
        : ''}
    </li>`,
  )}</ul>`;
}

/** Histórico de alterações (inclusões, edições e exclusões), mais recente primeiro. */
export function eventsList(events) {
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) return html`<p class="muted rv-none">Nenhuma alteração registrada ainda.</p>`;
  return html`<ol class="rv-events">${list.map(
    (e) => html`<li class="rv-event"><span${attrs({ class: `rv-event-dot is-${e.kind === 'deleted' ? 'deleted' : e.kind === 'created' ? 'created' : 'updated'}`, 'aria-hidden': 'true' })}></span><span class="rv-event-text">${eventText(e)}</span><time class="rv-event-when" datetime="${e.at ?? ''}">${dateBR(e.at)}</time></li>`,
  )}</ol>`;
}

/** Selo "Autodeclarado" (texto + ícone). */
export const selfDeclaredBadge = () => html`<span class="rv-self">${icon('edit', { size: 14 })}<span>Autodeclarado</span></span>`;

// ---------------------------------------------------------------- avisos depois de gravar

/** Mostra os avisos de `changes` (alcançado = comemoração; revisão / voltou a valer = aviso neutro). */
export function announceChanges(changes) {
  // O tom premium tem segunda linha própria; nos demais a explicação vai junto da frase.
  for (const n of changeNotices(changes)) {
    if (n.tone === 'premium') toast(n.message, { tone: 'premium', detail: n.detail, timeout: 8000 });
    else toast(`${n.message}. ${n.detail}`, { tone: n.tone, timeout: 10000 });
  }
}

// ---------------------------------------------------------------- diálogo de lançamento (aluna)

function friendly(error) {
  if (!(error instanceof ApiError)) return error;
  const detail = revenueErrorMessage(error);
  const errors = [...(error.errors ?? [])];
  // 400 sem erro de campo, mas sobre o mês: leva a mensagem para o campo do mês.
  if (error.status === 400 && errors.length === 0 && (error.code === 'month' || /month|mês/i.test(String(error.detail ?? '')))) errors.push({ field: 'month', message: detail });
  return new ApiError({ status: error.status >= 500 ? 400 : error.status, code: error.code, detail, errors, requestId: error.requestId });
}

/**
 * Lançar (ou editar) o faturamento de um mês. `entry` presente = edição daquele mês (o mês não muda).
 * Resolve `{ saved, hadFailure, result }` (o corpo devolvido pelo PUT, com `changes`).
 */
export async function openRevenueDialog({ api, summary, entry = null }) {
  const entries = Array.isArray(summary?.entries) ? summary.entries : [];
  const months = monthRange(summary?.entryMonth);
  const firstFree = months.find((m) => !entries.some((e) => e.month === m)) ?? months[0] ?? '';
  const monthField = entry
    ? html`<div class="field"><p class="field-label">Mês</p><p class="rv-fixed-month">${monthTitle(entry.month)}</p><input type="hidden" name="month" value="${entry.month}"></div>`
    : html`<div class="field">
        <label class="field-label" for="rv-month">Mês</label>
        <div class="field-control"><select${attrs({ id: 'rv-month', name: 'month', class: 'field-input', required: true, 'aria-required': 'true', 'aria-describedby': 'rv-month-hint rv-month-error' })}>
          ${months.map((m) => html`<option${attrs({ value: m, selected: m === firstFree })}>${monthTitle(m)}${entries.some((e) => e.month === m) ? ' (já lançado)' : ''}</option>`)}
        </select></div>
        <p class="field-hint" id="rv-month-hint">${summary?.entryMonth ? `De ${monthLong(summary.entryMonth)} (sua entrada na mentoria) até o mês atual. Se o mês já tiver lançamento, o valor é substituído.` : 'Até o mês atual.'}</p>
        <p class="field-error" id="rv-month-error" role="alert"></p>
      </div>`;
  let result = null;
  let savedMonth = null;
  const { saved, hadFailure } = await openTrackedFormDialog({
    title: entry ? `Editar ${monthLong(entry.month)}` : 'Lançar faturamento',
    description: 'Informe quanto você faturou no mês. É o valor que você declara, separado das vendas do Comercial.',
    submitLabel: entry ? 'Salvar alteração' : 'Lançar',
    busyLabel: 'Salvando…',
    body: html`${monthField}
      <div class="field">
        <label class="field-label" for="rv-amount">Valor faturado no mês (R$)</label>
        <div class="field-control"><input${attrs({ id: 'rv-amount', name: 'amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'field-input', value: entry ? moneyToInputText(String(entry.amount)) : '', placeholder: '0,00', required: true, 'aria-required': 'true', 'aria-describedby': 'rv-amount-hint rv-amount-error' })}></div>
        <p class="field-hint" id="rv-amount-hint">Exemplo: 12.500,00. Use 0 se não faturou no mês.</p>
        <p class="field-error" id="rv-amount-error" role="alert"></p>
      </div>
      <div class="field">
        <label class="field-label" for="rv-note">Observação (opcional)</label>
        <div class="field-control"><textarea${attrs({ id: 'rv-note', name: 'note', class: 'field-input jr-textarea', rows: '3', maxlength: String(NOTE_MAX), 'aria-describedby': 'rv-note-hint rv-note-error' })}>${entry?.note ?? ''}</textarea></div>
        <p class="field-hint" id="rv-note-hint">Até ${NOTE_MAX} caracteres. A sua mentora também vê.</p>
        <p class="field-error" id="rv-note-error" role="alert"></p>
      </div>`,
    validators: {
      month: (value) => monthError(value, { entryMonth: summary?.entryMonth }),
      amount: revenueAmountError,
      note: noteError,
    },
    onSubmit: async (values) => {
      const month = values.month;
      const existing = entry ?? entries.find((e) => e.month === month) ?? null;
      const body = { amount: amountValue(values.amount), note: values.note.trim() };
      if (existing) body.version = existing.version;
      try {
        result = await api.put(`/api/v1/revenue/${encodeURIComponent(month)}`, body);
        savedMonth = month;
      } catch (error) {
        throw friendly(error);
      }
    },
  });
  return { saved, hadFailure, result, month: savedMonth };
}

// ---------------------------------------------------------------- blocos montados (Conquistas e perfil da aluna)

function retryBlock(action, message) {
  return html`<div class="stack">${alert({ tone: 'danger', message })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', small: true, extra: { 'data-action': action } })}</div></div>`;
}

/** Bloco "Marcos de faturamento" da tela Conquistas (aluna). Devolve a limpeza. */
export function mountRevenueMilestones({ host, api }) {
  let disposed = false;
  let seq = 0;
  mount(host, html`<div aria-busy="true">${skeleton(2)}</div>`);

  async function load() {
    const mine = ++seq;
    try {
      const data = await api.get('/api/v1/revenue');
      if (disposed || mine !== seq) return;
      mount(host, milestoneCard(data, {
        title: 'Marcos de faturamento',
        headingId: 'ach-rv-title',
        action: html`<a class="jr-head-link" href="#/faturamento">Meu faturamento${icon('arrowRight', { size: 15 })}</a>`,
        note: html`Calculado pelo faturamento que você declara em Meu faturamento (acumulado: <strong>${brl(data?.total)}</strong>).`,
      }));
      applySizes(host);
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(host, html`<section class="growth-card rv-card" aria-labelledby="ach-rv-title"><div class="growth-card-head"><h2 id="ach-rv-title">Marcos de faturamento</h2></div>${retryBlock('rv-retry', revenueErrorMessage(error))}</section>`);
    }
  }

  host.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="rv-retry"]')) load();
  });
  load();
  return () => {
    disposed = true;
  };
}

const PROFILE_ENTRIES = 3;

/** Cartão "Faturamento" no perfil da aluna (mentora com revenue.view). Somente leitura. Devolve a limpeza. */
export function mountStudentRevenue({ host, api, student }) {
  let disposed = false;
  let seq = 0;
  const listHref = revenueListHash({ q: student.name });

  mount(host, html`<section class="growth-card rv-card rv-profile" aria-labelledby="spr-title">
    <div class="growth-card-head"><h2 id="spr-title">Faturamento</h2><a class="jr-head-link" href="${listHref}">Ver na lista${icon('arrowRight', { size: 15 })}</a></div>
    <div id="spr-body" aria-busy="true">${skeleton(3)}</div>
  </section>`);
  const body = host.querySelector('#spr-body');

  function paint(data) {
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    mount(body, html`<p class="rv-intro">${selfDeclaredBadge()}<span>Valor informado pela aluna, separado das vendas do Comercial.</span></p>
      <dl class="rv-facts">
        <div><dt>Acumulado</dt><dd>${brl(data?.total)}</dd></div>
        <div><dt>Entrada na mentoria</dt><dd>${monthTitle(data?.entryMonth)}</dd></div>
        <div><dt>Último lançamento</dt><dd>${data?.lastEntryAt ? dateBR(data.lastEntryAt) : '—'}</dd></div>
        <div><dt>Situação</dt><dd>${padGoldText(data?.padGold)}</dd></div>
      </dl>
      <p class="rv-next">${icon('arrowRight', { size: 16 })}<span>${nextText(data?.next)}</span></p>
      ${milestoneList(data, { label: `Marcos de faturamento de ${student.name}` })}
      ${revenueChart(entries, { title: 'Evolução', headingId: 'spr-chart-title' })}
      <div class="rv-sub">
        <h3 class="eyebrow eyebrow-muted">Últimos lançamentos</h3>
        ${entries.length ? entriesList(entries, { limit: PROFILE_ENTRIES }) : emptyState({ title: 'Nenhum lançamento ainda', message: `Quando ${student.name} informar o faturamento do mês, ele aparece aqui.` })}
      </div>`);
    applySizes(body);
  }

  async function load() {
    const mine = ++seq;
    body.setAttribute('aria-busy', 'true');
    try {
      const data = await api.get(`/api/v1/mentora/students/${encodeURIComponent(student.id)}/revenue`);
      if (disposed || mine !== seq) return;
      paint(data);
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(body, retryBlock('spr-retry', revenueErrorMessage(error)));
    }
    body.setAttribute('aria-busy', 'false');
  }

  body.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="spr-retry"]')) load();
  });
  load();
  return () => {
    disposed = true;
  };
}

const HIGHLIGHT_LIMIT = 5;

function highlightRows(rows, render) {
  return html`<ul class="rv-hl">${rows.map(
    (r) => html`<li><a class="rv-hl-link" href="#/alunas/${encodeURIComponent(r.studentId)}"><span class="rv-hl-name">${r.studentName}</span><span class="rv-hl-sub">${render(r)}</span></a></li>`,
  )}</ul>`;
}

/**
 * Cartão do Painel da mentora (só com revenue.view): PAD GOLD mais recentes e alunas com marco em revisão, com
 * atalhos para a lista filtrada. Devolve a limpeza.
 */
export function mountRevenueHighlights({ host, api, title = 'Faturamento das alunas' }) {
  let disposed = false;
  let seq = 0;
  mount(host, html`<section class="dash-card rv-home" aria-labelledby="mp-revenue-title" aria-busy="true">
    <div class="dash-card-head"><h2 id="mp-revenue-title">${title}</h2><a href="#/faturamento-alunas">Ver lista</a></div>
    <div id="mp-revenue-body">${skeleton(3)}</div>
  </section>`);
  const section = host.querySelector('section');
  const body = host.querySelector('#mp-revenue-body');

  function paint(gold, review) {
    const goldRows = [...(gold?.rows ?? [])].sort((a, b) => String(b.padGold?.reachedAt ?? '').localeCompare(String(a.padGold?.reachedAt ?? ''))).slice(0, HIGHLIGHT_LIMIT);
    const reviewRows = (review?.rows ?? []).slice(0, HIGHLIGHT_LIMIT);
    const summary = gold?.summary ?? review?.summary ?? {};
    const reviewed = (r) => (r.milestones ?? []).filter((m) => m.status === 'in_review').map((m) => milestoneShort(m.milestone));
    mount(body, html`<p class="rv-home-line">${selfDeclaredBadge()}<span>${Number.isInteger(summary.reachedThisMonth) ? `${summary.reachedThisMonth} ${summary.reachedThisMonth === 1 ? 'marco alcançado' : 'marcos alcançados'} neste mês` : 'Valores informados pelas alunas'}</span>${summary.total !== undefined && summary.total !== null ? html`<span class="rv-home-total">Acumulado declarado: <strong>${brl(summary.total)}</strong></span>` : ''}</p>
      <div class="rv-home-cols">
        <div class="rv-home-col">
          <h3 class="rv-home-cap">${icon('gem', { size: 16 })}<span>PAD GOLD</span>${Number.isInteger(summary.padGold) ? html` <span class="rv-home-count">${summary.padGold}</span>` : ''}</h3>
          ${goldRows.length ? highlightRows(goldRows, (r) => (padGoldStatus(r.padGold) === 'active' ? `desde ${dateBR(r.padGold.reachedAt)}` : 'em revisão')) : html`<p class="muted rv-none">Nenhuma aluna PAD GOLD ainda.</p>`}
          ${goldRows.length ? html`<a class="jr-head-link" href="${revenueListHash({ milestone: 'pad_gold' })}">Ver PAD GOLD${icon('arrowRight', { size: 15 })}</a>` : ''}
        </div>
        <div class="rv-home-col">
          <h3 class="rv-home-cap">${icon('alert', { size: 16 })}<span>Marcos em revisão</span>${Number.isInteger(summary.inReview) ? html` <span class="rv-home-count">${summary.inReview}</span>` : ''}</h3>
          ${reviewRows.length ? highlightRows(reviewRows, (r) => `${reviewed(r).join(', ') || 'marco'} em revisão`) : html`<p class="muted rv-none">Nenhum marco em revisão.</p>`}
          ${reviewRows.length ? html`<a class="jr-head-link" href="${revenueListHash({ milestone: 'in_review' })}">Ver em revisão${icon('arrowRight', { size: 15 })}</a>` : ''}
        </div>
      </div>`);
  }

  async function load() {
    const mine = ++seq;
    section.setAttribute('aria-busy', 'true');
    try {
      const [gold, review] = await Promise.all([
        api.get(`/api/v1/mentora/revenue${buildQuery({ milestone: 'pad_gold', limit: 20, offset: 0 })}`),
        api.get(`/api/v1/mentora/revenue${buildQuery({ milestone: 'in_review', limit: HIGHLIGHT_LIMIT, offset: 0 })}`),
      ]);
      if (disposed || mine !== seq) return;
      paint(gold, review);
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(body, retryBlock('mp-rv-retry', revenueErrorMessage(error)));
    }
    section.setAttribute('aria-busy', 'false');
  }

  body.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="mp-rv-retry"]')) load();
  });
  load();
  return () => {
    disposed = true;
  };
}
