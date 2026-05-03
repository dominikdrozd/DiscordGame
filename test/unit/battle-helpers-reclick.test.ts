import {
  recordItemPick,
  handleSkillPick,
  handleSkillTarget,
} from '../../src/modules/game/engine/battle-helpers.js';
import { makeBattleCombatant, makeBattleState } from '../helpers/factories.js';

interface FakeBtn {
  isButton: () => boolean;
  customId: string;
  user: { id: string; username: string; globalName?: string };
  reply: jest.Mock;
  update: jest.Mock;
}

function makeBtn(userId: string, customId: string): FakeBtn {
  return {
    isButton: () => true,
    customId,
    user: { id: userId, username: 'tester', globalName: 'Tester' },
    reply: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };
}

/**
 * Regression: w 2v2 (i 1v1) gracz po wybraniu akcji widzi nadal ephemerale
 * z przyciskami item/skill/skill-target. Klik DRUGI raz na te buttony
 * trafiał w `state.pending.has(combatantId) === true` i helper zwracał
 * `false` BEZ replied/update — fallback w index.ts strzelał mylącym
 * "⚠️ Ta walka już nie istnieje". Każda taka silent-return ścieżka musi
 * teraz odpowiedzieć na interakcję, żeby fallback nie odpalał.
 */
describe('battle-helpers re-click protection (2v2 regression)', () => {
  describe('recordItemPick', () => {
    test('gdy gracz już wybrał akcję, ack-uje "Już wybrałeś" zamiast silent-return', async () => {
      const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 100 });
      const state = makeBattleState([a]);
      state.id = 'b1';
      state.pending.set('a', { kind: 'defend' });
      const btn = makeBtn('a', 'itmpick:b1:a:potion_small');
      const result = await recordItemPick(btn as never, state);
      expect(result).toBe(false);
      expect(btn.update).toHaveBeenCalled();
    });

    test('gdy interaction.user.id ≠ combatantId w customId, ack-uje', async () => {
      const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 100 });
      const state = makeBattleState([a]);
      state.id = 'b1';
      const btn = makeBtn('intruder', 'itmpick:b1:a:potion_small');
      const result = await recordItemPick(btn as never, state);
      expect(result).toBe(false);
      expect(btn.update.mock.calls.length + btn.reply.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('handleSkillPick', () => {
    test('gdy gracz już wybrał akcję, ack-uje zamiast silent-return', async () => {
      const a = makeBattleCombatant({
        id: 'a',
        team: 0,
        controller: 'human',
        hp: 100,
        skills: ['fireball'],
      });
      const state = makeBattleState([a]);
      state.id = 'b1';
      state.pending.set('a', { kind: 'attack', targetId: 'enemy:x:1' });
      const btn = makeBtn('a', 'sklpick:b1:a:fireball');
      const result = await handleSkillPick(btn as never, state);
      expect(result).toBe(false);
      expect(btn.update).toHaveBeenCalled();
    });

    test('gdy interaction.user.id ≠ combatantId, ack-uje', async () => {
      const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 100 });
      const state = makeBattleState([a]);
      state.id = 'b1';
      const btn = makeBtn('intruder', 'sklpick:b1:a:fireball');
      const result = await handleSkillPick(btn as never, state);
      expect(result).toBe(false);
      expect(btn.update.mock.calls.length + btn.reply.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('handleSkillTarget', () => {
    test('gdy gracz już wybrał akcję, ack-uje zamiast silent-return', async () => {
      const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 100 });
      const enemy = makeBattleCombatant({ id: 'enemy:x:1', team: 1, controller: 'ai', hp: 50 });
      const state = makeBattleState([a, enemy]);
      state.id = 'b1';
      state.pending.set('a', { kind: 'skill', skillId: 'fireball', targetId: 'enemy:x:1' });
      const btn = makeBtn('a', 'skltgt:b1:a:fireball:enemy:x:1');
      const result = await handleSkillTarget(btn as never, state);
      expect(result).toBe(false);
      expect(btn.update).toHaveBeenCalled();
    });

    test('gdy interaction.user.id ≠ combatantId, ack-uje', async () => {
      const a = makeBattleCombatant({ id: 'a', team: 0, controller: 'human', hp: 100 });
      const enemy = makeBattleCombatant({ id: 'enemy:x:1', team: 1, controller: 'ai', hp: 50 });
      const state = makeBattleState([a, enemy]);
      state.id = 'b1';
      const btn = makeBtn('intruder', 'skltgt:b1:a:fireball:enemy:x:1');
      const result = await handleSkillTarget(btn as never, state);
      expect(result).toBe(false);
      expect(btn.update.mock.calls.length + btn.reply.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
