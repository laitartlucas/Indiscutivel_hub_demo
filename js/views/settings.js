import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import {
  FUNNEL_NAME_MAX,
  MAX_OPEN_STAGES,
  STAGE_NAME_MAX,
  addDraftStage,
  fetchFunnels,
  funnelById,
  funnelNameError,
  getFunnels,
  moveDraftStage,
  replaceFunnel,
  stagesDraft,
  stagesPayload,
  validateStages,
} from '../lib/pipeline-config.js';
import { allSources, loadSources, setSources } from '../lib/sources.js';
import { moneyShort } from '../lib/commercial.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, badge, button, field, skeleton } from '../ui/components.js';
import { attachForm } from '../ui/form.js';
import { openFormDialog } from '../ui/form-dialog.js';
import { settingsNav } from '../ui/settings-nav.js';
import { toast } from '../ui/toast.js';

// Configurações da aluna, categoria CRM: "Funis e etapas" (ativar/desativar, renomear e editar as etapas de cada um
// dos 15 funis), "Origens de lead" (renomear, arquivar e criar) e "Moeda e valores" (informativo).

const DEFAULT_SOURCE_LABELS = { referral: 'Indicação', organic: 'Orgânico', meta_ads: 'Meta Ads', google_ads: 'Google Ads', event: 'Evento', other: 'Outro' };

/** Nome de origem: obrigatório, até 40 caracteres e diferente das outras origens (sem diferenciar maiúsculas). */
export function sourceLabelError(value, all, name) {
  const text = value.trim();
  if (!text) return 'Informe o nome da origem.';
  if ([...text].length > 40) return 'Nome muito longo (máximo 40).';
  const folded = text.toLocaleLowerCase('pt-BR');
  const clash = Object.entries(all).some(([other, v]) => other !== name && other.startsWith('src-') && String(v).trim().toLocaleLowerCase('pt-BR') === folded);
  return clash ? 'Cada origem precisa de um nome diferente.' : null;
}

/** Mensagem em português para as recusas do servidor ao salvar funis/etapas. */
export function funnelErrorMessage(error) {
  if (error?.code === 'stage_in_use') {
    return 'Uma das etapas que você removeu ainda tem oportunidades. Mova essas oportunidades para outra etapa no Pipeline e depois remova a etapa.';
  }
  if (error?.status === 409) return 'Este funil foi alterado em outra aba. Carregamos a versão mais recente: confira e salve de novo.';
  return describeError(error);
}

let rowCounter = 0;

function sourceRow(source) {
  const uid = `src-${++rowCounter}`;
  const isNew = !source.key;
  return html`<li class="cfg-src-row" data-src-row data-key="${source.key ?? ''}" data-archived="${source.archived ? 'true' : 'false'}">
    ${field({ id: uid, label: `Nome da origem${source.label ? ` ${source.label}` : ' nova'}`, name: uid, maxlength: 40, required: true, value: source.label })}
    <span class="cfg-src-state">${source.archived ? badge('Arquivada', 'neutral') : isNew ? badge('Nova', 'accent') : ''}</span>
    ${isNew
      ? html`<button type="button" class="btn btn-ghost btn-sm" data-src-remove aria-label="Remover a origem nova">Remover</button>`
      : html`<button type="button" class="btn btn-ghost btn-sm" data-src-toggle aria-label="${source.archived ? 'Reativar' : 'Arquivar'} a origem ${source.label}">${source.archived ? 'Reativar' : 'Arquivar'}</button>`}
  </li>`;
}

// ---------- funis ----------

