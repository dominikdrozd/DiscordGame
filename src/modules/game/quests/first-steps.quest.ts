import type { QuestDef } from './quest.js';

/**
 * Q1 — pierwszy quest tutorialowy. Marek prosi o przyniesienie pamiątki
 * z dowolnej wyprawy. Drop **100% per claim** dopóki quest aktywny —
 * gracz musi WZIĄĆ questa przed wyprawą, inaczej token nie wpadnie.
 *
 * Demonstracja: dialog → take → expedition flow → claim → drop → turn-in.
 */
export const firstSteps: QuestDef = {
  id: 'first_steps',
  name: 'Pierwsza Wyprawa',
  description:
    'Idź na **dowolną wyprawę** mając tego questa aktywnego — Cykada Token wpadnie ci do plecaka po zakończeniu (100%). Wróć do Marka po nagrodę.',
  giverNpcId: 'marek',
  expeditionDrop: { itemId: 'cykada_token', chance: 1.0 },
  turnInItem: { itemId: 'cykada_token', qty: 1 },
  reward: {
    gold: 200,
    xp: 100,
    combatXp: 50,
  },
};
