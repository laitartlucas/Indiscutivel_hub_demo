import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { brl, dateBR, monthLong, monthTitle, needsReload, padGoldText, revenueErrorMessage } from '../lib/revenue.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { announceChanges, entriesList, eventsList, milestoneCard, openRevenueDialog, revenueChart, selfDeclaredBadge } from './revenue-ui.js';

// Meu faturamento (aluna, #/faturamento): o faturamento que ELA declara mês a mês (separado das vendas do Comercial),
// o acumulado desde a entrada na mentoria, a trilha dos marcos 10k/30k/50k/100k + PAD GOLD, o gráfico mensal ×
// acumulado, a lista por mês (editar/excluir) e o histórico de alterações. O servidor calcula tudo; a tela só mostra.

export function renderRevenue({ root, session, api, navigate }) {
  let disposed = false;
  let seq = 0;
  let busy = false;
  let data = null;

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'revenue',
    heading: 'Meu faturamento',
    eyebrow: 'Crescimento',
    subtitle: 'Informe quanto faturou em cada mês e acompanhe os seus marcos de faturamento.',
    actions: button({ label: 'Lançar faturamento', id: 'rv-new', iconStart: icon('plus', { size: 16 }), disabled: true }),
    content: html`<p class="rv-intro rv-intro-page">${selfDeclaredBadge()}<span>É o valor que você informa, separado das vendas registradas no Comercial.</span></p>
      <p class="sr-only" id="rv-status" role="status" aria-live="polite"></p>
      <div class="growth" id="rv-body" aria-busy="true">${skeleton(5)}</div>`,
  });

  const body = root.querySelector('#rv-body');
  const status = root.querySelector('#rv-status');
  const newButton = root.querySelector('#rv-new');

  function announce(text) {
    status.textContent = '';
    // Troca no próximo quadro para o leitor de tela anunciar mesmo quando a frase se repete.
    requestAnimationFrame(() => {
      if (!disposed) status.textContent = text;
    });
  }

  function paint() {
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    const events = Array.isArray(data?.events) ? data.events : [];
    mount(body, html`<dl class="rv-facts rv-facts-page">
        <div><dt>Acumulado desde a entrada</dt><dd>${brl(data?.total)}</dd></div>
        <div><dt>Entrada na mentoria</dt><dd>${monthTitle(data?.entryMonth)}</dd></div>
        <div><dt>Meses lançados</dt><dd>${Number.isInteger(data?.monthCount) ? data.monthCount.toLocaleString('pt-BR') : '—'}</dd></div>
        <div><dt>Situação</dt><dd>${padGoldText(data?.padGold)}</dd></div>
      </dl>
      ${milestoneCard(data, { headingId: 'rv-ms-title', note: 'Um marco alcançado nunca é apagado. Se uma correção deixar o acumulado abaixo dele, ele fica "Em revisão" (com a data original guardada) e volta a valer sozinho quando o acumulado passar de novo.' })}
      ${revenueChart(entries, { title: 'Mês a mês', headingId: 'rv-chart-title' })}
      <section class="growth-card rv-card" aria-labelledby="rv-list-title">
        <div class="growth-card-head"><h2 id="rv-list-title">Lançamentos por mês</h2><span class="growth-card-note">${data?.lastEntryAt ? `Último em ${dateBR(data.lastEntryAt)}` : ''}</span></div>
        ${entries.length
          ? entriesList(entries, { editable: true })
          : emptyState({ iconName: 'metas', title: 'Nenhum lançamento ainda', message: `Comece pelo mês atual ou por qualquer mês desde ${monthLong(data?.entryMonth)}, quando você entrou na mentoria.`, action: button({ label: 'Lançar faturamento', extra: { 'data-action': 'rv-new' } }) })}
      </section>
      <section class="growth-card rv-card" aria-labelledby="rv-history-title">
        <div class="growth-card-head"><h2 id="rv-history-title">Histórico de alterações</h2><span class="growth-card-note">Inclusões, edições e exclusões</span></div>
        ${eventsList(events)}
      </section>`);
    applySizes(body);
    newButton.disabled = false;
  }

  async function load() {
    const mine = ++seq;
    body.setAttribute('aria-busy', 'true');
    try {
      const result = await api.get('/api/v1/revenue');
      if (disposed || mine !== seq) return;
      data = result;
      paint();
    } catch (error) {
      if (disposed || mine !== seq) return;
      mount(body, html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar o seu faturamento', message: revenueErrorMessage(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`);
    }
    body.setAttribute('aria-busy', 'false');
  }

  /** Aplica o corpo devolvido por PUT/DELETE (o mesmo do GET + changes) e mostra os avisos. */
  function applyResult(result, message) {
    if (result && Array.isArray(result.entries)) {
      data = result;
      paint();
    } else void load();
    announce(message);
    announceChanges(result?.changes);
  }

  async function openDialog(month = null) {
    if (busy || !data) return;
    busy = true;
    try {
      const entry = month ? (data.entries ?? []).find((e) => e.month === month) ?? null : null;
      const { saved, hadFailure, result, month: savedMonth } = await openRevenueDialog({ api, summary: data, entry });
      if (disposed) return;
      if (saved) {
        const message = `Faturamento ${savedMonth ? `de ${monthLong(savedMonth)} ` : ''}salvo. Acumulado: ${brl(result?.total ?? data.total)}.`;
        toast(message, { tone: 'success' });
        applyResult(result, message);
        const focusTarget = savedMonth ? body.querySelector(`[data-action="rv-edit"][data-month="${CSS.escape(savedMonth)}"]`) : null;
        (focusTarget ?? newButton).focus();
      } else if (hadFailure) await load();
    } finally {
      busy = false;
    }
  }

  async function remove(month) {
    const entry = (data?.entries ?? []).find((e) => e.month === month);
    if (!entry || busy) return;
    busy = true;
    try {
      const ok = await confirmDialog({
        title: `Excluir ${monthLong(month)}?`,
        message: `O lançamento de ${brl(entry.amount)} sai do acumulado. A exclusão fica registrada no histórico. Se o acumulado ficar abaixo de um marco já alcançado, ele passa a "Em revisão".`,
        confirmLabel: 'Excluir lançamento',
        tone: 'danger',
      });
      if (!ok || disposed) return;
      try {
        const result = await api.delete(`/api/v1/revenue/${encodeURIComponent(month)}?version=${encodeURIComponent(entry.version)}`);
        if (disposed) return;
        const message = `Lançamento de ${monthLong(month)} excluído.`;
        toast(message, { tone: 'success' });
        applyResult(result, message);
        newButton.focus();
      } catch (error) {
        if (disposed) return;
        toast(revenueErrorMessage(error), { tone: 'danger' });
        if (needsReload(error)) await load();
      }
    } finally {
      busy = false;
    }
  }

  newButton.addEventListener('click', () => openDialog());
  body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, month } = target.dataset;
    if (action === 'retry') load();
    else if (action === 'rv-new') openDialog();
    else if (action === 'rv-edit') openDialog(month);
    else if (action === 'rv-delete') remove(month);
  });

  load();

  return () => {
    disposed = true;
    dispose();
  };
}
