import { createBuffSkill } from '../factory.js';

export const kora_debu = createBuffSkill({
  id: 'kora_debu',
  name: 'Kora Dębu',
  emoji: '🌳',
  description: '+5 def na ally na 2 tury.',
  cooldown: 2,
  targeting: 'ally',
  classes: ['druid', 'korzennik', 'burza'],
  scaling: { wit: 0.5 },
  requirements: { level: 1, gold: 0 },
  kind: 'defense_amp',
  baseAmount: 5,
  ttl: 2,
  formatLine: (c, t, amount) =>
    `🌳 **${c.name}** opancerza **${t.name}** korą dębu — +${amount} def przez 2 tury.`,
});
