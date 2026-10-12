import { icon } from '../ih-icons.js';
import { eyebrowDate, greeting } from '../lib/dashboard.js';
import { html } from '../lib/html.js';
import { navFor, renderShell } from '../shell.js';
import { emptyState } from '../ui/components.js';

/**
 * Painel da EQUIPE sem permissão de ver alunas: não há número da mentoria para mostrar, então a tela é um ponto de partida
 * com os atalhos do que o papel permite (os mesmos itens do menu). Nenhuma chamada à API: nada aqui depende de permissão.
 */
export function renderTeamHome({ root, session, navigate }) {
  const user = session.state.user;
  const first = String(user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  const now = new Date();
  const links = navFor(user).filter((item) => item.id !== 'home');
  return renderShell({
    root,
    session,
    navigate,
    active: 'home',
    heading: first ? `${greeting(now)}, ${first}.` : `${greeting(now)}.`,
    eyebrow: eyebrowDate(now),
    subtitle: user?.teamRole ? `Seu papel na equipe: ${user.teamRole}.` : 'Você faz parte da equipe da mentoria.',
    large: true,
    content: html`<div class="dash">
      <section class="dash-card" aria-labelledby="team-home-title">
        <h2 id="team-home-title">O que você pode fazer</h2>
        ${links.length === 0
          ? emptyState({ title: 'Seu papel ainda não libera nenhuma tela.', message: 'Peça à mentora para ajustar as permissões do seu papel. Você continua com o seu perfil, as notificações e a troca de senha.' })
          : html`<ul class="team-home-links">${links.map((item) => html`<li><a class="btn btn-ghost" href="${item.href}">${icon(item.icon, { size: 18 })}<span>${item.label}</span></a></li>`)}</ul>`}
      </section>
    </div>`,
  });
}
