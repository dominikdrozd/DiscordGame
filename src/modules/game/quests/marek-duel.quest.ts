import type { QuestDef } from './quest.js';

/**
 * Q6 — pojedynek PvP. Auto-complete po dowolnym pojedynku (wygrana
 * lub przegrana — różne komentarze w dialogu Marka). Walka MUSI być
 * po wzięciu questa: hook `QuestService.onDuelComplete` aktywny tylko
 * dla active questów. Uczy: PvP / `/duel`.
 */
export const marekDuel: QuestDef = {
  id: 'marek_duel',
  name: 'Pojedynek na Pomoście',
  description:
    'Marek prosi o jeden **pojedynek PvP** — `.duel @user` lub `/duel user:<...>`. Wygrana lub przegrana — quest się zalicza, ale Marek powie różne rzeczy. Walka MUSI być po wzięciu questa.',
  giverNpcId: 'marek',
  prerequisiteQuestIds: ['marek_upgrade'],
  triggerOnDuel: true,
  reward: {
    gold: 400,
    xp: 200,
    combatXp: 100,
  },
};
