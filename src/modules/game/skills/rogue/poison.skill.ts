import { createDoTSkill } from '../factory.js';

export const trucizna = createDoTSkill({
  id: 'trucizna',
  name: 'Trucizna',
  emoji: '☠️',
  description: 'DoT 5 dmg/tura przez 3 tury.',
  cooldown: 3,
  targeting: 'enemy',
  classes: ['lotrzyk', 'cien', 'trujacy'],
  scaling: { int: 0.3, agi: 0.2 },
  requirements: { level: 1, gold: 0 },
  baseAmount: 5,
  ttl: 3,
});
