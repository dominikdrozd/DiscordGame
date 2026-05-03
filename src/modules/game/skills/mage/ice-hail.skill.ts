import { createDamageSkill } from '../factory.js';
import { applySlow } from '../helpers.js';

export const lodowy_grad = createDamageSkill({
  id: 'lodowy_grad',
  name: 'Lodowy Grad',
  emoji: '❄️',
  description: 'Single-target dmg + slow (przeciwnik traci następną turę).',
  cooldown: 3,
  targeting: 'enemy',
  classes: ['mag', 'pirokineta', 'mroziciel'],
  scaling: { int: 1.2 },
  requirements: { level: 1, gold: 0 },
  base: 14,
  variance: 8,
  followup: (target) => {
    applySlow(target, { id: 'slow', source: 'lodowy_grad', ttl: 1 });
    return '+ slow';
  },
});
