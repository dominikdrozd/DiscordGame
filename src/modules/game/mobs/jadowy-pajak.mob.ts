import { Mob, type MobReward, type MobTier } from './mob.js';

export class JadowyPajak extends Mob {
  readonly id = 'jadowy_pajak';
  readonly name = 'Jadowy Pająk z Piwnicy';
  readonly tier: MobTier = 3;
  readonly hp = 85;
  readonly damageBonus = 6;
  override readonly defenseBonus = 1;
  override readonly critBonus = 0.1;
  override readonly potions = 1;
  readonly description = 'Wielkości kota, włochaty, sieje paranoję.';
  override readonly skills = ['trucizna', 'mgla_trucizn'];
  readonly attackLines = [
    'Ukąszenie Jadem',
    'Owinięcie Pajęczyną',
    'Skok z Sufitu',
    'Klikanie Szczękoczułkami',
  ];
  readonly rewards: MobReward = {
    xp: 360,
    combatXp: 220,
    lootTable: [
      { itemId: 'ore_silver', weight: 45, qtyMin: 1, qtyMax: 3 },
      { itemId: 'gem_diamond', weight: 15 },
      { itemId: 'wood_heban', weight: 40, qtyMin: 1, qtyMax: 2 },
    ],
    rolls: 3,
    dropPool: ['sword_silver', 'armor_silver'],
    guaranteedDropChance: 0.75,
  };
}
