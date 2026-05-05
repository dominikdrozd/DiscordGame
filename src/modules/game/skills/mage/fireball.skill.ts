import { addBuff } from '../../engine/buffs.js';
import { createDamageSkill } from '../factory.js';

const HIT_BASE = 70;
const BURN_BASE = 10;
const BURN_TTL = 3;

/**
 * Kula Ognia — single-target burst dla maga.
 * - Direct hit: `HIT_BASE + spellPower` (70 + SP, gdzie SP = INT × 2)
 * - Burn: `BURN_BASE + spellPower` per tick × 3 rundy (10 + SP)
 *
 * Brak variance — przewidywalny dmg dla maga; zostaje miejsce na crit/dodge
 * w basic attacku. `scaling.int = 2.0` daje +2 dmg per INT, równoważne SP.
 */
export const kula_ognia = createDamageSkill({
  id: 'kula_ognia',
  name: 'Kula Ognia',
  emoji: '🔥',
  description: `Single-target: ${HIT_BASE} + SP dmg + podpalenie ${BURN_BASE} + SP/turę × ${BURN_TTL}.`,
  cooldown: 2,
  targeting: 'enemy',
  classes: ['mag', 'pirokineta', 'mroziciel'],
  scaling: { int: 2.0 },
  requirements: { level: 1, gold: 0 },
  base: HIT_BASE,
  variance: 0,
  multiplier: 1.0,
  followup: (target, caster) => {
    const amount = BURN_BASE + (caster.spellPower ?? 0);
    addBuff(target, {
      id: 'gem_burn',
      kind: 'dot',
      source: 'Podpalenie (Kula Ognia)',
      ttl: BURN_TTL,
      amount,
    });
    return `🔥 _podpalony (${amount}/turę × ${BURN_TTL})!_`;
  },
});
