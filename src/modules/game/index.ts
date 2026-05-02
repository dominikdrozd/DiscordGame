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

export interface GameServices {
  stats: PlayerStatsService;
  party: PartyService;
  expeditions: ExpeditionService;
}

export function createGameServices(): GameServices {
  const stats = new PlayerStatsService();
  const party = new PartyService();
  const expeditions = new ExpeditionService(stats, party);
  return { stats, party, expeditions };
}

export function registerGameCommands(manager: CommandManager, services: GameServices): void {
  const { stats, party, expeditions } = services;

  // services state-bearing, paired 1:1 z komendą
  const duels = new DuelService(stats, party);
  const bosses = new BossService(stats);
  const dungeons = new DungeonService(stats);
  const crafting = new CraftService(stats);
  const inventory = new InventoryService(stats);
  const city = new CityService(stats, (id) => dungeons.hasActiveFor(id));

  manager.register(new DuelCommand(duels));
  manager.register(new BossCommand(bosses));
  manager.register(new DungeonCommand(dungeons));
  manager.register(new ExpeditionCommand(expeditions));
  manager.register(new PartyCommand(party));
  manager.register(new MineCommand(stats));
  manager.register(new FishCommand(stats));
  manager.register(new ChopCommand(stats));
  manager.register(new CraftCommand(crafting));
  manager.register(new EquipCommand(stats));
  manager.register(new UnequipCommand(stats));
  manager.register(new InventoryCommand(inventory));
  manager.register(new StatsCommand(stats));
  manager.register(new SkillsCommand(stats));
  manager.register(new RaceCommand(stats));
  manager.register(new ClassCommand(stats));
  manager.register(new CityCommand(city));
}

export function startAmbushLoop(client: Client, services: GameServices): AmbushService {
  const ambush = new AmbushService(client, services.stats, services.party, (id, line) =>
    services.expeditions.logAmbush(id, line),
  );
  ambush.start();
  return ambush;
}
