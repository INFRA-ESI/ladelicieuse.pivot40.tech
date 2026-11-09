import { Router, Request, Response } from 'express';
import Testimonial from '../models/Testimonial.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const SUBMIT_PAGES = ['consultations', 'abonnement', 'accueil'];

// ── GET /api/testimonials?page=consultations — Public (actifs seulement) ───────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { actif: true, statut: 'approuve' };
    if (req.query.page) filter.page = req.query.page;
    const items = await Testimonial.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération témoignages', error: (error as Error).message });
  }
});

// ── POST /api/testimonials/submit — Public (soumission client) ────────────────
// Endpoint ouvert à tous : limité en débit et en taille pour éviter le spam de la file de modération.
router.post('/submit', rateLimiter(5, 900, 'testimonial-submit'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { nom, texte, note, page, email } = req.body;
    if (typeof nom !== 'string' || typeof texte !== 'string' || !nom.trim() || !texte.trim() || !SUBMIT_PAGES.includes(page)) {
      res.status(400).json({ success: false, message: 'Nom, témoignage et page valides requis' });
      return;
    }
    const item = new Testimonial({
      nom:    nom.trim().slice(0, 80),
      texte:  texte.trim().slice(0, 1000),
      note:   Math.min(5, Math.max(1, Number(note) || 5)),
      page,
      email:  email?.trim() || '',
      source: 'client',
      statut: 'en_attente',
      actif:  false,
    });
    await item.save();
    res.status(201).json({ success: true, message: 'Témoignage soumis, en attente de validation.' });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur soumission', error: (error as Error).message });
  }
});

// ── GET /api/testimonials/all — Admin ─────────────────────────────────────────
router.get('/all', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.page)   filter.page   = req.query.page;
    if (req.query.statut) filter.statut = req.query.statut;
    if (req.query.source) filter.source = req.query.source;
    const items = await Testimonial.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/testimonials — Admin (création directe) ─────────────────────────
router.post('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = { ...req.body, source: 'admin', statut: 'approuve' };
    const item = new Testimonial(payload);
    await item.save();
    await logAction(`Témoignage de "${item.nom}" créé`, 'parametre', 'Admin');
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création', error: (error as Error).message });
  }
});

// ── PATCH /api/testimonials/:id ───────────────────────────────────────────────
router.patch('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await Testimonial.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) { res.status(404).json({ success: false, message: 'Témoignage introuvable' }); return; }
    await logAction(`Témoignage de "${item.nom}" modifié`, 'parametre', 'Admin');
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur modification', error: (error as Error).message });
  }
});

// ── DELETE /api/testimonials/:id ──────────────────────────────────────────────
router.delete('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await Testimonial.findByIdAndDelete(req.params.id);
    if (!item) { res.status(404).json({ success: false, message: 'Témoignage introuvable' }); return; }
    await logAction(`Témoignage de "${item.nom}" supprimé`, 'parametre', 'Admin');
    res.json({ success: true, message: 'Témoignage supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur suppression', error: (error as Error).message });
  }
});

export default router;
