import { Types } from 'mongoose';
import Ingredient from '../models/Ingredient.model.js';

export interface MealNutrition {
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  fibres: number;
}

interface Line { ingredientId: string; quantite: number }

const round1 = (v: number) => Math.round(v * 10) / 10;

const isLine = (i: unknown): i is Line => {
  if (!i || typeof i !== 'object') return false;
  const { ingredientId, quantite } = i as Record<string, unknown>;
  return (typeof ingredientId === 'string' || ingredientId instanceof Types.ObjectId)
    && Types.ObjectId.isValid(String(ingredientId))
    && typeof quantite === 'number' && Number.isFinite(quantite) && quantite > 0;
};

/**
 * Nutrition d'UNE portion, calculée depuis la bibliothèque d'ingrédients
 * (valeurs de la bibliothèque exprimées pour 100 g, quantités du plat en grammes).
 * Renvoie null si aucune ligne n'est rattachée à un ingrédient connu.
 */
export async function nutritionFromIngredients(raw: unknown, portions: unknown): Promise<MealNutrition | null> {
  if (!Array.isArray(raw)) return null;
  const lines = raw
    .map(l => (l && typeof l === 'object' ? { ...(l as object), ingredientId: String((l as Record<string, unknown>).ingredientId ?? '') } : l))
    .filter(isLine);
  if (lines.length === 0) return null;

  const docs = await Ingredient.find({ _id: { $in: lines.map(l => l.ingredientId) } }).select('nutrition').lean();
  const byId = new Map(docs.map(d => [String(d._id), d.nutrition]));

  const total: MealNutrition = { calories: 0, proteines: 0, glucides: 0, lipides: 0, fibres: 0 };
  let matched = 0;
  for (const { ingredientId, quantite } of lines) {
    const n = byId.get(ingredientId);
    if (!n) continue;
    matched++;
    const f = quantite / 100;
    total.calories  += (n.calories  ?? 0) * f;
    total.proteines += (n.proteines ?? 0) * f;
    total.glucides  += (n.glucides  ?? 0) * f;
    total.lipides   += (n.lipides   ?? 0) * f;
    total.fibres    += (n.fibres    ?? 0) * f;
  }
  if (matched === 0) return null;

  const p = Math.max(1, Number(portions) || 1);
  return {
    calories:  round1(total.calories  / p),
    proteines: round1(total.proteines / p),
    glucides:  round1(total.glucides  / p),
    lipides:   round1(total.lipides   / p),
    fibres:    round1(total.fibres    / p),
  };
}
