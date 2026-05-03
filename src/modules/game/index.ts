import type { Client } from 'discord.js';
import type { CommandManager } from '../../managers/command.manager.js';
import { PlayerStatsService } from './services/player-stats.js';
import { PartyService } from './services/party.js';
import { DuelService } from './services/duel.service.js';
import { BossService } from './services/boss.service.js';
import { DungeonService } from './services/dungeon.service.js';
import { ExpeditionService } from './services/expedition.service.js';
import { CraftService } from './services/craft.service.js';
import { InventoryService } from './services/inventory.service.js';
import { CityService } from './services/city.service.js';
import { AmbushService } from './engine/ambush.js';
import { DuelCommand } from './commands/duel.command.js';
import { BossCommand } from './commands/boss.command.js';
import { DungeonCommand } from './commands/dungeon.command.js';
import { ExpeditionCommand } from './commands/expedition.command.js';
import { MineCommand } from './commands/mine.command.js';
import { FishCommand } from './commands/fish.command.js';
import { ChopCommand } from './commands/chop.command.js';
import { CraftCommand } from './commands/craft.command.js';
import { EquipCommand } from './commands/equip.command.js';
import { UnequipCommand } from './commands/unequip.command.js';
import { InventoryCommand } from './commands/inventory.command.js';
import { StatsCommand } from './commands/stats.command.js';
import { SkillsCommand } from './commands/skills.command.js';
import { RaceCommand } from './commands/race.command.js';
import { ClassCommand } from './commands/class.command.js';
import { PartyCommand } from './commands/party.command.js';
import { CityCommand } from './commands/city.command.js';
import { MenuCommand } from './commands/menu.command.js';
import {
  MenuService,
  type MenuShopOpener,
  type MenuInventoryOpener,
} from './services/menu.service.js';
import { DialogService } from './services/dialog.service.js';
import { TalkCommand } from './commands/talk.command.js';
import { SpellsService } from './services/spells.service.js';
import { SpellsCommand } from './commands/spells.command.js';
import { SmithService } from './services/smith.service.js';
import { SmithCommand } from './commands/smith.command.js';
import { QuestService } from './services/quest.service.js';
import { QuestCommand } from './commands/quest.command.js';

export interface GameServices {
  stats: PlayerStatsService;
  party: PartyService;
  expeditions: ExpeditionService;
}

function hasThreadCreate(
  c: unknown,
): c is { threads: { create: (opts: unknown) => Promise<unknown> } } {
  if (!c || typeof c !== 'object') return false;
  if (!('threads' in c)) return false;
  const t = c.threads;
  if (!t || typeof t !== 'object') return false;
  if (!('create' in t)) return false;
  return typeof t.create === 'function';
}

export function createGameServices(): GameServices {
  const stats = new PlayerStatsService();
  const party = new PartyService();
  const quests = new QuestService(stats);
  const expeditions = new ExpeditionService(stats, party, quests);
  return { stats, party, expeditions };
}

