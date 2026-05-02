import { Client, GatewayIntentBits, Events } from 'discord.js';
import 'dotenv/config';
import { CommandManager } from './managers/command.manager.js';
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
});

client.on(Events.MessageCreate, async (msg) => {
  await manager.dispatch(client, msg);
});

client.on(Events.InteractionCreate, async (interaction) => {
  await manager.handleInteraction(interaction);
  if (ambushService && 'isButton' in interaction) {
    await ambushService.handleInteraction(interaction as any);
  }
});

export async function handleMessage(c: Client, msg: any): Promise<void> {
  await manager.dispatch(c, msg);
}

client.login(process.env.DISCORD_TOKEN || '');
