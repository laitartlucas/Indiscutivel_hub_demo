import { ApiError, describeError } from '../lib/api.js';
import { getPreferences, setAvatarUrl, setPreferences } from '../lib/account.js';
import { resizeAvatar } from '../lib/avatar.js';
import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { HOME_OPTIONS, TIMEZONE_OPTIONS, lastSeenLabel, memberSince, notificationItemsFor, passwordAgeLabel, sessionTitle } from '../lib/profile.js';
import { recoveryCountLabel } from '../lib/two-factor.js';
import { roleLabel } from '../lib/students.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, avatarContent, button, field, selectField, skeleton } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { openTwoFactorDisable, openTwoFactorRegenerate, openTwoFactorSetup } from '../ui/two-factor-dialog.js';
import { attachForm } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { nameError, phoneError } from './student-forms.js';

const INVALID_RESPONSE = 'Resposta inesperada do servidor. Tente de novo em instantes.';
const KNOWN_FIELDS = new Set(['name', 'phone']);
const SECTIONS = ['seguranca', 'preferencias', 'notificacoes'];

/** Resposta de `GET /account/profile` com o formato esperado; qualquer outra coisa não vira tela. */
function isProfile(value) {
  return !!value && typeof value === 'object' && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.email === 'string' && typeof value.role === 'string';
}

function retryAlert(message) {
  return html`<div class="stack">
    ${alert({ tone: 'danger', title: 'Não foi possível carregar o seu perfil', message })}
    <div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div>
  </div>`;
}

function staticField(label, value, hint) {
  return html`<div class="field">
    <p class="field-label">${label}</p>
    <p class="field-static">${value}</p>
    ${hint ? html`<p class="field-hint">${hint}</p>` : ''}
  </div>`;
}

/** Interruptor acessível (role="switch"). O texto vem de `label`; o estado, de aria-checked. */
function switchButton({ id, label, checked, disabled = false, extra = '' }) {
  return html`<button type="button" class="switch" role="switch" id="${id}" aria-checked="${checked ? 'true' : 'false'}" aria-label="${label}"${disabled ? html` disabled` : ''}${extra}></button>`;
}

function hero(profile, avatarUrl) {
  return html`<section class="pf-hero" aria-label="Resumo da conta">
    <svg class="pf-arcs" viewBox="0 0 420 180" aria-hidden="true"><circle cx="260" cy="90" r="60"></circle><circle cx="260" cy="90" r="110"></circle></svg>
    <div class="pf-avatar">
      <span class="pf-avatar-face" id="pf-avatar-face" aria-hidden="true">${avatarContent(profile.name, avatarUrl)}</span>
      <button type="button" class="pf-avatar-btn" id="pf-photo-btn" aria-label="Alterar foto">${icon('camera', { size: 16 })}</button>
      <input type="file" id="pf-photo-input" accept="image/png,image/jpeg,image/webp" hidden tabindex="-1" aria-label="Escolher uma foto">
    </div>
    <div class="pf-hero-text">
      <p class="pf-hero-name" id="pf-hero-name">${profile.name}</p>
      <p class="pf-hero-sub">${profile.email} · ${memberSince(profile.createdAt, profile.role)}</p>
    </div>
    <div class="pf-hero-tools">
      <span class="pf-chip">${roleLabel(profile.role)}</span>
      <button type="button" class="pf-link-btn" id="pf-photo-remove"${avatarUrl ? '' : html` hidden`}>Remover foto</button>
    </div>
    <p class="pf-photo-note" id="pf-photo-note" role="status">PNG, JPEG ou WebP de até 2 MB. A foto é recortada em formato quadrado.</p>
  </section>`;
}

