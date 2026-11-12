import { Router, Request, Response } from 'express';
import Ingredient from '../models/Ingredient.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { createDisplayOrder, sortOrdered, sortWithinGroups, DisplayOrderError } from '../services/displayOrder.js';
import { logger } from '../config/logger.js';

const router = Router();

// Ordre d'affichage par catégorie. Avant ce système, les ingrédients d'une catégorie s'affichaient par nom.
const byName = (a: { nom?: unknown }, b: { nom?: unknown }) => (String(a.nom) < String(b.nom) ? -1 : String(a.nom) > String(b.nom) ? 1 : 0);
const displayOrder = createDisplayOrder({ model: Ingredient, groupField: 'categorie', legacy: byName });

// La position et l'épingle ne se règlent que par leurs routes dédiées : jamais par le corps d'une création ou d'une modification.
function withoutOrdering(body: Record<string, unknown>): Record<string, unknown> {
  const { ordre: _ordre, epinglee: _epinglee, ...rest } = body ?? {};
  void _ordre; void _epinglee;
  return rest;
}
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

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
    const found = await Ingredient.find(filter).sort({ categorie: 1, nom: 1 }).lean({ virtuals: true });
    // Dans chaque catégorie : le meilleur épinglé d'abord, puis l'ordre réglé par l'équipe, puis l'ordre alphabétique d'avant.
    const ingredients = sortWithinGroups(found, i => i.categorie, byName);
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

// ── GET /api/ingredients/order?categorie= — Ordre actuel d'UNE catégorie (admin) ──
// Tous les ingrédients de la catégorie exacte, actifs ou non : c'est la liste complète que /reorder exige.
router.get('/order', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { categorie } = req.query as { categorie?: unknown };
    if (typeof categorie !== 'string' || !categorie) { res.status(400).json({ success: false, message: 'Catégorie requise.' }); return; }
    const found = await Ingredient.find({ categorie }).select('nom actif ordre epinglee').lean();
    res.json({ success: true, data: sortOrdered(found, byName) });
  } catch (error) {
    logger.error('[Ingrédients] lecture de l\'ordre impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors de la lecture de l\'ordre' });
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
    const body = withoutOrdering(req.body);
    // Ajouté en fin de catégorie : un nouvel ingrédient ne déplace jamais les autres, ni le meilleur épinglé.
    const ordre = typeof body.categorie === 'string' && body.categorie ? await displayOrder.nextPosition(body.categorie) : undefined;
    const ingredient = new Ingredient({ ...body, ...(ordre !== undefined ? { ordre } : {}) });
    await ingredient.save();
    await logAction(`Ingrédient "${ingredient.nom}" créé`, 'stock', 'Admin');
    res.status(201).json({ success: true, data: ingredient });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création ingrédient', error: (error as Error).message });
  }
});

// ── PATCH /api/ingredients/reorder — Nouvel ordre d'une catégorie (admin) ─────
router.patch('/reorder', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { categorie, ids } = (req.body ?? {}) as { categorie?: unknown; ids?: unknown };
    if (typeof categorie !== 'string' || !categorie) { res.status(400).json({ success: false, message: 'Catégorie requise.' }); return; }
    if (!Array.isArray(ids) || !ids.every(isId)) { res.status(400).json({ success: false, message: "Liste d'identifiants invalide." }); return; }
    await displayOrder.reorder(categorie, ids as string[]);
    await logAction(`Ordre des ingrédients « ${categorie} » modifié`, 'stock', 'Admin');
    res.json({ success: true });
  } catch (error) {
    if (error instanceof DisplayOrderError) { res.status(error.status).json({ success: false, message: error.message }); return; }
    logger.error('[Ingrédients] réordonnancement impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors du réordonnancement' });
  }
});

// ── PATCH /api/ingredients/:id/pin — Épingler le meilleur de sa catégorie (admin) ──
router.patch('/:id/pin', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { epinglee } = (req.body ?? {}) as { epinglee?: unknown };
    if (typeof epinglee !== 'boolean') { res.status(400).json({ success: false, message: 'epinglee doit être vrai ou faux.' }); return; }
    if (!isId(req.params.id)) { res.status(404).json({ success: false, message: 'Ingrédient introuvable' }); return; }
    const ingredient = await displayOrder.setPinned(req.params.id, epinglee);
    await logAction(`Ingrédient "${String(ingredient.nom)}" ${epinglee ? 'épinglé en première position' : 'désépinglé'}`, 'stock', 'Admin');
    res.json({ success: true, data: ingredient });
  } catch (error) {
    if (error instanceof DisplayOrderError) { res.status(error.status).json({ success: false, message: error.message }); return; }
    logger.error('[Ingrédients] épinglage impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: "Erreur lors de l'épinglage" });
  }
});

// ── PATCH /api/ingredients/:id ────────────────────────────────────────────────
router.patch('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = withoutOrdering(req.body);
    // Changer de catégorie = rejoindre la fin de l'autre catégorie, sans reprendre l'épingle de l'ancienne.
    let update: Record<string, unknown> = body;
    if (typeof body.categorie === 'string' && body.categorie) {
      const current = await Ingredient.findById(req.params.id).select('categorie').lean();
      if (current && current.categorie !== body.categorie) {
        update = { ...body, ordre: await displayOrder.nextPosition(body.categorie), epinglee: false };
      }
    }
    const ingredient = await Ingredient.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
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
