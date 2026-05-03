import { createDamageSkill } from '../factory.js';
import { applySlow } from '../helpers.js';

export const lodowa_burza = createDamageSkill({
  id: 'lodowa_burza',
  name: 'Lodowa Burza',
  emoji: '❄️🌪️',
  description: 'AoE dmg + freeze 2 tury wszystkim wrogom (tier-2 Arktoman).',
  cooldown: 6,
  targeting: 'allEnemies',
  classes: ['arktoman'],
  scaling: { int: 1.0 },
  requirements: { level: 20, gold: 300, primary: { int: 14 } },
  base: 12,
  variance: 8,
  followup: (target) => {
    applySlow(target, { id: 'lodowa_burza_freeze', source: 'lodowa_burza', ttl: 2 });
  },
});
