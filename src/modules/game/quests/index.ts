import type { QuestDef } from './quest.js';
import { firstSteps } from './first-steps.quest.js';
import { marekPickRace } from './marek-pick-race.quest.js';
import { marekPickClass } from './marek-pick-class.quest.js';
import { marekPickaxe } from './marek-pickaxe.quest.js';
import { marekAxe } from './marek-axe.quest.js';
import { marekRod } from './marek-rod.quest.js';
import { marekUpgrade } from './marek-upgrade.quest.js';
import { marekDuel } from './marek-duel.quest.js';

export type { QuestDef, QuestReward } from './quest.js';

/**
 * Rejestr questów. Marek z Portu Cykada prowadzi 8-stopniowy tutorial:
 *  1. first_steps — pierwsza wyprawa (cykada_token)
 *  2. marek_pick_race — wybór rasy (`/race pick`)
 *  3. marek_pick_class — wybór klasy (`/class pick`)
 *  4. marek_pickaxe — kup materiały, kilof, mining (marek_ore)
 *  5. marek_axe — Marek daje materiały, siekiera, chop (marek_log)
 *  6. marek_rod — Marek daje materiały, wędka, fish (marek_fish_token)
 *  7. marek_upgrade — ulepsz item u kowala (auto-complete)
 *  8. marek_duel — pojedynek PvP (auto-complete, różne komentarze)
 *
 * Każdy quest ma poprzedni jako prerequisite. Po `marek_duel` Marek
 * skieruje gracza do innych NPC (górnik/drwal/rybak/rzemieślnik —
 * w kolejnej iteracji).
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
