import fs from 'node:fs';
import { ExpeditionService } from '../../src/modules/game/services/expedition.service.js';
import { CraftService } from '../../src/modules/game/services/craft.service.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { PartyService } from '../../src/modules/game/services/party.js';
import { tmpPlayerFile } from '../helpers/factories.js';

interface FakeBtn {
  isButton: () => boolean;
  customId: string;
  user: { id: string; username: string; globalName?: string };
  channel: { id: string } | null;
  message: null;
  replied: boolean;
  deferred: boolean;
  update: jest.Mock;
  reply: jest.Mock;
  followUp: jest.Mock;
}

function makeBtn(customId: string, userId = 'p1'): FakeBtn {
  return {
    isButton: () => true,
    customId,
    user: { id: userId, username: 'tester', globalName: 'Tester' },
    channel: { id: 'ch1' },
    message: null,
    replied: false,
    deferred: false,
    update: jest.fn().mockResolvedValue({}),
    reply: jest.fn().mockResolvedValue({}),
    followUp: jest.fn().mockResolvedValue({}),
  };
}

interface UpdatePayload {
  content?: string;
  components?: unknown[];
}

function lastUpdate(btn: FakeBtn): UpdatePayload | undefined {
  const calls = btn.update.mock.calls;
  if (calls.length === 0) return undefined;
  const last: unknown = calls[calls.length - 1]?.[0];
  if (!last || typeof last !== 'object') return undefined;
  const out: UpdatePayload = {};
  if ('content' in last && typeof last.content === 'string') out.content = last.content;
  if ('components' in last && Array.isArray(last.components)) out.components = last.components;
  return out;
}

function rowJsons(rows: unknown[]): Array<{ components: Array<{ custom_id: string }> }> {
  const out: Array<{ components: Array<{ custom_id: string }> }> = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object' || !('toJSON' in r)) continue;
    const fn = r.toJSON;
    if (typeof fn !== 'function') continue;
    const j: unknown = fn.call(r);
    if (!j || typeof j !== 'object' || !('components' in j) || !Array.isArray(j.components)) continue;
    const compIds: Array<{ custom_id: string }> = [];
    for (const c of j.components) {
      if (!c || typeof c !== 'object' || !('custom_id' in c) || typeof c.custom_id !== 'string')
        continue;
      compIds.push({ custom_id: c.custom_id });
    }
    out.push({ components: compIds });
  }
  return out;
}

