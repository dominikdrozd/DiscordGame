import { ButtonStyle } from 'discord.js';
import { buildShopItemRows, BUY_QTYS } from '../../src/modules/game/ui/shop-buttons.js';

interface BtnJSON {
  custom_id: string;
  label: string;
  style: number;
  disabled?: boolean;
}
interface RowJSON {
  components: BtnJSON[];
}

function rowsToJson(rows: { toJSON: () => unknown }[]): RowJSON[] {
  return rows.map((r) => {
    const j: unknown = r.toJSON();
    if (!j || typeof j !== 'object' || !('components' in j)) throw new Error();
    const comps = j.components;
    if (!Array.isArray(comps)) throw new Error();
    const out: BtnJSON[] = [];
    for (const c of comps) {
      if (!c || typeof c !== 'object') continue;
      if (!('custom_id' in c) || typeof c.custom_id !== 'string') continue;
      if (!('label' in c) || typeof c.label !== 'string') continue;
      if (!('style' in c) || typeof c.style !== 'number') continue;
      const disabled =
        'disabled' in c && typeof c.disabled === 'boolean' ? c.disabled : undefined;
      out.push({ custom_id: c.custom_id, label: c.label, style: c.style, disabled });
    }
    return { components: out };
  });
}

describe('buildShopItemRows — bulk buy 1/5/10', () => {
  test('eksponuje 3 buy buttony (×1/×5/×10), każdy z innym customId', () => {
    const rows = rowsToJson(
      buildShopItemRows({
        cityId: 'port_cykada',
        userId: 'u1',
        itemId: 'fish_karp',
        buyPrice: 8,
        haveQty: 0,
        playerGold: 1000,
        sellMode: false,
      }),
    );
    const main = rows[0];
    const buys = main.components.filter((b) => b.custom_id.startsWith('shop:buy:'));
    expect(buys).toHaveLength(BUY_QTYS.length);
    for (const qty of BUY_QTYS) {
      const found = buys.find((b) => b.custom_id.endsWith(`:${qty}`));
      expect(found).toBeDefined();
      expect(found?.label).toContain(`×${qty}`);
      expect(found?.label).toContain(`${8 * qty} zł`);
    }
  });

  test('button ×5 disabled gdy brak gold na 5 sztuk, ale ×1 wciąż klikalny', () => {
    const rows = rowsToJson(
      buildShopItemRows({
        cityId: 'port_cykada',
        userId: 'u1',
        itemId: 'fish_karp',
        buyPrice: 10,
        haveQty: 0,
        playerGold: 25, // wystarczy na ×1 (10) ale nie na ×5 (50)
        sellMode: false,
      }),
    );
    const main = rows[0];
    const x1 = main.components.find((b) => b.custom_id.endsWith(':1'));
    const x5 = main.components.find((b) => b.custom_id.endsWith(':5'));
    const x10 = main.components.find((b) => b.custom_id.endsWith(':10'));
    expect(x1?.disabled).toBe(false);
    expect(x5?.disabled).toBe(true);
    expect(x10?.disabled).toBe(true);
  });

  test('wszystkie 3 buy disabled gdy zero zł', () => {
    const rows = rowsToJson(
      buildShopItemRows({
        cityId: 'port_cykada',
        userId: 'u1',
        itemId: 'fish_karp',
        buyPrice: 8,
        haveQty: 0,
        playerGold: 0,
        sellMode: false,
      }),
    );
    const buys = rows[0].components.filter((b) => b.custom_id.startsWith('shop:buy:'));
    for (const b of buys) expect(b.disabled).toBe(true);
  });

  test('Sell button doklejany do main row gdy haveQty > 0', () => {
    const rows = rowsToJson(
      buildShopItemRows({
        cityId: 'port_cykada',
        userId: 'u1',
        itemId: 'fish_karp',
        buyPrice: 8,
        haveQty: 3,
        playerGold: 1000,
        sellMode: false,
      }),
    );
    const sell = rows[0].components.find((b) => b.custom_id.startsWith('shop:sell:'));
    expect(sell).toBeDefined();
    expect(sell?.label).toContain('[3]');
  });
});