function funnelRow(funnel, selectedId) {
  const openCount = Number(funnel.openCount ?? 0);
  const stages = funnel.stages.filter((s) => s.kind === 'open');
  return html`<li${attrs({ class: `cfg-funnel${funnel.active ? '' : ' is-inactive'}${funnel.id === selectedId ? ' is-selected' : ''}`, 'data-funnel-id': funnel.id })}>
    <div class="cfg-funnel-main">
      <span class="cfg-funnel-name">${funnel.name}</span>
      <span class="cfg-funnel-meta">${stages.length} ${stages.length === 1 ? 'etapa' : 'etapas'} em andamento · ${openCount ? `${openCount} em negociação · ${moneyShort(funnel.openTotal ?? '0.00')}` : 'nenhuma negociação aberta'}</span>
    </div>
    <span class="cfg-funnel-state">${funnel.active ? badge('Ativo', 'good') : badge('Inativo', 'neutral')}</span>
    <div class="cfg-funnel-actions">
      ${button({ label: funnel.id === selectedId ? 'Editando etapas' : 'Editar etapas', variant: 'ghost', small: true, extra: { 'data-funnel-action': 'stages', 'aria-label': `Editar as etapas do funil ${funnel.name}`, 'aria-pressed': String(funnel.id === selectedId) } })}
      ${button({ label: 'Renomear', variant: 'ghost', small: true, extra: { 'data-funnel-action': 'rename', 'aria-label': `Renomear o funil ${funnel.name}` } })}
      ${button({ label: funnel.active ? 'Desativar' : 'Ativar', variant: 'ghost', small: true, extra: { 'data-funnel-action': 'toggle', 'aria-label': `${funnel.active ? 'Desativar' : 'Ativar'} o funil ${funnel.name}` } })}
    </div>
  </li>`;
}

function stageEditorRow(stage, index, draft, errors) {
  const open = stage.kind === 'open';
  const uid = `stage-${index}`;
  const openIndexes = draft.map((s, i) => (s.kind === 'open' ? i : -1)).filter((i) => i >= 0);
  const first = openIndexes[0] === index;
  const last = openIndexes.at(-1) === index;
  const err = errors?.rows?.[index] ?? {};
  const label = stage.name?.trim() || 'nova';
  return html`<li class="cfg-row cfg-stage-row" data-index="${String(index)}">
    <span class="cfg-swatch" data-kind="${stage.kind}" aria-hidden="true"></span>
    ${field({ id: `${uid}-name`, label: `Nome da etapa ${index + 1}`, name: `${uid}-name`, maxlength: STAGE_NAME_MAX, required: true, value: stage.name ?? '', error: err.name, extra: { 'data-stage-field': 'name' } })}
    ${open
      ? html`<div class="cfg-prob">${field({ id: `${uid}-prob`, label: `Probabilidade da etapa ${label}, em porcentagem`, name: `${uid}-prob`, type: 'number', inputmode: 'numeric', value: String(stage.probability ?? ''), error: err.probability, extra: { min: '0', max: '100', step: '1', 'data-stage-field': 'probability' } })}<span class="cfg-prob-unit" aria-hidden="true">%</span></div>`
      : html`<div class="cfg-prob-fixed"><strong>${stage.kind === 'won' ? '100%' : '0%'}</strong><span>${stage.kind === 'won' ? 'Ganha: sempre no fim, vale 100%.' : 'Perdida: sempre no fim, vale 0%.'}</span></div>`}
    <div class="cfg-stage-actions">
      ${open
        ? html`<button${attrs({ type: 'button', class: 'icon-btn', 'data-stage-action': 'up', disabled: first, 'aria-label': `Subir a etapa ${label}` })}>${icon('chevronUp', { size: 16 })}</button>
          <button${attrs({ type: 'button', class: 'icon-btn', 'data-stage-action': 'down', disabled: last, 'aria-label': `Descer a etapa ${label}` })}>${icon('chevronDown', { size: 16 })}</button>
          <button${attrs({ type: 'button', class: 'icon-btn', 'data-stage-action': 'remove', disabled: openIndexes.length <= 1, 'aria-label': `Remover a etapa ${label}` })}>${icon('trash', { size: 16 })}</button>`
        : html`<span class="cfg-fixed-note">Fixa</span>`}
    </div>
  </li>`;
}

