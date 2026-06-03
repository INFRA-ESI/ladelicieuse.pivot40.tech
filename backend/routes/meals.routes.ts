import { Router, Request, Response } from 'express';
import Meal, { slugify } from '../models/Meal.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { cache, invalidateCache } from '../middleware/cache.js';

const router = Router();

const escapeRegex     = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const invalidateMeals = () => invalidateCache('/api/meals');

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

    const meals = await Meal.find(filter).sort({ popular: -1, nom: 1 }).lean();
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

// ── GET /api/meals/product/:identifier — Public, fiche produit ───────────────
// Accepte indifféremment un slug (ex: "jus-detox-vert") ou un ObjectId MongoDB
// (ex: "664abc..."). DOIT être déclaré AVANT /:id pour éviter la collision.
router.get('/product/:identifier', cache(300), async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier } = req.params;
    const isObjectId = /^[a-f\d]{24}$/i.test(identifier);

    const baseFilter = { disponible: true, date: null };
    const meal = isObjectId
      ? await Meal.findOne({ _id: identifier,                  ...baseFilter }).lean()
      : await Meal.findOne({ slug: identifier.toLowerCase(),   ...baseFilter }).lean();

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
    const body = { ...req.body };
    if (body.nom) body.slug = await uniqueSlug(String(body.nom));
    const meal = new Meal(body);
    await meal.save();
    await logAction(`Repas "${meal.nom}" créé`, 'menu', 'Admin');
    await invalidateMeals();
    res.status(201).json({ success: true, data: meal });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création repas', error: (error as Error).message });
  }
});

// ── PATCH /api/meals/:id ──────────────────────────────────────────────────────
router.patch('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = { ...req.body };
    // Régénère le slug si le nom change
    if (body.nom) body.slug = await uniqueSlug(String(body.nom), req.params.id);
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
