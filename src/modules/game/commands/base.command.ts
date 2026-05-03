import type { ICommand, ICommandContext } from '../../../types/command.types.js';

/**
 * Bazowa klasa dla wszystkich komend gry. Dostarcza domyślne
 * `matches()` i `extractPrompt()` (identyczne we wszystkich komendach
 * przed refactorem). Subklasy implementują `name`/`prefix`/`description`
 * jako readonly + `execute()`.
 *
 * Komendy slash dodatkowo implementują `ISlashCommand` strukturalnie
 * (osobno) — ten interfejs nie wymaga dziedziczenia.
 *
 * Wzorzec ustanowiony przez `GatheringCommand` (mine/fish/chop) —
 * `BaseCommand` rozszerza ten precedens na resztę komend.
 */
export abstract class BaseCommand implements ICommand {
  abstract readonly name: string;
  abstract readonly prefix: string;
  abstract readonly description: string;
  readonly requiresPrompt: boolean = false;

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  abstract execute(ctx: ICommandContext): Promise<void>;
}
