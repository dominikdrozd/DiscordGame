import { InventoryService } from '../../src/modules/game/services/inventory.service.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { rollItemInstance } from '../../src/modules/game/services/items.js';
import { mongoPlayerStats, type MongoStatsTest } from '../helpers/factories.js';

interface FakeMessage {
  edit: jest.Mock;
  id: string;
}

interface FakeThread {
  id: string;
  send: jest.Mock;
  setArchived: jest.Mock;
  delete: jest.Mock;
  members: { add: jest.Mock };
  messages: { fetch: jest.Mock };
  parent: { send: jest.Mock };
  _msgs: Map<string, FakeMessage>;
}

function makeThread(threadId = 't_inv'): FakeThread {
  const msgs = new Map<string, FakeMessage>();
  let counter = 0;
  const send = jest.fn(async (_payload: unknown) => {
    counter++;
    const id = `m${counter}`;
    const m: FakeMessage = { id, edit: jest.fn().mockResolvedValue({}) };
    msgs.set(id, m);
    return { id };
  });
  return {
    id: threadId,
    send,
    setArchived: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    members: { add: jest.fn().mockResolvedValue({}) },
    messages: { fetch: jest.fn(async (id: string) => msgs.get(id) ?? null) },
    parent: { send: jest.fn().mockResolvedValue({ id: 'p1' }) },
    _msgs: msgs,
  };
}

interface FakeChannel {
  threads: { create: jest.Mock };
}

function makeChannel(thread: FakeThread): FakeChannel {
  return {
    threads: { create: jest.fn().mockResolvedValue(thread) },
  };
}

interface FakeMsgCtx {
  author: { id: string; globalName?: string; username: string };
  channel: { id: string };
  reply: jest.Mock;
}

function makeMsg(authorId: string, threadId: string): FakeMsgCtx {
  return {
    author: { id: authorId, username: 'tester', globalName: 'Tester' },
    channel: { id: threadId },
    reply: jest.fn().mockResolvedValue({}),
  };
}

interface FakeBtnInteraction {
  isButton: () => boolean;
  customId: string;
  user: { id: string; username: string; globalName?: string };
  replied: boolean;
  deferred: boolean;
  update: jest.Mock;
  reply: jest.Mock;
  followUp: jest.Mock;
}

function makeBtn(customId: string, userId = 'p1'): FakeBtnInteraction {
  return {
    isButton: () => true,
    customId,
    user: { id: userId, username: 'tester', globalName: 'Tester' },
    replied: false,
    deferred: false,
    update: jest.fn().mockResolvedValue({}),
    reply: jest.fn().mockResolvedValue({}),
    followUp: jest.fn().mockResolvedValue({}),
  };
}

