/**
 * Standalone skrypt do migracji legacy JSON → MongoDB.
 *
 * Uruchomienie:
 *   bun run scripts/migrate-to-mongo.ts
 *
 * Wymaga `MONGO_URI` w `.env`. Stare pliki nie są usuwane —
 * `data/players/` zostaje rename'owany na `data/players.migrated-<ts>/`,
 * `data/parties.json` na `data/parties.json.migrated-<ts>`.
 *
 * Skrypt jest idempotentny — jeśli `players` collection nie jest pusty,
 * cała migracja graczy jest pomijana (potem boot bota zrobi to samo).
 *
 * Po pomyślnej migracji + smoke teście produkcji ten skrypt można usunąć
 * — `migrateLegacyJsonIfNeeded` w `src/index.ts` jest re-runnable.
 */
import 'dotenv/config';
import { MongoConnection } from '../src/persistence/mongo.js';
import { makeRepos, ensureIndexes } from '../src/persistence/repos/index.js';
import { migrateLegacyJsonIfNeeded } from '../src/persistence/migrate-legacy.js';

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('[fatal] MONGO_URI nie ustawione w .env');
  process.exit(1);
}

const mongo = new MongoConnection();
await mongo.connect(uri);
const repos = makeRepos(mongo.db());
await ensureIndexes(repos);

const playerCountBefore = await repos.player.count();
const itemCountBefore = (await repos.item.findAll()).length;
const partyCountBefore = (await repos.party.findAll()).length;
console.log(
  `[mongo] Przed migracją: ${playerCountBefore} graczy, ${itemCountBefore} itemów, ${partyCountBefore} party`,
);

await migrateLegacyJsonIfNeeded(repos);

const playerCountAfter = await repos.player.count();
const itemCountAfter = (await repos.item.findAll()).length;
const partyCountAfter = (await repos.party.findAll()).length;
console.log(
  `[mongo] Po migracji:    ${playerCountAfter} graczy, ${itemCountAfter} itemów, ${partyCountAfter} party`,
);
console.log(
  `[mongo] Delta: +${playerCountAfter - playerCountBefore} graczy, +${itemCountAfter - itemCountBefore} itemów, +${partyCountAfter - partyCountBefore} party`,
);

await mongo.close();
console.log('[mongo] gotowe — można startować bota.');
