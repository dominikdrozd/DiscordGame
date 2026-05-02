import { Npc } from './npc.js';
import { listCities } from '../cities/index.js';

export { Npc, Dialog } from './npc.js';
export type { DialogNode, DialogOption, DialogContext } from './npc.js';
export { Marek } from './port_cykada/marek.npc.js';

/**
 * Globalny lookup NPC po `id` — agreguje wszystkich NPC z wszystkich miast.
 * Używany przez `DialogService` przy resolve z customId i przez `.talk` command.
 *
 * Walking jest tani (max kilka miast × kilka NPC) i zawsze zwraca aktualny stan rejestru.
 */
export function getNpc(id: string): Npc | undefined {
  for (const city of listCities()) {
    for (const npc of city.npcs) {
      if (npc.id === id) return npc;
    }
  }
  return undefined;
}

export function findNpcCity(npcId: string): { cityId: string; npc: Npc } | undefined {
  for (const city of listCities()) {
    for (const npc of city.npcs) {
      if (npc.id === npcId) return { cityId: city.id, npc };
    }
  }
  return undefined;
}
