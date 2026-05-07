import { Marek } from '../../src/modules/game/npcs/port-cicada/marek.npc.js';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { QuestService } from '../../src/modules/game/services/quest.service.js';
import { mongoPlayerStats, type MongoStatsTest } from '../helpers/factories.js';

/**
 * Repro: gracz ukończył first_steps, oczekiwana widoczność opcji dialogowych
 * Marka. Q2 (marek_pick_race) musi być widoczne, reszta ukryta.
 */
describe('Marek dialog progression after first_steps completed', () => {
  let testCtx: MongoStatsTest;
  let stats: PlayerStatsService;
  beforeEach(async () => {
    testCtx = await mongoPlayerStats();
    stats = testCtx.stats;
  });
  afterEach(async () => {
    await testCtx.cleanup();
  });

  test('po skończeniu first_steps Q2 (marek_pick_race) jest offerable + widoczne w intro', () => {
    const player = stats.get('p1', 'Tester');
    player.quests.completed.push('first_steps');

    const quests = new QuestService(stats);
    const marek = new Marek();
    const intro = marek.dialog.getNode('intro');
    if (!intro) throw new Error('intro missing');
    const ctx = { player, npc: marek, quests, stats };
    const visible = intro.options.filter((o) => !o.visibleIf || o.visibleIf(ctx));
    const visibleGotos = visible.map((o) => o.goto);

    // Q2 offer powinien być widoczny:
    expect(visibleGotos).toContain('q_marek_pick_race_offer');
    // Standardowe opcje:
    expect(visibleGotos).toContain('about_city');
    expect(visibleGotos).toContain('end');
    // Q3 nie powinien być widoczny (prereq Q2 nie skończony):
    expect(visibleGotos).not.toContain('q_marek_pick_class_offer');
  });

  test('świeży gracz widzi tylko Q1 offer + standardowe', () => {
    const player = stats.get('p1', 'Tester');
    const quests = new QuestService(stats);
    const marek = new Marek();
    const intro = marek.dialog.getNode('intro');
    if (!intro) throw new Error('intro missing');
    const ctx = { player, npc: marek, quests, stats };
    const visible = intro.options.filter((o) => !o.visibleIf || o.visibleIf(ctx));
    const visibleGotos = visible.map((o) => o.goto);
    expect(visibleGotos).toContain('q_first_steps_offer');
    expect(visibleGotos).not.toContain('q_marek_pick_race_offer');
  });
});
