import { createBuffSkill } from '../factory.js';

export const tarcza_wiary = createBuffSkill({
  id: 'tarcza_wiary',
  name: 'Tarcza Wiary',
  emoji: '🛡️✨',
  description: 'Tarcza pochłaniająca 25 dmg na ally (skaluje z WIT/INT).',
  cooldown: 3,
  targeting: 'ally',
  classes: ['klecha', 'inkwizytor', 'swietomat'],
  scaling: { wit: 1.0, int: 1.0 },
  requirements: { level: 1, gold: 0 },
  kind: 'shield',
  baseAmount: 25,
  ttl: 3,
  formatLine: (c, t, amount) =>
    `🛡️✨ **${c.name}** otacza **${t.name}** **Tarczą Wiary** (pochłonie ${amount} dmg).`,
});
