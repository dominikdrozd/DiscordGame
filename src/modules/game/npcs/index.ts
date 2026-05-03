import { Npc } from './npc.js';
import { listCities } from '../cities/index.js';

export { Npc, Dialog } from './npc.js';
export type { DialogNode, DialogOption, DialogContext } from './npc.js';

export { Marek } from './port-cicada/marek.npc.js';
export { Bartek } from './port-cicada/bartek.npc.js';
export { Hela } from './port-cicada/hela.npc.js';
export { Olek } from './port-cicada/olek.npc.js';

export { Janosz } from './oakhaven/janosz.npc.js';
export { Eryk } from './oakhaven/eryk.npc.js';
export { Borut } from './oakhaven/borut.npc.js';

export { GromBlacksmith } from './dwarven-fortress/grom-blacksmith.npc.js';
export { Druin } from './dwarven-fortress/druin.npc.js';
export { Thordin } from './dwarven-fortress/thordin.npc.js';

export { Wraul } from './black-citadel/wraul.npc.js';
export { KrakenHunter } from './black-citadel/kraken-hunter.npc.js';
export { TreeGuardian } from './black-citadel/tree-guardian.npc.js';

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