function personalCard(profile) {
  return html`<section class="pf-card" id="pessoais" aria-labelledby="pf-personal-title">
    <h2 id="pf-personal-title">Informações pessoais</h2>
    <div id="profile-banner"></div>
    <form id="profile-form" novalidate>
      <div class="pf-fields">
        ${field({ id: 'profile-name', label: 'Nome', name: 'name', required: true, maxlength: 120, autocomplete: 'name', value: profile.name })}
        ${staticField('E-mail', profile.email, 'O e-mail é o seu login e não pode ser alterado aqui.')}
        ${field({ id: 'profile-phone', label: 'Telefone', name: 'phone', type: 'tel', maxlength: 20, autocomplete: 'tel', inputmode: 'tel', hint: 'Com DDD. Exemplo: (11) 91234-5678', value: profile.phone ?? '' })}
        ${staticField('Papel', roleLabel(profile.role) || '—')}
      </div>
    </form>
  </section>`;
}

/** Estado da verificação em duas etapas: carregando, com erro (tentar de novo), desativada ou ativa (com a contagem de códigos). */
function twoFactorBlock(state, role) {
  if (state === 'error') {
    return html`<div class="stack">${alert({ tone: 'danger', message: 'Não foi possível carregar a verificação em duas etapas.' })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', small: true, extra: { 'data-action': 'tf-retry' } })}</div></div>`;
  }
  if (!state) return skeleton(1);
  const recommend = role !== 'user' && !state.enabled;
  return html`${recommend ? html`<div id="pf-2fa-recommend">${alert({ tone: 'warn', title: 'Recomendamos ativar', message: 'Esta conta administra os dados da sua mentoria. Com a verificação em duas etapas, só a senha não basta para entrar.' })}</div>` : ''}
    <div class="pf-row pf-row-plain">
      <div class="pf-row-text"><span class="pf-row-title" id="pf-2fa-title">Verificação em duas etapas</span><span class="pf-row-sub" id="pf-2fa-sub">${state.enabled ? 'Ativa: além da senha, pedimos o código do aplicativo autenticador.' : 'Código por aplicativo autenticador. Desativada.'}</span></div>
      ${switchButton({ id: 'pf-2fa-switch', label: 'Verificação em duas etapas', checked: state.enabled, extra: html` aria-describedby="pf-2fa-sub"` })}
    </div>
    ${state.enabled ? html`<div class="pf-row pf-row-plain pf-2fa-codes">
      <div class="pf-row-text"><span class="pf-row-sub" id="pf-2fa-left" role="status">${recoveryCountLabel(state.recoveryCodesLeft)}</span></div>
      ${button({ label: 'Gerar novos códigos', variant: 'ghost', small: true, id: 'pf-2fa-regen' })}
    </div>` : ''}`;
}

function securityCard(profile, sessions, now, twoFactor) {
  return html`<section class="pf-card" id="seguranca" aria-labelledby="pf-security-title">
    <h2 id="pf-security-title" tabindex="-1">Segurança</h2>
    <div class="pf-row">
      <div class="pf-row-text"><span class="pf-row-title">Senha</span><span class="pf-row-sub" id="pf-password-age">${passwordAgeLabel(profile.passwordChangedAt, now)}</span></div>
      <a class="btn btn-ghost btn-sm" href="#/alterar-senha">Alterar senha</a>
    </div>
    <div id="pf-2fa" class="pf-2fa">${twoFactorBlock(twoFactor, profile.role)}</div>
    <h3 class="pf-subhead">Sessões ativas</h3>
    <div id="pf-sessions">${sessionsBlock(sessions, now)}</div>
  </section>`;
}

function sessionsBlock(sessions, now) {
  if (sessions === 'error') {
    return html`<div class="stack">${alert({ tone: 'danger', message: 'Não foi possível carregar as sessões.' })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', small: true, extra: { 'data-action': 'sessions-retry' } })}</div></div>`;
  }
  if (!sessions) return skeleton(2);
  const others = sessions.filter((s) => !s.current).length;
  return html`<ul class="pf-sessions" aria-label="Sessões ativas">${sessions.map(
    (s) => html`<li class="pf-session" data-session="${s.id}">
      <span class="pf-session-main"><strong>${sessionTitle(s)}</strong><span>${s.current ? 'Agora mesmo' : lastSeenLabel(s.lastSeenAt, now)}</span></span>
      ${s.current ? html`<span class="pf-session-now">Esta sessão</span>` : html`<button type="button" class="pf-danger-link" data-revoke="${s.id}" aria-label="Encerrar a sessão ${sessionTitle(s)}">Encerrar</button>`}
    </li>`,
  )}</ul>
  ${others > 0 ? html`<div class="row"><button type="button" class="btn btn-ghost btn-sm" id="pf-revoke-others">Encerrar todas as outras</button></div>` : html`<p class="pf-note">Você não tem outras sessões abertas.</p>`}`;
}

