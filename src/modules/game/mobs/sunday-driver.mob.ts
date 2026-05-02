import { Mob } from './mob.js';

export class SundayDriver extends Mob {
  readonly id = 'niedzielny_kierowca';
  readonly name = 'Niedzielny Kierowca SUV-em';
  readonly hp = 110;
  readonly damageBonus = 9;
  readonly description = 'Lewy pas, zero kierunkowskazów, bezczelność full.';
  readonly attackLines = [
    'Trąbienie Bezczelne',
    'Zajechanie Drogi',
    'Splunięcie z Okna',
    'Hak Lusterkiem',
  ];
}
