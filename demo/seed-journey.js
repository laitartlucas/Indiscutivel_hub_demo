// Jornada e check-ins do exemplo (Entrega 5): fases variadas com histórico e observações, check-ins diários na "Semana da
// Autoridade" (em andamento) e na "Rotina de conteúdo" (encerrada e já fechada), alguns com feedback da mentora e outros
// pendentes, e uma foto pequena. Os dias dos check-ins saem do início de cada desafio (não de "hoje"), para que a mesma função
// também sirva na migração de uma cópia antiga (versão 18) sem gravar check-in fora do período.
import { addDays, brasiliaDay } from './journey-data.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const fixedId = (kind, n) => `${kind}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uid = (n) => fixedId('10000000', n);
const WEEK_ID = fixedId('f1000000', 1);
const CONTENT_ID = fixedId('f1000000', 3);

/** PNG 16×16 (204 bytes): a "foto" de exemplo. Pequena de propósito: a demonstração guarda tudo no navegador. */
export const SAMPLE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAk0lEQVR42pXK7QrBUAAG4PeKlVJKKaWUWmgxs3HYh43DZjbGZkYL7bJcw/v8flBrjd+8+Vm0KqP9NjvlqluIXr7u361Bag8vjhJvx5Gnhv7suNelNEHt3UGA2l5ggdpu6ILa9skHtTdnCWqLOAC1l0kEahvXBNTW0xTU1m4ZqD3NClBbzV+g9uRRgdqj5xfUVsr6DyM47xAGGfIGAAAAAElFTkSuQmCC';
const SAMPLE_PNG_BYTES = 204;

/**
 * @param {{ now: Date, users: any[], challenges: any[], enrollments: any[] }} input
 * Sem avisos de exemplo: os avisos de fase, feedback e check-in nascem das ações feitas na demonstração.
 * @returns {{ studentPhases: any[], challengeCheckins: any[], checkinFiles: any[] }}
 */
