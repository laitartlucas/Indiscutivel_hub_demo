import { ApiError, describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { categoryIcon, xpText } from '../lib/growth.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, button, emptyState, skeleton } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { confirmArchiveAchievement, openAchievementDialog } from './achievement-dialogs.js';

/** Gestão de conquistas (mentora, kit M-Conquistas): catálogo, critério fixo, ativar/desativar e quantas alunas desbloquearam. */

const nf = new Intl.NumberFormat('pt-BR');
// Regra medida pelo CRM da aluna: a API só informa 0 ou 3 ou mais; no meio vem null ("menos de 3"), para não isolar ninguém.
const countText = (n) => (n === null ? 'Menos de 3 alunas desbloquearam' : n === 1 ? '1 aluna desbloqueou' : `${nf.format(n)} alunas desbloquearam`);

function retryBlock(error) {
  return html`<div class="stack">${alert({ tone: 'danger', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;
}

function card(a) {
  return html`<li${attrs({ class: `mg-ach-card${a.active ? '' : ' is-off'}`, 'data-ach': a.id })}>
    <div class="mg-ach-head">
      <span class="mg-ach-medal" aria-hidden="true">${icon(categoryIcon(a.category), { size: 22, stroke: 1.4 })}</span>
      <div class="mg-ach-who"><h3 class="mg-ach-name">${a.title}</h3><span class="mg-ach-cat">${a.categoryLabel}${a.active ? '' : ' · desativada'}</span></div>
      <span class="mg-ach-switch"><button${attrs({ type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(a.active), 'aria-label': `Ativar ${a.title}`, 'data-action': 'toggle', 'data-id': a.id })}></button></span>
    </div>
    <p class="mg-criterion"><strong>Critério:</strong> ${a.criteria}</p>
    ${a.privateRule ? html`<p class="mg-criterion mp-muted">Critério medido pelo CRM da aluna: por privacidade, você vê só o total de desbloqueios, nunca quem.</p>` : ''}
    <div class="mg-ach-foot"><span class="mg-ach-count">${countText(a.unlockCount)}</span><span class="mg-ach-xp">${a.xpReward > 0 ? xpText(a.xpReward) : 'Sem XP'}</span></div>
    <div class="mg-ach-actions">${button({ label: 'Editar', variant: 'ghost', small: true, iconStart: icon('edit', { size: 14 }), extra: { 'data-action': 'edit', 'data-id': a.id, 'aria-label': `Editar ${a.title}` } })}${button({ label: 'Arquivar', variant: 'ghost', small: true, iconStart: icon('trash', { size: 14 }), extra: { 'data-action': 'archive', 'data-id': a.id, 'aria-label': `Arquivar ${a.title}` } })}</div>
  </li>`;
}

export function renderMentoraAchievements({ root, session, api, navigate }) {
  let disposed = false;
  let gen = 0;
  let data = null;

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'mg-achievements',
    heading: 'Conquistas',
    eyebrow: 'Crescimento',
    subtitle: 'Defina os marcos que a sua mentoria reconhece.',
    actions: button({ label: 'Nova conquista', id: 'ach-new', iconStart: icon('plus', { size: 16, stroke: 2 }) }),
    content: html`<div class="growth" id="mg-ach-body" aria-busy="true">${skeleton(4)}</div>`,
  });
  const body = root.querySelector('#mg-ach-body');
  const subtitle = root.querySelector('.page-subtitle');

  function paint() {
    if (subtitle) subtitle.textContent = `Defina os marcos que a sua mentoria reconhece. ${nf.format(data.total)} ${data.total === 1 ? 'conquista' : 'conquistas'} · ${nf.format(data.unlockTotal)} ${data.unlockTotal === 1 ? 'desbloqueio' : 'desbloqueios'}.`;
    if (data.data.length === 0) {
      mount(body, emptyState({
        iconName: 'conquistas',
        title: 'Nenhuma conquista na sua mentoria',
        message: 'Crie a primeira conquista: escolha um critério e o XP que a aluna recebe ao desbloquear.',
        action: button({ label: 'Nova conquista', extra: { 'data-action': 'create' } }),
      }));
      return;
    }
    mount(body, html`<ul class="mg-ach-grid" aria-label="Conquistas da mentoria">${data.data.map(card)}</ul>`);
  }

  async function load({ focusId = null } = {}) {
    const id = ++gen;
    body.setAttribute('aria-busy', 'true');
    if (!data) mount(body, skeleton(4));
    try {
      const result = await api.get('/api/v1/mentora/achievements');
      if (disposed || id !== gen) return;
      data = result;
      paint();
      if (focusId) body.querySelector(`[data-action="edit"][data-id="${CSS.escape(focusId)}"]`)?.focus();
    } catch (error) {
      if (disposed || id !== gen) return;
      data = null;
      if (subtitle) subtitle.textContent = 'Defina os marcos que a sua mentoria reconhece.';
      mount(body, retryBlock(error));
    }
    body.setAttribute('aria-busy', 'false');
  }

  async function edit(id) {
    const base = data?.data.find((a) => a.id === id);
    if (!base) return;
    let detail = base;
    let unlockedBy = [];
    try {
      const full = await api.get(`/api/v1/mentora/achievements/${id}`);
      detail = full;
      unlockedBy = full.unlockedBy ?? [];
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        toast('Esta conquista não existe mais.', { tone: 'danger' });
        return void load();
      }
    }
    if (disposed) return;
    const { saved, hadFailure } = await openAchievementDialog({ api, achievement: detail, options: data.options.ruleKinds, categories: data.options.categories, unlockedBy });
    if (disposed) return;
    if (saved) toast('Conquista atualizada.', { tone: 'success' });
    if (saved || hadFailure) await load({ focusId: id });
  }

  async function create() {
    const { saved, hadFailure } = await openAchievementDialog({ api, options: data.options.ruleKinds, categories: data.options.categories });
    if (disposed) return;
    if (saved) toast('Conquista criada.', { tone: 'success' });
    if (saved || hadFailure) await load();
  }

  async function toggle(id, button) {
    const item = data.data.find((a) => a.id === id);
    if (!item || button.disabled) return;
    const next = !item.active;
    button.disabled = true;
    button.setAttribute('aria-checked', String(next));
    try {
      const updated = await api.patch(`/api/v1/mentora/achievements/${id}`, { active: next, version: item.version });
      if (disposed) return;
      Object.assign(item, { active: updated.active, version: updated.version });
      toast(next ? 'Conquista ativada.' : 'Conquista desativada.', { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
      await load();
    }
    if (disposed) return;
    paint();
    body.querySelector(`[data-action="toggle"][data-id="${CSS.escape(id)}"]`)?.focus();
  }

  async function archive(id) {
    const item = data.data.find((a) => a.id === id);
    if (!item || !(await confirmArchiveAchievement(item)) || disposed) return;
    try {
      await api.delete(`/api/v1/mentora/achievements/${id}`);
      if (disposed) return;
      toast('Conquista arquivada.', { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      toast(describeError(error), { tone: 'danger' });
    }
    await load();
  }

  root.querySelector('#ach-new').addEventListener('click', () => data && create());
  body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, id } = target.dataset;
    if (action === 'retry') load();
    else if (action === 'create') create();
    else if (action === 'edit') edit(id);
    else if (action === 'toggle') toggle(id, target);
    else if (action === 'archive') archive(id);
  });

  load();

  return () => {
    disposed = true;
    dispose();
  };
}
