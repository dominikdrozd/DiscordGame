import { Npc } from './npc.js';
import { listCities } from '../cities/index.js';

export { Npc, Dialog } from './npc.js';
export type { DialogNode, DialogOption, DialogContext } from './npc.js';

export { Marek } from './port_cykada/marek.npc.js';
export { Bartek } from './port_cykada/bartek.npc.js';
export { Hela } from './port_cykada/hela.npc.js';
export { Olek } from './port_cykada/olek.npc.js';

export { Janosz } from './oakhaven/janosz.npc.js';
export { Eryk } from './oakhaven/eryk.npc.js';
export { Borut } from './oakhaven/borut.npc.js';

export { GromKowal } from './krasnoludzka_twierdza/grom-kowal.npc.js';
export { Druin } from './krasnoludzka_twierdza/druin.npc.js';
export { Thordin } from './krasnoludzka_twierdza/thordin.npc.js';

export { Wraul } from './czarna_cytadela/wraul.npc.js';
export { LowcaKrakena } from './czarna_cytadela/lowca-krakena.npc.js';
export { StraznikDrzewa } from './czarna_cytadela/straznik-drzewa.npc.js';

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
