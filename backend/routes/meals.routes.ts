import { Router, Request, Response } from 'express';
import Meal, { slugify } from '../models/Meal.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { cache, invalidateCache } from '../middleware/cache.js';
import { nutritionFromIngredients } from '../utils/mealNutrition.js';
import { createDisplayOrder, sortOrdered, DisplayOrderError } from '../services/displayOrder.js';
import { logger } from '../config/logger.js';

const router = Router();

// Ordre d'affichage par catégorie, pour le CATALOGUE (repas sans date). Avant ce système : populaires d'abord, puis par nom.
type Sortable = { popular?: unknown; nom?: unknown };
const popularThenName = (a: Sortable, b: Sortable) =>
  (a.popular ? 0 : 1) - (b.popular ? 0 : 1) || (String(a.nom) < String(b.nom) ? -1 : String(a.nom) > String(b.nom) ? 1 : 0);
const displayOrder = createDisplayOrder({ model: Meal, groupField: 'categorie', scope: { date: null }, legacy: popularThenName });

// Le corps d'un repas est volumineux et déjà traité comme tel plus bas : on garde son typage souple d'origine.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withoutOrdering(body: Record<string, any>): Record<string, any> {
  const { ordre: _ordre, epinglee: _epinglee, ...rest } = body ?? {};
  void _ordre; void _epinglee;
  return rest;
}
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

const escapeRegex     = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Le menu du jour embarque les plats (populate) : il doit être rafraîchi en même temps.
const invalidateMeals = () => invalidateCache('/api/meals', '/api/menu');

// Nettoie le tableau de formats de vente reçu du back-office avant persistance.
// PATCH n'exécute pas les validateurs Mongoose (pas de runValidators) : on filtre donc
// nous-mêmes les entrées invalides plutôt que de faire confiance au payload client.
const MAX_FORMATS = 12;
function sanitizeFormats(raw: unknown): { label: string; prix: number; disponible: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const out: { label: string; prix: number; disponible: boolean }[] = [];
  for (const entry of raw.slice(0, MAX_FORMATS)) {
    if (!entry || typeof entry !== 'object') continue;
    const { label, prix, disponible } = entry as Record<string, unknown>;
    const cleanLabel = typeof label === 'string' ? label.trim().slice(0, 40) : '';
    const cleanPrix  = typeof prix === 'number' && Number.isFinite(prix) ? Math.max(0, prix) : NaN;
    if (!cleanLabel || Number.isNaN(cleanPrix)) continue;
    out.push({ label: cleanLabel, prix: cleanPrix, disponible: disponible !== false });
  }
  return out;
}

// Génère un slug unique pour un repas (exclut l'id courant lors des updates)
async function uniqueSlug(nom: string, excludeId?: string): Promise<string> {
  const base = slugify(nom);
  let slug = base || 'produit';
  let n = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await Meal.findOne({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).lean()) {
    n++;
    slug = `${base}-${n}`;
  }
  return slug;
}

// ── GET /api/meals — Public ───────────────────────────────────────────────────
router.get('/', cache(300), async (req: Request, res: Response): Promise<void> => {
  try {
    const { categorie, popular, search, catalog } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { disponible: true };

    if (catalog === 'true') filter.date = null;
    if (categorie) filter.categorie = { $regex: escapeRegex(categorie.slice(0, 50)), $options: 'i' };
    if (popular === 'true') filter.popular = true;
    if (search) {
      const safe = escapeRegex(search.slice(0, 100));
      filter.$or = [
        { nom:         { $regex: safe, $options: 'i' } },
        { description: { $regex: safe, $options: 'i' } },
      ];
    }

    // Le meilleur de chaque catégorie épinglé d'abord, puis l'ordre réglé par l'équipe, puis populaires et noms comme avant.
    const meals = sortOrdered(await Meal.find(filter).lean(), popularThenName);
    res.json({ success: true, data: meals });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération repas', error: (error as Error).message });
  }
});

