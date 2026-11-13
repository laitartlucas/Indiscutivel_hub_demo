// Conquistas e Desafios da demonstração: as mesmas regras do servidor (server/src/services/growth.ts e growth-mentora.ts)
// sobre o estado em memória. Recebe do mock principal só o que precisa (banco, relógio, XP, notificações, validação).
import {
  ACHIEVEMENT_CATEGORIES,
  ACTION_KINDS,
  CATEGORY_LABELS,
  completionPct,
  daysLeft,
  daysUntil,
  describeAction,
  describeRule,
  endsOnFor,
  isEligible,
  longestStreak,
  phaseOf,
  RULE_KINDS,
  RULES,
  SEED_ACHIEVEMENTS,
} from './growth-data.js';

const DAY = 86_400_000;
const MINUTE = 60_000;
const VERSION_CONFLICT = 'Este item foi alterado em outra aba ou outro dispositivo. Recarregue e tente de novo.';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function createGrowthDemo(d) {
  const { Errors, HttpError, createIssues, requireBody, onlyKeys, readVersion } = d;
  const db = () => d.getDb();
  const dayOf = (iso) => new Date(Date.parse(iso) - d.XP_DAY_OFFSET * MINUTE).toISOString().slice(0, 10);
  const todayStr = () => dayOf(d.clock().toISOString());
  const periodBounds = (startsOn, endsOn) => ({
    start: Date.parse(`${startsOn}T00:00:00Z`) + d.XP_DAY_OFFSET * MINUTE,
    end: Date.parse(`${endsOn}T00:00:00Z`) + DAY + d.XP_DAY_OFFSET * MINUTE,
  });

  // ---------------------------------------------------------------- catálogo e contexto

  const adminOf = () => db().users.find((u) => u.role === 'admin');
  /** Única mentora da demonstração (o servidor usa o convite mais recente; sem convite, a mentora mais antiga). */
  const mentoraIdOf = () => adminOf()?.id ?? null;

  function seedDefaults(mentoraId) {
    for (const seed of SEED_ACHIEVEMENTS) {
      if (db().achievements.some((a) => a.mentoraId === mentoraId && a.seedKey === seed.key)) continue;
      db().achievements.push({
        id: d.newId(), mentoraId, seedKey: seed.key, title: seed.title, description: seed.description, category: seed.category, ruleKind: seed.ruleKind,
        ruleValue: seed.ruleValue, xpReward: seed.xpReward, active: true, archivedAt: null, version: 1, createdAt: d.stamp(),
      });
    }
  }

  const activeAchievements = (mentoraId) => db().achievements.filter((a) => a.mentoraId === mentoraId && a.active && !a.archivedAt);
  /** Desbloqueadas que saíram do catálogo ativo (inativas ou arquivadas, como "Primeiros R$ 10K" na Entrega 6): ficam no histórico da aluna. */
  function retiredAchievements(mentoraId, unlockedIds) {
    const inCatalog = new Set(activeAchievements(mentoraId).map((a) => a.id));
    const wanted = new Set(unlockedIds.filter((id) => !inCatalog.has(id)));
    return db()
      .achievements.filter((a) => a.mentoraId === mentoraId && wanted.has(a.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  function visibleChallenges(u) {
    return db().challenges.filter((c) => c.mentoraId === mentoraIdOf() && c.status === 'published' && isEligible(c.classNames, u.className));
  }

  // ---------------------------------------------------------------- medidas (só dados da própria aluna)

  const mineOf = (list, u) => list.filter((row) => row.ownerId === u.id);

  function measureRules(u) {
    const won = mineOf(db().deals, u).filter((x) => x.stage === 'won');
    const xp = db().xpEvents.filter((e) => e.ownerId === u.id);
    return {
      deals_won_count: won.length,
      revenue_won_total: won.reduce((n, x) => n + Math.round(Number(x.value) * 100), 0) / 100,
      tasks_done_count: mineOf(db().tasks, u).filter((x) => x.status === 'done').length,
      // Conversão = contato com ao menos uma oportunidade (contatos distintos, como o servidor).
      leads_converted_count: new Set(mineOf(db().deals, u).map((x) => x.personId)).size,
      people_count: mineOf(db().people, u).length,
      streak_days: longestStreak(xp.map((e) => dayOf(e.occurredAt))),
      goals_reached_count: xp.filter((e) => e.kind === 'goal_reached').length,
      level_reached: d.levelFor(xp.reduce((n, e) => n + e.points, 0)).level,
      challenge_completed_count: db().challengeEnrollments.filter((e) => e.userId === u.id && e.completedAt).length,
    };
  }

  function countEvents(u, kind, start, end) {
    const inside = (iso) => iso != null && Date.parse(iso) >= start && Date.parse(iso) < end;
    if (kind === 'auto_task_done_count') return mineOf(db().tasks, u).filter((x) => x.status === 'done' && inside(x.doneAt)).length;
    // Desde a Central Comercial todo lead é um contato: "leads criados" = contatos cadastrados no período.
    if (kind === 'auto_lead_created') return mineOf(db().people, u).filter((x) => inside(x.createdAt)).length;
    if (kind === 'auto_deal_won') return mineOf(db().deals, u).filter((x) => x.stage === 'won' && inside(x.closedAt)).length;
    return mineOf(db().people, u).filter((x) => inside(x.createdAt)).length;
  }

  // ---------------------------------------------------------------- avaliação (idempotente)

  const emptyResult = () => ({ achievements: [], challenges: [], xp: 0 });

  function unlockAchievement(u, a, now, result) {
    if (db().achievementUnlocks.some((x) => x.userId === u.id && x.achievementId === a.id)) return false;
    db().achievementUnlocks.push({ id: d.newId(), userId: u.id, achievementId: a.id, unlockedAt: now });
    const xp = a.xpReward > 0 ? d.awardXp(u, 'achievement_unlocked', `ach:${a.id}`, now, a.xpReward) : 0;
    result.xp += xp;
    result.achievements.push({ id: a.id, title: a.title, xpReward: xp });
    d.addNotification(u, {
      kind: 'achievement_unlocked', title: 'Conquista desbloqueada', body: xp > 0 ? `${a.title} · +${xp} XP` : a.title,
      link: '#/conquistas', dedupeKey: `ach:${a.id}`, createdAt: now,
    });
    return true;
  }

  function finishChallenge(u, c, now, result) {
    const enrollment = db().challengeEnrollments.find((e) => e.userId === u.id && e.challengeId === c.id);
    if (!enrollment || enrollment.completedAt) return;
    enrollment.completedAt = now;
    const xp = c.rewardXp > 0 ? d.awardXp(u, 'challenge_completed', `chal:${c.id}`, now, c.rewardXp) : 0;
    result.xp += xp;
    result.challenges.push({ id: c.id, title: c.title, rewardXp: xp });
    d.addNotification(u, {
      kind: 'challenge_completed', title: 'Desafio concluído', body: xp > 0 ? `${c.title} · +${xp} XP` : c.title,
      link: `#/desafios/${c.id}`, dedupeKey: `chal-done:${c.id}`, createdAt: now,
    });
    const linked = c.achievementId ? activeAchievements(c.mentoraId).find((a) => a.id === c.achievementId) : undefined;
    if (linked) unlockAchievement(u, linked, now, result);
  }

  const doneRows = (u, c) => db().challengeProgress.filter((p) => p.userId === u.id && c.actions.some((a) => a.id === p.actionId));

  function evaluateChallenge(u, c, now, result) {
    const { start, end } = periodBounds(c.startsOn, c.endsOn);
    const counts = new Map();
    for (const action of c.actions) {
      if (action.kind === 'manual' || db().challengeProgress.some((p) => p.userId === u.id && p.actionId === action.id)) continue;
      const count = counts.get(action.kind) ?? countEvents(u, action.kind, start, end);
      counts.set(action.kind, count);
      if (count < action.target) continue;
      db().challengeProgress.push({ userId: u.id, actionId: action.id, doneAt: now, source: 'auto' });
      if (action.xp > 0) result.xp += d.awardXp(u, 'challenge_action', `chal-action:${action.id}`, now, action.xp);
    }
    if (c.actions.length > 0 && doneRows(u, c).length === c.actions.length) finishChallenge(u, c, now, result);
  }

  function evaluateAchievements(u, mentoraId, now, result) {
    for (let round = 0; round < 5; round++) {
      const unlocked = new Set(db().achievementUnlocks.filter((x) => x.userId === u.id).map((x) => x.achievementId));
      const pending = activeAchievements(mentoraId).filter((a) => !unlocked.has(a.id) && a.ruleKind !== 'challenge_award');
      if (pending.length === 0) return;
      const metrics = measureRules(u);
      let gained = false;
      for (const a of pending) {
        if (metrics[a.ruleKind] + 1e-9 < a.ruleValue) continue;
        if (unlockAchievement(u, a, now, result) && a.xpReward > 0) gained = true;
      }
      if (!gained) return;
    }
  }

  /** Avança ações automáticas, conclui desafios e desbloqueia conquistas; devolve o que mudou nesta avaliação. */
  function evaluate(u) {
    const result = emptyResult();
    const mentoraId = mentoraIdOf();
    if (!mentoraId) return result;
    seedDefaults(mentoraId);
    const now = d.stamp();
    const today = todayStr();
    for (const c of visibleChallenges(u)) {
      const enrollment = db().challengeEnrollments.find((e) => e.userId === u.id && e.challengeId === c.id);
      if (!enrollment || enrollment.completedAt || phaseOf(today, c.startsOn, c.endsOn) !== 'active') continue;
      evaluateChallenge(u, c, now, result);
    }
    evaluateAchievements(u, mentoraId, now, result);
    return result;
  }

  const growthField = (r) => (r.achievements.length || r.challenges.length ? { growth: { achievements: r.achievements.map((a) => ({ id: a.id, title: a.title })), challenges: r.challenges.map((c) => ({ id: c.id, title: c.title })) } } : {});
  const xpField = (xp) => (xp > 0 ? { xpAwarded: xp } : {});

  // ---------------------------------------------------------------- DTOs da aluna

  const unitOf = (kind) => (kind === 'revenue_won_total' ? 'brl' : kind === 'streak_days' ? 'days' : kind === 'level_reached' ? 'level' : 'count');

  function achievementDto(a, unlock, metrics, linked) {
    const current = a.ruleKind === 'challenge_award' ? null : metrics[a.ruleKind];
    const progress = unlock || current === null ? null : { current: Math.min(current, a.ruleValue), target: a.ruleValue, pct: Math.min(100, Math.floor((current / a.ruleValue) * 100)), unit: unitOf(a.ruleKind) };
    return {
      id: a.id, title: a.title, description: a.description, category: a.category, categoryLabel: CATEGORY_LABELS[a.category],
      criteria: describeRule(a.ruleKind, a.ruleValue), xpReward: a.xpReward, unlocked: Boolean(unlock), unlockedAt: unlock?.unlockedAt ?? null, progress,
      linkedChallenge: a.ruleKind === 'challenge_award' ? (linked.get(a.id) ?? null) : null,
    };
  }

  function challengeDto(u, c, detail) {
    const today = todayStr();
    const enrollment = db().challengeEnrollments.find((e) => e.userId === u.id && e.challengeId === c.id);
    const phase = phaseOf(today, c.startsOn, c.endsOn);
    const done = enrollment ? new Map(doneRows(u, c).map((p) => [p.actionId, p.doneAt])) : new Map();
    const total = c.actions.length;
    const doneCount = c.actions.filter((a) => done.has(a.id)).length;
    const state = enrollment?.completedAt ? 'completed' : enrollment ? (phase === 'ended' ? 'ended' : phase === 'active' ? 'active' : 'upcoming') : phase === 'active' ? 'available' : 'upcoming';
    const achievement = c.achievementId ? activeAchievements(c.mentoraId).find((a) => a.id === c.achievementId) : undefined;
    const base = {
      id: c.id, title: c.title, description: c.description, durationDays: c.durationDays, rewardXp: c.rewardXp,
      achievement: achievement ? { id: achievement.id, title: achievement.title } : null, startsOn: c.startsOn, endsOn: c.endsOn, phase,
      daysLeft: phase === 'ended' ? 0 : daysLeft(today, c.endsOn), daysUntil: daysUntil(today, c.startsOn), state, enrolled: Boolean(enrollment),
      joinedAt: enrollment?.joinedAt ?? null, completedAt: enrollment?.completedAt ?? null, progress: { done: doneCount, total, pct: completionPct(doneCount, total) },
    };
    if (!detail) return base;
    const { start, end } = periodBounds(c.startsOn, c.endsOn);
    const counts = new Map();
    const actions = c.actions.map((a) => {
      const doneAt = done.get(a.id);
      let current = null;
      if (a.kind !== 'manual' && enrollment && phase !== 'upcoming') {
        const count = counts.get(a.kind) ?? countEvents(u, a.kind, start, end);
        counts.set(a.kind, count);
        current = doneAt ? a.target : Math.min(count, a.target);
      }
      return { id: a.id, title: a.title, xp: a.xp, position: a.position, kind: a.kind, automatic: a.kind !== 'manual', target: a.target, hint: describeAction(a.kind, a.target), current, done: Boolean(doneAt), doneAt: doneAt ?? null };
    });
    return { ...base, actions };
  }

  function visible(u, id) {
    if (!d.UUID.test(id)) throw Errors.notFound('Desafio não encontrado.');
    const c = visibleChallenges(u).find((x) => x.id === id);
    if (!c) throw Errors.notFound('Desafio não encontrado.');
    return c;
  }

  const noQuery = (searchParams) => {
    const issues = createIssues();
    for (const key of searchParams.keys()) issues.add('', `Parâmetro não permitido: ${key}.`);
    issues.throwIfAny();
  };
  const noBody = (body) => {
    if (body === undefined) return;
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, [], issues);
    issues.throwIfAny();
  };

  // ---------------------------------------------------------------- rotas da aluna

  function listAchievements(searchParams) {
    const u = d.requireStudent();
    noQuery(searchParams);
    const mentoraId = mentoraIdOf();
    const events = evaluate(u);
    const unlocks = new Map(db().achievementUnlocks.filter((x) => x.userId === u.id).map((x) => [x.achievementId, x]));
    const metrics = measureRules(u);
    const linked = new Map();
    for (const c of visibleChallenges(u)) if (c.achievementId) linked.set(c.achievementId, { id: c.id, title: c.title });
    const data = [...activeAchievements(mentoraId), ...retiredAchievements(mentoraId, [...unlocks.keys()])].map((a) => achievementDto(a, unlocks.get(a.id), metrics, linked));
    const unlocked = data.filter((a) => a.unlocked).sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''));
    if (events.achievements.length || events.challenges.length || events.xp) d.persist();
    return { status: 200, body: { total: data.length, unlocked: unlocked.length, recent: unlocked[0] ?? null, data, ...xpField(events.xp), ...growthField(events) } };
  }

  function recentAchievements(searchParams) {
    const u = d.requireStudent();
    noQuery(searchParams);
    const mentoraId = mentoraIdOf();
    const mine = db().achievementUnlocks.filter((x) => x.userId === u.id);
    const byId = new Map([...activeAchievements(mentoraId), ...retiredAchievements(mentoraId, mine.map((x) => x.achievementId))].map((a) => [a.id, a]));
    const data = mine
      .filter((x) => byId.has(x.achievementId))
      .sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt))
      .slice(0, 5)
      .map((x) => {
        const a = byId.get(x.achievementId);
        return { id: a.id, title: a.title, description: a.description, category: a.category, categoryLabel: CATEGORY_LABELS[a.category], xpReward: a.xpReward, unlockedAt: x.unlockedAt };
      });
    return { status: 200, body: { data } };
  }

  function listChallenges(searchParams) {
    const u = d.requireStudent();
    noQuery(searchParams);
    const events = evaluate(u);
    const today = todayStr();
    const data = [];
    for (const c of visibleChallenges(u)) {
      const enrolled = db().challengeEnrollments.some((e) => e.userId === u.id && e.challengeId === c.id);
      if (!enrolled && phaseOf(today, c.startsOn, c.endsOn) === 'ended') continue;
      data.push(challengeDto(u, c, false));
    }
    if (events.xp || events.achievements.length || events.challenges.length) d.persist();
    return { status: 200, body: { today, data, ...xpField(events.xp), ...growthField(events) } };
  }

  function getChallenge(id, searchParams) {
    const u = d.requireStudent();
    noQuery(searchParams);
    const c = visible(u, id);
    const events = evaluate(u);
    if (events.xp || events.achievements.length || events.challenges.length) d.persist();
    return { status: 200, body: { ...challengeDto(u, c, true), ...xpField(events.xp), ...growthField(events) } };
  }

  function joinChallenge(id, body) {
    const u = d.requireStudent();
    noBody(body);
    const c = visible(u, id);
    if (phaseOf(todayStr(), c.startsOn, c.endsOn) === 'ended') throw Errors.conflict('challenge_ended', 'Este desafio já terminou.');
    if (!db().challengeEnrollments.some((e) => e.userId === u.id && e.challengeId === c.id)) {
      db().challengeEnrollments.push({ userId: u.id, challengeId: c.id, joinedAt: d.stamp(), completedAt: null });
    }
    const events = evaluate(u);
    return { status: 200, body: { ...challengeDto(u, c, true), ...xpField(events.xp), ...growthField(events) } };
  }

  function leaveChallenge(id, body) {
    const u = d.requireStudent();
    noBody(body);
    const c = visible(u, id);
    const enrollment = db().challengeEnrollments.find((e) => e.userId === u.id && e.challengeId === c.id);
    if (enrollment?.completedAt) throw Errors.conflict('challenge_completed', 'Você já concluiu este desafio.');
    if (enrollment) {
      const ids = new Set(c.actions.map((a) => a.id));
      db().challengeProgress = db().challengeProgress.filter((p) => !(p.userId === u.id && ids.has(p.actionId)));
      db().challengeEnrollments = db().challengeEnrollments.filter((e) => e !== enrollment);
    }
    return { status: 200, body: challengeDto(u, c, true) };
  }

  function setManualDone(id, actionId, done) {
    const u = d.requireStudent();
    const c = visible(u, id);
    if (!d.UUID.test(actionId)) throw Errors.notFound('Ação não encontrada.');
    const action = c.actions.find((a) => a.id === actionId);
    if (!action) throw Errors.notFound('Ação não encontrada.');
    if (action.kind !== 'manual') throw Errors.conflict('action_automatic', 'Esta ação é calculada sozinha, a partir do que você registra no Hub.');
    const phase = phaseOf(todayStr(), c.startsOn, c.endsOn);
    const enrollment = db().challengeEnrollments.find((e) => e.userId === u.id && e.challengeId === c.id);
    if (!enrollment) throw Errors.conflict('not_enrolled', 'Participe do desafio para marcar as ações.');
    const exists = db().challengeProgress.some((p) => p.userId === u.id && p.actionId === actionId);
    if (enrollment.completedAt) {
      if (!(done && exists)) throw Errors.conflict('challenge_completed', 'Você já concluiu este desafio.');
      return { status: 200, body: challengeDto(u, c, true) };
    }
    if (phase === 'upcoming') throw Errors.conflict('challenge_not_started', 'Este desafio ainda não começou.');
    if (phase === 'ended') throw Errors.conflict('challenge_ended', 'Este desafio já terminou.');
    let xp = 0;
    let events = emptyResult();
    if (done) {
      if (!exists) {
        db().challengeProgress.push({ userId: u.id, actionId, doneAt: d.stamp(), source: 'manual' });
        if (action.xp > 0) xp += d.awardXp(u, 'challenge_action', `chal-action:${actionId}`, d.stamp(), action.xp);
      }
      events = evaluate(u);
    } else {
      db().challengeProgress = db().challengeProgress.filter((p) => !(p.userId === u.id && p.actionId === actionId));
    }
    return { status: 200, body: { ...challengeDto(u, c, true), ...xpField(xp + events.xp), ...growthField(events) } };
  }

  // ---------------------------------------------------------------- mentora: conquistas

  const adminOnly = () => d.requireAuth('admin');

  const text = (value, field, { max, label, required = true }, issues) => {
    if (typeof value !== 'string') return void (required ? issues.add(field, `Informe ${label}.`) : undefined);
    const s = value.trim();
    if (required && s === '') return void issues.add(field, `Informe ${label}.`);
    if ([...s].length > max) return void issues.add(field, `Texto longo demais (máximo ${max}).`);
    if (d.CONTROL_CHARS.test(s)) return void issues.add(field, 'O texto contém caracteres inválidos.');
    return s;
  };
  const description = (value, field, max, issues) => {
    if (typeof value !== 'string') return void issues.add(field, 'Descrição inválida.');
    const s = value.trim();
    if ([...s].length > max) return void issues.add(field, `Descrição longa demais (máximo ${max}).`);
    if (d.MULTILINE_CONTROL_CHARS.test(s)) return void issues.add(field, 'A descrição contém caracteres inválidos.');
    return s;
  };
  const wholeInt = (value, field, [min, max], messages, issues) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return void issues.add(field, messages.required);
    if (!Number.isInteger(value)) return void issues.add(field, messages.whole);
    if (value < min) return void issues.add(field, messages.min);
    if (value > max) return void issues.add(field, messages.max);
    return value;
  };

  function checkRuleValue(kind, value, issues) {
    const rule = RULES[kind];
    if (typeof value !== 'number' || !Number.isFinite(value)) return void issues.add('ruleValue', 'Informe o valor da regra.');
    if (kind === 'challenge_award') return value === 1 ? value : void issues.add('ruleValue', 'Esta regra não usa valor.');
    if (!rule.decimals && !Number.isInteger(value)) return void issues.add('ruleValue', 'Informe um número inteiro.');
    if (rule.decimals && Math.round(value * 100) / 100 !== value) return void issues.add('ruleValue', 'Use no máximo duas casas decimais.');
    if (value <= 0) return void issues.add('ruleValue', 'O valor precisa ser maior que zero.');
    if (value > rule.max) return void issues.add('ruleValue', `O valor máximo para esta regra é ${rule.max.toLocaleString('pt-BR')}.`);
    return value;
  }

  // Privacidade (A1), igual ao servidor: regras medidas pelo CRM da aluna só mostram contagem agregada (0 ou 3+), sem nomes.
  const CRM_RULES = ['revenue_won_total', 'deals_won_count', 'people_count', 'leads_converted_count', 'tasks_done_count'];
  const isCrmRule = (kind) => CRM_RULES.includes(kind);
  const maskedCount = (n) => (n === 0 || n >= 3 ? n : null);
  const REVENUE_RULE_MESSAGE = 'Conquistas por valor em R$ não podem ser criadas nem editadas: a mentora não vê o faturamento da aluna e a regra revelaria o valor dela.';
  const options = () => ({
    ruleKinds: RULE_KINDS.filter((kind) => kind !== 'revenue_won_total').map((kind) => ({ kind, label: RULES[kind].label, unit: RULES[kind].unit, decimals: RULES[kind].decimals, max: RULES[kind].max })),
    categories: ACHIEVEMENT_CATEGORIES.map((key) => ({ key, label: CATEGORY_LABELS[key] })),
  });

  const studentsOf = () => db().users.filter((x) => x.role === 'user');
  const unlockCount = (a) => db().achievementUnlocks.filter((x) => x.achievementId === a.id).length;
  const mentoraAchievementDto = (a) => ({
    id: a.id, title: a.title, description: a.description, category: a.category, categoryLabel: CATEGORY_LABELS[a.category], ruleKind: a.ruleKind,
    ruleLabel: RULES[a.ruleKind].label, ruleValue: a.ruleValue, criteria: describeRule(a.ruleKind, a.ruleValue), xpReward: a.xpReward, active: a.active,
    version: a.version, unlockCount: isCrmRule(a.ruleKind) ? maskedCount(unlockCount(a)) : unlockCount(a),
    privateRule: isCrmRule(a.ruleKind), locked: a.ruleKind === 'revenue_won_total',
  });
  const ownedAchievement = (m, id) => {
    if (!d.UUID.test(id)) throw Errors.notFound('Conquista não encontrada.');
    const a = db().achievements.find((x) => x.id === id && x.mentoraId === m.id && !x.archivedAt);
    if (!a) throw Errors.notFound('Conquista não encontrada.');
    return a;
  };

  function mentoraListAchievements(searchParams) {
    const m = adminOnly();
    noQuery(searchParams);
    seedDefaults(m.id);
    const rows = db().achievements.filter((a) => a.mentoraId === m.id && !a.archivedAt);
    return {
      status: 200,
      body: { total: rows.length, unlockTotal: rows.reduce((n, a) => n + ((isCrmRule(a.ruleKind) ? maskedCount(unlockCount(a)) : unlockCount(a)) ?? 0), 0), students: studentsOf().filter((s) => s.active && !s.manuallyBlocked).length, data: rows.map(mentoraAchievementDto), options: options() },
    };
  }

  function mentoraGetAchievement(id, searchParams) {
    const m = adminOnly();
    noQuery(searchParams);
    const a = ownedAchievement(m, id);
    const unlockedBy = isCrmRule(a.ruleKind) ? [] : db().achievementUnlocks
      .filter((x) => x.achievementId === a.id)
      .sort((x, y) => y.unlockedAt.localeCompare(x.unlockedAt))
      .map((x) => {
        const s = db().users.find((u) => u.id === x.userId);
        return { id: s.id, name: s.name, className: s.className, unlockedAt: x.unlockedAt };
      });
    return { status: 200, body: { ...mentoraAchievementDto(a), students: studentsOf().filter((s) => s.active && !s.manuallyBlocked).length, unlockedBy } };
  }

  function readAchievementFields(b, issues, { partial }) {
    const out = {};
    const has = (k) => Object.hasOwn(b, k);
    if (!partial || has('title')) out.title = text(b.title, 'title', { max: 60, label: 'o nome da conquista' }, issues);
    if (!partial || has('description')) out.description = has('description') ? description(b.description, 'description', 200, issues) : '';
    if (!partial || has('category')) out.category = ACHIEVEMENT_CATEGORIES.includes(b.category) ? b.category : void issues.add('category', 'Categoria inválida.');
    if (!partial || has('ruleKind')) out.ruleKind = RULE_KINDS.includes(b.ruleKind) ? b.ruleKind : void issues.add('ruleKind', 'Regra inválida.');
    if (has('xpReward') || !partial) {
      const xp = has('xpReward') ? b.xpReward : 0;
      out.xpReward = wholeInt(xp, 'xpReward', [0, 500], { required: 'Informe o XP.', whole: 'O XP precisa ser um número inteiro.', min: 'O XP não pode ser negativo.', max: 'O XP máximo é 500.' }, issues);
    }
    if (has('active') || !partial) {
      if (has('active') && typeof b.active !== 'boolean') issues.add('active', 'Valor inválido.');
      else out.active = has('active') ? b.active : true;
    }
    if (has('ruleValue') || !partial) out.ruleValue = has('ruleValue') ? b.ruleValue : 1;
    return out;
  }

  function mentoraCreateAchievement(body) {
    const m = adminOnly();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['title', 'description', 'category', 'ruleKind', 'ruleValue', 'xpReward', 'active'], issues);
    const f = readAchievementFields(b, issues, { partial: false });
    if (f.ruleKind === 'revenue_won_total') issues.add('ruleKind', REVENUE_RULE_MESSAGE);
    if (f.ruleKind) f.ruleValue = checkRuleValue(f.ruleKind, f.ruleValue, issues);
    issues.throwIfAny();
    const row = { id: d.newId(), mentoraId: m.id, seedKey: null, ...f, archivedAt: null, version: 1, createdAt: d.stamp() };
    db().achievements.push(row);
    return { status: 201, body: mentoraAchievementDto(row) };
  }

  function mentoraPatchAchievement(id, body) {
    const m = adminOnly();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['title', 'description', 'category', 'ruleKind', 'ruleValue', 'xpReward', 'active', 'version'], issues);
    const version = readVersion(b.version, issues);
    const f = readAchievementFields(b, issues, { partial: true });
    issues.throwIfAny();
    const a = ownedAchievement(m, id);
    if (a.ruleKind === 'revenue_won_total') {
      if ((f.ruleKind !== undefined && f.ruleKind !== a.ruleKind) || (f.ruleValue !== undefined && f.ruleValue !== a.ruleValue) || (f.xpReward !== undefined && f.xpReward !== a.xpReward)) {
        throw Errors.validation([{ field: 'ruleKind', message: REVENUE_RULE_MESSAGE }]);
      }
    } else if (f.ruleKind === 'revenue_won_total') {
      throw Errors.validation([{ field: 'ruleKind', message: REVENUE_RULE_MESSAGE }]);
    }
    if (f.ruleKind !== undefined && isCrmRule(a.ruleKind) && !isCrmRule(f.ruleKind) && unlockCount(a) > 0) {
      throw Errors.conflict('achievement_locked', 'Esta conquista já foi desbloqueada: crie uma nova conquista em vez de trocar o critério.');
    }
    if (f.ruleKind !== undefined || f.ruleValue !== undefined) {
      const kind = f.ruleKind ?? a.ruleKind;
      const value = f.ruleValue ?? (f.ruleKind === 'challenge_award' ? 1 : a.ruleValue);
      const second = createIssues();
      checkRuleValue(kind, value, second);
      second.throwIfAny();
      f.ruleKind = kind;
      f.ruleValue = value;
    }
    if (a.version !== version) throw Errors.conflict('version_conflict', VERSION_CONFLICT);
    Object.assign(a, Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)), { version: a.version + 1 });
    return { status: 200, body: mentoraAchievementDto(a) };
  }

  function mentoraArchiveAchievement(id) {
    const m = adminOnly();
    const a = ownedAchievement(m, id);
    Object.assign(a, { active: false, archivedAt: d.stamp(), version: a.version + 1 });
    return { status: 204 };
  }

  // ---------------------------------------------------------------- mentora: desafios

  const classNamesOf = () => [...new Set(studentsOf().map((s) => s.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const enrollmentsOf = (c) => db().challengeEnrollments.filter((e) => e.challengeId === c.id);
  // Só as ações marcadas pela aluna entram no andamento visto pela mentora (as automáticas medem o CRM dela).
  const manualOf = (c) => c.actions.filter((a) => a.kind === 'manual');
  const hasAuto = (c) => c.actions.some((a) => a.kind !== 'manual');
  const doneOf = (userId, c) => db().challengeProgress.filter((p) => p.userId === userId && manualOf(c).some((a) => a.id === p.actionId)).length;
  const achievementTitleOf = (c) => (c.achievementId ? (db().achievements.find((a) => a.id === c.achievementId)?.title ?? 'Conquista') : null);

  function mentoraChallengeBase(c) {
    return {
      id: c.id, title: c.title, description: c.description, status: c.status, phase: c.status === 'published' ? phaseOf(todayStr(), c.startsOn, c.endsOn) : null,
      startsOn: c.startsOn, endsOn: c.endsOn, durationDays: c.durationDays, rewardXp: c.rewardXp, classNames: c.classNames,
      achievement: c.achievementId ? { id: c.achievementId, title: achievementTitleOf(c) } : null, version: c.version,
    };
  }

  function metricsOf(c) {
    const enrollments = enrollmentsOf(c);
    const doneTotal = enrollments.reduce((n, e) => n + doneOf(e.userId, c), 0);
    return {
      participants: enrollments.length,
      completed: hasAuto(c) ? maskedCount(enrollments.filter((e) => e.completedAt).length) : enrollments.filter((e) => e.completedAt).length,
      avgPct: enrollments.length && manualOf(c).length ? completionPct(doneTotal, enrollments.length * manualOf(c).length) : null,
    };
  }

  function ownedChallenge(m, id) {
    if (!d.UUID.test(id)) throw Errors.notFound('Desafio não encontrado.');
    const c = db().challenges.find((x) => x.id === id && x.mentoraId === m.id);
    if (!c) throw Errors.notFound('Desafio não encontrado.');
    return c;
  }

  function mentoraDetail(c) {
    const enrollments = enrollmentsOf(c);
    const participants = enrollments
      .map((e) => {
        const s = db().users.find((u) => u.id === e.userId);
        const done = doneOf(e.userId, c);
        return { id: s.id, name: s.name, className: s.className, joinedAt: e.joinedAt, completedAt: hasAuto(c) ? null : e.completedAt, done, total: manualOf(c).length, pct: completionPct(done, manualOf(c).length) };
      })
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.name.localeCompare(b.name, 'pt-BR'));
    return {
      ...mentoraChallengeBase(c),
      actions: c.actions.map((a) => ({ id: a.id, title: a.title, xp: a.xp, position: a.position, kind: a.kind, target: a.target })),
      hasAutoActions: hasAuto(c),
      metrics: metricsOf(c),
      participants,
    };
  }

  function mentoraListChallenges(searchParams) {
    const m = adminOnly();
    noQuery(searchParams);
    const rows = db().challenges
      .filter((c) => c.mentoraId === m.id)
      .sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived') || b.startsOn.localeCompare(a.startsOn) || b.createdAt.localeCompare(a.createdAt));
    return {
      status: 200,
      body: { total: rows.length, classes: classNamesOf(), data: rows.map((c) => ({ ...mentoraChallengeBase(c), actionsCount: c.actions.length, hasAutoActions: hasAuto(c), ...(({ participants, completed, avgPct }) => ({ participants, completed, avgPct }))(metricsOf(c)) })), options: options() },
    };
  }

  function mentoraGetChallenge(id, searchParams) {
    const m = adminOnly();
    noQuery(searchParams);
    return { status: 200, body: mentoraDetail(ownedChallenge(m, id)) };
  }

  function readActions(value, issues) {
    if (!Array.isArray(value)) return void issues.add('actions', 'Ações inválidas.');
    if (value.length > 30) return void issues.add('actions', 'No máximo 30 ações.');
    const out = [];
    value.forEach((raw, index) => {
      const at = (f) => `actions.${index}.${f}`;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return void issues.add(`actions.${index}`, 'Ação inválida.');
      for (const key of Object.keys(raw)) if (!['id', 'title', 'xp', 'kind', 'target'].includes(key)) issues.add(`actions.${index}`, `Campo não permitido: ${key}.`);
      if (raw.id !== undefined && !(typeof raw.id === 'string' && d.UUID.test(raw.id))) issues.add(at('id'), 'Identificador inválido.');
      const title = text(raw.title, at('title'), { max: 120, label: 'o texto da ação' }, issues);
      const xp = wholeInt(raw.xp ?? 0, at('xp'), [0, 200], { required: 'Informe o XP da ação.', whole: 'O XP precisa ser um número inteiro.', min: 'O XP não pode ser negativo.', max: 'O XP máximo por ação é 200.' }, issues);
      const kind = raw.kind ?? 'manual';
      if (!ACTION_KINDS.includes(kind)) issues.add(at('kind'), 'Tipo de ação inválido.');
      const target = wholeInt(raw.target ?? 1, at('target'), [1, 1000], { required: 'Informe a quantidade.', whole: 'A quantidade precisa ser um número inteiro.', min: 'A quantidade mínima é 1.', max: 'A quantidade máxima é 1000.' }, issues);
      out.push({ id: raw.id, title, xp, kind, target: kind === 'manual' ? 1 : target });
    });
    return out;
  }

  function readClassNames(value, issues) {
    if (!Array.isArray(value)) return void issues.add('classNames', 'Turmas inválidas.');
    if (value.length > 20) return void issues.add('classNames', 'No máximo 20 turmas.');
    const seen = new Map();
    value.forEach((name, i) => {
      const s = text(name, `classNames.${i}`, { max: 80, label: 'a turma' }, issues);
      if (s && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
    });
    return [...seen.values()];
  }

  const readDay = (value, issues) => {
    if (typeof value !== 'string' || !ISO_DAY.test(value)) return void issues.add('startsOn', 'Informe a data de início.');
    if (new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > '2100-12-31') return void issues.add('startsOn', 'Informe uma data válida.');
    return value;
  };

  function assertAchievementOwned(m, id, issues) {
    if (id === null || id === undefined) return null;
    if (typeof id !== 'string' || !d.UUID.test(id)) return void issues.add('achievementId', 'Identificador inválido.');
    if (!db().achievements.some((a) => a.id === id && a.mentoraId === m.id && !a.archivedAt)) return void issues.add('achievementId', 'Escolha uma conquista da sua mentoria.');
    return id;
  }

  const DURATION = { required: 'Informe a duração.', whole: 'A duração precisa ser um número inteiro.', min: 'A duração mínima é 1 dia.', max: 'A duração máxima é 90 dias.' };
  const REWARD = { required: 'Informe a recompensa.', whole: 'O XP precisa ser um número inteiro.', min: 'O XP não pode ser negativo.', max: 'O XP máximo é 2000.' };

  function materializeActions(c, actions) {
    const previous = new Map(c.actions.map((a) => [a.id, a]));
    c.actions = actions.map((a, index) => ({ id: a.id && previous.has(a.id) ? a.id : d.newId(), title: a.title, xp: a.xp, position: index + 1, kind: a.kind, target: a.target }));
    const alive = new Set(c.actions.map((a) => a.id));
    db().challengeProgress = db().challengeProgress.filter((p) => !previous.has(p.actionId) || alive.has(p.actionId));
  }

  function mentoraCreateChallenge(body) {
    const m = adminOnly();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['title', 'description', 'durationDays', 'rewardXp', 'achievementId', 'startsOn', 'classNames', 'actions'], issues);
    const title = text(b.title, 'title', { max: 80, label: 'o nome do desafio' }, issues);
    const desc = Object.hasOwn(b, 'description') ? description(b.description, 'description', 500, issues) : '';
    const durationDays = wholeInt(b.durationDays, 'durationDays', [1, 90], DURATION, issues);
    const rewardXp = wholeInt(b.rewardXp ?? 0, 'rewardXp', [0, 2000], REWARD, issues);
    const startsOn = readDay(b.startsOn, issues);
    const classNames = Object.hasOwn(b, 'classNames') ? readClassNames(b.classNames, issues) : [];
    const actions = Object.hasOwn(b, 'actions') ? readActions(b.actions, issues) : [];
    const achievementId = assertAchievementOwned(m, b.achievementId ?? null, issues);
    issues.throwIfAny();
    const c = {
      id: d.newId(), mentoraId: m.id, title, description: desc, durationDays, rewardXp, achievementId, status: 'draft', startsOn, endsOn: endsOnFor(startsOn, durationDays),
      classNames, publishedAt: null, version: 1, createdAt: d.stamp(), actions: [],
    };
    db().challenges.push(c);
    materializeActions(c, actions);
    return { status: 201, body: mentoraDetail(c) };
  }

  function mentoraPatchChallenge(id, body) {
    const m = adminOnly();
    const b = requireBody(body);
    const issues = createIssues();
    onlyKeys(b, ['title', 'description', 'durationDays', 'rewardXp', 'achievementId', 'startsOn', 'classNames', 'actions', 'version'], issues);
    const version = readVersion(b.version, issues);
    const has = (k) => Object.hasOwn(b, k);
    const patch = {};
    if (has('title')) patch.title = text(b.title, 'title', { max: 80, label: 'o nome do desafio' }, issues);
    if (has('description')) patch.description = description(b.description, 'description', 500, issues);
    if (has('durationDays')) patch.durationDays = wholeInt(b.durationDays, 'durationDays', [1, 90], DURATION, issues);
    if (has('rewardXp')) patch.rewardXp = wholeInt(b.rewardXp, 'rewardXp', [0, 2000], REWARD, issues);
    if (has('startsOn')) patch.startsOn = readDay(b.startsOn, issues);
    if (has('classNames')) patch.classNames = readClassNames(b.classNames, issues);
    if (has('achievementId')) patch.achievementId = assertAchievementOwned(m, b.achievementId, issues);
    const actions = has('actions') ? readActions(b.actions, issues) : undefined;
    issues.throwIfAny();
    const c = ownedChallenge(m, id);
    const structural = ['durationDays', 'rewardXp', 'achievementId', 'startsOn', 'classNames', 'actions'];
    if (c.status !== 'draft' && structural.some((k) => has(k))) {
      throw Errors.conflict('challenge_locked', 'Depois de publicado, só o nome e a descrição podem mudar. Arquive e crie outro desafio para mudar as ações.');
    }
    if (c.version !== version) throw Errors.conflict('version_conflict', VERSION_CONFLICT);
    Object.assign(c, patch);
    if (patch.startsOn !== undefined || patch.durationDays !== undefined) c.endsOn = endsOnFor(c.startsOn, c.durationDays);
    if (actions !== undefined) materializeActions(c, actions);
    c.version += 1;
    return { status: 200, body: mentoraDetail(c) };
  }

  function mentoraPublishChallenge(id, body) {
    const m = adminOnly();
    noBody(body);
    const c = ownedChallenge(m, id);
    if (c.status === 'archived') throw Errors.conflict('challenge_archived', 'Este desafio foi arquivado e não pode ser publicado.');
    if (c.status === 'published') return { status: 200, body: mentoraDetail(c) };
    if (c.actions.length === 0) {
      const message = 'Adicione pelo menos uma ação antes de publicar.';
      throw Errors.conflict('challenge_incomplete', message, [{ field: 'actions', message }]);
    }
    if (todayStr() > c.endsOn) {
      const message = 'O período deste desafio já terminou. Ajuste a data de início.';
      throw Errors.conflict('challenge_ended', message, [{ field: 'startsOn', message }]);
    }
    c.status = 'published';
    c.publishedAt = c.publishedAt ?? d.stamp();
    c.version += 1;
    const body2 = c.rewardXp > 0 ? `${c.durationDays} ${c.durationDays === 1 ? 'dia' : 'dias'} · +${c.rewardXp} XP ao concluir.` : `${c.durationDays} ${c.durationDays === 1 ? 'dia' : 'dias'} de ações para a sua evolução.`;
    for (const s of studentsOf()) {
      if (!s.active || s.manuallyBlocked || !isEligible(c.classNames, s.className)) continue;
      d.addNotification(s, { kind: 'challenge_published', title: `Novo desafio: ${c.title}`, body: body2, link: `#/desafios/${c.id}`, dedupeKey: `chal-pub:${c.id}`, createdAt: d.stamp() });
    }
    return { status: 200, body: mentoraDetail(c) };
  }

  function mentoraArchiveChallenge(id, body) {
    const m = adminOnly();
    noBody(body);
    const c = ownedChallenge(m, id);
    c.status = 'archived';
    c.version += 1;
    return { status: 200, body: mentoraDetail(c) };
  }

  function mentoraRemoveChallenge(id) {
    const m = adminOnly();
    const c = ownedChallenge(m, id);
    if (c.status === 'draft') {
      db().challenges = db().challenges.filter((x) => x !== c);
    } else if (c.status === 'published') {
      c.status = 'archived';
      c.version += 1;
    }
    return { status: 204 };
  }

  // ---------------------------------------------------------------- tabela de rotas e gancho pós-ação

  const SEG = '([^/]+)';
  const routes = [
    ['GET', /^achievements$/, (_m, q) => listAchievements(q)],
    ['GET', /^achievements\/recent$/, (_m, q) => recentAchievements(q)],
    ['GET', /^challenges$/, (_m, q) => listChallenges(q)],
    ['GET', new RegExp(`^challenges/${SEG}$`), (m, q) => getChallenge(m[1], q)],
    ['POST', new RegExp(`^challenges/${SEG}/join$`), (m, _q, body) => joinChallenge(m[1], body)],
    ['POST', new RegExp(`^challenges/${SEG}/leave$`), (m, _q, body) => leaveChallenge(m[1], body)],
    ['POST', new RegExp(`^challenges/${SEG}/actions/${SEG}/done$`), (m) => setManualDone(m[1], m[2], true)],
    ['DELETE', new RegExp(`^challenges/${SEG}/actions/${SEG}/done$`), (m) => setManualDone(m[1], m[2], false)],

    ['GET', /^mentora\/achievements$/, (_m, q) => mentoraListAchievements(q)],
    ['POST', /^mentora\/achievements$/, (_m, _q, body) => mentoraCreateAchievement(body)],
    ['GET', new RegExp(`^mentora/achievements/${SEG}$`), (m, q) => mentoraGetAchievement(m[1], q)],
    ['PATCH', new RegExp(`^mentora/achievements/${SEG}$`), (m, _q, body) => mentoraPatchAchievement(m[1], body)],
    ['DELETE', new RegExp(`^mentora/achievements/${SEG}$`), (m) => mentoraArchiveAchievement(m[1])],
    ['GET', /^mentora\/challenges$/, (_m, q) => mentoraListChallenges(q)],
    ['POST', /^mentora\/challenges$/, (_m, _q, body) => mentoraCreateChallenge(body)],
    ['GET', new RegExp(`^mentora/challenges/${SEG}$`), (m, q) => mentoraGetChallenge(m[1], q)],
    ['PATCH', new RegExp(`^mentora/challenges/${SEG}$`), (m, _q, body) => mentoraPatchChallenge(m[1], body)],
    ['POST', new RegExp(`^mentora/challenges/${SEG}/publish$`), (m, _q, body) => mentoraPublishChallenge(m[1], body)],
    ['POST', new RegExp(`^mentora/challenges/${SEG}/archive$`), (m, _q, body) => mentoraArchiveChallenge(m[1], body)],
    ['DELETE', new RegExp(`^mentora/challenges/${SEG}$`), (m) => mentoraRemoveChallenge(m[1])],
  ];

  const WATCHED = /^(tasks|deals|people|goals)(\/|$)/;
  const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

  /** Como o gancho do servidor: depois de uma ação do CRM da aluna, avalia e acrescenta o campo `growth` à resposta. */
  function afterAction(verb, path, result, student) {
    if (!student || !MUTATING.has(verb) || !WATCHED.test(path)) return result;
    if (!result || result.status < 200 || result.status >= 300 || !result.body || typeof result.body !== 'object' || Array.isArray(result.body)) return result;
    const events = evaluate(student);
    if (!events.achievements.length && !events.challenges.length) return result;
    return { ...result, body: { ...result.body, ...growthField(events) } };
  }

  return { routes, afterAction, HttpError };
}
