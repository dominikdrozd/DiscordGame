import { createDamageSkill } from '../factory.js';
import { applySlow } from '../helpers.js';

export const tornado = createDamageSkill({
  id: 'tornado',
  name: 'Tornado',
  emoji: '🌪️⚡',
  description: 'AoE dmg + slow na wszystkich wrogów (tier-2 Grzmot).',
  cooldown: 5,
  targeting: 'allEnemies',
  classes: ['grzmot'],
  scaling: { int: 1.0, agi: 0.4 },
  requirements: { level: 20, gold: 300, primary: { int: 10 } },
  base: 12,
  variance: 8,
  followup: (target) => {
    applySlow(target, { id: 'tornado_slow', source: 'tornado', ttl: 1 });
  },
});