// ── GET /api/meals/admin — Admin (toutes disponibilités, pas de cache) ─────────
router.get('/admin', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { categorie, search, disponible, date, catalog } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};

    if (disponible !== undefined) filter.disponible = disponible === 'true';
    if (categorie) filter.categorie = categorie;
    if (catalog === 'true') filter.date = null;
    else if (date) filter.date = date;
    if (search) {
      const safe = escapeRegex(search.slice(0, 100));
      filter.$or = [
        { nom:         { $regex: safe, $options: 'i' } },
        { description: { $regex: safe, $options: 'i' } },
      ];
    }

    const meals = await Meal.find(filter).sort({ categorie: 1, nom: 1 }).lean();
    res.json({ success: true, data: meals });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── GET /api/meals/order?categorie= — Ordre actuel d'UNE catégorie du catalogue (admin) ──
// Tous les repas du catalogue de la catégorie exacte, disponibles ou non : c'est la liste complète que /reorder exige.
router.get('/order', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { categorie } = req.query as { categorie?: unknown };
    if (typeof categorie !== 'string' || !categorie) { res.status(400).json({ success: false, message: 'Catégorie requise.' }); return; }
    const found = await Meal.find({ categorie, date: null }).select('nom popular disponible ordre epinglee').lean();
    res.json({ success: true, data: sortOrdered(found, popularThenName) });
  } catch (error) {
    logger.error('[Repas] lecture de l\'ordre impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors de la lecture de l\'ordre' });
  }
});

// ── GET /api/meals/product/:identifier — Public, fiche produit ───────────────
// Accepte indifféremment un slug (ex: "jus-detox-vert") ou un ObjectId MongoDB
// (ex: "664abc..."). DOIT être déclaré AVANT /:id pour éviter la collision.
router.get('/product/:identifier', cache(300), async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier } = req.params;
    const isObjectId = /^[a-f\d]{24}$/i.test(identifier);

    const meal = isObjectId
      ? await Meal.findOne({ _id: identifier,                 disponible: true }).lean()
      : await Meal.findOne({ slug: identifier.toLowerCase(),  disponible: true }).lean();

    if (!meal) {
      res.status(404).json({ success: false, message: 'Produit introuvable' });
      return;
    }
    res.json({ success: true, data: meal });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── GET /api/meals/:id ────────────────────────────────────────────────────────
router.get('/:id', cache(300), async (req: Request, res: Response): Promise<void> => {
  try {
    const meal = await Meal.findById(req.params.id).populate('ingredients.ingredientId', 'nom unite');
    if (!meal) { res.status(404).json({ success: false, message: 'Repas introuvable' }); return; }
    res.json({ success: true, data: meal });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/meals ───────────────────────────────────────────────────────────
router.post('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = withoutOrdering(req.body);
    if (body.nom) body.slug = await uniqueSlug(String(body.nom));
    if (body.formats !== undefined) body.formats = sanitizeFormats(body.formats);
    // Catalogue : ajouté en fin de catégorie, il ne déplace jamais les autres ni le meilleur épinglé.
    if (!body.date && typeof body.categorie === 'string' && body.categorie) body.ordre = await displayOrder.nextPosition(body.categorie);
    // Calories et macros déduites des ingrédients, sauf valeurs saisies à la main (calories > 0).
    if (!(Number(body.nutrition?.calories) > 0)) {
      const computed = await nutritionFromIngredients(body.ingredients, body.portions);
      if (computed) body.nutrition = { ...body.nutrition, ...computed };
    }
    const meal = new Meal(body);
    await meal.save();
    await logAction(`Repas "${meal.nom}" créé`, 'menu', 'Admin');
    await invalidateMeals();
    res.status(201).json({ success: true, data: meal });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création repas', error: (error as Error).message });
  }
});

// ── PATCH /api/meals/reorder — Nouvel ordre d'une catégorie du catalogue (admin) ──
router.patch('/reorder', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { categorie, ids } = (req.body ?? {}) as { categorie?: unknown; ids?: unknown };
    if (typeof categorie !== 'string' || !categorie) { res.status(400).json({ success: false, message: 'Catégorie requise.' }); return; }
    if (!Array.isArray(ids) || !ids.every(isId)) { res.status(400).json({ success: false, message: "Liste d'identifiants invalide." }); return; }
    await displayOrder.reorder(categorie, ids as string[]);
    await logAction(`Ordre du catalogue « ${categorie} » modifié`, 'menu', 'Admin');
    await invalidateMeals();
    res.json({ success: true });
  } catch (error) {
    if (error instanceof DisplayOrderError) { res.status(error.status).json({ success: false, message: error.message }); return; }
    logger.error('[Catalogue] réordonnancement impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors du réordonnancement' });
  }
});

