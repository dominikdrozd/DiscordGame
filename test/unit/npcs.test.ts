import { listCities } from '../../src/modules/game/cities/index.js';
import { findNpcCity, getNpc } from '../../src/modules/game/npcs/index.js';
import { Marek } from '../../src/modules/game/npcs/port_cykada/marek.npc.js';
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
  test('Port Cykada has Marek registered with id "marek"', () => {
    const city = listCities().find((c) => c.id === 'port_cykada');
    expect(city).toBeDefined();
    expect(city?.npcs.map((n) => n.id)).toEqual(['marek']);
  });

  test('other cities (region 2-4) start with empty NPC list', () => {
    for (const id of ['oakhaven', 'krasnoludzka_twierdza', 'czarna_cytadela']) {
      const c = listCities().find((x) => x.id === id);
      expect(c?.npcs).toEqual([]);
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
});
