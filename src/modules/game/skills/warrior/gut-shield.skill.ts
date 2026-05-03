import { createBuffSkill } from '../factory.js';

export const tarcza_jelita = createBuffSkill({
  id: 'tarcza_jelita',
  name: 'Tarcza Jelita',
  emoji: '🛡️',
  description: '+5 do obrony na 2 tury (skaluje z WIT).',
  cooldown: 2,
  targeting: 'self',
  classes: ['wojownik', 'berserker', 'krzyzowiec'],
  scaling: { wit: 0.3 },
  requirements: { level: 1, gold: 0 },
  kind: 'defense_amp',
  baseAmount: 5,
  ttl: 2,
  formatLine: (c, _t, amount) => `🛡️ **${c.name}** napina jelita — +${amount} def przez 2 tury.`,
});
