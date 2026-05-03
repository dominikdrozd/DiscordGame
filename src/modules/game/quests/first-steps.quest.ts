import type { QuestDef } from './quest.js';

/**
 * Pierwszy quest dany przez Marka w Porcie Cykada. Gracz idzie na wyprawy
 * w nadziei na drop "Cykada Token" (30% per claim). Z 1 tokenem wraca do
 * Marka po nagrodę. Demonstruje:
 *  - dialog conditional (Marek ofera quest tylko jak nie jest started)
 *  - expedition drop hook (token dropujący tylko gdy quest active)
 *  - turn-in via dialog effect (consumed item + reward)
 */
export const firstSteps: QuestDef = {
  id: 'first_steps',
  name: 'Pierwsze Kroki',
  description:
    'Stary Marek prosi cię o przyniesienie pamiątki z wyprawy — **Cykada Token**. Idź na dowolną wyprawę, jest 30% szans że token wpadnie do plecaka. Wróć do Marka.',
  giverNpcId: 'marek',
  expeditionDrop: { itemId: 'cykada_token', chance: 0.3 },
  turnInItem: { itemId: 'cykada_token', qty: 1 },
  reward: {
    gold: 200,
    xp: 100,
    combatXp: 50,
  },
};
