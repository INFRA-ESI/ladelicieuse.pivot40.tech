import { Router, Request, Response } from 'express';
import Ingredient from '../models/Ingredient.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';

const router = Router();

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parsePage    = (v: string) => Math.max(1, parseInt(v) || 1);
const parseLimit   = (v: string, max = 200) => Math.min(max, Math.max(1, parseInt(v) || 100));

// ── GET /api/ingredients/public — Sans auth, ingrédients actifs en stock ──────
router.get('/public', async (req: Request, res: Response): Promise<void> => {
  try {
    const { categorie } = req.query as Record<string, string>;
    // $ne et non $in : les ingrédients créés avant l'ajout du champ `usage` n'en ont pas et restent des salades.
    const filter: Record<string, unknown> = { actif: true, stock: { $gt: 0 }, usage: { $ne: 'repas' } };
    if (categorie) filter.categorie = { $regex: escapeRegex(categorie.slice(0, 50)), $options: 'i' };
    const ingredients = await Ingredient.find(filter).sort({ categorie: 1, nom: 1 }).lean({ virtuals: true });
    res.json({ success: true, data: ingredients });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── GET /api/ingredients ──────────────────────────────────────────────────────
router.get('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, categorie, stockLevel, actif, page = '1', limit = '100' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};

    if (actif !== undefined) filter.actif = actif === 'true';
    if (categorie) filter.categorie = { $regex: escapeRegex(categorie.slice(0, 50)), $options: 'i' };
    if (search) {
      const safe = escapeRegex(search.slice(0, 100));
      filter.$or = [
        { nom:      { $regex: safe, $options: 'i' } },
        { categorie:{ $regex: safe, $options: 'i' } },
      ];
    }

    const pageNum  = parsePage(page);
    const limitNum = parseLimit(limit);
    const skip  = (pageNum - 1) * limitNum;
    const total = await Ingredient.countDocuments(filter);
    const query = Ingredient.find(filter).sort({ categorie: 1, nom: 1 }).skip(skip).limit(limitNum);

    let ingredients = await query.lean({ virtuals: true });

    // Filtre en mémoire sur le champ virtuel calculé, si nécessaire
    if (stockLevel && stockLevel !== 'tous') {
      ingredients = ingredients.filter(i => (i as Record<string, unknown>).stockLevel === stockLevel);
    }

    res.json({ success: true, data: ingredients, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération ingrédients', error: (error as Error).message });
  }
});

// ── GET /api/ingredients/stats ────────────────────────────────────────────────
router.get('/stats', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [total, rupture, critique] = await Promise.all([
      Ingredient.countDocuments({ actif: true }),
      Ingredient.countDocuments({ $expr: { $lte: ['$stock', 0] } }),
      Ingredient.countDocuments({ $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$stockMin'] }] } }),
    ]);
    res.json({ success: true, data: { total, rupture, critique } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur stats', error: (error as Error).message });
  }
});

// ── GET /api/ingredients/:id ──────────────────────────────────────────────────
router.get('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const ingredient = await Ingredient.findById(req.params.id).populate('fournisseurId', 'nom contact');
    if (!ingredient) { res.status(404).json({ success: false, message: 'Ingrédient introuvable' }); return; }
    res.json({ success: true, data: ingredient });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/ingredients ─────────────────────────────────────────────────────
router.post('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const ingredient = new Ingredient(req.body);
    await ingredient.save();
    await logAction(`Ingrédient "${ingredient.nom}" créé`, 'stock', 'Admin');
    res.status(201).json({ success: true, data: ingredient });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création ingrédient', error: (error as Error).message });
  }
});

// ── PATCH /api/ingredients/:id ────────────────────────────────────────────────
router.patch('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const ingredient = await Ingredient.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!ingredient) { res.status(404).json({ success: false, message: 'Ingrédient introuvable' }); return; }
    await logAction(`Ingrédient "${ingredient.nom}" modifié`, 'stock', 'Admin');
    res.json({ success: true, data: ingredient });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur modification', error: (error as Error).message });
  }
});

// ── PATCH /api/ingredients/:id/stock ─────────────────────────────────────────
router.patch('/:id/stock', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { delta, reason } = req.body as { delta: number; reason?: string };
    const ingredient = await Ingredient.findById(req.params.id);
    if (!ingredient) { res.status(404).json({ success: false, message: 'Ingrédient introuvable' }); return; }

    ingredient.stock = Math.max(0, ingredient.stock + delta);
    await ingredient.save();
    await logAction(
      `Stock "${ingredient.nom}" : ${delta > 0 ? '+' : ''}${delta} ${ingredient.unite}${reason ? ` (${reason})` : ''}`,
      'stock',
      'Admin'
    );
    res.json({ success: true, data: ingredient });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur ajustement stock', error: (error as Error).message });
  }
});

// ── DELETE /api/ingredients/:id ───────────────────────────────────────────────
router.delete('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const ingredient = await Ingredient.findByIdAndDelete(req.params.id);
    if (!ingredient) { res.status(404).json({ success: false, message: 'Ingrédient introuvable' }); return; }
    await logAction(`Ingrédient "${ingredient.nom}" supprimé`, 'stock', 'Admin');
    res.json({ success: true, message: 'Ingrédient supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur suppression', error: (error as Error).message });
  }
});

export default router;
