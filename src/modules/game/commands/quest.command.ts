import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { QuestService } from '../services/quest.service.js';
import { PlayerStatsService, type PlayerStats } from '../services/player-stats.js';
import { type QuestDef } from '../quests/index.js';
import { ITEMS } from '../services/items.js';
import { displayName } from '../../../utils.js';
import { BaseCommand } from './base.command.js';

/**
 * Quest tracking — slash i message. Główny widok przez `/menu` → 📜 Questy.
 *
 * `customId` format dla buttonów porzucenia:
 *  - `quest:abandon:<userId>:<questId>` — porzuć aktywnego questa
 *  - `quest:close:<userId>` — zamknij widok
 *  - `quest:refresh:<userId>` — re-render
 */
export class QuestCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'quest';
  readonly prefix = '.quest';
  readonly description =
    'Questy. `/quest list` pokazuje wszystkie; `/quest abandon` porzuca aktywnego (nie da się wziąć ponownie!).';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('quest')
    .setDescription('Questy — lista, porzucenie, info')
    .addSubcommand((sc) =>
      sc.setName('list').setDescription('Pokaż swoje questy (active / completed / dostępne)'),
    )
    .addSubcommand((sc) =>
      sc
        .setName('abandon')
        .setDescription('Porzuć aktywnego questa (nie da się wziąć ponownie!)')
        .addStringOption((o) =>
          o
            .setName('id')
            .setDescription('id aktywnego questa')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .toJSON();

  constructor(
    private readonly quests: QuestService,
    private readonly stats: PlayerStatsService,
  ) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;
    const player = this.stats.get(msg.author.id, displayName(msg));
    const parts = prompt.split(/\s+/).filter(Boolean);
    if (parts[0] === 'abandon' && parts[1]) {
      const result = this.quests.abandon(player, parts[1]);
      this.stats.save();
      await msg.reply(result.line);
      return;
    }
    await msg.reply({ content: this.renderList(player), components: this.buildRows(player) });
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    if (sub === 'list') {
      await interaction
        .reply({
          content: this.renderList(player),
          components: this.buildRows(player),
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    if (sub === 'abandon') {
      const id = interaction.options.getString('id', true);
      const result = this.quests.abandon(player, id);
      this.stats.save();
      await interaction
        .reply({ content: result.line, flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (interaction.options.getSubcommand() !== 'abandon') return;
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const focus = interaction.options.getFocused().toLowerCase();
    const choices = this.quests
      .active(player)
      .filter((q) => q.id.includes(focus) || q.name.toLowerCase().includes(focus))
      .slice(0, 25)
      .map((q) => ({ name: `${q.name} (${q.id})`.slice(0, 100), value: q.id }));
    await interaction.respond(choices).catch(() => {});
  }

  async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('quest:')) return;
    const button = interaction as ButtonInteraction;
    const parts = button.customId.split(':');
    const action = parts[1];
    const userId = parts[2];
    if (button.user.id !== userId) {
      await button
        .reply({ content: 'To nie twój widok questów.', ephemeral: true })
        .catch(() => {});
      return;
    }
    const player = this.stats.get(userId, button.user.globalName || button.user.username);
    if (action === 'close') {
      await button.update({ content: 'Widok questów zamknięty.', components: [] }).catch(() => {});
      return;
    }
    if (action === 'abandon') {
      const questId = parts[3];
      const result = this.quests.abandon(player, questId);
      this.stats.save();
      await button
        .update({
          content: `${result.line}\n\n${this.renderList(player)}`,
          components: this.buildRows(player),
        })
        .catch(() => {});
      return;
    }
    if (action === 'refresh') {
      await button
        .update({
          content: this.renderList(player),
          components: this.buildRows(player),
        })
        .catch(() => {});
    }
  }

  /** Render — wywoływane też z MenuService (dlatego publiczne). */
  renderList(p: PlayerStats): string {
    const active = this.quests.active(p);
    const completed = this.quests.completed(p);
    const available = this.quests.available(p);
    const abandoned = p.quests.abandoned
      .map((id) => this.quests.allQuests().find((q) => q.id === id))
      .filter((q): q is QuestDef => !!q);
    const lines: string[] = ['📜 **Questy**'];

    lines.push('');
    lines.push(`**Aktywne (${active.length}):**`);
    if (active.length === 0) lines.push('_brak — pogadaj z NPC w mieście._');
    else {
      for (const q of active) {
        lines.push(`• **${q.name}** — ${q.description}`);
        lines.push(`  ${this.progressLine(p, q)}`);
      }
    }

    lines.push('');
    lines.push(`**Ukończone (${completed.length}):**`);
    if (completed.length === 0) lines.push('_jeszcze żadnego._');
    else for (const q of completed) lines.push(`✅ **${q.name}**`);

    if (abandoned.length > 0) {
      lines.push('');
      lines.push(`**Porzucone (${abandoned.length}):**`);
      for (const q of abandoned)
        lines.push(`🗑️ **${q.name}** — _możesz wziąć ponownie u ${q.giverNpcId}._`);
    }

    lines.push('');
    lines.push(`**Dostępne (${available.length}):**`);
    if (available.length === 0) lines.push('_wszystkie wzięte lub wymagają wyższego lvl._');
    else
      for (const q of available)
        lines.push(`• **${q.name}** — od _${q.giverNpcId}_ — ${q.description}`);

    return lines.join('\n').slice(0, 1900);
  }

  private progressLine(p: PlayerStats, q: QuestDef): string {
    const parts: string[] = [];
    if (q.turnInItem) {
      const have = p.inventory.resources[q.turnInItem.itemId] ?? 0;
      const itemName = ITEMS[q.turnInItem.itemId]?.name ?? q.turnInItem.itemId;
      const ready = have >= q.turnInItem.qty ? '✅' : '⏳';
      parts.push(`${ready} ${itemName}: ${have}/${q.turnInItem.qty}`);
    }
    if (q.killBoss) {
      parts.push(`⚔️ Pokonaj bossa \`${q.killBoss}\``);
    }
    if (q.expeditionDrop) {
      const itemName = ITEMS[q.expeditionDrop.itemId]?.name ?? q.expeditionDrop.itemId;
      const pct = Math.round(q.expeditionDrop.chance * 100);
      parts.push(`(drop ${pct}% z wyprawy: **${itemName}**)`);
    }
    return parts.length ? parts.join(' · ') : '_(progress trackowany u NPC)_';
  }

  /** Buildy wierszy buttonów — abandon per active quest + zamknij. */
  buildRows(p: PlayerStats): ActionRowBuilder<ButtonBuilder>[] {
    const active = this.quests.active(p);
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    if (active.length > 0) {
      let row = new ActionRowBuilder<ButtonBuilder>();
      let count = 0;
      for (const q of active) {
        if (count >= 4) {
          rows.push(row);
          row = new ActionRowBuilder<ButtonBuilder>();
          count = 0;
        }
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`quest:abandon:${p.id}:${q.id}`)
            .setLabel(`🗑️ Porzuć: ${q.name}`.slice(0, 80))
            .setStyle(ButtonStyle.Danger),
        );
        count++;
      }
      if (count > 0) rows.push(row);
    }
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`menu:back:${p.id}`)
          .setLabel('← Menu')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`quest:close:${p.id}`)
          .setLabel('✖ Zamknij')
          .setStyle(ButtonStyle.Danger),
      ),
    );
    return rows;
  }
}
