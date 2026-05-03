import type { Skill } from '../index.js';
import { addBuff } from '../../engine/buffs.js';
import { scaledBonus } from '../index.js';

export const pohuk: Skill = {
  id: 'pohuk',
  name: 'Pohuk Mistrza',
  description: 'Mocny taunt na 3 tury + self +6 def przez 2 tury (tier-2 Wodzowy Rzeźnik).',
  cooldown: 5,
  targeting: 'self',
  classes: ['wodzowy_rzeznik'],
  scaling: { wit: 0.5 },
  requirements: { level: 20, gold: 300, primary: { wit: 10 } },
  apply(_state, caster) {
    const defAmount = 6 + scaledBonus(caster, this.scaling);
    addBuff(caster, {
      id: 'pohuk',
      kind: 'taunt',
      source: 'pohuk',
      ttl: 3,
      casterId: caster.id,
    });
    addBuff(caster, {
      id: 'pohuk_def',
      kind: 'defense_amp',
      source: 'pohuk',
      ttl: 2,
      amount: defAmount,
    });
    caster.threatBias = (caster.threatBias ?? 0) + 6;
    return `📢 **${caster.name}** wydaje **Pohuk Mistrza** — wszyscy wrogowie celują w niego (3 tury) i +${defAmount} def (2 tury).`;
  },
};