export function registerGameCommands(manager: CommandManager, services: GameServices): void {
  const { stats, party, expeditions } = services;

  // services state-bearing, paired 1:1 z komendą
  const quests = new QuestService(stats);
  const duels = new DuelService(stats, party);
  const bosses = new BossService(stats, quests);
  const dungeons = new DungeonService(stats);
  const crafting = new CraftService(stats);
  const inventory = new InventoryService(stats);
  const inventoryCommand = new InventoryCommand(inventory);
  const city = new CityService(stats, (id) => dungeons.hasActiveFor(id));
  const dialog = new DialogService(stats, quests);
  const cityCommand = new CityCommand(city, stats);
  const talkCommand = new TalkCommand(dialog);
  const mineCmd = new MineCommand(stats);
  const fishCmd = new FishCommand(stats);
  const chopCmd = new ChopCommand(stats);
  const spells = new SpellsService(stats);
  const smith = new SmithService(stats);

  // Adapter: button click "🛒 Sklep" w widoku miasta → CityService.openShopForUser
  // z thread-routingiem do CityCommand (żeby wątek miał TTL i dispatch wiadomości).
  const shopOpener: MenuShopOpener = {
    openShopFromInteraction: async (interaction, cityIdArg) => {
      const reply = async (content: string): Promise<unknown> => {
        if (interaction.replied || interaction.deferred) {
          return interaction.followUp({ content, ephemeral: true });
        }
        return interaction.reply({ content, ephemeral: true });
      };
      const channelCandidate: unknown = interaction.channel;
      if (!hasThreadCreate(channelCandidate)) {
        await reply('Nie mogę otworzyć sklepu — ten kanał nie wspiera prywatnych wątków.');
        return;
      }
      const message = interaction.message;
      const startThreadFallback =
        message && typeof message.startThread === 'function'
          ? (opts: { name: string; autoArchiveDuration: number }) => message.startThread(opts)
          : undefined;
      await city.openShopForUser({
        cityId: cityIdArg,
        userId: interaction.user.id,
        userName: interaction.user.globalName || interaction.user.username,
        channel: channelCandidate,
        registerThread: (thread) => manager.registerThreadFor(thread, cityCommand),
        reply,
        startThreadFallback,
      });
    },
  };

  // Adapter: 🎒 Plecak w menu → InventoryService.openInventoryForUser
  // z thread-routingiem do InventoryCommand.
  const inventoryOpener: MenuInventoryOpener = {
    openInventoryFromInteraction: async (interaction) => {
      const reply = async (content: string): Promise<unknown> => {
        if (interaction.replied || interaction.deferred) {
          return interaction.followUp({ content, ephemeral: true });
        }
        return interaction.reply({ content, ephemeral: true });
      };
      const channelCandidate: unknown = interaction.channel;
      if (!hasThreadCreate(channelCandidate)) {
        await reply('Nie mogę otworzyć plecaka — ten kanał nie wspiera prywatnych wątków.');
        return;
      }
      const message = interaction.message;
      const startThreadFallback =
        message && typeof message.startThread === 'function'
          ? (opts: { name: string; autoArchiveDuration: number }) => message.startThread(opts)
          : undefined;
      await inventory.openInventoryForUser({
        userId: interaction.user.id,
        userName: interaction.user.globalName || interaction.user.username,
        channel: channelCandidate,
        registerThread: (thread) => manager.registerThreadFor(thread, inventoryCommand),
        reply,
        startThreadFallback,
      });
    },
  };

  const questCommand = new QuestCommand(quests, stats);
  const menu = new MenuService(
    stats,
    party,
    { mine: mineCmd, fish: fishCmd, chop: chopCmd },
    shopOpener,
    dialog,
    expeditions,
    crafting,
    bosses,
    inventoryOpener,
    spells,
    smith,
    questCommand,
  );

  manager.register(new DuelCommand(duels));
  manager.register(new BossCommand(bosses));
  manager.register(new DungeonCommand(dungeons));
  manager.register(new ExpeditionCommand(expeditions));
  manager.register(new PartyCommand(party));
  manager.register(mineCmd);
  manager.register(fishCmd);
  manager.register(chopCmd);
  manager.register(new CraftCommand(crafting));
  manager.register(new EquipCommand(stats));
  manager.register(new UnequipCommand(stats));
  manager.register(inventoryCommand);
  manager.register(new StatsCommand(stats));
  manager.register(new SkillsCommand(stats));
  manager.register(new RaceCommand(stats));
  manager.register(new ClassCommand(stats));
  manager.register(cityCommand);
  manager.register(talkCommand);
  manager.register(new SpellsCommand(spells, stats));
  manager.register(new SmithCommand(smith, stats));
  manager.register(new QuestCommand(quests, stats));
  manager.register(new MenuCommand(menu));
}

export function startAmbushLoop(client: Client, services: GameServices): AmbushService {
  const ambush = new AmbushService(client, services.stats, services.party, (id, line) =>
    services.expeditions.logAmbush(id, line),
  );
  // ExpeditionService musi mieć referencję do AmbushService żeby renderować
  // "Wróć do walki" — bind po konstrukcji bo dependency cycle.
  services.expeditions.bindAmbushService(ambush);
  ambush.start();
  return ambush;
}
