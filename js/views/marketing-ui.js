import { moneyToInputText } from '../../shared/money.js';
import { PERIODS, isPeriod } from '../lib/commercial.js';
import { todayIso } from '../lib/finance.js';
import { attrs, html } from '../lib/html.js';
import {
  CHANNELS,
  INSTAGRAM_COUNTS,
  campaignBody,
  campaignNameError,
  campaignOptions,
  campaignStatusLabel,
  campaignStatusTone,
  countFieldError,
  descriptionError,
  endsOnError,
  engagementRate,
  formatPct,
  followersError,
  instagramNotesError,
  newFollowersError,
  instagramBody,
  longTextError,
  metricTiles,
  objectiveError,
  periodEndError,
  spendAmountError,
  spendBody,
  spentOnError,
  startsOnError,
  countValue,
} from '../lib/marketing.js';
import { hashParam } from '../lib/query.js';
import { badge, field, selectField } from '../ui/components.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';

// Peças compartilhadas das telas de Marketing: período, faixa de indicadores, selo da campanha e os diálogos
// (campanha, investimento, período do Instagram). Os diálogos não avisam nem recarregam: devolvem o desfecho.

// ---------- período (mês, trimestre, ano), lembrado neste aparelho ----------

const PERIOD_KEY = 'ih:marketing-period';

export function readMarketingPeriod() {
  const fromHash = hashParam('periodo');
  if (isPeriod(fromHash)) return fromHash;
  try {
    const saved = globalThis.localStorage?.getItem(PERIOD_KEY);
    return isPeriod(saved) ? saved : 'month';
  } catch {
    return 'month';
  }
}

export function saveMarketingPeriod(value) {
  try {
    globalThis.localStorage?.setItem(PERIOD_KEY, value);
  } catch {
    // sem armazenamento: só não lembra
  }
}

export function periodButtons(current) {
  return html`${PERIODS.map((p) => html`<button${attrs({ type: 'button', class: 'segment', 'data-period': p.value, 'aria-pressed': String(p.value === current) })}>${p.label}</button>`)}`;
}

/** Liga os botões de período de `group`; `onChange(period)` a cada troca. */
export function bindPeriod(group, getCurrent, onChange) {
  group.addEventListener('click', (event) => {
    const option = event.target.closest('[data-period]');
    if (!option || option.dataset.period === getCurrent()) return;
    for (const other of group.querySelectorAll('[data-period]')) other.setAttribute('aria-pressed', String(other === option));
    saveMarketingPeriod(option.dataset.period);
    onChange(option.dataset.period);
  });
}

// ---------- indicadores ----------

/** Os 11 indicadores: valor, nota curta visível e a explicação completa no `title` (a nota já diz a fórmula). */
export function metricsGrid(metrics, { label = 'Indicadores do período' } = {}) {
  return html`<section class="mk-kpis" aria-label="${label}">${metricTiles(metrics).map(
    (k) => html`<div${attrs({ class: `mk-kpi${k.gold ? ' is-gold' : ''}${k.bad ? ' is-bad' : ''}`, role: 'group', 'aria-label': k.label, title: `${k.label}: ${k.help}` })}>
      <span class="lead-kpi-label">${k.label}</span>
      <span class="mk-kpi-value">${k.value}</span>
      <span class="lead-kpi-note">${k.note}</span>
    </div>`,
  )}</section>`;
}

export function campaignBadge(status) {
  return badge(campaignStatusLabel(status), campaignStatusTone(status));
}

export const campaignHref = (id) => `#/marketing/campanhas/${encodeURIComponent(id)}`;

