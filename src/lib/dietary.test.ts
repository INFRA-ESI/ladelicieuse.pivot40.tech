import { describe, expect, it } from 'vitest';
import { dietConflicts } from './dietary';

describe('dietConflicts', () => {
  it('ne signale rien sans préférence', () => {
    expect(dietConflicts({ name: 'Poulet grillé', ingredients: ['Poulet'] }, [])).toEqual([]);
  });

  it('végétarien : refuse viande et poisson, accepte un bowl de légumes', () => {
    expect(dietConflicts({ name: 'Poulet Grillé & Riz', ingredients: ['Riz basmati', 'Poulet grillé'] }, ['vegetarien'])).toHaveLength(1);
    expect(dietConflicts({ name: 'Poisson & Quinoa', ingredients: ['Quinoa', 'Poisson grillé'] }, ['vegetarien'])).toHaveLength(1);
    expect(dietConflicts({ name: 'Bowl Végétarien', ingredients: ['Riz complet', 'Pois chiches', 'Avocat'] }, ['vegetarien'])).toEqual([]);
  });

  it('vegan : refuse aussi les œufs et le fromage, mais pas la crème de coco', () => {
    expect(dietConflicts({ name: 'Omelette', ingredients: ['Œufs', 'Herbes'] }, ['vegan'])).toHaveLength(1);
    expect(dietConflicts({ name: 'Salade', ingredients: ['Roquette', 'Feta'] }, ['vegan'])).toHaveLength(1);
    expect(dietConflicts({ name: 'Velouté tomate', ingredients: ['Tomates', 'Crème de coco'] }, ['vegan'])).toEqual([]);
  });

  it('sans gluten : lit les allergènes déclarés et la composition, ignore « sans gluten » dans un nom', () => {
    expect(dietConflicts({ name: 'Plat', ingredients: [], allergenes: ['gluten'] }, ['sans_gluten'])).toEqual(['contient du gluten']);
    expect(dietConflicts({ name: 'Salade au couscous', ingredients: ['Couscous'] }, ['sans_gluten'])).toHaveLength(1);
    expect(dietConflicts({ name: 'Pâtes sans gluten', ingredients: ['Riz'] }, ['sans_gluten'])).toEqual([]);
  });

  it('sans lactose et sans porc', () => {
    expect(dietConflicts({ name: 'Gratin', ingredients: ['Fromage'] }, ['sans_lactose'])).toHaveLength(1);
    expect(dietConflicts({ name: 'Salade', ingredients: ['Jambon'] }, ['sans_porc', 'halal'])).toEqual(['contient du porc']);
  });

  it('low-carb et riche en protéines : seulement si la valeur est connue', () => {
    expect(dietConflicts({ name: 'Bowl', glucides: 62 }, ['low_carb'])).toHaveLength(1);
    expect(dietConflicts({ name: 'Bowl', glucides: 18 }, ['low_carb'])).toEqual([]);
    expect(dietConflicts({ name: 'Bowl' }, ['low_carb', 'riche_proteines'])).toEqual([]);
    expect(dietConflicts({ name: 'Bowl', proteines: 8 }, ['riche_proteines'])).toHaveLength(1);
    expect(dietConflicts({ name: 'Bowl', proteines: 32 }, ['riche_proteines'])).toEqual([]);
  });

  it('cumule les préférences sans doublon de raison', () => {
    const reasons = dietConflicts({ name: 'Poulet', ingredients: ['Poulet', 'Thon'] }, ['vegetarien', 'vegan']);
    expect(reasons).toEqual(['contient de la viande ou du poisson']);
  });
});
