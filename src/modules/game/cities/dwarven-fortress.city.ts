import { City, type Merchant } from './city.js';
import { Npc } from '../npcs/npc.js';
import { GromBlacksmith } from '../npcs/dwarven-fortress/grom-blacksmith.npc.js';
import { Druin } from '../npcs/dwarven-fortress/druin.npc.js';
import { Thordin } from '../npcs/dwarven-fortress/thordin.npc.js';

export class DwarvenFortress extends City {
  readonly id = 'krasnoludzka_twierdza';
  readonly name = 'Krasnoludzka Twierdza';
  readonly description =
    'Potężne miasto wykute wewnątrz góry. Najlepsi rzemieślnicy, najtwardsze złoża.';
  readonly region = 3;
  readonly npcs: Npc[] = [new GromBlacksmith(), new Druin(), new Thordin()];
  readonly merchants: Merchant[] = [
    {
      id: 'mistrz_ruda_grom',
      name: 'Mistrz Ruda Grom',
      description: 'Spec od metali rzadkich.',
      sellMultiplier: 0.6,
      stock: [
        { itemId: 'ore_silver', buyPrice: 30 },
        { itemId: 'ore_gold', buyPrice: 65 },
        { itemId: 'ore_mithril', buyPrice: 130 },
      ],
    },
    {
      id: 'jubiler_targon',
      name: 'Jubiler Targon',
      description: 'Diamenty, kryształy, ozdoby z głębi gór.',
      sellMultiplier: 0.5,
      stock: [{ itemId: 'gem_diamond', buyPrice: 90 }],
    },
    {
      id: 'kowal_thorin',
      name: 'Kowal Thorin',
      description: 'Sprzedaje rudy i drewno potrzebne do craftingu sprzętu wyższego tieru.',
      sellMultiplier: 0.55,
      stock: [
        { itemId: 'wood_buk', buyPrice: 24 },
        { itemId: 'wood_heban', buyPrice: 55 },
        { itemId: 'wood_smoczy', buyPrice: 140 },
        { itemId: 'potion_small', buyPrice: 28 },
      ],
    },
  ];
}