function notificationsCard(prefs, role) {
  const items = notificationItemsFor(role);
  return html`<section class="pf-card" id="notificacoes" aria-labelledby="pf-notify-title">
    <h2 id="pf-notify-title" tabindex="-1">Notificações</h2>
    <div>${items.map(
      (item) => html`<div class="pf-toggle-row">
        <div class="pf-row-text"><span class="pf-row-title">${item.title}</span><span class="pf-row-sub">${item.text}</span></div>
        ${switchButton({ id: `notify-${item.key}`, label: item.title, checked: Boolean(prefs?.notifications?.[item.key]), extra: html` data-notify="${item.key}"` })}
      </div>`,
    )}</div>
    <p class="pf-note">Por enquanto guardamos só a sua escolha. Os envios chegam junto com as Notificações.</p>
  </section>`;
}

function preferencesCard(prefs, role) {
  return html`<section class="pf-card" id="preferencias" aria-labelledby="pf-prefs-title">
    <h2 id="pf-prefs-title" tabindex="-1">Preferências</h2>
    <div class="pf-fields">
      <div class="field"><label class="field-label" for="pref-language">Idioma</label><div class="field-control"><select id="pref-language" class="field-input" disabled><option>Português (Brasil)</option></select></div></div>
      ${selectField({ id: 'pref-timezone', label: 'Fuso horário', value: prefs?.timezone ?? 'auto', options: TIMEZONE_OPTIONS })}
      <div class="field"><label class="field-label" for="pref-currency">Moeda</label><div class="field-control"><select id="pref-currency" class="field-input" disabled><option>Real (R$)</option></select></div></div>
      ${role === 'user' ? selectField({ id: 'pref-home', label: 'Página inicial', value: prefs?.homePage ?? 'dashboard', options: HOME_OPTIONS }) : ''}
    </div>
    <p class="pf-note">Idioma e moeda são fixos nesta versão. O fuso define onde o seu dia começa em Tarefas, Calendário e Painel; no modo automático vale o do navegador.</p>
    ${role === 'user'
      ? html`<div class="pf-toggle-row" id="pref-ranking-row">
          <div class="pf-row-text"><span class="pf-row-title">Aparecer no ranking da turma</span><span class="pf-row-sub">Mostra só o seu primeiro nome com a inicial do sobrenome, o nível e o XP do mês para quem também participa. Nada do seu CRM. Desligado por padrão; você sai quando quiser.</span></div>
          ${switchButton({ id: 'pref-ranking', label: 'Aparecer no ranking da turma', checked: Boolean(prefs?.rankingVisible) })}
        </div>`
      : ''}
  </section>`;
}

/** Valores do formulário -> corpo da API: nome aparado; telefone em branco vira null (limpa). */
export function profilePayload(values) {
  const phone = (values.phone ?? '').trim();
  return { name: (values.name ?? '').trim(), phone: phone === '' ? null : phone };
}

