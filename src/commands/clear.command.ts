import type { ICommand, ICommandContext } from '../types/command.types.js';
import { errMsg } from '../utils.js';

export class ClearCommand implements ICommand {
  readonly name = 'clear';
  readonly prefix = '.clear';
  readonly description =
    'Usuwa bieżący wątek (działa wyłącznie wewnątrz wątku stworzonego przez bota).';
  readonly requiresPrompt = false;

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { client, msg, forgetThread } = ctx;
    const inOurThread = msg.channel?.isThread?.() && msg.channel.ownerId === client.user?.id;

    if (!inOurThread) {
      await msg.reply('`.clear` działa wyłącznie wewnątrz wątku stworzonego przez bota.');
      return;
    }

    const threadId = msg.channel.id;
    try {
      forgetThread(threadId);
      await msg.channel.delete('manual .clear');
    } catch (e) {
      await msg.reply(`Błąd usuwania wątku: ${errMsg(e)}`).catch(() => {});
    }
  }
}
