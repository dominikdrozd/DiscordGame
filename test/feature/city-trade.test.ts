import fs from 'node:fs';
import { CityService } from '../../src/modules/game/services/city.service.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { tmpPlayerFile } from '../helpers/factories.js';

interface FakeMsg {
  author: { id: string };
  member: null;
  reply: jest.Mock;
}

function makeMsg(authorId = 'p1'): FakeMsg {
  return {
    author: { id: authorId },
    member: null,
    reply: jest.fn().mockResolvedValue({}),
  };
}

describe('city trade feature flow', () => {
  let file: string;
  let stats: PlayerStatsService;
  let city: CityService;

  beforeEach(() => {
    file = tmpPlayerFile();
    stats = new PlayerStatsService(file);
    city = new CityService(stats);
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  test('buy decrements gold and pushes resource to inventory at city listed price', async () => {
    const player = stats.get('p1', 'Tester');
    const msg = makeMsg('p1');
    // Port Cykada (region 1, no lvl req): rybak_borys sells fish_sardynka @ 5 gold.
    await city.handle({
      client: {} as never,
      msg,
      prompt: 'buy port_cykada fish_sardynka 3',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(player.gold).toBe(100 - 15);
    expect(player.inventory.resources.fish_sardynka).toBe(3);
  });

  test('buy fails when insufficient gold without mutating inventory', async () => {
    const player = stats.get('p1', 'Tester');
    player.gold = 4;
    const msg = makeMsg('p1');
    await city.handle({
      client: {} as never,
      msg,
      prompt: 'buy port_cykada fish_karp 1',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(player.gold).toBe(4);
    expect(player.inventory.resources.fish_karp).toBeUndefined();
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Brakuje złota'));
  });

  test('sell finds best offer across cities and credits gold', async () => {
    const player = stats.get('p1', 'Tester');
    stats.addResource(player, 'ore_iron', 5);
    const msg = makeMsg('p1');
    await city.handle({
      client: {} as never,
      msg,
      prompt: 'sell ore_iron 5',
      registerThread: () => {},
      forgetThread: () => {},
    });
    // Port Cykada gornik_witold buys ore_iron @ 10 × 0.5 mult = 5/szt × 5 = 25
    expect(player.gold).toBe(100 + 25);
    expect(player.inventory.resources.ore_iron ?? 0).toBe(0);
  });

  test('info wymaga combat lvl region', async () => {
    const player = stats.get('p1', 'Tester');
    player.skills.combat.level = 1;
    const msg = makeMsg('p1');
    // Czarna Cytadela: region 4 wymaga combat lvl 24
    await city.handle({
      client: {} as never,
      msg,
      prompt: 'info czarna_cytadela',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Regionie 4'));
  });

  test('buy fails when no merchant in city sells the item', async () => {
    const player = stats.get('p1', 'Tester');
    const msg = makeMsg('p1');
    await city.handle({
      client: {} as never,
      msg,
      prompt: 'buy port_cykada gem_diamond 1',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(player.gold).toBe(100);
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('nikt nie sprzedaje'));
  });

  test('sell fails when item not in inventory', async () => {
    const msg = makeMsg('p1');
    await city.handle({
      client: {} as never,
      msg,
      prompt: 'sell ore_iron',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Nie masz'));
  });
});
