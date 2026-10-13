import { ApiError, describeError } from '../lib/api.js';
import { focusHeading, mount } from '../lib/dom.js';
import { dateFormatter, dateTimeFormatter, formatDateOnly } from '../lib/format.js';
import { html } from '../lib/html.js';
import { STATUS_LABELS, availableActions, canResend, resendLabel, resendSuccessMessage, statusTone } from '../lib/students.js';
import { hashParam } from '../lib/query.js';
import { renderShell } from '../shell.js';
import { alert, avatarContent, badge, button, emptyState, skeleton } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { openTrackedFormDialog } from '../ui/form-dialog.js';
import { openPlanDialog } from './followup-dialogs.js';
import { can } from '../lib/permissions.js';
import { toast } from '../ui/toast.js';
import { copyLinkDialog, linkDatesCheck, studentDialogBody, studentPayload, studentValidators } from './student-forms.js';
import { mountStudentGrowth } from './student-growth.js';

const INVITE_LABELS = { pending: 'Pendente', expired: 'Expirado', accepted: 'Aceito', cancelled: 'Cancelado' };
const INVITE_TONES = { pending: 'warn', expired: 'bad', accepted: 'good', cancelled: 'neutral' };
const INVALID_RESPONSE = 'Resposta inesperada do servidor. Tente de novo em instantes.';

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const orDash = (value) => (value ? value : '—');
const stamp = (iso) => dateTimeFormatter.format(new Date(iso));

/** Resposta de `GET /students/:id` com o formato esperado; qualquer outra coisa não vira tela. */
function isProfile(value) {
  const s = value?.student;
  return !!s && typeof s === 'object' && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.email === 'string' && typeof s.status === 'string' && Array.isArray(value.invites);
}

const isInvite = (value) => !!value && typeof value === 'object' && typeof value.expiresAt === 'string';

function retryAlert(message) {
  return html`<div class="stack">
    ${alert({ tone: 'danger', title: 'Não foi possível carregar a aluna', message })}
    <div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div>
  </div>`;
}

function notFound() {
  return html`<section class="dash-card mentora-empty" aria-label="Aluna não encontrada">${emptyState({
    iconName: 'alunas',
    title: 'Aluna não encontrada',
    message: 'Ela pode ter sido removida ou o endereço está incorreto.',
    action: html`<a class="btn btn-primary" href="#/alunas">Voltar para Minhas alunas</a>`,
  })}</section>`;
}

function dataRow(label, value) {
  return html`<div><dt>${label}</dt><dd>${value}</dd></div>`;
}

function renderData(student) {
  return html`<section class="dash-card" aria-labelledby="profile-data-title">
    <h2 id="profile-data-title">Dados</h2>
    <div class="profile-head-id"><span class="avatar profile-avatar" aria-hidden="true">${avatarContent(student.name, student.avatarUrl)}</span></div>
    <dl class="profile-data">
      ${dataRow('E-mail', student.email)}
      ${dataRow('Telefone', orDash(student.phone))}
      ${dataRow('Turma', orDash(student.className))}
      ${dataRow('Programa', orDash(student.program))}
      ${dataRow('Plano', orDash(student.plan))}
      ${dataRow('Entrada', formatDateOnly(student.joinedOn))}
      ${dataRow('Término', formatDateOnly(student.endsOn))}
      ${dataRow('Cadastrada em', dateFormatter.format(new Date(student.createdAt)))}
    </dl>
  </section>`;
}

function inviteItem(invite) {
  const status = has(INVITE_LABELS, invite.status) ? invite.status : 'cancelled';
  return html`<li class="invite-item">
    ${badge(INVITE_LABELS[status] ?? invite.status, INVITE_TONES[status] ?? 'neutral')}
    <span class="invite-meta">
      ${invite.sentAt ? html`<span>Enviado em ${stamp(invite.sentAt)}</span>` : ''}
      ${invite.acceptedAt ? html`<span>Aceito em ${stamp(invite.acceptedAt)}</span>` : ''}
      <span>Válido até ${stamp(invite.expiresAt)}</span>
    </span>
  </li>`;
}

