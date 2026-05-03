import type { QuestDef } from './quest.js';

export const helaKarp: QuestDef = {
  id: 'hela_karp',
  name: 'Babcia Hela: Karpie na obiad',
  description:
    'Babcia Hela z Portu Cykada chce **5× Karpia** na rosół. Łów w `/fish` lub kup u Borysa.',
  giverNpcId: 'hela',
  prerequisiteQuestIds: ['marek_duel'],
  turnInItem: { itemId: 'fish_karp', qty: 5 },
  reward: { gold: 100, xp: 60 },
};
