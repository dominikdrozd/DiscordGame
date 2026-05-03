import type { Skill } from './index.js';
import { addBuff } from '../engine/buffs.js';
import { scaledBonus } from './index.js';

export const ice_sarcophagus: Skill = {
  id: 'ice_sarcophagus',
  name: 'Lodowy Sarkofag',
  description: 'Single freeze 4 tury + AoE 30 dmg na wszystkich wrogów.',
  cooldown: 8,
  targeting: 'enemy',
  classes: [],
  universal: true,
  scaling: { int: 0.6 },
  requirements: { level: 20, gold: 0, primary: { int: 18 } },
  apply(state, caster, targets) {
    const target = targets[0];
    if (!target) return `**${caster.name}** szykuje sarkofag — bez celu.`;
    addBuff(target, {
      id: 'ice_sarcophagus_freeze',
      kind: 'slow',
      source: 'ice_sarcophagus',
      ttl: 4,
      amount: 99,
    });
    const dmg = 30 + scaledBonus(caster, this.scaling);
    const lines: string[] = [];
    for (const c of state.combatants) {
      if (c.team === caster.team || c.hp <= 0) continue;
      c.hp = Math.max(0, c.hp - dmg);
      lines.push(`❄️ **${c.name}**: -${dmg}`);
    }
    return `🧊⚰️ **${caster.name}** zamyka **${target.name}** w **Lodowym Sarkofagu** (freeze 4 tury) + AoE ${dmg}: ${lines.join(', ')}`;
  },
};
