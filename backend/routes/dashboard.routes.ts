import { Router, Request, Response } from 'express';
import Order from '../models/Order.model.js';
import User from '../models/User.model.js';
import Ingredient from '../models/Ingredient.model.js';
import Invoice from '../models/Invoice.model.js';
import Subscription from '../models/Subscription.model.js';
import Testimonial from '../models/Testimonial.model.js';
import { verifyJWT } from './auth.routes.js';
import { cache } from '../middleware/cache.js';

// Le Gabon est en UTC+1 toute l'année (pas d'heure d'été) : les jours de vente se comptent à cette heure-là.
const BOUTIQUE_TIMEZONE = 'Africa/Libreville';
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Début (UTC) du jour civil de Libreville pour « AAAA-MM-JJ » ; null si la date n'existe pas (ex. 30 février).
function startOfBoutiqueDay(date: unknown): Date | null {
  if (typeof date !== 'string' || !DAY_PATTERN.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return new Date(`${date}T00:00:00+01:00`);
}

const router = Router();

// ── GET /api/dashboard/stats — KPIs globaux (cache 2 min) ────────────────────
router.get('/stats', verifyJWT, cache(120), async (_req: Request, res: Response): Promise<void> => {
  try {
    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);

    const [
      ordersToday,
      revenueToday,
      revenueMonth,
      totalUsers,
      activeSubscriptions,
      stockAlerts,
      ordersByStatus,
      avgRating,
    ] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: today }, statut: { $nin: ['annulee', 'remboursee'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Invoice.aggregate([
        { $match: { createdAt: { $gte: thisMonth }, statut: 'payee' } },
        { $group: { _id: null, total: { $sum: '$totalTTC' } } },
      ]),
      User.countDocuments({ statut: 'actif' }),
      Subscription.countDocuments({ statut: 'active' }),
      Ingredient.countDocuments({ actif: true, $expr: { $lte: ['$stock', '$stockMin'] } }),
      Order.aggregate([{ $group: { _id: '$statut', count: { $sum: 1 } } }]),
      Testimonial.aggregate([
        { $match: { actif: true } },
        { $group: { _id: null, moy: { $avg: '$note' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        commandesAujourdhui: ordersToday,
        revenueAujourdhui:   revenueToday[0]?.total ?? 0,
        revenueMensuel:      revenueMonth[0]?.total ?? 0,
        utilisateursActifs:  totalUsers,
        abonnementsActifs:   activeSubscriptions,
        alertesStock:        stockAlerts,
        commandesParStatut:  Object.fromEntries(ordersByStatus.map(o => [o._id, o.count])),
        noteMoyenne:         avgRating[0]?.moy ?? 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur stats dashboard', error: (error as Error).message });
  }
});

// ── GET /api/dashboard/revenue — Revenus 30 derniers jours (cache 5 min) ──────
router.get('/revenue', verifyJWT, cache(300), async (_req: Request, res: Response): Promise<void> => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const daily = await Invoice.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, statut: 'payee' } },
      {
        $group: {
          // Jour civil de Libreville (UTC+1) : une facture émise à 00h30 locale appartient au nouveau jour.
          _id:      { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: BOUTIQUE_TIMEZONE } },
          revenu:   { $sum: '$totalTTC' },
          factures: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ success: true, data: daily });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur revenus', error: (error as Error).message });
  }
});

// ── GET /api/dashboard/top-meals — Top repas commandés (cache 5 min) ──────────
// Sans paramètre : toutes les commandes. Avec ?date=AAAA-MM-JJ : uniquement celles du jour civil de Libreville
// (rapport journalier), commandes annulées ou remboursées exclues.
router.get('/top-meals', verifyJWT, cache(300), async (req: Request, res: Response): Promise<void> => {
  try {
    const { date } = req.query;
    const match: Record<string, unknown> = {};
    if (date !== undefined) {
      const start = startOfBoutiqueDay(date);
      if (!start) {
        res.status(400).json({ success: false, message: 'date invalide (format AAAA-MM-JJ attendu)' });
        return;
      }
      match.createdAt = { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
      match.statut = { $nin: ['annulee', 'remboursee'] };
    }

    const top = await Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id:    '$items.nom',
          total:  { $sum: '$items.quantite' },
          revenu: { $sum: { $multiply: ['$items.quantite', '$items.prixUnit'] } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]);

    res.json({ success: true, data: top });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur top repas', error: (error as Error).message });
  }
});

export default router;