/** Campanhas para os campos "Campanha" (contato, oportunidade, investimento). Falha → lista vazia (o campo some). */
export async function loadCampaignChoices(api) {
  try {
    const result = await api.get('/api/v1/campaigns');
    return Array.isArray(result?.rows) ? result.rows : Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

/**
 * Campo "Campanha" dos formulários de contato e oportunidade. Sem nenhuma campanha para escolher (e sem campanha
 * atual), não aparece. `emptyLabel` diz o que acontece em branco.
 */
export function campaignField({ id, campaigns, currentId = null, currentName = null, emptyLabel = 'Nenhuma', hint = 'De qual campanha veio. Campanhas arquivadas não aparecem.' }) {
  const options = campaignOptions(campaigns, { currentId, currentName, emptyLabel });
  if (options.length <= 1) return '';
  return html`<div class="field">
    <label class="field-label" for="${id}">Campanha</label>
    <div class="field-control"><select id="${id}" name="campaignId" class="field-input" aria-describedby="${id}-hint">${options.map((o) => html`<option${attrs({ value: o.value, selected: o.value === (currentId ?? '') })}>${o.label}</option>`)}</select></div>
    <p class="field-hint" id="${id}-hint">${hint}</p>
  </div>`;
}

function textareaField({ id, name, label, value = '', rows = 3, maxlength = 1000 }) {
  // `maxlength` = limite do banco para o campo.
  return html`<div class="field">
    <label class="field-label" for="${id}">${label}</label>
    <div class="field-control"><textarea${attrs({ id, name, class: 'field-input', rows: String(rows), maxlength: String(maxlength), 'aria-describedby': `${id}-error` })}>${value}</textarea></div>
    <p class="field-error" id="${id}-error" role="alert"></p>
  </div>`;
}

const moneyPrefix = html`<span class="field-prefix" aria-hidden="true">R$</span>`;

// ---------- campanha ----------

/** Criar (sem `campaign`) ou editar. Resolve `{ saved, hadFailure, result }`. */
export async function openCampaignDialog({ api, campaign = null }) {
  let result = null;
  const outcome = await openTrackedFormDialog({
    title: campaign ? 'Editar campanha' : 'Nova campanha',
    description: 'A situação (planejada, ativa ou encerrada) vem das datas. Para tirar da lista sem perder os números, arquive.',
    submitLabel: campaign ? 'Salvar' : 'Criar campanha',
    className: 'dialog-drawer mk-dialog',
    body: html`${field({ id: 'cp-name', label: 'Nome', name: 'name', maxlength: 80, required: true, value: campaign?.name ?? '', hint: 'Ex.: Lançamento de março, Live com convidada' })}
      <div class="form-grid form-grid-2">
        ${selectField({ id: 'cp-channel', label: 'Canal', name: 'channel', value: campaign?.channel ?? 'instagram', options: CHANNELS })}
        ${field({ id: 'cp-objective', label: 'Objetivo (opcional)', name: 'objective', maxlength: 300, value: campaign?.objective ?? '' })}
        ${field({ id: 'cp-start', label: 'Início', name: 'startsOn', type: 'date', required: true, value: campaign?.startsOn ?? todayIso() })}
        ${field({ id: 'cp-end', label: 'Fim (opcional)', name: 'endsOn', type: 'date', value: campaign?.endsOn ?? '', hint: 'Em branco: segue ativa.' })}
      </div>
      ${textareaField({ id: 'cp-notes', name: 'notes', label: 'Observações (opcional)', value: campaign?.notes ?? '' })}`,
    validators: { name: campaignNameError, objective: objectiveError, startsOn: startsOnError, endsOn: endsOnError, notes: longTextError },
    onSubmit: async (values) => {
      const body = campaignBody(values);
      result = campaign ? await api.patch(`/api/v1/campaigns/${encodeURIComponent(campaign.id)}`, { ...body, version: campaign.version }) : await api.post('/api/v1/campaigns', body);
    },
  });
  return { ...outcome, result };
}

// ---------- investimento ----------

/**
 * Lançar (sem `spend`) ou editar um investimento. `campaigns`: para o campo Campanha (arquivadas não entram, salvo
 * a atual); `campaignId`: campanha já escolhida (aberto da página da campanha).
 */
export async function openSpendDialog({ api, spend = null, campaigns = [], campaignId = null }) {
  let result = null;
  const preset = spend?.campaignId ?? campaignId;
  const presetChannel = spend?.channel ?? campaigns.find((c) => c.id === preset)?.channel ?? 'other';
  const outcome = await openTrackedFormDialog({
    title: spend ? 'Editar investimento' : 'Novo investimento',
    description: 'Quanto você pagou em anúncio, evento, material ou ferramenta. Pode ser de uma campanha ou geral.',
    submitLabel: spend ? 'Salvar' : 'Lançar investimento',
    className: 'mk-dialog',
    body: html`<div class="form-grid form-grid-2">
        ${field({ id: 'sp-amount', label: 'Valor', name: 'amount', inputmode: 'decimal', required: true, before: moneyPrefix, value: spend ? moneyToInputText(spend.amount) : '', hint: 'Exemplo: 350,00' })}
        ${field({ id: 'sp-date', label: 'Data', name: 'spentOn', type: 'date', required: true, value: spend?.spentOn ?? todayIso() })}
      </div>
      <div class="field">
        <label class="field-label" for="sp-campaign">Campanha</label>
        <div class="field-control"><select id="sp-campaign" name="campaignId" class="field-input">${campaignOptions(campaigns, { currentId: preset, currentName: spend?.campaignName ?? null, emptyLabel: 'Sem campanha (investimento geral)' }).map(
          (o) => html`<option${attrs({ value: o.value, selected: o.value === (preset ?? '') })}>${o.label}</option>`,
        )}</select></div>
      </div>
      ${selectField({ id: 'sp-channel', label: 'Canal', name: 'channel', value: presetChannel, options: CHANNELS })}
      ${field({ id: 'sp-description', label: 'Descrição (opcional)', name: 'description', maxlength: 200, value: spend?.description ?? '', hint: 'Ex.: Impulsionamento do reels, tráfego pago da semana' })}`,
    validators: { amount: spendAmountError, spentOn: spentOnError, description: descriptionError },
    onMount: (dialog) => {
      // Ao escolher a campanha, o canal acompanha o dela (dá para trocar depois).
      const select = dialog.querySelector('#sp-campaign');
      const channel = dialog.querySelector('#sp-channel');
      select.addEventListener('change', () => {
        const picked = campaigns.find((c) => c.id === select.value);
        if (picked?.channel) channel.value = picked.channel;
      });
    },
    onSubmit: async (values) => {
      const body = spendBody(values);
      result = spend ? await api.patch(`/api/v1/marketing/spend/${encodeURIComponent(spend.id)}`, { ...body, version: spend.version }) : await api.post('/api/v1/marketing/spend', body);
    },
  });
  return { ...outcome, result };
}

// ---------- Instagram ----------

/** Campos do período do Instagram (o formulário da página e o diálogo de edição usam os mesmos). */
export function instagramFields(entry = null, prefix = 'ig') {
  return html`<div class="form-grid form-grid-2">
      ${field({ id: `${prefix}-start`, label: 'Início do período', name: 'periodStart', type: 'date', required: true, value: entry?.periodStart ?? '' })}
      ${field({ id: `${prefix}-end`, label: 'Fim do período', name: 'periodEnd', type: 'date', required: true, value: entry?.periodEnd ?? '' })}
    </div>
    <div class="form-grid mk-count-grid">${INSTAGRAM_COUNTS.map((c) =>
      field({ id: `${prefix}-${c.name}`, label: c.label, name: c.name, inputmode: c.name === 'newFollowers' ? 'text' : 'numeric', required: Boolean(c.required), value: entry && entry[c.name] !== null && entry[c.name] !== undefined ? String(entry[c.name]) : '' }),
    )}</div>
    <p class="mk-engagement" id="${prefix}-engagement" aria-live="polite"></p>
    <p class="field-hint mk-optional-note">Só os seguidores e o período são obrigatórios. Número em branco fica como "não informado" (—), não como zero.</p>
    ${textareaField({ id: `${prefix}-notes`, name: 'notes', label: 'Observações (opcional)', rows: 2, maxlength: 500, value: entry?.notes ?? '' })}`;
}

export const INSTAGRAM_VALIDATORS = {
  periodStart: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '')) ? null : 'Informe o início do período.'),
  periodEnd: periodEndError,
  ...Object.fromEntries(INSTAGRAM_COUNTS.map((c) => [c.name, countFieldError])),
  followers: followersError,
  newFollowers: newFollowersError,
  notes: instagramNotesError,
};

