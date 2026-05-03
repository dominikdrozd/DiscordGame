import type { Skill } from '../index.js';
import { kula_ognia } from './fireball.skill.js';
import { lodowy_grad } from './ice-hail.skill.js';
import { meteor } from './meteor.skill.js';
import { mrozny_strzal } from './frost-bolt.skill.js';
import { odrodzenie } from './phoenix-rebirth.skill.js';
import { pieklo } from './hellfire.skill.js';
import { lodowa_burza } from './ice-storm.skill.js';
import { krysztal_obrony } from './crystal-shield.skill.js';

export const MAGE_SKILLS: Record<string, Skill> = {
  [kula_ognia.id]: kula_ognia,
  [lodowy_grad.id]: lodowy_grad,
  [meteor.id]: meteor,
  [mrozny_strzal.id]: mrozny_strzal,
  [odrodzenie.id]: odrodzenie,
  [pieklo.id]: pieklo,
  [lodowa_burza.id]: lodowa_burza,
  [krysztal_obrony.id]: krysztal_obrony,
};
