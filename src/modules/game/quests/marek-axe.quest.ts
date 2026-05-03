import type { QuestDef } from './quest.js';

/**
 * Q3 — Marek daje materiały na **siekierę** (`materialsOnTake`).
 * Skraftuj w `/craft`, pochop w `/chop`. Drop "Próbka Drewna Marka" 30%.
 * Uczy: starter pack → craft → woodcutting.
 */
export const marekAxe: QuestDef = {
  id: 'marek_axe',
  name: 'Siekiera i Drewno',
  description:
    'Marek dał ci materiały na **Siekierę** (2× Miedź, 3× Sosna w plecaku). Skraftuj ją w `/craft` i idź na `/chop` — drop **Próbki Drewna Marka** 30% za każdym razem. Wróć z 1 sztuką.',
  giverNpcId: 'marek',
  prerequisiteQuestIds: ['marek_pickaxe'],
  materialsOnTake: { ore_copper: 2, wood_sosna: 3 },
  gatheringDrop: { skill: 'woodcutting', itemId: 'marek_log', chance: 0.3 },
  turnInItem: { itemId: 'marek_log', qty: 1 },
  reward: {
    gold: 200,
    xp: 100,
  },
};
