import type {
  ChatInputCommandInteraction,
  Client,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export interface ICommandContext {
  client: Client;
  msg: any;
  prompt: string;
  registerThread(thread: any): void;
  forgetThread(threadId: string): void;
}

export interface ICommand {
  readonly name: string;
  readonly prefix: string;
  readonly description: string;
  readonly requiresPrompt?: boolean;
  matches(content: string): boolean;
  extractPrompt(content: string): string;
  execute(ctx: ICommandContext): Promise<void>;
}

/**
 * Optional slash command interface — if a command implements this, it's
 * registered with Discord on bot ready and routed via InteractionCreate.
 *
 * Slash commands give us native Discord ephemeral responses (only the
 * caller sees the reply) and proper option validation.
 */
export interface ISlashCommand {
  /** Discord slash-command JSON definition (from SlashCommandBuilder.toJSON()). */
  readonly slashDefinition: RESTPostAPIChatInputApplicationCommandsJSONBody;
  /** Handle the slash command interaction. */
  executeSlash(interaction: ChatInputCommandInteraction): Promise<void>;
}

export function hasSlashCommand<T>(cmd: T): cmd is T & ISlashCommand {
  if (!cmd || typeof cmd !== 'object') return false;
  if (!('slashDefinition' in cmd)) return false;
  if (!('executeSlash' in cmd)) return false;
  return typeof cmd.executeSlash === 'function';
}
