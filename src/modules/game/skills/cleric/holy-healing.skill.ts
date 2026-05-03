import { createHealSkill } from '../factory.js';

export const swiate_uzdrowienie = createHealSkill({
  id: 'swiate_uzdrowienie',
  name: 'Świątek Uzdrowienia',
  emoji: '✨',
  description: '+30 HP do ally (skaluje z INT/WIT).',
  cooldown: 2,
  targeting: 'ally',
  classes: ['klecha', 'inkwizytor', 'swietomat'],
  scaling: { wit: 0.6, int: 1.5 },
  requirements: { level: 1, gold: 0 },
  baseHeal: 30,
});
