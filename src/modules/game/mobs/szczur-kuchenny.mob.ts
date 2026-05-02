import { Mob, type MobReward } from './mob.js';

export class SzczurKuchenny extends Mob {
  readonly id = 'szczur_kuchenny';
  readonly name = 'Szczur Kuchenny Damian';
  readonly hp = 50;
  readonly damageBonus = 3;
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
  };
}
