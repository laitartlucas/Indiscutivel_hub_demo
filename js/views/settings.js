import { describeError } from '../lib/api.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { DEFAULT_STAGES, STAGE_KEYS, loadPipelineConfig, pipelineStages, setPipelineConfig } from '../lib/pipeline-config.js';
import { allSources, loadSources, setSources } from '../lib/sources.js';
import { formatMoneyCompact } from '../lib/dashboard.js';
import { renderShell } from '../shell.js';
import { alert, badge, field, skeleton } from '../ui/components.js';
import { attachForm } from '../ui/form.js';
import { settingsNav } from '../ui/settings-nav.js';
import { toast } from '../ui/toast.js';

// Configurações da aluna, categoria CRM: "Etapas do funil" (rótulo e probabilidade), "Origens de lead" (renomear, arquivar e criar),
// "Moeda e valores" (informativo) e "Restaurar padrão". As CHAVES das etapas e a lógica de ganha/perdida não mudam.

const FIXED = { won: 'Uma oportunidade ganha vale sempre 100%.', lost: 'Uma oportunidade perdida vale sempre 0%.' };
const DEFAULT_SOURCE_LABELS = { referral: 'Indicação', organic: 'Orgânico', meta_ads: 'Meta Ads', google_ads: 'Google Ads', event: 'Evento', other: 'Outro' };

export function labelError(value, all, key) {
  const text = value.trim();
  if (!text) return 'Informe o nome da etapa.';
  if (text.length > 24) return 'Nome muito longo (máximo 24).';
  const folded = text.toLocaleLowerCase('pt-BR');
  const clash = STAGE_KEYS.some((other) => other !== key && String(all[`label-${other}`] ?? '').trim().toLocaleLowerCase('pt-BR') === folded);
  return clash ? 'Cada etapa precisa de um nome diferente.' : null;
}

export function probabilityError(value) {
  const text = String(value).trim();
  if (text === '') return 'Informe a probabilidade.';
  if (!/^\d{1,3}$/.test(text)) return 'Use um número inteiro de 0 a 100.';
  return Number(text) > 100 ? 'A probabilidade vai de 0 a 100.' : null;
}

/** Nome de origem: obrigatório, até 40 caracteres e diferente das outras origens (sem diferenciar maiúsculas). */
export function sourceLabelError(value, all, name) {
  const text = value.trim();
  if (!text) return 'Informe o nome da origem.';
  if ([...text].length > 40) return 'Nome muito longo (máximo 40).';
  const folded = text.toLocaleLowerCase('pt-BR');
  const clash = Object.entries(all).some(([other, v]) => other !== name && other.startsWith('src-') && String(v).trim().toLocaleLowerCase('pt-BR') === folded);
  return clash ? 'Cada origem precisa de um nome diferente.' : null;
}

