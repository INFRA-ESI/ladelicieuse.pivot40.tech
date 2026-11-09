import Plan from '../models/Plan.model.js';
import Consultation from '../models/Consultation.model.js';
import Order from '../models/Order.model.js';
import Meal from '../models/Meal.model.js';
import { nutritionFromIngredients } from '../utils/mealNutrition.js';
import { invalidateCache } from '../middleware/cache.js';
import { logger } from '../config/logger.js';

// Migrations de données lancées au démarrage du serveur. Toutes sont idempotentes :
// relancées, elles ne modifient plus rien.

// ── Offre annuelle remplacée par hebdomadaire/mensuel ─────────────────────────
// Les plans existants n'ont pas de prixHebdo : on le déduit du mensuel en gardant l'ancienne
// remise de 20 % (mensuel = 4 semaines × hebdo × 0,8). Le prix reste modifiable dans l'admin.
export async function migratePlansToWeekly(): Promise<void> {
  const res = await Plan.updateMany(
    { prixHebdo: { $exists: false } },
    [{ $set: { prixHebdo: { $round: [{ $multiply: ['$prixMensuel', 0.3125] }, -2] } } }],
  );
  if (res.modifiedCount > 0) logger.info(`[Migration] prixHebdo initialisé sur ${res.modifiedCount} plan(s).`);
}

// ── Tarif présentiel (25 000 FCFA) distinct de la téléconsultation ────────────
// `prix` reste le tarif de la téléconsultation ; les consultations existantes reçoivent le tarif présentiel.
export async function migrateConsultationsPresentielPrice(): Promise<void> {
  const res = await Consultation.updateMany({ prixPresentiel: { $exists: false } }, { $set: { prixPresentiel: 25000 } });
  if (res.modifiedCount > 0) logger.info(`[Migration] prixPresentiel initialisé sur ${res.modifiedCount} consultation(s).`);
}

// ── Plats enregistrés sans calories ───────────────────────────────────────────
// Avant ce correctif, l'admin n'envoyait pas la nutrition : tous ces plats affichaient « 0 cal ».
export async function backfillMealNutrition(): Promise<void> {
  const meals = await Meal.find({
    $or: [{ 'nutrition.calories': 0 }, { 'nutrition.calories': { $exists: false } }],
    'ingredients.ingredientId': { $ne: null },
  }).select('ingredients portions').lean(); // objets simples : un sous-document Mongoose perd ses champs à la copie
  let fixed = 0;
  for (const meal of meals) {
    const computed = await nutritionFromIngredients(meal.ingredients, meal.portions);
    if (!computed || computed.calories <= 0) continue;
    await Meal.updateOne({ _id: meal._id }, { $set: Object.fromEntries(Object.entries(computed).map(([k, v]) => [`nutrition.${k}`, v])) });
    fixed++;
  }
  if (fixed > 0) {
    await invalidateCache('/api/meals', '/api/menu');
    logger.info(`[Migration] nutrition recalculée sur ${fixed} plat(s).`);
  }
}

// ── Numéros de commande : CMD-0001 devient LDD-0001 ───────────────────────────
// Seul le préfixe change, le compteur continue : aucun doublon possible. Les reçus déjà envoyés aux clients
// gardent l'ancien numéro imprimé, mais la commande se retrouve désormais sous le nouveau.
export async function migrateOrderNumbersToLdd(): Promise<void> {
  const res = await Order.updateMany(
    { numero: /^CMD-/ },
    [{ $set: { numero: { $concat: ['LDD-', { $substrCP: ['$numero', 4, { $strLenCP: '$numero' }] }] } } }],
  );
  if (res.modifiedCount > 0) logger.info(`[Migration] ${res.modifiedCount} numéro(s) de commande renommé(s) en LDD-.`);
}
