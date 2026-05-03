import { createDamageSkill } from '../factory.js';

export const kula_ognia = createDamageSkill({
  id: 'kula_ognia',
  name: 'Kula Ognia',
  emoji: '🔥',
  description: 'AoE — 60% standardowego dmg na wszystkich enemies.',
  cooldown: 2,
  targeting: 'allEnemies',
  classes: ['mag', 'pirokineta', 'mroziciel'],
  scaling: { int: 1.0 },
  requirements: { level: 1, gold: 0 },
  base: 10,
  variance: 10,
  multiplier: 0.6,
});
