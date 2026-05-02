import type { ICommand, ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type SkillName } from '../services/player-stats.js';
import { rollLoot, type LootEntry } from '../services/loot.js';
import { ITEMS, fmtResource, type ToolKind } from '../services/items.js';
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

    if (this.cfg.requiredTool) {
      const tool = this.stats.equippedItem(player, 'tool');
      if (!tool || tool.toolKind !== this.cfg.requiredTool) {
        await msg.reply(
          `Potrzebujesz założonego narzędzia typu **${this.cfg.requiredTool}**. Skraftuj jakieś przez \`.craft\` i załóż przez \`.equip <uid>\`.`,
        );
        return;
      }
    }

    const remaining = this.stats.remainingCooldown(player, this.cfg.cooldownKey);
    if (remaining > 0) {
      await msg.reply(`Jeszcze ${Math.ceil(remaining / 1000)} s do następnej próby.`);
      return;
    }

    const skillLevel = player.skills[this.cfg.skill].level;
    const loot = rollLoot(this.cfg.table, skillLevel);

    this.stats.setCooldown(player, this.cfg.cooldownKey, this.cfg.cooldownMs);

    if (!loot) {
      this.stats.save();
      await msg.reply(this.cfg.emptyMessage);
      return;
    }

    this.stats.addResource(player, loot.itemId, loot.qty);
    const leveled = this.stats.addSkillXp(player, this.cfg.skill, this.cfg.xpPerSuccess);
    this.stats.save();

    const tpl = ITEMS[loot.itemId];
    const lvlMsg = leveled
      ? ` 🎉 **${this.cfg.skill}** awansuje na poziom **${player.skills[this.cfg.skill].level}**!`
      : '';
    await msg.reply(
      `${this.cfg.successPrefix} ${fmtResource(loot.itemId, loot.qty)} (+${this.cfg.xpPerSuccess} XP ${this.cfg.skill}).${lvlMsg}`,
    );
  }
}
