import { GatheringCommand } from './gathering.command.js';
import { PlayerStatsService } from '../services/player-stats.js';
import { FISHING_TABLE } from '../services/loot.js';

export class FishCommand extends GatheringCommand {
  constructor(stats: PlayerStatsService) {
    super(stats, {
      name: 'fish',
      prefix: '.fish',
      description:
        'Łap ryby. Wymaga wędki w plecaku (nie trzeba zakładać). Cooldown 60 s, daje XP do `fishing`.',
      skill: 'fishing',
      table: FISHING_TABLE,
      cooldownMs: 60_000,
      requiredTool: 'rod',
      xpPerSuccess: 20,
      cooldownKey: 'fish',
      emptyMessage: '🎣 Spławik się rusza, ale tylko trącił.',
      successPrefix: '🎣 Wyciągasz',
    });
  }
}
