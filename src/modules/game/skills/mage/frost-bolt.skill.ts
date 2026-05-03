import { createDamageSkill } from '../factory.js';
import { applySlow } from '../helpers.js';

export const mrozny_strzal = createDamageSkill({
  id: 'mrozny_strzal',
  name: 'Mroźny Strzał',
  emoji: '🥶',
  description: 'Big single-target + freeze 2 tury (subklasa Mroziciel).',
  cooldown: 4,
  targeting: 'enemy',
  classes: ['mroziciel'],
  scaling: { int: 1.5 },
  requirements: { level: 5, gold: 80, primary: { int: 6 } },
  base: 20,
  variance: 10,
  followup: (target) => {
    applySlow(target, { id: 'freeze', source: 'mrozny_strzal', ttl: 2 });
    return '+ slow 2 tury';
  },
});
