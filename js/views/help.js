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
      'O cartão verde "Seu próximo movimento" resume quantas oportunidades estão em negociação, destaca as que esperam contato e leva ao Pipeline.',
      '"Vendas ganhas" soma as oportunidades ganhas e leva aos seus clientes. "Funis em andamento" mostra, no mês, os funis com negociações abertas e vendas ganhas.',
      '"Foco de hoje" mostra quantas tarefas do dia já foram concluídas. "Contatos recentes" e "Produtos recentes" são atalhos para os últimos cadastros.',
      '"Minhas alunas ativas" é o número que você mesma informa: quantas alunas ativas você tem hoje. Toque em "Atualizar" quando mudar; o Painel mostra a data da última atualização, a variação em relação ao mês anterior e os últimos 6 meses. Sua mentora vê só esse número, nunca os seus clientes nem valores.',
      '"Tire dúvidas com a IA da sua mentora" abre a IA Indiscutível em uma nova aba.',
      'Se a sua mentora redefiniu a sua senha por um link, o Painel avisa por até 30 dias. Toque em "Entendi" para dispensar o aviso neste aparelho.',
      'No fim do Painel, "Meu negócio" mostra o mês, o trimestre ou o ano em três grupos, cada um com os números do próprio módulo e um link para ele: Comercial (leads, oportunidades abertas e o valor em negociação, conversão e vendas fechadas), Financeiro (contratado, recebido, a receber, vencido e contratos em aberto) e Marketing (investimento, CPL, CAC, ROAS, campanhas ativas, as 3 origens com mais leads e os 3 funis com mais receita). Os grupos nunca se somam: vender não é receber, e o seu faturamento declarado fica à parte.',
    ],
  },
  {
    id: 'comercial',
    title: 'Central Comercial',
    intro: 'Tudo o que é venda fica no item "Comercial" do menu, com as abas Visão geral, Contatos, Pipeline, Vendas, A receber, Atividades e Produtos.',
    items: [
      'A Visão geral mostra, no mês, no trimestre ou no ano: novos contatos, o que está em negociação (com o valor ponderado), as vendas ganhas e perdidas, a taxa de conversão e o tempo médio até fechar. Logo abaixo vêm o bloco Financeiro (contratado e recebido no período, o que há a receber e o que está vencido hoje, com as parcelas vencidas e as próximas a vencer), os contatos por situação e os números de cada funil.',
      'Atividades reúne as notas, ligações, e-mails, reuniões e conversas de WhatsApp registradas em todos os contatos, da mais recente para a mais antiga.',
      'Em Produtos você cadastra nome e preço. "Arquivar" tira o produto da lista de ativos; ele continua no filtro "Arquivados" e pode ser restaurado.',
    ],
  },
  {
    id: 'vendas',
    title: 'Vendas e A receber',
    intro: 'Fechar não é receber: a venda registra o combinado com a cliente; o dinheiro só conta como recebido quando você lança um pagamento.',
    items: [
      'Ao marcar uma oportunidade como ganha (no Pipeline ou na página dela), abre "Registrar venda". A oportunidade só fica ganha quando você registra a venda ou toca em "Registrar depois"; nesse caso, a venda pode ser registrada mais tarde na aba Compras do contato ou na página da oportunidade.',
      'Na venda você informa a descrição, o valor, o desconto (opcional), a data e a forma de pagamento. Em "Pagamento único" a venda tem uma parcela na data da venda; marque "Já recebi este valor" se o dinheiro já entrou. Em "Parcelado" você escolhe a entrada (opcional), o número de parcelas (de 1 a 60, uma por mês) e o vencimento da primeira. A prévia mostra cada parcela antes de salvar; se a divisão não for exata, os centavos que sobram vão para a última.',
      '"Nova venda" registra uma venda avulsa, na aba Vendas ou na página do contato.',
      'A aba Vendas lista as vendas com o valor, o recebido, o saldo e a situação: A receber, Recebida em parte, Em atraso, Quitada ou Cancelada. Filtre pela situação e pela data da venda e busque pelo cliente ou pela descrição. No topo, o contratado e o recebido do período e o que há a receber e vencido hoje.',
      'Na página da venda: o resumo (contratado, recebido, saldo e vencido), as parcelas com a situação de cada uma (Em aberto, Paga em parte, Paga, Vencida ou Cancelada), os pagamentos e estornos e o histórico. Uma parcela fica vencida a partir do dia seguinte ao vencimento.',
      '"Registrar pagamento" lança o que entrou em uma parcela. Pode ser só uma parte dela, mas nunca mais do que falta. Se a internet falhar e você tentar de novo, o mesmo pagamento não é lançado duas vezes.',
      '"Estornar" devolve um pagamento (todo ou parte) com o motivo: ele sai do recebido e a parcela volta a ficar em aberto.',
      '"Renegociar" reparcela o saldo: as parcelas pagas ficam como estão, uma parcela paga em parte fica com o valor pago e o restante entra nas novas parcelas. Você pode dar um abatimento, que aumenta o desconto da venda.',
      '"Cancelar venda" pede o motivo. As parcelas em aberto deixam de ser cobradas; o que já foi recebido continua recebido até você estornar.',
      'A aba A receber mostra as parcelas vencidas, as que vencem nos próximos 30 dias ou todas em aberto, com o total vencido e o total em aberto. Registre o pagamento direto na lista.',
    ],
  },
  {
    id: 'contatos',
    title: 'Contatos',
    intro: 'Um cadastro único para cada pessoa, que acompanha o contato de lead a cliente sem duplicar.',
    items: [
      'A situação do contato é calculada sozinha: Cliente (tem ao menos uma oportunidade ganha ou uma venda ativa), Em negociação (tem uma aberta), Perdido (todas as oportunidades foram perdidas) ou Lead (ainda sem oportunidade). Use os botões do topo da lista para filtrar por situação.',
      'Em "Mais filtros" você filtra por origem, funil de entrada, temperatura, etiqueta e responsável. A lista alterna entre tabela e cartões.',
      'Na página do contato, a aba Dados guarda telefone, WhatsApp, e-mail, Instagram, origem, funil de entrada, campanha, temperatura, etiquetas, responsável e observações. Enquanto não há oportunidade, você também marca a situação do lead (Novo, Contatado, Qualificado ou Descartado).',
      'A aba Oportunidades lista as negociações do contato e abre uma nova, escolhendo o funil, a etapa inicial, o produto e o valor. Um mesmo cliente pode comprar várias vezes: cada compra é uma oportunidade.',
      'A Linha do tempo junta as atividades que você registra e, sozinhas, as oportunidades abertas e as mudanças de etapa. Você pode excluir uma atividade registrada por engano.',
      'A aba Compras mostra as vendas do contato com o contratado, o recebido e o saldo, e as oportunidades ganhas que ainda esperam a venda.',
      'Excluir um contato apaga também as oportunidades e a linha do tempo dele. Um contato com venda registrada não pode ser excluído. Perder uma oportunidade nunca apaga o contato.',
    ],
  },
  {
    id: 'pipeline',
    title: 'Pipeline e funis',
    intro: 'O quadro das negociações, um funil por vez, com uma coluna por etapa.',
    items: [
      'Escolha o funil no topo do quadro; o último aberto fica guardado neste aparelho. Cada funil tem as próprias etapas em andamento, mais Ganha e Perdida no fim.',
      'Mova um cartão arrastando-o para outra coluna ou, pelo teclado, pelo menu "Mais ações" > "Mover para…". Para perder uma oportunidade é preciso escolher o motivo. Para ganhar, abre "Registrar venda" (veja Vendas e A receber).',
      'A faixa de números mostra o funil escolhido: em negociação, valor ponderado (valor × probabilidade da etapa), ganho, perdido, conversão e tempo médio até fechar.',
      '"Nova oportunidade" abre a negociação para um contato já cadastrado ou cria o contato na hora. A primeira oportunidade de um contato é a conversão dele.',
      'Em Configurações > CRM você ativa ou desativa funis, muda o nome deles e edita as etapas: nome, probabilidade, ordem, inclusão e remoção. Uma etapa que ainda tem oportunidades não pode ser removida.',
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    intro: 'O item "Marketing" do menu mostra quanto você investe para divulgar, quantos leads chegam e quanto volta em vendas. Tem as abas Visão geral, Campanhas, Investimentos e Instagram.',
    items: [
      'A Visão geral mostra, no mês, no trimestre ou no ano: investimento, leads, CPL, oportunidades, vendas, receita atribuída, clientes novos, CAC, conversão, ROAS e ROI. Passe o mouse sobre um número (ou abra "Como calculamos") para ver a fórmula de cada um. Logo abaixo vêm os leads por origem, o gráfico de investimento x receita, os números por campanha (com a linha "Sem campanha"), por funil e o último período do Instagram.',
      'Fórmulas: CPL = investimento ÷ leads; CAC = investimento ÷ clientes novos; conversão = clientes novos ÷ leads × 100; ROAS = receita atribuída ÷ investimento; ROI = (receita atribuída − investimento) ÷ investimento × 100. Sem base (por exemplo, sem investimento), o indicador aparece como "—".',
      'Em Campanhas você cria uma campanha para cada ação de divulgação (nome, canal, objetivo, início e fim). A situação vem das datas: Planejada, Ativa ou Encerrada. Arquivar tira a campanha das listas de escolha sem apagar os números; dá para desarquivar. A página da campanha mostra os números do período, os últimos 6 meses e os investimentos dela.',
      'Para um contato contar como lead de uma campanha, escolha a campanha no cadastro dele. Na oportunidade, a campanha em branco usa a do contato. Cada venda conta para uma campanha só: a da oportunidade; venda sem oportunidade usa a do contato.',
      'Em Investimentos você lança o que pagou (anúncio, evento, material), com ou sem campanha. Campanha arquivada não recebe investimento novo.',
      'Em Instagram você lança os números do perfil por período (seguidores, novos seguidores, alcance, impressões, interações, visitas, cliques e leads). É lançamento manual: nenhuma conta do Instagram é conectada e nada é enviado a ele. O engajamento é interações ÷ alcance × 100, e o último período é comparado com o anterior.',
    ],
  },
  {
    id: 'tarefas',
    title: 'Tarefas e Calendário',
    intro: 'O que fazer e quando.',
    items: [
      'Em Tarefas, as abas Hoje, Próximas, Atrasadas e Concluídas mostram cada grupo com a contagem. Digite um título no campo de tarefa rápida e tecle Enter para criar.',
      'Marque o círculo para concluir; marque de novo para reabrir. Cada tarefa tem prazo (com ou sem hora), prioridade, tipo e, se quiser, vínculo com um contato e uma oportunidade.',
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
      'Em Meu progresso você vê o nível, o XP e o que falta para o próximo nível. O XP vem de ações reais: tarefa concluída (+10, até 100 por dia), oportunidade ganha (+50, até 200 por dia), primeira oportunidade de um contato (+30, até 150 por dia), contato novo (+5, até 25 por dia), atividade registrada num contato (+3, até 15 por dia), primeiro acesso do dia (+2) e meta atingida (+100, uma por meta e mês, até 300 por dia).',
      'Reabrir e concluir de novo a mesma tarefa não repete os pontos. Os pontos já ganhos não se perdem ao excluir o registro.',
      'Em Evolução da comunidade você vê o ranking do mês da sua turma: posição, primeiro nome com a inicial do sobrenome, nível e o XP ganho no mês. É opcional e vem desligado: só aparece quem ativa "Aparecer no ranking da turma" em Meu perfil > Preferências, e quem não participa não vê a lista. Nada do seu CRM entra no ranking.',
    ],
  },
  {
    id: 'jornada',
    title: 'Minha jornada e Check-ins',
    intro: 'A sua fase na mentoria e o registro diário dos desafios.',
    items: [
      'Em Meu progresso, o cartão "Minha jornada" mostra as 4 fases da mentoria (Método Validado, Autoridade, Escala e Gestão), com a sua fase atual em destaque, e a linha do tempo com as datas e as observações da sua mentora. A fase é registrada por ela: nada muda sozinho. O Painel mostra a fase atual no cartão "Minha evolução".',
      'Na página de um desafio em que você está inscrita, a seção Check-ins guarda um registro por dia: o que você fez (texto), até 5 links (começando com https://) e "Cumpri o dia". O dia de hoje vem selecionado; troque o dia na lista para registrar um dia anterior do desafio.',
      'Em "Fotos e comprovantes" você anexa até 5 arquivos por dia. Fotos são reduzidas no seu aparelho antes do envio; comprovantes podem ser imagem ou PDF de até 3 MB. O medidor mostra quanto do seu espaço (50 MB) já foi usado; remova arquivos que não precisa mais para liberar espaço.',
      'O histórico mostra cada dia registrado com o retorno da sua mentora, quando ela responder (você também recebe um aviso no sino). Só você e a sua mentora veem os seus check-ins e arquivos.',
      'Você pode editar e anexar até 7 dias depois do fim do desafio. Depois disso, os check-ins ficam só para leitura.',
    ],
  },
  {
    id: 'faturamento',
    title: 'Meu faturamento e marcos',
    intro: 'O faturamento que você mesma informa, mês a mês. Ele é separado das vendas registradas no Comercial (selo "Autodeclarado").',
    items: [
      'Em Meu faturamento, toque em "Lançar faturamento", escolha o mês (da sua entrada na mentoria até o mês atual), informe o valor e, se quiser, uma observação. Cada mês tem um lançamento só: escolher um mês já lançado substitui o valor.',
      'O acumulado soma os meses desde a sua entrada na mentoria. Se a data de entrada mudar, lançamentos de antes dela ficam guardados com a marca "Fora do período", mas não contam.',
      'Os marcos são 10k, 30k, 50k e 100k Mentorias; o de R$ 100 mil também dá o status PAD GOLD. Você recebe um aviso quando alcança cada um, e a sua mentora também.',
      'Errou um valor? Use "Editar" ou "Excluir" no mês. Toda alteração fica no histórico. Se a correção deixar o acumulado abaixo de um marco já alcançado, ele fica "Em revisão" (com a data original guardada) e volta a valer sozinho quando o acumulado passar de novo, sem novo aviso.',
      'Em Conquistas, o bloco "Marcos de faturamento" mostra a mesma trilha.',
    ],
  },
  {
    id: 'relatorios',
    title: 'Relatórios',
    intro: 'Os números do seu negócio em um só lugar, calculados no sistema a partir dos seus dados, em quatro abas.',
    items: [
      'Resumo: escolha o período (30 dias, trimestre ou 12 meses). Cada indicador é comparado com o período anterior equivalente; quando não há base de comparação, a variação não aparece. A taxa de conversão é ganhas ÷ (ganhas + perdidas) do período. O funil mostra, das oportunidades criadas no período, quantas chegaram a cada etapa.',
      '"Exportar relatório" (no Resumo) baixa um arquivo CSV com os números da tela. Ele é gerado no seu navegador, sem enviar nada a terceiros, e abre direto no Excel.',
      'Comercial e funis, Vendas e recebimentos e Marketing e campanhas usam os mesmos números de cada módulo. Escolha este mês, este trimestre, este ano ou um mês específico: o filtro vale para as três abas.',
      'Comercial e funis: contatos novos por origem, oportunidades por funil (abertas, ganhas, perdidas, valor e conversão) e o tempo médio até fechar. Vendas e recebimentos: contratado e recebido, o gráfico mês a mês (6 ou 12 meses), as vendas do período e as contas a receber (vencidas e a vencer em 30 dias). Marketing e campanhas: os indicadores, cada campanha (com a linha "Sem campanha") e os últimos períodos do Instagram.',
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
      `A busca procura em Contatos, Oportunidades (pelo nome do contato), Tarefas e Produtos. Digite ao menos 2 letras. Para ir direto a ela, tecle / ou ${searchShortcutLabel()}.`,
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
      'Configurações: ative, desative e renomeie os funis, edite as etapas de cada um (nome, probabilidade e ordem) e gerencie as origens de lead (renomear, arquivar e criar).',
    ],
  },
  {
    id: 'privacidade',
    title: 'Privacidade',
    intro: 'Quem enxerga o quê.',
    items: [
      'Os dados do seu negócio (contatos, oportunidades, vendas, pagamentos, campanhas, investimentos, números do Instagram, atividades, Tarefas e Produtos) são só seus. A sua mentora não vê nomes, telefones nem conversas dos seus clientes, em nenhuma tela nem na busca.',
      'A sua mentora (e a equipe dela, se tiver a permissão) pode ver só números agregados da sua Central Comercial: quantos contatos novos, quantas oportunidades em negociação, ganhas e perdidas, os valores somados e a conversão por funil. Do Financeiro, ela vê só os totais: contratado, recebido, a receber, vencido e o número de vendas, nunca os clientes nem as descrições das vendas. Do Marketing, só os números (investimento, leads, CPL, clientes novos, CAC, receita, ROAS, ROI e quantas campanhas estão ativas), nunca os nomes das campanhas.',
      'Esses números agregados aparecem, em R$ inclusive, na página de cada aluna e também somados com os das outras alunas no Painel e nos Relatórios da mentora (por exemplo, "as 5 alunas com mais vendas no período"). Nunca com nomes de clientes, nomes de campanhas ou descrições de vendas.',
      'A sua mentora também vê o faturamento que você declara em Meu faturamento (valores do mês, acumulado e marcos, inclusive PAD GOLD). É outra medida: não se mistura com as vendas do Comercial.',
      'Da sua conta, ela vê nome, e-mail, turma, situação do acesso, quando você entrou pela última vez, a sua fase na jornada, os seus desafios e check-ins e o número de "alunas ativas" que você mesma informa.',
    ],
  },
];