describe('InventoryService — single-message + text commands', () => {
  let testCtx: MongoStatsTest;
  let stats: PlayerStatsService;
  let service: InventoryService;
  let registerThread: jest.Mock;
  let reply: jest.Mock;

  beforeEach(async () => {
    testCtx = await mongoPlayerStats();
    stats = testCtx.stats;
    service = new InventoryService(stats);
    registerThread = jest.fn();
    reply = jest.fn().mockResolvedValue({});
  });

  afterEach(async () => {
    await testCtx.cleanup();
  });

  test('openInventoryForUser tworzy wątek + jedno listing message + close button', async () => {
    const player = stats.get('p1', 'Tester');
    const sword = rollItemInstance('sword_iron', 'common');
    const armor = rollItemInstance('armor_iron', 'common');
    if (!sword || !armor) throw new Error('roll failed');
    stats.addItem(player, sword);
    stats.addItem(player, armor);

    const thread = makeThread();
    const channel = makeChannel(thread);
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel,
      registerThread,
      reply,
    });

    expect(channel.threads.create).toHaveBeenCalledTimes(1);
    expect(thread.members.add).toHaveBeenCalledWith('p1');
    expect(registerThread).toHaveBeenCalledWith(thread);
    // Single listing message — text commands replace per-item buttons
    expect(thread.send).toHaveBeenCalledTimes(1);
    const sendCall = thread.send.mock.calls[0][0];
    expect(sendCall.content).toContain('Plecak Tester');
    expect(sendCall.content).toContain('Żelazny Miecz');
    expect(sendCall.content).toContain('Żelazna Zbroja');
  });

  test('drugie otwarcie czyści stary state w pamięci i otwiera świeży', async () => {
    stats.get('p1', 'Tester');
    const thread = makeThread();
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread),
      registerThread,
      reply,
    });
    const thread2 = makeThread('t2');
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread2),
      registerThread,
      reply,
    });
    // Świeży wątek powinien dostać listing
    expect(thread2.send).toHaveBeenCalled();
    // NIE wołamy delete na starym wątku (TTL go sprzątnie)
    expect(thread.delete).not.toHaveBeenCalled();
  });

  test('equip N text command zakłada item', async () => {
    const player = stats.get('p1', 'Tester');
    const sword = rollItemInstance('sword_iron', 'common');
    if (!sword) throw new Error('roll failed');
    stats.addItem(player, sword);
    const thread = makeThread();
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread),
      registerThread,
      reply,
    });

    expect(player.equipped.weapon).toBeUndefined();
    const msg = makeMsg('p1', thread.id);
    await service.show({
      msg: msg as never,
      prompt: 'equip 1',
      client: {} as never,
      registerThread,
      forgetThread: jest.fn(),
    });
    expect(player.equipped.weapon).toBe(sword.uid);
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Założono'));
  });

  test('unequip <slot> zdejmuje item', async () => {
    const player = stats.get('p1', 'Tester');
    const sword = rollItemInstance('sword_iron', 'common');
    if (!sword) throw new Error('roll failed');
    stats.addItem(player, sword);
    stats.equip(player, sword.uid);

    const thread = makeThread();
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread),
      registerThread,
      reply,
    });

    const msg = makeMsg('p1', thread.id);
    await service.show({
      msg: msg as never,
      prompt: 'unequip weapon',
      client: {} as never,
      registerThread,
      forgetThread: jest.fn(),
    });
    expect(player.equipped.weapon).toBeUndefined();
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Zdjęto'));
  });

  test('close text command zamyka plecak i pozwala otworzyć nowy', async () => {
    stats.get('p1', 'Tester');
    const thread = makeThread();
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread),
      registerThread,
      reply,
    });

    const msg = makeMsg('p1', thread.id);
    await service.show({
      msg: msg as never,
      prompt: 'close',
      client: {} as never,
      registerThread,
      forgetThread: jest.fn(),
    });
    expect(thread.delete).toHaveBeenCalledTimes(1);

    reply.mockClear();
    const thread2 = makeThread('t2');
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread2),
      registerThread,
      reply,
    });
    expect(reply).not.toHaveBeenCalled();
    expect(thread2.send).toHaveBeenCalled();
  });

  test('sell N usuwa item i dodaje złoto', async () => {
    const player = stats.get('p1', 'Tester');
    const initialGold = player.gold;
    const sword = rollItemInstance('sword_iron', 'common');
    if (!sword) throw new Error('roll failed');
    sword.stats = { attack: 5 };
    sword.rarity = 'common';
    stats.addItem(player, sword);

    const thread = makeThread();
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread),
      registerThread,
      reply,
    });

    const msg = makeMsg('p1', thread.id);
    await service.show({
      msg: msg as never,
      prompt: 'sell 1',
      client: {} as never,
      registerThread,
      forgetThread: jest.fn(),
    });

    expect(stats.findItem(player, sword.uid)).toBeUndefined();
    expect(player.gold).toBe(initialGold + 15);
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Sprzedano'));
  });

  test('sell odmawia gdy item założony — wymaga unequip', async () => {
    const player = stats.get('p1', 'Tester');
    const initialGold = player.gold;
    const sword = rollItemInstance('sword_iron', 'common');
    if (!sword) throw new Error('roll failed');
    stats.addItem(player, sword);
    stats.equip(player, sword.uid);

    const thread = makeThread();
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread),
      registerThread,
      reply,
    });

    const msg = makeMsg('p1', thread.id);
    await service.show({
      msg: msg as never,
      prompt: 'sell 1',
      client: {} as never,
      registerThread,
      forgetThread: jest.fn(),
    });

    expect(stats.findItem(player, sword.uid)).toBeDefined();
    expect(player.gold).toBe(initialGold);
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Pominięte'));
  });

  test('cross-user — obcy nie może wydawać komend w cudzym wątku', async () => {
    stats.get('p1', 'Tester');
    const thread = makeThread();
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread),
      registerThread,
      reply,
    });

    const intruderMsg = makeMsg('p2', thread.id);
    await service.show({
      msg: intruderMsg as never,
      prompt: 'sell 1',
      client: {} as never,
      registerThread,
      forgetThread: jest.fn(),
    });
    expect(intruderMsg.reply).toHaveBeenCalledWith(
      expect.stringContaining('To plecak'),
    );
  });

  test('use jako komenda nie istnieje — daje hint o niezrozumianej komendzie', async () => {
    const player = stats.get('p1', 'Tester');
    player.inventory.resources['potion_small'] = 3;
    const thread = makeThread();
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread),
      registerThread,
      reply,
    });

    const msg = makeMsg('p1', thread.id);
    await service.show({
      msg: msg as never,
      prompt: 'use potion_small',
      client: {} as never,
      registerThread,
      forgetThread: jest.fn(),
    });
    expect(player.inventory.resources['potion_small']).toBe(3);
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('Nieznana komenda'));
  });

  test('close button (legacy) zamyka plecak', async () => {
    stats.get('p1', 'Tester');
    const thread = makeThread();
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(thread),
      registerThread,
      reply,
    });

    const close = makeBtn('inv:close:p1');
    await service.handleInteraction(close as never);
    expect(close.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('zamknięty') }),
    );
    expect(thread.delete).toHaveBeenCalledTimes(1);
  });

  test('handleInteraction po zamknięciu — info o stale', async () => {
    stats.get('p1', 'Tester');
    const btn = makeBtn('inv:close:p1');
    await service.handleInteraction(btn as never);
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('zamknięty') }),
    );
  });
});
