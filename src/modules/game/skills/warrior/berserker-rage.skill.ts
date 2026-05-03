import { createBuffSkill } from '../factory.js';

export const szal = createBuffSkill({
  id: 'szal',
  name: 'Szał Berserkera',
  emoji: '🔥',
  description: '+8 dmg na 2 tury (subklasa Berserker).',
  cooldown: 4,
  targeting: 'self',
  classes: ['berserker'],
  scaling: { str: 0.5 },
  requirements: { level: 5, gold: 80, primary: { str: 4 } },
  kind: 'damage_amp',
  baseAmount: 8,
  ttl: 2,
  formatLine: (c, _t, amount) => `🔥 **${c.name}** wpada w **szał** — +${amount} dmg przez 2 tury.`,
});
