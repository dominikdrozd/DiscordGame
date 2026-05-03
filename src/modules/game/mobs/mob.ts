import type { Combatant } from '../engine/combat.js';
import type { LootEntry } from '../services/loot.js';
import type { PrimaryStats } from '../services/player-stats.js';

export interface BookDrop {
  /** ID super-spella w SKILLS rejestrze. */
  skillId: string;
  /** Szansa na drop księgi (0-1). */
  chance: number;
}

export interface MobReward {
  xp: number;
  combatXp?: number;
  lootTable?: LootEntry[];
  rolls?: number;
  dropPool?: string[];
  guaranteedDropChance?: number;
  /**
   * Księgi super-spelli — każda rolowana niezależnie. Auto-grant do
   * `learnedSkills` przy dropie (gracz nie musi nic robić).
   */
  bookDrops?: BookDrop[];
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
  /** Inicjatywa moba — wyższy = atakuje przed graczem o niższym speed. */
  readonly speed?: number;
  /**
   * Atrybuty primary moba — domyślnie zera. INT napędza spellPower (×2),
   * pozostałe wchodzą w skill scaling przez `caster.primary` w skillach.
   * Skalują się z TIER_MULTIPLIERS razem z hp/dmg.
   */
  readonly primary?: PrimaryStats;
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
    const primary: PrimaryStats = {
      str: Math.round((this.primary?.str ?? 0) * mult),
      agi: Math.round((this.primary?.agi ?? 0) * mult),
      wit: Math.round((this.primary?.wit ?? 0) * mult),
      int: Math.round((this.primary?.int ?? 0) * mult),
    };
    return {
      id,
      name,
      hp,
      maxHp: hp,
      damageBonus,
      defenseBonus,
      critBonus: this.critBonus,
      speed: this.speed,
      primary,
      spellPower: primary.int * 2,
      defending: false,
      potionsLeft: this.potions,
      skills: this.skills.length ? [...this.skills] : undefined,
      skillCooldowns: this.skills.length ? {} : undefined,
      attackLines: this.attackLines ? [...this.attackLines] : undefined,
    };
  }
}
