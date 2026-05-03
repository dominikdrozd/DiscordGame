import { createDamageSkill } from '../factory.js';
import { applyDoT } from '../helpers.js';

export const pieklo = createDamageSkill({
  id: 'pieklo',
  name: 'Piekło',
  emoji: '🔥🔥',
  description: 'AoE 100% dmg + DoT 6/turę 2 tury na wszystkich wrogów (tier-2 Inferno).',
  cooldown: 6,
  targeting: 'allEnemies',
  classes: ['inferno'],
  scaling: { int: 1.4 },
  requirements: { level: 20, gold: 300, primary: { int: 14 } },
  base: 14,
  variance: 12,
  followup: (target) => {
    applyDoT(target, { id: 'pieklo_dot', source: 'pieklo', ttl: 2, baseAmount: 6 });
  },
});
