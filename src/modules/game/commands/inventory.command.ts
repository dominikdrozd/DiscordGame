import {
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { ICommandContext, ISlashCommand } from '../../../types/command.types.js';
import { InventoryService } from '../services/inventory.service.js';
import { BaseCommand } from './base.command.js';
import { chat } from '../../../managers/chat.manager.js';

export class InventoryCommand extends BaseCommand implements ISlashCommand {
  readonly name = 'inv';
  readonly prefix = '.inv';
  readonly description =
    'Otwiera plecak w prywatnym wątku — `/inv` lub `.inv`. Każdy item ma toggle Załóż/Zdejmij.';

  readonly slashDefinition = new SlashCommandBuilder()
    .setName('inv')
    .setDescription('Otwórz plecak w prywatnym wątku')
    .toJSON();

  constructor(
    private readonly inventory: InventoryService,
    /**
     * Register-thread closure podawane przez `registerGameCommands` —
     * w slash path (executeSlash) brak ctx.registerThread, więc dispatch
     * orphan-detection wywaliłby świeżo utworzony wątek przy pierwszej
     * wiadomości. Wstrzykujemy `manager.registerThreadFor(thread, this)`.
     */
    private readonly registerThreadFn?: (thread: unknown) => void,
  ) {
    super();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    return this.inventory.show(ctx);
  }

  async executeSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    const channel: unknown = interaction.channel;
    if (!hasThreadCreate(channel)) {
      await chat.reply(interaction, 'Ten kanał nie wspiera prywatnych wątków.', {
        ephemeral: true,
      });
      return;
    }
    await chat.deferReply(interaction, true);
    let errorMsg: string | undefined;
    let openSucceeded = false;
    await this.inventory.openInventoryForUser({
      userId: interaction.user.id,
      userName: interaction.user.globalName || interaction.user.username,
      channel,
      registerThread: (thread) => {
        if (this.registerThreadFn) this.registerThreadFn(thread);
        openSucceeded = true;
      },
      reply: async (content: string): Promise<unknown> => {
        errorMsg = content;
        return undefined;
      },
    });
    if (errorMsg && !openSucceeded) {
      await chat.editReply(interaction, errorMsg);
    } else {
      await chat.editReply(interaction, '🎒 Plecak otwarty w prywatnym wątku.');
    }
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    return this.inventory.handleInteraction(interaction);
  }
}

function hasThreadCreate(
  c: unknown,
): c is { threads: { create: (opts: unknown) => Promise<unknown> } } {
  if (!c || typeof c !== 'object') return false;
  if (!('threads' in c)) return false;
  const t = c.threads;
  if (!t || typeof t !== 'object') return false;
  if (!('create' in t)) return false;
  return typeof t.create === 'function';
}
