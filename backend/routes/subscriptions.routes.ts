import { Router, Request, Response } from 'express';
import Subscription from '../models/Subscription.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { notifySubscriptionCreated, notifySubscriptionUpdated } from '../services/realtime.service.js';
import { verifyJWT } from './auth.routes.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import { optionalClient, ClientRequest } from '../middleware/clientAuth.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../config/logger.js';
import { pickFields } from '../utils/pickFields.js';
import { z } from 'zod';
import Transaction from '../models/Transaction.model.js';
import { buildSubscriptionQuote, signQuote, verifyQuote, QuoteError } from '../services/quote.service.js';

const router = Router();

const QuoteRequestSchema = z.object({
  orderId: z.string().min(1).max(128),
  planId: z.string().length(24),
  billing: z.enum(['weekly', 'monthly']),
});

const STATUTS = ['active', 'paused', 'cancelled', 'en_attente'] as const;

/** Fin de la période payée : une semaine, un mois, ou un an pour les abonnements annuels historiques. */
function periodEnd(start: Date, billing: string): Date {
  const end = new Date(start);
  if (billing === 'weekly') end.setDate(end.getDate() + 7);
  else if (billing === 'annual') end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Ce que le client a le droit de voir de son abonnement (pas les références internes de paiement).
const publicView = (s: { _id: unknown; planName: string; billing: string; price: number; statut: string; startDate: Date; endDate: Date }) => ({
  _id: s._id, planName: s.planName, billing: s.billing, price: s.price, statut: s.statut, startDate: s.startDate, endDate: s.endDate,
});

// ── GET /api/subscriptions ────────────────────────────────────────────────────
router.get('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { statut, search, page = '1', limit = '50' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};

    if (statut && statut !== 'tous') filter.statut = statut;
    if (search) {
      const safe = escapeRegex(search.slice(0, 100));
      filter.$or = [
        { clientNom:       { $regex: safe, $options: 'i' } },
        { clientEmail:     { $regex: safe, $options: 'i' } },
        { clientTelephone: { $regex: safe, $options: 'i' } },
        { planName:        { $regex: safe, $options: 'i' } },
      ];
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Subscription.countDocuments(filter);
    const subs  = await Subscription.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean();

    res.json({ success: true, data: subs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération abonnements', error: (error as Error).message });
  }
});

// ── GET /api/subscriptions/stats ──────────────────────────────────────────────
router.get('/stats', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [statuts, revenue] = await Promise.all([
      Subscription.aggregate([{ $group: { _id: '$statut', count: { $sum: 1 } } }]),
      Subscription.aggregate([
        { $match: { statut: 'active' } },
        // Revenu ramené au mois : un abonnement hebdomadaire vaut 52/12 semaines par mois (avant : prix brut additionné).
        { $group: { _id: null, mrr: { $sum: { $cond: [{ $eq: ['$billing', 'weekly'] }, { $multiply: ['$price', 52 / 12] }, '$price'] } } } },
      ]),
    ]);
    res.json({
      success: true,
      data: {
        parStatut: Object.fromEntries(statuts.map(s => [s._id, s.count])),
        mrr: Math.round(revenue[0]?.mrr ?? 0),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur stats', error: (error as Error).message });
  }
});

// ── GET /api/subscriptions/:id ────────────────────────────────────────────────
router.get('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const sub = await Subscription.findById(req.params.id).lean();
    if (!sub) { res.status(404).json({ success: false, message: 'Abonnement introuvable' }); return; }
    res.json({ success: true, data: sub });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/subscriptions/quote — Devis : le prix vient du plan en base, puis il est signé ──────
// Appelé avant le paiement. Le paiement et l'enregistrement s'appuient sur ce devis, jamais sur un prix du navigateur.
router.post('/quote', memoryRateLimiter(30, 900, 'subscription-quote'), validate(QuoteRequestSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = await buildSubscriptionQuote(req.body as z.infer<typeof QuoteRequestSchema>);
    res.json({ success: true, data: { quote: signQuote(payload), total: payload.total } });
  } catch (error) {
    if (error instanceof QuoteError) { res.status(400).json({ success: false, message: error.message }); return; }
    logger.error('Erreur devis abonnement', { message: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, message: 'Impossible de vérifier cette formule pour le moment. Réessayez.' });
  }
});

// ── POST /api/subscriptions — Enregistrer un abonnement (front client) ────────────────────────────
// Plan, facturation et prix viennent du devis signé. L'abonnement n'est « actif » que si un vrai paiement en ligne
// est retrouvé ; sinon (espèces sur place, paiement introuvable) il est « en_attente » et l'équipe l'active à la main.
router.post('/', memoryRateLimiter(10, 900, 'subscription-create'), optionalClient, async (req: Request, res: Response): Promise<void> => {
  try {
    const quote = verifyQuote((req.body as { quote?: unknown }).quote);
    if (!quote || quote.kind !== 'abonnement' || !quote.abonnement) {
      res.status(400).json({ success: false, message: 'Votre abonnement doit être revalidé. Actualisez la page puis recommencez.' });
      return;
    }

    const already = await Subscription.findOne({ refPaiement: quote.orderId });
    if (already) { res.status(200).json({ success: true, data: publicView(already) }); return; }

    const client = pickFields(req.body, ['clientNom', 'clientEmail', 'clientTelephone'], 200);
    const modePaiement = ['especes', 'mobile_money', 'carte'].includes(String((req.body as { modePaiement?: unknown }).modePaiement))
      ? String((req.body as { modePaiement: string }).modePaiement) : 'especes';

    // Un paiement en ligne a été constaté ? La mise à jour du statut de la transaction se fait juste avant, mais
    // sans être attendue : on laisse quelques secondes pour qu'elle apparaisse. (Les espèces ne comptent pas :
    // leur enregistrement est public.)
    let paiementVerifie = false;
    if (modePaiement !== 'especes') {
      for (let essai = 0; essai < 4 && !paiementVerifie; essai++) {
        if (essai > 0) await new Promise(r => setTimeout(r, 600));
        paiementVerifie = !!(await Transaction.exists({
          orderId: quote.orderId, provider: { $in: ['airtel', 'moov', 'card'] }, status: 'success', amount: { $gte: quote.total },
        }));
      }
    }

    const { planId, planNom, billing } = quote.abonnement;
    const startDate = new Date();
    const endDate = periodEnd(startDate, billing);

    const sub = new Subscription({
      ...client,
      userId: (req as ClientRequest).clientId ?? undefined,
      planId, planName: planNom, billing, price: quote.total,
      statut: paiementVerifie ? 'active' : 'en_attente',
      paiementVerifie,
      refPaiement: quote.orderId,
      startDate, endDate,
    });
    try {
      await sub.save();
    } catch (saveError) {
      // Deux envois simultanés du même devis : l'index unique en laisse passer un, on renvoie l'abonnement créé.
      if ((saveError as { code?: number }).code === 11000) {
        const existing = await Subscription.findOne({ refPaiement: quote.orderId });
        if (existing) { res.status(200).json({ success: true, data: publicView(existing) }); return; }
      }
      throw saveError;
    }
    await logAction(
      `Abonnement ${planNom} (${billing === 'weekly' ? 'hebdomadaire' : 'mensuel'}) — ${sub.statut} — ${sub.clientNom}, ${sub.clientTelephone}`,
      'commande', sub.clientNom,
    );
    notifySubscriptionCreated(sub);
    res.status(201).json({ success: true, data: publicView(sub) });
  } catch (error) {
    logger.error('Erreur création abonnement', { message: error instanceof Error ? error.message : String(error) });
    res.status(400).json({ success: false, message: 'Erreur création abonnement', error: (error as Error).message });
  }
});

// ── PATCH /api/subscriptions/:id/status ──────────────────────────────────────
router.patch('/:id/status', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { statut } = req.body as { statut?: string };
    if (!statut || !STATUTS.includes(statut as (typeof STATUTS)[number])) {
      res.status(400).json({ success: false, message: 'Statut invalide' });
      return;
    }
    const sub = await Subscription.findById(req.params.id);
    if (!sub) { res.status(404).json({ success: false, message: 'Abonnement introuvable' }); return; }

    const avant = sub.statut;
    sub.statut = statut as (typeof STATUTS)[number];
    // Une demande réglée sur place démarre à son activation (réception du paiement), pas à la date de la demande.
    if (statut === 'active' && avant === 'en_attente') {
      sub.startDate = new Date();
      sub.endDate = periodEnd(sub.startDate, sub.billing);
    }
    await sub.save();
    await logAction(`Abonnement de ${sub.clientNom} : ${avant} → ${statut}`, 'commande', 'Admin');
    notifySubscriptionUpdated(sub);
    res.json({ success: true, data: sub });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur mise à jour statut', error: (error as Error).message });
  }
});

export default router;
