import { Client, GatewayIntentBits, Events, MessageFlags, REST, Routes } from 'discord.js';
import 'dotenv/config';
import { CommandManager } from './managers/command.manager.js';
import { errMsg } from './utils.js';
import { MongoConnection } from './persistence/mongo.js';
import { makeRepos, ensureIndexes } from './persistence/repos/index.js';
import { migrateLegacyJsonIfNeeded } from './persistence/migrate-legacy.js';
import { AskCommand } from './commands/ask.command.js';
import { AskMovieCommand } from './commands/ask-movie.command.js';
import { AskMedCommand } from './commands/ask-med.command.js';
import { MovieOfTheDayCommand } from './commands/movie-of-the-day.command.js';
import { ClearCommand } from './commands/clear.command.js';
import { PurgeCommand } from './commands/purge.command.js';
import { HelpCommand } from './commands/help.command.js';
import {
  createGameServices,
  registerGameCommands,
  startAmbushLoop,
  startWorldBossLoop,
  startArenaLoop,
} from './modules/game/index.js';

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('[fatal] MONGO_URI nie ustawione w env — bot nie wystartuje');
  process.exit(1);
}
const mongo = new MongoConnection();
await mongo.connect(mongoUri);
const repos = makeRepos(mongo.db());
await ensureIndexes(repos);
await migrateLegacyJsonIfNeeded(repos);
console.log('[mongo] connected to', mongo.db().databaseName);

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
let worldBossService: import('./modules/game/engine/world-boss.js').WorldBossService | null = null;
let arenaService: import('./modules/game/engine/arena.js').ArenaService | null = null;

// chat / utility (non-game)
manager.register(new AskCommand());
manager.register(new AskMovieCommand());
manager.register(new AskMedCommand());
manager.register(new MovieOfTheDayCommand());

// game module
const gameServices = await createGameServices(repos);
await registerGameCommands(manager, gameServices);

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

client.once(Events.ClientReady, async (c) => {
  console.log(`Zalogowano jako ${c.user.tag}`);
  console.log(
    'Komendy:',
    manager
      .list()
      .map((cmd) => cmd.prefix.trim())
      .join(', '),
  );
  ambushService = await startAmbushLoop(client, gameServices);
  worldBossService = await startWorldBossLoop(client, gameServices);
  arenaService = startArenaLoop(client, gameServices);
  void registerSlashCommands(c.user.id);
});

/**
 * Lag diagnostic — logguje stage timing dla interaction handlerów. Ustaw
 * `LAG_LOG_THRESHOLD_MS` (env, default 200ms) żeby zmienić próg. Globalnie
 * wyłącz `LAG_LOG=0`. Pokazuje który service najwięcej czasu zjada.
 */
const LAG_LOG = process.env.LAG_LOG !== '0';
const LAG_THRESHOLD_MS = parseInt(process.env.LAG_LOG_THRESHOLD_MS || '200', 10);

async function timed<T>(stage: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t0 };
}

client.on(Events.MessageCreate, async (msg) => {
  if (!LAG_LOG) {
    await manager.dispatch(client, msg);
    return;
  }
  const t0 = Date.now();
  await manager.dispatch(client, msg);
  const total = Date.now() - t0;
  if (total >= LAG_THRESHOLD_MS) {
    const cmd = msg.content?.split(/\s+/)[0]?.slice(0, 30) ?? '?';
    console.warn(`[lag] message "${cmd}" took ${total}ms (ws ping ${client.ws.ping}ms)`);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    await manager.dispatchAutocomplete(interaction);
    return;
  }
  if (interaction.isChatInputCommand()) {
    if (!LAG_LOG) {
      await manager.dispatchSlash(interaction);
      return;
    }
    const t0 = Date.now();
    await manager.dispatchSlash(interaction);
    const total = Date.now() - t0;
    if (total >= LAG_THRESHOLD_MS) {
      console.warn(
        `[lag] /${interaction.commandName} took ${total}ms (ws ping ${client.ws.ping}ms)`,
      );
    }
    return;
  }

  const customId = interaction.isButton() ? interaction.customId : '?';
  const stages: Array<{ name: string; ms: number }> = [];
  const tStart = Date.now();

  const mgr = await timed('manager', () => manager.handleInteraction(interaction));
  stages.push({ name: 'manager', ms: mgr.ms });

  if (ambushService && interaction.isButton()) {
    const r = await timed('ambush', () => ambushService!.handleInteraction(interaction));
    stages.push({ name: 'ambush', ms: r.ms });
  }
  if (worldBossService && interaction.isButton()) {
    const r = await timed('worldBoss', () => worldBossService!.handleInteraction(interaction));
    stages.push({ name: 'worldBoss', ms: r.ms });
  }
  if (arenaService && interaction.isButton()) {
    const r = await timed('arena', () => arenaService!.handleInteraction(interaction));
    stages.push({ name: 'arena', ms: r.ms });
  }
  if (interaction.isButton() && interaction.customId.startsWith('idfy:')) {
    const r = await timed('idfy', () =>
      gameServices.identification.handleInteraction(interaction),
    );
    stages.push({ name: 'idfy', ms: r.ms });
  }
  if (interaction.isButton() && interaction.customId.startsWith('ench:')) {
    const r = await timed('ench', () => gameServices.enchanter.handleInteraction(interaction));
    stages.push({ name: 'ench', ms: r.ms });
  }
  if (interaction.isButton() && !interaction.replied && !interaction.deferred) {
    await interaction
      .reply({
        content: '⚠️ Ta walka już nie istnieje (bot mógł się zrestartować). Otwórz ją ponownie.',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  if (LAG_LOG) {
    const total = Date.now() - tStart;
    if (total >= LAG_THRESHOLD_MS) {
      const breakdown = stages
        .filter((s) => s.ms >= 5)
        .map((s) => `${s.name}=${s.ms}ms`)
        .join(' ');
      console.warn(
        `[lag] btn "${customId}" total=${total}ms (ws ${client.ws.ping}ms) ${breakdown}`,
      );
    }
  }
});

export async function handleMessage(c: Client, msg: any): Promise<void> {
  await manager.dispatch(c, msg);
}

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[shutdown] received ${signal}, flushing + closing`);
  try {
    await gameServices.stats.flush();
    await gameServices.party.flush();
    await mongo.close();
    await client.destroy();
  } catch (e) {
    console.error('[shutdown] error:', errMsg(e));
  }
  process.exit(0);
};
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

client.login(process.env.DISCORD_TOKEN || '');
