import { createDoTSkill } from '../factory.js';

export const mgla_trucizn = createDoTSkill({
  id: 'mgla_trucizn',
  name: 'Mgła Trucizn',
  emoji: '🌫️',
  description: 'AoE DoT 4 dmg/tura przez 3 tury na wszystkich enemies (subklasa Trujący).',
  cooldown: 4,
  targeting: 'allEnemies',
  classes: ['trujacy'],
  scaling: { int: 0.25 },
  requirements: { level: 5, gold: 80, primary: { int: 4 } },
  baseAmount: 4,
  ttl: 3,
});
