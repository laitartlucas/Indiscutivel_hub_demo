// Marketing do exemplo (Entrega 4): campanhas da aluna demo (Camila) em vários canais (uma arquivada, uma planejada), investimentos
// mensais dos últimos 6 meses, contatos e oportunidades atribuídos às campanhas (pela origem do contato; a oportunidade herda) e 6
// lançamentos mensais do Instagram em crescimento; números pequenos para outras alunas. Datas RELATIVAS a hoje (Brasília).
// Não cria contatos nem oportunidades: só marca a campanha nos que já existem (os números das Entregas 2 e 3 não mudam).
import { todayInBrasilia } from './finance-data.js';
import { lastMonths, monthEnd } from './marketing-data.js';

const DAY = 86_400_000;
const id = (kind, n) => `${kind}-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Muda `people` e `deals` (campanha atribuída) e devolve `{ campaigns, marketingSpend, instagramMetrics }`. */
export function buildMarketingSeed({ now, uid, people, deals, did }) {
  const t = now.getTime();
  const ago = (days) => new Date(t - days * DAY).toISOString();
  const day = (daysAgo) => todayInBrasilia(new Date(t - daysAgo * DAY));
  const today = day(0);
  const months = lastMonths(today); // 6 meses, do mais antigo ao atual

  const campaigns = [];
  const marketingSpend = [];
  const instagramMetrics = [];
  const seq = { c: 0, s: 0, i: 0 };

  /** [aluna, nome, canal, objetivo|null, começouHáDias, terminouHáDias|null, arquivadaHáDias|null, R$ por mês|null, [origens dos contatos atribuídos]] */
  const CAMPAIGNS = [
    [2, 'Anúncios Meta · Mentoria Individual', 'meta_ads', 'Gerar aplicações para a mentoria individual.', 175, null, null, '800.00', ['meta_ads']],
    [2, 'Conteúdo e impulsionamento no Instagram', 'instagram', 'Atrair seguidoras qualificadas com conteúdo de posicionamento.', 180, null, null, '250.00', ['organic']],
    [2, 'Google Ads · Diagnóstico de Negócio', 'google_ads', 'Vender o diagnóstico para quem busca por consultoria.', 150, 25, null, '450.00', ['google_ads']],
    [2, 'Evento presencial de setembro', 'event', null, 80, 60, 40, null, ['event']],
    [2, 'Webinar de lançamento de janeiro', 'youtube', 'Abrir a turma de janeiro da mentoria em grupo.', -45, -46, null, null, []],
    [3, 'Anúncios de aplicação', 'meta_ads', null, 90, null, null, '600.00', ['meta_ads']],
    [4, 'Lives no Instagram', 'instagram', null, 60, null, null, '200.00', ['organic']],
    [7, 'Grupo VIP no WhatsApp', 'whatsapp', null, 40, null, null, '150.00', ['organic']],
  ];

  for (const [n, name, channel, objective, startAgo, endAgo, archivedAgo, monthly, sources] of CAMPAIGNS) {
    const c = {
      id: id('b9000000', ++seq.c), ownerId: uid(n), name, channel, objective, startsOn: day(startAgo), endsOn: endAgo == null ? null : day(endAgo), notes: null,
      archivedAt: archivedAgo == null ? null : ago(archivedAgo), version: archivedAgo == null ? 1 : 2, createdAt: ago(Math.max(startAgo, 0) + 3), updatedAt: ago(archivedAgo ?? Math.max(startAgo, 0) + 3),
    };
    campaigns.push(c);
    // Um investimento por mês (dia 5, ou hoje se o dia 5 ainda não chegou) enquanto a campanha esteve no ar.
    if (monthly) {
      for (const month of months) {
        const spentOn = `${month}-05` > today ? today : `${month}-05`;
        if (spentOn < c.startsOn || (c.endsOn && spentOn > c.endsOn)) continue;
        marketingSpend.push({
          id: id('ba000000', ++seq.s), ownerId: c.ownerId, campaignId: c.id, spentOn, amount: monthly, channel, description: `Verba de ${month.slice(5, 7)}/${month.slice(0, 4)}`,
          version: 1, createdAt: `${spentOn}T15:00:00.000Z`, updatedAt: `${spentOn}T15:00:00.000Z`,
        });
      }
    }
    for (const p of people) if (p.ownerId === c.ownerId && sources.includes(p.source)) p.campaignId = c.id;
  }
  const byName = (name) => campaigns.find((c) => c.name === name);
  // Evento: um investimento só (locação e coffee break), dentro das datas da campanha.
  marketingSpend.push({
    id: id('ba000000', ++seq.s), ownerId: uid(2), campaignId: byName('Evento presencial de setembro').id, spentOn: day(70), amount: '2200.00', channel: 'event',
    description: 'Locação do espaço e coffee break', version: 1, createdAt: ago(70), updatedAt: ago(70),
  });
  // Sem campanha: a ferramenta de agendamento de posts, todo mês.
  for (const month of months) {
    const spentOn = `${month}-10` > today ? today : `${month}-10`;
    marketingSpend.push({
      id: id('ba000000', ++seq.s), ownerId: uid(2), campaignId: null, spentOn, amount: '79.00', channel: 'other', description: 'Ferramenta de agendamento de posts',
      version: 1, createdAt: `${spentOn}T15:00:00.000Z`, updatedAt: `${spentOn}T15:00:00.000Z`,
    });
  }

  // Oportunidades herdam a campanha do contato; duas exceções mostram a atribuição pela oportunidade (remarketing do anúncio).
  for (const x of deals) x.campaignId = people.find((p) => p.id === x.personId)?.campaignId ?? null;
  const meta = byName('Anúncios Meta · Mentoria Individual').id;
  for (const n of [3, 4]) deals.find((x) => x.id === did(n)).campaignId = meta; // Eduarda (grupo) e Giovana (consultoria)
  deals.find((x) => x.id === did(3001)).campaignId = byName('Anúncios de aplicação').id; // Paula (outra aluna)
  for (const p of people) p.campaignId ??= null;

  // Instagram da Camila: os 6 meses COMPLETOS anteriores ao atual, em crescimento.
  const IG = [
    [4180, 120, 18200, 41000, 820, 610, 95, 6],
    [4420, 240, 21500, 47800, 1010, 700, 120, 8],
    [4710, 290, 24800, 55100, 1230, 810, 150, 9],
    [5050, 340, 27600, 61900, 1460, 930, 180, 12],
    [5490, 440, 31900, 70300, 1790, 1100, 230, 15],
    [5980, 490, 36400, 79800, 2150, 1290, 270, 19],
  ];
  lastMonths(today, 7).slice(0, 6).forEach((month, i) => {
    const [followers, newFollowers, reach, impressions, interactions, profileVisits, linkClicks, leads] = IG[i];
    const from = `${month}-01`;
    const to = monthEnd(month);
    instagramMetrics.push({
      id: id('bb000000', ++seq.i), ownerId: uid(2), periodStart: from, periodEnd: to, followers, newFollowers, reach, impressions, interactions, profileVisits, linkClicks, leads,
      notes: i === 5 ? 'Melhor mês: reels sobre precificação.' : null, source: 'manual', version: 1, createdAt: `${to}T23:00:00.000Z`, updatedAt: `${to}T23:00:00.000Z`,
    });
  });

  return { campaigns, marketingSpend, instagramMetrics };
}
