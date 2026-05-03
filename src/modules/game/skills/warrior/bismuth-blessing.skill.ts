import { createHealSkill } from '../factory.js';

export const bizmut = createHealSkill({
  id: 'bizmut',
  name: 'Bizmutowe Błogosławieństwo',
  emoji: '💊',
  description: '+35 HP heal na ally (skaluje z WIT/INT, tier-2 Święty Strażak).',
  cooldown: 3,
  targeting: 'ally',
  classes: ['swiety_strazak'],
  scaling: { wit: 0.8, int: 0.5 },
  requirements: { level: 20, gold: 300, primary: { wit: 8, int: 4 } },
  baseHeal: 35,
});
