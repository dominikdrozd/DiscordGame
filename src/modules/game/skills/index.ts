import type { BattleCombatant, BattleState } from '../engine/battle-state.js';

export type SkillTargeting = 'self' | 'ally' | 'enemy' | 'allEnemies' | 'allAllies';

export interface Skill {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  targeting: SkillTargeting;
  classes: string[];
  apply(state: BattleState, caster: BattleCombatant, targets: BattleCombatant[]): string;
}

import { WARRIOR_SKILLS } from './warrior.skills.js';
import { ROGUE_SKILLS } from './rogue.skills.js';
import { MAGE_SKILLS } from './mage.skills.js';
import { DRUID_SKILLS } from './druid.skills.js';
import { CLERIC_SKILLS } from './cleric.skills.js';

export const SKILLS: Record<string, Skill> = {
  ...WARRIOR_SKILLS,
  ...ROGUE_SKILLS,
  ...MAGE_SKILLS,
  ...DRUID_SKILLS,
  ...CLERIC_SKILLS,
};

export function getSkill(id: string): Skill | undefined {
  return SKILLS[id];
}

export function listAvailableSkills(c: BattleCombatant): Skill[] {
  const ids = c.skills ?? [];
  return ids.map((id) => SKILLS[id]).filter((s): s is Skill => !!s);
}

export function isOnCooldown(c: BattleCombatant, skillId: string): boolean {
  return (c.skillCooldowns?.[skillId] ?? 0) > 0;
}

export function setCooldown(c: BattleCombatant, skillId: string, turns: number): void {
  if (!c.skillCooldowns) c.skillCooldowns = {};
  c.skillCooldowns[skillId] = turns;
}
