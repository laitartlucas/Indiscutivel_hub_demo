import { APP_VERSION } from '../config.js';
import { html } from '../lib/html.js';
import { searchShortcutLabel } from '../lib/shortcuts.js';
import { renderShell } from '../shell.js';
import { openShortcutsDialog } from '../ui/shortcuts-dialog.js';

// Central de ajuda: texto estático, curto e só sobre o que existe hoje. Cada seção descreve uma tela real do app.
// Quando uma tela mudar, a seção correspondente muda junto (nada de prometer o que ainda não existe).

const STUDENT_SECTIONS = [
  {
    id: 'painel',
    title: 'Painel',
    intro: 'A primeira tela depois do login. Ela mostra o que pede atenção agora.',
    items: [
      'O cartão verde "Seu próximo movimento" resume quantas oportunidades estão em andamento, destaca as que esperam contato e leva ao funil.',
      '"Vendas ganhas" soma as oportunidades ganhas e leva aos seus clientes. "Funil de vendas" resume as oportunidades por etapa.',
      '"Foco de hoje" mostra quantas tarefas do dia já foram concluídas. "Pessoas recentes" e "Produtos recentes" são atalhos para os últimos cadastros.',
      '"Minhas alunas ativas" é o número que você mesma informa: quantas alunas ativas você tem hoje. Toque em "Atualizar" quando mudar; o Painel mostra a data da última atualização, a variação em relação ao mês anterior e os últimos 6 meses. Sua mentora vê só esse número, nunca os seus clientes nem valores.',
      '"Tire dúvidas com a IA da sua mentora" abre a IA Indiscutível em uma nova aba.',
      'Se a sua mentora redefiniu a sua senha por um link, o Painel avisa por até 30 dias. Toque em "Entendi" para dispensar o aviso neste aparelho.',
    ],
  },
  {
    id: 'pessoas',
    title: 'Pessoas',
    intro: 'Quem está no seu relacionamento: clientes, interessados, indicações.',
    items: [
      'Use "Nova pessoa" e preencha o nome. WhatsApp (com DDD), Instagram, e-mail, origem e empresa são opcionais.',
      'A lista alterna entre tabela e cartões. A busca procura por nome, e-mail, Instagram, empresa e pelos números do WhatsApp.',
      'No menu "Mais ações" de cada linha você exclui a pessoa. As oportunidades dela são excluídas junto; as tarefas continuam, sem o vínculo.',
    ],
  },
  {
    id: 'leads',
    title: 'Leads',
    intro: 'Contatos que ainda não viraram oportunidade.',
    items: [
      'Cada lead tem situação (Novo, Contatado, Qualificado, Perdido ou Convertido), temperatura (Frio, Morno ou Quente) e um valor estimado opcional.',
      'Na página do lead você registra anotações, ligações, e-mails, reuniões e mensagens de WhatsApp. Elas formam a linha do tempo. As atividades não são editadas depois de salvas.',
      '"Criar oportunidade" converte o lead: o sistema reaproveita a Pessoa com o mesmo WhatsApp ou e-mail (ou cria uma) e abre a oportunidade. Um lead só é convertido uma vez.',
    ],
  },
  {
    id: 'empresas',
    title: 'Empresas',
    intro: 'As organizações com quem você trabalha.',
    items: [
      'Cadastre a empresa com segmento, cidade, estado e site. Depois vincule Pessoas a ela, no cadastro de cada Pessoa.',
      'A lista mostra, por empresa, quantos contatos ela tem, as oportunidades em andamento e o valor do pipeline. Na página da empresa você vê o detalhe.',
      'Excluir uma empresa não exclui as Pessoas: elas apenas ficam sem empresa.',
    ],
  },
  {
    id: 'oportunidades',
    title: 'Oportunidades e funil',
    intro: 'O funil de vendas em quadro, com uma coluna por etapa.',
    items: [
      'As etapas são Chegaram, Em conversa, Proposta, Ganhas e Perdidas. Você pode renomeá-las e ajustar a probabilidade de cada uma em Configurações.',
      'Mova um cartão arrastando-o para outra coluna ou, pelo teclado, pelo menu "Mais ações" > "Mover para…".',
      'Para perder uma oportunidade é preciso informar o motivo. Ao abrir uma oportunidade você vê as etapas, a previsão de fechamento, as notas, as tarefas ligadas a ela e o histórico de movimentos.',
      'O valor ponderado é o valor da oportunidade multiplicado pela probabilidade da etapa.',
    ],
  },
  {
    id: 'clientes',
    title: 'Clientes e produtos',
    intro: 'Quem já comprou e o que você vende.',
    items: [
      'Clientes não são cadastrados à mão: é cliente quem tem ao menos uma oportunidade ganha. A lista mostra o que a pessoa comprou e o total.',
      'Em Produtos você cadastra nome e preço. "Arquivar" tira o produto da lista de ativos; ele continua no filtro "Arquivados" e pode ser restaurado.',
    ],
  },
  {
    id: 'tarefas',
    title: 'Tarefas e Calendário',
    intro: 'O que fazer e quando.',
    items: [
      'Em Tarefas, as abas Hoje, Próximas, Atrasadas e Concluídas mostram cada grupo com a contagem. Digite um título no campo de tarefa rápida e tecle Enter para criar.',
      'Marque o círculo para concluir; marque de novo para reabrir. Cada tarefa tem prazo (com ou sem hora), prioridade, tipo e, se quiser, vínculo com uma Pessoa e uma Oportunidade.',
      'O Calendário mostra o mês com as tarefas de cada dia. O botão Lista mostra as mesmas tarefas agrupadas por dia. Selecione um dia para ver as tarefas dele e criar uma nova.',
    ],
  },
  {
    id: 'crescimento',
    title: 'Metas e Meu progresso',
    intro: 'Como você acompanha o seu mês e a sua evolução. Tudo é calculado dos dados reais que você registra.',
    items: [
      'Em Metas você define alvos do mês: faturamento, oportunidades ganhas, novos leads, tarefas concluídas e novas pessoas. O realizado nunca é digitado: o sistema soma os seus dados do mês e mostra o percentual e se você está no ritmo.',
      'Use as setas ao lado do mês para ver outros meses. "Mais ações" em cada meta edita o alvo ou exclui a meta. Uma meta atingida soma 100 XP (uma vez) e avisa no sino.',
      'Em Meu progresso você vê o nível, o XP e o que falta para o próximo nível. O XP vem de ações reais: tarefa concluída (+10, até 100 por dia), oportunidade ganha (+50, até 200 por dia), lead convertido (+30, até 150 por dia), pessoa nova (+5, até 25 por dia), atividade em lead (+3, até 15 por dia), primeiro acesso do dia (+2) e meta atingida (+100, uma por meta e mês, até 300 por dia).',
      'Reabrir e concluir de novo a mesma tarefa não repete os pontos. Os pontos já ganhos não se perdem ao excluir o registro.',
      'Em Evolução da comunidade você vê o ranking do mês da sua turma: posição, primeiro nome com a inicial do sobrenome, nível e o XP ganho no mês. É opcional e vem desligado: só aparece quem ativa "Aparecer no ranking da turma" em Meu perfil > Preferências, e quem não participa não vê a lista. Nada do seu CRM entra no ranking.',
    ],
  },
  {
    id: 'relatorios',
    title: 'Relatórios',
    intro: 'Os números do seu CRM em um só lugar, calculados no sistema a partir dos seus dados.',
    items: [
      'Escolha o período (30 dias, trimestre ou 12 meses). Cada indicador é comparado com o período anterior equivalente; quando não há base de comparação, a variação não aparece.',
      'A taxa de conversão é ganhas ÷ (ganhas + perdidas) do período. O funil mostra, das oportunidades criadas no período, quantas chegaram a cada etapa.',
      '"Exportar relatório" baixa um arquivo CSV com os números da tela. Ele é gerado no seu navegador, sem enviar nada a terceiros, e abre direto no Excel.',
    ],
  },
  {
    id: 'ia',
    title: 'IA Indiscutível',
    intro: 'A assistente de inteligência artificial treinada com o método da sua mentora.',
    items: [
      'Abra pelo botão "IA Indiscutível" na barra do topo, pelo item do menu lateral ou pelo cartão do Painel. Ela abre em uma nova aba, no site do ChatGPT, e você precisa de uma conta lá para conversar.',
      'O Hub não envia nada do seu CRM para a IA e não acompanha o que você conversa com ela. Evite colar dados de clientes na conversa.',
    ],
  },
  {
    id: 'topo',
    title: 'Busca, notificações e atalhos',
    intro: 'As ferramentas da barra do topo.',
    items: [
      `A busca procura em Pessoas, Leads, Empresas, Oportunidades (pelo nome da pessoa), Tarefas, Produtos e Clientes. Digite ao menos 2 letras. Para ir direto a ela, tecle / ou ${searchShortcutLabel()}.`,
      'O sino reúne avisos: tarefas que passaram do prazo, o resumo do dia (se ligado), senha redefinida pela sua mentora e boas-vindas. O ponto dourado indica que há avisos não lidos.',
      'Você escolhe quais avisos receber em Meu perfil > Notificações. Em "Atalhos do teclado" (menu de ajuda) estão todos os atalhos.',
    ],
  },
  {
    id: 'conta',
    title: 'Meu perfil e Configurações',
    intro: 'Os seus dados e as preferências do sistema.',
    items: [
      'Meu perfil (clique no seu nome no topo): altere nome, telefone e foto, troque a senha, veja e encerre as sessões abertas em outros aparelhos e escolha fuso horário, página inicial e avisos.',
      'Configurações: renomeie as etapas do funil e ajuste a probabilidade de cada uma, e gerencie as origens de lead (renomear, arquivar e criar).',
    ],
  },
  {
    id: 'privacidade',
    title: 'Privacidade',
    intro: 'Quem enxerga o quê.',
    items: [
      'Os dados do seu negócio (Pessoas, Leads, Empresas, Oportunidades, valores, Tarefas e Produtos) são só seus. A sua mentora não os vê, em nenhuma tela nem na busca.',
      'A sua mentora vê apenas dados da conta: nome, e-mail, turma, situação do acesso e quando você entrou pela última vez, além do número de "alunas ativas" que você mesma informa.',
    ],
  },
];

