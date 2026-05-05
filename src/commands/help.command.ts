import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type ButtonInteraction } from 'discord.js';
import type { ICommand, ICommandContext } from '../types/command.types.js';
import type { CommandManager } from '../managers/command.manager.js';

const DISCORD_LIMIT = 2000;
const HEADER_RESERVE = 80;
const PAGE_BUDGET = DISCORD_LIMIT - HEADER_RESERVE;

export class HelpCommand implements ICommand {
  readonly name = 'help';
  readonly prefix = '.help';
  readonly description = 'Wyświetla listę dostępnych komend (stronicowane).';
  readonly requiresPrompt = false;

  constructor(private readonly manager: CommandManager) {}

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const view = this.buildView(0);
    await ctx.msg.reply(view);
  }

  async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId.startsWith('help:')) return;
    const [, pageStr] = interaction.customId.split(':');
    const page = parseInt(pageStr, 10);
    if (!Number.isFinite(page)) return;
    const view = this.buildView(page);
    try {
      await interaction.update(view);
    } catch {
      await interaction
        .reply({ content: 'Nie udało się przełączyć strony.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }

  private buildPages(): string[] {
    const lines = this.manager.list().map((c) => `• \`${c.prefix.trim()}\` — ${c.description}`);
    const pages: string[] = [];
    let buf = '';
    for (const line of lines) {
      const sep = buf ? 1 : 0;
      if (buf && buf.length + sep + line.length > PAGE_BUDGET) {
        pages.push(buf);
        buf = '';
      }
      buf += (buf ? '\n' : '') + line;
    }
    if (buf) pages.push(buf);
    return pages.length ? pages : [''];
  }

  private buildView(page: number): {
    content: string;
    components: ActionRowBuilder<ButtonBuilder>[];
  } {
    const pages = this.buildPages();
    const total = pages.length;
    const safe = Math.max(0, Math.min(page, total - 1));
    const header = `📋 **Dostępne komendy** — strona ${safe + 1}/${total}`;
    const content = `${header}\n${pages[safe]}`;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`help:${safe - 1}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safe <= 0),
      new ButtonBuilder()
        .setCustomId(`help:_`)
        .setLabel(`${safe + 1}/${total}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`help:${safe + 1}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safe >= total - 1),
    );
    return { content, components: total > 1 ? [row] : [] };
  }
}
