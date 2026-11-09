import { Router, Request, Response } from 'express';
import StockReappro from '../models/StockReappro.model.js';
import Ingredient from '../models/Ingredient.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';

const router = Router();

// ── GET /api/stocks/reappro ───────────────────────────────────────────────────
router.get('/reappro', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { statut, page = '1', limit = '50' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (statut && statut !== 'tous') filter.statut = statut;

    const skip   = (parseInt(page) - 1) * parseInt(limit);
    const total  = await StockReappro.countDocuments(filter);
    const reappros = await StockReappro.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));

    res.json({ success: true, data: reappros, total });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération réapprovisionnements', error: (error as Error).message });
  }
});

// ── GET /api/stocks/reappro/:id ───────────────────────────────────────────────
router.get('/reappro/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const reappro = await StockReappro.findById(req.params.id)
      .populate('articles.ingredientId', 'nom unite stock');
    if (!reappro) { res.status(404).json({ success: false, message: 'Réapprovisionnement introuvable' }); return; }
    res.json({ success: true, data: reappro });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/stocks/reappro — Créer une commande fournisseur ─────────────────
router.post('/reappro', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const reappro = new StockReappro(req.body);
    await reappro.save();
    await logAction(`Réappro #${reappro._id} créée (${reappro.fournisseur})`, 'stock', 'Admin');
    res.status(201).json({ success: true, data: reappro });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création réappro', error: (error as Error).message });
  }
});

// ── PATCH /api/stocks/reappro/:id/status ─────────────────────────────────────
router.patch('/reappro/:id/status', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { statut, articles } = req.body as { statut: string; articles?: Array<{ ingredientId: string; quantiteRecue: number }> };
    const reappro = await StockReappro.findById(req.params.id);
    if (!reappro) { res.status(404).json({ success: false, message: 'Réappro introuvable' }); return; }

    reappro.statut = statut as typeof reappro.statut;

    // À la réception, met à jour les niveaux de stock des ingrédients
    if (statut === 'recue' && articles?.length) {
      // Une seule requête pour tous les articles, et rien n'est appliqué si un identifiant est invalide
      // (avant : une requête par article, avec un réapprovisionnement à moitié appliqué en cas d'erreur).
      await Ingredient.bulkWrite(articles.map(a => ({
        updateOne: { filter: { _id: a.ingredientId }, update: { $inc: { stock: a.quantiteRecue } } },
      })));
      for (const a of articles) {
        const art = reappro.articles.find(x => x.ingredientId.toString() === a.ingredientId);
        if (art) art.quantiteRecue = a.quantiteRecue;
      }
    }

    await reappro.save();
    await logAction(`Réappro #${reappro._id} : statut → ${statut}`, 'stock', 'Admin');
    res.json({ success: true, data: reappro });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur mise à jour statut', error: (error as Error).message });
  }
});

// ── DELETE /api/stocks/reappro/:id ────────────────────────────────────────────
router.delete('/reappro/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const reappro = await StockReappro.findById(req.params.id);
    if (!reappro) { res.status(404).json({ success: false, message: 'Réappro introuvable' }); return; }
    if (!['brouillon', 'annulee'].includes(reappro.statut)) {
      res.status(400).json({ success: false, message: 'Impossible de supprimer une réappro en cours' }); return;
    }
    await reappro.deleteOne();
    await logAction(`Réappro #${reappro._id} supprimée`, 'stock', 'Admin');
    res.json({ success: true, message: 'Réappro supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur suppression', error: (error as Error).message });
  }
});

// ── GET /api/stocks/alerts — Ingrédients en rupture/critique ─────────────────
router.get('/alerts', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const ingredients = await Ingredient.find({ actif: true }).lean({ virtuals: true });
    const alerts = ingredients.filter(i => {
      const level = (i as Record<string, unknown>).stockLevel;
      return level === 'rupture' || level === 'critique';
    });
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur alertes stock', error: (error as Error).message });
  }
});

export default router;
