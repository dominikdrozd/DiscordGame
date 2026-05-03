import { createDamageSkill } from '../factory.js';
import { applyDamageAmp } from '../helpers.js';

export const osad_kacerza = createDamageSkill({
  id: 'osad_kacerza',
  name: 'Osąd Kacerza',
  emoji: '⚖️',
  description: 'Single-target dmg + osłabienie -3 dmg na 2 tury (subklasa Inkwizytor).',
  cooldown: 3,
  targeting: 'enemy',
  classes: ['inkwizytor'],
  scaling: { int: 1.0, wit: 0.4 },
  requirements: { level: 5, gold: 80, primary: { int: 4, wit: 4 } },
  base: 12,
  variance: 8,
  followup: (target) => {
    applyDamageAmp(target, { id: 'osad_kacerza', source: 'osad_kacerza', ttl: 2, amount: -3 });
    return '+ -3 dmg debuff (2 tury)';
  },
});
