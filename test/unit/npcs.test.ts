import { listCities } from '../../src/modules/game/cities/index.js';
import { findNpcCity, getNpc } from '../../src/modules/game/npcs/index.js';
import { Marek } from '../../src/modules/game/npcs/port-cicada/marek.npc.js';
import type { Dialog } from '../../src/modules/game/npcs/npc.js';

function collectReachableNodes(d: Dialog): Set<string> {
  const reachable = new Set<string>([d.startNodeId]);
  const queue: string[] = [d.startNodeId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    const node = d.getNode(id);
    if (!node) continue;
    for (const opt of node.options) {
      if (opt.goto === 'end') continue;
      if (!reachable.has(opt.goto)) {
        reachable.add(opt.goto);
        queue.push(opt.goto);
      }
    }
  }
  return reachable;
}

describe('NPC registry & dialog graphs', () => {
  test('Port Cykada has Marek + 3 profession-chain starters (bartek/hela/olek)', () => {
    const city = listCities().find((c) => c.id === 'port_cykada');
    expect(city).toBeDefined();
    expect(city?.npcs.map((n) => n.id).sort()).toEqual(
      ['bartek', 'hela', 'marek', 'olek'].sort(),
    );
  });

  test('Oakhaven, Twierdza, Cytadela mają po 3 NPC (gornik/rybak/drwal)', () => {
    const expected: Record<string, string[]> = {
      oakhaven: ['janosz', 'eryk', 'borut'],
      krasnoludzka_twierdza: ['grom_kowal', 'druin', 'thordin'],
      czarna_cytadela: ['wraul', 'lowca_krakena', 'straznik_drzewa'],
    };
    for (const [cityId, ids] of Object.entries(expected)) {
      const c = listCities().find((x) => x.id === cityId);
      expect(c?.npcs.map((n) => n.id).sort()).toEqual(ids.sort());
    }
  });

  test('getNpc resolves NPC by id across all cities', () => {
    expect(getNpc('marek')?.name).toBe('Stary Marek');
    expect(getNpc('nieistniejacy')).toBeUndefined();
  });

  test('findNpcCity returns city placement for known NPC', () => {
    const found = findNpcCity('marek');
    expect(found?.cityId).toBe('port_cykada');
    expect(found?.npc.id).toBe('marek');
    expect(findNpcCity('foo')).toBeUndefined();
  });

  test('Marek dialog: every option goto target is either a defined node or "end"', () => {
    const marek = new Marek();
    const nodeIds = new Set(Object.keys(marek.dialog.nodes));
    for (const [_id, node] of Object.entries(marek.dialog.nodes)) {
      for (const opt of node.options) {
        if (opt.goto === 'end') continue;
        expect(nodeIds.has(opt.goto)).toBe(true);
      }
    }
  });

  test('Marek dialog: startNode exists and is reachable', () => {
    const marek = new Marek();
    expect(marek.dialog.getNode(marek.dialog.startNodeId)).toBeDefined();
  });

  test('Marek dialog: every node is reachable from startNode (no orphans)', () => {
    const marek = new Marek();
    const reachable = collectReachableNodes(marek.dialog);
    for (const id of Object.keys(marek.dialog.nodes)) {
      expect(reachable.has(id)).toBe(true);
    }
  });

  test('Marek dialog: at least one path leads to "end"', () => {
    const marek = new Marek();
    const hasEndOption = Object.values(marek.dialog.nodes).some((n) =>
      n.options.some((o) => o.goto === 'end'),
    );
    expect(hasEndOption).toBe(true);
  });

  test('wszyscy NPC w rejestrze: dialog graf bez orphans + wszystkie goto valid', () => {
    for (const city of listCities()) {
      for (const npc of city.npcs) {
        const dialog = npc.dialog;
        const nodeIds = new Set(Object.keys(dialog.nodes));
        for (const [nodeId, node] of Object.entries(dialog.nodes)) {
          for (const opt of node.options) {
            if (opt.goto === 'end') continue;
            if (!nodeIds.has(opt.goto)) {
              throw new Error(
                `${npc.id}: node "${nodeId}" → "${opt.goto}" nie istnieje w grafie`,
              );
            }
          }
        }
        const reachable = collectReachableNodes(dialog);
        for (const id of nodeIds) {
          if (!reachable.has(id)) {
            throw new Error(`${npc.id}: node "${id}" nieosiągalny ze startNodeId`);
          }
        }
        // każdy ma ≥1 path do end (przynajmniej "Bywaj.")
        const hasEnd = Object.values(dialog.nodes).some((n) =>
          n.options.some((o) => o.goto === 'end'),
        );
        if (!hasEnd) throw new Error(`${npc.id}: brak ścieżki do "end"`);
      }
    }
  });
});
