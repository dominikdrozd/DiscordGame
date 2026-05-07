import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { QuestService } from '../../src/modules/game/services/quest.service.js';
import { getQuest, listQuests } from '../../src/modules/game/quests/index.js';
import { mongoPlayerStats, type MongoStatsTest } from '../helpers/factories.js';

describe('profession chains — quest registry & turn-in flow', () => {
  let testCtx: MongoStatsTest;
  let stats: PlayerStatsService;
  let quests: QuestService;

  beforeEach(async () => {
    testCtx = await mongoPlayerStats();
    stats = testCtx.stats;
    quests = new QuestService(stats);
  });
  afterEach(async () => {
    await testCtx.cleanup();
  });

  /**
   * Każdy z 3 chainów (górnik/rybak/drwal) ma 5 stage'ów.
   * Stage 1 wymaga `marek_duel`; każdy kolejny stage wymaga ukończonego
   * poprzedniego. turnInItem zawsze 5 sztuk surowca z odpowiedniego tieru.
   */
  const CHAINS: Array<{ name: string; ids: string[] }> = [
    {
      name: 'górnik',
      ids: [
        'bartek_copper',
        'bartek_silver',
        'janosz_gold',
        'grom_mithril',
        'wraul_diamond',
      ],
    },
    {
      name: 'rybak',
      ids: [
        'hela_karp',
        'hela_szczupak',
        'eryk_sum',
        'druin_marlin',
        'lowca_kraken',
      ],
    },
    {
      name: 'drwal',
      ids: [
        'olek_sosna',
        'olek_buk',
        'borut_heban',
        'thordin_smoczy',
        'straznik_swiatowe',
      ],
    },
  ];

  test('15 questów chainów istnieje w registry', () => {
    for (const chain of CHAINS) {
      for (const id of chain.ids) {
        const q = getQuest(id);
        expect(q).toBeDefined();
      }
    }
  });

  test('każdy stage 1 wymaga marek_duel jako prereq, każdy kolejny stage wymaga poprzedniego', () => {
    for (const chain of CHAINS) {
      const [stage1, stage2, stage3, stage4, stage5] = chain.ids.map((id) => {
        const q = getQuest(id);
        if (!q) throw new Error(`missing ${id}`);
        return q;
      });
      expect(stage1.prerequisiteQuestIds).toEqual(['marek_duel']);
      expect(stage2.prerequisiteQuestIds).toEqual([stage1.id]);
      expect(stage3.prerequisiteQuestIds).toEqual([stage2.id]);
      expect(stage4.prerequisiteQuestIds).toEqual([stage3.id]);
      expect(stage5.prerequisiteQuestIds).toEqual([stage4.id]);
    }
  });

  test('każdy chain quest ma turnInItem o qty=5', () => {
    for (const chain of CHAINS) {
      for (const id of chain.ids) {
        const q = getQuest(id);
        if (!q) throw new Error(`missing ${id}`);
        expect(q.turnInItem).toBeDefined();
        expect(q.turnInItem?.qty).toBe(5);
      }
    }
  });

  test('reward gold rośnie monotonicznie wraz ze stage (T1 < T2 < T3 < T4 < T5)', () => {
    for (const chain of CHAINS) {
      const golds = chain.ids.map((id) => getQuest(id)?.reward.gold ?? 0);
      for (let i = 1; i < golds.length; i++) {
        expect(golds[i]).toBeGreaterThan(golds[i - 1]);
      }
    }
  });

  test('świeży gracz nie widzi żadnego chain questa (marek_duel niedokończony)', () => {
    const player = stats.get('p1', 'Tester');
    for (const chain of CHAINS) {
      for (const id of chain.ids) {
        expect(quests.isOfferable(player, id)).toBe(false);
      }
    }
  });

  test('po ukończeniu marek_duel pierwsze stage każdego chain są offerable', () => {
    const player = stats.get('p1', 'Tester');
    player.quests.completed.push('marek_duel');
    for (const chain of CHAINS) {
      expect(quests.isOfferable(player, chain.ids[0])).toBe(true);
      // Stage 2-5 wciąż zablokowane.
      for (let i = 1; i < chain.ids.length; i++) {
        expect(quests.isOfferable(player, chain.ids[i])).toBe(false);
      }
    }
  });

  test('end-to-end (górnik chain stage 1): take → add 5 ore_copper → turnIn → stage 2 isOfferable', () => {
    const player = stats.get('p1', 'Tester');
    player.quests.completed.push('marek_duel');

    const take = quests.take(player, 'bartek_copper');
    expect(take.ok).toBe(true);
    expect(quests.isActive(player, 'bartek_copper')).toBe(true);

    // Bez surowca nie można oddać.
    expect(quests.canTurnIn(player, 'bartek_copper')).toBe(false);

    stats.addResource(player, 'ore_copper', 5);
    expect(quests.canTurnIn(player, 'bartek_copper')).toBe(true);

    const turn = quests.turnIn(player, 'bartek_copper');
    expect(turn.ok).toBe(true);
    expect(quests.isCompleted(player, 'bartek_copper')).toBe(true);
    // Surowiec zużyty.
    expect(player.inventory.resources.ore_copper ?? 0).toBe(0);
    // Stage 2 odblokowany.
    expect(quests.isOfferable(player, 'bartek_silver')).toBe(true);
  });

  test('listQuests zawiera stare 8 questów Marka + 15 nowych', () => {
    const all = listQuests();
    expect(all.length).toBeGreaterThanOrEqual(23);
    const ids = new Set(all.map((q) => q.id));
    for (const old of [
      'first_steps',
      'marek_pick_race',
      'marek_pick_class',
      'marek_pickaxe',
      'marek_axe',
      'marek_rod',
      'marek_upgrade',
      'marek_duel',
    ]) {
      expect(ids.has(old)).toBe(true);
    }
    for (const chain of CHAINS) {
      for (const id of chain.ids) {
        expect(ids.has(id)).toBe(true);
      }
    }
  });
});
