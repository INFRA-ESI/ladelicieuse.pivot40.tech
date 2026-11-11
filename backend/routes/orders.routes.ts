import { Router, Request, Response } from 'express';
import { toGabonMobile } from '../utils/gabonPhone.js';
import Order from '../models/Order.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { notifyOrderCreated, notifyOrderStatus, notifyOrderUpdated } from '../services/realtime.service.js';
import { verifyJWT } from './auth.routes.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import { optionalClient, ClientRequest } from '../middleware/clientAuth.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import Transaction from '../models/Transaction.model.js';
import { buildQuote, signQuote, verifyQuote, QuoteError, type QuotePayload, type RawLine } from '../services/quote.service.js';
import { attributerPoints } from '../services/fidelite.service.js';
import { sendStatusNotification, sendFideliteNotification } from '../services/whatsapp.service.js';
import { sendPushToUser } from '../services/push.service.js';
import { sendOrderConfirmationEmail } from '../services/email.service.js';
import { logger } from '../config/logger.js';

const router = Router();

const LineRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['repas', 'jus']), id: z.string().length(24) }),
  z.object({
    type: z.literal('salade'),
    composition: z.array(z.object({ id: z.string().length(24), quantity: z.number().int().min(1).max(20) })).min(1).max(60),
  }),
  z.object({ type: z.literal('consultation'), id: z.string().length(24), mode: z.enum(['virtuel', 'presentiel']) }),
]);

