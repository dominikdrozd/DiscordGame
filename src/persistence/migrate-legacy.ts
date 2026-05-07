import fs from 'node:fs';
import path from 'node:path';
import type { Repos, PlayerDoc, ItemDoc } from './repos/index.js';

/**
 * Jednorazowa migracja legacy JSON → Mongo. Skip jeśli `players` collection
 * jest już zapełniona. Po sukcesie rename'uje stary plik/folder na
 * `*.migrated-<ts>` jako safety net (NIE usuwa).
 *
 * Obsługuje dwa warianty:
 *  1. `data/players.json` (monolith — najstarsza wersja)
 *  2. `data/players/*.json` (per-player files — wersja pomiędzy)
 */
export async function migrateLegacyJsonIfNeeded(
  repos: Repos,
  rootDir: string = path.resolve('data'),
): Promise<void> {
  if ((await repos.player.count()) > 0) return;

  const monolith = path.join(rootDir, 'players.json');
  if (fs.existsSync(monolith)) {
    const arr: unknown = JSON.parse(fs.readFileSync(monolith, 'utf8'));
    if (!Array.isArray(arr)) {
      console.warn('[mongo] data/players.json nie jest tablicą — pomijam migrację');
      return;
    }
    await migratePlayerArray(repos, arr as LegacyPlayer[]);
    fs.renameSync(monolith, `${monolith}.migrated-${Date.now()}`);
    return;
  }

  const dir = path.join(rootDir, 'players');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return;

  const players: LegacyPlayer[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'id' in parsed) {
        players.push(parsed as LegacyPlayer);
      }
    } catch (e) {
      console.warn(
        `[mongo] skip corrupt legacy file ${f}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  await migratePlayerArray(repos, players);
  fs.renameSync(dir, `${dir}.migrated-${Date.now()}`);
}

interface LegacyItem {
  uid: string;
  [key: string]: unknown;
}

interface LegacyPlayer {
  id: string;
  inventory: {
    resources: Record<string, number>;
    items?: LegacyItem[];
  };
  [key: string]: unknown;
}

async function migratePlayerArray(repos: Repos, players: LegacyPlayer[]): Promise<void> {
  const playerDocs: PlayerDoc[] = [];
  const itemDocs: ItemDoc[] = [];

  for (const p of players) {
    const items = p.inventory.items ?? [];
    // Reading legacy unknown JSON — `as unknown as` jest tutaj uzasadnione.
    // Kolejne wersje mogły mieć inne pola; ensureDefaults na load() naprawia missing fields.
    const stripped = {
      ...(p as unknown as PlayerDoc),
      _id: p.id,
      inventory: { resources: p.inventory.resources },
    };
    playerDocs.push(stripped);
    for (const item of items) {
      itemDocs.push({
        ...(item as unknown as ItemDoc),
        _id: item.uid,
        userId: p.id,
      });
    }
  }

  // walidacja unique uid między graczami — duplicate = manual fix needed
  const uids = itemDocs.map((d) => d._id);
  if (new Set(uids).size !== uids.length) {
    const dupes = uids.filter((u, i) => uids.indexOf(u) !== i);
    throw new Error(
      `[mongo] duplicate item uids in legacy data, fix manually: ${dupes.slice(0, 10).join(', ')}`,
    );
  }

  if (playerDocs.length > 0) await repos.player.insertMany(playerDocs);
  if (itemDocs.length > 0) await repos.item.insertMany(itemDocs);
  console.log(`[mongo] migrated ${playerDocs.length} players, ${itemDocs.length} items`);
}
