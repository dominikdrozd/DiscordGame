import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { ICommand } from '../types/command.types.js';
import { hasSlashCommand } from '../types/command.types.js';
import { errMsg } from '../utils.js';

interface InteractionHandler {
  handleInteraction(interaction: unknown): Promise<void>;
}

function hasInteractionHandler(cmd: ICommand): cmd is ICommand & InteractionHandler {
  return 'handleInteraction' in cmd && typeof cmd.handleInteraction === 'function';
}

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

    const channelId = msg.channel?.id;
    const isThread = !!msg.channel?.isThread?.();
    const isRegisteredThread = isThread && channelId && this.threadInfo.has(channelId);

    // Orphan thread (po restartcie bota) — nazwa wskazuje rolę, ale state
    // in-memory zniknął. Powiadom usera + sprzątnij wątek żeby nie zaśmiecał.
    if (isThread && !isRegisteredThread && msg.channel?.name) {
      const name = String(msg.channel.name);
      if (name.startsWith('Plecak:') || name.startsWith('Sklep:') || name.startsWith('Smith:')) {
        await msg
          .reply(
            '⚠️ Ten wątek osierocony po restarcie bota — wpisz `.inv` / `.menu` żeby otworzyć nowy. Stary zaraz znika.',
          )
          .catch(() => {});
        if (typeof msg.channel.delete === 'function') {
          msg.channel.delete('Orphaned thread po restarcie bota').catch(() => {});
        }
        return;
      }
    }

    if (isRegisteredThread) {
      this.scheduleThreadDelete(channelId);
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
    } else if (isRegisteredThread) {
      const info = this.threadInfo.get(channelId);
      if (!info) return;
      cmd = info.command;
      // Pełna treść jako prompt — `extractPrompt` ślepo ucinałby N znaków
      // od początku zniekształcając tekst (`sell 6 7` → `6 7` przy prefixie `.inv`).
      prompt = msg.content.trim();
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

  async handleInteraction(interaction: unknown): Promise<void> {
    const lagLog = process.env.LAG_LOG !== '0';
    const threshold = parseInt(process.env.LAG_LOG_THRESHOLD_MS || '200', 10);
    const slow: Array<{ name: string; ms: number }> = [];
    for (const cmd of this.commands) {
      if (!hasInteractionHandler(cmd)) continue;
      const t0 = lagLog ? Date.now() : 0;
      try {
        await cmd.handleInteraction(interaction);
      } catch (e) {
        console.error(`[manager] handleInteraction ${cmd.name}:`, errMsg(e));
      }
      if (lagLog) {
        const ms = Date.now() - t0;
        if (ms >= 50) slow.push({ name: cmd.name, ms });
      }
    }
    if (lagLog && slow.length > 0) {
      const total = slow.reduce((s, x) => s + x.ms, 0);
      if (total >= threshold) {
        const breakdown = slow.map((s) => `${s.name}=${s.ms}ms`).join(' ');
        const customId =
          interaction && typeof interaction === 'object' && 'customId' in interaction
            ? String((interaction as { customId: unknown }).customId)
            : '?';
        console.warn(`[lag-mgr] btn "${customId}" cmds: ${breakdown}`);
      }
    }
  }

  /** Lista slash-command JSON definitions do rejestracji w Discord. */
  slashDefinitions(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
    return this.commands
      .filter(hasSlashCommand)
      .map((c) => c.slashDefinition);
  }

  async dispatchSlash(interaction: ChatInputCommandInteraction): Promise<void> {
    for (const cmd of this.commands) {
      if (!hasSlashCommand(cmd)) continue;
      if (cmd.slashDefinition.name !== interaction.commandName) continue;
      try {
        await cmd.executeSlash(interaction);
      } catch (e) {
        console.error(`[manager] dispatchSlash ${cmd.name}:`, errMsg(e));
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({ content: `Błąd: ${errMsg(e)}`, flags: MessageFlags.Ephemeral })
            .catch(() => {});
        }
      }
      return;
    }
  }

  async dispatchAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    for (const cmd of this.commands) {
      if (!hasSlashCommand(cmd)) continue;
      if (cmd.slashDefinition.name !== interaction.commandName) continue;
      if (!cmd.autocomplete) return;
      try {
        await cmd.autocomplete(interaction);
      } catch (e) {
        console.error(`[manager] dispatchAutocomplete ${cmd.name}:`, errMsg(e));
      }
      return;
    }
  }

  /** Public — używane też przez interaction handlery (np. menu otwierający sklep). */
  registerThreadFor(thread: any, command: ICommand): void {
    if (!thread?.id) return;
    this.threadInfo.set(thread.id, { command, thread });
    this.scheduleThreadDelete(thread.id);
  }

  private registerThread(thread: any, command: ICommand): void {
    this.registerThreadFor(thread, command);
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
    timer.unref?.();
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
      console.error(`[manager] auto-delete fail ${threadId}:`, errMsg(e));
    }
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run: Promise<void> = this.queueTail.then(task, task);
    this.queueTail = run.catch(() => {});
    return run;
  }
}
