import type { Skill } from '../index.js';
import { swiate_uzdrowienie } from './holy-healing.skill.js';
import { tarcza_wiary } from './faith-shield.skill.js';
import { osad_kacerza } from './heretic-judgment.skill.js';
import { ozyw } from './revive.skill.js';
import { swiety_mlot } from './inquisition-hammer.skill.js';
import { osad } from './final-judgment.skill.js';
import { gloria } from './gloria.skill.js';
import { chor_aniolow } from './angel-choir.skill.js';

export const CLERIC_SKILLS: Record<string, Skill> = {
  [swiate_uzdrowienie.id]: swiate_uzdrowienie,
  [tarcza_wiary.id]: tarcza_wiary,
  [osad_kacerza.id]: osad_kacerza,
  [ozyw.id]: ozyw,
  [swiety_mlot.id]: swiety_mlot,
  [osad.id]: osad,
  [gloria.id]: gloria,
  [chor_aniolow.id]: chor_aniolow,
};
