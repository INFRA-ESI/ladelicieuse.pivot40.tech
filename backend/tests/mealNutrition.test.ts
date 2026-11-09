import { beforeEach, describe, expect, it, vi } from 'vitest';

// Bibliothèque d'ingrédients simulée : valeurs pour 100 g.
const ids = { riz: 'a'.repeat(24), poulet: 'b'.repeat(24), inconnu: 'c'.repeat(24) };
const library = [
  { _id: ids.riz,    nutrition: { calories: 130, proteines: 2.7, glucides: 28, lipides: 0.3, fibres: 0.4 } },
  { _id: ids.poulet, nutrition: { calories: 165, proteines: 31,  glucides: 0,  lipides: 3.6, fibres: 0 } },
];

vi.mock('../models/Ingredient.model.js', () => ({
  default: {
    find: ({ _id }: { _id: { $in: string[] } }) => ({
      select: () => ({ lean: async () => library.filter(i => _id.$in.includes(String(i._id))) }),
    }),
  },
}));

const { nutritionFromIngredients } = await import('../utils/mealNutrition.js');

describe('nutritionFromIngredients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calcule les calories pour une portion à partir des grammes (valeurs pour 100 g)', async () => {
    const n = await nutritionFromIngredients(
      [{ ingredientId: ids.riz, quantite: 200 }, { ingredientId: ids.poulet, quantite: 100 }], 1);
    expect(n?.calories).toBe(425); // 130×2 + 165
  });

  it('divise par le nombre de portions', async () => {
    const n = await nutritionFromIngredients([{ ingredientId: ids.riz, quantite: 200 }], 2);
    expect(n?.calories).toBe(130);
  });

  it('traite un nombre de portions absent ou invalide comme une portion', async () => {
    const n = await nutritionFromIngredients([{ ingredientId: ids.riz, quantite: 100 }], undefined);
    expect(n?.calories).toBe(130);
  });

  it('ignore les lignes sans ingrédient connu', async () => {
    const n = await nutritionFromIngredients(
      [{ ingredientId: ids.riz, quantite: 100 }, { ingredientId: ids.inconnu, quantite: 100 }], 1);
    expect(n?.calories).toBe(130);
  });

  it("renvoie null quand rien n'est rattaché à la bibliothèque", async () => {
    expect(await nutritionFromIngredients([{ ingredientId: ids.inconnu, quantite: 100 }], 1)).toBeNull();
    expect(await nutritionFromIngredients([{ nom: 'Persil libre', quantite: 5 }], 1)).toBeNull();
    expect(await nutritionFromIngredients('pas un tableau', 1)).toBeNull();
  });

  it('ignore les quantités nulles, négatives ou non numériques', async () => {
    expect(await nutritionFromIngredients(
      [{ ingredientId: ids.riz, quantite: 0 }, { ingredientId: ids.poulet, quantite: -50 }, { ingredientId: ids.riz, quantite: 'beaucoup' }], 1)).toBeNull();
  });
});
