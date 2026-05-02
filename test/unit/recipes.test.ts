import {
  getRecipe,
  fmtRecipe,
  listRecipes,
  RECIPES,
} from '../../src/modules/game/services/recipes.js';

describe('recipes', () => {
  test('getRecipe returns recipe by id and undefined for unknown', () => {
    expect(getRecipe('potion_small')?.id).toBe('potion_small');
    expect(getRecipe('xxx_unknown')).toBeUndefined();
  });

  test('fmtRecipe renders outputResource with quantity for potion_small', () => {
    const r = RECIPES.potion_small;
    const text = fmtRecipe(r);
    expect(text).toContain('potion_small');
    expect(text).toContain('×1');
    expect(text).toContain('Mała Mikstura');
  });

  test('fmtRecipe renders outputBaseId via ITEMS lookup for sword_iron', () => {
    const r = RECIPES.sword_iron;
    const text = fmtRecipe(r);
    expect(text).toContain('Żelazny Miecz');
  });

  test('listRecipes contains potion_small with fish_karp+wood_sosna ingredients', () => {
    const recipes = listRecipes();
    const potion = recipes.find((r) => r.id === 'potion_small');
    expect(potion).toBeDefined();
    expect(potion?.ingredients).toEqual({ fish_karp: 1, wood_sosna: 1 });
    expect(potion?.outputResource).toEqual({ itemId: 'potion_small', qty: 1 });
  });

  test('weapon recipe has outputBaseId not outputResource', () => {
    const r = RECIPES.sword_iron;
    expect(r.outputBaseId).toBe('sword_iron');
    expect(r.outputResource).toBeUndefined();
  });
});
