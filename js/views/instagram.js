import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { formatDateOnly } from '../lib/format.js';
import { html } from '../lib/html.js';
import { deltaTone, formatCount, formatPct, instagramBars, rangeLabel, signedCount, signedPct, signedPoints } from '../lib/marketing.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, emptyState, skeleton } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { attachForm } from '../ui/form.js';
import { MARKETING_EYEBROW, marketingTabs } from '../ui/marketing-tabs.js';
import { actionMenu } from '../ui/menu.js';
import { dataTable } from '../ui/table.js';
import { toast } from '../ui/toast.js';
import { INSTAGRAM_VALIDATORS, instagramBody, instagramFields, openInstagramDialog, wireEngagementPreview } from './marketing-ui.js';

const HISTORY_LIMIT = 24;

const SOURCE_LABELS = { manual: 'Lançamento manual' };

function comparisonCard(rows, growth) {
  const last = rows[0];
  if (!last) return '';
  const items = [
    { label: 'Seguidores', value: formatCount(last.followers), delta: growth?.followersDelta, text: growth ? `${signedCount(growth.followersDelta)} (${signedPct(growth.followersPct)})` : '' },
    { label: 'Alcance', value: formatCount(last.reach), delta: growth?.reachPct, text: growth ? signedPct(growth.reachPct) : '' },
    { label: 'Engajamento', value: formatPct(last.engagementRate), delta: growth?.engagementDelta, text: growth ? signedPoints(growth.engagementDelta) : '' },
  ];
  return html`<section class="lead-card" aria-labelledby="ig-compare-title">
    <div class="od-card-head"><h2 id="ig-compare-title" class="lead-card-title">Último período</h2><span class="od-card-count">${rangeLabel(last.periodStart, last.periodEnd)}</span></div>
    <dl class="mk-mini">${items.map(
      (i) => html`<div><dt>${i.label}</dt><dd>${i.value}</dd>${growth && i.delta !== null && i.delta !== undefined ? html`<dd class="mk-delta">${badge(i.text, deltaTone(i.delta))}<span class="sr-only"> em relação ao período anterior</span></dd>` : ''}</div>`,
    )}</dl>
    <p class="rp-foot">${growth ? 'Comparado com o período anterior lançado.' : 'Lance mais um período para comparar com o anterior.'}</p>
  </section>`;
}

function chartCard(rows) {
  const bars = instagramBars(rows);
  if (bars.length < 2) return '';
  return html`<section class="lead-card" aria-labelledby="ig-chart-title">
    <div class="od-card-head"><h2 id="ig-chart-title" class="lead-card-title">Seguidores e alcance</h2></div>
    <p class="mk-legend" aria-hidden="true"><span class="mk-swatch is-inv"></span>Seguidores <span class="mk-swatch is-rev"></span>Alcance (cada um na própria escala)</p>
    <div class="mk-columns" aria-hidden="true">${bars.map(
      (b) => html`<div class="mk-col"><div class="mk-col-bars"><span class="mk-vbar is-inv" data-h="${b.followersHeight}"></span><span class="mk-vbar is-rev" data-h="${b.reachHeight}"></span></div><span class="mk-col-label">${formatDateOnly(b.periodEnd).slice(0, 5)}</span></div>`,
    )}</div>
    <p class="rp-foot">Os números de cada período estão no histórico abaixo.</p>
  </section>`;
}

const rowMenu = (row) =>
  actionMenu({
    label: `Mais ações do período ${rangeLabel(row.periodStart, row.periodEnd)}`,
    id: row.id,
    items: [
      { label: 'Editar', action: 'edit', id: row.id },
      { separator: true },
      { label: 'Excluir', action: 'delete', id: row.id, tone: 'danger' },
    ],
  });

const COLUMNS = [
  { key: 'period', label: 'Período', nowrap: true, render: (r) => html`<span class="fin-due"><span>${rangeLabel(r.periodStart, r.periodEnd)}</span><span class="fin-due-rel">${SOURCE_LABELS[r.source] ?? 'Lançamento manual'}</span></span>` },
  { key: 'followers', label: 'Seguidores', align: 'end', nowrap: true, render: (r) => formatCount(r.followers) },
  { key: 'newFollowers', label: 'Novos', align: 'end', nowrap: true, optional: true, render: (r) => formatCount(r.newFollowers) },
  { key: 'reach', label: 'Alcance', align: 'end', nowrap: true, render: (r) => formatCount(r.reach) },
  { key: 'impressions', label: 'Impressões', align: 'end', nowrap: true, optional: true, render: (r) => formatCount(r.impressions) },
  { key: 'interactions', label: 'Interações', align: 'end', nowrap: true, optional: true, render: (r) => formatCount(r.interactions) },
  { key: 'engagementRate', label: 'Engajamento', align: 'end', nowrap: true, render: (r) => formatPct(r.engagementRate) },
  { key: 'profileVisits', label: 'Visitas', align: 'end', nowrap: true, optional: true, render: (r) => formatCount(r.profileVisits) },
  { key: 'linkClicks', label: 'Cliques', align: 'end', nowrap: true, optional: true, render: (r) => formatCount(r.linkClicks) },
  { key: 'leads', label: 'Leads', align: 'end', nowrap: true, render: (r) => formatCount(r.leads) },
  { key: 'actions', label: 'Ações', nowrap: true, render: rowMenu },
];