// ── PATCH /api/meals/:id/pin — Épingler le meilleur de sa catégorie (catalogue, admin) ──
router.patch('/:id/pin', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { epinglee } = (req.body ?? {}) as { epinglee?: unknown };
    if (typeof epinglee !== 'boolean') { res.status(400).json({ success: false, message: 'epinglee doit être vrai ou faux.' }); return; }
    if (!isId(req.params.id)) { res.status(404).json({ success: false, message: 'Repas introuvable' }); return; }
    const meal = await displayOrder.setPinned(req.params.id, epinglee);
    await logAction(`Repas "${String(meal.nom)}" ${epinglee ? 'épinglé en première position' : 'désépinglé'}`, 'menu', 'Admin');
    await invalidateMeals();
    res.json({ success: true, data: meal });
  } catch (error) {
    if (error instanceof DisplayOrderError) { res.status(error.status).json({ success: false, message: error.message }); return; }
    logger.error('[Catalogue] épinglage impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: "Erreur lors de l'épinglage" });
  }
});

// ── PATCH /api/meals/:id ──────────────────────────────────────────────────────
router.patch('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = withoutOrdering(req.body);
    // Catalogue : changer de catégorie = rejoindre la fin de l'autre, sans reprendre l'épingle. Un repas daté n'a ni position ni épingle.
    if (typeof body.categorie === 'string' && body.categorie) {
      const current = await Meal.findById(req.params.id).select('categorie date').lean();
      if (current && !current.date && !body.date && current.categorie !== body.categorie) {
        body.ordre = await displayOrder.nextPosition(body.categorie);
        body.epinglee = false;
      }
    }
    if (body.date) { body.ordre = undefined; body.epinglee = false; }
    // Régénère le slug si le nom change
    if (body.nom) body.slug = await uniqueSlug(String(body.nom), req.params.id);
    if (body.formats !== undefined) body.formats = sanitizeFormats(body.formats);
    if (Array.isArray(body.ingredients) && !(Number(body.nutrition?.calories) > 0)) {
      const portions = body.portions ?? (await Meal.findById(req.params.id).select('portions').lean())?.portions;
      const computed = await nutritionFromIngredients(body.ingredients, portions);
      if (computed) {
        if (body.nutrition && typeof body.nutrition === 'object') body.nutrition = { ...body.nutrition, ...computed };
        // Clés pointées : ne pas écraser sucres/sodium, que ce payload ne contient pas.
        else for (const [k, v] of Object.entries(computed)) body[`nutrition.${k}`] = v;
      }
    }
    const meal = await Meal.findByIdAndUpdate(req.params.id, { $set: body }, { new: true });
    if (!meal) { res.status(404).json({ success: false, message: 'Repas introuvable' }); return; }
    await logAction(`Repas "${meal.nom}" modifié`, 'menu', 'Admin');
    await invalidateMeals();
    res.json({ success: true, data: meal });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur modification', error: (error as Error).message });
  }
});

// ── DELETE /api/meals/:id ─────────────────────────────────────────────────────
router.delete('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const meal = await Meal.findByIdAndDelete(req.params.id);
    if (!meal) { res.status(404).json({ success: false, message: 'Repas introuvable' }); return; }
    await logAction(`Repas "${meal.nom}" supprimé`, 'menu', 'Admin');
    await invalidateMeals();
    res.json({ success: true, message: 'Repas supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur suppression', error: (error as Error).message });
  }
});

export default router;
