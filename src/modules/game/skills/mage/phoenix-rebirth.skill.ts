import { createHealSkill } from '../factory.js';

export const odrodzenie = createHealSkill({
  id: 'odrodzenie',
  name: 'Odrodzenie z Phoenixa',
  emoji: '🔥🦅',
  description: 'Self heal +60 HP (skaluje z INT, tier-2 Władca Phoenixa).',
  cooldown: 6,
  targeting: 'self',
  classes: ['wladca_phoenixa'],
  scaling: { int: 2.0, wit: 0.5 },
  requirements: { level: 20, gold: 300, primary: { int: 12, wit: 4 } },
  baseHeal: 60,
});
