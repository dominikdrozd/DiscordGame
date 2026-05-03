import type { QuestDef } from './quest.js';

/**
 * Q4 — Marek daje materiały na **wędkę** (4× Sosna). Skraftuj, łów.
 * Drop "Łuska Cykady" 30% z każdego rzutu wędką. Uczy: fishing.
 */
export const marekRod: QuestDef = {
  id: 'marek_rod',
  name: 'Wędka i Łuska Cykady',
  description:
    'Marek dał ci 4× Sosnę na **Wędkę**. Skraftuj ją w `/craft` i łów w `/fish` — z każdą rybą masz 30% szans na **Łuskę Cykady**. Wróć z 1.',
  giverNpcId: 'marek',
  prerequisiteQuestIds: ['marek_axe'],
  materialsOnTake: { wood_sosna: 4 },
  gatheringDrop: { skill: 'fishing', itemId: 'marek_fish_token', chance: 0.3 },
  turnInItem: { itemId: 'marek_fish_token', qty: 1 },
  reward: {
    gold: 250,
    xp: 120,
  },
};
