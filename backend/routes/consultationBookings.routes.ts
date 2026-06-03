import { Router, Request, Response } from 'express';
import { requireClient, ClientRequest } from '../middleware/clientAuth.js';
import { verifyJWT } from './auth.routes.js';
import ConsultationBooking from '../models/ConsultationBooking.model.js';
import { Types } from 'mongoose';

const router = Router();

// ── POST /api/consultation-bookings — Créer une réservation ──────────────────
// Public endpoint — optionally attaches userId if client token present
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      userNom, userPrenoms, userEmail, userTelephone,
      consultationId, titre, prix, date, creneau, mode, notes,
      userId,
    } = req.body as Record<string, unknown>;

    // Basic validation
    if (!userNom || !userEmail || !userTelephone || !titre || !prix || !date || !creneau) {
      res.status(400).json({ success: false, message: 'Champs obligatoires manquants.' });
      return;
    }

    // Sanitize
    const bookingDate = new Date(date as string);
    if (isNaN(bookingDate.getTime())) {
      res.status(400).json({ success: false, message: 'Date invalide.' });
      return;
    }
    if (bookingDate < new Date()) {
      res.status(400).json({ success: false, message: 'La date de consultation ne peut pas être dans le passé.' });
      return;
    }

    // Anti-double réservation : même date + même créneau déjà pris
    const dateStr = bookingDate.toISOString().split('T')[0];
    const conflict = await ConsultationBooking.findOne({
      date:    { $gte: new Date(dateStr), $lt: new Date(dateStr + 'T23:59:59') },
      creneau: String(creneau),
      statut:  { $nin: ['annule'] },
    }).lean();
    if (conflict) {
      res.status(409).json({ success: false, message: 'Ce créneau est déjà réservé. Veuillez choisir un autre horaire.' });
      return;
    }

    const booking = await ConsultationBooking.create({
      userId:         userId ? new Types.ObjectId(String(userId)) : undefined,
      userNom:        String(userNom).slice(0, 100),
      userPrenoms:    userPrenoms ? String(userPrenoms).slice(0, 150) : undefined,
      userEmail:      String(userEmail).toLowerCase().slice(0, 254),
      userTelephone:  String(userTelephone).slice(0, 30),
      consultationId: consultationId ? new Types.ObjectId(String(consultationId)) : undefined,
      titre:          String(titre).slice(0, 200),
      prix:           Number(prix),
      date:           bookingDate,
      creneau:        String(creneau).slice(0, 20),
      mode:           ['presentiel', 'virtuel'].includes(String(mode)) ? mode : 'virtuel',
      notes:          notes ? String(notes).slice(0, 1000) : undefined,
    });

    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création réservation.', error: (error as Error).message });
  }
});

// ── GET /api/consultation-bookings/me — Réservations du client connecté ──────
router.get('/me', requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(req.clientId);
    const bookings = await ConsultationBooking.find({ userId })
      .sort({ date: 1 })
      .lean();
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération.', error: (error as Error).message });
  }
});

// ── GET /api/consultation-bookings — Admin: toutes les réservations ───────────
router.get('/', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const bookings = await ConsultationBooking.find()
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération.', error: (error as Error).message });
  }
});

// ── PATCH /api/consultation-bookings/:id — Admin: changer statut / plan ───────
router.patch('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const ALLOWED_STATUTS = ['en_attente', 'confirme', 'effectue', 'annule'];
    const { statut, planAlimentaire, notes } = req.body as Record<string, string>;

    const update: Record<string, string> = {};
    if (statut && ALLOWED_STATUTS.includes(statut)) update.statut = statut;
    if (planAlimentaire != null) update.planAlimentaire = String(planAlimentaire).slice(0, 5000);
    if (notes != null) update.notes = String(notes).slice(0, 1000);

    const booking = await ConsultationBooking.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!booking) { res.status(404).json({ success: false, message: 'Réservation introuvable.' }); return; }

    res.json({ success: true, data: booking });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur mise à jour.', error: (error as Error).message });
  }
});

export default router;
