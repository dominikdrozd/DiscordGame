import type { QuestDef } from './quest.js';

export const thordinSmoczy: QuestDef = {
  id: 'thordin_smoczy',
  name: 'Thordin: Smocze Drewno',
  description:
    'Drwal Thordin w Twierdzy potrzebuje **5× Drewna Smoczego Dębu** do bramy podziemia. Woodcutting lvl 35+.',
  giverNpcId: 'thordin',
  prerequisiteQuestIds: ['borut_heban'],
  turnInItem: { itemId: 'wood_smoczy', qty: 5 },
  reward: { gold: 1500, xp: 800, rewardItemId: 'potion_small' },
};
