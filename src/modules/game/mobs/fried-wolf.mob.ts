import { Mob } from './mob.js';

export class FriedWolf extends Mob {
  readonly id = 'wilk_smazony';
  readonly name = 'Wilk Smażony';
  readonly hp = 80;
  readonly damageBonus = 6;
  readonly description = 'Pachnie panierką i agresją.';
  readonly attackLines = ['Ugryzienie Smażonych Kłów', 'Skok z Krzaków', 'Cios Tłustą Łapą'];
}