function renderAccess(student, invites, twoFactorEnabled) {
  const list = invites.filter(isInvite);
  return html`<section class="dash-card" aria-labelledby="profile-access-title">
    <h2 id="profile-access-title">Acesso</h2>
    <dl class="profile-data">
      ${dataRow('Estado', badge(STATUS_LABELS[student.status] ?? student.status, statusTone(student.status)))}
      ${dataRow('Último acesso', student.lastLoginAt ? stamp(student.lastLoginAt) : 'Nunca acessou')}
      ${typeof twoFactorEnabled === 'boolean' ? dataRow('Verificação em duas etapas', twoFactorEnabled ? 'Ativa' : 'Desativada') : ''}
    </dl>
    <h3 class="profile-subhead" id="profile-invites-title">Convites</h3>
    ${list.length === 0 ? html`<p class="muted">Nenhum convite gerado ainda.</p>` : html`<ul class="invite-list" aria-labelledby="profile-invites-title">${list.map(inviteItem)}</ul>`}
  </section>`;
}

/** Botões do cabeçalho: só as ações válidas para o estado atual (o servidor continua sendo a autoridade). */
function headerActions(student, invites, user, twoFactorEnabled) {
  const valid = new Set(availableActions(student));
  const hasPending = invites.some((invite) => invite?.status === 'pending');
  // A equipe só vê as ações que o papel permite (o servidor confere de novo em cada rota).
  const manage = can(user, 'students.manage');
  const items = [
    ['edit', 'Editar dados', 'primary', manage],
    ['schedule', 'Marcar sessão', 'ghost', can(user, 'sessions.manage')],
    ['plan', 'Plano de ação', 'ghost', student.status === 'active' && can(user, 'followup.manage')],
    ['resend', resendLabel(student), 'ghost', manage && canResend(student, user)],
    ['cancel-invite', 'Cancelar convite pendente', 'ghost', manage && hasPending],
    ['block', 'Bloquear acesso', 'ghost', manage && valid.has('block')],
    ['unblock', 'Desbloquear', 'ghost', manage && valid.has('unblock')],
    ['deactivate', 'Desativar conta', 'ghost', manage && valid.has('deactivate')],
    ['reactivate', 'Reativar conta', 'ghost', manage && valid.has('reactivate')],
    // Só a mentora proprietária (a equipe nunca) e só se a aluna usa a verificação em duas etapas.
    ['reset-2fa', 'Redefinir verificação em duas etapas', 'ghost', user?.role === 'admin' && twoFactorEnabled === true],
  ];
  return html`${items.filter((item) => item[3]).map(([action, label, variant]) => button({ label, variant, extra: { 'data-action': action } }))}`;
}

