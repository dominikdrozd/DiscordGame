import { createBuffSkill } from '../factory.js';

export const odbicie = createBuffSkill({
  id: 'odbicie',
  name: 'Odbicie',
  emoji: '🪞',
  description: '+10 def na 1 turę (subklasa Krzyżowiec).',
  cooldown: 3,
  targeting: 'self',
  classes: ['krzyzowiec'],
  scaling: { wit: 0.4 },
  requirements: { level: 5, gold: 80, primary: { wit: 4 } },
  kind: 'defense_amp',
  baseAmount: 10,
  ttl: 1,
  formatLine: (c, _t, amount) => `🪞 **${c.name}** wystawia **Odbicie** — +${amount} def na 1 turę.`,
});
