import type { Client } from 'discord.js';
import { streamQwen } from '../ollama.js';
import { TOOLS as DEFAULT_TOOLS, runTool } from '../tools.js';
import { displayName, stripPrefix } from '../utils.js';
import type { ICommand, ICommandContext } from '../types/command.types.js';

const HISTORY_LIMIT = 50;
const MAX_TOOL_ROUNDS = 3;

export abstract class Command implements ICommand {
  abstract readonly name: string;
  abstract readonly prefix: string;
  abstract readonly description: string;
  protected abstract readonly model: string;
  protected abstract readonly systemPrompt: string;
  protected readonly tools: any[] = DEFAULT_TOOLS;
  protected readonly tmdbApiKey: string = process.env.TMDB_API_KEY || '';

  matches(content: string): boolean {
    return content.startsWith(this.prefix);
  }

  extractPrompt(content: string): string {
    return stripPrefix(content, this.prefix);
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { client, msg, prompt, registerThread } = ctx;
    let target: any;
    try {
      const inOurThread =
        msg.channel?.isThread?.() && msg.channel.ownerId === client.user?.id;

      if (inOurThread) {
        target = msg.channel;
      } else {
        target = await msg.startThread({
          name: prompt.slice(0, 90) || this.name,
          autoArchiveDuration: 60,
        });
        if (target?.id) registerThread(target);
      }

      const messages: any[] = [{ role: 'system', content: this.systemPrompt }];
      if (inOurThread) {
        messages.push(...(await this.buildHistory(client, target, msg)));
      }
      messages.push({
        role: 'user',
        content: `[${displayName(msg)}]: ${prompt}`,
      });

      await target.sendTyping();
      const placeholder = await target.send('…');

      let latest = '';
      let lastSent = '…';
      let timer: NodeJS.Timeout | null = null;

      const pushEdit = async () => {
        timer = null;
        const text =
          latest.length > 1900 ? latest.slice(0, 1900) + '…' : latest;
        const next = text || '…';
        if (next === lastSent) return;
        lastSent = next;
        try {
          await placeholder.edit(next);
        } catch (e) {
          console.error('edit fail:', (e as Error)?.message);
        }
      };
      const schedule = () => {
        if (timer) return;
        timer = setTimeout(pushEdit, 1000);
      };

      let answer = '';
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const { content, toolCalls } = (await streamQwen(
          this.model,
          messages,
          (full) => {
            latest = full;
            schedule();
          },
          this.tools,
        )) as { content: string; toolCalls: any[] };

        if (!toolCalls.length) {
          answer = content || '(pusta odpowiedź)';
          break;
        }

        const names = toolCalls
          .map(
            (c: any) =>
              `${c.function?.name}(${JSON.stringify(c.function?.arguments ?? {})})`,
          )
          .join(', ');
        console.log(`[${this.name} round ${round}] tool_calls: ${names}`);

        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        latest = `🔎 Sprawdzam: ${names}…`;
        await pushEdit();

        messages.push({
          role: 'assistant',
          content,
          tool_calls: toolCalls,
        });
        for (const call of toolCalls) {
          const result = await runTool(call, this.tmdbApiKey);
          messages.push({
            role: 'tool',
            name: call.function?.name,
            content: JSON.stringify(result),
          });
        }
        latest = '';
        lastSent = latest;
      }

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      latest = answer;
      await pushEdit();
      await msg.react('✅').catch(() => {});
    } catch (err) {
      console.error(err);
      await (target ?? msg)
        .send(`Błąd: ${(err as Error).message}`)
        .catch(() => {});
      await msg.react('❌').catch(() => {});
    }
  }

  protected async buildHistory(
    client: Client,
    thread: any,
    currentMsg: any,
  ): Promise<any[]> {
    const out: any[] = [];
    try {
      const starter = await thread.fetchStarterMessage();
      if (starter && starter.id !== currentMsg.id && starter.content) {
        const content = stripPrefix(starter.content, this.prefix);
        if (content) {
          const isBot = starter.author.id === client.user?.id;
          out.push({
            role: isBot ? 'assistant' : 'user',
            content: isBot
              ? content
              : `[${displayName(starter)}]: ${content}`,
          });
        }
      }
    } catch {}

    const fetched = await thread.messages.fetch({ limit: HISTORY_LIMIT });
    const ordered = [...fetched.values()]
      .filter((m: any) => m.id !== currentMsg.id && m.content)
      .sort((a: any, b: any) => a.createdTimestamp - b.createdTimestamp);

    for (const m of ordered) {
      const content = stripPrefix(m.content, this.prefix);
      if (!content) continue;
      const isBot = m.author.id === client.user?.id;
      out.push({
        role: isBot ? 'assistant' : 'user',
        content: isBot ? content : `[${displayName(m)}]: ${content}`,
      });
    }
    return out;
  }
}
