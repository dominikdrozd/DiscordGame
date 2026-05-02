import { Mob, type MobTier } from './mob.js';

export class FireImp extends Mob {
  readonly id = 'ognisty_chochlik';
  readonly name = 'Ognisty Chochlik';
  readonly tier: MobTier = 3;
  readonly hp = 55;
  readonly damageBonus = 4;
  override readonly critBonus = 0.1;
  readonly description = 'Mały demon ognia, śmiga, podpala krzaki dla zabawy.';
  override readonly skills = ['kula_ognia'];
  readonly attackLines = ['Skok z Płomieniem', 'Plucie Ogniem', 'Cios Rozpalonym Ogonem'];
}