export function renderStudentProfile({ root, session, api, navigate, params }) {
  const base = `/api/v1/students/${encodeURIComponent(params.id)}`;
  let disposed = false;
  let busy = false;
  let seq = 0;
  let profile = null;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    active: 'students',
    heading: 'Aluna',
    eyebrow: html`Mentoria · <a class="back-link" href="#/alunas">← Minhas alunas</a>`,
    subtitle: html`<span id="profile-subtitle"></span>`,
    actions: html`<span class="profile-actions" id="profile-actions"></span>`,
    content: html`<div id="profile-growth"></div><div id="profile-region" aria-live="off">${skeleton(4)}</div>`,
  });

  const region = root.querySelector('#profile-region');
  const growthHost = root.querySelector('#profile-growth');
  let growth = null;
  const actionsEl = root.querySelector('#profile-actions');
  const subtitleEl = root.querySelector('#profile-subtitle');
  const heading = root.querySelector('h1');

  function paintHeader(data) {
    heading.textContent = data ? data.student.name : 'Aluna';
    mount(subtitleEl, data ? badge(STATUS_LABELS[data.student.status] ?? data.student.status, statusTone(data.student.status)) : html``);
    mount(actionsEl, data ? headerActions(data.student, data.invites, session.state.user, data.twoFactorEnabled) : html``);
  }

  /** `silent`: recarga depois de uma ação, sem trocar a tela por um esqueleto (o foco e a rolagem ficam onde estão). */
  async function load({ silent = false } = {}) {
    const mine = ++seq;
    if (!silent) {
      profile = null;
      paintHeader(null);
      mount(region, skeleton(4));
    }
    region.setAttribute('aria-busy', 'true');
    let data = null;
    let failure = null;
    try {
      data = await api.get(base);
      if (!isProfile(data)) {
        data = null;
        failure = new ApiError({ status: 0, code: 'invalid_response', detail: INVALID_RESPONSE });
      }
    } catch (error) {
      failure = error;
    }
    if (disposed || mine !== seq) return;
    region.setAttribute('aria-busy', 'false');
    profile = data;
    paintHeader(data);
    if (data) {
      mount(region, html`<div class="dash dash-split">${renderData(data.student)}${renderAccess(data.student, data.invites, data.twoFactorEnabled)}</div>`);
      // As seções de mentoria carregam sozinhas, uma vez por visita (uma recarga depois de uma ação não as refaz).
      if (!growth) {
        growth = mountStudentGrowth({ host: growthHost, api, student: data.student, can: (key) => can(session.state.user, key) });
        if (hashParam('sessao') === '1') {
          window.history.replaceState(null, '', `#/alunas/${encodeURIComponent(params.id)}`);
          growth.openSchedule();
        }
      }
    } else if (failure instanceof ApiError && failure.status === 404) {
      mount(region, notFound());
    } else {
      mount(region, retryAlert(describeError(failure)));
    }
  }

  /** Depois de uma ação: o foco volta ao botão da mesma ação, se ela ainda existir, ou ao título. */
  function restoreFocus(action) {
    if (disposed) return;
    const target = action ? actionsEl.querySelector(`[data-action="${action}"]`) : null;
    if (target) target.focus();
    else focusHeading(root);
  }

  function setActionsBusy(value) {
    for (const control of actionsEl.querySelectorAll('button')) control.disabled = value;
  }

  /** Executa `request()`, avisa (sucesso ou erro) e SEMPRE recarrega o perfil, no sucesso e na falha. Devolve a resposta ou null. */
  async function mutate(request, successMessage) {
    setActionsBusy(true);
    let result = null;
    try {
      result = await request();
      if (!disposed) toast(successMessage, { tone: 'success' });
    } catch (error) {
      if (!disposed) toast(describeError(error), { tone: 'danger' });
    }
    return result;
  }

  async function transition(action, successMessage) {
    await mutate(() => api.post(`${base}/status`, { action }), successMessage);
    await load({ silent: true });
  }

  async function edit() {
    const student = profile.student;
    const { saved, hadFailure } = await openTrackedFormDialog({
      title: 'Editar dados',
      submitLabel: 'Salvar',
      body: studentDialogBody(student),
      className: 'dialog-wide',
      validators: studentValidators(student),
      onMount: (dialog, formApi) => linkDatesCheck(dialog, formApi),
      onSubmit: async (values) => {
        await api.patch(base, studentPayload(values, { existing: student }));
      },
    });
    if (disposed) return;
    if (saved) toast('Dados atualizados.', { tone: 'success' });
    if (saved || hadFailure) await load({ silent: true });
  }

  async function resend() {
    const before = profile.student;
    // Um convite pendente morre quando o novo é gerado: confirma antes (sem pendente, não há o que perder).
    if (profile.invites.some((invite) => invite?.status === 'pending')) {
      const confirmed = await confirmDialog({
        title: 'Gerar um novo link?',
        message: 'O link anterior deixa de funcionar.',
        confirmLabel: 'Gerar novo link',
        cancelLabel: 'Voltar',
      });
      if (!confirmed || disposed) return false;
    }
    const result = await mutate(() => api.post(`${base}/invites`, {}), resendSuccessMessage(before));
    const reload = load({ silent: true });
    // O link só aparece uma vez: o diálogo abre já com a resposta, sem esperar a recarga do perfil.
    if (!disposed && result?.invite?.acceptUrl) {
      await copyLinkDialog({ student: result.student ?? before, acceptUrl: result.invite.acceptUrl, reset: before.status === 'active' });
    }
    await reload;
  }

  const disconnectMessage = (name, until) => `${name} será desconectada na hora e não conseguirá entrar até você ${until}.`;

  const HANDLERS = {
    edit,
    resend,
    'cancel-invite': async () => {
      const name = profile.student.name;
      const confirmed = await confirmDialog({
        title: 'Cancelar o convite pendente?',
        message: `O link de acesso enviado a ${name} deixa de funcionar. Você pode gerar um novo quando quiser.`,
        confirmLabel: 'Cancelar convite',
        cancelLabel: 'Voltar',
      });
      if (!confirmed || disposed) return false;
      await mutate(() => api.post(`${base}/invites/cancel`, {}), 'Convite cancelado.');
      await load({ silent: true });
    },
    block: async () => {
      const name = profile.student.name;
      const confirmed = await confirmDialog({
        title: `Bloquear o acesso de ${name}?`,
        message: disconnectMessage(name, 'desbloquear'),
        confirmLabel: 'Bloquear acesso',
        cancelLabel: 'Voltar',
      });
      if (!confirmed || disposed) return false;
      await transition('block', 'Acesso bloqueado.');
    },
    schedule: async () => {
      await growth?.openSchedule();
    },
    // Atalho para o plano de ação do Acompanhamento (o mesmo diálogo): busca o plano atual antes de abrir.
    plan: async () => {
      const student = profile.student;
      let plan = null;
      try {
        plan = (await api.get(`/api/v1/mentora/students/${encodeURIComponent(student.id)}/followup-plan`)).plan;
      } catch (error) {
        if (!disposed) toast(describeError(error), { tone: 'danger' });
        return false;
      }
      if (disposed) return false;
      const { saved } = await openPlanDialog({ api, student: { id: student.id, name: student.name }, plan });
      if (saved && !disposed) toast('Plano de ação salvo.', { tone: 'success' });
      return saved ? undefined : false;
    },
    unblock: () => transition('unblock', 'Acesso desbloqueado.'),
    deactivate: async () => {
      const name = profile.student.name;
      const confirmed = await confirmDialog({
        title: `Desativar a conta de ${name}?`,
        message: disconnectMessage(name, 'reativar a conta'),
        confirmLabel: 'Desativar conta',
        cancelLabel: 'Voltar',
        tone: 'danger',
      });
      if (!confirmed || disposed) return false;
      await transition('deactivate', 'Conta desativada.');
    },
    reactivate: () => transition('reactivate', 'Conta reativada.'),
    'reset-2fa': async () => {
      const name = profile.student.name;
      const confirmed = await confirmDialog({
        title: `Desativar a verificação em duas etapas de ${name}?`,
        message: `Faça isso só se ela perdeu o celular e os códigos de recuperação. ${name} será desconectada na hora, receberá um aviso e poderá ativar a verificação de novo no Perfil dela.`,
        confirmLabel: 'Desativar verificação',
        cancelLabel: 'Voltar',
        tone: 'danger',
      });
      if (!confirmed || disposed) return false;
      await mutate(() => api.post(`${base}/two-factor/reset`, {}), 'Verificação em duas etapas desativada.');
      await load({ silent: true });
    },
  };

  actionsEl.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || !has(HANDLERS, action) || busy || !profile) return;
    busy = true;
    let changed;
    try {
      changed = await HANDLERS[action]();
    } finally {
      busy = false;
    }
    // Diálogo cancelado: ele mesmo devolve o foco ao botão que o abriu; só depois de mexer na tela é que se refoca.
    if (changed !== false) restoreFocus(action);
  });

  region.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) load();
  });

  load();

  return () => {
    disposed = true;
    growth?.dispose();
    disposeShell();
  };
}
