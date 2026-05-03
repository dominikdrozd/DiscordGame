import { createDamageSkill } from './factory.js';

export const mana_burst = createDamageSkill({
  id: 'mana_burst',
  name: 'Wybuch Many',
  emoji: '💥',
  description: 'Single target massive INT-scaled dmg ignorujący 50% obrony.',
  cooldown: 7,
  targeting: 'enemy',
  classes: [],
  universal: true,
  scaling: { int: 3.0 },
  requirements: { level: 22, gold: 0, primary: { int: 25 } },
  base: 60,
  variance: 40,
  formatLine: (c, t, dmg) =>
    `💥 **${c.name}** odpala **Wybuch Many** w **${t.name}** za **${dmg}** dmg (ignoruje połowę obrony).`,
});
