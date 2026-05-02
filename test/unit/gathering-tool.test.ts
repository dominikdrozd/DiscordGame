import fs from 'node:fs';
import { PlayerStatsService } from '../../src/modules/game/services/player-stats.js';
import { MineCommand } from '../../src/modules/game/commands/mine.command.js';
import { FishCommand } from '../../src/modules/game/commands/fish.command.js';
import { ChopCommand } from '../../src/modules/game/commands/chop.command.js';
import { rollItemInstance } from '../../src/modules/game/services/items.js';
import { tmpPlayerFile, mockRandom } from '../helpers/factories.js';

describe('Gathering: tool w plecaku wystarcza (bez equip)', () => {
  let file: string;
  let stats: PlayerStatsService;

  beforeEach(() => {
    file = tmpPlayerFile();
    stats = new PlayerStatsService(file);
  });

  afterEach(() => {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    jest.restoreAllMocks();
  });

  test('toolOfKind: zwraca narzędzie z plecaka mimo że nic nie equippet', () => {
    const p = stats.get('p1', 'Tester');
    const pick = rollItemInstance('pickaxe');
    if (!pick) throw new Error('failed to roll pickaxe');
    stats.addItem(p, pick);
    expect(stats.toolOfKind(p, 'pickaxe')?.uid).toBe(pick.uid);
    expect(p.equipped.tool).toBeUndefined();
  });

  test('toolOfKind: preferuje slot tool jeśli pasuje, inaczej bierze z plecaka', () => {
    const p = stats.get('p1', 'Tester');
    const pickInBag = rollItemInstance('pickaxe');
    const pickEquipped = rollItemInstance('pickaxe');
    if (!pickInBag || !pickEquipped) throw new Error('roll failed');
    stats.addItem(p, pickInBag);
    stats.addItem(p, pickEquipped);
    stats.equip(p, pickEquipped.uid);
    expect(stats.toolOfKind(p, 'pickaxe')?.uid).toBe(pickEquipped.uid);
  });

  test('toolOfKind: zwraca undefined gdy nie ma narzędzia w ogóle', () => {
    const p = stats.get('p1', 'Tester');
    expect(stats.toolOfKind(p, 'pickaxe')).toBeUndefined();
  });

  test('mine: bez kilofa odmawia, z kilofem w plecaku (nie założonym) gather działa', () => {
    const p = stats.get('p1', 'Tester');
    const mine = new MineCommand(stats);

    const noTool = mine.runGather(p);
    expect(noTool).toContain('Potrzebujesz narzędzia');
    expect(noTool).toContain('pickaxe');
    // cooldown nie ustawiony bo gather sie wcale nie zaczął
    expect(stats.remainingCooldown(p, 'mine')).toBe(0);

    const pick = rollItemInstance('pickaxe');
    if (!pick) throw new Error('roll failed');
    stats.addItem(p, pick);
    // 0 = pierwszy item w MINING_TABLE, drugie 0 = qty min
    mockRandom([0, 0]);
    const ok = mine.runGather(p);
    expect(ok).toMatch(/⛏️|XP/);
    // teraz cooldown powinien być ustawiony
    expect(stats.remainingCooldown(p, 'mine')).toBeGreaterThan(0);
  });

  test('fish: wędka w plecaku wystarczy', () => {
    const p = stats.get('p1', 'Tester');
    const rod = rollItemInstance('rod');
    if (!rod) throw new Error('roll failed');
    stats.addItem(p, rod);
    mockRandom([0, 0]);
    const result = new FishCommand(stats).runGather(p);
    expect(result).toMatch(/🎣|XP/);
  });

  test('chop: siekiera w plecaku wystarczy', () => {
    const p = stats.get('p1', 'Tester');
    const axe = rollItemInstance('axe');
    if (!axe) throw new Error('roll failed');
    stats.addItem(p, axe);
    mockRandom([0, 0]);
    const result = new ChopCommand(stats).runGather(p);
    expect(result).toMatch(/🪓|XP/);
  });

  test('mine: tylko pickaxe daje dostęp — kilof to nie wędka', () => {
    const p = stats.get('p1', 'Tester');
    const rod = rollItemInstance('rod');
    if (!rod) throw new Error('roll failed');
    stats.addItem(p, rod); // ma wędkę, ale nie kilof
    const result = new MineCommand(stats).runGather(p);
    expect(result).toContain('Potrzebujesz narzędzia');
    expect(result).toContain('pickaxe');
  });

  test('chop: gdy zalozona zla bron, ale siekiera w plecaku — i tak działa', () => {
    const p = stats.get('p1', 'Tester');
    const pick = rollItemInstance('pickaxe');
    const axe = rollItemInstance('axe');
    if (!pick || !axe) throw new Error('roll failed');
    stats.addItem(p, pick);
    stats.addItem(p, axe);
    stats.equip(p, pick.uid); // equipped pickaxe, ale chcemy chopować
    mockRandom([0, 0]);
    const result = new ChopCommand(stats).runGather(p);
    expect(result).toMatch(/🪓|XP/);
  });
});
