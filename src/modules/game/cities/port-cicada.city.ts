import { City, type Merchant } from './city.js';
import { Npc } from '../npcs/npc.js';
import { Marek } from '../npcs/port-cicada/marek.npc.js';
import { Bartek } from '../npcs/port-cicada/bartek.npc.js';
import { Hela } from '../npcs/port-cicada/hela.npc.js';
import { Olek } from '../npcs/port-cicada/olek.npc.js';

export class PortCicada extends City {
  readonly id = 'port_cykada';
  readonly name = 'Port Cykada';
  readonly description = 'Miasto startowe i główny port handlowy. Tu zaczyna się każda przygoda.';
  readonly region = 1;
  readonly npcs: Npc[] = [new Marek(), new Bartek(), new Hela(), new Olek()];
  readonly merchants: Merchant[] = [
    {
      id: 'rybak_borys',
      name: 'Rybak Borys',
      description: 'Sprzedaje świeże ryby i podstawowe drewno.',
      sellMultiplier: 0.5,
      stock: [
        { itemId: 'fish_sardynka', buyPrice: 5 },
        { itemId: 'fish_karp', buyPrice: 8 },
        { itemId: 'wood_sosna', buyPrice: 4 },
      ],
    },
    {
      id: 'gornik_witold',
      name: 'Górnik Witold',
      description: 'Skup ruda → handluje miedzią i żelazem.',
      sellMultiplier: 0.5,
      stock: [
        { itemId: 'ore_copper', buyPrice: 6 },
        { itemId: 'ore_iron', buyPrice: 10 },
      ],
    },
    {
      id: 'alchemiczka_mira',
      name: 'Alchemiczka Mira',
      description: 'Mikstury i prosta alchemia.',
      sellMultiplier: 0.4,
      stock: [{ itemId: 'potion_small', buyPrice: 25 }],
    },
  ];
}
