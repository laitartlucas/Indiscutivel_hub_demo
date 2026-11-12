import { buildFinanceSeed } from './seed-finance.js';
import { buildGrowthSeed } from './seed-growth.js';
import { buildMarketingSeed } from './seed-marketing.js';
import { weekBounds } from './mentora-data.js';
import { SYSTEM_ROLES } from './team-data.js';
import { DEFAULT_FUNNELS, defaultFunnelRows } from './funnels-data.js';
import { monthKey, shiftMonth } from '../shared/active-students.js';

// Dados fictícios da versão de demonstração (nada aqui é real). Determinístico: tudo é calculado a partir do "agora"
// recebido, com deslocamentos fixos; os ids e os tokens de convite são sempre os mesmos.

export const DEMO_PASSWORD = 'Demo-1234';
export const MENTORA_EMAIL = 'mentora@demo.com';
export const STUDENT_EMAIL = 'aluna@demo.com';
export const ASSISTANT_EMAIL = 'assistente@demo.com';
export const SCHEMA_VERSION = 18;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Id com cara de UUID v4, estável: `kind` separa as tabelas, `n` numera as linhas. */
export function fixedId(kind, n) {
  return `${kind}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
const uid = (n) => fixedId('10000000', n);
const pid = (n) => fixedId('20000000', n);
const eid = (n) => fixedId('30000000', n);
const did = (n) => fixedId('40000000', n);
const iid = (n) => fixedId('50000000', n);
const kid = (n) => fixedId('60000000', n);
const lid = (n) => fixedId('70000000', n);
const aid = (n) => fixedId('80000000', n);
const cid = (n) => fixedId('90000000', n);
const hid = (n) => fixedId('a0000000', n);
const xid = (n) => fixedId('e0000000', n);
const gid = (n) => fixedId('d0000000', n);
const fnid = (student, f) => fixedId('a4000000', student * 100 + f);
const stid = (student, f, s) => fixedId('a5000000', student * 10000 + f * 100 + s);

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** @param {Date} now */
export function buildSeed(now) {
  const t = now.getTime();
  const ago = (ms) => new Date(t - ms).toISOString();

  const user = (n, fields) => ({
    id: uid(n),
    role: 'user',
    phone: null,
    photoUrl: null,
    className: null,
    program: null,
    joinedOn: null,
    endsOn: null,
    plan: null,
    active: true,
    manuallyBlocked: false,
    lastLoginAt: null,
    passwordResetAt: null,
    passwordChangedAt: null,
    avatarData: null,
    password: null,
    ...fields,
  });

  const six = 'Mentoria Indiscutível · 6 meses';
  const twelve = 'Mentoria Indiscutível · 12 meses';
  const turmaA = 'Turma Aurora';
  const turmaH = 'Turma Horizonte';
  const programDates = (joinedDaysAgo, months) => ({
    joinedOn: ymd(t - joinedDaysAgo * DAY),
    endsOn: ymd(t - joinedDaysAgo * DAY + months * 30 * DAY),
  });

  const users = [
    {
      id: uid(1),
      email: MENTORA_EMAIL,
      name: 'Jéssica M',
      role: 'admin',
      phone: '(11) 90000-0001',
      photoUrl: null,
      className: null,
      program: null,
      joinedOn: null,
      endsOn: null,
      plan: null,
      active: true,
      manuallyBlocked: false,
      lastLoginAt: ago(3 * HOUR),
      passwordResetAt: null,
      passwordChangedAt: ago(42 * DAY),
      avatarData: null,
      password: DEMO_PASSWORD,
      createdAt: ago(400 * DAY),
    },
    user(2, {
      email: STUDENT_EMAIL,
      name: 'Camila Duarte',
      phone: '(11) 90000-0002',
      className: turmaA,
      program: twelve,
      plan: 'Premium',
      password: DEMO_PASSWORD,
      passwordChangedAt: ago(42 * DAY),
      ...programDates(140, 12),
      lastLoginAt: ago(2 * HOUR),
      createdAt: ago(141 * DAY),
    }),
    user(3, {
      email: 'mariana.teixeira@exemplo.com',
      name: 'Mariana Sá Teixeira',
      phone: '(21) 90000-0003',
      className: turmaA,
      program: twelve,
      plan: 'VIP',
      ...programDates(138, 12),
      lastLoginAt: ago(3 * DAY),
      createdAt: ago(139 * DAY),
    }),
    user(4, {
      email: 'beatriz.nogueira@exemplo.com',
      name: 'Beatriz Nogueira',
      phone: '(31) 90000-0004',
      className: turmaA,
      program: six,
      plan: 'Essencial',
      ...programDates(120, 6),
      lastLoginAt: ago(5 * HOUR),
      createdAt: ago(121 * DAY),
    }),
    user(5, {
      email: 'fernanda.albuquerque@exemplo.com',
      name: 'Fernanda Albuquerque',
      phone: '(41) 90000-0005',
      className: turmaA,
      program: twelve,
      plan: 'Premium',
      ...programDates(115, 12),
      lastLoginAt: ago(12 * DAY),
      createdAt: ago(116 * DAY),
    }),
    user(6, {
      email: 'luiza.carvalho@exemplo.com',
      name: 'Luiza Carvalho',
      phone: '(51) 90000-0006',
      className: turmaA,
      program: six,
      plan: 'Essencial',
      ...programDates(60, 6),
      lastLoginAt: ago(9 * DAY), // em risco: sem acesso há 9 dias
      createdAt: ago(61 * DAY),
    }),
    user(7, {
      email: 'larissa.cunha@exemplo.com',
      name: 'Larissa Cunha',
      phone: '(61) 90000-0007',
      className: turmaA,
      program: twelve,
      plan: 'Premium',
      ...programDates(58, 12),
      lastLoginAt: ago(7 * DAY),
      createdAt: ago(59 * DAY),
    }),
    user(8, {
      email: 'patricia.mendes@exemplo.com',
      name: 'Patrícia Mendes',
      phone: '(71) 90000-0008',
      className: turmaH,
      program: six,
      plan: 'Essencial',
      ...programDates(2, 6),
      createdAt: ago(2 * DAY),
    }),
    user(9, {
      email: 'renata.figueiredo@exemplo.com',
      name: 'Renata Figueiredo',
      phone: '(81) 90000-0009',
      className: turmaH,
      program: twelve,
      plan: 'VIP',
      ...programDates(1, 12),
      createdAt: ago(1 * DAY),
    }),
    user(10, {
      email: 'aline.barros@exemplo.com',
      name: 'Aline Barros',
      phone: '(85) 90000-0010',
      className: turmaH,
      program: six,
      plan: 'Essencial',
      ...programDates(12, 6),
      createdAt: ago(12 * DAY),
    }),
    user(11, {
      email: 'juliana.prado@exemplo.com',
      name: 'Juliana Prado',
      phone: '(19) 90000-0011',
      className: turmaA,
      program: six,
      plan: 'Premium',
      ...programDates(100, 6),
      manuallyBlocked: true,
      lastLoginAt: ago(20 * DAY),
      createdAt: ago(101 * DAY),
    }),
    user(12, {
      email: 'tatiana.moreira@exemplo.com',
      name: 'Tatiana Moreira',
      phone: '(48) 90000-0012',
      className: turmaA,
      program: six,
      plan: 'Essencial',
      ...programDates(200, 6),
      active: false,
      lastLoginAt: ago(90 * DAY),
      createdAt: ago(201 * DAY),
    }),
    user(13, {
      email: 'gabriela.ferraz@exemplo.com',
      name: 'Gabriela Ferraz',
      phone: null,
      className: turmaH,
      program: twelve,
      plan: 'Premium',
      ...programDates(0, 12),
      createdAt: ago(4 * HOUR),
    }),
  ];

  // "Alunas ativas" que cada aluna informa sobre as alunas DELA (auto-informado; a mentora nunca vê o CRM). Seis meses, o último valor de cada mês.
  // `values[0]` é de 5 meses atrás e `values[5]` do mês atual; `null` = mês sem informar. `daysAgo`: quando foi a última atualização
  // (limitada ao mês do último valor, para o histórico e a data sempre combinarem).
  const currentMonth = monthKey(now.toISOString());
  const ACTIVE_STUDENTS_SEED = {
    2: { values: [3, 4, 5, 6, 7, 8], daysAgo: 2 }, // Camila: 8, subiu 1
    3: { values: [10, 12, 15, 18, 22, 25], daysAgo: 1 },
    4: { values: [2, 2, 1, 1, 0, 0], daysAgo: 6 }, // 0, igual ao mês anterior
    5: { values: [14, 13, 12, 12, 11, 12], daysAgo: 4 },
    6: { values: [1, 2, 2, 3, 3, null], daysAgo: 20 }, // 3, sem atualizar este mês
    7: { values: [null, null, null, 2, 4, 7], daysAgo: 9 },
    11: { values: [8, 7, 6, 5, null, null], daysAgo: 100 }, // bloqueada: parou em 5
    12: { values: [1, 0, null, null, null, null], daysAgo: 150 }, // inativa: 0
  };
  for (const [n, { values, daysAgo }] of Object.entries(ACTIVE_STUDENTS_SEED)) {
    const history = values.map((count, k) => (count === null ? null : { month: shiftMonth(currentMonth, k - 5), count })).filter(Boolean);
    const last = history.at(-1);
    const updatedAt = last.month === currentMonth ? new Date(Math.max(t - daysAgo * DAY, Date.parse(`${currentMonth}-01T03:00:00.000Z`) + HOUR)).toISOString() : `${last.month}-15T15:00:00.000Z`;
    users.find((u) => u.id === uid(Number(n))).activeStudents = { history, updatedAt: updatedAt > now.toISOString() ? now.toISOString() : updatedAt };
  }

  // Convites: ativas têm um aceito; pendentes/expirada têm um link (token fixo, só para o demo).
  const accepted = (n, userId, createdAgo, acceptedAgo) => ({
    id: iid(n),
    userId,
    token: `demo-convite-aceito-${String(n).padStart(4, '0')}-xxxxxxxx`,
    status: 'accepted',
    expiresAt: new Date(t - createdAgo + 7 * DAY).toISOString(),
    sentAt: ago(createdAgo),
    acceptedAt: ago(acceptedAgo),
    createdAt: ago(createdAgo),
    reset: false,
  });
  const pending = (n, userId, createdAgo) => ({
    id: iid(n),
    userId,
    token: `demo-convite-pendente-${String(n).padStart(4, '0')}-xxxxxx`,
    status: 'pending',
    expiresAt: new Date(t - createdAgo + 7 * DAY).toISOString(),
    sentAt: null,
    acceptedAt: null,
    createdAt: ago(createdAgo),
    reset: false,
  });
  const invites = [
    accepted(1, uid(2), 140 * DAY, 139 * DAY),
    accepted(2, uid(3), 138 * DAY, 137 * DAY),
    accepted(3, uid(4), 120 * DAY, 119 * DAY),
    accepted(4, uid(5), 115 * DAY, 114 * DAY),
    accepted(5, uid(6), 60 * DAY, 59 * DAY),
    accepted(6, uid(7), 58 * DAY, 57 * DAY),
    pending(7, uid(8), 2 * DAY),
    pending(8, uid(9), 1 * DAY),
    pending(9, uid(10), 12 * DAY), // venceu há 5 dias
    accepted(10, uid(11), 100 * DAY, 99 * DAY),
    accepted(11, uid(12), 200 * DAY, 199 * DAY),
  ];

  // ---- Dados de negócio da aluna demo (Camila) ----
  const owner = uid(2);
  const product = (n, name, price, createdDaysAgo, archived = false) => ({
    id: pid(n),
    ownerId: owner,
    name,
    price,
    archivedAt: archived ? ago((createdDaysAgo - 20) * DAY) : null,
    createdAt: ago(createdDaysAgo * DAY),
    updatedAt: ago((archived ? createdDaysAgo - 20 : createdDaysAgo) * DAY),
    version: archived ? 2 : 1,
  });
  const products = [
    product(1, 'Mentoria Individual · 3 meses', '4800.00', 130),
    product(2, 'Consultoria Estratégica · sessão única', '1200.00', 128),
    product(3, 'Curso Online Posicionamento Indiscutível', '997.00', 110),
    product(4, 'Workshop Presencial de Vendas', '1500.00', 90),
    product(5, 'Mentoria em Grupo · 6 semanas', '2400.00', 70),
    product(6, 'Diagnóstico de Negócio', '350.00', 45),
    product(7, 'E-book Guia do Primeiro Cliente (antigo)', '47.00', 120, true),
  ];

  // ---- Central Comercial: os 15 funis padrão de TODA aluna (como a migração 0026 faz para quem já existe), com ids fixos.
  const funnelRows = [];
  const stageRows = [];
  for (const u of users.filter((x) => x.role === 'user')) {
    const n = Number(u.id.slice(-4));
    const rows = defaultFunnelRows(u.id, u.createdAt, { funnel: (f) => fnid(n, f), stage: (f, s) => stid(n, f, s) });
    funnelRows.push(...rows.funnels);
    stageRows.push(...rows.stages);
  }
  const FPOS = Object.fromEntries(DEFAULT_FUNNELS.map((f, i) => [f.key, i + 1]));
  /** Etapa de um funil padrão da aluna `n`: número da etapa aberta (1, 2, ...), 'won' ou 'lost'. */
  const stageOf = (n, key, stage) => {
    const def = DEFAULT_FUNNELS[FPOS[key] - 1];
    const spos = stage === 'won' ? def.stages.length + 1 : stage === 'lost' ? def.stages.length + 2 : stage;
    return stageRows.find((s) => s.id === stid(n, FPOS[key], spos));
  };

  // Contatos (cadastro único: Pessoa = Contato). Os 15 primeiros já eram Pessoas; os leads de antes viram contatos mais abaixo.
  // [nome, instagram, email, origem, diasAtrás, temperatura, situação de lead, etiquetas, responsável, observações|null]
  const personRows = [
    ['Ana Clara Ribeiro', '@anaclara.ribeiro', 'ana.ribeiro@exemplo.com', 'referral', 125, 'hot', 'qualified', ['cliente', 'alto ticket'], 'Camila Duarte', 'Cliente da mentoria individual. Indica bastante: pedir depoimento.'],
    ['Bruno Tavares', '@bruno.tavares', 'bruno.tavares@exemplo.com', 'organic', 118, 'warm', 'qualified', ['cliente', 'curso'], 'Camila Duarte', null],
    ['Carolina Lopes', '@carol.lopes', null, 'meta_ads', 110, 'hot', 'qualified', ['alto ticket', 'sócia decide'], 'Camila Duarte', null],
    ['Daniel Moura', null, 'daniel.moura@exemplo.com', 'event', 100, 'warm', 'qualified', ['evento set'], 'Lívia Matos', null],
    ['Eduarda Siqueira', '@duda.siqueira', 'eduarda.siqueira@exemplo.com', 'referral', 92, 'hot', 'qualified', ['cliente', 'grupo'], 'Camila Duarte', 'Prefere conversar à noite.'],
    ['Felipe Andrade', '@felipe.andrade', null, 'google_ads', 85, 'cold', 'qualified', ['retomar 2027'], 'Lívia Matos', null],
    ['Giovana Pires', '@gi.pires', 'giovana.pires@exemplo.com', 'organic', 77, 'warm', 'qualified', ['cliente'], 'Camila Duarte', null],
    ['Heitor Camargo', null, 'heitor.camargo@exemplo.com', 'other', 70, 'warm', 'contacted', ['mesa'], 'Camila Duarte', null],
    ['Isabela Rocha', '@isa.rocha', 'isabela.rocha@exemplo.com', 'meta_ads', 63, 'warm', 'qualified', ['aplicação'], 'Lívia Matos', null],
    ['João Pedro Salles', '@jp.salles', null, 'event', 55, 'cold', 'contacted', ['evento set'], 'Lívia Matos', null],
    ['Karina Bastos', '@karina.bastos', 'karina.bastos@exemplo.com', 'referral', 48, 'hot', 'qualified', ['indicação'], 'Camila Duarte', 'Indicada pela Ana Clara.'],
    ['Leonardo Fiuza', null, 'leonardo.fiuza@exemplo.com', 'organic', 40, 'warm', 'contacted', ['conteúdo'], 'Camila Duarte', null],
    ['Marcela Torres', '@marcela.torres', 'marcela.torres@exemplo.com', 'meta_ads', 31, 'warm', 'contacted', ['aplicação'], 'Lívia Matos', null],
    ['Natália Ventura', '@nat.ventura', null, 'referral', 22, 'cold', 'contacted', ['conteúdo'], 'Camila Duarte', 'Comentou nos stories sobre posicionamento.'],
    ['Otávio Brandão', '@otavio.brandao', 'otavio.brandao@exemplo.com', 'google_ads', 14, 'warm', 'new', [], null, null],
  ];
  const people = personRows.map(([name, instagram, email, source, days, temperature, leadStatus, tags, responsible, notes], i) => ({
    id: eid(i + 1),
    ownerId: owner,
    name,
    phone: null,
    whatsapp: `5511900000${String(i + 1).padStart(3, '0')}`,
    instagram,
    email,
    source,
    tags,
    notes,
    responsible,
    temperature,
    leadStatus,
    entryFunnelId: null, // o funil da primeira oportunidade, preenchido mais abaixo
    companyId: null, // preenchido logo abaixo, depois de criar as empresas
    createdAt: ago(days * DAY),
    updatedAt: ago(days * DAY),
    version: 1,
  }));

  // Empresas da aluna demo (nada aqui é real) e quem trabalha em cada uma.
  // [nome, segmento, cidade, UF, site|null, observações|null, criadaHáDias, [pessoas]]
  const companyRows = [
    ['Essenza Consultoria', 'consulting', 'São Paulo', 'SP', 'https://essenza.com.br', 'Conta estratégica: a decisão passa pela sócia.', 120, [3, 5]],
    ['M7 Estratégia', 'strategy', 'Rio de Janeiro', 'RJ', 'https://m7estrategia.com.br', null, 110, [4, 11]],
    ['Lumen Marketing', 'digital_marketing', 'São Paulo', 'SP', 'https://lumenmkt.com.br', null, 95, [9]],
    ['Vértice Saúde', 'health', 'Campinas', 'SP', 'https://vertice.med.br', 'Clínica com três unidades.', 90, [1, 7, 10]],
    ['Alma & Negócios', 'education', 'Belo Horizonte', 'MG', null, null, 80, [13]],
    ['Casa Lume Arquitetura', 'architecture', 'São Paulo', 'SP', 'https://casalume.arq.br', null, 60, [14]],
    ['Rocha Odontologia', 'health', 'Curitiba', 'PR', null, null, 50, [12]],
    ['Studio Lopes', 'services', 'Porto Alegre', 'RS', null, null, 40, [2]],
    ['Gouveia Fitness', 'beauty', 'Goiânia', 'GO', 'https://gouveiafit.com', null, 25, [15]],
  ];
  const companies = companyRows.map(([name, segment, city, state, website, notes, days], i) => ({
    id: cid(i + 1),
    ownerId: owner,
    name,
    segment,
    city,
    state,
    website,
    notes,
    version: 1,
    createdAt: ago(days * DAY),
    updatedAt: ago(days * DAY),
  }));
  companyRows.forEach(([, , , , , , , members], i) => {
    for (const n of members) people[n - 1].companyId = cid(i + 1);
  });

  // Leads de antes (nenhum é pessoa real) viram contatos, com a mesma regra da migração 0026: o lead convertido aponta para a Pessoa
  // que já existia; os demais unem por WhatsApp/e-mail ou viram contato novo, sem duplicar. Empresa e cargo entram nas observações e
  // a linha do tempo do lead passa a ser a do contato.
  // [nome, empresa, cargo, e-mail, whatsapp, instagram, origem, situação antiga, temperatura, observações|null, criadoHáDias, pessoa|null, etiquetas, responsável, [[tipo, texto, horasAtrás], ...]]
  const leadRows = [
    ['Renata Souza', 'Lumen Marketing', 'Fundadora', 'renata@lumenmkt.com.br', '5511992145580', '@renata.souza', 'organic', 'qualified', 'hot', 'Pediu proposta de posicionamento digital.', 10, null, ['alto ticket'], 'Camila Duarte', [['meeting', 'Diagnóstico de 45 min realizado. Principal dor: agenda cheia e ticket baixo.', 96], ['call', 'Ligação de alinhamento sobre a proposta.', 5]]],
    ['Patrícia Lima', 'Essenza Consultoria', 'Sócia', 'patricia@essenza.com.br', '5511981234001', null, 'referral', 'contacted', 'hot', null, 8, null, ['indicação', 'alto ticket'], 'Camila Duarte', [['whatsapp', 'Enviei o material de apresentação.', 30]]],
    ['Beatriz Nogueira', 'Vértice Saúde', 'Diretora clínica', 'beatriz@vertice.med.br', null, '@bia.nogueira', 'event', 'qualified', 'warm', 'Conheceu o trabalho no evento de setembro.', 12, null, ['evento set'], 'Lívia Matos', [['email', 'Proposta enviada por e-mail.', 27]]],
    ['Carla Menezes', 'Alma & Negócios', null, 'carla@almaenegocios.com', '5511977001002', null, 'meta_ads', 'contacted', 'warm', null, 6, null, ['aplicação'], 'Lívia Matos', [['note', 'Veio de um anúncio; ainda não respondeu à segunda mensagem.', 50]]],
    ['Carolina Lopes', 'Studio Lopes', 'Fundadora', 'carolina.lopes@exemplo.com', null, '@carol.lopes', 'meta_ads', 'converted', 'hot', null, 25, 3, [], null, [['call', 'Fechamos o escopo da mentoria individual.', 24 * 18]]],
    ['Débora Castro', 'Casa Lume Arquitetura', 'Arquiteta', 'debora@casalume.arq.br', '5511966003003', '@debora.castro', 'organic', 'new', 'cold', null, 3, null, [], null, []],
    ['Tatiane Rocha', 'Rocha Odontologia', 'Dentista', 'contato@rochaodonto.com', null, null, 'google_ads', 'new', 'warm', null, 2, null, [], null, []],
    ['Vanessa Prado', 'Prado Advocacia', 'Advogada', 'vanessa@pradoadv.com.br', '5511955005005', null, 'referral', 'lost', 'cold', 'Decidiu aguardar o próximo semestre.', 30, null, ['retomar 2027'], 'Camila Duarte', [['call', 'Ela prefere retomar no próximo semestre.', 24 * 12]]],
    ['Isabela Rocha', 'Rocha Studio', 'Designer', 'isabela.rocha@exemplo.com', null, '@isa.rocha', 'meta_ads', 'converted', 'warm', null, 20, 9, [], null, [['meeting', 'Reunião de proposta realizada.', 24 * 7]]],
    ['Olívia Pacheco', 'Essenza Consultoria', 'Consultora', 'olivia@essenza.com.br', '5511933007007', null, 'referral', 'new', 'hot', 'Indicada pela Patrícia Lima. Quer estruturar o posicionamento antes do lançamento de janeiro.', 1, null, ['indicação'], 'Camila Duarte', []],
    ['Rafael Gouveia', 'Gouveia Fitness', 'Personal trainer', 'rafael@gouveiafit.com', '5511922008008', '@rafa.gouveia', 'meta_ads', 'contacted', 'cold', null, 14, null, [], 'Lívia Matos', [['whatsapp', 'Mandei a tabela de valores.', 24 * 9]]],
    ['Sabrina Leite', 'Leite Nutrição', 'Nutricionista', null, '5511911009009', '@sabrina.nutri', 'organic', 'qualified', 'hot', null, 9, null, ['conteúdo'], 'Camila Duarte', [['note', 'Quer começar em novembro.', 20]]],
    ['Túlio Barreto', 'Barreto Contabilidade', 'Contador', 'tulio@barretocont.com.br', null, null, 'event', 'lost', 'warm', 'Sem orçamento neste trimestre.', 21, null, [], null, []],
    ['Úrsula Dantas', 'Dantas Moda', 'Estilista', 'ursula@dantasmoda.com', '5511900009999', '@ursula.dantas', 'google_ads', 'new', 'warm', null, 1, null, [], null, []],
  ];
  const STATUS_PT = { new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado', lost: 'Perdido', converted: 'Convertido' };
  const LEAD_TO_CONTACT = { new: 'new', contacted: 'contacted', qualified: 'qualified', lost: 'discarded', converted: 'qualified' };
  const activities = [];
  let activitySeq = 0;
  const addActivity = (personId, kind, body, hoursAgo) =>
    activities.push({ id: aid(++activitySeq), ownerId: owner, personId, kind, body, occurredAt: ago(hoursAgo * HOUR), createdAt: ago(hoursAgo * HOUR) });
  leadRows.forEach(([name, company, jobTitle, email, whatsapp, instagram, source, status, temperature, notes, age, p, tags, responsible, acts]) => {
    const merged = [notes, company ? `Empresa: ${company}` : null, jobTitle ? `Cargo: ${jobTitle}` : null].filter(Boolean).join('\n') || null;
    let person = p ? people[p - 1] : people.find((x) => (whatsapp && x.whatsapp === whatsapp) || (email && x.email === email));
    if (person) {
      person.notes ??= merged;
      person.instagram ??= instagram;
    } else {
      const at = ago(age * DAY);
      person = {
        id: eid(people.length + 1), ownerId: owner, name, phone: null, whatsapp, instagram, email, source, tags, notes: merged, responsible, temperature,
        leadStatus: LEAD_TO_CONTACT[status], entryFunnelId: null, companyId: null, createdAt: at, updatedAt: at, version: 1,
      };
      people.push(person);
    }
    addActivity(person.id, 'status_change', 'Lead criado.', age * 24);
    if (status !== 'new') addActivity(person.id, 'status_change', `Situação alterada de Novo para ${STATUS_PT[status === 'converted' ? 'qualified' : status]}.`, age * 24 - 6);
    for (const [kind, text, hours] of acts) addActivity(person.id, kind, text, hours);
    if (status === 'converted') addActivity(person.id, 'status_change', 'Convertido em oportunidade.', Math.min(age * 24 - 8, 24 * 17));
  });
  // Conversas registradas direto nos contatos que já eram Pessoas. [contato, tipo, texto, horasAtrás]
  const contactActivities = [
    [1, 'meeting', 'Sessão de fechamento do ciclo: quer renovar por mais 3 meses.', 24 * 5],
    [3, 'whatsapp', 'Mandei o case da Essenza e a condição em 3x.', 24 * 6],
    [3, 'call', 'A sócia pediu mais uma semana para decidir.', 30],
    [4, 'meeting', 'Conversa no intervalo do evento; pediu orçamento por turma.', 24 * 11],
    [5, 'whatsapp', 'Perguntou sobre a próxima turma do grupo.', 48],
    [8, 'call', 'Topou participar da próxima mesa.', 24 * 15],
    [11, 'call', 'Ligação de 20 min: quer começar ainda este mês.', 26],
    [12, 'note', 'Respondeu o post sobre precificação.', 24 * 19],
    [13, 'email', 'Recebi a aplicação dela pelo formulário.', 24 * 3],
    [14, 'whatsapp', 'Respondeu os stories e pediu mais detalhes da mentoria.', 24 * 2],
  ];
  for (const [p, kind, body, hours] of contactActivities) addActivity(eid(p), kind, body, hours);

  // Oportunidades espalhadas pelos funis, para cada quadro parecer real. Natália Ventura fica na primeira etapa de "Conteúdo" (o vídeo
  // arrasta o cartão dela para a etapa seguinte) e Carolina Lopes na "Proposta" de "Conteúdo".
  // [contato, produto|null, valor, funil, etapa (aberta 1..n | 'won' | 'lost'), temperatura, abertaHáDias, atualizadaHáDias, fechadaHáDias|null, motivoPerda, previsãoEmDias|null, notas|null, responsável|null]
  const dealRows = [
    [1, 1, '4800.00', 'indicacao', 'won', 'hot', 60, 35, 35, null, null, null, 'Camila Duarte'],
    [2, 3, '997.00', 'conteudo', 'won', 'warm', 50, 30, 30, null, null, null, 'Camila Duarte'],
    [5, 5, '2400.00', 'indicacao', 'won', 'hot', 45, 21, 21, null, null, 'Fechou após a segunda reunião com a sócia.', 'Camila Duarte'],
    [7, 2, '1200.00', 'conteudo', 'won', 'warm', 30, 9, 9, null, null, null, 'Camila Duarte'],
    [3, 1, '4800.00', 'conteudo', 5, 'hot', 18, 6, null, null, 5, 'Decisão depende da sócia. Reforçar o case e a condição de pagamento em 3x.', 'Camila Duarte'],
    [9, 5, '2200.00', 'aplicacao', 5, 'warm', 15, 3, null, null, 12, null, 'Lívia Matos'],
    [4, 4, '1500.00', 'evento', 4, 'warm', 12, 4, null, null, -2, 'Pediu um orçamento por turma.', 'Lívia Matos'],
    [10, 6, '350.00', 'evento', 3, 'cold', 10, 5, null, null, null, null, 'Lívia Matos'],
    [11, 2, '1200.00', 'indicacao', 3, 'hot', 8, 1, null, null, 20, null, 'Camila Duarte'],
    [13, 3, '997.00', 'aplicacao', 1, 'warm', 3, 3, null, null, 30, null, 'Lívia Matos'],
    [14, null, '3000.00', 'conteudo', 1, 'cold', 2, 2, null, null, null, null, 'Camila Duarte'],
    [6, 1, '4800.00', 'aplicacao', 'lost', 'cold', 40, 25, 25, 'Preferiu aguardar o próximo semestre.', null, null, 'Lívia Matos'],
    [1, 1, '4800.00', 'renovacao', 1, 'warm', 6, 6, null, null, 25, 'O ciclo de 3 meses termina no fim do mês.', 'Camila Duarte'],
    [5, 5, '2400.00', 'renovacao', 2, 'hot', 9, 2, null, null, 10, null, 'Camila Duarte'],
    [16, null, '8500.00', 'conteudo', 3, 'hot', 9, 1, null, null, 15, 'Proposta de posicionamento digital.', 'Camila Duarte'],
    [25, null, '5400.00', 'conteudo', 4, 'hot', 8, 1, null, null, 21, null, 'Camila Duarte'],
    [17, null, '15000.00', 'indicacao', 2, 'hot', 7, 1, null, null, 30, null, 'Camila Duarte'],
    [23, null, '12000.00', 'indicacao', 1, 'hot', 0.5, 0.5, null, null, 60, null, 'Camila Duarte'],
    [18, null, '4200.00', 'evento', 5, 'warm', 11, 1, null, null, 7, null, 'Lívia Matos'],
    [19, null, '9800.00', 'aplicacao', 2, 'warm', 5, 2, null, null, null, null, 'Lívia Matos'],
    [8, 2, '1200.00', 'mesa', 4, 'warm', 14, 4, null, null, 9, null, 'Camila Duarte'],
    [12, 3, '997.00', 'conteudo', 2, 'warm', 20, 7, null, null, null, null, 'Camila Duarte'],
    [2, 6, '350.00', 'ascensao', 1, 'warm', 4, 4, null, null, null, 'Cliente do curso: oferecer o diagnóstico.', 'Camila Duarte'],
  ];
  const deals = [];
  const dealHistory = [];
  /** Oportunidade da aluna `n` + histórico (o caminho até a etapa atual, com as datas espaçadas entre a abertura e a última mudança). */
  const addDeal = (n, ownerId, id, personId, prod, value, key, stage, temperature, opened, updated, closed, lostReason, forecast, notes, responsible) => {
    const target = stageOf(n, key, stage);
    const funnelId = fnid(n, FPOS[key]);
    const lastOpen = DEFAULT_FUNNELS[FPOS[key] - 1].stages.length;
    // Caminho: as abertas depois da primeira até a atual; a ganha passa por até 3 abertas; a perdida, pela segunda.
    const opens = target.kind === 'open' ? target.position : target.kind === 'won' ? Math.min(3, lastOpen) : Math.min(2, lastOpen);
    const path = [];
    for (let s = 2; s <= opens; s++) path.push(stageOf(n, key, s));
    if (target.kind !== 'open') path.push(target);
    const lastAgo = closed ?? updated;
    let from = stageOf(n, key, 1);
    path.forEach((to, step) => {
      const agoDays = path.length === 1 ? lastAgo : lastAgo + ((path.length - 1 - step) * (opened - lastAgo)) / path.length;
      dealHistory.push({
        id: hid(dealHistory.length + 1), ownerId, dealId: id, fromStage: from.kind, toStage: to.kind, fromStageId: from.id, toStageId: to.id,
        fromStageName: from.name, toStageName: to.name, changedAt: ago(Math.round(agoDays * DAY)),
      });
      from = to;
    });
    deals.push({
      id, ownerId, personId, funnelId, stageId: target.id, stage: target.kind, productId: prod ? pid(prod) : null, value, temperature, lostReason, responsible,
      openedAt: ago(opened * DAY), closedAt: closed == null ? null : ago(closed * DAY), expectedCloseOn: forecast == null ? null : ymd(t + forecast * DAY),
      notes: notes ?? null, createdAt: ago(opened * DAY), updatedAt: ago(updated * DAY), version: 1 + path.length,
    });
  };
  dealRows.forEach(([p, prod, value, key, stage, temperature, opened, updated, closed, lostReason, forecast, notes, responsible], i) =>
    addDeal(2, owner, did(i + 1), eid(p), prod, value, key, stage, temperature, opened, updated, closed, lostReason, forecast, notes, responsible));

  // Outras alunas também usam a Central Comercial (dados fictícios e só delas): a mentora vê apenas os números agregados.
  // [aluna, [[contato, origem, funil, etapa, valor, abertaHáDias, fechadaHáDias|null], ...]]
  const otherCrm = [
    [3, [['Paula Vieira', 'referral', 'indicacao', 'won', '6000.00', 40, 12], ['Sônia Ramos', 'event', 'evento', 'won', '3500.00', 25, 8], ['Teresa Lins', 'organic', 'conteudo', 4, '4200.00', 10, null],
      ['Vera Assis', 'organic', 'conteudo', 2, '2800.00', 6, null], ['Yara Costa', 'meta_ads', 'aplicacao', 3, '5200.00', 9, null], ['Zilda Prates', 'referral', 'indicacao', 'lost', '6000.00', 30, 14],
      ['Alice Menezes', 'event', 'imersao', 2, '9000.00', 5, null]]],
    [4, [['Bianca Torres', 'organic', 'conteudo', 1, '1500.00', 4, null], ['Cecília Rocha', 'meta_ads', 'isca', 3, '497.00', 7, null], ['Diana Faria', 'referral', 'indicacao', 'won', '1800.00', 20, 6]]],
    [5, [['Elisa Moura', 'organic', 'conteudo', 'lost', '2500.00', 35, 18], ['Fabiana Leal', 'referral', 'renovacao', 1, '3000.00', 12, null], ['Gisele Prado', 'event', 'workshop', 2, '900.00', 15, null]]],
    [7, [['Helena Duarte', 'referral', 'indicacao', 2, '4000.00', 6, null], ['Íris Campos', 'organic', 'grupo_vip', 'won', '1200.00', 18, 4], ['Joana Pires', 'meta_ads', 'desafio', 3, '700.00', 9, null],
      ['Kátia Nunes', 'organic', 'conteudo', 1, '2000.00', 2, null]]],
  ];
  for (const [n, rows] of otherCrm) {
    rows.forEach(([name, source, key, stage, value, opened, closed], k) => {
      const personId = eid(n * 1000 + k + 1);
      const at = ago((opened + 3) * DAY);
      people.push({
        id: personId, ownerId: uid(n), name, phone: null, whatsapp: null, instagram: null, email: null, source, tags: [], notes: null, responsible: null, temperature: 'warm',
        leadStatus: 'qualified', entryFunnelId: fnid(n, FPOS[key]), companyId: null, createdAt: at, updatedAt: at, version: 1,
      });
      addDeal(n, uid(n), did(n * 1000 + k + 1), personId, null, value, key, stage, 'warm', opened, closed ?? Math.max(1, opened - 2), closed, stage === 'lost' ? 'Sem orçamento agora.' : null, null, null, null);
    });
  }
  // Funil de entrada: o da primeira oportunidade do contato.
  for (const person of people) {
    const first = deals.filter((d) => d.personId === person.id).sort((a, b) => (a.openedAt < b.openedAt ? -1 : 1))[0];
    if (first) person.entryFunnelId = first.funnelId;
  }

  // Tarefas da aluna demo. As datas são RELATIVAS a hoje, no dia local de quem abre a demonstração (horário do navegador):
  // assim "Hoje", "Atrasadas" e "Próximas" sempre têm exemplos, em qualquer dia em que a demonstração for gerada.
  const at = (dayOffset, time) => {
    const [hh, mm] = time ? time.split(':').map(Number) : [0, 0];
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hh, mm).toISOString();
  };
  // [título, tipo, prioridade, diasAPartirDeHoje|null, 'HH:MM'|null (dia inteiro), pessoa|null, oportunidade|null, concluídaHáMs|null, anotações|null]
  const taskRows = [
    ['Follow-up da proposta com Carolina Lopes', 'followup', 'high', 0, '10:00', 3, 5, null, 'Perguntar se ela conseguiu falar com a sócia sobre o valor.'],
    ['Reunião de diagnóstico com Daniel Moura', 'meeting', 'high', 0, '15:30', 4, 7, null, null],
    ['Publicar case de cliente', 'task', 'medium', 0, null, null, null, null, null],
    ['Responder mensagem da mentora', 'task', 'low', 0, '09:00', null, null, 2 * HOUR, null],
    ['Enviar proposta revisada para Isabela Rocha', 'deadline', 'high', -1, '17:00', 9, 6, null, null],
    ['Retornar orçamento do Felipe Andrade', 'task', 'medium', -3, null, 6, null, null, null],
    ['Definir próximo passo com Heitor Camargo', 'followup', 'high', -5, '10:00', 8, null, null, null],
    ['Atualizar valores do pipeline', 'task', 'low', 1, null, null, null, null, null],
    ['Preparar contrato para Carolina Lopes', 'deadline', 'high', 3, '14:00', 3, 5, null, null],
    ['Reunião com Natália Ventura', 'meeting', 'medium', 4, '16:00', 14, 11, null, null],
    ['Pensar em novos conteúdos para o Instagram', 'task', 'low', null, null, null, null, null, null],
    ['Enviar condições de pagamento a Ana Clara Ribeiro', 'followup', 'high', -4, '11:00', 1, 1, 4 * DAY, null],
    ['Onboarding de Eduarda Siqueira', 'meeting', 'high', -9, '14:00', 5, 3, 9 * DAY, null],
    ['Gravar vídeo de autoridade', 'task', 'medium', -12, null, null, null, 12 * DAY, null],
  ];
  const tasks = taskRows.map(([title, kind, priority, dayOffset, time, p, d, doneAgo, notes], i) => ({
    id: kid(i + 1),
    ownerId: owner,
    title,
    notes,
    dueAt: dayOffset === null ? null : at(dayOffset, time),
    dueAllDay: dayOffset !== null && time === null,
    priority,
    status: doneAgo === null ? 'open' : 'done',
    doneAt: doneAgo === null ? null : ago(doneAgo),
    kind,
    personId: p ? eid(p) : null,
    dealId: d ? did(d) : null,
    version: doneAgo === null ? 1 : 2,
    createdAt: ago((Math.abs(dayOffset ?? 3) + 3) * DAY),
    updatedAt: doneAgo === null ? ago((Math.abs(dayOffset ?? 3) + 3) * DAY) : ago(doneAgo),
  }));

  // Perfil e Configurações: preferências por conta (vazio = padrões), outras sessões FICTÍCIAS das duas contas de demonstração
  // (a sessão atual é montada na hora, a partir do navegador de quem está vendo), origens de lead por aluna (vazio = as 6 padrão)
  // e as configurações da mentoria (uma só, singleton).
  const otherSessions = {
    [uid(1)]: [{ id: fixedId('b0000000', 1), device: 'iPhone', browser: 'Safari', createdAt: ago(9 * DAY), lastSeenAt: ago(3 * HOUR) }],
    [uid(2)]: [
      { id: fixedId('b0000000', 2), device: 'iPhone', browser: 'Safari', createdAt: ago(20 * DAY), lastSeenAt: ago(5 * HOUR) },
      { id: fixedId('b0000000', 3), device: 'Windows', browser: 'Edge', createdAt: ago(31 * DAY), lastSeenAt: ago(2 * DAY) },
    ],
  };
  const mentoria = {
    name: 'Autoridade Indiscutível',
    welcomeMessage: 'Bem-vinda ao seu espaço de crescimento. Aqui, estratégia vira rotina: um passo claro por vez.',
    defaultClassName: null,
    defaultProgram: null,
    defaultPlan: null,
  };
  // Notificações de exemplo (o resto nasce na consulta, a partir das tarefas e dos convites do exemplo). As chaves seguem
  // a mesma regra do servidor, então a consulta não duplica nada. Só a aluna demo tem avisos prontos: a mentora vê os
  // que a consulta gera (convite vencido da aluna do exemplo).
  const localDay = (ms) => new Date(ms - now.getTimezoneOffset() * MIN).toISOString().slice(0, 10);
  const notifications = [
    {
      id: fixedId('c0000000', 1),
      userId: uid(2),
      kind: 'welcome',
      title: 'Boas-vindas ao Indiscutível Hub',
      body: 'Comece pelo Painel: ele mostra o que pede atenção hoje. Cadastre os seus contatos na Central Comercial para montar o seu funil.',
      link: '#/',
      dedupeKey: 'welcome',
      createdAt: ago(3 * DAY),
      readAt: null,
    },
    {
      id: fixedId('c0000000', 2),
      userId: uid(2),
      kind: 'daily_summary',
      title: 'Resumo do dia',
      body: 'Você tem 3 tarefas para hoje.',
      link: '#/tarefas',
      dedupeKey: `daily-summary:${localDay(t - DAY)}`,
      createdAt: ago(DAY + 2 * HOUR),
      readAt: ago(DAY),
    },
  ];

  // XP e Metas da aluna demo (gamificação). Os eventos do exemplo seguem as mesmas regras do servidor: cada tarefa concluída,
  // oportunidade ganha e lead convertido do exemplo já pontuou (mesmas chaves `task:<id>`, `deal-won:<id>`, `lead-converted:<id>`),
  // e o resto são eventos de rotina espalhados em 6 meses. Os pontos vêm de DEMO_XP_POINTS (conferido contra o servidor por teste).
  const POINTS = { task_done: 10, deal_won: 50, lead_converted: 30, person_created: 5, lead_activity: 3, daily_access: 2, goal_reached: 100 };
  const xpEvents = [];
  const addXp = (kind, dedupeKey, occurredAt, points = POINTS[kind]) => xpEvents.push({ id: xid(xpEvents.length + 1), ownerId: owner, kind, points, dedupeKey, occurredAt });
  for (const task of tasks) if (task.status === 'done') addXp('task_done', `task:${task.id}`, task.doneAt);
  for (const deal of deals) if (deal.ownerId === owner && deal.stage === 'won') addXp('deal_won', `deal-won:${deal.id}`, deal.closedAt);
  // Os dois leads convertidos antes da Central Comercial (Carolina Lopes e Isabela Rocha) mantêm a chave antiga `lead-converted:<lead>`.
  for (const n of [5, 9]) addXp('lead_converted', `lead-converted:${lid(n)}`, ago(24 * 17 * HOUR));
  // Eventos de rotina dos meses anteriores ([dias atrás, tipo]); pontos que permanecem mesmo que o registro original já tenha sido excluído.
  const FILLERS = [
    [150, 'deal_won'], [146, 'task_done'], [141, 'person_created'], [136, 'task_done'], [131, 'lead_activity'],
    [118, 'lead_converted'], [112, 'task_done'], [106, 'goal_reached'], [101, 'task_done'], [97, 'person_created'],
    [88, 'deal_won'], [85, 'deal_won'], [80, 'task_done'], [76, 'lead_converted'], [72, 'task_done'], [68, 'person_created'], [64, 'daily_access'],
    [58, 'goal_reached'], [54, 'task_done'], [49, 'lead_converted'], [45, 'task_done'], [41, 'task_done'], [37, 'lead_activity'], [33, 'person_created'],
    [26, 'task_done'], [19, 'daily_access'], [14, 'task_done'], [8, 'person_created'], [3, 'lead_activity'],
  ];
  FILLERS.forEach(([days, kind], k) => addXp(kind, `seed:${k + 1}`, ago(days * DAY + (k % 5) * HOUR)));

  const monthOf = (ms) => new Date(ms - now.getTimezoneOffset() * MIN).toISOString().slice(0, 7);
  const monthMinus = (n) => {
    const [y, m] = monthOf(t).split('-').map(Number);
    const index = y * 12 + (m - 1) - n;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  };
  // [meses atrás, métrica, alvo]: 3 metas do mês corrente e o histórico de faturamento dos 5 meses anteriores.
  const goalRows = [
    [0, 'revenue', '10000.00'], [0, 'tasks_done', '12'], [0, 'new_leads', '20'], // acima dos contatos novos do exemplo (no máximo 11 no mês): nenhuma meta do mês nasce atingida
    [1, 'revenue', '8000.00'], [2, 'revenue', '6000.00'], [3, 'revenue', '6000.00'], [4, 'revenue', '5000.00'], [5, 'revenue', '4000.00'],
  ];
  const goals = goalRows.map(([back, metric, target], i) => ({
    id: gid(i + 1), ownerId: owner, metric, month: monthMinus(back), target, version: 1,
    createdAt: new Date(Date.UTC(Number(monthMinus(back).slice(0, 4)), Number(monthMinus(back).slice(5, 7)) - 1, 1, 12)).toISOString(),
  }));
  // Metas de faturamento de meses já fechados e atingidas pelas vendas do exemplo: o +100 XP já foi concedido.
  for (const goal of goals) {
    if (goal.metric !== 'revenue' || goal.month >= monthOf(t)) continue;
    const won = deals.filter((d) => d.ownerId === owner && d.stage === 'won' && monthOf(Date.parse(d.closedAt)) === goal.month).reduce((n, d) => n + Math.round(Number(d.value) * 100), 0);
    if (won >= Math.round(Number(goal.target) * 100)) addXp('goal_reached', `goal:${goal.metric}:${goal.month}`, new Date(Date.UTC(Number(goal.month.slice(0, 4)), Number(goal.month.slice(5, 7)), 1, 11)).toISOString());
  }

  const growth = buildGrowthSeed({ now, owner, users, addXp });
  // Financeiro: vendas das oportunidades ganhas, vendas avulsas, parcelas, pagamentos, um estorno, uma renegociação e um cancelamento.
  const finance = buildFinanceSeed({ now, uid, eid, did, pid });
  // Marketing: campanhas, investimentos, Instagram e a campanha dos contatos e oportunidades que já existem.
  const marketing = buildMarketingSeed({ now, uid, people, deals, did });

  // Ranking "Evolução da comunidade": 9 alunas ativas (5 da Turma Aurora, 4 da Horizonte) já optaram por participar, com XP do mês variado e
  // níveis diferentes. A aluna demo NÃO participa até ligar a opção (padrão desligado, como no sistema). O XP do mês fica entre o
  // início do mês de Brasília e agora (nunca no futuro nem no mês anterior); o restante do total vem de eventos antigos.
  const monthStart = (() => {
    const [y, m] = new Date(t - 180 * MIN).toISOString().slice(0, 7).split('-').map(Number);
    return Date.UTC(y, m - 1, 1) + 180 * MIN;
  })();
  const rankingRows = [
    // [aluna, XP no mês, XP total (somando o mês)]
    [3, 520, 5600], [4, 430, 3700], [5, 340, 2400], [6, 480, 8100], [7, 390, 4300],
    [8, 210, 600], [9, 80, 200], [10, 290, 1100], [13, 160, 1900],
  ];
  const AT_RISK = new Set([5, 6, 7]);
  const preferences = {};

  // ---- Acompanhamento (fase 4, parte B): dias com atividade em cada uma das últimas 8 semanas, por aluna. [dias ativos na semana atual,
  // na anterior, ...]. Duas muito engajadas (3 e 4, esta subindo), três em risco com queda (5, 6 e 7: nada nos últimos 8 dias), uma subindo (8), uma baixa
  // e estável (9), uma regular (10) e uma em declínio que ainda aparece (13). Os eventos entram no XP e são DESCONTADOS do XP antigo ou
  // do mês de cada aluna (mais abaixo), então o XP total e o do mês de cada uma continuam exatamente os de rankingRows.
  const todayLocal = new Date(t - 180 * MIN).toISOString().slice(0, 10);
  const addLocalDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  const mondayNow = addLocalDays(todayLocal, -((new Date(`${todayLocal}T00:00:00Z`).getUTCDay() + 6) % 7));
  const WEEK_PATTERNS = {
    3: [6, 7, 6, 7, 6, 7, 6, 6],
    4: [7, 7, 7, 6, 5, 5, 5, 5],
    5: [0, 0, 4, 5, 5, 4, 3, 2],
    6: [0, 0, 2, 3, 5, 5, 6, 4],
    7: [0, 0, 1, 2, 2, 3, 2, 1],
    8: [4, 5, 4, 3, 2, 1, 1, 0],
    9: [1, 1, 0, 1, 1, 0, 1, 1],
    10: [3, 3, 4, 3, 3, 4, 3, 3],
    13: [2, 3, 4, 5, 5, 5, 4, 5],
  };
  const WEEK_KINDS = [['daily_access', 2], ['daily_access', 2], ['task_done', 10], ['daily_access', 2], ['lead_activity', 3], ['daily_access', 2], ['person_created', 5]];
  const weeklyEvents = (n) => {
    const rows = [];
    (WEEK_PATTERNS[n] ?? []).forEach((count, w) => {
      const start = addLocalDays(mondayNow, -7 * w);
      for (let k = 0; k < count; k++) {
        const date = addLocalDays(start, k);
        if (date > todayLocal) continue;
        const daysAgo = Math.round((Date.parse(`${todayLocal}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY);
        if (AT_RISK.has(n) && daysAgo < 8) continue; // as em risco não têm sinal nos últimos 8 dias
        const [kind, points] = WEEK_KINDS[(k + w) % WEEK_KINDS.length];
        const at = Math.min(Date.parse(`${date}T15:00:00Z`), t - 5 * MIN - k * MIN); // 12:00 em Brasília; hoje nunca no futuro
        rows.push({ kind, points, key: `seed-wk:${n}:${date}`, at });
      }
    });
    return rows;
  };
  for (const [n, monthXp, totalXp] of rankingRows) {
    const ownerId = uid(n);
    preferences[ownerId] = { rankingVisible: true };
    const push = (kind, key, at, points) => xpEvents.push({ id: xid(xpEvents.length + 1), ownerId, kind, points, dedupeKey: key, occurredAt: new Date(at).toISOString() });
    const weekly = weeklyEvents(n);
    const weeklyOld = weekly.filter((e) => e.at < monthStart).reduce((sum, e) => sum + e.points, 0);
    const weeklyMonth = weekly.filter((e) => e.at >= monthStart).reduce((sum, e) => sum + e.points, 0);
    for (const e of weekly) push(e.kind, e.key, e.at, e.points);
    let rest = totalXp - monthXp - weeklyOld;
    for (let i = 0; rest > 0; i++) {
      const points = Math.min(250, rest);
      // XP antigo espalhado pelos meses anteriores (o gráfico de evolução da mentora mostra seis); parte vira "meta atingida".
      push(i % 3 === 1 ? 'goal_reached' : 'task_done', `seed-rk-old:${n}:${i}`, t - (40 + i * 7) * DAY, points);
      rest -= points;
    }
    // Atividade dos últimos 14 dias (acessos do dia): padrão próprio de cada aluna; as em risco só têm dias de 8 a 13 atrás.
    if (n >= 3 && n <= 7) {
      for (let d = AT_RISK.has(n) ? 8 : 0; d < 14; d++) if ((d * n + n) % 3 !== 0) push('daily_access', `seed-act:${n}:${d}`, t - d * DAY - (n % 5) * HOUR - HOUR, 2);
    }
    const first = Math.round(monthXp * 0.6);
    // As três alunas em risco (Fernanda, Luiza e Larissa) não têm atividade nos últimos 8 dias; as demais seguem ativas.
    const quiet = (at) => (AT_RISK.has(n) ? Math.min(at, t - 8 * DAY) : at);
    push('task_done', `seed-rk-month:${n}:1`, quiet(monthStart + 0.3 * (t - monthStart)), first);
    push('task_done', `seed-rk-month:${n}:2`, quiet(monthStart + 0.8 * (t - monthStart)), Math.max(1, monthXp - first - weeklyMonth));
  }

  // ---- Mentoria (fase 4): notas privadas da mentora e sessões. As sessões "na semana" ficam sempre dentro da semana corrente (segunda a domingo, Brasília).
  const mentoraId = uid(1);
  const week = weekBounds(now, 180);
  const localMidnight = Math.floor((t - 180 * MIN) / DAY) * DAY + 180 * MIN;
  const slot = (k, dayOffset, hour, minute = 0) => {
    const wanted = localMidnight + dayOffset * DAY + hour * HOUR + minute * MIN;
    return Math.max(Math.min(wanted, week.end - (k + 2) * HOUR), t + (k + 1) * HOUR);
  };
  const sessionRow = (n, studentN, startsAt, durationMin, mode, topic, status = 'scheduled') => ({
    id: fixedId('b0000000', n), mentoraId, studentId: uid(studentN), startsAt: new Date(startsAt).toISOString(), durationMin, mode, topic, status, version: 1,
    createdAt: ago(10 * DAY), updatedAt: ago(10 * DAY),
  });
  const mentoringSessions = [
    sessionRow(1, 2, slot(0, 1, 15), 60, 'individual', 'Revisão do funil de vendas'),
    sessionRow(2, 5, slot(1, 2, 10), 45, 'individual', 'Retomar o ritmo das entregas'),
    sessionRow(3, 6, slot(2, 3, 11), 60, 'grupo', 'Plano das próximas quatro semanas'),
    sessionRow(4, 7, slot(3, 1, 16, 30), 30, 'individual', 'Check-in de metas'),
    sessionRow(5, 3, t - 5 * DAY, 60, 'individual', 'Fechamento do trimestre', 'done'),
    sessionRow(6, 4, t - 9 * DAY, 60, 'individual', 'Precificação da mentoria', 'done'),
    sessionRow(7, 11, t + 4 * DAY, 45, 'individual', 'Conversa sobre a continuidade', 'cancelled'),
  ];
  // O aviso que o servidor teria gravado para a aluna demo ao marcar a primeira sessão (mesma chave de deduplicação).
  {
    const first = mentoringSessions[0];
    const when = new Date(Date.parse(first.startsAt) - 180 * MIN);
    const p2 = (n) => String(n).padStart(2, '0');
    notifications.push({
      id: fixedId('c2000000', 1), userId: uid(2), kind: 'mentoring_session_scheduled', title: 'Mentoria marcada',
      body: `Individual, ${p2(when.getUTCDate())}/${p2(when.getUTCMonth() + 1)} às ${p2(when.getUTCHours())}:${p2(when.getUTCMinutes())}: ${first.topic}`,
      link: '#/calendario',
      dedupeKey: `mentoring-session:${first.id}:${Math.floor(Date.parse(first.startsAt) / 1000)}`,
      createdAt: ago(10 * DAY), readAt: null,
    });
  }
  const note = (n, studentN, daysAgo, body, editedDaysAgo = null) => ({
    id: fixedId('c1000000', n), mentoraId, studentId: uid(studentN), body, createdAt: ago(daysAgo * DAY), updatedAt: ago((editedDaysAgo ?? daysAgo) * DAY),
  });
  const mentoriaNotes = [
    note(1, 2, 21, 'Muito consistente na execução. Travando no fechamento: tende a oferecer desconto quando há dois decisores. Trabalhar prova social na próxima sessão.'),
    note(2, 2, 6, 'Subiu a taxa de resposta nas propostas depois do roteiro novo. Manter o ritmo e levar um case para a Semana da Autoridade.', 5),
    note(3, 3, 12, 'Referência da turma. Posso convidar para falar com a Turma Horizonte no próximo encontro.'),
    note(4, 5, 14, 'Sumiu depois de uma mudança de agenda. Combinar um retorno leve, com uma única meta por semana.'),
    note(5, 5, 3, 'Respondeu minha mensagem e topou a sessão desta semana.'),
    note(6, 7, 8, 'Precisa de metas menores. Quando o alvo é grande demais, ela adia tudo.'),
    note(7, 4, 30, 'Prefere sessões curtas, no começo do dia.'),
  ];

  // ---- Acompanhamento: planos de ação e check-ins semanais registrados à mão (a semana atual e a anterior).
  const plan = (studentN, actionText, nextOffsetDays) => ({
    studentId: uid(studentN), mentoraId, actionText, nextCheckinOn: nextOffsetDays === null ? null : addLocalDays(todayLocal, nextOffsetDays), version: 1, updatedAt: ago(4 * DAY),
  });
  const followupPlans = [
    plan(5, 'Retomar com uma única meta por semana: duas conversas de prospecção até sexta.', -2),
    plan(6, 'Reorganizar a agenda de entregas e voltar a registrar as tarefas todos os dias.', 0),
    plan(7, 'Dividir a meta do mês em metas semanais menores e acompanhar toda segunda.', 3),
    plan(3, 'Preparar o case de sucesso para apresentar na Semana da Autoridade.', 5),
    plan(4, 'Fechar a precificação da mentoria em grupo e testar com duas clientes.', 2),
    plan(8, 'Manter a rotina de prospecção e subir a taxa de resposta das propostas.', 6),
    plan(10, 'Definir uma meta semanal de novos contatos e registrar os resultados.', null),
  ];
  const checkin = (studentN, weeksBack, note = '') => ({
    studentId: uid(studentN), mentoraId, weekStart: addLocalDays(mondayNow, -7 * weeksBack), doneAt: ago((weeksBack * 7 + 1) * DAY), note,
  });
  const mentoriaCheckins = [checkin(3, 0), checkin(4, 0), checkin(8, 0), checkin(10, 0), checkin(13, 0), checkin(3, 1), checkin(4, 1), checkin(5, 1), checkin(8, 1), checkin(13, 1)];

  // ---- Equipe: papéis padrão, a assistente (já ativa) e uma pessoa com convite pendente. Nenhuma vê dado de negócio das alunas.
  const roleAssistant = fixedId('f1000000', 1);
  const roleReadonly = fixedId('f1000000', 2);
  const teamRoles = [
    { id: roleAssistant, name: SYSTEM_ROLES.assistant.name, permissions: [...SYSTEM_ROLES.assistant.permissions], isSystem: true, systemKey: 'assistant', createdAt: ago(60 * DAY) },
    { id: roleReadonly, name: SYSTEM_ROLES.readonly.name, permissions: [...SYSTEM_ROLES.readonly.permissions], isSystem: true, systemKey: 'readonly', createdAt: ago(60 * DAY) },
  ];
  const staff = (n, fields) => ({ ...user(n, { role: 'staff' }), ...fields });
  users.push(
    staff(90, { email: ASSISTANT_EMAIL, name: 'Rafaela Nunes', password: DEMO_PASSWORD, passwordChangedAt: ago(30 * DAY), lastLoginAt: ago(26 * HOUR), createdAt: ago(60 * DAY) }),
    staff(91, { email: 'carolina.alves@demo.com', name: 'Carolina Alves', createdAt: ago(2 * DAY) }),
  );
  invites.push(accepted(90, uid(90), 59 * DAY, 58 * DAY), pending(91, uid(91), 2 * DAY));
  const teamMembers = [
    { userId: uid(90), roleId: roleAssistant },
    { userId: uid(91), roleId: roleReadonly },
  ];

  return { schema: SCHEMA_VERSION, seededAt: now.toISOString(), users, invites, notifications, products, people, companies, funnels: funnelRows, funnelStages: stageRows, deals, dealHistory, tasks, activities, xpEvents, goals, preferences, otherSessions, leadSources: {}, mentoria, mentoriaNotes, mentoringSessions, followupPlans, mentoriaCheckins, teamRoles, teamMembers, ...finance, ...marketing, ...growth };
}
