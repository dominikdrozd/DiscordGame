import fs from 'node:fs';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { rollItemInstance } from '../../src/modules/game/services/items.js';
import { tmpPlayerFile } from '../helpers/factories.js';

describe('PlayerStatsService — effective stats (z ekwipunkiem)', () => {
  let file: string;
  let stats: PlayerStatsService;

  beforeEach(() => {
    file = tmpPlayerFile();
    stats = new PlayerStatsService(file);
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  });

  test('effectiveCritPercent: baza 15% + primary/attribute + ekwipunek', () => {
    const p = stats.get('p1', 'Tester');
    expect(stats.effectiveCritPercent(p)).toBe(15); // brak bonusów

    p.primary.agi = 10; // +5%
    p.attribute.crit = 3; // +3%
    expect(stats.effectiveCritPercent(p)).toBe(15 + 5 + 3);
  });

  test('effectiveDamageBonus: primary/combat + weapon + armor + tool atk', () => {
    const p = stats.get('p1', 'Tester');
    const baseDmg = stats.damageBonus(p);
    expect(stats.effectiveDamageBonus(p)).toBe(baseDmg);

    // Manually equip items with known stats
    const w = rollItemInstance('sword_iron');
    if (!w) throw new Error('roll failed');
    w.stats = { attack: 5 };
    stats.addItem(p, w);
    stats.equip(p, w.uid);

    const t = rollItemInstance('pickaxe');
    if (!t) throw new Error('roll failed');
    t.stats = { attack: 2 };
    stats.addItem(p, t);
    stats.equip(p, t.uid);

    expect(stats.effectiveDamageBonus(p)).toBe(baseDmg + 5 + 2);
  });

  test('effectiveMaxHp uwzględnia hp z weapon/armor/tool', () => {
    const p = stats.get('p1', 'Tester');
    const baseHp = stats.hpFor(p);

    const a = rollItemInstance('armor_iron');
    if (!a) throw new Error('roll failed');
    a.stats = { hp: 10, defense: 3 };
    stats.addItem(p, a);
    stats.equip(p, a.uid);

    expect(stats.effectiveMaxHp(p)).toBe(baseHp + 10);
  });

  test('effectiveDefenseBonus: primary/wit + armor.defense', () => {
    const p = stats.get('p1', 'Tester');
    p.primary.wit = 4; // base def = 4
    expect(stats.effectiveDefenseBonus(p)).toBe(4);

    const a = rollItemInstance('armor_iron');
    if (!a) throw new Error('roll failed');
    a.stats = { defense: 6 };
    stats.addItem(p, a);
    stats.equip(p, a.uid);
    expect(stats.effectiveDefenseBonus(p)).toBe(4 + 6);
  });

  test('critBonusFromEquipment łączy weapon + armor + tool crit', () => {
    const p = stats.get('p1', 'Tester');
    expect(stats.critBonusFromEquipment(p)).toBe(0);

    const w = rollItemInstance('sword_iron');
    const a = rollItemInstance('armor_iron');
    const t = rollItemInstance('pickaxe');
    if (!w || !a || !t) throw new Error('roll failed');
    w.stats = { crit: 2 };
    a.stats = { crit: 1 };
    t.stats = { crit: 3 };
    stats.addItem(p, w);
    stats.addItem(p, a);
    stats.addItem(p, t);
    stats.equip(p, w.uid);
    stats.equip(p, a.uid);
    stats.equip(p, t.uid);

    expect(stats.critBonusFromEquipment(p)).toBe(6);
    expect(stats.effectiveCritPercent(p)).toBe(15 + 6); // brak primary/attr bonus
  });

  test('BASE_CRIT_PCT to 15 (matches CRIT_CHANCE = 0.15 in combat.ts)', () => {
    expect(PlayerStatsService.BASE_CRIT_PCT).toBe(15);
  });
});
