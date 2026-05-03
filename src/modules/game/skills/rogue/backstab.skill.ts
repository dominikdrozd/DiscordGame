import { createDamageSkill } from '../factory.js';

export const cios_w_plecy = createDamageSkill({
  id: 'cios_w_plecy',
  name: 'Cios w Plecy',
  emoji: '🗡️',
  description: 'Atak ignorujący obronę z mnożnikiem ×1.5 dmg.',
  cooldown: 2,
  targeting: 'enemy',
  classes: ['lotrzyk', 'cien', 'trujacy'],
  scaling: { str: 0.4, agi: 0.6 },
  requirements: { level: 1, gold: 0 },
  base: 12,
  variance: 12,
  includeWeapon: true,
  multiplier: 1.5,
  formatLine: (c, t, dmg) =>
    `🗡️ **${c.name}** wbija **Cios w Plecy** w **${t.name}** za **${dmg}** dmg (ignoruje obronę).`,
});
