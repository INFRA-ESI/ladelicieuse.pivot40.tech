import { Router, Request, Response } from 'express';
import Invoice from '../models/Invoice.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { sendInvoiceEmail } from '../services/email.service.js';

const router = Router();

// ── GET /api/invoices ─────────────────────────────────────────────────────────
router.get('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, statut, page = '1', limit = '50' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};

    if (statut && statut !== 'tous') filter.statut = statut;
    if (search) {
      filter.$or = [
        { client: { $regex: search, $options: 'i' } },
        { email:  { $regex: search, $options: 'i' } },
        { numero: { $regex: search, $options: 'i' } },
      ];
    }

    const skip     = (parseInt(page) - 1) * parseInt(limit);
    const total    = await Invoice.countDocuments(filter);
    const invoices = await Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean();

    res.json({ success: true, data: invoices, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération factures', error: (error as Error).message });
  }
});

// ── GET /api/invoices/bilan — Bilan mensuel depuis les vraies factures ────────
router.get('/bilan', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { months = '7' } = req.query as Record<string, string>;
    const n = Math.min(parseInt(months), 24);
    const since = new Date();
    since.setMonth(since.getMonth() - n);

    const rows = await Invoice.aggregate([
      { $match: { statut: 'payee', createdAt: { $gte: since } } },
      { $addFields: { moisKey: { $dateToString: { format: '%Y-%m', date: '$createdAt' } } } },
      { $group: {
        _id: '$moisKey',
        revenus:       { $sum: '$totalHT' },
        totalTTC:      { $sum: '$totalTTC' },
        count:         { $sum: 1 },
        allItems:      { $push: '$items' },
      }},
      { $sort: { _id: 1 } },
    ]);

    const data = rows.map(row => {
      const items: Array<{ qty: number; coutUnit: number }> = (row.allItems as Array<Array<{ qty: number; coutUnit: number }>>).flat();
      const coutMatieres = items.reduce((s, it) => s + (it.coutUnit || 0) * it.qty, 0);
      const [year, month] = (row._id as string).split('-');
      const mois = new Date(parseInt(year), parseInt(month) - 1, 1)
        .toLocaleDateString('fr-FR', { month: 'short' });
      return {
        mois: mois.charAt(0).toUpperCase() + mois.slice(1),
        moisKey: row._id,
        revenus: Math.round(row.revenus as number),
        coutMatieres: Math.round(coutMatieres),
        chargesOp: 0,
        benefice: Math.round((row.revenus as number) - coutMatieres),
        count: row.count,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur bilan', error: (error as Error).message });
  }
});

// ── GET /api/invoices/rentabilite — Rentabilité par article depuis les factures ─
router.get('/rentabilite', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await Invoice.aggregate([
      { $match: { statut: 'payee' } },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.nom',
        qteConsommee:     { $sum: '$items.qty' },
        coutTotal:        { $sum: { $multiply: ['$items.coutUnit', '$items.qty'] } },
        revenusAttribues: { $sum: { $multiply: ['$items.prixUnit', '$items.qty'] } },
        platsUtilisant:   { $addToSet: '$_id' },
      }},
      { $project: {
        _id: 0,
        nom:              '$_id',
        qteConsommee:     1,
        coutTotal:        { $round: ['$coutTotal', 0] },
        revenusAttribues: { $round: ['$revenusAttribues', 0] },
        marge:            { $round: [{ $subtract: ['$revenusAttribues', '$coutTotal'] }, 0] },
        margePct: {
          $cond: [
            { $gt: ['$revenusAttribues', 0] },
            { $round: [{ $multiply: [{ $divide: [{ $subtract: ['$revenusAttribues', '$coutTotal'] }, '$revenusAttribues'] }, 100] }, 1] },
            0,
          ],
        },
        platsUtilisant: { $size: '$platsUtilisant' },
      }},
      { $sort: { marge: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur rentabilité', error: (error as Error).message });
  }
});

// ── GET /api/invoices/stats ───────────────────────────────────────────────────
router.get('/stats', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [totals, statuts] = await Promise.all([
      Invoice.aggregate([
        { $match: { statut: 'payee' } },
        { $group: { _id: null, revenu: { $sum: '$totalTTC' }, count: { $sum: 1 } } },
      ]),
      Invoice.aggregate([{ $group: { _id: '$statut', count: { $sum: 1 } } }]),
    ]);
    res.json({
      success: true,
      data: {
        total: totals[0] ?? { revenu: 0, count: 0 },
        parStatut: Object.fromEntries(statuts.map(s => [s._id, s.count])),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur stats', error: (error as Error).message });
  }
});

// ── GET /api/invoices/:id ─────────────────────────────────────────────────────
router.get('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('orderId', 'numero');
    if (!invoice) { res.status(404).json({ success: false, message: 'Facture introuvable' }); return; }
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/invoices ────────────────────────────────────────────────────────
router.post('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const invoice = new Invoice(req.body);
    await invoice.save();
    await logAction(`Facture ${invoice.numero} créée pour ${invoice.client}`, 'facture', 'Admin');
    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création facture', error: (error as Error).message });
  }
});

// ── PATCH /api/invoices/:id/status ────────────────────────────────────────────
router.patch('/:id/status', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { statut } = req.body as { statut: string };
    const invoice = await Invoice.findByIdAndUpdate(req.params.id, { statut }, { new: true });
    if (!invoice) { res.status(404).json({ success: false, message: 'Facture introuvable' }); return; }
    await logAction(`Facture ${invoice.numero} : statut → ${statut}`, 'facture', 'Admin');
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur mise à jour statut', error: (error as Error).message });
  }
});

// ── PATCH /api/invoices/:id ───────────────────────────────────────────────────
router.patch('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!invoice) { res.status(404).json({ success: false, message: 'Facture introuvable' }); return; }
    await logAction(`Facture ${invoice.numero} modifiée`, 'facture', 'Admin');
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur modification', error: (error as Error).message });
  }
});

// ── POST /api/invoices/:id/send — Envoi par email au client ──────────────────
router.post('/:id/send', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) { res.status(404).json({ success: false, message: 'Facture introuvable' }); return; }
    if (!invoice.email) { res.status(400).json({ success: false, message: 'Aucun email client pour cette facture' }); return; }

    await sendInvoiceEmail(invoice.email, {
      numero:       invoice.numero,
      client:       invoice.client,
      items:        (invoice.items as Array<{ nom: string; qty: number; prixUnit: number }>),
      totalHT:      invoice.totalHT,
      tva:          invoice.tva,
      totalTTC:     invoice.totalTTC,
      modePaiement: invoice.modePaiement,
      statut:       invoice.statut as 'payee' | 'en_attente' | 'annulee' | 'remboursee',
      createdAt:    (invoice.createdAt as Date).toISOString(),
      notes:        invoice.notes,
    });

    await logAction(`Facture ${invoice.numero} envoyée par email à ${invoice.email}`, 'facture', 'Admin');
    res.json({ success: true, message: `Facture envoyée à ${invoice.email}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur envoi email', error: (error as Error).message });
  }
});

// ── DELETE /api/invoices/:id ──────────────────────────────────────────────────
router.delete('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) { res.status(404).json({ success: false, message: 'Facture introuvable' }); return; }
    await logAction(`Facture ${invoice.numero} supprimée`, 'facture', 'Admin');
    res.json({ success: true, message: 'Facture supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur suppression', error: (error as Error).message });
  }
});

export default router;
