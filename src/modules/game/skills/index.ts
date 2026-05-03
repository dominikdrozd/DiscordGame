import type { BattleCombatant, BattleState } from '../engine/battle-state.js';
import type { Combatant } from '../engine/combat.js';
import type { PrimaryStats } from '../services/player-stats.js';

export type SkillTargeting = 'self' | 'ally' | 'enemy' | 'allEnemies' | 'allAllies';
export type SkillStatScaling = Partial<Record<keyof PrimaryStats, number>>;

export interface SkillRequirements {
  /** Wymagany combat skill level. */
  level: number;
  /** Koszt nauki w złocie (jednorazowo). */
  gold: number;
  /** Minimalne primary atrybuty żeby się nauczyć (opcjonalne). */
  primary?: Partial<PrimaryStats>;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  targeting: SkillTargeting;
  /**
   * Klasy/subklasy które mają dostęp do tego skilla (mogą go uczyć).
   * Pomijane gdy `universal === true` — wtedy wszyscy mogą używać.
   */
  classes: string[];
  /** Skalowanie dmg/heal/shield z primary stats castera. */
  scaling?: SkillStatScaling;
  /** Wymagania do nauki (gold + combat lvl + min primary). */
  requirements?: SkillRequirements;
  /**
   * Super spell — dostępny dla każdej klasy, zdobywany TYLKO przez drop
   * księgi z bossa (nie da się go wyuczyć przez `/skills learn`).
   */
  universal?: boolean;
  apply(state: BattleState, caster: BattleCombatant, targets: BattleCombatant[]): string;
}

const PRIMARY_KEYS: readonly (keyof PrimaryStats)[] = ['str', 'agi', 'wit', 'int'] as const;

/**
 * Bonus do skill damage/heal/shield z primary stats castera.
 * Każdy `scaling.<stat>` mnoży primary[stat]. Floor na końcu — czyste UI.
 */
export function scaledBonus(caster: Combatant, scaling?: SkillStatScaling): number {
  if (!scaling) return 0;
  const p = caster.primary ?? { str: 0, agi: 0, wit: 0, int: 0 };
  let sum = 0;
  for (const k of PRIMARY_KEYS) {
    const m = scaling[k];
    if (m) sum += p[k] * m;
  }
  return Math.floor(sum);
}

/** Renderer skalowania dla opisu spella, np. "+0.8 INT, +0.3 STR". */
export function formatScaling(scaling?: SkillStatScaling): string {
  if (!scaling) return '';
  const parts: string[] = [];
  for (const k of PRIMARY_KEYS) {
    const m = scaling[k];
    if (m) parts.push(`+${m}×${k.toUpperCase()}`);
  }
  return parts.length ? parts.join(', ') : '';
}

/** Renderer wymagań nauki, np. "lvl 4 · 50g · STR 8". */
export function formatRequirements(req?: SkillRequirements): string {
  if (!req) return '—';
  const parts: string[] = [`lvl ${req.level}`, `${req.gold}g`];
  if (req.primary) {
    for (const k of PRIMARY_KEYS) {
      const v = req.primary[k];
      if (v) parts.push(`${k.toUpperCase()} ${v}`);
    }
  }
  return parts.join(' · ');
}

import { WARRIOR_SKILLS } from './warrior/index.js';
import { ROGUE_SKILLS } from './rogue/index.js';
import { MAGE_SKILLS } from './mage/index.js';
import { DRUID_SKILLS } from './druid/index.js';
import { CLERIC_SKILLS } from './cleric/index.js';
// Super spelle — universal, drop tylko z bossów (księgi, 2% chance).
import { blood_vortex } from './blood-vortex.skill.js';
import { curse_echo } from './curse-echo.skill.js';
import { time_shield } from './time-shield.skill.js';
import { dark_power } from './dark-power.skill.js';
import { shadow_veil } from './shadow-veil.skill.js';
import { fire_tornado } from './fire-tornado.skill.js';
import { second_wind } from './second-wind.skill.js';
import { mana_burst } from './mana-burst.skill.js';
import { ice_sarcophagus } from './ice-sarcophagus.skill.js';
import { saviors_grace } from './saviors-grace.skill.js';

export const SUPER_SKILLS: Record<string, Skill> = {
  [blood_vortex.id]: blood_vortex,
  [curse_echo.id]: curse_echo,
  [time_shield.id]: time_shield,
  [dark_power.id]: dark_power,
  [shadow_veil.id]: shadow_veil,
  [fire_tornado.id]: fire_tornado,
  [second_wind.id]: second_wind,
  [mana_burst.id]: mana_burst,
  [ice_sarcophagus.id]: ice_sarcophagus,
  [saviors_grace.id]: saviors_grace,
};

export const SKILLS: Record<string, Skill> = {
  ...WARRIOR_SKILLS,
  ...ROGUE_SKILLS,
  ...MAGE_SKILLS,
  ...DRUID_SKILLS,
  ...CLERIC_SKILLS,
  ...SUPER_SKILLS,
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

/** Wszystkie skille dostępne dla danej klasy/subklasy (po `classes` filter). */
export function skillsForClass(classId: string): Skill[] {
  return Object.values(SKILLS).filter((s) => !s.universal && s.classes.includes(classId));
}

/** Lista uniwersalnych super-spelli (drop tylko z bossów). */
export function listSuperSkills(): Skill[] {
  return Object.values(SUPER_SKILLS);
}
