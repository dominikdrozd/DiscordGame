import { createDoTSkill } from './factory.js';

export const curse_echo = createDoTSkill({
  id: 'curse_echo',
  name: 'Echo Tysiąca Klątw',
  emoji: '🕯️',
  description: 'AoE DoT 12 dmg/turę przez 4 tury na wszystkich wrogów.',
  cooldown: 7,
  targeting: 'allEnemies',
  classes: [],
  universal: true,
  scaling: { int: 0.5 },
  requirements: { level: 12, gold: 0, primary: { int: 10 } },
  baseAmount: 12,
  ttl: 4,
});
