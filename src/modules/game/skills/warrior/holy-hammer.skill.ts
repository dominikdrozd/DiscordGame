import { createDamageSkill } from '../factory.js';

export const mlot_swiety = createDamageSkill({
  id: 'mlot_swiety',
  name: 'Święty Młot',
  emoji: '🔨✨',
  description: 'Atak ×1.8 dmg ignorujący 50% obrony (tier-2 Gniew Boży).',
  cooldown: 4,
  targeting: 'enemy',
  classes: ['gniew_bozy'],
  scaling: { str: 0.7, wit: 0.3 },
  requirements: { level: 20, gold: 300, primary: { str: 8, wit: 4 } },
  base: 14,
  variance: 12,
  includeWeapon: true,
  multiplier: 1.8,
  formatLine: (c, t, dmg) =>
    `🔨✨ **${c.name}** uderza **Świętym Młotem** w **${t.name}** za **${dmg}** dmg (ignoruje połowę obrony).`,
});