export function renderInstagram({ root, session, api, navigate }) {
  let disposed = false;
  let seq = 0;
  let rows = [];
  let busy = false;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'marketing',
    heading: 'Instagram',
    eyebrow: MARKETING_EYEBROW,
    subtitle: 'Lance os números do perfil por período e acompanhe a evolução.',
    content: html`${marketingTabs('instagram')}
      <div class="cc-soon mk-manual">${icon('info', { size: 18 })}<p><strong>Lançamento manual.</strong> Nenhuma conta do Instagram está conectada ao Hub: copie os números do painel profissional do Instagram para cá. Nada é enviado ao Instagram.</p></div>
      <div class="lead-grid mk-ig-grid">
        <section class="lead-card" aria-labelledby="ig-form-title">
          <h2 id="ig-form-title" class="lead-card-title">Lançar período</h2>
          <form id="ig-form" novalidate aria-labelledby="ig-form-title">
            <div class="form-banner" id="ig-form-banner"></div>
            ${instagramFields(null, 'ig')}
            <div class="cc-form-actions"><button type="submit" class="btn btn-primary" data-busy-label="Salvando…"><span class="spinner" aria-hidden="true" hidden></span><span>Lançar período</span></button></div>
          </form>
        </section>
        <div class="lead-side" id="ig-side"></div>
      </div>
      <section class="lead-card fin-card mk-history" aria-labelledby="ig-history-title">
        <div class="od-card-head"><h2 id="ig-history-title" class="lead-card-title">Histórico</h2></div>
        <div id="ig-history" aria-live="off">${skeleton(3)}</div>
      </section>`,
  });

  const side = root.querySelector('#ig-side');
  const history = root.querySelector('#ig-history');
  const form = root.querySelector('#ig-form');

  async function load() {
    const mine = ++seq;
    try {
      const result = await api.get(`/api/v1/marketing/instagram?limit=${HISTORY_LIMIT}`);
      if (disposed || mine !== seq) return;
      rows = Array.isArray(result?.rows) ? result.rows : [];
      mount(side, html`${comparisonCard(rows, result?.growth ?? null)}${chartCard(rows)}`);
      mount(
        history,
        rows.length === 0
          ? emptyState({ iconName: 'camera', title: 'Nenhum período lançado', message: 'Use o formulário para lançar o primeiro período (uma semana, um mês…).' })
          : dataTable({ caption: 'Períodos lançados do Instagram, do mais recente ao mais antigo', columns: COLUMNS, rows }),
      );
      applySizes(side);
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(history, html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar o histórico', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`);
    }
  }

  wireEngagementPreview(form, 'ig');
  attachForm(form, {
    validators: INSTAGRAM_VALIDATORS,
    async onSubmit(values, formApi) {
      const banner = form.querySelector('#ig-form-banner');
      mount(banner, html``);
      try {
        await api.post('/api/v1/marketing/instagram', instagramBody(values));
        if (disposed) return;
        form.reset();
        form.dispatchEvent(new Event('input'));
        toast('Período lançado.', { tone: 'success' });
        await load();
      } catch (error) {
        if (disposed) return;
        const orphan = formApi.applyServerErrors(error?.errors);
        const message = error?.code === 'period_overlap' ? (error.detail || 'Este período se sobrepõe a outro já lançado. Ajuste as datas ou edite o período existente.') : (orphan[0] ?? (error?.errors?.length ? null : describeError(error)));
        if (message) mount(banner, alert({ tone: 'danger', message }));
      }
    },
  });

  async function edit(row) {
    const outcome = await openInstagramDialog({ api, entry: row });
    if (disposed) return;
    if (outcome.saved) toast('Período atualizado.', { tone: 'success' });
    if (outcome.saved || outcome.hadFailure) await load();
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Excluir este período?', message: `Os números de ${rangeLabel(row.periodStart, row.periodEnd)} saem do histórico e da comparação. Esta ação não pode ser desfeita.`, confirmLabel: 'Excluir', tone: 'danger' });
    if (!ok || disposed) return;
    try {
      await api.delete(`/api/v1/marketing/instagram/${encodeURIComponent(row.id)}`);
      if (!disposed) toast('Período excluído.', { tone: 'success' });
    } catch (error) {
      if (!disposed) toast(describeError(error), { tone: 'danger' });
    }
    await load();
  }

  history.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'retry') return void load();
    const row = rows.find((r) => r.id === target.dataset.id);
    if (!row || busy) return;
    busy = true;
    try {
      if (target.dataset.action === 'edit') await edit(row);
      else if (target.dataset.action === 'delete') await remove(row);
    } finally {
      busy = false;
    }
  });

  load();
  return () => {
    disposed = true;
    disposeShell();
  };
}
