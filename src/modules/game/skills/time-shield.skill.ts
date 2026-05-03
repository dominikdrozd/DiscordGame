import { createBuffSkill } from './factory.js';

export const time_shield = createBuffSkill({
  id: 'time_shield',
  name: 'Tarcza Czasu',
  emoji: '⏳',
  description: 'Tarcza pochłaniająca 200 dmg przez 3 tury (skaluje z WIT/INT).',
  cooldown: 8,
  targeting: 'self',
  classes: [],
  universal: true,
  scaling: { wit: 1.5, int: 1.5 },
  requirements: { level: 15, gold: 0, primary: { wit: 12, int: 8 } },
  kind: 'shield',
  baseAmount: 200,
  ttl: 3,
  formatLine: (c, _t, amount) =>
    `⏳ **${c.name}** wznosi **Tarczę Czasu** — pochłonie ${amount} dmg przez 3 tury.`,
});
