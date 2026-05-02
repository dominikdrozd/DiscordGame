import type { ICommand, ICommandContext } from '../types/command.types.js';
import { getMovieOfTheDay } from '../tools.js';

export class MovieOfTheDayCommand implements ICommand {
  readonly name = 'film_dnia';
  readonly prefix = '.film_dnia';
  readonly description =
    'Losuje film z trendów TMDB na dzisiaj — surowy wynik z API, bez udziału modelu.';
  readonly requiresPrompt = false;

  private readonly tmdbApiKey: string = process.env.TMDB_API_KEY || '';

  matches(content: string): boolean {
    const t = content.trim();
    return t === this.prefix || t.startsWith(this.prefix + ' ');
  }

  extractPrompt(content: string): string {
    return content.slice(this.prefix.length).trim();
  }

  async execute(ctx: ICommandContext): Promise<void> {
    const { msg } = ctx;
    try {
      const movie = await getMovieOfTheDay(this.tmdbApiKey);
      if ('error' in movie) {
        await msg.reply(`Błąd TMDB: ${movie.error}`);
        await msg.react('❌').catch(() => {});
        return;
      }
      await msg.reply(`🎬 **Film na dzisiaj (TMDB trending):**\n${movie.formatted}`);
      await msg.react('✅').catch(() => {});
    } catch (err) {
      console.error(err);
      await msg.reply(`Błąd: ${(err as Error).message}`).catch(() => {});
      await msg.react('❌').catch(() => {});
    }
  }
}
