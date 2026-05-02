export interface Race {
  id: string;
  name: string;
  description: string;
  startingStats: { str: number; agi: number; wit: number; int: number };
}

export const RACES: Record<string, Race> = {
  czlowiek: {
    id: 'czlowiek',
    name: 'Człowiek',
    description: 'Uniwersalny — żadnej słabości, żadnego wybitnego atutu.',
    startingStats: { str: 1, agi: 1, wit: 1, int: 1 },
  },
  krasnolud: {
    id: 'krasnolud',
    name: 'Krasnolud',
    description: 'Wojownik/tank — ciężki, wytrzymały, mało zwinny.',
    startingStats: { str: 3, agi: 0, wit: 1, int: 0 },
  },
  elf: {
    id: 'elf',
    name: 'Elf',
    description: 'Łotrzyk/mag — szybki i bystry, kruchy.',
    startingStats: { str: 0, agi: 2, wit: 0, int: 2 },
  },
  polork: {
    id: 'polork',
    name: 'Półork',
    description: 'Physical fighter — siła i refleks, kiepski z magią.',
    startingStats: { str: 3, agi: 1, wit: 1, int: -1 },
  },
};

export function getRace(id: string): Race | undefined {
  return RACES[id];
}

export function listRaces(): Race[] {
  return Object.values(RACES);
}

export function fmtRaceStats(r: Race): string {
  const s = r.startingStats;
  return `STR ${s.str >= 0 ? '+' : ''}${s.str} · AGI ${s.agi >= 0 ? '+' : ''}${s.agi} · WIT ${s.wit >= 0 ? '+' : ''}${s.wit} · INT ${s.int >= 0 ? '+' : ''}${s.int}`;
}
