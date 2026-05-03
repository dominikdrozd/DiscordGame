import type { QuestDef } from './quest.js';

/**
 * Q5 — ulepsz dowolny item u kowala. Auto-complete przy pierwszym
 * udanym `SmithService.tryUpgrade` po wzięciu questa. Uczy: smith flow.
 */
export const marekUpgrade: QuestDef = {
  id: 'marek_upgrade',
  name: 'Próba Kowala',
  description:
    'Marek wysyła cię do **Kowala** — idź do `/menu` → 🏛️ Miasta → Port Cykada → 🔨 Kowal i ulepsz **dowolny** item (broń/zbroja/narzędzie). Quest zalicza się przy pierwszym udanym upgradzie.',
  giverNpcId: 'marek',
  prerequisiteQuestIds: ['marek_rod'],
  triggerOnUpgrade: true,
  reward: {
    gold: 300,
    xp: 150,
    combatXp: 50,
  },
};
