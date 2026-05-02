import type { ICommand, ICommandContext } from '../types/command.types.js';
import { errMsg } from '../utils.js';

const PURGE_CHANNEL_ID = process.env.PURGE_CHANNEL_ID || '1500080398426705940';
const OWNER_ID = process.env.BOT_OWNER_ID || '240155722908696577';

export class PurgeCommand implements ICommand {
  readonly name = 'purge';
  readonly prefix = '.purge';
  readonly description = `Hurtowe czyszczenie ostatnich wiadomości w wyznaczonym kanale (\`${PURGE_CHANNEL_ID}\`). Działa tylko dla właściciela bota (\`BOT_OWNER_ID\` w .env). Użycie: \`.purge [ile=100]\` (max 100 i tylko wiadomości młodsze niż 14 dni).`;
  readonly requiresPrompt = false;

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg, prompt } = ctx;

    if (msg.channel.id !== PURGE_CHANNEL_ID) {
      // celowo ciche ignorowanie w innych kanałach
      return;
    }
    if (msg.author.id !== OWNER_ID) {
      await msg.reply('Tylko właściciel bota może użyć `.purge`.').catch(() => {});
      return;
    }

    const parsed = parseInt(prompt || '100', 10);
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 100;

    try {
      const fetched = await msg.channel.messages.fetch({ limit });
      const result = await msg.channel.bulkDelete(fetched, true);
      await msg.channel
        .send(
          `🧹 Wyczyszczone: ${result.size} wiadomości (pominięte starsze niż 14 dni nie wchodzą w bulk-delete).`,
        )
        .catch(() => {});
    } catch (e) {
      console.error('[purge]', errMsg(e));
      await msg.channel.send(`Błąd przy purge: ${errMsg(e)}`).catch(() => {});
    }
  }
}
