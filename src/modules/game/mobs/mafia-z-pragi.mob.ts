import { Mob, type MobTier } from './mob.js';

export class MafiaZPragi extends Mob {
  readonly id = 'mafia_z_pragi';
  readonly name = 'Mafia z Pragi';
  readonly tier: MobTier = 2;
  readonly hp = 70;
  readonly damageBonus = 5;
  override readonly potions = 1;
  readonly description = 'Trzech panów w dresach, kij bejsbolowy i dyskusja na temat granic.';
  readonly attackLines = [
    'Walenie Kijem Bejsbolowym',
    'Cios Ekspresji Bramkarskiej',
    'Plucie z Klatki',
    'Hak na Lewo',
  ];
}
