import { Router, Request, Response } from 'express';
import DailyMenu from '../models/DailyMenu.model.js';
import Meal from '../models/Meal.model.js';
import { duplicateMenu, MenuDuplicationError } from '../services/menuDuplication.js';
import { addDays, isRealDay, todayInBoutique } from '../utils/dates.js';
import { logger } from '../config/logger.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { cache, invalidateCache } from '../middleware/cache.js';

const router = Router();

const invalidateMenu = () => invalidateCache('/api/menu');

// ── GET /api/menu — Menu du jour (public) ─────────────────────────────────────
router.get('/', cache(600), async (_req: Request, res: Response): Promise<void> => {
  try {
    // « Aujourd'hui » à l'heure de Libreville : entre minuit et 1 h, la date UTC est encore celle de la veille.
    const menu = await DailyMenu.findOne({ date: todayInBoutique(), published: true }).populate('repas');
    if (!menu) { res.json({ success: true, data: null }); return; }
    res.json({ success: true, data: menu });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération menu', error: (error as Error).message });
  }
});

// ── GET /api/menu/:date — Menu pour une date (public) ─────────────────────────
router.get('/:date', cache(600), async (req: Request, res: Response): Promise<void> => {
  try {
    // Public : seulement un menu publié. Un menu programmé mais pas encore publié ne se lit pas en devinant sa date
    // (le back-office lit les brouillons par /admin/:date).
    const menu = await DailyMenu.findOne({ date: req.params.date, published: true }).populate('repas');
    if (!menu) { res.status(404).json({ success: false, message: 'Menu introuvable' }); return; }
    res.json({ success: true, data: menu });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── GET /api/menu/admin/list — Liste tous les menus (admin) ──────────────────
router.get('/admin/list', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '30' } = req.query as Record<string, string>;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await DailyMenu.countDocuments();
    const menus = await DailyMenu.find().sort({ date: -1 }).skip(skip).limit(parseInt(limit)).populate('repas', 'nom prix image');
    res.json({ success: true, data: menus, total });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── GET /api/menu/admin/schedule — Calendrier des menus (admin) ───────────────
// Une ligne par date qui a des repas ou un menu enregistré : nombre de repas, publié ou non, date d'origine si c'est une
// copie. Sert à repérer les conflits avant de programmer un menu, et à choisir un menu à réutiliser.
router.get('/admin/schedule', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const today = todayInBoutique();
    const { from = today, to = addDays(today, 60) } = req.query as Record<string, string>;
    if (!isRealDay(from) || !isRealDay(to) || from > to) {
      res.status(400).json({ success: false, message: 'Période invalide (format AAAA-MM-JJ).' }); return;
    }
    if (to > addDays(from, 400)) { res.status(400).json({ success: false, message: 'Période trop longue (400 jours au plus).' }); return; }

    const [mealCounts, menus] = await Promise.all([
      Meal.aggregate<{ _id: string; meals: number }>([
        { $match: { date: { $gte: from, $lte: to } } },
        { $group: { _id: '$date', meals: { $sum: 1 } } },
      ]),
      DailyMenu.find({ date: { $gte: from, $lte: to } }).select('date published copiedFrom').lean(),
    ]);

    const byDate = new Map<string, { date: string; meals: number; published: boolean; copiedFrom?: string }>();
    for (const m of mealCounts) byDate.set(m._id, { date: m._id, meals: m.meals, published: false });
    for (const menu of menus) {
      const row = byDate.get(menu.date) ?? { date: menu.date, meals: 0, published: false };
      row.published = menu.published;
      if (menu.copiedFrom) row.copiedFrom = menu.copiedFrom;
      byDate.set(menu.date, row);
    }
    res.json({ success: true, data: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) });
  } catch (error) {
    logger.error('[Menu] calendrier impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur chargement du calendrier' });
  }
});

// ── GET /api/menu/admin/:date — Un menu, brouillon compris (admin, sans cache) ──
router.get('/admin/:date', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const menu = await DailyMenu.findOne({ date: req.params.date }).populate('repas');
    if (!menu) { res.status(404).json({ success: false, message: 'Menu introuvable' }); return; }
    res.json({ success: true, data: menu });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/menu/duplicate — Réutiliser le menu d'une date pour d'autres dates (admin) ──
// Copie les repas (nouvelles fiches indépendantes) : modifier une date ne modifie jamais les autres.
router.post('/duplicate', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await duplicateMenu((req.body ?? {}) as Record<string, unknown>);
    const done = result.created.length + result.replaced.length;
    if (done > 0) {
      await logAction(`Menu du ${String(req.body.source)} copié vers ${done} date(s)`, 'menu', 'Admin');
      await invalidateCache('/api/meals', '/api/menu');
    }
    res.status(done > 0 || result.skipped.length > 0 ? 200 : 500).json({ success: done > 0 || result.skipped.length > 0, data: result });
  } catch (error) {
    if (error instanceof MenuDuplicationError) { res.status(error.status).json({ success: false, message: error.message }); return; }
    logger.error('[Menu] duplication impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors de la copie du menu' });
  }
});

// ── POST /api/menu — Créer ou remplacer le menu d'une date (admin) ────────────
router.post('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, repas } = req.body as { date: string; repas: string[] };
    const menu = await DailyMenu.findOneAndUpdate(
      { date },
      { date, repas },
      { upsert: true, new: true, runValidators: true }
    );
    await logAction(`Menu du ${date} mis à jour`, 'menu', 'Admin');
    await invalidateMenu();
    res.status(201).json({ success: true, data: menu });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création menu', error: (error as Error).message });
  }
});

// ── PATCH /api/menu/:date/publish — Publier / dépublier ──────────────────────
router.patch('/:date/publish', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { published } = req.body as { published: boolean };
    const menu = await DailyMenu.findOneAndUpdate({ date: req.params.date }, { published }, { new: true });
    if (!menu) { res.status(404).json({ success: false, message: 'Menu introuvable' }); return; }
    await logAction(`Menu du ${req.params.date} ${published ? 'publié' : 'dépublié'}`, 'menu', 'Admin');
    await invalidateMenu();
    res.json({ success: true, data: menu });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur publication', error: (error as Error).message });
  }
});

// ── DELETE /api/menu/:date ────────────────────────────────────────────────────
router.delete('/:date', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const menu = await DailyMenu.findOneAndDelete({ date: req.params.date });
    if (!menu) { res.status(404).json({ success: false, message: 'Menu introuvable' }); return; }
    await logAction(`Menu du ${req.params.date} supprimé`, 'menu', 'Admin');
    await invalidateMenu();
    res.json({ success: true, message: 'Menu supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur suppression', error: (error as Error).message });
  }
});

export default router;
