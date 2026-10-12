import { mount } from '../lib/dom.js';
import { html } from '../lib/html.js';
import { logoMark } from '../ih-icons.js';
import { alert, wordmark } from '../ui/components.js';

// Textos genéricos de apoio. NÃO são revisão jurídica: a mentoria precisa revisá-los antes de valer como contrato.
const NOTICE = 'Modelo a ser revisado pela mentoria. Este texto é genérico e ainda não substitui a versão oficial.';

const TERMS = {
  title: 'Termos de uso',
  updated: 'Modelo sem data de vigência',
  sections: [
    ['1. O que é o Indiscutível Hub', 'O Indiscutível Hub é um ambiente reservado, oferecido pela mentoria, para organizar produtos, pessoas e oportunidades de venda. O acesso é pessoal e criado pela sua mentora por convite.'],
    ['2. Sua conta', 'Você é responsável por manter a senha em sigilo e por tudo o que acontece na sua conta. Não compartilhe o seu acesso. Se suspeitar de uso indevido, avise a sua mentora e troque a senha.'],
    ['3. Uso adequado', 'Use o ambiente apenas para fins legítimos ligados ao seu negócio e à mentoria. É proibido tentar acessar dados de outras pessoas, interferir no funcionamento do sistema ou cadastrar informações de terceiros sem ter o direito de fazê-lo.'],
    ['4. Seu conteúdo', 'Os produtos, as pessoas e as oportunidades que você cadastra continuam sendo seus. Você declara ter o direito de registrar essas informações.'],
    ['5. Disponibilidade', 'Fazemos o possível para manter o ambiente disponível, mas podem ocorrer interrupções para manutenção ou por motivos fora do nosso controle.'],
    ['6. Mudanças', 'Estes termos podem ser atualizados. Quando houver mudança relevante, você será avisada pela sua mentora.'],
    ['7. Contato', 'Dúvidas sobre estes termos devem ser enviadas à sua mentora.'],
  ],
};

const PRIVACY = {
  title: 'Política de privacidade',
  updated: 'Modelo sem data de vigência',
  sections: [
    ['1. Quais dados tratamos', 'Os dados da sua conta (nome e e-mail) e as informações que você mesma cadastra no sistema, como produtos, pessoas e oportunidades.'],
    ['2. Para que usamos', 'Para permitir o seu acesso, manter o seu ambiente funcionando, proteger a sua conta e apoiar o acompanhamento da mentoria.'],
    ['3. Senhas e segurança', 'A sua senha é guardada de forma protegida (não em texto legível). O acesso usa conexão segura e um cookie de sessão que identifica o seu navegador.'],
    ['4. Compartilhamento', 'Não vendemos os seus dados. A sua mentora vê os dados cadastrais e a situação do seu acesso. Os dados podem ser compartilhados quando a lei exigir.'],
    ['5. Seus direitos', 'Você pode pedir acesso, correção ou exclusão dos seus dados, nos termos da Lei Geral de Proteção de Dados (LGPD), falando com a sua mentora.'],
    ['6. Por quanto tempo guardamos', 'Enquanto a sua conta estiver ativa e pelo tempo necessário para cumprir obrigações legais.'],
    ['7. Contato', 'Dúvidas sobre privacidade devem ser enviadas à sua mentora.'],
  ],
};

function page(doc) {
  return html`<main id="main" class="legal-page">
    <article class="legal-card" aria-labelledby="legal-title">
      <a class="legal-brand" href="#/" aria-label="Voltar ao início">${logoMark(36)}${wordmark()}</a>
      ${alert({ tone: 'warn', title: 'Modelo a ser revisado pela mentoria', message: NOTICE })}
      <header class="legal-head">
        <p class="auth-eyebrow auth-eyebrow--dark">DOCUMENTO</p>
        <h1 id="legal-title">${doc.title}</h1>
        <p class="lead">${doc.updated}</p>
      </header>
      ${doc.sections.map(([heading, text]) => html`<section class="legal-section"><h2>${heading}</h2><p>${text}</p></section>`)}
      <a class="btn btn-ghost" href="#/">Voltar ao início</a>
    </article>
  </main>`;
}

export function renderTerms({ root }) {
  mount(root, page(TERMS));
}

export function renderPrivacy({ root }) {
  mount(root, page(PRIVACY));
}
