import { Router, Response } from 'express';
import { requireClient, ClientRequest } from '../middleware/clientAuth.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import ProgressEntry from '../models/ProgressEntry.model.js';
import { Types } from 'mongoose';

const router = Router();

// Toutes les routes de suivi exigent le JWT client
router.use(requireClient);
router.use(memoryRateLimiter(120, 60, 'tracking', { perUser: true }));

// ── GET /api/tracking — Entrées de progrès (30 derniers jours par défaut) ─────
router.get('/', async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(req.clientId);
    const days   = Math.min(parseInt(String(req.query.days ?? '30'), 10), 365);
    const from   = new Date(); from.setDate(from.getDate() - days); from.setHours(0, 0, 0, 0);

    const entries = await ProgressEntry.find({ userId, date: { $gte: from } })
      .sort({ date: 1 })
      .lean();

    res.json({ success: true, data: entries });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération données.', error: (error as Error).message });
  }
});

// ── GET /api/tracking/stats — Résumé hebdomadaire ────────────────────────────
router.get('/stats', async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(req.clientId);
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); sevenDaysAgo.setHours(0, 0, 0, 0);

    const [week, latest] = await Promise.all([
      ProgressEntry.find({ userId, date: { $gte: sevenDaysAgo } }).sort({ date: 1 }).lean(),
      ProgressEntry.findOne({ userId }).sort({ date: -1 }).lean(),
    ]);

    const avg = (key: keyof typeof week[0]) => {
      const vals = week.map(e => e[key] as number | undefined).filter((v): v is number => v != null);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };

    res.json({
      success: true,
      data: {
        latest,
        weekAvg: {
          calories:  avg('calories'),
          proteines: avg('proteines'),
          glucides:  avg('glucides'),
          lipides:   avg('lipides'),
          eau:       avg('eau'),
        },
        entreesSemaine: week.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur stats.', error: (error as Error).message });
  }
});

// ── POST /api/tracking — Créer ou mettre à jour l'entrée du jour ─────────────
router.post('/', async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(req.clientId);
    const { poids, calories, proteines, glucides, lipides, eau, notes, date } = req.body as {
      poids?: number; calories?: number; proteines?: number; glucides?: number;
      lipides?: number; eau?: number; notes?: string; date?: string;
    };

    // Normalise au début de journée (UTC)
    const entryDate = date ? new Date(date) : new Date();
    entryDate.setHours(0, 0, 0, 0);

    // Validate at least one metric provided
    const hasData = [poids, calories, proteines, glucides, lipides, eau].some(v => v != null);
    if (!hasData) {
      res.status(400).json({ success: false, message: 'Au moins une mesure est requise.' });
      return;
    }

    const payload: Record<string, unknown> = { userId, date: entryDate };
    if (poids     != null) payload.poids     = poids;
    if (calories  != null) payload.calories  = calories;
    if (proteines != null) payload.proteines = proteines;
    if (glucides  != null) payload.glucides  = glucides;
    if (lipides   != null) payload.lipides   = lipides;
    if (eau       != null) payload.eau       = eau;
    if (notes     != null) payload.notes     = String(notes).slice(0, 500);

    const entry = await ProgressEntry.findOneAndUpdate(
      { userId, date: entryDate },
      { $set: payload },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur enregistrement.', error: (error as Error).message });
  }
});

// ── DELETE /api/tracking/:id — Supprimer une entrée ─────────────────────────
router.delete('/:id', async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(req.clientId);
    const entry  = await ProgressEntry.findOneAndDelete({ _id: req.params.id, userId });
    if (!entry) { res.status(404).json({ success: false, message: 'Entrée introuvable.' }); return; }
    res.json({ success: true, message: 'Entrée supprimée.' });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur suppression.', error: (error as Error).message });
  }
});

export default router;
