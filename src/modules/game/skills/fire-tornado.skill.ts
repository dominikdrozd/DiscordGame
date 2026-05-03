import { createDamageSkill } from './factory.js';
import { applyDoT } from './helpers.js';

export const fire_tornado = createDamageSkill({
  id: 'fire_tornado',
  name: 'Ognisty Tornado',
  emoji: '🌪️🔥',
  description: 'AoE 100 dmg + DoT 8/turę przez 3 tury na wszystkich wrogów.',
  cooldown: 8,
  targeting: 'allEnemies',
  classes: [],
  universal: true,
  scaling: { int: 1.2, str: 0.4 },
  requirements: { level: 18, gold: 0, primary: { int: 16 } },
  base: 100,
  variance: 0,
  followup: (target) => {
    applyDoT(target, { id: 'fire_tornado_dot', source: 'fire_tornado', ttl: 3, baseAmount: 8 });
  },
});
