import { CraftService } from '../../src/modules/game/services/craft.service.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { mongoPlayerStats, type MongoStatsTest } from '../helpers/factories.js';

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

describe('craft feature flow', () => {
  let testCtx: MongoStatsTest;
  let stats: PlayerStatsService;
  let craft: CraftService;

  beforeEach(async () => {
    testCtx = await mongoPlayerStats();
    stats = testCtx.stats;
    craft = new CraftService(stats);
  });

  afterEach(async () => {
    await testCtx.cleanup();
  });

  test('craft outputResource (potion_small) trafia do inventory.resources zamiast items', async () => {
    const player = stats.get('p1', 'Tester');
    stats.addResource(player, 'fish_karp', 1);
    stats.addResource(player, 'wood_sosna', 1);
    const msg = makeMsg('p1');
    await craft.handle({
      client: {} as never,
      msg,
      prompt: 'potion_small',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(player.inventory.resources.potion_small).toBe(1);
    expect(stats.getItemsForPlayer(player.id)).toHaveLength(0);
    expect(player.inventory.resources.fish_karp ?? 0).toBe(0);
    expect(player.inventory.resources.wood_sosna ?? 0).toBe(0);
  });

  test('craft consumes ingredients and adds output item to inventory (sword_iron)', async () => {
    const player = stats.get('p1', 'Tester');
    player.skills.crafting.level = 5;
    stats.addResource(player, 'ore_iron', 4);
    stats.addResource(player, 'wood_dab', 2);
    const msg = makeMsg('p1');
    await craft.handle({
      client: {} as never,
      msg,
      prompt: 'sword_iron',
      registerThread: () => {},
      forgetThread: () => {},
    });
    const items = stats.getItemsForPlayer(player.id);
    expect(items).toHaveLength(1);
    expect(items[0].baseId).toBe('sword_iron');
    expect(player.inventory.resources.ore_iron ?? 0).toBe(0);
    expect(player.inventory.resources.wood_dab ?? 0).toBe(0);
  });

  test('craft fails when crafting skill below recipe required level', async () => {
    const player = stats.get('p1', 'Tester');
    stats.addResource(player, 'ore_iron', 4);
    stats.addResource(player, 'wood_dab', 2);
    const msg = makeMsg('p1');
    await craft.handle({
      client: {} as never,
      msg,
      prompt: 'sword_iron',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(stats.getItemsForPlayer(player.id)).toHaveLength(0);
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('za niski lvl craftingu'));
  });

  test('craft awards xpReward and may level the crafting skill', async () => {
    const player = stats.get('p1', 'Tester');
    stats.addResource(player, 'fish_karp', 1);
    stats.addResource(player, 'wood_sosna', 1);
    const beforeXp = player.skills.crafting.xp;
    const msg = makeMsg('p1');
    await craft.handle({
      client: {} as never,
      msg,
      prompt: 'potion_small',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(player.skills.crafting.xp).toBe(beforeXp + 10);
  });

  test('craft replies with error for unknown recipe id', async () => {
    const player = stats.get('p1', 'Tester');
    void player;
    const msg = makeMsg('p1');
    await craft.handle({
      client: {} as never,
      msg,
      prompt: 'unobtanium_axe',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Nie ma przepisu'));
  });

  test('craft fails when ingredients missing', async () => {
    const player = stats.get('p1', 'Tester');
    const msg = makeMsg('p1');
    await craft.handle({
      client: {} as never,
      msg,
      prompt: 'potion_small',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(player.inventory.resources.potion_small).toBeUndefined();
    expect(msg.reply).toHaveBeenCalledWith(expect.stringMatching(/brak (Karp|Sosna)/));
  });
});
