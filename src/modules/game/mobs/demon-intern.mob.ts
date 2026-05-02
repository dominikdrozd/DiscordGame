import { Mob } from './mob.js';

export class DemonIntern extends Mob {
  readonly id = 'mala_stazystka_demonow';
  readonly name = 'Mała Stażystka Demonów';
  readonly hp = 90;
  readonly damageBonus = 12;
  override readonly potions = 1;
  readonly description = 'Pisze referat o piekle, ćwiczy klątwy na deadline.';
  readonly attackLines = [
    'Klątwa z Excela',
    'Strzał Notatnikiem',
    'Wypisanie Wezwania',
    'Krzyk Studencki',
  ];
}
