import { GatheringCommand } from './gathering.command.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { MINING_TABLE } from '../services/loot.js';

export class MineCommand extends GatheringCommand {
  constructor(stats: PlayerStatsService) {
    super(stats, {
      name: 'mine',
      prefix: '.mine',
      description:
        'Wydobywaj rudy. Wymaga założonego kilofa (`.equip <uid>`). Cooldown 60 s, daje XP do `mining`.',
      skill: 'mining',
      table: MINING_TABLE,
      cooldownMs: 60_000,
      requiredTool: 'pickaxe',
      xpPerSuccess: 20,
      cooldownKey: 'mine',
      emptyMessage: '⛏️ Tłuczesz skałę, ale nic z niej nie odpadło.',
      successPrefix: '⛏️ Wydobywasz',
    });
  }
}
