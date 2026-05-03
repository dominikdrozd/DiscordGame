import { createBuffSkill } from '../factory.js';

export const furia = createBuffSkill({
  id: 'furia',
  name: 'Furia Krwi',
  emoji: '🩸',
  description: 'Self buff +12 dmg przez 3 tury (tier-2 Krwawnik).',
  cooldown: 5,
  targeting: 'self',
  classes: ['krwawnik'],
  scaling: { str: 0.6 },
  requirements: { level: 20, gold: 300, primary: { str: 10 } },
  kind: 'damage_amp',
  baseAmount: 12,
  ttl: 3,
  formatLine: (c, _t, amount) => `🩸 **${c.name}** wpada w **Furię Krwi** — +${amount} dmg przez 3 tury.`,
});
