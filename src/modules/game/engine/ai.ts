import {
  type BattleAction,
  type BattleCombatant,
  type BattleState,
  aliveAllies,
  aliveEnemies,
} from './battle-state.js';
import { getSkill, isOnCooldown } from '../skills/index.js';

export function chooseAiAction(state: BattleState, c: BattleCombatant): BattleAction {
  const enemies = aliveEnemies(state, c);
  if (enemies.length === 0) return { kind: 'defend' };

  const hpRatio = c.hp / c.maxHp;
  if (hpRatio < 0.3 && c.potionsLeft > 0 && Math.random() < 0.6) {
    return { kind: 'item' };
  }

  const skillIds = (c.skills ?? []).filter((id) => !isOnCooldown(c, id) && !!getSkill(id));
  if (skillIds.length > 0 && Math.random() < 0.4) {
    const skillId = skillIds[Math.floor(Math.random() * skillIds.length)];
    const skill = getSkill(skillId)!;
    let targetId: string | undefined;
    if (skill.targeting === 'enemy') {
      targetId = pickTarget(enemies).id;
    } else if (skill.targeting === 'ally') {
      const allies = aliveAllies(state, c);
      const wounded = allies.filter((a) => a.hp < a.maxHp);
      targetId = (wounded[0] ?? allies[0] ?? c).id;
    } else if (skill.targeting === 'self') {
      targetId = c.id;
    }
    return { kind: 'skill', skillId, targetId };
  }

  if (Math.random() < 0.2) {
    return { kind: 'defend' };
  }
  const target = pickTarget(enemies);
  return { kind: 'attack', targetId: target.id };
}

export function pickTarget(enemies: BattleCombatant[]): BattleCombatant {
  const total = enemies.reduce((s, e) => s + 1 + (e.threatBias ?? 0), 0);
  let r = Math.random() * total;
  for (const e of enemies) {
    r -= 1 + (e.threatBias ?? 0);
    if (r <= 0) return e;
  }
  return enemies[0];
}
