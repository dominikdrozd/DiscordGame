import { Mob, type MobReward } from './mob.js';
import type { PrimaryStats } from '../services/player-stats.js';

export class KitchenRat extends Mob {
  readonly id = 'szczur_kuchenny';
  readonly name = 'Szczur Kuchenny Damian';
  readonly hp = 70;
  readonly damageBonus = 4;
  override readonly speed = 6;
  override readonly primary: PrimaryStats = { str: 4, agi: 3, wit: 0, int: 0 };
  readonly description = 'Wielki, tłusty, nakarmiony resztkami z Friteksu.';
  readonly attackLines = [
    'Ugryzienie Trującego Zęba',
    'Skok z Półki',
    'Pisk Wojenny',
    'Cios Tłustym Ogonem',
  ];
  readonly rewards: MobReward = {
    xp: 40,
    combatXp: 30,
    lootTable: [
      { itemId: 'ore_copper', weight: 60, qtyMin: 1, qtyMax: 2 },
      { itemId: 'wood_sosna', weight: 40, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 2,
    dropPool: [],
    guaranteedDropChance: 0,
    bookDrops: [
      { skillId: 'blood_vortex', chance: 0.02 },
      { skillId: 'shadow_veil', chance: 0.02 },
    ],
  };
}
