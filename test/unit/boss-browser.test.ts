import fs from 'node:fs';
import { BossService } from '../../src/modules/game/services/boss.service.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { buildBossBrowseRows } from '../../src/modules/game/ui/boss-buttons.js';
import { tmpPlayerFile } from '../helpers/factories.js';

interface FakeBtn {
  isButton: () => boolean;
  customId: string;
  user: { id: string; username: string; globalName?: string };
  channel: null;
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
    channel: null,
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

interface BtnJson {
  custom_id: string;
  label: string;
  disabled?: boolean;
}
interface RowJson {
  components: BtnJson[];
}

function rowsToJson(rows: { toJSON: () => unknown }[]): RowJson[] {
  return rows.map((r) => {
    const j: unknown = r.toJSON();
    if (!j || typeof j !== 'object' || !('components' in j) || !Array.isArray(j.components)) {
      return { components: [] };
    }
    const comps: BtnJson[] = [];
    for (const c of j.components) {
      if (!c || typeof c !== 'object') continue;
      if (!('custom_id' in c) || typeof c.custom_id !== 'string') continue;
      if (!('label' in c) || typeof c.label !== 'string') continue;
      comps.push({
        custom_id: c.custom_id,
        label: c.label,
        disabled:
          'disabled' in c && typeof c.disabled === 'boolean' ? c.disabled : undefined,
      });
    }
    return { components: comps };
  });
}

describe('Boss browser UI', () => {
  test('buildBossBrowseRows: ◀/⚔️/▶/✖ z opcjonalnym ← Menu', () => {
    const rows = rowsToJson(buildBossBrowseRows('p1', 5, true, true));
    expect(rows.length).toBe(2); // główny + back-to-menu
    const ids = rows.flatMap((r) => r.components.map((c) => c.custom_id));
    expect(ids).toContain('bbr:nav:p1:-1');
    expect(ids).toContain('bbr:enter:p1');
    expect(ids).toContain('bbr:nav:p1:1');
    expect(ids).toContain('bbr:close:p1');
    expect(ids).toContain('menu:back:p1');
  });

  test('bez fromMenu nie ma ← Menu rowu', () => {
    const rows = rowsToJson(buildBossBrowseRows('p1', 5, true, false));
    expect(rows.length).toBe(1);
  });

  test('canFight=false disable button Atakuj', () => {
    const rows = rowsToJson(buildBossBrowseRows('p1', 5, false, true));
    const enter = rows.flatMap((r) => r.components).find((c) => c.custom_id === 'bbr:enter:p1');
    expect(enter?.disabled).toBe(true);
  });
});

describe('BossService.openFromInteraction', () => {
  let file: string;
  let stats: PlayerStatsService;
  let service: BossService;

  beforeEach(() => {
    file = tmpPlayerFile();
    stats = new PlayerStatsService(file);
    service = new BossService(stats);
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  test('renderuje pierwszego bossa (T1) z opisem + dropami + buttonami', async () => {
    stats.get('p1', 'Tester');
    const btn = makeBtn('menu:boss:p1');
    await service.openFromInteraction(btn as never);
    const u = lastUpdate(btn);
    expect(u?.content).toMatch(/Tier 1/);
    expect(u?.content).toMatch(/HP:|Dmg:/);
    expect(u?.content).toContain('Nagrody');
    expect(u?.components?.length).toBe(2); // browse row + back-to-menu
  });

  test('nav (▶) przesuwa do następnego bossa', async () => {
    stats.get('p1', 'Tester');
    const open = makeBtn('menu:boss:p1');
    await service.openFromInteraction(open as never);
    const firstContent = lastUpdate(open)?.content;

    const next = makeBtn('bbr:nav:p1:1');
    await service.handleInteraction(next as never);
    const secondContent = lastUpdate(next)?.content;
    expect(secondContent).toBeDefined();
    expect(secondContent).not.toBe(firstContent);
  });

  test('rejects browse button od innego usera', async () => {
    stats.get('p1', 'Tester');
    await service.openFromInteraction(makeBtn('menu:boss:p1') as never);
    const intruder = makeBtn('bbr:nav:p1:1', 'p2');
    await service.handleInteraction(intruder as never);
    expect(intruder.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('To nie twój browser') }),
    );
  });

  test('close — zamyka browser i czyści state', async () => {
    stats.get('p1', 'Tester');
    await service.openFromInteraction(makeBtn('menu:boss:p1') as never);
    const close = makeBtn('bbr:close:p1');
    await service.handleInteraction(close as never);
    expect(close.update).toHaveBeenCalled();

    // Klik nav po close — powinno być ephemeral reply z hint
    const nav = makeBtn('bbr:nav:p1:1');
    await service.handleInteraction(nav as never);
    expect(nav.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Browser zamknięty') }),
    );
  });

  test('cooldown na bossie — Atakuj jest disabled w UI', async () => {
    const player = stats.get('p1', 'Tester');
    stats.setCooldown(player, 'boss', 60_000);
    const btn = makeBtn('menu:boss:p1');
    await service.openFromInteraction(btn as never);
    const components = lastUpdate(btn)?.components;
    if (!components || !Array.isArray(components)) throw new Error('no components');
    const rows = rowsToJson(components.filter((c): c is { toJSON: () => unknown } => {
      return !!c && typeof c === 'object' && 'toJSON' in c && typeof c.toJSON === 'function';
    }));
    const enter = rows.flatMap((r) => r.components).find((c) => c.custom_id === 'bbr:enter:p1');
    expect(enter?.disabled).toBe(true);
  });
});
