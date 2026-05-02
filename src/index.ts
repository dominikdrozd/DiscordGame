import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import 'dotenv/config';
import { CommandManager } from './managers/command.manager.js';
import { errMsg } from './utils.js';
import { AskCommand } from './commands/ask.command.js';
import { AskMovieCommand } from './commands/ask-movie.command.js';
import { AskMedCommand } from './commands/ask-med.command.js';
import { MovieOfTheDayCommand } from './commands/movie-of-the-day.command.js';
import { ClearCommand } from './commands/clear.command.js';
import { PurgeCommand } from './commands/purge.command.js';
import { HelpCommand } from './commands/help.command.js';
import { createGameServices, registerGameCommands, startAmbushLoop } from './modules/game/index.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const manager = new CommandManager();
let ambushService: import('./modules/game/engine/ambush.js').AmbushService | null = null;

// chat / utility (non-game)
manager.register(new AskCommand());
manager.register(new AskMovieCommand());
manager.register(new AskMedCommand());
manager.register(new MovieOfTheDayCommand());

// game module
const gameServices = createGameServices();
registerGameCommands(manager, gameServices);

// admin
manager.register(new ClearCommand());
manager.register(new PurgeCommand());
manager.register(new HelpCommand(manager));

async function registerSlashCommands(applicationId: string): Promise<void> {
  const defs = manager.slashDefinitions();
  if (defs.length === 0) return;
  const token = process.env.DISCORD_TOKEN || '';
  if (!token) {
    console.warn('[slash] brak DISCORD_TOKEN — pomijam rejestrację slash commands');
    return;
  }
  const rest = new REST().setToken(token);
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    // Dev: rejestracja per-guild (instant). Prod: globalna (do 1h propagacji).
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: defs });
      console.log(`[slash] zarejestrowano ${defs.length} slash command(ów) w guildzie ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(applicationId), { body: defs });
      console.log(`[slash] zarejestrowano ${defs.length} slash command(ów) globalnie`);
    }
  } catch (e) {
    console.error('[slash] rejestracja nieudana:', errMsg(e));
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`Zalogowano jako ${c.user.tag}`);
  console.log(
    'Komendy:',
    manager
      .list()
      .map((cmd) => cmd.prefix.trim())
      .join(', '),
  );
  ambushService = startAmbushLoop(client, gameServices);
  void registerSlashCommands(c.user.id);
});

client.on(Events.MessageCreate, async (msg) => {
  await manager.dispatch(client, msg);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    await manager.dispatchAutocomplete(interaction);
    return;
  }
  if (interaction.isChatInputCommand()) {
    await manager.dispatchSlash(interaction);
    return;
  }
  await manager.handleInteraction(interaction);
  if (ambushService && interaction.isButton()) {
    await ambushService.handleInteraction(interaction);
  }
  // Fallback ack — gdy żaden service nie obsłużył (np. bot się zrestartował
  // i state in-memory zniknął), Discord pokaże "This interaction failed"
  // jeśli nie potwierdzimy.
  if (interaction.isButton() && !interaction.replied && !interaction.deferred) {
    await interaction
      .reply({
        content: '⚠️ Ta walka już nie istnieje (bot mógł się zrestartować). Otwórz ją ponownie.',
        ephemeral: true,
      })
      .catch(() => {});
  }
});

export async function handleMessage(c: Client, msg: any): Promise<void> {
  await manager.dispatch(c, msg);
}

client.login(process.env.DISCORD_TOKEN || '');
