import { applyItem, applyPotion, POTION_HEAL } from '../../src/modules/game/engine/combat.js';
import { buildItemPickerRow } from '../../src/modules/game/ui/battle-buttons.js';
import { makeCombatant, mockRandom } from '../helpers/factories.js';

afterEach(() => jest.restoreAllMocks());

describe('Potion merge: free uses first, then inventory', () => {
  test('applyItem(potion_small) zużywa najpierw potionsLeft', () => {
    mockRandom([0]);
    const c = makeCombatant({ hp: 50, potionsLeft: 2, consumables: { potion_small: 3 } });
    const line = applyItem(c, 'potion_small');
    expect(c.potionsLeft).toBe(1);
    expect(c.consumables?.potion_small).toBe(3);
    expect(c.hp).toBe(50 + POTION_HEAL);
    expect(line).toContain('darmowa');
  });

  test('po wyczerpaniu potionsLeft sięga do consumables', () => {
    mockRandom([0]);
    const c = makeCombatant({ hp: 50, potionsLeft: 0, consumables: { potion_small: 2 } });
    const line = applyItem(c, 'potion_small');
    expect(c.consumables?.potion_small).toBe(1);
    expect(c.hp).toBe(50 + POTION_HEAL);
    expect(line).toContain('z plecaka');
  });

  test('gdy oba puste — zwraca "flaszka pusta", brak heala', () => {
    const c = makeCombatant({ hp: 50, potionsLeft: 0, consumables: {} });
    const line = applyItem(c, 'potion_small');
    expect(line).toContain('flaszka pusta');
    expect(c.hp).toBe(50);
    expect(c.potionsLeft).toBe(0);
  });

  test('applyPotion (legacy alias) działa identycznie jak applyItem(potion_small)', () => {
    mockRandom([0, 0]);
    const c1 = makeCombatant({ hp: 50, potionsLeft: 2, consumables: {} });
    const line1 = applyPotion(c1);
    expect(c1.potionsLeft).toBe(1);
    expect(line1).toContain('darmowa');

    const c2 = makeCombatant({ hp: 50, potionsLeft: 0, consumables: { potion_small: 1 } });
    const line2 = applyItem(c2, 'potion_small');
    expect(c2.consumables?.potion_small).toBe(0);
    expect(line2).toContain('z plecaka');
  });

  test('inny consumable działa jak wcześniej (decrement, efekt nieznany)', () => {
    const c = makeCombatant({ hp: 50, consumables: { magic_dust: 3 } });
    const line = applyItem(c, 'magic_dust');
    expect(c.consumables?.magic_dust).toBe(2);
    expect(line).toContain('efekt nieznany');
  });
});

interface BtnJSON {
  custom_id: string;
  label: string;
}

function buttonsFromRow(row: { toJSON: () => unknown } | null): BtnJSON[] {
  if (!row) return [];
  const j: unknown = row.toJSON();
  if (!j || typeof j !== 'object' || !('components' in j) || !Array.isArray(j.components)) {
    return [];
  }
  const out: BtnJSON[] = [];
  for (const c of j.components) {
    if (!c || typeof c !== 'object') continue;
    if (!('custom_id' in c) || typeof c.custom_id !== 'string') continue;
    if (!('label' in c) || typeof c.label !== 'string') continue;
    out.push({ custom_id: c.custom_id, label: c.label });
  }
  return out;
}

describe('buildItemPickerRow: merged potion button', () => {
  test('łączy potionsLeft + consumables.potion_small w jeden button z totalem', () => {
    const btns = buttonsFromRow(buildItemPickerRow('b1', 'p1', { potion_small: 3 }, 2));
    const potion = btns.find((b) => b.custom_id === 'itmpick:b1:p1:potion_small');
    expect(potion).toBeDefined();
    expect(potion?.label).toMatch(/×5/);
    expect(potion?.label).toContain('2 free');
  });

  test('tylko free (brak inventory) — pokazuje free badge', () => {
    const btns = buttonsFromRow(buildItemPickerRow('b1', 'p1', {}, 2));
    expect(btns).toHaveLength(1);
    expect(btns[0]?.label).toMatch(/×2/);
    expect(btns[0]?.label).toContain('2 free');
  });

  test('tylko inventory (brak free) — pokazuje czysty count bez "free" badge', () => {
    const btns = buttonsFromRow(buildItemPickerRow('b1', 'p1', { potion_small: 5 }, 0));
    expect(btns).toHaveLength(1);
    expect(btns[0]?.label).toMatch(/×5/);
    expect(btns[0]?.label).not.toContain('free');
  });

  test('brak potek nigdzie + brak innych itemów → null', () => {
    expect(buildItemPickerRow('b1', 'p1', {}, 0)).toBeNull();
  });

  test('inne consumables wyświetla osobno obok merged potion', () => {
    const btns = buttonsFromRow(
      buildItemPickerRow('b1', 'p1', { potion_small: 1, magic_dust: 4 }, 0),
    );
    const ids = btns.map((b) => b.custom_id);
    expect(ids).toContain('itmpick:b1:p1:potion_small');
    expect(ids).toContain('itmpick:b1:p1:magic_dust');
  });
});
