// Conquistas e Desafios do exemplo (fase 3, parte B): catálogo da mentora, 4 desafios (1 em andamento, 1 próximo, 1 concluído,
// 1 rascunho) e a participação das 12 alunas. O que está desbloqueado ou feito segue as mesmas regras do servidor: a primeira
// consulta não "descobre" nada novo (demo-achievements.test.js confere). Tudo é calculado a partir do "agora" recebido.
import { endsOnFor, SEED_ACHIEVEMENTS } from './growth-data.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const fixedId = (kind, n) => `${kind}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
/** Número fixo do id de cada conquista padrão (os de 2 e 3 eram as antigas sales-10k e sales-50k, que saíram do catálogo). */
const ACHIEVEMENT_N = { 'first-sale': 1, 'tasks-25': 4, 'tasks-100': 5, 'streak-7': 6, 'streak-30': 7, 'funnel-alive': 8, 'network-25': 9, 'goal-1': 10, 'level-5': 11, 'challenge-1': 12 };

/**
 * @param {{ now: Date, owner: string, users: any[], addXp: (kind: string, key: string, at: string, points?: number) => void }} input
 * `owner` é a aluna demo (a que tem XP no exemplo); `addXp` grava no XP dela.
 */
export function buildGrowthSeed({ now, owner, users, addXp }) {
  const t = now.getTime();
  const ago = (ms) => new Date(t - ms).toISOString();
  const today = ymd(t - 180 * MIN);
  const plusDays = (date, n) => ymd(Date.parse(`${date}T00:00:00Z`) + n * DAY);
  const mentoraId = users.find((u) => u.role === 'admin').id;
  const students = users.filter((u) => u.role === 'user');

  const achievements = SEED_ACHIEVEMENTS.map((s, i) => ({
    id: fixedId('f0000000', ACHIEVEMENT_N[s.key]), mentoraId, seedKey: s.key, title: s.title, description: s.description, category: s.category,
    ruleKind: s.ruleKind, ruleValue: s.ruleValue, xpReward: s.xpReward, active: true, archivedAt: null, version: 1, createdAt: ago(300 * DAY - i * MIN),
  }));
  const voice = {
    id: fixedId('f0000000', 13), mentoraId, seedKey: null, title: 'Voz de Autoridade', description: 'Concluir a Semana da Autoridade.', category: 'desafios',
    ruleKind: 'challenge_award', ruleValue: 1, xpReward: 100, active: true, archivedAt: null, version: 1, createdAt: ago(40 * DAY),
  };
  achievements.push(voice);
  const byKey = (key) => achievements.find((a) => a.seedKey === key);

  let actionCounter = 0;
  const actions = (list) =>
    list.map(([title, xp, kind = 'manual', target = 1], index) => ({ id: fixedId('f2000000', ++actionCounter), title, xp, position: index + 1, kind, target }));
  const challenge = (n, f) => ({
    id: fixedId('f1000000', n), mentoraId, status: 'published', description: '', achievementId: null, classNames: [], publishedAt: ago(30 * DAY), version: 1, createdAt: ago(60 * DAY),
    ...f, endsOn: endsOnFor(f.startsOn, f.durationDays),
  });

  const week = challenge(1, {
    title: 'Semana da Autoridade', description: 'Complete as ações estratégicas desta semana para se posicionar como referência.', durationDays: 7, rewardXp: 500,
    achievementId: voice.id, startsOn: plusDays(today, -3),
    actions: actions([
      ['Publicar um case de cliente', 30], ['Gravar vídeo sobre seu método', 40], ['Enviar 3 propostas com diagnóstico', 60], ['Pedir 2 depoimentos a clientes', 30],
      ['Participar da live da turma (qui)', 20], ['Atualizar a bio do Instagram', 10], ['Responder todos os comentários da semana', 10], ['Mapear 5 temas de conteúdo', 20],
      ['Escrever o roteiro do próximo vídeo', 20], ['Convidar 3 clientes para a live', 20], ['Revisar a página de vendas', 20], ['Agendar 2 conversas com indicações', 30],
      ['Publicar um depoimento em vídeo', 40], ['Concluir 20 tarefas no Hub', 30, 'auto_task_done_count', 20], ['Ganhar 5 oportunidades', 100, 'auto_deal_won', 5],
    ]),
  });
  const prospecting = challenge(2, {
    title: '30 dias de prospecção', description: 'Uma nova conversa qualificada por dia, registrada no Hub.', durationDays: 30, rewardXp: 800, startsOn: plusDays(today, 5),
    actions: actions([
      ['Cadastrar 30 pessoas novas', 100, 'auto_people_added', 30], ['Criar 10 leads', 50, 'auto_lead_created', 10], ['Fechar a primeira venda do ciclo', 100, 'auto_deal_won', 1], ['Rever a lista de contatos', 20],
    ]),
  });
  const content = challenge(3, {
    title: 'Rotina de conteúdo', description: '12 publicações estratégicas em um mês.', durationDays: 30, rewardXp: 600, startsOn: plusDays(today, -40), publishedAt: ago(45 * DAY),
    actions: actions([['Definir o calendário editorial', 20], ['Publicar 4 posts estratégicos', 20], ['Publicar 8 posts estratégicos', 20], ['Fazer o balanço do mês', 20]]),
  });
  const referral = challenge(4, {
    title: 'Mês da Indicação', description: 'Peça indicações de forma estruturada a cada cliente atendida.', durationDays: 30, rewardXp: 800, status: 'draft', publishedAt: null,
    classNames: ['Turma Aurora', 'Turma Horizonte'], startsOn: plusDays(today, 10),
    actions: actions([['Mapear 10 clientes satisfeitas', 50], ['Enviar roteiro de indicação', 80], ['Registrar indicações no CRM', 20, 'auto_people_added', 5]]),
  });
  const challenges = [week, prospecting, content, referral];

  // Adesão: as primeiras N ações de cada desafio já feitas (todas manuais, para o exemplo não depender de eventos do CRM).
  const enrollments = [];
  const progress = [];
  const enroll = (student, c, doneCount, completedDaysAgo = null, joinedDaysAgo = 3) => {
    enrollments.push({ userId: student.id, challengeId: c.id, joinedAt: ago(joinedDaysAgo * DAY), completedAt: completedDaysAgo === null ? null : ago(completedDaysAgo * DAY) });
    c.actions.slice(0, doneCount).forEach((a, i) => progress.push({ userId: student.id, actionId: a.id, doneAt: ago(Math.max(0.2, joinedDaysAgo - i * 0.1) * DAY), source: 'manual' }));
  };
  const me = students.find((s) => s.id === owner);
  const others = students.filter((s) => s.id !== owner);
  enroll(me, week, 9);
  [[0, 12], [1, 6], [2, 3], [3, 9], [4, 13], [5, 2], [6, 7]].forEach(([i, n]) => enroll(others[i], week, n));
  enroll(me, content, 4, 15, 38);
  enroll(others[0], content, 4, 20, 38);
  enroll(others[1], content, 4, 22, 38);
  enroll(others[3], content, 4, 18, 38);
  enroll(others[2], content, 3, null, 38);

  // Desbloqueios (alunas variadas). Para a aluna demo, o XP segue as mesmas chaves e pontos que o servidor geraria.
  const unlocks = [];
  const unlock = (student, key, daysAgo) => {
    const a = byKey(key);
    unlocks.push({ id: fixedId('f3000000', unlocks.length + 1), userId: student.id, achievementId: a.id, unlockedAt: ago(daysAgo * DAY) });
    if (student.id === owner) addXp('achievement_unlocked', `ach:${a.id}`, ago(daysAgo * DAY), a.xpReward);
  };
  for (const d of [20, 19, 18, 17, 16, 15, 14]) addXp('daily_access', `seed-streak:${d}`, ago(d * DAY + 5 * HOUR)); // sete dias seguidos
  unlock(me, 'first-sale', 140);
  unlock(me, 'goal-1', 106);
  unlock(me, 'streak-7', 13);
  unlock(me, 'level-5', 12);
  unlock(me, 'challenge-1', 15);
  unlock(me, 'funnel-alive', 9); // 10 contatos com oportunidade (conversões) já no exemplo
  unlock(me, 'network-25', 2); // 25 contatos na Central Comercial (os leads de antes viraram contatos)
  others.slice(0, 7).forEach((s, k) => unlock(s, 'first-sale', 120 - k * 9));
  [0, 1, 2].forEach((i) => unlock(others[i], 'goal-1', 60 - i * 5));
  unlock(others[0], 'streak-7', 33);
  [0, 1, 3].forEach((i) => unlock(others[i], 'challenge-1', 20 - i));
  [0, 1].forEach((i) => unlock(others[i], 'tasks-25', 50 - i * 6));
  [0, 1, 2].forEach((i) => unlock(others[i], 'network-25', 70 - i * 7));
  [0, 1].forEach((i) => unlock(others[i], 'level-5', 30 - i * 2));

  // XP dos desafios da aluna demo: ações já feitas e o desafio concluído.
  for (const c of [content, week]) {
    for (const a of c.actions) {
      const row = progress.find((p) => p.userId === owner && p.actionId === a.id);
      if (row && a.xp > 0) addXp('challenge_action', `chal-action:${a.id}`, row.doneAt, a.xp);
    }
  }
  addXp('challenge_completed', `chal:${content.id}`, ago(15 * DAY), content.rewardXp);

  return { achievements, achievementUnlocks: unlocks, challenges, challengeEnrollments: enrollments, challengeProgress: progress };
}