describe('Menu nav: expedition browser', () => {
  let file: string;
  let stats: PlayerStatsService;
  let party: PartyService;
  let exp: ExpeditionService;

  beforeEach(() => {
    file = tmpPlayerFile();
    stats = new PlayerStatsService(file);
    party = new PartyService();
    exp = new ExpeditionService(stats, party);
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  test('openFromInteraction renders browser z dodatkowym ← Menu rowem', async () => {
    stats.get('p1', 'Tester');
    const btn = makeBtn('menu:exp:p1');
    await exp.openFromInteraction(btn as never);
    const u = lastUpdate(btn);
    expect(u?.content).toMatch(/Region|Tier/);
    const rows = rowJsons(u?.components ?? []);
    // 2 rows: główny + back-to-menu
    expect(rows.length).toBe(2);
    const allIds = rows.flatMap((r) => r.components.map((c) => c.custom_id));
    expect(allIds).toContain('menu:back:p1');
    expect(allIds).toContain('menu:close:p1');
    // browse buttons w pierwszym rzędzie
    expect(allIds.some((id) => id.startsWith('exp:nav:p1'))).toBe(true);
    expect(allIds).toContain('exp:enter:p1');
  });

  test('nav (◀/▶) zachowuje ← Menu row gdy fromMenu=true', async () => {
    stats.get('p1', 'Tester');
    const open = makeBtn('menu:exp:p1');
    await exp.openFromInteraction(open as never);

    const next = makeBtn('exp:nav:p1:1');
    await exp.handleInteraction(next as never);
    const u = lastUpdate(next);
    const rows = rowJsons(u?.components ?? []);
    expect(rows.length).toBe(2);
    const allIds = rows.flatMap((r) => r.components.map((c) => c.custom_id));
    expect(allIds).toContain('menu:back:p1');
  });

  test('openInteractive (z .expedition) nie dodaje ← Menu rowu', async () => {
    const player = stats.get('p1', 'Tester');
    const reply = jest.fn().mockResolvedValue({});
    await exp['openInteractive']({
      author: { id: 'p1' },
      member: null,
      reply,
      channel: { id: 'ch1' },
    });
    expect(reply).toHaveBeenCalledTimes(1);
    const payload: unknown = reply.mock.calls[0][0];
    if (!payload || typeof payload !== 'object' || !('components' in payload)) {
      throw new Error('reply not called with components');
    }
    if (!Array.isArray(payload.components)) throw new Error('components not array');
    const rows = rowJsons(payload.components);
    expect(rows.length).toBe(1);
    void player;
  });

  test('aktywna ekspedycja z menu ma ← Menu row', async () => {
    const player = stats.get('p1', 'Tester');
    player.activeExpedition = {
      destination: 'pierwsza_wyprawa',
      endsAt: Date.now() + 60_000,
    };
    const btn = makeBtn('menu:exp:p1');
    await exp.openFromInteraction(btn as never);
    const u = lastUpdate(btn);
    const rows = rowJsons(u?.components ?? []);
    expect(rows.length).toBe(2);
    const allIds = rows.flatMap((r) => r.components.map((c) => c.custom_id));
    expect(allIds).toContain('menu:back:p1');
    expect(allIds).toContain('exp:claim:p1');
  });

  test('refresh active z menu zachowuje ← Menu row', async () => {
    const player = stats.get('p1', 'Tester');
    player.activeExpedition = {
      destination: 'pierwsza_wyprawa',
      endsAt: Date.now() + 60_000,
    };
    await exp.openFromInteraction(makeBtn('menu:exp:p1') as never);
    const refresh = makeBtn('exp:refresh:p1');
    await exp.handleInteraction(refresh as never);
    const rows = rowJsons(lastUpdate(refresh)?.components ?? []);
    expect(rows.length).toBe(2);
    const allIds = rows.flatMap((r) => r.components.map((c) => c.custom_id));
    expect(allIds).toContain('menu:back:p1');
  });
});

describe('Menu nav: craft browser', () => {
  let file: string;
  let stats: PlayerStatsService;
  let craft: CraftService;

  beforeEach(() => {
    file = tmpPlayerFile();
    stats = new PlayerStatsService(file);
    craft = new CraftService(stats);
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  test('openFromInteraction renders browser z ← Menu rowem', async () => {
    stats.get('p1', 'Tester');
    const btn = makeBtn('menu:craft:p1');
    await craft.openFromInteraction(btn as never);
    const u = lastUpdate(btn);
    const rows = rowJsons(u?.components ?? []);
    expect(rows.length).toBe(2);
    const allIds = rows.flatMap((r) => r.components.map((c) => c.custom_id));
    expect(allIds).toContain('menu:back:p1');
    expect(allIds).toContain('craft:create:p1');
  });

  test('nav z menu zachowuje ← Menu row', async () => {
    stats.get('p1', 'Tester');
    await craft.openFromInteraction(makeBtn('menu:craft:p1') as never);
    const nav = makeBtn('craft:nav:p1:1');
    await craft.handleInteraction(nav as never);
    const rows = rowJsons(lastUpdate(nav)?.components ?? []);
    expect(rows.length).toBe(2);
    const ids = rows.flatMap((r) => r.components.map((c) => c.custom_id));
    expect(ids).toContain('menu:back:p1');
  });

  test('close z menu pokazuje ← Menu zamiast pustych components', async () => {
    stats.get('p1', 'Tester');
    await craft.openFromInteraction(makeBtn('menu:craft:p1') as never);
    const close = makeBtn('craft:close:p1');
    await craft.handleInteraction(close as never);
    const rows = rowJsons(lastUpdate(close)?.components ?? []);
    expect(rows.length).toBe(1);
    const ids = rows.flatMap((r) => r.components.map((c) => c.custom_id));
    expect(ids).toContain('menu:back:p1');
  });

  test('openBrowser z .craft (msg) nie dodaje ← Menu rowu', async () => {
    stats.get('p1', 'Tester');
    const reply = jest.fn().mockResolvedValue({});
    await craft['openBrowser']({ author: { id: 'p1' }, member: null, reply });
    const payload: unknown = reply.mock.calls[0][0];
    if (!payload || typeof payload !== 'object' || !('components' in payload)) {
      throw new Error('reply not called with components');
    }
    if (!Array.isArray(payload.components)) throw new Error('components not array');
    const rows = rowJsons(payload.components);
    expect(rows.length).toBe(1);
  });
});
