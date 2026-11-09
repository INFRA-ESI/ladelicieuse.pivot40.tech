import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { similarKey } from '../utils/similarKey.js';
import Category from '../models/Category.model.js';
import Ingredient from '../models/Ingredient.model.js';
import Meal from '../models/Meal.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { cache, invalidateCache } from '../middleware/cache.js';

const router = Router();

const invalidateCategories = () => invalidateCache('/api/categories');

// « Sauce et pain », « Sauces et Pains » : même catégorie pour un humain, deux pour l'index unique.
async function findSimilar(nom: string, excludeId?: string) {
  const key = similarKey(nom);
  const others = await Category.find(excludeId ? { _id: { $ne: excludeId } } : {}).select('nom').lean();
  return others.find(c => similarKey(c.nom) === key);
}

// ── GET /api/categories — Public (actives seulement) ─────────────────────────
router.get('/', cache(600), async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await Category.find({ active: true }).sort({ ordre: 1, nom: 1 }).lean();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération catégories', error: (error as Error).message });
  }
});

// ── GET /api/categories/all — Admin (toutes, pas de cache) ───────────────────
router.get('/all', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await Category.find().sort({ ordre: 1, nom: 1 }).lean();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/categories ──────────────────────────────────────────────────────
router.post('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    if (typeof req.body.nom === 'string') {
      const similar = await findSimilar(req.body.nom);
      if (similar) {
        res.status(409).json({ success: false, message: `Une catégorie similaire existe déjà : « ${similar.nom} ».` });
        return;
      }
    }
    const category = new Category(req.body);
    await category.save();
    await logAction(`Catégorie "${category.nom}" créée`, 'menu', 'Admin');
    await invalidateCategories();
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création catégorie', error: (error as Error).message });
  }
});

// ── PATCH /api/categories/:id ─────────────────────────────────────────────────
router.patch('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const before = await Category.findById(req.params.id).select('nom').lean();
    if (!before) { res.status(404).json({ success: false, message: 'Catégorie introuvable' }); return; }
    if (typeof req.body.nom === 'string') {
      const similar = await findSimilar(req.body.nom, req.params.id);
      if (similar) {
        res.status(409).json({ success: false, message: `Une catégorie similaire existe déjà : « ${similar.nom} ». Utilisez « Fusionner ».` });
        return;
      }
    }
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!category) { res.status(404).json({ success: false, message: 'Catégorie introuvable' }); return; }

    // Ingrédients et plats référencent la catégorie par son nom : sans cette propagation,
    // le site continue d'afficher l'ancien libellé après un renommage dans l'admin.
    if (before.nom !== category.nom) {
      await Promise.all([
        Ingredient.updateMany({ categorie: before.nom }, { $set: { categorie: category.nom } }),
        Meal.updateMany(
          { $or: [{ categorieId: category._id }, { categorie: before.nom }] },
          { $set: { categorie: category.nom } },
        ),
      ]);
      await invalidateCache('/api/meals');
    }

    await logAction(`Catégorie "${category.nom}" modifiée`, 'menu', 'Admin');
    await invalidateCategories();
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur modification', error: (error as Error).message });
  }
});

// ── POST /api/categories/:id/merge — fusionne la catégorie dans `intoId` ──────
// Ingrédients et plats de la catégorie source passent dans la cible, puis la source est supprimée.
router.post('/:id/merge', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { intoId } = req.body as { intoId?: string };
    if (!intoId || !Types.ObjectId.isValid(intoId) || intoId === req.params.id) {
      res.status(400).json({ success: false, message: 'Catégorie de destination invalide' });
      return;
    }
    const [source, target] = await Promise.all([Category.findById(req.params.id), Category.findById(intoId)]);
    if (!source || !target) { res.status(404).json({ success: false, message: 'Catégorie introuvable' }); return; }

    await Promise.all([
      Ingredient.updateMany({ categorie: source.nom }, { $set: { categorie: target.nom } }),
      Meal.updateMany(
        { $or: [{ categorieId: source._id }, { categorie: source.nom }] },
        { $set: { categorie: target.nom, categorieId: target._id } },
      ),
    ]);
    await source.deleteOne();
    await logAction(`Catégorie "${source.nom}" fusionnée dans "${target.nom}"`, 'menu', 'Admin');
    await Promise.all([invalidateCategories(), invalidateCache('/api/meals', '/api/menu')]);
    res.json({ success: true, message: `« ${source.nom} » fusionnée dans « ${target.nom} »`, data: target });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur fusion', error: (error as Error).message });
  }
});

// ── DELETE /api/categories/:id ────────────────────────────────────────────────
router.delete('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) { res.status(404).json({ success: false, message: 'Catégorie introuvable' }); return; }
    await logAction(`Catégorie "${category.nom}" supprimée`, 'menu', 'Admin');
    await invalidateCategories();
    res.json({ success: true, message: 'Catégorie supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur suppression', error: (error as Error).message });
  }
});

export default router;
