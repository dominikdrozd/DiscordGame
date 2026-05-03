import type { QuestDef } from './quest.js';

/**
 * Q2 — kup materiały na **kilof** (3 ore_copper + 2 wood_sosna),
 * skraftuj w `/craft`, idź na `/mine`. Drop "Próbka Rudy Marka" 30%
 * z każdego miningu dopóki quest active. Uczy: shop → craft → mine.
 */
export const marekPickaxe: QuestDef = {
  id: 'marek_pickaxe',
  name: 'Kilof i Próbka Rudy',
  description:
    'Marek prosi o próbkę rudy. Kup materiały u **Górnika Witolda** (3× Ruda Miedzi, 2× Sosna), skraftuj **Kilof** w `/craft`, potem `/mine` — z każdym wykopiskiem masz 30% szans na **Próbkę Rudy Marka**. Wróć z 1 sztuką.',
  giverNpcId: 'marek',
  prerequisiteQuestIds: ['marek_pick_class'],
  gatheringDrop: { skill: 'mining', itemId: 'marek_ore', chance: 0.3 },
  turnInItem: { itemId: 'marek_ore', qty: 1 },
  reward: {
    gold: 150,
    xp: 80,
  },
};
