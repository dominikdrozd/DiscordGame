import { Mob, type MobReward } from './mob.js';

export class BabaJaga extends Mob {
  readonly id = 'baba_jaga';
  readonly name = 'Baba Jaga z Bloku';
  readonly hp = 160;
  readonly damageBonus = 9;
  override readonly defenseBonus = 3;
  override readonly critBonus = 0.1;
  override readonly potions = 2;
  readonly description = 'Zna nalewki, klątwy i numer do skarbówki.';
  override readonly skills = ['trucizna', 'lodowy_grad'];
  readonly attackLines = [
    'Klątwa Skarbówki',
    'Cios Miotłą',
    'Rzut Słoikiem Smalcu',
    'Splunięcie Nalewką',
  ];
  readonly rewards: MobReward = {
    xp: 300,
    combatXp: 180,
    lootTable: [
      { itemId: 'ore_silver', weight: 50, qtyMin: 1, qtyMax: 2 },
      { itemId: 'gem_diamond', weight: 10 },
      { itemId: 'wood_buk', weight: 40, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 3,
    dropPool: ['sword_silver', 'armor_silver'],
    guaranteedDropChance: 0.7,
  };
}
