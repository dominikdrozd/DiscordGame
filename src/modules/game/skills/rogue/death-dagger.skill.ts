import { createDamageSkill } from '../factory.js';

export const sztylet_smierci = createDamageSkill({
  id: 'sztylet_smierci',
  name: 'Sztylet Śmierci',
  emoji: '🗡️💀',
  description: 'Gwarantowany krit ×3 dmg na pojedynczy cel (tier-2 Assassyn).',
  cooldown: 5,
  targeting: 'enemy',
  classes: ['assassyn'],
  scaling: { agi: 1.0, str: 0.5 },
  requirements: { level: 20, gold: 300, primary: { agi: 12 } },
  base: 12,
  variance: 12,
  includeWeapon: true,
  multiplier: 3,
  formatLine: (c, t, dmg) =>
    `🗡️💀 **${c.name}** wbija **Sztylet Śmierci** w **${t.name}** za **${dmg}** dmg 💥 GWARANTOWANY KRYT!`,
});
