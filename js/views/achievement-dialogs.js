import { attrs, html } from '../lib/html.js';
import { instantDayMonthYear, parseRuleValue, RULE_HINTS, ruleValueInput } from '../lib/growth.js';
import { checkboxField, field, selectField } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';

/** Editor de conquista (gaveta lateral) e confirmação de arquivar. Devolvem `{ saved, hadFailure }` / booleano; quem chama recarrega. */

const textareaField = ({ id, name, label, value, rows = 3, maxlength, hint }) => html`<div class="field">
  <label class="field-label" for="${id}">${label}</label>
  <div class="field-control"><textarea${attrs({ id, name, class: 'field-input', rows, maxlength, 'aria-describedby': `${hint ? `${id}-hint ` : ''}${id}-error` })}>${value}</textarea></div>
  ${hint ? html`<p class="field-hint" id="${id}-hint">${hint}</p>` : ''}
  <p class="field-error" id="${id}-error" role="alert"></p>
</div>`;

function titleError(value) {
  const text = value.trim();
  if (text === '') return 'Informe o nome da conquista.';
  return [...text].length > 60 ? 'O nome é longo demais (máximo 60).' : null;
}

function descriptionError(value) {
  return [...value.trim()].length > 200 ? 'A descrição é longa demais (máximo 200).' : null;
}

function xpError(value) {
  const text = value.trim();
  if (text === '') return 'Informe o XP (use 0 para nenhum).';
  if (!/^\d+$/.test(text)) return 'O XP precisa ser um número inteiro.';
  return Number(text) > 500 ? 'O XP máximo é 500.' : null;
}

function ruleValueError(kind, options) {
  return (value) => {
    if (kind() === 'challenge_award') return null;
    const rule = options.find((o) => o.kind === kind());
    const parsed = parseRuleValue(kind(), value);
    if (parsed === null) return rule?.decimals ? 'Informe um valor em reais, como 10.000,00.' : 'Informe um número inteiro maior que zero.';
    if (parsed <= 0) return 'O valor precisa ser maior que zero.';
    return rule && parsed > rule.max ? `O valor máximo para esta regra é ${rule.max.toLocaleString('pt-BR')}.` : null;
  };
}

function editorBody(achievement, options, categories) {
  const kind = achievement?.ruleKind ?? options[0].kind;
  const rule = options.find((o) => o.kind === kind) ?? options[0];
  return html`${field({ id: 'ach-title', label: 'Nome', name: 'title', required: true, maxlength: 60, value: achievement?.title ?? '' })}
    ${textareaField({ id: 'ach-description', name: 'description', label: 'Descrição', value: achievement?.description ?? '', rows: 3, maxlength: 200, hint: 'Opcional. Aparece para a aluna no cartão da conquista.' })}
    ${selectField({ id: 'ach-category', label: 'Categoria', name: 'category', value: achievement?.category ?? categories[0].key, options: categories.map((c) => ({ value: c.key, label: c.label })) })}
    ${selectField({ id: 'ach-rule', label: 'Critério', name: 'ruleKind', value: kind, options: options.map((o) => ({ value: o.kind, label: o.label })) })}
    <div id="ach-value-wrap"${kind === 'challenge_award' ? html` hidden` : ''}>
      ${field({ id: 'ach-value', label: rule.unit ? `Valor (${rule.unit})` : 'Valor', name: 'ruleValue', inputmode: 'decimal', hint: RULE_HINTS[kind], value: achievement ? ruleValueInput(achievement.ruleKind, achievement.ruleValue) : '' })}
    </div>
    <p class="field-hint" id="ach-award-note"${kind === 'challenge_award' ? '' : html` hidden`}>${RULE_HINTS.challenge_award}</p>
    ${field({ id: 'ach-xp', label: 'XP ao desbloquear', name: 'xpReward', inputmode: 'numeric', hint: 'De 0 a 500. A aluna recebe uma vez só.', value: String(achievement?.xpReward ?? 0) })}
    ${checkboxField({ id: 'ach-active', name: 'active', label: 'Conquista ativa (as alunas podem desbloquear)', checked: achievement?.active ?? true })}`;
}

/** Abre o editor. `achievement` ausente = nova conquista. `options` e `categories` vêm da lista da mentora. */
export function openAchievementDialog({ api, achievement = null, options, categories, unlockedBy = [] }) {
  const isEdit = Boolean(achievement);
  const current = () => dialogKind;
  let dialogKind = achievement?.ruleKind ?? options[0].kind;
  let dialogEl = null;
  return openTrackedFormDialog({
    title: isEdit ? 'Editar conquista' : 'Nova conquista',
    description: isEdit ? undefined : 'Defina um marco real que a sua mentoria reconhece. O sistema confere sozinho, com os dados de cada aluna.',
    submitLabel: isEdit ? 'Salvar' : 'Criar conquista',
    className: 'dialog-drawer',
    body: html`${editorBody(achievement, options, categories)}${unlockedBy.length
      ? html`<div class="field"><h3 class="mg-section-title">Quem já desbloqueou</h3><ul class="mg-people">${unlockedBy.map(
          (u) => html`<li class="mg-person"><span class="mg-person-name">${u.name}</span><span class="mg-person-meta">${instantDayMonthYear(u.unlockedAt)}${u.className ? ` · ${u.className}` : ''}</span></li>`,
        )}</ul></div>`
      : ''}`,
    validators: {
      title: titleError,
      description: descriptionError,
      ruleValue: ruleValueError(current, options),
      xpReward: xpError,
    },
    onMount: (dialog) => {
      dialogEl = dialog;
      const select = dialog.querySelector('#ach-rule');
      const wrap = dialog.querySelector('#ach-value-wrap');
      const note = dialog.querySelector('#ach-award-note');
      const label = dialog.querySelector('label[for="ach-value"]');
      const hint = dialog.querySelector('#ach-value-hint');
      const input = dialog.querySelector('#ach-value');
      select.addEventListener('change', () => {
        dialogKind = select.value;
        const rule = options.find((o) => o.kind === dialogKind);
        const award = dialogKind === 'challenge_award';
        wrap.hidden = award;
        note.hidden = !award;
        label.textContent = rule?.unit ? `Valor (${rule.unit})` : 'Valor';
        if (hint) hint.textContent = RULE_HINTS[dialogKind] ?? '';
        input.setAttribute('inputmode', rule?.decimals ? 'decimal' : 'numeric');
      });
    },
    onSubmit: async (values) => {
      const kind = values.ruleKind;
      const body = {
        title: values.title.trim(),
        description: values.description.trim(),
        category: values.category,
        ruleKind: kind,
        ruleValue: parseRuleValue(kind, values.ruleValue),
        xpReward: Number(values.xpReward.trim()),
        active: dialogEl.querySelector('#ach-active').checked, // o valor do campo é sempre "on": vale o estado marcado
      };
      if (isEdit) await api.patch(`/api/v1/mentora/achievements/${achievement.id}`, { ...body, version: achievement.version });
      else await api.post('/api/v1/mentora/achievements', body);
    },
  });
}

export function confirmArchiveAchievement(achievement) {
  return confirmDialog({
    title: 'Arquivar conquista?',
    message: `“${achievement.title}” deixa de aparecer para as alunas e de ser concedida. Quem já desbloqueou continua com o registro.`,
    confirmLabel: 'Arquivar conquista',
    tone: 'danger',
  });
}
