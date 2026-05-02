import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type {
  ICommand,
  ICommandContext,
  ISlashCommand,
} from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from '../services/player-stats.js';
import { fmtInstance, type ItemSlot } from '../services/items.js';
import { displayName } from '../../../utils.js';

function isItemSlot(s: string): s is ItemSlot {
  return s === 'weapon' || s === 'armor' || s === 'tool';
}

export class UnequipCommand implements ICommand, ISlashCommand {
  readonly name = 'unequip';
  readonly prefix = '.unequip';
  readonly description =
    'Zdejmuje przedmiot z wybranego slotu. `.unequip <slot>` lub `/unequip slot:<weapon|armor|tool>`.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('unequip')
    .setDescription('Zdejmij przedmiot z slotu')
    .addStringOption((o) =>
      o
        .setName('slot')
        .setDescription('Który slot opróżnić')
        .setRequired(true)
        .addChoices(
          { name: 'weapon', value: 'weapon' },
          { name: 'armor', value: 'armor' },
          { name: 'tool', value: 'tool' },
        ),
    )
    .toJSON();

  constructor(private readonly stats: PlayerStatsService) {}

  matches(content: string): boolean {
    return content.startsWith(this.prefix + ' ') || content.trim() === this.prefix;
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));
    await msg.reply(this.tryUnequip(player, prompt.trim().toLowerCase()));
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const slot = interaction.options.getString('slot', true);
    await interaction
      .reply({ content: this.tryUnequip(player, slot), flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }

  private tryUnequip(player: PlayerStats, slot: string): string {
    if (!isItemSlot(slot)) return 'Slot musi być jednym z: `weapon`, `armor`, `tool`.';
    const removed = this.stats.unequip(player, slot);
    if (!removed) return `Slot **${slot}** był pusty.`;
    this.stats.save();
    return `✅ Zdjęte z **${slot}**: ${fmtInstance(removed)}`;
  }
}
