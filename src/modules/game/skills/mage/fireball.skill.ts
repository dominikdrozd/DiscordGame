import { addBuff } from '../../engine/buffs.js';
import { createDamageSkill } from '../factory.js';

export const kula_ognia = createDamageSkill({
  id: 'kula_ognia',
  name: 'Kula Ognia',
  emoji: '🔥',
  description:
    'Single-target — silny ciostlek + podpalenie (4 dmg/turę × 3 rundy). Stack-uje się z weapon fire gem burn (refresh ttl).',
  cooldown: 2,
  targeting: 'enemy',
  classes: ['mag', 'pirokineta', 'mroziciel'],
  scaling: { int: 1.0 },
  requirements: { level: 1, gold: 0 },
  base: 18,
  variance: 12,
  multiplier: 1.0,
  followup: (target) => {
    addBuff(target, {
      id: 'gem_burn',
      kind: 'dot',
      source: 'Podpalenie (Kula Ognia)',
      ttl: 3,
      amount: 4,
    });
    return '🔥 _podpalony!_';
  },
});
