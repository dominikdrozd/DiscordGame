import fs from 'node:fs';
import { DialogService } from '../../src/modules/game/services/dialog.service.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { QuestService } from '../../src/modules/game/services/quest.service.js';
import { TalkCommand } from '../../src/modules/game/commands/talk.command.js';
import { Marek } from '../../src/modules/game/npcs/port_cykada/marek.npc.js';
import { tmpPlayerFile } from '../helpers/factories.js';

interface FakeUser {
  id: string;
  username: string;
  globalName?: string;
}

interface FakeUpdate {
  content?: string;
  components?: unknown[];
}

interface FakeButtonInteraction {
  isButton: () => boolean;
  customId: string;
  user: FakeUser;
  replied: boolean;
  deferred: boolean;
  update: jest.Mock;
  reply: jest.Mock;
  followUp: jest.Mock;
  channel: null;
  message: null;
}

function makeBtn(customId: string, userId = 'p1'): FakeButtonInteraction {
  return {
    isButton: () => true,
    customId,
    user: { id: userId, username: 'tester', globalName: 'Tester' },
    replied: false,
    deferred: false,
    update: jest.fn().mockResolvedValue({}),
    reply: jest.fn().mockResolvedValue({}),
    followUp: jest.fn().mockResolvedValue({}),
    channel: null,
    message: null,
  };
}

function lastUpdate(btn: FakeButtonInteraction): FakeUpdate | undefined {
  const calls = btn.update.mock.calls;
  if (calls.length === 0) return undefined;
  const last: unknown = calls[calls.length - 1]?.[0];
  if (!last || typeof last !== 'object') return undefined;
  const out: FakeUpdate = {};
  if ('content' in last && typeof last.content === 'string') out.content = last.content;
  if ('components' in last && Array.isArray(last.components)) out.components = last.components;
  return out;
}

describe('DialogService flow', () => {
  let file: string;
  let stats: PlayerStatsService;
  let dialog: DialogService;

  beforeEach(() => {
    file = tmpPlayerFile();
    stats = new PlayerStatsService(file);
    dialog = new DialogService(stats, new QuestService(stats));
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  test('startFromInteraction renders Marek startNode with option buttons', async () => {
    stats.get('p1', 'Tester');
    const btn = makeBtn('menu:citytalk:port_cykada:marek:p1');
    await dialog.startFromInteraction(btn as never, 'marek');
    const u = lastUpdate(btn);
    expect(u?.content).toContain('Stary Marek');
    expect(u?.content).toContain('Porcie Cykada');
    expect(Array.isArray(u?.components)).toBe(true);
    // intro Marka po refaktorze ma ~10 widocznych opcji (8 questy + about_city + end)
    // dla świeżego gracza, więc 2 rows (max 5 buttonów per row).
    expect(u?.components?.length).toBeGreaterThanOrEqual(1);
  });

  // Helper — index opcji w przefiltrowanej (visibleIf=true) liście intro
  // dla świeżego gracza. Buduje pełen DialogContext, żeby visibleIf
  // dokładnie odzwierciedlił logikę DialogService.
  function introOptIdx(goto: string): number {
    const marek = new Marek();
    const intro = marek.dialog.getNode('intro');
    if (!intro) throw new Error('intro missing');
    const quests = new QuestService(stats);
    const player = stats.get('p1', 'Tester');
    const ctx = { player, npc: marek, quests, stats };
    const visible = intro.options.filter((o) => !o.visibleIf || o.visibleIf(ctx));
    return visible.findIndex((o) => o.goto === goto);
  }

  test('handleInteraction goto valid node updates message with that node text', async () => {
    stats.get('p1', 'Tester');
    const idx = introOptIdx('about_city');
    const btn = makeBtn(`dialog:opt:marek:intro:${idx}:p1`);
    await dialog.handleInteraction(btn as never);
    const u = lastUpdate(btn);
    expect(u?.content).toContain('Port Cykada to brama');
  });

  test('handleInteraction goto "end" renders farewell + return-to-city button', async () => {
    stats.get('p1', 'Tester');
    const idx = introOptIdx('end');
    const btn = makeBtn(`dialog:opt:marek:intro:${idx}:p1`);
    await dialog.handleInteraction(btn as never);
    const u = lastUpdate(btn);
    expect(u?.content).toContain('Rozmowa zakończona');
    expect(u?.components?.length).toBe(1);
  });

  test('handleInteraction rejects mismatched user', async () => {
    stats.get('p1', 'Tester');
    const btn = makeBtn('dialog:opt:marek:intro:0:other_user');
    btn.user.id = 'p1'; // user clicks on someone else's dialog
    await dialog.handleInteraction(btn as never);
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('To nie twoja rozmowa') }),
    );
    expect(btn.update).not.toHaveBeenCalled();
  });

  test('handleInteraction with unknown NPC replies with restart hint', async () => {
    stats.get('p1', 'Tester');
    const btn = makeBtn('dialog:opt:foo:intro:0:p1');
    await dialog.handleInteraction(btn as never);
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('NPC już cię nie pamięta') }),
    );
  });

  test('handleInteraction with unknown nodeId replies error', async () => {
    stats.get('p1', 'Tester');
    const btn = makeBtn('dialog:opt:marek:nieistniejacy:0:p1');
    await dialog.handleInteraction(btn as never);
    expect(btn.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Nieznany węzeł') }),
    );
  });

  test('handleInteraction ignores non-dialog customId', async () => {
    stats.get('p1', 'Tester');
    const btn = makeBtn('menu:stats:p1');
    await dialog.handleInteraction(btn as never);
    expect(btn.update).not.toHaveBeenCalled();
    expect(btn.reply).not.toHaveBeenCalled();
  });

  test('Marek startNode is reachable directly via construction sanity', () => {
    const marek = new Marek();
    expect(marek.dialog.startNodeId).toBe('intro');
    expect(marek.dialog.getNode('intro')).toBeDefined();
  });
});