const QuoteRequestSchema = z.object({
  orderId: z.string().min(1).max(128),
  modeCommande: z.enum(['livraison', 'sur_place', 'emporter']),
  fraisLivraison: z.number().min(0).max(10_000),
  items: z.array(z.object({
    nom: z.string().min(1).max(200),
    qty: z.number().int().min(1).max(100),
    prix: z.number().min(0),
    customizations: z.array(z.string().max(120)).max(20).optional(),
    ref: LineRefSchema,
  })).min(1).max(60),
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parsePage    = (v: string) => Math.max(1, parseInt(v) || 1);
const parseLimit   = (v: string, max = 200) => Math.min(max, Math.max(1, parseInt(v) || 50));

// ── GET /api/orders — Liste paginée avec filtres ───────────────────────────────
router.get('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { statut, priorite, search, date, page = '1', limit = '50' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};

    if (statut && statut !== 'tous')   filter.statut   = statut;
    if (priorite && priorite !== 'tous') filter.priorite = priorite;
    if (date === 'today') {
      const start = new Date(); start.setHours(0,0,0,0);
      const end   = new Date(); end.setHours(23,59,59,999);
      filter.createdAt = { $gte: start, $lte: end };
    }
    if (search) {
      const safe = escapeRegex(search.slice(0, 100));
      filter.$or = [
        { 'client.nom':   { $regex: safe, $options: 'i' } },
        { 'client.email': { $regex: safe, $options: 'i' } },
        { numero:         { $regex: safe, $options: 'i' } },
      ];
    }

    const pageNum  = parsePage(page);
    const limitNum = parseLimit(limit);
    const skip  = (pageNum - 1) * limitNum;
    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean();

    res.json({ success: true, data: orders, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération commandes', error: (error as Error).message });
  }
});

// ── GET /api/orders/stats ─────────────────────────────────────────────────────
router.get('/stats', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const [totals, statuts] = await Promise.all([
      Order.aggregate([
        { $match: { createdAt: { $gte: today } } },
        { $group: { _id: null, revenu: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([{ $group: { _id: '$statut', count: { $sum: 1 } } }]),
    ]);
    res.json({
      success: true,
      data: {
        today: totals[0] ?? { revenu: 0, count: 0 },
        parStatut: Object.fromEntries(statuts.map(s => [s._id, s.count])),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur stats', error: (error as Error).message });
  }
});

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
router.get('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) { res.status(404).json({ success: false, message: 'Commande introuvable' }); return; }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// Chemin transitoire (ALLOW_UNQUOTED_ORDERS=true), à n'activer que le temps d'un déploiement :
// prix du navigateur, vérifiés seulement dans leur forme. À désactiver ensuite, sans quoi les prix ne sont pas contrôlés.
function legacyPricing(body: Record<string, unknown>): Omit<QuotePayload, 'orderId'> | string {
  const rawItems = body.items as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(rawItems) || rawItems.length === 0) return 'La commande doit contenir au moins un article.';
  for (const item of rawItems) {
    if (!item.nom || typeof item.nom !== 'string') return 'Chaque article doit avoir un nom.';
    if (!Number.isFinite(Number(item.qty)) || Number(item.qty) < 1) return 'Quantité invalide sur un article.';
    if (!Number.isFinite(Number(item.prix)) || Number(item.prix) < 0) return 'Prix invalide sur un article.';
  }
  const items = rawItems.map(i => ({
    nom:            String(i.nom).trim().slice(0, 200),
    qty:            Number(i.qty),
    prix:           Number(i.prix),
    customizations: Array.isArray(i.customizations)
      ? (i.customizations as unknown[]).map(c => String(c).trim().slice(0, 120)).slice(0, 20)
      : [],
  }));
  const sousTotal      = items.reduce((s, i) => s + i.prix * i.qty, 0);
  const fraisLivraison = Math.min(Math.max(0, Number(body.fraisLivraison) || 0), 10_000);
  const modeCommande   = (['livraison', 'sur_place', 'emporter'] as const).find(m => m === body.modeCommande) ?? 'livraison';
  return { items, sousTotal, fraisLivraison, total: sousTotal + fraisLivraison, modeCommande };
}

// ── POST /api/orders/quote — Devis : vérifie le panier contre le catalogue et le signe ─────────
// Appelé avant le paiement. Refus (400) = le panier est périmé ; rien n'a encore été payé.
router.post('/quote', memoryRateLimiter(60, 900, 'order-quote'), validate(QuoteRequestSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, items, fraisLivraison, modeCommande } = req.body as z.infer<typeof QuoteRequestSchema>;
    const payload = await buildQuote({ orderId, items: items as RawLine[], fraisLivraison, modeCommande });
    res.json({
      success: true,
      data: { quote: signQuote(payload), total: payload.total, sousTotal: payload.sousTotal, fraisLivraison: payload.fraisLivraison },
    });
  } catch (error) {
    if (error instanceof QuoteError) { res.status(400).json({ success: false, message: error.message }); return; }
    logger.error('Erreur devis commande', { message: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, message: 'Impossible de vérifier votre panier pour le moment. Réessayez.' });
  }
});

// ── POST /api/orders — Créer une commande ─────────────────────────────────────
router.post('/', memoryRateLimiter(20, 900, 'order-create'), optionalClient, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;

    // Validate client sub-object
    const client = body.client as Record<string, unknown> | undefined;
    if (!client?.nom || typeof client.nom !== 'string' || !client.nom.trim()) {
      res.status(400).json({ success: false, message: 'Nom du client requis.' }); return;
    }
    if (client.email && typeof client.email !== 'string') {
      res.status(400).json({ success: false, message: 'Email invalide.' }); return;
    }
    if (!client.telephone || typeof client.telephone !== 'string') {
      res.status(400).json({ success: false, message: 'Téléphone du client requis.' }); return;
    }
    // Le numéro sert à joindre le client (WhatsApp, livraison, Mobile Money) : il doit être un mobile gabonais valide.
    const telephone = toGabonMobile(client.telephone);
    if (!telephone) {
      res.status(400).json({ success: false, message: 'Numéro de téléphone invalide : saisissez un numéro gabonais, par exemple 077 12 34 56 ou +241 77 12 34 56.' }); return;
    }

    // Prix : ceux du devis signé par le serveur (vérifiés contre le catalogue AVANT le paiement),
    // jamais ceux du navigateur. Un devis donne une seule commande : un renvoi retourne la même.
    // Un devis d'abonnement n'est pas un devis de commande : même signature, mais il ne sert qu'aux abonnements.
    const signed = verifyQuote(body.quote);
    const quote = signed?.kind === 'abonnement' ? null : signed;
    if (quote) {
      const already = await Order.findOne({ refPaiement: quote.orderId });
      if (already) { res.status(200).json({ success: true, data: already }); return; }
    } else if (process.env.ALLOW_UNQUOTED_ORDERS !== 'true') {
      res.status(400).json({ success: false, message: 'Votre panier doit être revalidé. Actualisez la page puis recommencez.' });
      return;
    }

    const pricing = quote ?? legacyPricing(body);
    if (typeof pricing === 'string') { res.status(400).json({ success: false, message: pricing }); return; }
    const { items: lines, sousTotal, fraisLivraison, total, modeCommande } = pricing;

    const MODES_PAIEMENT = ['mobile_money', 'carte', 'especes'];
    const modePaiement   = MODES_PAIEMENT.includes(String(body.modePaiement)) ? String(body.modePaiement) : 'especes';

    // Un paiement en ligne réussi, du bon montant, existe-t-il pour ce devis ? (les espèces ne comptent pas :
    // l'enregistrement « cash » est public). Simple indicateur pour l'équipe : il ne bloque jamais une commande.
    const paiementVerifie = !!quote && modePaiement !== 'especes' && !!(await Transaction.exists({
      orderId: quote.orderId, provider: { $in: ['airtel', 'moov', 'card'] }, status: 'success', amount: { $gte: total },
    }));

    // Valide le format de datelivraison (AAAA-MM-JJ) si fourni
    let datelivraison: string | undefined;
    if (body.datelivraison && typeof body.datelivraison === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(body.datelivraison)) {
        datelivraison = body.datelivraison;
      }
    }

    const order = new Order({
      client: {
        nom:       String(client.nom).trim().slice(0, 100),
        prenoms:   client.prenoms ? String(client.prenoms).trim().slice(0, 100) : '',
        // Sans cette garde, un email absent était enregistré sous la forme de la chaîne « undefined ».
        email:     client.email ? String(client.email).toLowerCase().trim().slice(0, 200) : '',
        telephone,
        adresse:   client.adresse ? String(client.adresse).trim().slice(0, 300) : 'Sur place',
      },
      // Le compte vient du jeton, jamais du corps : sinon n'importe qui pourrait rattacher une commande
      // (et ses points de fidélité) au compte d'un autre. Sans jeton valide, c'est une commande d'invité.
      userId: (req as ClientRequest).clientId ?? undefined,
      items: lines,
      // Une commande naît toujours « en attente » : seule l'équipe la confirme (avant : le client pouvait choisir).
      statut:           'en_attente',
      priorite:         'normale',
      modeCommande,
      modePaiement,
      refPaiement:      quote?.orderId,
      paiementVerifie,
      sousTotal,
      fraisLivraison,
      total,
      datelivraison:    datelivraison ?? null,
      creneauLivraison: body.creneauLivraison ? String(body.creneauLivraison).trim().slice(0, 10) : null,
      notes:            body.notes ? String(body.notes).trim().slice(0, 500) : '',
    });
    try {
      await order.save();
    } catch (saveError) {
      // Deux envois simultanés du même devis : l'index unique en laisse passer un, on renvoie la commande créée.
      if (quote && (saveError as { code?: number }).code === 11000) {
        const existing = await Order.findOne({ refPaiement: quote.orderId });
        if (existing) { res.status(200).json({ success: true, data: existing }); return; }
      }
      throw saveError;
    }
    await logAction(`Commande ${order.numero} créée`, 'commande', String(client.nom).trim());

    // Confirmation email — sans attendre la fin (n'impacte pas la réponse)
    if (client.email) {
      sendOrderConfirmationEmail(String(client.email), {
        numero:        order.numero,
        nom:           String(client.nom).trim(),
        items:         order.items.map(i => ({ nom: i.nom, qty: i.qty, prix: i.prix })),
        sousTotal:     order.sousTotal,
        fraisLivraison: order.fraisLivraison,
        total:         order.total,
        modePaiement:  order.modePaiement,
        modeCommande:  order.modeCommande,
        statut:        order.statut,
        notes:         order.notes || undefined,
        adresse:       client.adresse ? String(client.adresse) : undefined,
      }).catch(err => logger.warn('Email confirmation commande échoué', { message: (err as Error).message }));
    }

    notifyOrderCreated(order);
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création commande', error: (error as Error).message });
  }
});

// ── PATCH /api/orders/:id/status ──────────────────────────────────────────────
router.patch('/:id/status', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { statut, note, par } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) { res.status(404).json({ success: false, message: 'Commande introuvable' }); return; }

    const prev = order.statut;
    order.statut = statut;
    order.historique.push({ statut, date: new Date(), note, par: par || 'Admin' });
    await order.save();
    await logAction(`Commande ${order.numero} : ${prev} → ${statut}`, 'commande', par || 'Admin');

    // ── Notifications asynchrones (sans attendre la fin) ─────────────────────────
    const phone  = order.client.telephone;
    const name   = order.client.nom;
    const userId = order.userId ? String(order.userId) : null;

    // WhatsApp — changement de statut
    sendStatusNotification(phone, order.numero, name, statut, note)
      .catch(e => logger.error('[WhatsApp] status notification failed', { error: (e as Error).message }));

    // Push — changement de statut
    if (userId) {
      const PUSH_MESSAGES: Record<string, { title: string; body: string }> = {
        confirmee:      { title: 'Commande confirmée',       body: `Commande #${order.numero.slice(-8).toUpperCase()} confirmée.` },
        en_preparation: { title: 'En préparation',           body: 'Nos cuisiniers préparent votre commande.' },
        prete:          { title: 'Livraison en route',        body: 'Votre livreur prend la route !' },
        livree:         { title: 'Commande livrée',           body: 'Régalez-vous !' },
        annulee:        { title: 'Commande annulée',          body: note || 'Votre commande a été annulée.' },
        remboursee:     { title: 'Remboursement en cours',    body: 'Votre remboursement est en traitement.' },
      };
      const pushMsg = PUSH_MESSAGES[statut];
      if (pushMsg) {
        sendPushToUser(userId, { ...pushMsg, url: '/commandes' })
          .catch(e => logger.error('[Push] status notification failed', { error: (e as Error).message }));
      }
    }

    // Fidélité — attribuer des points à la livraison
    if (statut === 'livree' && userId) {
      attributerPoints(userId, order.total, order._id as unknown as string)
        .then(({ pointsGagnes, soldeApres, tierAvant, tierApres }) => {
          if (pointsGagnes > 0) {
            // WhatsApp fidélité
            sendFideliteNotification(
              phone, name, pointsGagnes, soldeApres, tierApres,
              tierAvant !== tierApres ? { avant: tierAvant, apres: tierApres } : undefined,
            ).catch(e => logger.error('[WhatsApp] fidelite notification failed', { error: (e as Error).message }));

            // Push fidélité
            sendPushToUser(userId!, {
              title: `+${pointsGagnes} points de fidelite`,
              body:  `Solde : ${soldeApres} pts — Niveau ${tierApres}`,
              url:   '/mon-compte',
            }).catch(e => logger.error('[Push] fidelite notification failed', { error: (e as Error).message }));
          }
        })
        .catch(e => logger.error('[Fidelite] attribution failed', { error: (e as Error).message }));
    }

    notifyOrderStatus(order);
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur mise à jour statut', error: (error as Error).message });
  }
});

// ── PATCH /api/orders/:id/priority ───────────────────────────────────────────
router.patch('/:id/priority', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { priorite: req.body.priorite },
      { new: true }
    );
    if (!order) { res.status(404).json({ success: false, message: 'Commande introuvable' }); return; }
    notifyOrderUpdated(order);
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/orders/:id/anomalie ─────────────────────────────────────────────
router.post('/:id/anomalie', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, raison, montant } = req.body;
    const statut = type === 'annulation' ? 'annulee' : 'remboursee';
    const order = await Order.findById(req.params.id);
    if (!order) { res.status(404).json({ success: false, message: 'Commande introuvable' }); return; }

    order.anomalie = { type, raison, montant, date: new Date() };
    order.statut   = statut;
    order.historique.push({ statut, date: new Date(), note: raison, par: 'Admin' });
    await order.save();
    await logAction(`Anomalie sur commande ${order.numero} : ${type}`, 'commande', 'Admin', { raison, montant });
    notifyOrderStatus(order);
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

export default router;
