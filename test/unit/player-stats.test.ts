import fs from 'node:fs';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { tmpPlayerFile } from '../helpers/factories.js';

describe('PlayerStatsService', () => {
  let file: string;
  let svc: PlayerStatsService;

  beforeEach(() => {
    file = tmpPlayerFile();
    svc = new PlayerStatsService(file);
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  describe('xpForNextLevel', () => {
    test('returns floor(100 * level^1.5)', () => {
      expect(svc.xpForNextLevel(1)).toBe(100);
      expect(svc.xpForNextLevel(2)).toBe(282);
      expect(svc.xpForNextLevel(4)).toBe(800);
      expect(svc.xpForNextLevel(10)).toBe(3162);
    });
  });

  describe('addXp + leveling', () => {
    test('lifts player to next level when xp threshold crossed and grants unspent point', () => {
      const p = svc.get('p1', 'Tester');
      const leveled = svc.addXp(p, 100);
      expect(leveled).toBe(true);
      expect(p.level).toBe(2);
      expect(p.xp).toBe(0);
      expect(p.unspentPoints).toBe(1);
    });

    test('does not level when xp under threshold', () => {
      const p = svc.get('p1', 'Tester');
      const leveled = svc.addXp(p, 50);
      expect(leveled).toBe(false);
      expect(p.level).toBe(1);
      expect(p.xp).toBe(50);
      expect(p.unspentPoints).toBe(0);
    });
  });

  describe('addSkillXp', () => {
    test('levels skill independently from main level', () => {
      const p = svc.get('p1', 'Tester');
      svc.addSkillXp(p, 'mining', 100);
      expect(p.skills.mining.level).toBe(2);
      expect(p.level).toBe(1);
    });

    test('skill stays at same level when xp below threshold', () => {
      const p = svc.get('p1', 'Tester');
      svc.addSkillXp(p, 'fishing', 50);
      expect(p.skills.fishing.level).toBe(1);
      expect(p.skills.fishing.xp).toBe(50);
    });
  });

  describe('awardWin', () => {
    test('grants 50+ xp to winner and 10 to loser and persists to disk', () => {
      const result = svc.awardWin('w1', 'Winner', 'l1', 'Loser');
      expect(result.winner.wins).toBe(1);
      expect(result.winner.duels).toBe(1);
      expect(result.loser.losses).toBe(1);
      expect(result.loser.duels).toBe(1);
      expect(result.loser.xp).toBe(10);
      // 50 base, equal level → 0 bonus
      expect(result.winner.skills.combat.xp).toBe(50);
      // file persisted
      expect(fs.existsSync(file)).toBe(true);
    });

    test('grants level bonus xp when loser higher level', () => {
      const winner = svc.get('w1', 'Winner');
      const loser = svc.get('l1', 'Loser');
      loser.level = 5;
      svc.awardWin('w1', 'Winner', 'l1', 'Loser');
      // 50 + (5-1)*10 = 90
      expect(winner.skills.combat.xp).toBe(90);
    });
  });

  describe('awardPartyWin', () => {
    test('distributes xp to every winner and applies losses to every loser', () => {
      const out = svc.awardPartyWin(
        [
          { id: 'w1', name: 'W1' },
          { id: 'w2', name: 'W2' },
        ],
        [
          { id: 'l1', name: 'L1' },
          { id: 'l2', name: 'L2' },
        ],
      );
      expect(out.winners).toHaveLength(2);
      expect(out.losers).toHaveLength(2);
      out.winners.forEach((w) => {
        expect(w.stats.wins).toBe(1);
        expect(w.gainedXp).toBe(50);
      });
      out.losers.forEach((l) => {
        expect(l.stats.losses).toBe(1);
        expect(l.gainedXp).toBe(10);
      });
    });
  });

  describe('hpFor / damageBonus / defenseBonus / critBonus / spellPower', () => {
    test('hpFor combines combat skill, attribute.hp, primary.str, primary.wit', () => {
      const p = svc.get('p1', 'Tester');
      p.skills.combat.level = 3;
      p.attribute.hp = 4;
      p.primary.str = 2;
      p.primary.wit = 1;
      // 100 + (3-1)*10 + 4*5 + 2*5 + 1*3 = 100 + 20 + 20 + 10 + 3 = 153
      expect(svc.hpFor(p)).toBe(153);
    });

    test('damageBonus = (combat-1)*2 + attribute.attack + primary.str', () => {
      const p = svc.get('p1', 'Tester');
      p.skills.combat.level = 5;
      p.attribute.attack = 3;
      p.primary.str = 2;
      expect(svc.damageBonus(p)).toBe(13);
    });

    test('defenseBonus = attribute.defense + primary.wit', () => {
      const p = svc.get('p1', 'Tester');
      p.attribute.defense = 4;
      p.primary.wit = 2;
      expect(svc.defenseBonus(p)).toBe(6);
    });

    test('critBonus = attribute.crit + primary.agi * 0.5', () => {
      const p = svc.get('p1', 'Tester');
      p.attribute.crit = 2;
      p.primary.agi = 4;
      expect(svc.critBonus(p)).toBe(4);
    });

    test('spellPower = primary.int * 2', () => {
      const p = svc.get('p1', 'Tester');
      p.primary.int = 5;
      expect(svc.spellPower(p)).toBe(10);
    });
  });

  describe('gold helpers', () => {
    test('addGold respects non-negative invariant', () => {
      const p = svc.get('p1', 'Tester');
      svc.addGold(p, 50);
      expect(p.gold).toBe(150);
      svc.addGold(p, -1000);
      expect(p.gold).toBe(0);
    });

    test('removeGold rejects overdraw and returns false', () => {
      const p = svc.get('p1', 'Tester');
      expect(svc.removeGold(p, 200)).toBe(false);
      expect(p.gold).toBe(100);
    });

    test('removeGold succeeds when balance sufficient', () => {
      const p = svc.get('p1', 'Tester');
      expect(svc.removeGold(p, 30)).toBe(true);
      expect(p.gold).toBe(70);
    });

    test('hasGold reports availability without mutating', () => {
      const p = svc.get('p1', 'Tester');
      expect(svc.hasGold(p, 100)).toBe(true);
      expect(svc.hasGold(p, 101)).toBe(false);
      expect(p.gold).toBe(100);
    });
  });

  describe('race / class / reset', () => {
    test('applyRace adds startingStats to primary and locks raceId', () => {
      const p = svc.get('p1', 'Tester');
      const result = svc.applyRace(p, 'krasnolud', { str: 3, agi: 0, wit: 1, int: 0 });
      expect(result.ok).toBe(true);
      expect(p.raceId).toBe('krasnolud');
      expect(p.primary.str).toBe(3);
      expect(p.primary.wit).toBe(1);
    });

    test('applyRace fails when raceId already set', () => {
      const p = svc.get('p1', 'Tester');
      svc.applyRace(p, 'krasnolud', { str: 3, agi: 0, wit: 1, int: 0 });
      const second = svc.applyRace(p, 'elf', { str: 0, agi: 2, wit: 0, int: 2 });
      expect(second.ok).toBe(false);
    });

    test('resetRace subtracts startingStats and clears raceId', () => {
      const p = svc.get('p1', 'Tester');
      svc.applyRace(p, 'krasnolud', { str: 3, agi: 0, wit: 1, int: 0 });
      svc.resetRace(p, { str: 3, agi: 0, wit: 1, int: 0 });
      expect(p.raceId).toBeUndefined();
      expect(p.primary.str).toBe(0);
      expect(p.primary.wit).toBe(0);
    });

    test('resetClass unapplies class+sub+sub2 primary deltas cleanly', () => {
      const p = svc.get('p1', 'Tester');
      svc.applyClass(p, 'wojownik', { str: 2, agi: 0, wit: 1, int: 0 });
      p.subclassId = 'berserker';
      svc.addSkillXp(p, 'combat', 100000); // get to lvl 20+
      // emulate subclass2 already chosen
      p.subclass2Id = 'krwawnik';
      // primary including imaginary sub + sub2
      p.primary.str = 2 + 3 + 4; // class + sub + sub2
      p.primary.agi = 0 + 1 + 0;
      p.primary.wit = 1 - 1 - 1;
      svc.resetClass(
        p,
        { str: 2, agi: 0, wit: 1, int: 0 },
        { str: 3, agi: 1, wit: -1, int: 0 },
        { str: 4, agi: 0, wit: -1, int: 0 },
      );
      expect(p.classId).toBeUndefined();
      expect(p.subclassId).toBeUndefined();
      expect(p.subclass2Id).toBeUndefined();
      expect(p.primary.str).toBe(0);
      expect(p.primary.agi).toBe(0);
      expect(p.primary.wit).toBe(0);
    });
  });

  describe('persistence (load/save)', () => {
    test('save+load round-trip preserves player data', () => {
      const p = svc.get('p1', 'Tester');
      p.gold = 250;
      p.level = 3;
      p.primary.str = 5;
      svc.save();

      const reloaded = new PlayerStatsService(file);
      const got = reloaded.get('p1');
      expect(got.gold).toBe(250);
      expect(got.level).toBe(3);
      expect(got.primary.str).toBe(5);
    });

    test('ensureDefaults backfills missing fields on legacy file', () => {
      fs.writeFileSync(file, JSON.stringify([{ id: 'legacy', name: 'Old' }]), 'utf8');
      const fresh = new PlayerStatsService(file);
      const p = fresh.get('legacy');
      expect(p.gold).toBe(100);
      expect(p.skills.mining.level).toBe(1);
      expect(p.activeExpedition).toBeNull();
    });
  });
});
