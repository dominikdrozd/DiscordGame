import type { Skill } from '../index.js';
import { taunt } from './taunt.skill.js';
import { tarcza_jelita } from './gut-shield.skill.js';
import { szal } from './berserker-rage.skill.js';
import { krzyk_bojowy } from './battle-cry.skill.js';
import { odbicie } from './deflect.skill.js';
import { furia } from './blood-fury.skill.js';
import { pohuk } from './master-roar.skill.js';
import { bizmut } from './bismuth-blessing.skill.js';
import { mlot_swiety } from './holy-hammer.skill.js';

export const WARRIOR_SKILLS: Record<string, Skill> = {
  [taunt.id]: taunt,
  [tarcza_jelita.id]: tarcza_jelita,
  [szal.id]: szal,
  [krzyk_bojowy.id]: krzyk_bojowy,
  [odbicie.id]: odbicie,
  [furia.id]: furia,
  [pohuk.id]: pohuk,
  [bizmut.id]: bizmut,
  [mlot_swiety.id]: mlot_swiety,
};
