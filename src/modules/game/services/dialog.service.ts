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
import { Npc, type DialogContext, type DialogNode, type DialogOption } from '../npcs/npc.js';
import { buildDialogOptionRows } from '../ui/dialog-buttons.js';
import { QuestService } from './quest.service.js';

interface RenderTarget {
  reply(payload: { content: string; components?: ActionRowBuilder<ButtonBuilder>[] }): Promise<unknown>;
  authorId: string;
  authorName: string;
}

/**
 * Stateless dialog handler — wszystkie informacje (npcId, aktualny nodeId,
 * optIdx) są w `customId` buttona, więc restart bota nie traci kontekstu.
 *
 * Format customId: `dialog:opt:<npcId>:<currentNodeId>:<optIdx>:<userId>`.
 * Klik → DialogService bierze `currentNode.options.filter(visibleIf)[optIdx]`,
 * uruchamia `effect`, nawiguje do `goto`. `effect` może zwrócić linię
 * komunikatu (np. "Wziąłeś questa") — doklejamy ją do następnego rendera.
 */
export class DialogService {
  constructor(
    private readonly stats: PlayerStatsService,
    private readonly quests: QuestService,
  ) {}

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
    const ctx = this.buildCtx(player, npc);
    const options = this.visibleOptions(node, ctx);
    await target.reply({
      content: this.renderNode(npc, node, ''),
      components: buildDialogOptionRows(npc.id, npc.dialog.startNodeId, options, player.id),
    });
  }

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
    const ctx = this.buildCtx(player, npc);
    const options = this.visibleOptions(node, ctx);
    await interaction
      .update({
        content: this.renderNode(npc, node, ''),
        components: buildDialogOptionRows(npc.id, npc.dialog.startNodeId, options, player.id),
      })
      .catch(() => {});
  }

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
    const ctx = this.buildCtx(player, npc);
    const options = this.visibleOptions(node, ctx);
    await interaction
      .reply({
        content: this.renderNode(npc, node, ''),
        components: buildDialogOptionRows(npc.id, npc.dialog.startNodeId, options, player.id),
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('dialog:')) return;
    const parts = interaction.customId.split(':');
    if (parts.length !== 6) return; // dialog:opt:<npc>:<node>:<idx>:<user>
    const action = parts[1];
    const npcId = parts[2];
    const currentNodeId = parts[3];
    const optIdx = parseInt(parts[4], 10);
    const userId = parts[5];

    if (action !== 'opt') return;
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
    const ctx = this.buildCtx(player, npc);
    const sourceNode = npc.dialog.getNode(currentNodeId);
    if (!sourceNode) {
      await interaction
        .reply({ content: `Nieznany węzeł rozmowy \`${currentNodeId}\`.`, ephemeral: true })
        .catch(() => {});
      return;
    }
    const visible = this.visibleOptions(sourceNode, ctx);
    const opt = visible[optIdx];
    if (!opt) {
      // Stan zmienił się między renderem a klikiem — re-render z aktualną listą.
      await interaction
        .update({
          content: this.renderNode(npc, sourceNode, '_(opcja już niedostępna)_'),
          components: buildDialogOptionRows(npc.id, currentNodeId, visible, player.id),
        })
        .catch(() => {});
      return;
    }

    // Run effect (if any) PRZED nawigacją. Effect może zwrócić linię.
    let effectLine = '';
    if (opt.effect) {
      const ret = opt.effect(ctx);
      if (typeof ret === 'string') effectLine = ret;
      this.stats.save();
    }

    if (opt.goto === 'end') {
      await this.renderEnd(interaction, npc, player, effectLine);
      return;
    }
    const targetNode = npc.dialog.getNode(opt.goto);
    if (!targetNode) {
      await interaction
        .reply({ content: `Nieznany węzeł rozmowy \`${opt.goto}\`.`, ephemeral: true })
        .catch(() => {});
      return;
    }
    const newCtx = this.buildCtx(player, npc); // re-fetch po effect
    const targetVisible = this.visibleOptions(targetNode, newCtx);
    await interaction
      .update({
        content: this.renderNode(npc, targetNode, effectLine),
        components: buildDialogOptionRows(npc.id, opt.goto, targetVisible, player.id),
      })
      .catch(() => {});
  }

  // ── Helpers ────────────────────────────────────────

  private buildCtx(player: PlayerStats, npc: Npc): DialogContext {
    return { player, npc, quests: this.quests, stats: this.stats };
  }

  private visibleOptions(
    node: DialogNode,
    ctx: DialogContext,
  ): ReadonlyArray<DialogOption> {
    return node.options.filter((opt) => !opt.visibleIf || opt.visibleIf(ctx));
  }

  private renderNode(npc: Npc, node: DialogNode, prefixLine: string): string {
    const parts = [`💬 **Rozmowa z ${npc.name}**`, ''];
    if (prefixLine) parts.push(prefixLine, '');
    parts.push(node.text);
    return parts.join('\n').slice(0, 1900);
  }

  private async renderEnd(
    interaction: ButtonInteraction,
    npc: Npc,
    player: PlayerStats,
    prefixLine: string,
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
    const tail = `💬 **${npc.name}** kiwa głową na pożegnanie. _Rozmowa zakończona._`;
    const content = prefixLine ? `${prefixLine}\n\n${tail}` : tail;
    await interaction.update({ content, components: rows }).catch(() => {});
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
