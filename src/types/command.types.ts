import type { Client } from 'discord.js';

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
