import type { Combatant } from '../engine/combat.js';
import type { LootEntry } from '../services/loot.js';

export interface MobReward {
  xp: number;
  combatXp?: number;
  lootTable?: LootEntry[];
  rolls?: number;
  dropPool?: string[];
  guaranteedDropChance?: number;
}

export type MobTier = 1 | 2 | 3 | 4 | 5;

/**
 * Mnożniki staty per tier — hp/damage skalują się tak samo.
 * Tier 1 to baza; każdy kolejny ~1.4× silniejszy.
 */
export const TIER_MULTIPLIERS: Record<MobTier, number> = {
  1: 1.0,
  2: 1.4,
  3: 2.0,
  4: 2.8,
  5: 4.0,
};

export abstract class Mob {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly hp: number;
  abstract readonly damageBonus: number;
  abstract readonly description: string;

  /** mutable — można podbić przed walką via setTier(t). default = 1 */
  tier: MobTier = 1;
  readonly defenseBonus?: number;
  readonly critBonus?: number;
  readonly potions: number = 0;
  readonly skills: readonly string[] = [];
  readonly attackLines?: readonly string[];
  readonly deathLine?: string;
  readonly rewards?: MobReward;

  setTier(tier: MobTier): this {
    this.tier = tier;
    return this;
  }

  toCombatant(suffix?: string): Combatant & { id: string } {
    const id = suffix ? `enemy:${this.id}:${suffix}` : `enemy:${this.id}`;
    const name = suffix ? `${this.name} #${suffix}` : this.name;
    const mult = TIER_MULTIPLIERS[this.tier];
    const hp = Math.round(this.hp * mult);
    const damageBonus = Math.round(this.damageBonus * mult);
    const defenseBonus =
      this.defenseBonus !== undefined ? Math.round(this.defenseBonus * mult) : undefined;
    return {
      id,
      name,
      hp,
      maxHp: hp,
      damageBonus,
      defenseBonus,
      critBonus: this.critBonus,
      defending: false,
      potionsLeft: this.potions,
      skills: this.skills.length ? [...this.skills] : undefined,
      skillCooldowns: this.skills.length ? {} : undefined,
      attackLines: this.attackLines ? [...this.attackLines] : undefined,
    };
  }
}