export function renderProfile({ root, session, api, navigate }) {
  let disposed = false;
  let seq = 0;
  let twoFactorSeq = 0;
  let profile = null;
  let sessions = null;
  let twoFactor = null;
  let formApi = null;

  const disposeShell = renderShell({
    root,
    session,
    navigate,
    eyebrow: 'Conta',
    heading: 'Meu perfil',
    actions: html`<button type="button" class="btn btn-ghost" id="profile-discard" disabled>Descartar</button>
      <button type="submit" form="profile-form" class="btn btn-primary" id="profile-save" disabled data-busy-label="Salvando…"><span class="spinner" aria-hidden="true" hidden></span><span>Salvar alterações</span></button>`,
    content: html`<div id="profile-region" aria-live="off">${skeleton(4)}</div>`,
  });
  const region = root.querySelector('#profile-region');
  const discardButton = root.querySelector('#profile-discard');
  const saveButton = root.querySelector('#profile-save');

  function setActionsEnabled(enabled) {
    discardButton.disabled = !enabled;
    saveButton.disabled = !enabled;
  }

  function setBanner(banner) {
    const el = region.querySelector('#profile-banner');
    if (!el || disposed) return;
    if (banner) mount(el, alert(banner));
    else el.replaceChildren();
  }

  function setNote(text, tone = 'info') {
    const note = region.querySelector('#pf-photo-note');
    if (!note) return;
    note.textContent = text;
    note.dataset.tone = tone;
  }

  // ---------- foto ----------
  function paintAvatar(url) {
    mount(region.querySelector('#pf-avatar-face'), avatarContent(profile.name, url));
    region.querySelector('#pf-photo-remove').hidden = !url;
  }

  async function changePhoto(file) {
    if (!file) return;
    setNote('Preparando a imagem…');
    const resized = await resizeAvatar(file);
    if (disposed) return;
    if (resized.error) {
      setNote(resized.error, 'error');
      return;
    }
    try {
      const saved = await api.patch('/api/v1/account/avatar', { dataUrl: resized.dataUrl });
      if (disposed) return;
      profile = { ...profile, avatarUrl: saved.avatarUrl };
      setAvatarUrl(saved.avatarUrl);
      paintAvatar(saved.avatarUrl);
      setNote('Foto atualizada.');
      toast('Foto atualizada.', { tone: 'success' });
    } catch (error) {
      if (!disposed) setNote(error.errors?.[0]?.message ?? describeError(error), 'error');
    }
  }

  async function removePhoto() {
    const remove = region.querySelector('#pf-photo-remove');
    remove.disabled = true;
    try {
      await api.delete('/api/v1/account/avatar');
      if (disposed) return;
      profile = { ...profile, avatarUrl: null };
      setAvatarUrl(null);
      paintAvatar(null);
      setNote('Foto removida.');
      toast('Foto removida.', { tone: 'success' });
      region.querySelector('#pf-photo-btn').focus();
    } catch (error) {
      if (!disposed) setNote(describeError(error), 'error');
    } finally {
      remove.disabled = false;
    }
  }

  // ---------- sessões ----------
  async function loadSessions() {
    sessions = null;
    const box = region.querySelector('#pf-sessions');
    if (box) mount(box, sessionsBlock(null));
    try {
      const result = await api.get('/api/v1/account/sessions');
      sessions = Array.isArray(result?.data) ? result.data : 'error';
    } catch {
      sessions = 'error';
    }
    if (disposed) return;
    const target = region.querySelector('#pf-sessions');
    if (target) mount(target, sessionsBlock(sessions, new Date()));
  }

  async function revoke(id) {
    try {
      await api.delete(`/api/v1/account/sessions/${encodeURIComponent(id)}`);
      if (!disposed) toast('Sessão encerrada.', { tone: 'success' });
    } catch (error) {
      if (!disposed) toast(describeError(error), { tone: 'danger' });
    }
    await loadSessions();
  }

  async function revokeOthers() {
    const ok = await confirmDialog({
      title: 'Encerrar as outras sessões?',
      message: 'Você continua conectada aqui. Nos outros aparelhos será preciso entrar de novo.',
      confirmLabel: 'Encerrar todas',
      tone: 'danger',
    });
    if (!ok || disposed) return;
    try {
      const result = await api.post('/api/v1/account/sessions/revoke-others', {});
      if (!disposed) toast(result.revoked === 1 ? '1 sessão encerrada.' : `${result.revoked} sessões encerradas.`, { tone: 'success' });
    } catch (error) {
      if (!disposed) toast(describeError(error), { tone: 'danger' });
    }
    await loadSessions();
  }

  // ---------- verificação em duas etapas ----------
  function paintTwoFactor() {
    const box = region.querySelector('#pf-2fa');
    if (box) mount(box, twoFactorBlock(twoFactor, profile.role));
  }

  async function loadTwoFactor({ focus = null } = {}) {
    const mine = ++twoFactorSeq;
    if (focus === null) {
      twoFactor = null;
      paintTwoFactor();
    }
    let next;
    try {
      const result = await api.get('/api/v1/account/two-factor');
      next = typeof result?.enabled === 'boolean' && Number.isInteger(result.recoveryCodesLeft) ? result : 'error';
    } catch {
      next = 'error';
    }
    if (disposed || mine !== twoFactorSeq) return;
    twoFactor = next;
    if (next !== 'error') session.setTwoFactorEnabled(next.enabled);
    paintTwoFactor();
    if (focus) region.querySelector(focus)?.focus();
  }

  async function toggleTwoFactor() {
    const sw = region.querySelector('#pf-2fa-switch');
    if (!twoFactor || twoFactor === 'error' || !sw) return;
    sw.disabled = true;
    let changed = false;
    try {
      changed = twoFactor.enabled ? await openTwoFactorDisable({ api, hint: twoFactor.demoHint }) : await openTwoFactorSetup({ api, email: profile.email });
    } finally {
      if (!disposed) sw.disabled = false;
    }
    if (disposed) return;
    if (changed) {
      // O servidor encerrou as outras sessões ao ativar: a lista de sessões muda junto.
      await loadTwoFactor({ focus: '#pf-2fa-switch' });
      loadSessions();
    } else {
      sw.focus();
    }
  }

  async function regenerateCodes() {
    const changed = await openTwoFactorRegenerate({ api, email: profile.email, hint: twoFactor.demoHint });
    if (disposed) return;
    if (changed) await loadTwoFactor({ focus: '#pf-2fa-regen' });
    else region.querySelector('#pf-2fa-regen')?.focus();
  }

  // ---------- preferências e notificações (gravam na hora; voltam ao valor anterior se falhar) ----------
  async function savePrefs(patch, revert) {
    try {
      const saved = await api.patch('/api/v1/account/preferences', patch);
      if (disposed) return;
      setPreferences(saved);
      toast('Preferência salva.', { tone: 'success' });
    } catch (error) {
      if (disposed) return;
      revert();
      toast(error.errors?.[0]?.message ?? describeError(error), { tone: 'danger' });
    }
  }

  function wirePrefs() {
    for (const [id, key] of [['pref-timezone', 'timezone'], ['pref-home', 'homePage']]) {
      const select = region.querySelector(`#${id}`);
      if (!select) continue;
      let last = select.value;
      select.addEventListener('change', () => {
        const next = select.value;
        savePrefs({ [key]: next }, () => { select.value = last; }).then(() => { last = select.value; });
      });
    }
    const ranking = region.querySelector('#pref-ranking');
    ranking?.addEventListener('click', () => {
      const next = ranking.getAttribute('aria-checked') !== 'true';
      ranking.setAttribute('aria-checked', String(next));
      savePrefs({ rankingVisible: next }, () => ranking.setAttribute('aria-checked', String(!next)));
    });
    for (const toggle of region.querySelectorAll('[data-notify]')) {
      toggle.addEventListener('click', () => {
        const next = toggle.getAttribute('aria-checked') !== 'true';
        toggle.setAttribute('aria-checked', String(next));
        savePrefs({ notifications: { [toggle.dataset.notify]: next } }, () => toggle.setAttribute('aria-checked', String(!next)));
      });
    }
  }

  // ---------- formulário de dados ----------
  function wireForm() {
    const form = region.querySelector('#profile-form');
    formApi = attachForm(form, {
      validators: { name: nameError, phone: phoneError },
      onSubmit: async (values, api2) => {
        setBanner(null);
        try {
          await api.patch('/api/v1/account/profile', profilePayload(values));
        } catch (error) {
          if (disposed) return;
          const orphan = api2.applyServerErrors(error.errors);
          const matched = (error.errors ?? []).some((e) => KNOWN_FIELDS.has(e.field));
          if (!matched) setBanner({ tone: 'danger', message: orphan.length ? orphan.join(' ') : describeError(error) });
          return;
        }
        toast('Perfil atualizado.', { tone: 'success' });
        profile = { ...profile, name: values.name.trim(), phone: profilePayload(values).phone };
        mount(region.querySelector('#pf-hero-name'), html`${profile.name}`);
        try {
          // Atualiza o nome em todo lugar (topbar, saudação): a mudança na sessão re-renderiza a tela já com os dados novos.
          await session.refresh();
        } catch {
          if (!disposed) setBanner({ tone: 'warn', message: 'Salvamos as alterações, mas não foi possível atualizar o nome no topo da página. Recarregue a página.' });
        }
      },
    });
  }

  function discard() {
    const form = region.querySelector('#profile-form');
    if (!form || !profile) return;
    form.elements.namedItem('name').value = profile.name;
    form.elements.namedItem('phone').value = profile.phone ?? '';
    formApi?.setError('name', null);
    formApi?.setError('phone', null);
    setBanner(null);
    toast('Alterações descartadas.', { tone: 'info' });
  }

  function scrollToSection() {
    const id = location.hash.split('#')[2];
    if (!SECTIONS.includes(id)) return;
    const card = region.querySelector(`#${id}`);
    card?.scrollIntoView({ block: 'start' });
    card?.querySelector('h2')?.focus({ preventScroll: true });
  }

  function showPage() {
    const prefs = getPreferences();
    const role = profile.role;
    mount(
      region,
      html`<div class="pf">
        ${hero(profile, profile.avatarUrl)}
        <div class="pf-grid">
          ${personalCard(profile)}
          ${securityCard(profile, sessions, new Date(), twoFactor)}
          ${notificationsCard(prefs, role)}
          ${preferencesCard(prefs, role)}
        </div>
      </div>`,
    );
    setActionsEnabled(true);
    wireForm();
    wirePrefs();
    scrollToSection();
  }

  async function load() {
    const mine = ++seq;
    setActionsEnabled(false);
    mount(region, skeleton(4));
    region.setAttribute('aria-busy', 'true');
    let data = null;
    let failure = null;
    try {
      data = await api.get('/api/v1/account/profile');
      if (!isProfile(data)) {
        data = null;
        failure = new ApiError({ status: 0, code: 'invalid_response', detail: INVALID_RESPONSE });
      }
    } catch (error) {
      failure = error;
    }
    if (disposed || mine !== seq) return;
    region.setAttribute('aria-busy', 'false');
    if (!data) {
      mount(region, retryAlert(describeError(failure)));
      return;
    }
    profile = data;
    setAvatarUrl(data.avatarUrl);
    // Preferências (cache da sessão; relê se ainda não chegaram) e sessões não derrubam o perfil se falharem.
    if (!getPreferences()) {
      try {
        setPreferences(await api.get('/api/v1/account/preferences'));
      } catch {
        // os controles aparecem com os padrões
      }
      if (disposed || mine !== seq) return;
    }
    showPage();
    loadSessions();
    loadTwoFactor();
  }

  region.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) load();
    else if (event.target.closest('[data-action="sessions-retry"]')) loadSessions();
    else if (event.target.closest('[data-action="tf-retry"]')) loadTwoFactor();
    else if (event.target.closest('#pf-2fa-switch')) toggleTwoFactor();
    else if (event.target.closest('#pf-2fa-regen')) regenerateCodes();
    else if (event.target.closest('#pf-photo-btn')) region.querySelector('#pf-photo-input').click();
    else if (event.target.closest('#pf-photo-remove')) removePhoto();
    else if (event.target.closest('#pf-revoke-others')) revokeOthers();
    else {
      const revokeBtn = event.target.closest('[data-revoke]');
      if (revokeBtn) {
        revokeBtn.disabled = true;
        revoke(revokeBtn.dataset.revoke);
      }
    }
  });
  region.addEventListener('change', (event) => {
    if (event.target.id !== 'pf-photo-input') return;
    const file = event.target.files?.[0];
    event.target.value = '';
    changePhoto(file);
  });
  discardButton.addEventListener('click', discard);
  const onHash = () => scrollToSection();
  window.addEventListener('hashchange', onHash);

  load();

  return () => {
    disposed = true;
    window.removeEventListener('hashchange', onHash);
    disposeShell();
  };
}

