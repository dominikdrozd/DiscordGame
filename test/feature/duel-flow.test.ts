import { resolveBattleRound } from '../../src/modules/game/engine/combat-battle.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import {
  makeBattleCombatant,
  makeBattleState,
  mockRandom,
  mongoPlayerStats,
  type MongoStatsTest,
} from '../helpers/factories.js';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('duel feature flow', () => {
  let testCtx: MongoStatsTest;
  let stats: PlayerStatsService;

  beforeEach(async () => {
    testCtx = await mongoPlayerStats();
    stats = testCtx.stats;
  });

  afterEach(async () => {
    await testCtx.cleanup();
  });

  test('1v1 duel resolves with winner gaining xp via awardWin after fatal round', () => {
    const winner = makeBattleCombatant({
      id: 'w1',
      team: 0,
      hp: 100,
      damageBonus: 999, // gwarantujemy zabicie w 1 round
    });
    const loser = makeBattleCombatant({ id: 'l1', team: 1, hp: 1 });
    const state = makeBattleState([winner, loser]);
    state.pending.set('w1', { kind: 'attack', targetId: 'l1' });
    state.pending.set('l1', { kind: 'defend' });
    // [pick attack name=0, dodge=0.99 (no dodge), dmg roll=0, crit=0.99 (no crit), block=0.99 (no block)]
    // [defend pick=0, attack pick=0, dodge=0.99 no dodge, dmg=0, crit=0.99, block=0.99]
    mockRandom([0, 0, 0.99, 0, 0.99, 0.99]);
    const res = resolveBattleRound(state);
    expect(res.finished).toBe(true);
    expect(res.winnerTeam).toBe(0);

    // Now award via PlayerStatsService (drives the actual flow)
    const award = stats.awardWin('w1', 'Winner', 'l1', 'Loser');
    expect(award.winner.wins).toBe(1);
    expect(award.loser.losses).toBe(1);
  });

  test('draw round (both at 0 hp) reports finished true with draw flag', () => {
    const a = makeBattleCombatant({ id: 'a', team: 0, hp: 0 });
    const b = makeBattleCombatant({ id: 'b', team: 1, hp: 0 });
    const state = makeBattleState([a, b]);
    const res = resolveBattleRound(state);
    expect(res.finished).toBe(true);
    expect(res.draw).toBe(true);
  });

  test('party-vs-party calls awardPartyWin and grants xp to all winners', () => {
    const award = stats.awardPartyWin(
      [
        { id: 'w1', name: 'W1' },
        { id: 'w2', name: 'W2' },
      ],
      [
        { id: 'l1', name: 'L1' },
        { id: 'l2', name: 'L2' },
      ],
    );
    expect(award.winners).toHaveLength(2);
    expect(award.losers).toHaveLength(2);
    award.winners.forEach((w) => expect(w.gainedXp).toBeGreaterThan(0));
    award.losers.forEach((l) => expect(l.gainedXp).toBe(10));
  });

  test('partial round: nobody dies → finished false', () => {
    const a = makeBattleCombatant({
      id: 'a',
      team: 0,
      hp: 100,
      damageBonus: 0,
    });
    const b = makeBattleCombatant({ id: 'b', team: 1, hp: 100, defenseBonus: 0 });
    const state = makeBattleState([a, b]);
    state.pending.set('a', { kind: 'attack', targetId: 'b' });
    state.pending.set('b', { kind: 'defend' });
    // [pick attack=0, dodge=0.99, dmg roll=0, crit=0.99, block=0.99, defend pick=0]
    // [defend pick=0, attack pick=0, dodge=0.99 no dodge, dmg=0, crit=0.99, block=0.99]
    mockRandom([0, 0, 0.99, 0, 0.99, 0.99]);
    const res = resolveBattleRound(state);
    expect(res.finished).toBe(false);
    expect(b.hp).toBeLessThan(100);
    expect(b.hp).toBeGreaterThan(0);
  });
});
