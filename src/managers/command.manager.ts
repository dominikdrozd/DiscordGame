import type { Client } from 'discord.js';
import type { ICommand } from '../types/command.types.js';

const DEFAULT_TTL_MIN = parseInt(process.env.THREAD_TTL_MIN || '60', 10);

export class CommandManager {
  private readonly commands: ICommand[] = [];
  private readonly threadInfo = new Map<string, { command: ICommand; thread: any }>();
  private readonly threadDeleteTimers = new Map<string, NodeJS.Timeout>();
  private readonly threadTtlMs: number = Math.max(1, DEFAULT_TTL_MIN) * 60_000;
  private queueTail: Promise<unknown> = Promise.resolve();

  register(command: ICommand): void {
    this.commands.push(command);
  }

  list(): ReadonlyArray<ICommand> {
    return this.commands;
  }

  async dispatch(client: Client, msg: any): Promise<void> {
    if (msg.author?.bot) return;

    const inOurThread = msg.channel?.isThread?.() && msg.channel.ownerId === client.user?.id;

    if (inOurThread && this.threadInfo.has(msg.channel.id)) {
      this.scheduleThreadDelete(msg.channel.id);
    }

    const cmdByPrefix = this.commands.find((c) => c.matches(msg.content));

    let cmd: ICommand | undefined;
    let prompt: string;

    if (cmdByPrefix) {
      cmd = cmdByPrefix;
      prompt = cmd.extractPrompt(msg.content);
      if (!prompt && cmd.requiresPrompt !== false) {
        await msg.reply(`Użycie: \`${cmd.prefix.trim()} <pytanie>\``);
        return;
      }
    } else if (inOurThread) {
      const info = this.threadInfo.get(msg.channel.id);
      if (!info) return;
      cmd = info.command;
      prompt = cmd.extractPrompt(msg.content);
      if (!prompt) return;
    } else {
      return;
    }

    const command = cmd;
    const finalPrompt = prompt;
    await this.enqueue(() =>
      command.execute({
        client,
        msg,
        prompt: finalPrompt,
        registerThread: (thread) => this.registerThread(thread, command),
        forgetThread: (threadId) => this.forgetThread(threadId),
      }),
    );
  }

  async handleInteraction(interaction: any): Promise<void> {
    for (const cmd of this.commands) {
      if (typeof (cmd as any).handleInteraction === 'function') {
        try {
          await (cmd as any).handleInteraction(interaction);
        } catch (e) {
          console.error(`[manager] handleInteraction ${cmd.name}:`, (e as Error).message);
        }
      }
    }
  }

  private registerThread(thread: any, command: ICommand): void {
    if (!thread?.id) return;
    this.threadInfo.set(thread.id, { command, thread });
    this.scheduleThreadDelete(thread.id);
  }

  forgetThread(threadId: string): void {
    const t = this.threadDeleteTimers.get(threadId);
    if (t) clearTimeout(t);
    this.threadDeleteTimers.delete(threadId);
    this.threadInfo.delete(threadId);
  }

  private scheduleThreadDelete(threadId: string): void {
    const existing = this.threadDeleteTimers.get(threadId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.deleteThread(threadId), this.threadTtlMs);
    if ((timer as any).unref) (timer as any).unref();
    this.threadDeleteTimers.set(threadId, timer);
  }

  private async deleteThread(threadId: string): Promise<void> {
    const info = this.threadInfo.get(threadId);
    this.threadInfo.delete(threadId);
    this.threadDeleteTimers.delete(threadId);
    if (!info) return;
    try {
      await info.thread.delete('TTL: brak aktywności');
      console.log(`[manager] auto-deleted thread ${threadId}`);
    } catch (e) {
      console.error(`[manager] auto-delete fail ${threadId}:`, (e as Error).message);
    }
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queueTail.then(task, task) as Promise<void>;
    this.queueTail = run.catch(() => {});
    return run;
  }
}
