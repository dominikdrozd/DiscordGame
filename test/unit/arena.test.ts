import fs from 'node:fs';
import { ArenaService } from '../../src/modules/game/engine/arena.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { PartyService } from '../../src/modules/game/services/party.js';
import { ExpeditionService } from '../../src/modules/game/services/expedition.service.js';
import { QuestService } from '../../src/modules/game/services/quest.service.js';
import { tmpPlayerFile } from '../helpers/factories.js';
import path from 'node:path';
import os from 'node:os';

function tmpFile(prefix: string): string {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random()}.json`);
}

describe('ArenaService.runTournament — single-elim simulation', () => {
  let playerFile: string;
  let partyFile: string;
  let stats: PlayerStatsService;
  let party: PartyService;
  let arena: ArenaService;

  beforeEach(() => {
    playerFile = tmpPlayerFile();
    partyFile = tmpFile('parties');
    stats = new PlayerStatsService(playerFile);
    party = new PartyService(partyFile);
    const quests = new QuestService(stats);
    const expeditions = new ExpeditionService(stats, party, quests);
    arena = new ArenaService({} as never, stats, party, expeditions);
  });

  afterEach(() => {
    if (fs.existsSync(playerFile)) fs.rmSync(playerFile, { force: true });
    if (fs.existsSync(partyFile)) fs.rmSync(partyFile, { force: true });
  });

  test('2 graczy → 1 runda, jeden zwycięzca', () => {
    const a = stats.get('p1', 'Alice');
    const b = stats.get('p2', 'Bob');
    a.skills.combat.level = 10;
    b.skills.combat.level = 10;
    const result = arena.runTournament(['p1', 'p2']);
    expect(result.rounds).toHaveLength(1);
    expect(['p1', 'p2']).toContain(result.winnerId);
    expect(['p1', 'p2']).toContain(result.runnerUpId);
    expect(result.winnerId).not.toBe(result.runnerUpId);
  });

  test('4 graczy → 2 rundy, finałowi 2', () => {
    for (let i = 1; i <= 4; i++) {
      const p = stats.get(`p${i}`, `Player${i}`);
      p.skills.combat.level = 10;
    }
    const result = arena.runTournament(['p1', 'p2', 'p3', 'p4']);
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].matchups).toHaveLength(2);
    expect(result.rounds[1].matchups).toHaveLength(1);
  });

  test('nieparzysta liczba graczy → ostatni dostaje bye w pierwszej rundzie', () => {
    for (let i = 1; i <= 3; i++) {
      stats.get(`p${i}`, `Player${i}`);
    }
    const result = arena.runTournament(['p1', 'p2', 'p3']);
    // Runda 1: 1 match (z 2 graczy) + 1 bye = 2 alive po rundzie. Runda 2: 1 match.
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].matchups).toHaveLength(1);
    expect(result.rounds[1].matchups).toHaveLength(1);
  });

  test('8 graczy → 3 rundy (4 → 2 → 1)', () => {
    for (let i = 1; i <= 8; i++) {
      const p = stats.get(`p${i}`, `Player${i}`);
      p.skills.combat.level = 10;
    }
    const result = arena.runTournament(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds[0].matchups).toHaveLength(4);
    expect(result.rounds[1].matchups).toHaveLength(2);
    expect(result.rounds[2].matchups).toHaveLength(1);
  });

  test('zwycięzca i runner-up to zawsze finałowi gracze', () => {
    for (let i = 1; i <= 4; i++) {
      stats.get(`p${i}`, `Player${i}`);
    }
    const result = arena.runTournament(['p1', 'p2', 'p3', 'p4']);
    const finalMatch = result.rounds[result.rounds.length - 1].matchups[0];
    expect([finalMatch.a, finalMatch.b]).toContain(result.winnerId);
    expect([finalMatch.a, finalMatch.b]).toContain(result.runnerUpId);
  });
});
