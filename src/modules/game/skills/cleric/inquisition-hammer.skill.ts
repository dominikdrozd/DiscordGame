import { createDamageSkill } from '../factory.js';
import { applyDamageAmp } from '../helpers.js';

export const swiety_mlot = createDamageSkill({
  id: 'swiety_mlot',
  name: 'Święty Młot Inkwizycji',
  emoji: '🔨✨',
  description: 'Single dmg + -5 dmg debuff przez 3 tury (tier-2 Młot Kacerski).',
  cooldown: 4,
  targeting: 'enemy',
  classes: ['mlot_kacerski'],
  scaling: { int: 1.2, str: 0.4 },
  requirements: { level: 20, gold: 300, primary: { int: 12, str: 4 } },
  base: 18,
  variance: 10,
  followup: (target) => {
    applyDamageAmp(target, {
      id: 'swiety_mlot_debuff',
      source: 'swiety_mlot',
      ttl: 3,
      amount: -5,
    });
    return '+ -5 dmg debuff (3 tury)';
  },
});
