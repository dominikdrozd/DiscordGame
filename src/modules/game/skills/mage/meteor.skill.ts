import { createDamageSkill } from '../factory.js';
import { applyDoT } from '../helpers.js';

export const meteor = createDamageSkill({
  id: 'meteor',
  name: 'Meteor',
  emoji: '☄️',
  description: 'Potężne AoE (90% dmg) z dodatkową szansą na DoT (subklasa Pirokineta).',
  cooldown: 5,
  targeting: 'allEnemies',
  classes: ['pirokineta'],
  scaling: { int: 1.3 },
  requirements: { level: 5, gold: 80, primary: { int: 6 } },
  base: 18,
  variance: 12,
  multiplier: 0.9,
  followup: (target) => {
    if (Math.random() < 0.5) {
      applyDoT(target, { id: 'spalenie', source: 'meteor', ttl: 2, baseAmount: 4 });
    }
  },
});
