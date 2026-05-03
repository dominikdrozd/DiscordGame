import type { Skill } from '../index.js';
import { splot_korzeni } from './root-weave.skill.js';
import { kora_debu } from './oak-bark.skill.js';
import { gaj_zycia } from './grove-of-life.skill.js';
import { piorun } from './lightning.skill.js';
import { skarbnica_zycia } from './life-treasury.skill.js';
import { promien_slonca } from './sunbeam.skill.js';
import { tornado } from './tornado.skill.js';
import { wir } from './elemental-vortex.skill.js';

export const DRUID_SKILLS: Record<string, Skill> = {
  [splot_korzeni.id]: splot_korzeni,
  [kora_debu.id]: kora_debu,
  [gaj_zycia.id]: gaj_zycia,
  [piorun.id]: piorun,
  [skarbnica_zycia.id]: skarbnica_zycia,
  [promien_slonca.id]: promien_slonca,
  [tornado.id]: tornado,
  [wir.id]: wir,
};
