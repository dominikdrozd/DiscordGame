import fs from 'node:fs';
import { InventoryService } from '../../src/modules/game/services/inventory.service.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { rollItemInstance } from '../../src/modules/game/services/items.js';
import { tmpPlayerFile } from '../helpers/factories.js';

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

describe('InventoryService — thread-based plecak', () => {
  let file: string;
  let stats: PlayerStatsService;
  let service: InventoryService;
  let registerThread: jest.Mock;
  let reply: jest.Mock;

  beforeEach(() => {
    file = tmpPlayerFile();
    stats = new PlayerStatsService(file);
    service = new InventoryService(stats);
    registerThread = jest.fn();
    reply = jest.fn().mockResolvedValue({});
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  test('openInventoryForUser tworzy wątek + summary + per-item messages', async () => {
    const player = stats.get('p1', 'Tester');
    const sword = rollItemInstance('sword_iron');
    const armor = rollItemInstance('armor_iron');
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
    // Summary + 2 items + close = 4 sends
    expect(thread.send).toHaveBeenCalledTimes(4);
  });

  test('odrzuca drugie otwarcie plecaka dla tego samego usera', async () => {
    stats.get('p1', 'Tester');
    const thread = makeThread();
    const channel = makeChannel(thread);
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel,
      registerThread,
      reply,
    });
    reply.mockClear();
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel: makeChannel(makeThread('t2')),
      registerThread,
      reply,
    });
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('już otwarty plecak'));
  });

  test('toggle equip/unequip via button updateuje wiadomość', async () => {
    const player = stats.get('p1', 'Tester');
    const sword = rollItemInstance('sword_iron');
    if (!sword) throw new Error('roll failed');
    stats.addItem(player, sword);
    const thread = makeThread();
    const channel = makeChannel(thread);
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel,
      registerThread,
      reply,
    });

    expect(player.equipped.weapon).toBeUndefined();
    const btn = makeBtn(`inv:toggle:${sword.uid}:p1`);
    await service.handleInteraction(btn as never);
    expect(player.equipped.weapon).toBe(sword.uid);
    expect(btn.update).toHaveBeenCalledTimes(1);
  });

  test('toggle drugiego itemu w tym samym slocie zdejmuje pierwszy', async () => {
    const player = stats.get('p1', 'Tester');
    const sword1 = rollItemInstance('sword_iron');
    const sword2 = rollItemInstance('sword_silver');
    if (!sword1 || !sword2) throw new Error('roll failed');
    stats.addItem(player, sword1);
    stats.addItem(player, sword2);
    stats.equip(player, sword1.uid);

    const thread = makeThread();
    const channel = makeChannel(thread);
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel,
      registerThread,
      reply,
    });

    const btn = makeBtn(`inv:toggle:${sword2.uid}:p1`);
    await service.handleInteraction(btn as never);
    expect(player.equipped.weapon).toBe(sword2.uid);
    // poprzednio equippet sword1 — message powinien się odświeżyć
    expect(thread.messages.fetch).toHaveBeenCalled();
  });

  test('close zamyka plecak i pozwala otworzyć nowy', async () => {
    stats.get('p1', 'Tester');
    const thread = makeThread();
    const channel = makeChannel(thread);
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel,
      registerThread,
      reply,
    });

    const close = makeBtn('inv:close:p1');
    await service.handleInteraction(close as never);
    expect(close.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Plecak zamknięty') }),
    );
    // User-initiated close → wątek usunięty od razu (bez archiwizacji + delay)
    expect(thread.delete).toHaveBeenCalledTimes(1);
    expect(thread.setArchived).not.toHaveBeenCalled();

    // Po close — drugie otwarcie powinno działać
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

  test('sell usuwa item z plecaka i dodaje złoto', async () => {
    const player = stats.get('p1', 'Tester');
    const initialGold = player.gold;
    const sword = rollItemInstance('sword_iron');
    if (!sword) throw new Error('roll failed');
    sword.stats = { attack: 5 };
    sword.rarity = 'common';
    stats.addItem(player, sword);

    const thread = makeThread();
    const channel = makeChannel(thread);
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel,
      registerThread,
      reply,
    });

    const sellBtn = makeBtn(`inv:sell:${sword.uid}:p1`);
    await service.handleInteraction(sellBtn as never);

    expect(player.inventory.items.find((it) => it.uid === sword.uid)).toBeUndefined();
    expect(player.gold).toBe(initialGold + 15); // common 10 + 5 atk × 1
    expect(sellBtn.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Sprzedano') }),
    );
  });

  test('sell odmawia gdy item założony — wymaga unequip', async () => {
    const player = stats.get('p1', 'Tester');
    const initialGold = player.gold;
    const sword = rollItemInstance('sword_iron');
    if (!sword) throw new Error('roll failed');
    stats.addItem(player, sword);
    stats.equip(player, sword.uid);

    const thread = makeThread();
    const channel = makeChannel(thread);
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel,
      registerThread,
      reply,
    });

    const sellBtn = makeBtn(`inv:sell:${sword.uid}:p1`);
    await service.handleInteraction(sellBtn as never);

    expect(player.inventory.items.find((it) => it.uid === sword.uid)).toBeDefined();
    expect(player.gold).toBe(initialGold);
    expect(sellBtn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('zdejmij') }),
    );
  });

  test('rejects toggle od innego usera', async () => {
    stats.get('p1', 'Tester');
    const thread = makeThread();
    const channel = makeChannel(thread);
    await service.openInventoryForUser({
      userId: 'p1',
      userName: 'Tester',
      channel,
      registerThread,
      reply,
    });
    const intruder = makeBtn('inv:toggle:abc:p1', 'p2');
    await service.handleInteraction(intruder as never);
    expect(intruder.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('To nie twój plecak') }),
    );
  });

  test('handleInteraction po zamknięciu — info o stale', async () => {
    stats.get('p1', 'Tester');
    const btn = makeBtn('inv:toggle:abc:p1');
    await service.handleInteraction(btn as never);
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('zamknięty') }),
    );
  });
});