function stageRow(stage, summary) {
  const fixed = Object.hasOwn(FIXED, stage.key);
  const info = summary?.stages?.[stage.key];
  const defaultName = DEFAULT_STAGES.find((s) => s.key === stage.key).label;
  return html`<li class="cfg-row" data-stage-row="${stage.key}">
    <span class="cfg-swatch" data-stage="${stage.key}" aria-hidden="true"></span>
    ${field({ id: `label-${stage.key}`, label: `Nome da etapa ${defaultName}`, name: `label-${stage.key}`, maxlength: 24, required: true, value: stage.label })}
    ${fixed
      ? html`<div class="cfg-prob-fixed"><strong>${stage.probability}%</strong><span>${FIXED[stage.key]}</span></div>
          <input type="hidden" name="probability-${stage.key}" value="${stage.probability}">`
      : html`<div class="cfg-prob">${field({ id: `probability-${stage.key}`, label: `Probabilidade da etapa ${defaultName}, em porcentagem`, name: `probability-${stage.key}`, type: 'number', inputmode: 'numeric', value: String(stage.probability), extra: { min: '0', max: '100', step: '1' } })}<span class="cfg-prob-unit" aria-hidden="true">%</span></div>`}
    <span class="cfg-deals">${info ? `${info.count} ${info.count === 1 ? 'oportunidade' : 'oportunidades'} · ${formatMoneyCompact(info.total)}` : '—'}</span>
  </li>`;
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

export function renderSettings({ root, session, api, navigate }) {
  let disposed = false;
  let summary = null;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'settings',
    heading: 'Configurações',
    eyebrow: 'CONTA',
    subtitle: 'Ajuste como o seu funil aparece, de onde vêm os seus leads e como o valor ponderado é calculado.',
    content: html`<div class="st">${settingsNav('user', 'crm')}<div class="st-main cfg" id="settings-page"><div class="cfg-card"><div class="cfg-card-head"><h2 class="cfg-card-title">Etapas do funil</h2></div>${skeleton(3)}</div></div></div>`,
  });

  const page = root.querySelector('#settings-page');

  function paint() {
    const stages = pipelineStages();
    mount(
      page,
      html`<form id="crm-form" novalidate aria-label="Configurações do CRM" class="st-main">
        <section class="cfg-card" aria-labelledby="cfg-stages-title">
          <div class="cfg-card-head">
            <h2 id="cfg-stages-title" class="cfg-card-title">Etapas do funil</h2>
            <p class="cfg-card-sub">A probabilidade define o valor ponderado de cada oportunidade (valor × probabilidade da etapa). Ganhas valem 100% e perdidas 0%.</p>
          </div>
          <div class="cfg-banner" id="stages-banner"></div>
          <div class="cfg-cols" aria-hidden="true"><span></span><span>Etapa</span><span>Probabilidade</span><span>Oportunidades</span></div>
          <ul class="cfg-stages">${stages.map((stage) => stageRow(stage, summary))}</ul>
        </section>
        <div class="st-pair">
          <section class="cfg-card" aria-labelledby="cfg-sources-title">
            <div class="cfg-card-head">
              <h2 id="cfg-sources-title" class="cfg-card-title">Origens de lead</h2>
              <p class="cfg-card-sub">Aparecem em Pessoas e Leads. Arquivar esconde a origem dos formulários, mas quem já a usa continua com o nome.</p>
            </div>
            <div class="cfg-banner" id="sources-banner"></div>
            <ul class="cfg-src-list" id="sources-list" aria-label="Origens de lead">${allSources().map((source) => sourceRow(source))}</ul>
            <div class="cfg-src-add"><button type="button" class="btn btn-ghost btn-sm" id="source-add">+ Nova origem</button></div>
          </section>
          <section class="cfg-card" aria-labelledby="cfg-money-title">
            <div class="cfg-card-head"><h2 id="cfg-money-title" class="cfg-card-title">Moeda e valores</h2><p class="cfg-card-sub">Informações do sistema. Por enquanto não há o que ajustar aqui.</p></div>
            <dl class="cfg-info">
              <div class="cfg-info-row"><dt>Moeda padrão</dt><dd>Real (R$)</dd></div>
              <div class="cfg-info-row"><dt>Valor ponderado</dt><dd>Valor × probabilidade da etapa</dd></div>
              <div class="cfg-info-row"><dt>Fechamento</dt><dd>Registrado ao marcar como ganha ou perdida</dd></div>
            </dl>
          </section>
        </div>
        <div class="st-footer">
          <button type="button" class="btn btn-ghost" id="stages-restore">Restaurar padrão</button>
          <button type="submit" class="btn btn-primary" data-busy-label="Salvando…"><span class="spinner" aria-hidden="true" hidden></span><span>Salvar alterações</span></button>
        </div>
      </form>`,
    );
    wire();
  }

  function wire() {
    const form = page.querySelector('#crm-form');
    const sourcesList = page.querySelector('#sources-list');
    const validators = {};
    for (const key of STAGE_KEYS) {
      validators[`label-${key}`] = (value, all) => labelError(value, all, key);
      if (!Object.hasOwn(FIXED, key)) validators[`probability-${key}`] = probabilityError;
    }
    const sourceInputs = () => [...sourcesList.querySelectorAll('[data-src-row] input')];
    for (const input of sourceInputs()) validators[input.name] = (value, all) => sourceLabelError(value, all, input.name);

    const readSources = () =>
      [...sourcesList.querySelectorAll('[data-src-row]')].map((row) => {
        const item = { label: row.querySelector('input').value.trim(), archived: row.dataset.archived === 'true' };
        return row.dataset.key ? { key: row.dataset.key, ...item } : item;
      });
    const sourcesChanged = () => JSON.stringify(readSources().map((s) => [s.key ?? null, s.label, s.archived])) !== JSON.stringify(allSources().map((s) => [s.key, s.label, s.archived]));

    const formApi = attachForm(form, {
      validators,
      async onSubmit(values, api2) {
        mount(page.querySelector('#stages-banner'), html``);
        mount(page.querySelector('#sources-banner'), html``);
        const sources = readSources();
        if (sources.every((s) => s.archived)) {
          mount(page.querySelector('#sources-banner'), alert({ tone: 'danger', message: 'Deixe ao menos uma origem ativa.' }));
          return;
        }
        const stages = STAGE_KEYS.map((key) => ({ key, label: values[`label-${key}`].trim(), probability: Number(values[`probability-${key}`]) }));
        try {
          const saved = await api.put('/api/v1/pipeline/config', { stages });
          if (disposed) return;
          setPipelineConfig(saved.stages);
          toast('Etapas do funil salvas.', { tone: 'success' });
        } catch (error) {
          if (disposed) return;
          // erros do servidor vêm como "stages.N.campo": viram o campo da linha
          const mapped = (error?.errors ?? []).map((e) => {
            const m = /^stages\.(\d)\.(label|probability)$/.exec(e.field);
            return m ? { field: `${m[2]}-${STAGE_KEYS[Number(m[1])]}`, message: e.message } : e;
          });
          const orphan = api2.applyServerErrors(mapped);
          const message = orphan[0] ?? (mapped.length ? null : describeError(error));
          if (message) mount(page.querySelector('#stages-banner'), alert({ tone: 'danger', message }));
          return;
        }
        if (!sourcesChanged()) return;
        try {
          const saved = await api.put('/api/v1/lead-sources', { sources });
          if (disposed) return;
          setSources(saved.sources);
          toast('Origens de lead salvas.', { tone: 'success' });
          paint();
        } catch (error) {
          if (disposed) return;
          const mapped = (error?.errors ?? []).map((e) => {
            const m = /^sources\.(\d+)\.label$/.exec(e.field);
            const input = m ? sourceInputs()[Number(m[1])] : null;
            return input ? { field: input.name, message: e.message } : e;
          });
          const orphan = api2.applyServerErrors(mapped);
          const message = orphan[0] ?? (mapped.length ? null : describeError(error));
          if (message) mount(page.querySelector('#sources-banner'), alert({ tone: 'danger', message }));
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
        (next?.querySelector('input') ?? page.querySelector('#source-add')).focus();
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

    page.querySelector('#source-add').addEventListener('click', () => {
      const holder = document.createElement('div');
      mount(holder, sourceRow({ key: null, label: '', archived: false }));
      const row = holder.firstElementChild;
      sourcesList.append(row);
      const input = row.querySelector('input');
      validators[input.name] = (value, all) => sourceLabelError(value, all, input.name);
      input.focus();
    });

    page.querySelector('#stages-restore').addEventListener('click', () => {
      for (const stage of DEFAULT_STAGES) {
        form.elements.namedItem(`label-${stage.key}`).value = stage.label;
        form.elements.namedItem(`probability-${stage.key}`).value = String(stage.probability);
        formApi.setError(`label-${stage.key}`, null);
        formApi.setError(`probability-${stage.key}`, null);
      }
      // Origens: nomes de fábrica e as criadas por você ficam arquivadas (origens não são apagadas).
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
      toast('Padrão restaurado. Salve para aplicar.', { tone: 'success' });
      form.elements.namedItem('label-arrived').focus();
    });
  }

  async function start() {
    try {
      const [, , deals] = await Promise.all([loadPipelineConfig(api), loadSources(api), api.get('/api/v1/deals/summary').catch(() => null)]);
      if (disposed) return;
      summary = deals;
    } catch {
      // sem o resumo, a coluna "Oportunidades" mostra "—"
    }
    if (!disposed) paint();
  }
  start();

  return () => {
    disposed = true;
    disposeShell();
  };
}
