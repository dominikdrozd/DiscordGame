import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { ICommand, ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats, type SkillName } from '../services/player-stats.js';
import { rollLoot, type LootEntry } from '../services/loot.js';
import { fmtResource, type ToolKind } from '../services/items.js';
import { displayName } from '../../../utils.js';
import type { QuestService } from '../services/quest.service.js';
import { chat } from '../../../managers/chat.manager.js';

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

export abstract class GatheringCommand implements ICommand, ISlashCommand {
  readonly requiresPrompt = false;
  readonly slashDefinition: RESTPostAPIChatInputApplicationCommandsJSONBody;

  protected quests?: QuestService;

  constructor(
    protected readonly stats: PlayerStatsService,
    protected readonly cfg: GatheringConfig,
  ) {
    this.slashDefinition = new SlashCommandBuilder()
      .setName(cfg.name)
      .setDescription(cfg.description.slice(0, 100))
      .toJSON();
  }

  bindQuests(svc: QuestService): void {
    this.quests = svc;
  }

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
    await chat.replyToMessage(msg, this.runGather(player));
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    await chat.reply(interaction, this.runGather(player), { ephemeral: true });
  }

  /**
   * Pure gather attempt — modyfikuje state gracza i zwraca wynik jako string.
   * Wywoływane z `execute` (msg) i z menu/button-handlerów.
   */
  runGather(player: PlayerStats): string {
    if (this.cfg.requiredTool) {
      // Wystarczy posiadać narzędzie w plecaku — nie trzeba zakładać slotu tool
      // (slot tool jest jeden, więc wymaganie equip blokowałoby switch między
      // miningiem/fishingiem/choppingiem przy każdej akcji).
      const tool = this.stats.toolOfKind(player, this.cfg.requiredTool);
      if (!tool) {
        return `Potrzebujesz narzędzia typu **${this.cfg.requiredTool}** w plecaku. Skraftuj przez \`.craft\` — nie musisz go zakładać.`;
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
    // Quest drop hook — tylko dla gather skills (mining/fishing/woodcutting).
    let questLines: string[] = [];
    if (
      this.quests &&
      (this.cfg.skill === 'mining' ||
        this.cfg.skill === 'fishing' ||
        this.cfg.skill === 'woodcutting')
    ) {
      questLines = this.quests.onGathering(player, this.cfg.skill);
    }
    this.stats.save();

    const lvlMsg = leveled
      ? ` 🎉 **${this.cfg.skill}** awansuje na poziom **${player.skills[this.cfg.skill].level}**!`
      : '';
    const base = `${this.cfg.successPrefix} ${fmtResource(loot.itemId, loot.qty)} (+${this.cfg.xpPerSuccess} XP ${this.cfg.skill}).${lvlMsg}`;
    return questLines.length > 0 ? `${base}\n${questLines.join('\n')}` : base;
  }
}
