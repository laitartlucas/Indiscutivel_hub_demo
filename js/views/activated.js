import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { firstName } from '../lib/invite-errors.js';
import { icon } from '../ih-icons.js';
import { authScreen } from '../ui/components.js';

// Passos que existem de verdade no sistema (Produtos, Contatos, Pipeline), cada um leva à tela.
const STEPS = [
  { href: '#/produtos', title: 'Cadastre um produto', text: 'O que você vende, com o preço, para usar nas oportunidades.' },
  { href: '#/comercial/contatos', title: 'Cadastre um contato', text: 'Comece por quem já está em conversa com você.' },
  { href: '#/comercial/pipeline', title: 'Crie a primeira oportunidade', text: 'Escolha o funil e acompanhe cada negociação até o fechamento.' },
];

/** Depois de ativar a conta pelo convite (ver `justActivated` em router-core). Sem metas nem desafios: só o que o sistema tem. */
export function renderActivated({ root, session, api }) {
  const first = firstName(session.state.user?.name);
  mount(
    root,
    authScreen({
      eyebrow: 'ACESSO ATIVADO',
      headline: 'O próximo passo começa agora.',
      sub: 'Seus clientes, metas e conquistas organizados em um só lugar — com a clareza de quem sabe exatamente o próximo passo.',
      labelledBy: 'activated-title',
      wide: true,
      body: html`<div class="success-ring" aria-hidden="true"><span class="success-ring-line"></span><span class="success-ring-core">${icon('check', { size: 32, stroke: 1.6 })}</span></div>
      <div class="auth-heading auth-heading--lg">
        <h1 id="activated-title">Acesso ativado.</h1>
        <p class="lead lead--ink">${first ? `Tudo pronto, ${first}.` : 'Tudo pronto.'} Seu espaço já está preparado: comece pelos três passos abaixo.</p>
      </div>
      <p class="lead lead--ink activated-welcome" id="activated-welcome" hidden></p>
      <section class="first-steps-card" aria-labelledby="first-steps-title">
        <h2 id="first-steps-title" class="first-steps-head">SEUS PRIMEIROS PASSOS</h2>
        <ol class="first-steps">${STEPS.map(
          (step, index) => html`<li><a class="first-step" href="${step.href}"><span class="first-step-n" aria-hidden="true">${index + 1}</span><span class="first-step-text"><span class="first-step-title">${step.title}</span><span class="first-step-desc">${step.text}</span></span><span class="first-step-go" aria-hidden="true">${icon('chevronRight')}</span></a></li>`,
        )}</ol>
      </section>
      <a class="btn btn-primary btn-block" id="enter-space" href="#/"><span>Entrar no meu espaço</span>${icon('arrowRight')}</a>`,
    }),
  );
  // Boas-vindas da mentoria (se a mentora escreveu uma). Falha em silêncio: a tela já está completa sem ela.
  let gone = false;
  api
    ?.get('/api/v1/account/mentoria')
    .then((info) => {
      const el = root.querySelector('#activated-welcome');
      if (gone || !el || !info || typeof info.welcomeMessage !== 'string' || !info.welcomeMessage.trim()) return;
      el.textContent = info.welcomeMessage;
      el.hidden = false;
    })
    .catch(() => {});
  // O estado "acabou de ativar" serve só a esta tela: qualquer saída dela o encerra.
  const onClick = (event) => {
    if (event.target.closest('a[href^="#/"]')) session.clearActivation();
  };
  root.addEventListener('click', onClick);
  return () => {
    gone = true;
    root.removeEventListener('click', onClick);
    session.clearActivation();
  };
}
