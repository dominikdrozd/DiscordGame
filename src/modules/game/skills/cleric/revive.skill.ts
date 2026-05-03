import type { Skill } from '../index.js';

export const ozyw: Skill = {
  id: 'ozyw',
  name: 'Ożyw',
  description: 'Wskrzesza padłego ally z 50% HP (subklasa Świętomat, raz na walkę).',
  cooldown: 99,
  targeting: 'ally',
  classes: ['swietomat'],
  requirements: { level: 5, gold: 80, primary: { int: 6, wit: 4 } },
  apply(_state, caster, targets) {
    const target = targets[0];
    if (!target) return `**${caster.name}** próbuje wskrzeszenia — bez celu.`;
    if (target.hp > 0) {
      target.hp = Math.min(target.maxHp, target.hp + 30);
      return `✨ **${caster.name}** dotyka **${target.name}** świętym dotykiem (+30 HP, ale cel żyje).`;
    }
    target.hp = Math.floor(target.maxHp * 0.5);
    return `⚱️ **${caster.name}** **OŻYWIA** **${target.name}** z ${target.hp} HP!`;
  },
};
