import { ButtonStyle } from 'discord.js';
import { listCities } from '../../src/modules/game/cities/index.js';
import { buildCityListRows, buildCityViewRows } from '../../src/modules/game/ui/city-buttons.js';
import { buildDialogOptionRows } from '../../src/modules/game/ui/dialog-buttons.js';
import { Marek } from '../../src/modules/game/npcs/port_cykada/marek.npc.js';

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
    if (!j || typeof j !== 'object' || !('components' in j)) {
      throw new Error('row toJSON missing components');
    }
    const comps = j.components;
    if (!Array.isArray(comps)) throw new Error('components not array');
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

describe('city UI buttons', () => {
  test('buildCityListRows: button per city, disabled gdy lvl niewystarczający', () => {
    const cities = listCities();
    const rows = rowsToJson(buildCityListRows(cities, 'p1', (c) => c.region === 1));
    const allBtns = rows.flatMap((r) => r.components);
    expect(allBtns).toHaveLength(cities.length);
    const portBtn = allBtns.find((b) => b.custom_id.includes('port_cykada'));
    expect(portBtn?.disabled ?? false).toBe(false);
    expect(portBtn?.label).toContain('Port Cykada');
    const cytadelaBtn = allBtns.find((b) => b.custom_id.includes('czarna_cytadela'));
    expect(cytadelaBtn?.disabled).toBe(true);
    expect(cytadelaBtn?.label).toContain('🔒');
  });

  test('buildCityListRows: customId format menu:citypick:<cityId>:<userId>', () => {
    const cities = listCities();
    const rows = rowsToJson(buildCityListRows(cities, 'user_123', () => true));
    const ids = rows.flatMap((r) => r.components).map((b) => b.custom_id);
    expect(ids).toContain('menu:citypick:port_cykada:user_123');
    expect(ids).toContain('menu:citypick:oakhaven:user_123');
    expect(ids).toContain('menu:citypick:krasnoludzka_twierdza:user_123');
    expect(ids).toContain('menu:citypick:czarna_cytadela:user_123');
  });

  test('buildCityViewRows: shop + npc + back button (Port Cykada ma marka)', () => {
    const port = listCities().find((c) => c.id === 'port_cykada');
    if (!port) throw new Error('port_cykada missing');
    const rows = rowsToJson(buildCityViewRows(port.id, port.npcs, 'p1'));
    const allBtns = rows.flatMap((r) => r.components);
    expect(allBtns.some((b) => b.custom_id === 'menu:cityshop:port_cykada:p1')).toBe(true);
    expect(allBtns.some((b) => b.custom_id === 'menu:citytalk:port_cykada:marek:p1')).toBe(true);
    expect(allBtns.some((b) => b.custom_id === 'menu:citylist:p1')).toBe(true);
    expect(allBtns.some((b) => b.custom_id === 'menu:close:p1')).toBe(true);
  });

  test('buildCityViewRows: miasto bez NPC ma tylko shop + back', () => {
    const oakhaven = listCities().find((c) => c.id === 'oakhaven');
    if (!oakhaven) throw new Error('oakhaven missing');
    const rows = rowsToJson(buildCityViewRows(oakhaven.id, oakhaven.npcs, 'p1'));
    const ids = rows.flatMap((r) => r.components).map((b) => b.custom_id);
    expect(ids.some((id) => id.startsWith('menu:citytalk:'))).toBe(false);
    expect(ids).toContain('menu:cityshop:oakhaven:p1');
    expect(ids).toContain('menu:citylist:p1');
  });

  test('buildDialogOptionRows: opcja "end" ma styl Danger, reszta Primary', () => {
    const marek = new Marek();
    const intro = marek.dialog.getNode('intro');
    if (!intro) throw new Error('intro node missing');
    const rows = rowsToJson(buildDialogOptionRows('marek', intro.options, 'p1'));
    const btns = rows.flatMap((r) => r.components);
    expect(btns).toHaveLength(intro.options.length);
    const endBtn = btns.find((b) => b.custom_id === 'dialog:goto:marek:end:p1');
    expect(endBtn?.style).toBe(ButtonStyle.Danger);
    const cityBtn = btns.find((b) => b.custom_id === 'dialog:goto:marek:about_city:p1');
    expect(cityBtn?.style).toBe(ButtonStyle.Primary);
  });
});
