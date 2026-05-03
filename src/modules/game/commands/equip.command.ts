import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from '../services/player-stats.js';
import { fmtInstance } from '../services/items.js';
import { displayName } from '../../../utils.js';
import { BaseCommand } from './base.command.js';

export class EquipCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'equip';
  readonly prefix = '.equip';
  readonly description =
    'Zakłada przedmiot z plecaka. `.equip <uid>` lub `/equip uid:<uid>`. Uid pokazuje `.inv` / `/inv`.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('equip')
    .setDescription('Załóż przedmiot z plecaka')
    .addStringOption((o) =>
      o
        .setName('uid')
        .setDescription('UID przedmiotu (z /inv)')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .toJSON();

  constructor(private readonly stats: PlayerStatsService) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));
    await msg.reply(this.tryEquip(player, prompt.trim()));
  }

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'uid') return;
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const q = focused.value.toLowerCase();
    const choices = player.inventory.items
      .filter((it) => it.slot)
      .filter((it) => it.uid.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((it) => {
        const equipped = it.slot && player.equipped[it.slot] === it.uid ? ' [założone]' : '';
        return {
          name: `${it.name} (${it.slot})${equipped}`.slice(0, 100),
          value: it.uid,
        };
      });
    await interaction.respond(choices).catch(() => {});
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const uid = interaction.options.getString('uid', true);
    await interaction
      .reply({ content: this.tryEquip(player, uid), flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }

  private tryEquip(player: PlayerStats, uid: string): string {
    const result = this.stats.equip(player, uid);
    if (!result.ok || !result.item) {
      return result.reason ?? 'Nie udało się założyć itemu.';
    }
    this.stats.save();
    return `✅ Założone w slot **${result.item.slot}**: ${fmtInstance(result.item)}`;
  }
}
