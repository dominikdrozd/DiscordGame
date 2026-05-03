import { applyAttack, applyDefend, applyItem, applyPotion } from './combat.js';
import {
  type BattleAction,
  type BattleCombatant,
  type BattleState,
  aliveAllies,
  aliveEnemies,
  checkFinish,
  findCombatant,
} from './battle-state.js';
import { applyBuffsAtRoundEnd, decrementCooldowns, getSlowAmount } from './buffs.js';
import { getSkill, setCooldown } from '../skills/index.js';

export interface BattleRoundResult {
  lines: string[];
  finished: boolean;
  winnerTeam?: number;
  draw?: boolean;
}

function resolveSkillTargets(
  state: BattleState,
  caster: BattleCombatant,
  action: BattleAction,
): BattleCombatant[] {
  const skill = action.skillId ? getSkill(action.skillId) : undefined;
  if (!skill) return [];
  const explicit = action.targetId ? findCombatant(state, action.targetId) : undefined;
  switch (skill.targeting) {
    case 'self':
      return [caster];
    case 'ally':
      return explicit && explicit.team === caster.team && explicit.hp > 0
        ? [explicit]
        : aliveAllies(state, caster).slice(0, 1);
    case 'enemy':
      return explicit && explicit.team !== caster.team && explicit.hp > 0
        ? [explicit]
        : aliveEnemies(state, caster).slice(0, 1);
    case 'allEnemies':
      return aliveEnemies(state, caster);
    case 'allAllies':
      return aliveAllies(state, caster);
  }
}

/**
 * Kolejność akcji w fazach skill/item/attack — sortowana po `speed` desc.
 * Tie-break: stable order (oryginalny index), żeby testy były deterministyczne.
 *
 * Defend (faza 1) i end-of-round buffy (faza 5) są order-independent —
 * defend tylko ustawia flagę, buffy aplikują DoT/HoT do każdego osobno.
 */
function effectiveBattleSpeed(c: BattleCombatant): number {
  return (c.speed ?? 0) - getSlowAmount(c);
}

function bySpeed(state: BattleState): BattleCombatant[] {
  return [...state.combatants]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const sa = effectiveBattleSpeed(a.c);
      const sb = effectiveBattleSpeed(b.c);
      if (sb !== sa) return sb - sa;
      return a.i - b.i;
    })
    .map((x) => x.c);
}

export function resolveBattleRound(state: BattleState): BattleRoundResult {
  const lines: string[] = [];

  // 1. defends — order-independent, iteruj zwykle
  for (const c of state.combatants) {
    if (c.hp <= 0) continue;
    const action = state.pending.get(c.id);
    if (action?.kind === 'defend') {
      lines.push(applyDefend(c));
    } else {
      c.defending = false;
    }
  }

  const initiative = bySpeed(state);

  // 2. heal/buff skille (targeting ally/self/allAllies)
  for (const c of initiative) {
    if (c.hp <= 0) continue;
    const action = state.pending.get(c.id);
    if (action?.kind !== 'skill' || !action.skillId) continue;
    const skill = getSkill(action.skillId);
    if (!skill) continue;
    if (!['ally', 'self', 'allAllies'].includes(skill.targeting)) continue;
    const targets = resolveSkillTargets(state, c, action);
    lines.push(skill.apply(state, c, targets));
    setCooldown(c, skill.id, skill.cooldown);
  }

  // 3. items / consumables — speed order
  for (const c of initiative) {
    if (c.hp <= 0) continue;
    const action = state.pending.get(c.id);
    if (action?.kind !== 'item') continue;
    if (action.itemId) lines.push(applyItem(c, action.itemId));
    else lines.push(applyPotion(c));
  }

  // 4. attacks + damage skille (targeting enemy/allEnemies) — speed order
  for (const c of initiative) {
    if (c.hp <= 0) continue;
    const action = state.pending.get(c.id);
    if (!action) continue;

    if (action.kind === 'skill' && action.skillId) {
      const skill = getSkill(action.skillId);
      if (!skill) continue;
      if (!['enemy', 'allEnemies'].includes(skill.targeting)) continue;
      const targets = resolveSkillTargets(state, c, action);
      lines.push(skill.apply(state, c, targets));
      setCooldown(c, skill.id, skill.cooldown);
      continue;
    }

    if (action.kind === 'attack') {
      let target: BattleCombatant | undefined;
      if (action.targetId) target = findCombatant(state, action.targetId);
      if (!target || target.hp <= 0) {
        const fallback = aliveEnemies(state, c);
        if (fallback.length > 0) target = fallback[0];
      }
      if (!target) continue;
      lines.push(applyAttack(c, target));
    }
  }

  // 5. end-of-round buffy (DoT/HoT + dekrement TTL)
  for (const c of state.combatants) {
    if (c.hp <= 0) continue;
    lines.push(...applyBuffsAtRoundEnd(c));
  }

  // cleanup
  for (const c of state.combatants) {
    c.defending = false;
    decrementCooldowns(c);
  }
  state.pending.clear();
  state.roundNumber += 1;

  const fin = checkFinish(state);
  if (fin.finished) {
    state.finished = true;
    state.winnerTeam = fin.winnerTeam;
    state.draw = fin.draw;
  }
  return { lines, ...fin };
}
