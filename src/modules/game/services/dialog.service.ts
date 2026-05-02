import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { PlayerStatsService, type PlayerStats } from './player-stats.js';
import { findNpcCity, getNpc } from '../npcs/index.js';
import { Npc, type DialogNode } from '../npcs/npc.js';
import { buildDialogOptionRows } from '../ui/dialog-buttons.js';

interface RenderTarget {
  reply(payload: { content: string; components?: ActionRowBuilder<ButtonBuilder>[] }): Promise<unknown>;
  authorId: string;
  authorName: string;
}

/**
 * Stateless dialog handler — wszystkie informacje (npcId, aktualny nodeId) są
 * w `customId` buttona, więc restart bota nie traci kontekstu.
 *
 * Format customId: `dialog:goto:<npcId>:<nodeId>:<userId>` gdzie `nodeId === 'end'`
 * oznacza zakończenie rozmowy i pokazanie ekranu pożegnalnego z buttonem powrotu
 * do widoku miasta.
 */
export class DialogService {
  constructor(private readonly stats: PlayerStatsService) {}

  /**
   * Start dialogu z poziomu komendy (`.talk`) — używa `msg.reply`.
   * Renderuje startNode danego NPC.
   */
  async startFromMessage(target: RenderTarget, npcId: string): Promise<void> {
    const npc = getNpc(npcId);
    if (!npc) {
      await target.reply({ content: `Nie znam NPC \`${npcId}\`.` });
      return;
    }
    const player = this.stats.get(target.authorId, target.authorName);
    const node = npc.dialog.getNode(npc.dialog.startNodeId);
    if (!node) {
      await target.reply({ content: `Dialog \`${npc.id}\` nie ma startNode.` });
      return;
    }
    await target.reply({
      content: this.renderNode(npc, node, player),
      components: buildDialogOptionRows(npc.id, node.options, player.id),
    });
  }

  /**
   * Start dialogu z poziomu buttona menu — używa `interaction.update`
   * (zamienia istniejącą wiadomość menu na widok dialogu, bez nowej wiadomości).
   */
  async startFromInteraction(interaction: ButtonInteraction, npcId: string): Promise<void> {
    const npc = getNpc(npcId);
    if (!npc) {
      await interaction.reply({ content: `Nie znam NPC \`${npcId}\`.`, ephemeral: true }).catch(() => {});
      return;
    }
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const node = npc.dialog.getNode(npc.dialog.startNodeId);
    if (!node) {
      await interaction
        .reply({ content: `Dialog \`${npc.id}\` nie ma startNode.`, ephemeral: true })
        .catch(() => {});
      return;
    }
    await interaction
      .update({
        content: this.renderNode(npc, node, player),
        components: buildDialogOptionRows(npc.id, node.options, player.id),
      })
      .catch(() => {});
  }

  /**
   * Start dialogu ze slash `/talk` — ephemeral reply zamiast publicznego.
   */
  async startFromSlash(
    interaction: ChatInputCommandInteraction,
    npcId: string,
  ): Promise<void> {
    const npc = getNpc(npcId);
    if (!npc) {
      await interaction
        .reply({ content: `Nie znam NPC \`${npcId}\`.`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }
    const player = this.stats.get(
      interaction.user.id,
      interaction.user.globalName || interaction.user.username,
    );
    const node = npc.dialog.getNode(npc.dialog.startNodeId);
    if (!node) {
      await interaction
        .reply({
          content: `Dialog \`${npc.id}\` nie ma startNode.`,
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    await interaction
      .reply({
        content: this.renderNode(npc, node, player),
        components: buildDialogOptionRows(npc.id, node.options, player.id),
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('dialog:')) return;
    const parts = interaction.customId.split(':');
    if (parts.length !== 5) return;
    const action = parts[1];
    const npcId = parts[2];
    const targetNodeId = parts[3];
    const userId = parts[4];

    if (action !== 'goto') return;
    if (interaction.user.id !== userId) {
      await interaction
        .reply({ content: 'To nie twoja rozmowa.', ephemeral: true })
        .catch(() => {});
      return;
    }
    const npc = getNpc(npcId);
    if (!npc) {
      await interaction
        .reply({ content: 'Ten NPC już cię nie pamięta (bot się zrestartował?).', ephemeral: true })
        .catch(() => {});
      return;
    }
    const player = this.stats.get(
      userId,
      interaction.user.globalName || interaction.user.username,
    );

    if (targetNodeId === 'end') {
      await this.renderEnd(interaction, npc, player);
      return;
    }
    const node = npc.dialog.getNode(targetNodeId);
    if (!node) {
      await interaction
        .reply({ content: `Nieznany węzeł rozmowy \`${targetNodeId}\`.`, ephemeral: true })
        .catch(() => {});
      return;
    }
    await interaction
      .update({
        content: this.renderNode(npc, node, player),
        components: buildDialogOptionRows(npc.id, node.options, player.id),
      })
      .catch(() => {});
  }

  private renderNode(npc: Npc, node: DialogNode, player: PlayerStats): string {
    void player;
    return [`💬 **Rozmowa z ${npc.name}**`, '', node.text].join('\n').slice(0, 1900);
  }

  private async renderEnd(
    interaction: ButtonInteraction,
    npc: Npc,
    player: PlayerStats,
  ): Promise<void> {
    const placement = findNpcCity(npc.id);
    const userId = player.id;
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    if (placement) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`menu:citypick:${placement.cityId}:${userId}`)
            .setLabel('← Wróć do miasta')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`menu:close:${userId}`)
            .setLabel('✖ Zamknij')
            .setStyle(ButtonStyle.Danger),
        ),
      );
    } else {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`menu:close:${userId}`)
            .setLabel('✖ Zamknij')
            .setStyle(ButtonStyle.Danger),
        ),
      );
    }
    await interaction
      .update({
        content: `💬 **${npc.name}** kiwa głową na pożegnanie. _Rozmowa zakończona._`,
        components: rows,
      })
      .catch(() => {});
  }

  /** Wrapper bound do `.talk` command — przyjmuje `msg` ICommandContext. */
  async startFromCommand(
    msg: { author: { id: string }; reply: (payload: unknown) => Promise<unknown> },
    authorName: string,
    npcId: string,
  ): Promise<void> {
    const target: RenderTarget = {
      authorId: msg.author.id,
      authorName,
      reply: (payload) => msg.reply(payload),
    };
    await this.startFromMessage(target, npcId);
  }

  /** helper used by tests / introspection */
  ensurePlayer(userId: string, name?: string): PlayerStats {
    return this.stats.get(userId, name);
  }
}
