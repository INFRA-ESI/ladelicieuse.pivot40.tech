import { Router, Request, Response } from 'express';
import Order from '../models/Order.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { attributerPoints } from '../services/fidelite.service.js';
import { sendStatusNotification, sendFideliteNotification } from '../services/whatsapp.service.js';
import { sendPushToUser } from '../services/push.service.js';
import { sendOrderConfirmationEmail } from '../services/email.service.js';
import { logger } from '../config/logger.js';

const router = Router();

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

// ── POST /api/orders — Créer une commande ─────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
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

    // Validate items
    const rawItems = body.items as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      res.status(400).json({ success: false, message: 'La commande doit contenir au moins un article.' }); return;
    }
    for (const item of rawItems) {
      const qty  = Number(item.qty);
      const prix = Number(item.prix);
      if (!item.nom || typeof item.nom !== 'string') {
        res.status(400).json({ success: false, message: 'Chaque article doit avoir un nom.' }); return;
      }
      if (!Number.isFinite(qty) || qty < 1) {
        res.status(400).json({ success: false, message: 'Quantité invalide sur un article.' }); return;
      }
      if (!Number.isFinite(prix) || prix < 0) {
        res.status(400).json({ success: false, message: 'Prix invalide sur un article.' }); return;
      }
    }

    // Server-side recalculation — never trust client-sent totals
    const sousTotal      = rawItems.reduce((s, i) => s + Number(i.prix) * Number(i.qty), 0);
    const fraisLivraison = Math.min(Math.max(0, Number(body.fraisLivraison) || 0), 10_000);
    const total          = sousTotal + fraisLivraison;

    const MODES_COMMANDE  = ['livraison', 'sur_place', 'emporter'];
    const MODES_PAIEMENT  = ['mobile_money', 'carte', 'especes'];
    const STATUTS_VALIDES = ['en_attente', 'confirmee'];

    // Validate datelivraison format (YYYY-MM-DD) if provided
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
        email:     String(client.email).toLowerCase().trim().slice(0, 200),
        telephone: String(client.telephone).trim().slice(0, 30),
        adresse:   client.adresse ? String(client.adresse).trim().slice(0, 300) : 'Sur place',
      },
      userId: body.userId ?? undefined,
      items: rawItems.map(i => ({
        nom:            String(i.nom).trim().slice(0, 200),
        qty:            Number(i.qty),
        prix:           Number(i.prix),
        customizations: Array.isArray(i.customizations)
          ? (i.customizations as unknown[]).map(String).slice(0, 20)
          : [],
      })),
      statut:           STATUTS_VALIDES.includes(String(body.statut)) ? String(body.statut) : 'en_attente',
      priorite:         'normale',
      modeCommande:     MODES_COMMANDE.includes(String(body.modeCommande)) ? String(body.modeCommande) : 'livraison',
      modePaiement:     MODES_PAIEMENT.includes(String(body.modePaiement)) ? String(body.modePaiement) : 'especes',
      sousTotal,
      fraisLivraison,
      total,
      datelivraison:    datelivraison ?? null,
      creneauLivraison: body.creneauLivraison ? String(body.creneauLivraison).trim().slice(0, 10) : null,
      notes:            body.notes ? String(body.notes).trim().slice(0, 500) : '',
    });
    await order.save();
    await logAction(`Commande ${order.numero} créée`, 'commande', String(client.nom).trim());

    // Confirmation email — fire-and-forget (n'impacte pas la réponse)
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

    // ── Notifications asynchrones (fire-and-forget) ─────────────────────────
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
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

export default router;
