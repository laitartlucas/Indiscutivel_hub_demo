// Os 15 funis padrão da Central Comercial, espelho da função crm_seed_default_funnels (db/migrations/0026_central_comercial.sql).
// Módulo puro (sem estado): usado pelo exemplo (seed.js) e pela API falsa (mock-commercial.js). Um teste de paridade
// (web/test/demo-funnels.test.js) confere chave, nome, etapas, probabilidades e os nomes de "ganha"/"perdida" contra o SQL.

/** [{ key, name, stages: [[nome, probabilidade], ...], won?, lost? }] na ordem (posição) do SQL. */
export const DEFAULT_FUNNELS = [
  { key: 'conteudo', name: 'Conteúdo', stages: [['Interagiu', 10], ['Conversa iniciada', 20], ['Qualificada', 35], ['Convite enviado', 50], ['Proposta', 65]] },
  { key: 'isca', name: 'Isca', stages: [['Captada', 10], ['Consumiu o material', 20], ['Contato feito', 30], ['Qualificada', 45], ['Oferta', 65]] },
  { key: 'aplicacao', name: 'Aplicação', stages: [['Aplicação recebida', 10], ['Em análise', 25], ['Call agendada', 45], ['Call realizada', 60], ['Proposta', 75]] },
  { key: 'grupo_vip', name: 'Grupo VIP', stages: [['Entrou no grupo', 10], ['Engajada', 25], ['Carrinho aberto', 45], ['Em negociação', 70]] },
  { key: 'mesa', name: 'Mesa', stages: [['Convidada', 10], ['Confirmada', 25], ['Participou', 45], ['Conversa individual', 60], ['Proposta', 75]] },
  { key: 'evento', name: 'Evento', stages: [['Inscrita', 10], ['Confirmada', 20], ['Presente', 35], ['Abordada', 55], ['Proposta', 70]] },
  { key: 'indicacao', name: 'Indicação', stages: [['Indicação recebida', 20], ['Primeiro contato', 35], ['Conversa', 55], ['Proposta', 75]] },
  { key: 'network', name: 'Network', stages: [['Conexão feita', 10], ['Relacionamento', 25], ['Oportunidade identificada', 45], ['Proposta', 70]] },
  { key: 'desafio', name: 'Desafio', stages: [['Inscrita', 10], ['Participando', 20], ['Concluiu', 40], ['Oferta', 55], ['Negociação', 70]] },
  { key: 'imersao', name: 'Imersão', stages: [['Interessada', 10], ['Ingresso garantido', 30], ['Participou', 45], ['Conversa de ascensão', 60], ['Proposta', 75]] },
  { key: 'workshop', name: 'Workshop', stages: [['Inscrita', 10], ['Participou', 30], ['Oferta', 50], ['Negociação', 70]] },
  { key: 'mentorada_dia', name: 'Mentorada por um dia', stages: [['Interessada', 10], ['Sessão agendada', 30], ['Sessão realizada', 55], ['Proposta de continuidade', 75]] },
  { key: 'low_ticket', name: 'Low Ticket', stages: [['Comprou', 15], ['Em consumo', 30], ['Contato de upsell', 50], ['Proposta', 70]] },
  { key: 'renovacao', name: 'Renovação', won: 'Renovou', lost: 'Não renovou', stages: [['Vence em breve', 30], ['Conversa de renovação', 55], ['Proposta', 75]] },
  { key: 'ascensao', name: 'Ascensão', stages: [['Elegível', 20], ['Conversa', 45], ['Proposta', 70]] },
];

export const WON_NAME = 'Ganha';
export const LOST_NAME = 'Perdida';

/**
 * Linhas de funis e etapas de uma dona, como a função SQL cria (abertas 1..n, depois "ganha" 100% e "perdida" 0%).
 * `skipKeys`: chaves que a dona já tem (idempotente). `ids.funnel(fpos)` e `ids.stage(fpos, spos)` dão os ids.
 */
export function defaultFunnelRows(ownerId, at, ids, skipKeys = new Set()) {
  const funnels = [];
  const stages = [];
  DEFAULT_FUNNELS.forEach((f, i) => {
    const fpos = i + 1;
    if (skipKeys.has(f.key)) return;
    const funnelId = ids.funnel(fpos);
    funnels.push({ id: funnelId, ownerId, key: f.key, name: f.name, position: fpos, active: true, version: 1, createdAt: at, updatedAt: at });
    const all = [...f.stages.map(([name, probability]) => [name, probability, 'open']), [f.won ?? WON_NAME, 100, 'won'], [f.lost ?? LOST_NAME, 0, 'lost']];
    all.forEach(([name, probability, kind], k) => {
      stages.push({ id: ids.stage(fpos, k + 1), ownerId, funnelId, name, position: k + 1, probability, kind });
    });
  });
  return { funnels, stages };
}
