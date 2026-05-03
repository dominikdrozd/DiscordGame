import type { Skill } from '../index.js';
import { cios_w_plecy } from './backstab.skill.js';
import { trucizna } from './poison.skill.js';
import { skok_z_cienia } from './shadow-leap.skill.js';
import { mgla_trucizn } from './poison-mist.skill.js';
import { sztylet_smierci } from './death-dagger.skill.js';
import { oslepienie } from './blind.skill.js';
import { paraliz } from './paralysis.skill.js';
import { mgla_lodu } from './ice-mist.skill.js';

export const ROGUE_SKILLS: Record<string, Skill> = {
  [cios_w_plecy.id]: cios_w_plecy,
  [trucizna.id]: trucizna,
  [skok_z_cienia.id]: skok_z_cienia,
  [mgla_trucizn.id]: mgla_trucizn,
  [sztylet_smierci.id]: sztylet_smierci,
  [oslepienie.id]: oslepienie,
  [paraliz.id]: paraliz,
  [mgla_lodu.id]: mgla_lodu,
};