function stageEditor(funnel, draft, errors) {
  const openCount = draft.filter((s) => s.kind === 'open').length;
  return html`<section class="cfg-card" aria-labelledby="cfg-editor-title" id="funnel-editor">
    <div class="cfg-card-head">
      <h2 id="cfg-editor-title" class="cfg-card-title" tabindex="-1">Etapas de ${funnel.name}</h2>
      <p class="cfg-card-sub">A probabilidade define o valor ponderado (valor × probabilidade). Use de 1 a ${MAX_OPEN_STAGES} etapas em andamento; Ganha e Perdida ficam sempre no fim.</p>
    </div>
    <div class="cfg-banner" id="editor-banner">${errors?.list?.length ? alert({ tone: 'danger', message: errors.list.join(' ') }) : ''}</div>
    <form id="stages-form" novalidate aria-label="Etapas do funil ${funnel.name}">
      <div class="cfg-cols cfg-stage-cols" aria-hidden="true"><span></span><span>Etapa</span><span>Probabilidade</span><span>Ordem</span></div>
      <ol class="cfg-stages" id="stages-list">${draft.map((s, i) => stageEditorRow(s, i, draft, errors))}</ol>
      <div class="cfg-actions">
        ${button({ label: '+ Nova etapa', variant: 'ghost', small: true, disabled: openCount >= MAX_OPEN_STAGES, extra: { 'data-stage-action': 'add' } })}
        <span class="cfg-actions-spacer"></span>
        ${button({ label: 'Descartar', variant: 'ghost', extra: { 'data-stage-action': 'discard' } })}
        <button type="submit" class="btn btn-primary" data-busy-label="Salvando…"><span class="spinner" aria-hidden="true" hidden></span><span>Salvar etapas</span></button>
      </div>
    </form>
  </section>`;
}

