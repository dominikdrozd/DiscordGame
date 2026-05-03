import type { QuestDef } from './quest.js';
import { firstSteps } from './first-steps.quest.js';

export type { QuestDef, QuestReward } from './quest.js';

/**
 * Rejestr questów — każdy quest registered here jest dostępny w grze
 * (przez NPC z `giverNpcId` i przez `/quest` command).
 */
export const QUESTS: Record<string, QuestDef> = {
  [firstSteps.id]: firstSteps,
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
