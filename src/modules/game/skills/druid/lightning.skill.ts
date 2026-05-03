import { createDamageSkill } from '../factory.js';

export const piorun = createDamageSkill({
  id: 'piorun',
  name: 'Piorun',
  emoji: '⚡',
  description: 'Burst single-target dmg z bonusem od INT (subklasa Burza).',
  cooldown: 3,
  targeting: 'enemy',
  classes: ['burza'],
  scaling: { int: 1.0, agi: 0.3 },
  requirements: { level: 5, gold: 80, primary: { int: 4, agi: 4 } },
  base: 16,
  variance: 10,
});
