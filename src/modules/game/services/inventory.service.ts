import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction } from 'discord.js';
import type { ICommandContext } from '../../../types/command.types.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { fmtResource, fmtInstance, type ItemInstance } from './items.js';
import { displayName } from '../../../utils.js';

const ITEMS_PER_ROW = 5;
const MAX_ROWS = 5;

export class InventoryService {
  constructor(private readonly stats: PlayerStatsService) {}

  async show(ctx: ICommandContext): Promise<void> {
    const { msg } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));
    const view = this.buildView(player);

    try {
      await msg.author.send(view);
      await msg.react('📬').catch(() => {});
    } catch {
      await msg.reply({
        ...view,
        content: `${view.content}\n\n_Nie mogę wysłać DM — masz wyłączone wiadomości od członków serwera. Pokazuję tutaj._`,
      });
    }
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('inv:')) return;
    const [, uid] = interaction.customId.split(':');
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const item = this.stats.findItem(player, uid);
    if (!item || !item.slot) {
      await interaction
        .reply({ content: 'Nie posiadasz tego itemu już.', ephemeral: true })
        .catch(() => {});
      return;
    }
    const isEquipped = player.equipped[item.slot] === uid;
    if (isEquipped) {
      this.stats.unequip(player, item.slot);
    } else {
      this.stats.equip(player, uid);
    }
    this.stats.save();
    const view = this.buildView(player);
    try {
      await interaction.update(view);
    } catch {
      await interaction
        .reply({ content: 'Zaktualizowane, ale nie udało się odświeżyć widoku.', ephemeral: true })
        .catch(() => {});
    }
  }

  private buildView(player: PlayerStats): {
    content: string;
    components: ActionRowBuilder<ButtonBuilder>[];
  } {
    const lines: string[] = [`🎒 **Plecak ${player.name}**`, ''];
    lines.push('**Założone:**');
    for (const slot of ['weapon', 'armor', 'tool'] as const) {
      const it = this.stats.equippedItem(player, slot);
      lines.push(`• ${slot}: ${it ? fmtInstance(it) : '_pusty_'}`);
    }
    lines.push('');

    const resources = Object.entries(player.inventory.resources);
    if (resources.length) {
      lines.push('**Zasoby:**');
      for (const [id, qty] of resources) lines.push(`• ${fmtResource(id, qty)}`);
      lines.push('');
    }

    const equippableItems = player.inventory.items.filter((it) => it.slot);
    if (equippableItems.length) {
      lines.push('**Przedmioty unikalne (kliknij przycisk żeby założyć/zdjąć):**');
      for (const it of equippableItems) {
        const equipped = player.equipped[it.slot!] === it.uid;
        const tag = equipped ? ' **[założone]**' : '';
        lines.push(`• ${fmtInstance(it)}${tag}`);
      }
    }

    if (resources.length === 0 && equippableItems.length === 0) {
      lines.push('Plecak pusty. Spróbuj `.mine`, `.fish` albo `.chop`.');
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const limited = equippableItems.slice(0, ITEMS_PER_ROW * MAX_ROWS);
    for (let i = 0; i < limited.length; i += ITEMS_PER_ROW) {
      const batch = limited.slice(i, i + ITEMS_PER_ROW);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...batch.map((it) => this.buildItemButton(player, it)),
      );
      rows.push(row);
    }

    return {
      content: lines.join('\n').slice(0, 1900),
      components: rows,
    };
  }

  private buildItemButton(player: PlayerStats, it: ItemInstance): ButtonBuilder {
    const isEquipped = it.slot ? player.equipped[it.slot] === it.uid : false;
    const label = `${isEquipped ? '⤵️ Zdejmij' : '⤴️ Załóż'}: ${it.name}`.slice(0, 80);
    return new ButtonBuilder()
      .setCustomId(`inv:${it.uid}:toggle`)
      .setLabel(label)
      .setStyle(isEquipped ? ButtonStyle.Secondary : ButtonStyle.Primary);
  }
}
