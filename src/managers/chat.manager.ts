import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
  type InteractionEditReplyOptions,
  type Message,
  type MessageCreateOptions,
  type MessageEditOptions,
} from 'discord.js';

/**
 * ChatManager — singleton bramka dla WSZYSTKICH wiadomości Discord. Wszystkie
 * `interaction.reply/update/followUp`, `channel/thread.send`, `message.edit`
 * mają iść przez tego managera. Korzyści:
 *   - per-channel serializacja (przeciw 5 msg/5s rate limit)
 *   - auto-retry na transient errors (5xx, 429, ECONNRESET) z exponential backoff
 *   - auto-slice content do 1900 chars (Discord cap = 2000)
 *   - graceful 404 (thread/channel deleted) — log + return null zamiast throw
 *   - fallback dla wygasłej interaction (3s TTL) — replied/deferred → followUp
 *
 * Format passthrough — manager NIE narzuca emoji/bold/styling. Caller
 * przygotowuje treść; ChatManager dba tylko o transport.
 */

const MAX_LEN = 1900;
const TRUNCATE_SUFFIX = '… [obcięte]';
const RETRY_DELAYS_MS = [100, 250, 500];

type ReplyableInteraction = ButtonInteraction | ChatInputCommandInteraction;

interface SendableTarget<TMsg = Message> {
  id?: string;
  send: (payload: MessageCreateOptions | string) => Promise<TMsg>;
}

interface EditableMessage {
  edit: (payload: MessageEditOptions | string) => Promise<unknown>;
}

interface ReplyableMessage {
  reply: (payload: MessageCreateOptions | string) => Promise<unknown>;
}

export interface ReplyOpts {
  ephemeral?: boolean;
  components?: InteractionReplyOptions['components'];
  allowedMentions?: InteractionReplyOptions['allowedMentions'];
}

export interface SendOpts {
  components?: MessageCreateOptions['components'];
  allowedMentions?: MessageCreateOptions['allowedMentions'];
}

export interface UpdateOpts {
  components?: InteractionUpdateOptions['components'];
}

export interface EditOpts {
  content?: string;
  components?: MessageEditOptions['components'];
}

class ChatManager {
  /** Per-channel write queue — kolejne send'y do tego samego channelu czekają w kolejce. */
  private readonly channelQueues = new Map<string, Promise<unknown>>();

  /** Auto-truncate content > 1900 chars z suffixem. */
  private clip(content: string): string {
    if (content.length <= MAX_LEN) return content;
    return content.slice(0, MAX_LEN - TRUNCATE_SUFFIX.length) + TRUNCATE_SUFFIX;
  }

  /** True jeśli error jest transientny — warto retry. */
  private isRetryable(e: unknown): boolean {
    if (!e || typeof e !== 'object') return false;
    if ('code' in e) {
      const code = (e as { code: unknown }).code;
      if (typeof code === 'string' && (code === 'ECONNRESET' || code === 'ETIMEDOUT')) {
        return true;
      }
    }
    if ('status' in e) {
      const status = (e as { status: unknown }).status;
      if (typeof status === 'number' && (status >= 500 || status === 429)) return true;
    }
    return false;
  }

  /** True jeśli error to 404 (target gone) — log debug, nie warning. */
  private is404(e: unknown): boolean {
    if (!e || typeof e !== 'object' || !('status' in e)) return false;
    const status = (e as { status: unknown }).status;
    return typeof status === 'number' && status === 404;
  }

  private logFailure(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    if (this.is404(e)) {
      console.debug('[chat] target gone (404):', msg);
      return;
    }
    console.warn('[chat] send failed:', msg);
  }

