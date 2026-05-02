import { GatheringCommand } from './gathering.command.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { WOODCUTTING_TABLE } from '../services/loot.js';

export class ChopCommand extends GatheringCommand {
  constructor(stats: PlayerStatsService) {
    super(stats, {
      name: 'chop',
      prefix: '.chop',
      description:
        'Ścinaj drzewa. Wymaga założonej siekiery (`.equip <uid>`). Cooldown 60 s, daje XP do `woodcutting`.',
      skill: 'woodcutting',
      table: WOODCUTTING_TABLE,
      cooldownMs: 60_000,
      requiredTool: 'axe',
      xpPerSuccess: 20,
      cooldownKey: 'chop',
      emptyMessage: '🪓 Pień jeszcze stoi — siekiera odbiła się od kory.',
      successPrefix: '🪓 Wycinasz',
    });
  }
}