const MENTORA_SECTIONS = [
  {
    id: 'painel',
    title: 'Painel',
    intro: 'Um retrato do acesso das suas alunas.',
    items: [
      'Os seis indicadores são: total de alunas, ativas, convites pendentes, convites expirados, alunas que nunca acessaram e acessos nas últimas 24 horas.',
      'O Painel mostra só números de contas e convites, mais "Alunas ativas das alunas" (a soma do que cada aluna informou) e a média por aluna. Não há dados de negócio das alunas nele.',
    ],
  },
  {
    id: 'alunas',
    title: 'Minhas alunas',
    intro: 'A lista de todas as alunas da mentoria.',
    items: [
      'Busque por nome, e-mail ou telefone, filtre pela situação e ordene por nome, cadastro ou último acesso.',
      'As situações são: Ativa, Convite pendente, Convite expirado, Sem convite enviado, Bloqueada e Inativa. Abra uma aluna para ver os dados, os convites e as ações disponíveis.',
      'A coluna "Alunas ativas" mostra o número que cada aluna informa sobre as alunas dela (cada aluna também é mentora), com a variação em relação ao mês anterior e há quantos dias foi atualizado. "—" quer dizer que ela ainda não informou. Clique no título da coluna (ou use "Ordenar por") para ordenar, e use as faixas (Sem informar, 0, 1 a 5, 6 a 10, 11 ou mais) para filtrar. O número é informado pela própria aluna: o Hub não o calcula do CRM dela.',
    ],
  },
  {
    id: 'convites',
    title: 'Nova aluna e links de acesso',
    intro: 'Como a aluna entra pela primeira vez.',
    items: [
      'Em "Nova aluna" você informa nome e e-mail e, se quiser, telefone, turma, programa, datas e plano. O sistema gera um link de acesso e você o copia.',
      'O sistema não envia e-mail: você envia o link à aluna pelo canal que preferir. O link vale por 7 dias e só pode ser usado uma vez. Ao abri-lo, a aluna define a senha e já entra.',
      'Se o link venceu ou se perdeu, abra a página da aluna e use "Gerar novo link de acesso". O link anterior deixa de valer. "Cancelar convite pendente" invalida o link sem gerar outro.',
    ],
  },
  {
    id: 'senha',
    title: 'Redefinição de senha',
    intro: 'Para a aluna que já ativou a conta e perdeu a senha.',
    items: [
      'Só a mentora (conta principal, não a equipe) vê, na página dela, o botão "Gerar link de redefinição de senha", que cria um link como o do convite. Ao usá-lo, a aluna escolhe uma nova senha e as sessões antigas dela são encerradas.',
      'Por segurança, a aluna vê um aviso no Painel (e uma notificação) dizendo que a senha foi redefinida por um link da mentora.',
    ],
  },
  {
    id: 'acesso',
    title: 'Bloquear e desativar',
    intro: 'Controle do acesso de cada aluna.',
    items: [
      '"Bloquear acesso" impede o login e derruba a sessão aberta. "Desbloquear" devolve o acesso. Bloquear também cancela o convite pendente.',
      '"Desativar conta" encerra o acesso de quem saiu da mentoria. "Reativar conta" desfaz. Nada é apagado.',
    ],
  },
  {
    id: 'privacidade',
    title: 'Privacidade das alunas',
    intro: 'O que você vê e o que não vê.',
    items: [
      'Você vê dados de conta e de mentoria: nome, e-mail, telefone, turma, programa, plano, situação do acesso e último acesso, além do número de alunas ativas que cada aluna informa.',
      'Você não vê dados de negócio das alunas: Pessoas, Leads, Oportunidades, valores em reais, Tarefas ou Produtos. Nem a busca do topo os encontra. Isso protege a aluna e é garantido pelo próprio banco de dados.',
    ],
  },
  {
    id: 'ia',
    title: 'IA Indiscutível',
    intro: 'A sua IA treinada, aberta para você e para as alunas.',
    items: [
      'O botão "IA Indiscutível" (barra do topo e menu lateral) abre a IA em uma nova aba, no site do ChatGPT. As alunas têm o mesmo atalho no Painel delas. A equipe não vê o atalho.',
      'O Hub não envia dados das alunas para a IA e não acompanha as conversas.',
    ],
  },
  {
    id: 'topo',
    title: 'Busca, notificações e atalhos',
    intro: 'As ferramentas da barra do topo.',
    items: [
      `A busca procura alunas por nome, e-mail ou turma. Digite ao menos 2 letras. Para ir direto a ela, tecle / ou ${searchShortcutLabel()}.`,
      'O sino avisa quando uma aluna ativa a conta e quando um convite vence sem uso. O ponto dourado indica avisos não lidos.',
      'Em "Atalhos do teclado" (menu de ajuda) estão todos os atalhos.',
    ],
  },
  {
    id: 'conta',
    title: 'Configurações e perfil',
    intro: 'A mentoria e a sua conta.',
    items: [
      'Configurações: o nome da mentoria e a mensagem de boas-vindas (as alunas veem os dois) e os padrões que preenchem o diálogo "Nova aluna" (turma, programa e plano). As alunas não veem os padrões.',
      'Meu perfil (clique no seu nome no topo): nome, telefone, foto, senha, sessões abertas e preferências.',
    ],
  },
];

