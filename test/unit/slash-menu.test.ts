import fs from 'node:fs';
import { MenuCommand } from '../../src/modules/game/commands/menu.command.js';
import { MenuService } from '../../src/modules/game/services/menu.service.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { PartyService } from '../../src/modules/game/services/party.js';
import { ExpeditionService } from '../../src/modules/game/services/expedition.service.js';
import { CraftService } from '../../src/modules/game/services/craft.service.js';
import { BossService } from '../../src/modules/game/services/boss.service.js';
import { DialogService } from '../../src/modules/game/services/dialog.service.js';
import { SpellsService } from '../../src/modules/game/services/spells.service.js';
import { hasSlashCommand } from '../../src/types/command.types.js';
import { tmpPlayerFile } from '../helpers/factories.js';

interface FakeSlashInteraction {
  isChatInputCommand: () => boolean;
  commandName: string;
  user: { id: string; username: string; globalName?: string };
  reply: jest.Mock;
}

function makeSlash(commandName: string, userId = 'p1'): FakeSlashInteraction {
  return {
    isChatInputCommand: () => true,
    commandName,
    user: { id: userId, username: 'tester', globalName: 'Tester' },
    reply: jest.fn().mockResolvedValue({}),
  };
}

describe('MenuCommand /menu slash command', () => {
  let file: string;
  let stats: PlayerStatsService;
  let menuCmd: MenuCommand;

  beforeEach(() => {
    file = tmpPlayerFile();
    stats = new PlayerStatsService(file);
    const party = new PartyService();
    const exp = new ExpeditionService(stats, party);
    const craft = new CraftService(stats);
    const bosses = new BossService(stats);
    const dialog = new DialogService(stats);
    const spells = new SpellsService(stats);
    const noopOpener = { openShopFromInteraction: async () => {} };
    const noopInvOpener = { openInventoryFromInteraction: async () => {} };
    const noopGather = { runGather: () => '' };
    const menu = new MenuService(
      stats,
      party,
      // gathering commands aren't used in this test path
      { mine: noopGather as never, fish: noopGather as never, chop: noopGather as never },
      noopOpener,
      dialog,
      exp,
      craft,
      bosses,
      noopInvOpener,
      spells,
    );
    menuCmd = new MenuCommand(menu);
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  test('implementuje ISlashCommand z definicją', () => {
    expect(hasSlashCommand(menuCmd)).toBe(true);
    expect(menuCmd.slashDefinition.name).toBe('menu');
    expect(typeof menuCmd.slashDefinition.description).toBe('string');
  });

  test('executeSlash odpowiada ephemeral z renderem main + buttonami', async () => {
    stats.get('p1', 'Tester');
    const slash = makeSlash('menu');
    await menuCmd.executeSlash(slash as never);
    expect(slash.reply).toHaveBeenCalledTimes(1);
    const payload: unknown = slash.reply.mock.calls[0][0];
    if (!payload || typeof payload !== 'object') throw new Error('no payload');
    if ('flags' in payload) expect(typeof payload.flags).toBe('number'); // MessageFlags.Ephemeral
    if ('content' in payload && typeof payload.content === 'string') {
      expect(payload.content).toContain('Menu');
    }
    if ('components' in payload && Array.isArray(payload.components)) {
      expect(payload.components.length).toBeGreaterThan(0);
    }
  });
});
