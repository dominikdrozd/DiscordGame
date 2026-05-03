import type { QuestDef } from './quest.js';
import { firstSteps } from './first-steps.quest.js';
import { marekPickRace } from './marek-pick-race.quest.js';
import { marekPickClass } from './marek-pick-class.quest.js';
import { marekPickaxe } from './marek-pickaxe.quest.js';
import { marekAxe } from './marek-axe.quest.js';
import { marekRod } from './marek-rod.quest.js';
import { marekUpgrade } from './marek-upgrade.quest.js';
import { marekDuel } from './marek-duel.quest.js';

import { bartekCopper } from './bartek-copper.quest.js';
import { bartekSilver } from './bartek-silver.quest.js';
import { janoszGold } from './janosz-gold.quest.js';
import { gromMithril } from './grom-mithril.quest.js';
import { wraulDiamond } from './wraul-diamond.quest.js';

import { helaKarp } from './hela-karp.quest.js';
import { helaSzczupak } from './hela-szczupak.quest.js';
import { erykSum } from './eryk-sum.quest.js';
import { druinMarlin } from './druin-marlin.quest.js';
import { lowcaKraken } from './lowca-kraken.quest.js';

import { olekSosna } from './olek-sosna.quest.js';
import { olekBuk } from './olek-buk.quest.js';
import { borutHeban } from './borut-heban.quest.js';
import { thordinSmoczy } from './thordin-smoczy.quest.js';
import { straznikSwiatowe } from './straznik-swiatowe.quest.js';

export type { QuestDef, QuestReward } from './quest.js';

/**
 * Rejestr questów. Dwie warstwy:
 *
 * **Tutorial Marka (8 questów, Port Cykada):**
 *  1. first_steps → 2. marek_pick_race → 3. marek_pick_class → 4. marek_pickaxe
 *  → 5. marek_axe → 6. marek_rod → 7. marek_upgrade → 8. marek_duel
 *
 * **Profession chains (3 × 5 stages, post-Marek):** każdy chain wymaga
 * `marek_duel` jako prereq stage 1. Stage 2 prereq = stage 1 itd.
 * Chainy prowadzą gracza przez 4 miasta (T1+T2 w Porcie u jednego NPC,
 * T3 w Oakhaven, T4 w Twierdzy, T5 w Cytadeli). Reward gold/xp skaluje
 * się z tierem; co drugi stage daje potion_small, ostatni stage daje
 * sword_mithril jako endgame trophy.
 *
 *  - górniczy: bartek_copper → bartek_silver → janosz_gold → grom_mithril → wraul_diamond
 *  - rybacki:  hela_karp → hela_szczupak → eryk_sum → druin_marlin → lowca_kraken
 *  - drwala:   olek_sosna → olek_buk → borut_heban → thordin_smoczy → straznik_swiatowe
 */
export const QUESTS: Record<string, QuestDef> = {
  [firstSteps.id]: firstSteps,
  [marekPickRace.id]: marekPickRace,
  [marekPickClass.id]: marekPickClass,
  [marekPickaxe.id]: marekPickaxe,
  [marekAxe.id]: marekAxe,
  [marekRod.id]: marekRod,
  [marekUpgrade.id]: marekUpgrade,
  [marekDuel.id]: marekDuel,

  [bartekCopper.id]: bartekCopper,
  [bartekSilver.id]: bartekSilver,
  [janoszGold.id]: janoszGold,
  [gromMithril.id]: gromMithril,
  [wraulDiamond.id]: wraulDiamond,

  [helaKarp.id]: helaKarp,
  [helaSzczupak.id]: helaSzczupak,
  [erykSum.id]: erykSum,
  [druinMarlin.id]: druinMarlin,
  [lowcaKraken.id]: lowcaKraken,

  [olekSosna.id]: olekSosna,
  [olekBuk.id]: olekBuk,
  [borutHeban.id]: borutHeban,
  [thordinSmoczy.id]: thordinSmoczy,
  [straznikSwiatowe.id]: straznikSwiatowe,
};

export function getQuest(id: string): QuestDef | undefined {
  return QUESTS[id];
}

export function listQuests(): QuestDef[] {
  return Object.values(QUESTS);
}

/** Questy oferowane przez danego NPC (po `giverNpcId`). */
export function questsFromNpc(npcId: string): QuestDef[] {
  return listQuests().filter((q) => q.giverNpcId === npcId);
}