/** Prévia do engajamento (interações ÷ alcance × 100) enquanto a aluna digita. */
export function wireEngagementPreview(form, prefix = 'ig') {
  const out = form.querySelector(`#${prefix}-engagement`);
  const paint = () => {
    const interactions = countValue(form.elements.namedItem('interactions')?.value);
    const rate = interactions === null ? null : engagementRate(interactions, countValue(form.elements.namedItem('reach')?.value));
    out.textContent = rate === null ? 'Engajamento: informe as interações e o alcance para calcular (interações ÷ alcance × 100).' : `Engajamento do período: ${formatPct(rate)} (interações ÷ alcance × 100).`;
  };
  form.addEventListener('input', paint);
  paint();
}

export async function openInstagramDialog({ api, entry }) {
  const outcome = await openTrackedFormDialog({
    title: 'Editar período do Instagram',
    description: 'Lançamento manual: os números vêm do painel do Instagram, digitados por você.',
    className: 'dialog-drawer mk-dialog',
    body: instagramFields(entry, 'ig-edit'),
    validators: INSTAGRAM_VALIDATORS,
    onMount: (dialog) => wireEngagementPreview(dialog.querySelector('form'), 'ig-edit'),
    onSubmit: async (values) => {
      await api.patch(`/api/v1/marketing/instagram/${encodeURIComponent(entry.id)}`, { ...instagramBody(values), version: entry.version });
    },
  });
  return outcome;
}

export { instagramBody };
