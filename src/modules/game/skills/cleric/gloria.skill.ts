import { createBuffSkill } from '../factory.js';

export const gloria = createBuffSkill({
  id: 'gloria',
  name: 'Gloria',
  emoji: '🌟',
  description: 'AoE HoT 8/turę 3 tury na wszystkich ally (tier-2 Arcyeasey).',
  cooldown: 5,
  targeting: 'allAllies',
  classes: ['arcyeasey'],
  scaling: { wit: 0.4, int: 0.4 },
  requirements: { level: 20, gold: 300, primary: { int: 10 } },
  kind: 'hot',
  baseAmount: 8,
  ttl: 3,
});
