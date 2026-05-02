import { itemSellPrice, type ItemInstance } from '../../src/modules/game/services/items.js';

function makeItem(overrides: Partial<ItemInstance>): ItemInstance {
  return {
    uid: 'u1',
    baseId: 'sword_iron',
    rarity: 'common',
    name: 'Test',
    stats: {},
    ...overrides,
  };
}

describe('itemSellPrice', () => {
  test('common no stats → 10 (base)', () => {
    expect(itemSellPrice(makeItem({ rarity: 'common', stats: {} }))).toBe(10);
  });

  test('common +5 atk → 10 + 5*1 = 15', () => {
    expect(itemSellPrice(makeItem({ rarity: 'common', stats: { attack: 5 } }))).toBe(15);
  });

  test('uncommon +10 stats sumarycznie → 30 + 10*1.5 = 45', () => {
    expect(
      itemSellPrice(makeItem({ rarity: 'uncommon', stats: { attack: 5, hp: 5 } })),
    ).toBe(45);
  });

  test('legendary +20 stats → 500 + 20*4 = 580', () => {
    expect(
      itemSellPrice(
        makeItem({
          rarity: 'legendary',
          stats: { attack: 10, defense: 5, hp: 5 },
        }),
      ),
    ).toBe(580);
  });

  test('toolTier 2 dodaje 50% bonus', () => {
    const t1 = itemSellPrice(
      makeItem({ rarity: 'common', stats: { attack: 5 }, toolTier: 1 }),
    );
    const t2 = itemSellPrice(
      makeItem({ rarity: 'common', stats: { attack: 5 }, toolTier: 2 }),
    );
    expect(t1).toBe(15);
    expect(t2).toBe(Math.round(15 * 1.5));
  });

  test('toolTier 3 dodaje 100% bonus', () => {
    const t1 = itemSellPrice(
      makeItem({ rarity: 'common', stats: { attack: 5 }, toolTier: 1 }),
    );
    const t3 = itemSellPrice(
      makeItem({ rarity: 'common', stats: { attack: 5 }, toolTier: 3 }),
    );
    expect(t3).toBe(Math.round(t1 * 2));
  });

  test('minimum 1 zł — nawet bez statów rare/wyżej daje base', () => {
    expect(itemSellPrice(makeItem({ rarity: 'rare', stats: {} }))).toBe(80);
  });
});