const MENTORA_SECTIONS = [
  {
    id: 'painel',
    title: 'Painel',
    intro: 'Um retrato das suas alunas em três seções. Cada seção só aparece para quem tem a permissão dela.',
    items: [
      'Alunas (permissão "Ver alunas"): total de alunas, ativas, convites pendentes, convites expirados, alunas que nunca acessaram, acessos nas últimas 24 horas e "Alunas ativas das alunas" (a soma do que cada aluna informou). "Jornada no período" mostra as alunas por fase, os desafios concluídos, os check-ins aguardando o seu retorno e as conquistas recentes (com o nome da aluna e a data).',
      'Faturamento das alunas (permissão "Faturamento das alunas"): o acumulado declarado, as alunas PAD GOLD e os marcos em revisão. São valores informados pelas próprias alunas.',
      'Negócio das alunas (permissão "Indicadores de negócio das alunas"): no mês, no trimestre ou no ano, os totais somando as suas alunas, cada natureza no seu grupo (Comercial, Financeiro e Marketing, que nunca se somam entre si), e as 5 alunas com mais vendas ganhas. Só números: nunca nomes de clientes, de campanhas ou descrições de vendas.',
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
    id: 'jornada',
    title: 'Jornada e Check-ins',
    intro: 'A fase de cada aluna na mentoria e o que elas registram por dia nos desafios.',
    items: [
      'No perfil da aluna, o bloco Jornada mostra a fase atual (Método Validado, Autoridade, Escala ou Gestão) e o histórico. "Alterar fase" registra a nova fase com uma observação opcional: a aluna vê a fase, a data e a observação, e recebe um aviso. A fase nunca muda sozinha; voltar de fase também fica no histórico. Precisa da permissão de gerenciar alunas.',
      'Em Minhas alunas, a coluna Fase mostra a fase de cada uma, e o filtro "Fase" lista só as alunas de uma fase.',
      'O item Check-ins do menu reúne os registros diários das alunas nos desafios. Filtre por desafio, por aluna e pela situação (Aguardando retorno ou Com retorno). Cada check-in mostra o texto, os links (abrem em nova aba), as fotos (toque para ver maior) e os comprovantes (para baixar).',
      '"Dar retorno" envia a sua resposta para a aluna, que recebe um aviso. Um novo retorno substitui o anterior. Precisa da permissão de gerenciar desafios.',
      'Em Desafios, "Participantes e check-ins" abre a lista de alunas do desafio: quem concluiu, quem está em dia (check-in nos últimos 3 dias), quem está atrasada e quem não começou, com o último check-in e os retornos pendentes.',
    ],
  },
  {
    id: 'faturamento-alunas',
    title: 'Faturamento das alunas',
    intro: 'O faturamento que cada aluna declara, separado das vendas do Comercial. Precisa da permissão "Faturamento das alunas".',
    items: [
      'O item Faturamento das alunas mostra o resumo (alunas, total do mês, acumulado, PAD GOLD, marcos em revisão e marcos alcançados no mês) e a lista com o valor do mês, o acumulado desde a entrada, os marcos de cada uma, a próxima conquista e o último lançamento. Filtre por mês, nome, fase ou conquista.',
      'Os marcos são 10k, 30k, 50k e 100k Mentorias; o de R$ 100 mil dá o status PAD GOLD. Você recebe um aviso quando uma aluna alcança um marco e quando um marco entra em revisão.',
      '"Em revisão" quer dizer que a aluna corrigiu um lançamento e o acumulado ficou abaixo de um marco já alcançado. A data original fica guardada e o marco volta a valer sozinho quando o acumulado passar de novo.',
      'No perfil da aluna, o cartão Faturamento mostra o acumulado, o mês de entrada, a trilha dos marcos, a evolução mês a mês e os últimos lançamentos. O Painel destaca as alunas PAD GOLD e os marcos em revisão.',
    ],
  },
  {
    id: 'relatorios',
    title: 'Relatórios da mentoria',
    intro: 'Análises das suas alunas em abas. Precisa da permissão "Relatórios"; as abas de faturamento e de negócio pedem também a permissão delas.',
    items: [
      'Engajamento: alunas ativas, engajamento, conclusão dos desafios, metas atingidas, uso por módulo, níveis e quem mais evoluiu. Só contagens, sem nenhum R$. "Exportar relatório" baixa o CSV desta aba.',
      'Alunas e fases, Desafios e Conquistas: filtre por período, turma e fase. Veja a distribuição por fase, as mudanças de fase (aluna, de qual para qual fase e quando), quem está na mesma fase há mais de 90 dias, a adesão a cada desafio (destinadas, inscritas, concluíram, check-ins e aguardando retorno) e os desbloqueios por conquista. Os marcos de faturamento só aparecem com a permissão "Faturamento das alunas".',
      'Faturamento das alunas: o acumulado por aluna, a soma declarada mês a mês (últimos 6 meses) e as alunas PAD GOLD. Valores autodeclarados.',
      'Negócio das alunas: os totais do período por natureza e uma linha por aluna, só com números agregados (em R$ inclusive), nunca nomes de clientes nem de campanhas.',
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
      'Você não vê os clientes das alunas: nomes, telefones, conversas, oportunidades uma a uma, Tarefas ou Produtos. Nem a busca do topo os encontra. Isso protege a aluna e é garantido pelo próprio banco de dados.',
      'Na página de cada aluna, o cartão "Comercial" mostra só números agregados (contatos novos, oportunidades em negociação, ganhas e perdidas, valores somados e conversão por funil). O cartão "Financeiro" mostra só totais das vendas da aluna (contratado e recebido no período, a receber e vencido hoje, número de vendas e de vendas quitadas), sem clientes nem descrições. O cartão "Marketing" mostra investimento, leads, CPL, clientes novos, CAC, receita atribuída, ROAS, ROI e campanhas ativas, sem os nomes das campanhas. A equipe só vê esses cartões com a permissão "Indicadores de negócio das alunas".',
      'Os mesmos números aparecem somados no Painel (seção Negócio das alunas) e na aba "Negócio das alunas" dos Relatórios, com uma linha por aluna. O faturamento declarado (seção e aba "Faturamento das alunas") é outra medida e nunca se soma às vendas.',
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
