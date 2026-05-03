import { createBuffSkill } from '../factory.js';

export const splot_korzeni = createBuffSkill({
  id: 'splot_korzeni',
  name: 'Splot Korzeni',
  emoji: '🌿',
  description: 'HoT 8 hp/tura przez 3 tury na ally.',
  cooldown: 3,
  targeting: 'ally',
  classes: ['druid', 'korzennik', 'burza'],
  scaling: { wit: 0.4, int: 0.4 },
  requirements: { level: 1, gold: 0 },
  kind: 'hot',
  baseAmount: 8,
  ttl: 3,
  formatLine: (c, t, amount) =>
    `🌿 **${c.name}** owija **${t.name}** korzeniami — +${amount} HP/turę przez 3 tury.`,
});
