import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats, type SkillName } from '../services/player-stats.js';
import { rollLoot, type LootEntry } from '../services/loot.js';
import { fmtResource, type ToolKind } from '../services/items.js';
import { displayName } from '../../../utils.js';

export interface GatheringConfig {
  name: string;
  prefix: string;
  description: string;
  skill: SkillName;
  table: LootEntry[];
  cooldownMs: number;
  requiredTool: ToolKind | null;
  xpPerSuccess: number;
  cooldownKey: string;
  emptyMessage: string;
  successPrefix: string;
}

export abstract class GatheringCommand implements ICommand {
  readonly requiresPrompt = false;

  constructor(
    protected readonly stats: PlayerStatsService,
    protected readonly cfg: GatheringConfig,
  ) {}

  get name() {
    return this.cfg.name;
  }
  get prefix() {
    return this.cfg.prefix;
  }
  get description() {
    return this.cfg.description;
  }

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));
    await msg.reply(this.runGather(player));
  }

  /**
   * Pure gather attempt — modyfikuje state gracza i zwraca wynik jako string.
   * Wywoływane z `execute` (msg) i z menu/button-handlerów.
   */
  runGather(player: PlayerStats): string {
    if (this.cfg.requiredTool) {
      const tool = this.stats.equippedItem(player, 'tool');
      if (!tool || tool.toolKind !== this.cfg.requiredTool) {
        return `Potrzebujesz założonego narzędzia typu **${this.cfg.requiredTool}**. Skraftuj jakieś przez \`.craft\` i załóż przez \`.equip <uid>\`.`;
      }
    }

    const remaining = this.stats.remainingCooldown(player, this.cfg.cooldownKey);
    if (remaining > 0) {
      return `Jeszcze ${Math.ceil(remaining / 1000)} s do następnej próby.`;
    }

    const skillLevel = player.skills[this.cfg.skill].level;
    const loot = rollLoot(this.cfg.table, skillLevel);

    this.stats.setCooldown(player, this.cfg.cooldownKey, this.cfg.cooldownMs);

    if (!loot) {
      this.stats.save();
      return this.cfg.emptyMessage;
    }

    this.stats.addResource(player, loot.itemId, loot.qty);
    const leveled = this.stats.addSkillXp(player, this.cfg.skill, this.cfg.xpPerSuccess);
    this.stats.save();

    const lvlMsg = leveled
      ? ` 🎉 **${this.cfg.skill}** awansuje na poziom **${player.skills[this.cfg.skill].level}**!`
      : '';
    return `${this.cfg.successPrefix} ${fmtResource(loot.itemId, loot.qty)} (+${this.cfg.xpPerSuccess} XP ${this.cfg.skill}).${lvlMsg}`;
  }
}
