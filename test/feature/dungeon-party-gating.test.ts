import { DungeonService } from '../../src/modules/game/services/dungeon.service.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { PartyService } from '../../src/modules/game/services/party.js';
import { BattleStore } from '../../src/modules/game/engine/battle-store.js';
import { DUNGEONS } from '../../src/modules/game/engine/encounters.js';
import { mongoPlayerStats, type MongoStatsTest } from '../helpers/factories.js';

describe('DungeonService — party gating', () => {
  let testCtx: MongoStatsTest;
  let stats: PlayerStatsService;
  let party: PartyService;
  let dungeons: DungeonService;

  beforeEach(async () => {
    testCtx = await mongoPlayerStats();
    stats = testCtx.stats;
    party = new PartyService(testCtx.env.repos.party);
    await party.load();
    dungeons = new DungeonService(stats, party, new BattleStore(testCtx.env.repos.battle));
  });

  afterEach(async () => {
    await party.flush();
    await testCtx.cleanup();
  });

  test('solo gracz (bez party) nie może wejść — clear "party-only" message', () => {
    const player = stats.get('p1', 'Solo');
    const def = DUNGEONS.spizarnia_babci;
    const check = dungeons.canStart(player.id, def);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('party-only');
  });

  test('party z 1 osobą nie spełnia minPartySize=2', () => {
    const player = stats.get('p1', 'Solo');
    party.create(player.id);
    const def = DUNGEONS.spizarnia_babci;
    const check = dungeons.canStart(player.id, def);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('min. 2');
  });

  test('happy path: 2-osobowe party może wejść do baseTier 2 dungeona', () => {
    const leader = stats.get('p1', 'Leader');
    const friend = stats.get('p2', 'Friend');
    const created = party.create(leader.id);
    party.invite(created.id, leader.id, friend.id);
    party.accept(created.id, friend.id);

    const def = DUNGEONS.spizarnia_babci;
    const check = dungeons.canStart(leader.id, def);
    expect(check.ok).toBe(true);
    expect(check.party?.members).toHaveLength(2);
  });

  test('non-leader party member nie może rozpocząć dungeona', () => {
    const leader = stats.get('p1', 'Leader');
    const friend = stats.get('p2', 'Friend');
    const created = party.create(leader.id);
    party.invite(created.id, leader.id, friend.id);
    party.accept(created.id, friend.id);

    const def = DUNGEONS.spizarnia_babci;
    const check = dungeons.canStart(friend.id, def);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('lider');
  });

  test('combat lvl wymóg sprawdzany dla każdego członka party', () => {
    const leader = stats.get('p1', 'Leader');
    leader.skills.combat.level = 30;
    const noob = stats.get('p2', 'Noob');
    noob.skills.combat.level = 5;
    // debowe_korzenie: minPartySize=2, requiredLvl=16. Daje party-size pass,
    // tak żeby trafić w lvl-check.
    const created = party.create(leader.id);
    party.invite(created.id, leader.id, noob.id);
    party.accept(created.id, noob.id);

    const def = DUNGEONS.debowe_korzenie;
    const check = dungeons.canStart(leader.id, def);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('Noob');
    expect(check.reason).toContain('16');
  });

  test('endgame krypta_lichow wymaga 4-osobowego party', () => {
    const leader = stats.get('p1', 'Leader');
    leader.skills.combat.level = 50;
    const f1 = stats.get('p2', 'F1');
    f1.skills.combat.level = 50;
    const f2 = stats.get('p3', 'F2');
    f2.skills.combat.level = 50;
    const created = party.create(leader.id);
    party.invite(created.id, leader.id, f1.id);
    party.accept(created.id, f1.id);
    party.invite(created.id, leader.id, f2.id);
    party.accept(created.id, f2.id);

    const def = DUNGEONS.krypta_lichow;
    const check3 = dungeons.canStart(leader.id, def);
    expect(check3.ok).toBe(false);
    expect(check3.reason).toContain('4');

    // Doinvitujemy 4-tego.
    const f3 = stats.get('p4', 'F3');
    f3.skills.combat.level = 50;
    party.invite(created.id, leader.id, f3.id);
    party.accept(created.id, f3.id);
    const check4 = dungeons.canStart(leader.id, def);
    expect(check4.ok).toBe(true);
  });

  test('party member na expedition blokuje dungeon dla całego party', () => {
    const leader = stats.get('p1', 'Leader');
    const friend = stats.get('p2', 'Friend');
    friend.activeExpedition = {
      destination: 'slonechna_plaza',
      endsAt: Date.now() + 60_000,
      partyId: 'foo',
      channelId: 'c1',
    };
    const created = party.create(leader.id);
    party.invite(created.id, leader.id, friend.id);
    party.accept(created.id, friend.id);

    const check = dungeons.canStart(leader.id, DUNGEONS.spizarnia_babci);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('Friend');
  });
});