function sectionHtml(section) {
  return html`<section class="card help-section" id="help-${section.id}" aria-labelledby="help-${section.id}-title">
    <h2 id="help-${section.id}-title" tabindex="-1">${section.title}</h2>
    <p class="help-intro">${section.intro}</p>
    <ul class="help-list">${section.items.map((text) => html`<li>${text}</li>`)}</ul>
  </section>`;
}

export function renderHelp({ root, session, navigate }) {
  const isMentora = session.state.user?.role === 'admin' || session.state.user?.role === 'staff';
  const sections = isMentora ? MENTORA_SECTIONS : STUDENT_SECTIONS;
  const content = html`<div class="help-layout">
    <nav class="help-toc card" aria-label="Nesta página"><p class="help-toc-title">Nesta página</p>
      <ul>${sections.map((s) => html`<li><a href="#/ajuda" data-target="help-${s.id}">${s.title}</a></li>`)}</ul>
      <button type="button" class="btn btn-ghost btn-sm" id="help-shortcuts">Atalhos do teclado</button>
    </nav>
    <div class="help-sections">${sections.map(sectionHtml)}
      <p class="help-version">Indiscutível Hub · versão ${APP_VERSION}</p></div>
  </div>`;
  const cleanupShell = renderShell({
    root,
    session,
    navigate,
    active: null,
    heading: 'Central de ajuda',
    eyebrow: 'Ajuda',
    subtitle: isMentora ? 'Como usar o Indiscutível Hub para acompanhar as suas alunas.' : 'Como usar cada tela do Indiscutível Hub.',
    content,
  });

  root.querySelector('.help-toc').addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('[data-target]');
    if (link) {
      // O endereço (#/ajuda) não muda: o link só rola até a seção e leva o foco ao título dela.
      event.preventDefault();
      const section = root.querySelector(`#${link.dataset.target}`);
      const heading = section?.querySelector('h2');
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      heading?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest('#help-shortcuts')) openShortcutsDialog(event.target.closest('#help-shortcuts'));
  });
  return cleanupShell;
}