export function renderSettings({ root, session, api, navigate }) {
  let disposed = false;
  let selectedId = null;
  let draft = null;
  let errors = null;
  let savingStages = false;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'settings',
    heading: 'Configurações',
    eyebrow: 'CONTA',
    subtitle: 'Ajuste os seus funis de venda, de onde vêm os seus contatos e como o valor ponderado é calculado.',
    content: html`<div class="st">${settingsNav('user', 'crm')}<div class="st-main cfg" id="settings-page">
      <section class="cfg-card" aria-labelledby="cfg-funnels-title">
        <div class="cfg-card-head"><h2 id="cfg-funnels-title" class="cfg-card-title">Funis e etapas</h2>
          <p class="cfg-card-sub">Os funis ativos aparecem no Pipeline e nos formulários. Desativar só esconde o funil: nada é apagado.</p></div>
        <div class="cfg-banner" id="funnels-banner"></div>
        <div id="funnels-region" aria-live="off">${skeleton(4)}</div>
      </section>
      <div id="editor-region"></div>
      <div class="st-pair">
        <section class="cfg-card" aria-labelledby="cfg-sources-title" id="sources-card">${skeleton(3)}</section>
        <section class="cfg-card" aria-labelledby="cfg-money-title">
          <div class="cfg-card-head"><h2 id="cfg-money-title" class="cfg-card-title">Moeda e valores</h2><p class="cfg-card-sub">Informações do sistema. Por enquanto não há o que ajustar aqui.</p></div>
          <dl class="cfg-info">
            <div class="cfg-info-row"><dt>Moeda padrão</dt><dd>Real (R$)</dd></div>
            <div class="cfg-info-row"><dt>Valor ponderado</dt><dd>Valor × probabilidade da etapa</dd></div>
            <div class="cfg-info-row"><dt>Fechamento</dt><dd>Registrado ao marcar como ganha ou perdida</dd></div>
          </dl>
        </section>
      </div>
    </div></div>`,
  });

  const funnelsRegion = root.querySelector('#funnels-region');
  const funnelsBanner = root.querySelector('#funnels-banner');
  const editorRegion = root.querySelector('#editor-region');
  const sourcesCard = root.querySelector('#sources-card');

  // ---------- lista de funis ----------

  function paintFunnels() {
    const funnels = getFunnels();
    if (funnels.length === 0) {
      mount(funnelsRegion, html`<p class="muted cfg-empty">Nenhum funil encontrado.</p>`);
      return;
    }
    const active = funnels.filter((f) => f.active).length;
    mount(
      funnelsRegion,
      html`<p class="cfg-funnels-count">${active} de ${funnels.length} funis ativos</p>
        <ul class="cfg-funnels" aria-label="Funis">${funnels.map((f) => funnelRow(f, selectedId))}</ul>`,
    );
  }

  async function loadFunnelsList() {
    mount(funnelsBanner, html``);
    try {
      await fetchFunnels(api);
      if (disposed) return;
      paintFunnels();
    } catch (error) {
      if (disposed) return;
      mount(funnelsRegion, html`<div class="stack">${alert({ tone: 'danger', title: 'Não foi possível carregar os funis', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry-funnels' } })}</div></div>`);
    }
  }

  async function patchFunnel(funnel, patch, successMessage) {
    mount(funnelsBanner, html``);
    try {
      const saved = await api.patch(`/api/v1/funnels/${encodeURIComponent(funnel.id)}`, { ...patch, version: funnel.version });
      if (disposed) return;
      if (!replaceFunnel(saved)) await fetchFunnels(api);
      toast(successMessage, { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      mount(funnelsBanner, alert({ tone: 'danger', message: funnelErrorMessage(error) }));
      await fetchFunnels(api).catch(() => {});
    }
    if (disposed) return;
    paintFunnels();
    if (selectedId) paintEditor();
  }

  async function toggleFunnel(funnel) {
    if (funnel.active && getFunnels().filter((f) => f.active).length === 1) {
      mount(funnelsBanner, alert({ tone: 'warn', message: 'Deixe ao menos um funil ativo: é nele que as novas oportunidades entram.' }));
      return;
    }
    await patchFunnel(funnel, { active: !funnel.active }, funnel.active ? `Funil "${funnel.name}" desativado.` : `Funil "${funnel.name}" ativado.`);
    root.querySelector(`[data-funnel-id="${CSS.escape(funnel.id)}"] [data-funnel-action="toggle"]`)?.focus();
  }

  async function renameFunnel(funnel) {
    let name = null;
    const saved = await openFormDialog({
      title: 'Renomear funil',
      submitLabel: 'Salvar nome',
      body: field({ id: 'funnel-name', label: 'Nome do funil', name: 'name', required: true, maxlength: FUNNEL_NAME_MAX, value: funnel.name }),
      validators: { name: funnelNameError },
      onSubmit: async (values) => {
        name = values.name.trim();
      },
    });
    if (!saved || disposed || name === funnel.name) return;
    await patchFunnel(funnel, { name }, 'Nome do funil salvo.');
  }

  // ---------- editor de etapas ----------

  function readDraftFromForm() {
    const list = editorRegion.querySelector('#stages-list');
    if (!list || !draft) return;
    for (const row of list.querySelectorAll('[data-index]')) {
      const item = draft[Number(row.dataset.index)];
      if (!item) continue;
      const name = row.querySelector('[data-stage-field="name"]');
      const prob = row.querySelector('[data-stage-field="probability"]');
      if (name) item.name = name.value;
      if (prob) item.probability = prob.value;
    }
  }

  function paintEditor({ focus = null } = {}) {
    const funnel = funnelById(selectedId);
    if (!funnel || !draft) {
      mount(editorRegion, html``);
      return;
    }
    mount(editorRegion, stageEditor(funnel, draft, errors));
    if (focus) editorRegion.querySelector(focus)?.focus();
  }

  function openEditor(funnel) {
    selectedId = funnel.id;
    draft = stagesDraft(funnel);
    errors = null;
    paintFunnels();
    paintEditor({ focus: '#cfg-editor-title' });
    editorRegion.querySelector('#funnel-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeEditor() {
    const id = selectedId;
    selectedId = null;
    draft = null;
    errors = null;
    paintFunnels();
    paintEditor();
    root.querySelector(`[data-funnel-id="${CSS.escape(id ?? '')}"] [data-funnel-action="stages"]`)?.focus();
  }

  async function saveStages() {
    if (savingStages) return;
    readDraftFromForm();
    const result = validateStages(draft);
    if (!result.ok) {
      errors = result;
      paintEditor();
      const firstError = editorRegion.querySelector('[aria-invalid="true"]');
      (firstError ?? editorRegion.querySelector('#editor-banner'))?.focus?.();
      return;
    }
    errors = null;
    const funnel = funnelById(selectedId);
    const submit = editorRegion.querySelector('#stages-form [type="submit"]');
    savingStages = true;
    if (submit) {
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      submit.querySelector('.spinner').hidden = false;
    }
    try {
      const saved = await api.put(`/api/v1/funnels/${encodeURIComponent(funnel.id)}/stages`, { version: funnel.version, stages: stagesPayload(draft) });
      if (disposed) return;
      if (!replaceFunnel(saved)) await fetchFunnels(api);
      toast(`Etapas de ${funnel.name} salvas.`, { tone: 'success' });
      draft = stagesDraft(funnelById(selectedId));
      paintFunnels();
      paintEditor({ focus: '#cfg-editor-title' });
    } catch (error) {
      if (disposed) return;
      if (error?.code !== 'stage_in_use' && error?.status === 409) {
        await fetchFunnels(api).catch(() => {});
        if (disposed) return;
        draft = stagesDraft(funnelById(selectedId));
        paintFunnels();
      }
      errors = { list: [funnelErrorMessage(error)], rows: [] };
      paintEditor();
      editorRegion.querySelector('#editor-banner [role="alert"]')?.focus?.();
    } finally {
      savingStages = false;
    }
  }

  editorRegion.addEventListener('click', (event) => {
    const target = event.target.closest('[data-stage-action]');
    if (!target || !draft) return;
    readDraftFromForm();
    const action = target.dataset.stageAction;
    if (action === 'discard') return void closeEditor();
    if (action === 'add') {
      draft = addDraftStage(draft);
      const index = draft.findIndex((s) => s.kind !== 'open') - 1;
      paintEditor({ focus: `#stage-${index}-name` });
      return;
    }
    const index = Number(target.closest('[data-index]')?.dataset.index);
    if (!Number.isInteger(index)) return;
    if (action === 'up' || action === 'down') {
      const direction = action === 'up' ? -1 : 1;
      draft = moveDraftStage(draft, index, direction);
      const moved = index + direction;
      paintEditor({ focus: `[data-index="${moved}"] [data-stage-action="${action}"]:not([disabled])` });
      if (!editorRegion.contains(document.activeElement)) editorRegion.querySelector(`#stage-${moved}-name`)?.focus();
    } else if (action === 'remove') {
      draft = draft.filter((_, i) => i !== index);
      paintEditor({ focus: `#stage-${Math.max(0, index - 1)}-name` });
    }
  });
  editorRegion.addEventListener('submit', (event) => {
    event.preventDefault();
    saveStages();
  });

  funnelsRegion.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry-funnels"]')) return void loadFunnelsList();
    const target = event.target.closest('[data-funnel-action]');
    if (!target) return;
    const funnel = funnelById(target.closest('[data-funnel-id]')?.dataset.funnelId);
    if (!funnel) return;
    const action = target.dataset.funnelAction;
    if (action === 'stages') {
      if (selectedId === funnel.id) closeEditor();
      else openEditor(funnel);
    } else if (action === 'rename') renameFunnel(funnel);
    else if (action === 'toggle') toggleFunnel(funnel);
  });

  // ---------- origens de lead ----------

  function paintSources() {
    mount(
      sourcesCard,
      html`<div class="cfg-card-head">
          <h2 id="cfg-sources-title" class="cfg-card-title">Origens de lead</h2>
          <p class="cfg-card-sub">Aparecem no cadastro de contatos. Arquivar esconde a origem dos formulários, mas quem já a usa continua com o nome.</p>
        </div>
        <form id="sources-form" novalidate aria-label="Origens de lead">
          <div class="cfg-banner" id="sources-banner"></div>
          <ul class="cfg-src-list" id="sources-list" aria-label="Origens de lead">${allSources().map((source) => sourceRow(source))}</ul>
          <div class="cfg-src-add"><button type="button" class="btn btn-ghost btn-sm" id="source-add">+ Nova origem</button></div>
          <div class="cfg-actions">
            <button type="button" class="btn btn-ghost" id="sources-restore">Restaurar padrão</button>
            <button type="submit" class="btn btn-primary" data-busy-label="Salvando…"><span class="spinner" aria-hidden="true" hidden></span><span>Salvar origens</span></button>
          </div>
        </form>`,
    );
    wireSources();
  }

  function wireSources() {
    const form = sourcesCard.querySelector('#sources-form');
    const sourcesList = sourcesCard.querySelector('#sources-list');
    const validators = {};
    const sourceInputs = () => [...sourcesList.querySelectorAll('[data-src-row] input')];
    for (const input of sourceInputs()) validators[input.name] = (value, all) => sourceLabelError(value, all, input.name);

    const readSources = () =>
      [...sourcesList.querySelectorAll('[data-src-row]')].map((row) => {
        const item = { label: row.querySelector('input').value.trim(), archived: row.dataset.archived === 'true' };
        return row.dataset.key ? { key: row.dataset.key, ...item } : item;
      });

    const formApi = attachForm(form, {
      validators,
      async onSubmit(values, api2) {
        const banner = sourcesCard.querySelector('#sources-banner');
        mount(banner, html``);
        const sources = readSources();
        if (sources.every((s) => s.archived)) {
          mount(banner, alert({ tone: 'danger', message: 'Deixe ao menos uma origem ativa.' }));
          return;
        }
        try {
          const saved = await api.put('/api/v1/lead-sources', { sources });
          if (disposed) return;
          setSources(saved.sources);
          toast('Origens de lead salvas.', { tone: 'success' });
          paintSources();
        } catch (error) {
          if (disposed) return;
          const mapped = (error?.errors ?? []).map((e) => {
            const m = /^sources\.(\d+)\.label$/.exec(e.field);
            const input = m ? sourceInputs()[Number(m[1])] : null;
            return input ? { field: input.name, message: e.message } : e;
          });
          const orphan = api2.applyServerErrors(mapped);
          const message = orphan[0] ?? (mapped.length ? null : describeError(error));
          if (message) mount(banner, alert({ tone: 'danger', message }));
        }
      },
    });

    sourcesList.addEventListener('click', (event) => {
      const row = event.target.closest('[data-src-row]');
      if (!row) return;
      if (event.target.closest('[data-src-remove]')) {
        delete validators[row.querySelector('input').name];
        const siblings = [...sourcesList.querySelectorAll('[data-src-row]')];
        const next = siblings[siblings.indexOf(row) + 1] ?? siblings[siblings.indexOf(row) - 1];
        row.remove();
        (next?.querySelector('input') ?? sourcesCard.querySelector('#source-add')).focus();
      } else if (event.target.closest('[data-src-toggle]')) {
        const archived = row.dataset.archived !== 'true';
        row.dataset.archived = String(archived);
        const label = row.querySelector('input').value.trim();
        mount(row.querySelector('.cfg-src-state'), archived ? badge('Arquivada', 'neutral') : html``);
        const toggle = row.querySelector('[data-src-toggle]');
        toggle.textContent = archived ? 'Reativar' : 'Arquivar';
        toggle.setAttribute('aria-label', `${archived ? 'Reativar' : 'Arquivar'} a origem ${label}`);
        toggle.focus();
      }
    });

    sourcesCard.querySelector('#source-add').addEventListener('click', () => {
      const holder = document.createElement('div');
      mount(holder, sourceRow({ key: null, label: '', archived: false }));
      const row = holder.firstElementChild;
      sourcesList.append(row);
      const input = row.querySelector('input');
      validators[input.name] = (value, all) => sourceLabelError(value, all, input.name);
      input.focus();
    });

    sourcesCard.querySelector('#sources-restore').addEventListener('click', () => {
      // Nomes de fábrica; as origens criadas por você ficam arquivadas (origens não são apagadas).
      for (const row of sourcesList.querySelectorAll('[data-src-row]')) {
        const key = row.dataset.key;
        if (!key) {
          delete validators[row.querySelector('input').name];
          row.remove();
          continue;
        }
        const factory = DEFAULT_SOURCE_LABELS[key];
        const input = row.querySelector('input');
        input.value = factory ?? input.value;
        formApi.setError(input.name, null);
        row.dataset.archived = factory ? 'false' : 'true';
        mount(row.querySelector('.cfg-src-state'), factory ? html`` : badge('Arquivada', 'neutral'));
        const toggle = row.querySelector('[data-src-toggle]');
        toggle.textContent = factory ? 'Arquivar' : 'Reativar';
        toggle.setAttribute('aria-label', `${factory ? 'Arquivar' : 'Reativar'} a origem ${input.value}`);
      }
      toast('Origens de fábrica restauradas. Salve para aplicar.', { tone: 'success' });
      sourcesList.querySelector('input')?.focus();
    });
  }

  loadFunnelsList();
  loadSources(api).then(() => {
    if (!disposed) paintSources();
  });

  return () => {
    disposed = true;
    disposeShell();
  };
}
