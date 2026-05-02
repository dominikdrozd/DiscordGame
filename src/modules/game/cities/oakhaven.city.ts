import { City, type Merchant } from './city.js';

export class Oakhaven extends City {
  readonly id = 'oakhaven';
  readonly name = 'Oakhaven';
  readonly description =
    'Główne miasto ludzkie, osadzone wokół potężnego dębu. Centrum handlu Serca Quelthasee.';
  readonly region = 2;
  readonly merchants: Merchant[] = [
    {
      id: 'lesnik_olaf',
      name: 'Leśnik Olaf',
      description: 'Drewno z całej puszczy, od dębu po heban.',
      sellMultiplier: 0.55,
      stock: [
        { itemId: 'wood_dab', buyPrice: 12 },
        { itemId: 'wood_buk', buyPrice: 22 },
        { itemId: 'wood_heban', buyPrice: 50 },
      ],
    },
    {
      id: 'rzeznik_tomasz',
      name: 'Rzeźnik Tomasz',
      description: 'Skup ryb słodkowodnych i mikstur.',
      sellMultiplier: 0.5,
      stock: [
        { itemId: 'fish_szczupak', buyPrice: 18 },
        { itemId: 'fish_sum', buyPrice: 35 },
        { itemId: 'potion_small', buyPrice: 30 },
      ],
    },
    {
      id: 'kowal_zenek',
      name: 'Kowal Zenek',
      description: 'Sprzedaje rudy do dalszego craftingu.',
      sellMultiplier: 0.55,
      stock: [
        { itemId: 'ore_iron', buyPrice: 11 },
        { itemId: 'ore_silver', buyPrice: 28 },
      ],
    },
  ];
}
