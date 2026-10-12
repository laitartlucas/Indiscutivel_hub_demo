import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { icon } from '../ih-icons.js';
import { authBack, authScreen } from '../ui/components.js';

const STEPS = [
  { title: 'Peça o seu link à mentora', text: 'O acesso é criado por ela e o link chega pelo canal que vocês já usam.' },
  { title: 'Abra o link no navegador', text: 'Você confere o e-mail do convite e define a sua senha.' },
  { title: 'Entre no seu espaço', text: 'Depois de ativar, é só entrar com o e-mail e a senha que você escolheu.' },
];

/** `#/primeiro-acesso`: não existe cadastro livre; explica que o acesso vem por convite. Com o link em mãos, ele leva direto à ativação. */
export function renderFirstAccess({ root }) {
  mount(
    root,
    authScreen({
      eyebrow: 'CONVITE PESSOAL',
      headline: 'Seu espaço de crescimento está pronto.',
      sub: 'Um ambiente reservado para organizar clientes, metas e conquistas — preparado pela sua mentora.',
      labelledBy: 'first-access-title',
      wide: true,
      body: html`${authBack()}
      <div class="auth-heading">
        <p class="auth-eyebrow auth-eyebrow--dark">PRIMEIRO ACESSO</p>
        <h1 id="first-access-title" class="auth-title--md">O seu acesso vem por convite.</h1>
        <p class="lead">O Indiscutível Hub é um ambiente reservado: não há cadastro aberto. Sua mentora cria o seu acesso e envia um link pessoal.</p>
      </div>
      <ol class="first-steps first-steps--static">${STEPS.map(
        (step, index) => html`<li class="first-step"><span class="first-step-n" aria-hidden="true">${index + 1}</span><span class="first-step-text"><span class="first-step-title">${step.title}</span><span class="first-step-desc">${step.text}</span></span></li>`,
      )}</ol>
      <p class="auth-help">Já recebeu o link? Abra-o no navegador para ativar o seu acesso.</p>
      <a class="btn btn-primary btn-block" href="#/entrar"><span>Já tenho acesso: entrar</span>${icon('arrowRight')}</a>`,
    }),
  );
}
