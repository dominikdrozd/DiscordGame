import { Mob, type MobReward, type MobTier } from './mob.js';
import type { PrimaryStats } from '../services/player-stats.js';

/**
 * Boss z Region I (T2). Widmo zatopionego okrętu w portowych mgłach —
 * pierwszy poważny test po tutorialu Marka.
 */
export class FlyingDutchman extends Mob {
  readonly id = 'latajacy_holender';
  readonly name = 'Latający Holender';
  readonly tier: MobTier = 2;
  readonly hp = 90;
  readonly damageBonus = 8;
  override readonly defenseBonus = 2;
  override readonly speed = 4;
  override readonly primary: PrimaryStats = { str: 4, agi: 4, wit: 4, int: 6 };
  override readonly potions = 1;
  readonly description = 'Widmowy okręt-zjawa z portowych mgieł — pierwsza próba po tutorialu.';
  override readonly skills = ['lodowy_grad'];
  readonly attackLines = [
    'Salwa Widmowych Dział',
    'Klątwa Topielca',
    'Szarża Dziobem Kadłuba',
    'Cios Bosakiem',
  ];
  readonly rewards: MobReward = {
    xp: 220,
    combatXp: 130,
    lootTable: [
      { itemId: 'fish_marlin', weight: 30 },
      { itemId: 'gem_ruby', weight: 25 },
      { itemId: 'wood_dab', weight: 25, qtyMin: 2, qtyMax: 3 },
      { itemId: 'potion_greater', weight: 20 },
    ],
    rolls: 3,
    dropPool: ['sword_iron', 'armor_iron'],
    guaranteedDropChance: 0.55,
  };
}
