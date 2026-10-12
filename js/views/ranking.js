import { describeError } from '../lib/api.js';
import { setPreferences } from '../lib/account.js';
import { mount } from '../lib/dom.js';
import { attrs, html } from '../lib/html.js';
import { buildQuery } from '../lib/query.js';
import { entryDescription, gainLabel, gainWidth, levelLabel, positionLabel, splitRanking, subtitleText, summaryText } from '../lib/ranking.js';
import { tzOffsetMinutes } from '../lib/tasks.js';
import { applySizes } from '../lib/widths.js';
import { icon } from '../ih-icons.js';
import { renderShell } from '../shell.js';
import { alert, avatarContent, button, emptyState, skeleton } from '../ui/components.js';
import { dataTable } from '../ui/table.js';
import { toast } from '../ui/toast.js';

function podiumCard(entry, index) {
  return html`<article${attrs({ class: `rk-podium-card${index === 0 ? ' is-first' : ''}${entry.me ? ' is-me' : ''}`, 'aria-label': entryDescription(entry) })}>
    <span class="rk-podium-pos" aria-hidden="true">${positionLabel(entry.position)}</span>
    <span class="rk-avatar" aria-hidden="true">${avatarContent(entry.name, null)}</span>
    <span class="rk-podium-main"><span class="rk-podium-name">${entry.name}${entry.me ? html` <span class="rk-you">você</span>` : ''}</span><span class="rk-podium-level">${levelLabel(entry.level)}</span></span>
    <span class="rk-podium-gain">${gainLabel(entry.monthXp)}</span>
  </article>`;
}

function rankingTable(rest, all) {
  return dataTable({
    caption: 'Ranking da comunidade: posição, nome, nível e evolução no mês',
    rowKey: (row) => row.position + row.name,
    rowClass: (row) => (row.me ? 'rk-row is-me' : 'rk-row'),
    columns: [
      { label: 'Posição', nowrap: true, render: (row) => html`<span class="rk-pos">${positionLabel(row.position)}</span>` },
      {
        label: 'Nome',
        render: (row) => html`<span class="person-cell"><span class="rk-avatar rk-avatar-sm" aria-hidden="true">${avatarContent(row.name, null)}</span><span class="person-name">${row.name}</span>${row.me ? html`<span class="rk-you">você</span>` : ''}</span>`,
      },
      { label: 'Nível', nowrap: true, render: (row) => levelLabel(row.level) },
      {
        label: 'Evolução no mês',
        render: (row) => html`<span class="rk-gain"><span class="rk-bar" aria-hidden="true"><span${attrs({ class: 'rk-bar-fill', 'data-w': String(gainWidth(row.monthXp, all)) })}></span></span><span class="rk-gain-text">${gainLabel(row.monthXp)}</span></span>`,
      },
    ],
    rows: rest,
  });
}

function notParticipating() {
  return html`<section class="growth-card growth-empty" id="ranking-optin" aria-labelledby="rk-optin-title">
    ${emptyState({
      iconName: 'equipe',
      title: 'Ative a participação para ver e aparecer no ranking',
      message: 'O ranking mostra só o primeiro nome com a inicial do sobrenome, o nível e quanto cada aluna evoluiu em XP neste mês. Nada do seu CRM aparece, e você pode sair quando quiser.',
      action: html`<div class="row rk-optin-actions">${button({ label: 'Participar do ranking', id: 'ranking-join', iconStart: icon('check', { size: 16, stroke: 2 }) })}<a class="btn btn-ghost" href="#/perfil">Ver minhas preferências</a></div>`,
    })}
  </section>`;
}

function aloneBlock() {
  return html`<p class="rk-alone" role="status">Você é a primeira a participar. Quando outras alunas da sua turma ativarem a participação, elas aparecem aqui.</p>`;
}

function listBlock(ranking) {
  const { podium, rest } = splitRanking(ranking.data);
  const summary = summaryText(ranking.position, ranking.total);
  return html`${summary ? html`<p class="rk-summary" id="ranking-summary" tabindex="-1">${summary}</p>` : ''}
    <div class="rk-podium" aria-label="Três primeiras posições">${podium.map((entry, index) => podiumCard(entry, index))}</div>
    ${rest.length > 0 ? html`<section class="rk-table" aria-label="Demais posições">${rankingTable(rest, ranking.data)}</section>` : ''}
    ${ranking.total === 1 ? aloneBlock() : ''}`;
}

function note() {
  return html`<p class="rk-note">A participação é opcional. Você pode ocultar seu nome em <a href="#/perfil">Perfil › Preferências</a>. Aparecem só o nome (primeiro nome e inicial), o nível e o XP ganho no mês.</p>`;
}

function errorBlock(error) {
  return html`<div class="stack">${alert({ tone: 'danger', message: describeError(error) })}<div class="row">${button({ label: 'Tentar de novo', variant: 'ghost', extra: { 'data-action': 'retry' } })}</div></div>`;
}

export function renderRanking({ root, session, api, navigate }) {
  let disposed = false;
  let generation = 0;

  const dispose = renderShell({
    root,
    session,
    navigate,
    active: 'ranking',
    heading: 'Evolução da comunidade',
    eyebrow: 'Crescimento',
    subtitle: 'Ranking por evolução no mês, não por volume absoluto.',
    actions: html`<a class="btn btn-ghost" href="#/progresso">Meu progresso</a>`,
    content: html`<div class="growth" id="ranking-region" aria-busy="true">${skeleton(5)}</div>`,
  });
  const region = root.querySelector('#ranking-region');
  const subtitle = root.querySelector('.page-subtitle');

  async function load() {
    const id = ++generation;
    region.setAttribute('aria-busy', 'true');
    mount(region, skeleton(5));
    try {
      const ranking = await api.get(`/api/v1/ranking${buildQuery({ tzOffset: tzOffsetMinutes() })}`);
      if (disposed || id !== generation) return;
      if (ranking.participating) {
        if (subtitle) subtitle.textContent = subtitleText(ranking);
        mount(region, html`${listBlock(ranking)}${note()}`);
      } else {
        mount(region, html`${notParticipating()}${note()}`);
      }
      applySizes(region);
    } catch (error) {
      if (disposed || id !== generation) return;
      mount(region, errorBlock(error));
    }
    region.setAttribute('aria-busy', 'false');
  }

  async function join(trigger) {
    trigger.disabled = true;
    trigger.setAttribute('aria-busy', 'true');
    try {
      const saved = await api.patch('/api/v1/account/preferences', { rankingVisible: true });
      if (disposed) return;
      setPreferences(saved);
      toast('Você agora aparece no ranking.', { tone: 'success' });
      await load();
      // O botão que foi clicado saiu da tela: o foco vai para o resumo ("Você está na posição...").
      root.querySelector('#ranking-summary')?.focus();
    } catch (error) {
      if (disposed) return;
      trigger.disabled = false;
      trigger.removeAttribute('aria-busy');
      toast(error.errors?.[0]?.message ?? describeError(error), { tone: 'danger' });
    }
  }

  region.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) load();
    const joinButton = event.target.closest('#ranking-join');
    if (joinButton) join(joinButton);
  });
  load();

  return () => {
    disposed = true;
    dispose();
  };
}