  /**
   * Wykonuje `op` z retry'em na transient errors. Zwraca wynik op() lub null
   * jeśli wszystkie retry padły. Nie throw'uje.
   */
  private async withRetry<T>(op: () => Promise<T>): Promise<T | null> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await op();
      } catch (e: unknown) {
        lastErr = e;
        if (!this.isRetryable(e) || attempt === RETRY_DELAYS_MS.length) break;
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    this.logFailure(lastErr);
    return null;
  }

  /**
   * `interaction.reply`. Gdy interaction był już replied/deferred — fallback do followUp.
   */
  async reply(
    interaction: ReplyableInteraction,
    content: string,
    opts: ReplyOpts = {},
  ): Promise<void> {
    const payload: InteractionReplyOptions = { content: this.clip(content) };
    if (opts.ephemeral) payload.flags = MessageFlags.Ephemeral;
    if (opts.components) payload.components = opts.components;

    if (interaction.replied || interaction.deferred) {
      await this.withRetry(() => interaction.followUp(payload));
      return;
    }
    await this.withRetry(() => interaction.reply(payload));
  }

  /**
   * `interaction.update`. Gdy interaction był już replied/deferred — fallback do editReply.
   * Tylko ButtonInteraction wspiera `update` (slash interactions używają reply/editReply).
   */
  async update(
    interaction: ButtonInteraction,
    content: string,
    opts: UpdateOpts = {},
  ): Promise<void> {
    const clipped = this.clip(content);

    if (interaction.replied || interaction.deferred) {
      const editPayload: InteractionEditReplyOptions = { content: clipped };
      if (opts.components !== undefined) editPayload.components = opts.components;
      await this.withRetry(() => interaction.editReply(editPayload));
      return;
    }
    const updatePayload: InteractionUpdateOptions = { content: clipped };
    if (opts.components !== undefined) updatePayload.components = opts.components;
    await this.withRetry(() => interaction.update(updatePayload));
  }

  /**
   * `interaction.followUp`. Default ephemeral=true (typowy use case to side-message
   * niewidoczny dla innych). Set `ephemeral: false` jeśli chcesz publiczny.
   */
  async followUp(
    interaction: ReplyableInteraction,
    content: string,
    opts: ReplyOpts = {},
  ): Promise<void> {
    const payload: InteractionReplyOptions = { content: this.clip(content) };
    const ephemeral = opts.ephemeral !== false;
    if (ephemeral) payload.flags = MessageFlags.Ephemeral;
    if (opts.components) payload.components = opts.components;
    await this.withRetry(() => interaction.followUp(payload));
  }

  /**
   * `channel.send` lub `thread.send`. Wpisane w per-channel kolejkę — kolejne
   * `send`-y do tego samego target.id czekają na poprzedni write. Naive
   * serializacja przeciwdziała 5/5s spike'om (np. combat round 3-4 msg).
   */
  async send<TMsg = Message>(
    target: SendableTarget<TMsg>,
    content: string,
    opts: SendOpts = {},
  ): Promise<TMsg | null> {
    const clipped = this.clip(content);
    let payload: MessageCreateOptions | string;
    if (opts.components || opts.allowedMentions) {
      const obj: MessageCreateOptions = { content: clipped };
      if (opts.components) obj.components = opts.components;
      if (opts.allowedMentions) obj.allowedMentions = opts.allowedMentions;
      payload = obj;
    } else {
      payload = clipped;
    }

    const channelId = target.id ?? '__no_id__';
    const prev = this.channelQueues.get(channelId) ?? Promise.resolve();
    const result: Promise<TMsg | null> = prev
      .then(() => this.withRetry(() => target.send(payload)))
      .catch(() => null);
    // Queue holds void promise that never rejects — łańcuch nie pęka po error.
    this.channelQueues.set(
      channelId,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  /**
   * Edit istniejącej wiadomości. Slice content do 1900. Graceful 404
   * (wiadomość usunięta) — log debug + return.
   */
  async edit(message: EditableMessage, opts: EditOpts): Promise<void> {
    const payload: MessageEditOptions = {};
    if (opts.content !== undefined) payload.content = this.clip(opts.content);
    if (opts.components !== undefined) payload.components = opts.components;
    await this.withRetry(() => message.edit(payload));
  }

  /**
   * Odpowiedź na text-message (`.foo bar`) — wraps `msg.reply()`. Używane
   * w game commands (msg.reply), różne od interaction.reply (slash/button).
   * Bez components → przesyła plain string (zgodnie z konwencją bota).
   */
  async replyToMessage(
    msg: ReplyableMessage,
    content: string,
    opts: SendOpts = {},
  ): Promise<void> {
    const clipped = this.clip(content);
    if (opts.components || opts.allowedMentions) {
      const payload: MessageCreateOptions = { content: clipped };
      if (opts.components) payload.components = opts.components;
      if (opts.allowedMentions) payload.allowedMentions = opts.allowedMentions;
      await this.withRetry(() => msg.reply(payload));
      return;
    }
    await this.withRetry(() => msg.reply(clipped));
  }

  /** Defer interaction reply — używać gdy operacja > 3s (Discord interaction TTL). */
  async deferReply(interaction: ReplyableInteraction, ephemeral = false): Promise<void> {
    if (interaction.replied || interaction.deferred) return;
    if (ephemeral) {
      await this.withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
    } else {
      await this.withRetry(() => interaction.deferReply());
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Globalny singleton — używaj `import { chat } from '...'` we wszystkich serwisach. */
export const chat = new ChatManager();
