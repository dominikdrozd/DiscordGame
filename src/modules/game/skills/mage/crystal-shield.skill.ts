import { createBuffSkill } from '../factory.js';

export const krysztal_obrony = createBuffSkill({
  id: 'krysztal_obrony',
  name: 'Kryształ Obrony',
  emoji: '💎',
  description: 'Tarcza 50 dmg na ally (skaluje z WIT, tier-2 Krystaliczny).',
  cooldown: 4,
  targeting: 'ally',
  classes: ['krystaliczny'],
  scaling: { wit: 1.5, int: 0.6 },
  requirements: { level: 20, gold: 300, primary: { wit: 10, int: 6 } },
  kind: 'shield',
  baseAmount: 50,
  ttl: 4,
  formatLine: (c, t, amount) =>
    `💎 **${c.name}** otacza **${t.name}** **Kryształem Obrony** (pochłonie ${amount} dmg).`,
});