describe('TalkCommand', () => {
  let file: string;
  let stats: PlayerStatsService;
  let dialog: DialogService;
  let talk: TalkCommand;

  beforeEach(() => {
    file = tmpPlayerFile();
    stats = new PlayerStatsService(file);
    dialog = new DialogService(stats, new QuestService(stats));
    talk = new TalkCommand(dialog);
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  test('matches .talk and .talk <args> only', () => {
    expect(talk.matches('.talk')).toBe(true);
    expect(talk.matches('.talk port_cykada marek')).toBe(true);
    expect(talk.matches('.talkx')).toBe(false);
    expect(talk.matches('hello')).toBe(false);
  });

  test('.talk without args shows NPC list grouped by city', async () => {
    const reply = jest.fn().mockResolvedValue({});
    await talk.execute({
      client: {} as never,
      msg: { author: { id: 'p1' }, member: null, reply },
      prompt: '',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(reply).toHaveBeenCalledTimes(1);
    const text = reply.mock.calls[0][0];
    expect(typeof text).toBe('string');
    expect(text).toContain('Port Cykada');
    expect(text).toContain('marek');
    expect(text).toContain('Stary Marek');
  });

  test('.talk <city> <npc> rejects unknown city', async () => {
    const reply = jest.fn().mockResolvedValue({});
    await talk.execute({
      client: {} as never,
      msg: { author: { id: 'p1' }, member: null, reply },
      prompt: 'foo marek',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Nie ma miasta'));
  });

  test('.talk <city> <npc> rejects NPC not in city', async () => {
    const reply = jest.fn().mockResolvedValue({});
    await talk.execute({
      client: {} as never,
      msg: { author: { id: 'p1' }, member: null, reply },
      prompt: 'oakhaven marek',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('nie ma NPC'));
  });

  test('.talk <city> <npc> happy path replies with intro node', async () => {
    const reply = jest.fn().mockResolvedValue({});
    await talk.execute({
      client: {} as never,
      msg: { author: { id: 'p1' }, member: null, reply },
      prompt: 'port_cykada marek',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(reply).toHaveBeenCalledTimes(1);
    const payload = reply.mock.calls[0][0];
    expect(payload).toMatchObject({ content: expect.stringContaining('Stary Marek') });
    expect(Array.isArray(payload.components)).toBe(true);
  });

  test('.talk <npc> shortcut auto-resolves city', async () => {
    const reply = jest.fn().mockResolvedValue({});
    await talk.execute({
      client: {} as never,
      msg: { author: { id: 'p1' }, member: null, reply },
      prompt: 'marek',
      registerThread: () => {},
      forgetThread: () => {},
    });
    const payload = reply.mock.calls[0][0];
    expect(payload).toMatchObject({ content: expect.stringContaining('Stary Marek') });
  });

  test('.talk <unknown> replies with error', async () => {
    const reply = jest.fn().mockResolvedValue({});
    await talk.execute({
      client: {} as never,
      msg: { author: { id: 'p1' }, member: null, reply },
      prompt: 'jakistypek',
      registerThread: () => {},
      forgetThread: () => {},
    });
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Nie znam NPC'));
  });
});