export function buildJourneySeed({ now, users, challenges, enrollments }) {
  const t = now.getTime();
  const ago = (ms) => new Date(t - ms).toISOString();
  const today = brasiliaDay(now.toISOString());
  const mentora = users.find((u) => u.role === 'admin');
  const userById = new Map(users.map((u) => [u.id, u]));

  // ---- fases: só inclusão; a atual é a última. Quem não tem registro está na Fase 01.
  const studentPhases = [];
  const phase = (studentN, value, daysAgo, note) => {
    const student = userById.get(uid(studentN));
    if (!student || t - daysAgo * DAY <= Date.parse(student.createdAt)) return;
    studentPhases.push({ id: fixedId('c3000000', studentPhases.length + 1), studentId: student.id, phase: value, note, changedBy: mentora?.id ?? null, createdAt: ago(daysAgo * DAY) });
  };
  phase(2, 2, 100, 'Método validado com três clientes pagantes. Agora é hora de construir autoridade.');
  phase(2, 3, 25, 'Conteúdo constante e agenda cheia: vamos estruturar a escala com a mentoria em grupo.');
  phase(3, 2, 110, 'Oferta clara e primeiras vendas recorrentes.');
  phase(3, 3, 60, null);
  phase(3, 4, 12, 'Equipe de duas pessoas e processos documentados. Foco agora é gestão.');
  phase(4, 2, 105, 'Método validado com as clientes da clínica.'); // sem mudança há mais de 90 dias (Relatórios › Alunas e fases)
  phase(5, 2, 80, null);
  phase(5, 1, 74, 'Voltando para a Fase 01: o lançamento foi adiado e o método ainda precisa de ajustes.');
  phase(6, 2, 20, 'Primeiros cases publicados.');
  phase(11, 2, 70, null);
  phase(11, 3, 15, 'Lista de espera para a próxima turma.');
  phase(12, 2, 160, null);
  phase(12, 3, 110, null);
  phase(12, 4, 40, 'Já tem uma assistente e delega o atendimento.');

  // ---- check-ins (um por aluna, desafio e dia) e a foto de exemplo.
  const challengeCheckins = [];
  const checkinFiles = [];
  const latest = t - 10 * MIN;
  const checkin = (studentN, challengeId, offset, f) => {
    const c = challenges.find((x) => x.id === challengeId);
    const studentId = uid(studentN);
    if (!c || !mentora || c.mentoraId !== mentora.id) return null;
    if (!enrollments.some((e) => e.userId === studentId && e.challengeId === challengeId)) return null;
    const day = addDays(c.startsOn, offset);
    if (day > today || day > c.endsOn) return null;
    const createdAt = new Date(Math.min(Date.parse(`${day}T13:00:00.000Z`) + offset * 7 * MIN, latest)).toISOString();
    const feedbackAt = f.feedback ? new Date(Math.max(Date.parse(createdAt), Math.min(Date.parse(createdAt) + 20 * HOUR, t - 5 * MIN))).toISOString() : null;
    const row = {
      id: fixedId('c4000000', challengeCheckins.length + 1), studentId, challengeId, day, body: f.body ?? null, links: f.links ?? [], completed: f.completed ?? false,
      feedback: f.feedback ?? null, feedbackBy: f.feedback ? mentora.id : null, feedbackAt, version: f.feedback ? 2 : 1, createdAt, updatedAt: feedbackAt ?? createdAt,
    };
    challengeCheckins.push(row);
    if (f.photo) {
      checkinFiles.push({ id: fixedId('c5000000', checkinFiles.length + 1), checkinId: row.id, studentId, kind: 'photo', mime: 'image/png', name: f.photo, sizeBytes: SAMPLE_PNG_BYTES, dataUrl: SAMPLE_PNG, createdAt });
    }
    return row;
  };

  // Camila (aluna demo): dois dias com feedback, um pendente; o dia de hoje fica livre para ela registrar.
  checkin(2, WEEK_ID, 0, {
    body: 'Publiquei o case da cliente da clínica com antes e depois. Muitas mensagens no direct pedindo o diagnóstico.', links: ['https://www.instagram.com/p/exemplo-case/'],
    completed: true, photo: 'case-publicado.png', feedback: 'Excelente! Responda cada mensagem com a pergunta de diagnóstico e leve para a agenda.',
  });
  checkin(2, WEEK_ID, 1, { body: 'Gravei o vídeo sobre o método em três partes. Falta editar a legenda.', completed: true, feedback: 'Ótimo ritmo. Publique ainda nesta semana, mesmo sem legenda perfeita.' });
  checkin(2, WEEK_ID, 2, { body: 'Enviei duas propostas com diagnóstico. A terceira fica para amanhã.', links: ['https://docs.google.com/document/d/exemplo-proposta'], completed: false });
  // Mariana: todos os dias, só o primeiro com feedback.
  checkin(3, WEEK_ID, 0, { body: 'Case publicado e fixado no perfil.', completed: true, photo: 'case-mariana.png', feedback: 'Perfeito, esse case vai trabalhar por você o mês todo.' });
  checkin(3, WEEK_ID, 1, { body: 'Vídeo do método no ar.', links: ['https://www.youtube.com/watch?v=exemplo'], completed: true });
  checkin(3, WEEK_ID, 2, { body: 'Três propostas enviadas.', completed: true });
  checkin(3, WEEK_ID, 3, { body: 'Pedi depoimentos para duas clientes.', completed: false });
  // Outras participantes, com ritmos diferentes.
  checkin(4, WEEK_ID, 0, { body: 'Comecei pelo mapa de temas de conteúdo.', completed: true });
  checkin(6, WEEK_ID, 1, { body: 'Atualizei a bio do Instagram e respondi os comentários.', completed: true, feedback: 'Bio bem mais clara! Agora inclua o link da agenda.' });
  checkin(6, WEEK_ID, 2, { body: 'Roteiro do próximo vídeo pronto.', completed: true });
  checkin(7, WEEK_ID, 2, { body: 'Entrei na live da turma e convidei duas clientes.', completed: false });
  // Desafio encerrado (já fechado: só leitura).
  checkin(2, CONTENT_ID, 1, { body: 'Calendário editorial do mês definido.', completed: true, feedback: 'Calendário consistente. Reserve um dia fixo para gravar.' });
  checkin(2, CONTENT_ID, 12, { body: 'Quatro posts publicados.', links: ['https://www.instagram.com/p/exemplo-carrossel/'], completed: true, feedback: 'Os carrosséis estão performando melhor: repita o formato.' });
  checkin(2, CONTENT_ID, 26, { body: 'Oito posts no mês. Balanço feito.', completed: true });
  checkin(5, CONTENT_ID, 4, { body: 'Comecei o calendário, mas a semana apertou.', completed: false });

  return { studentPhases, challengeCheckins, checkinFiles };
}

/** Migração da cópia salva da versão 18: mantém tudo o que já existe e só acrescenta a jornada e os check-ins do exemplo. */
export function migrateJourney(saved, now, schema) {
  const extra = buildJourneySeed({ now, users: saved.users ?? [], challenges: saved.challenges ?? [], enrollments: saved.challengeEnrollments ?? [] });
  return {
    ...saved,
    schema,
    studentPhases: saved.studentPhases ?? extra.studentPhases,
    challengeCheckins: saved.challengeCheckins ?? extra.challengeCheckins,
    checkinFiles: saved.checkinFiles ?? extra.checkinFiles,
  };
}
