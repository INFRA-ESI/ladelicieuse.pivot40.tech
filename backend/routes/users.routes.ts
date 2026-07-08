import { Router, Request, Response } from 'express';
import User from '../models/User.model.js';
import Order from '../models/Order.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';

const router = Router();

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parsePage    = (v: string) => Math.max(1, parseInt(v) || 1);
const parseLimit   = (v: string, max = 200) => Math.min(max, Math.max(1, parseInt(v) || 50));

// ── GET /api/users — Liste paginée avec filtres ───────────────────────────────
router.get('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, statut, tier, emailVerified, page = '1', limit = '50' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};

    if (statut && statut !== 'tous') filter.statut = statut;
    if (tier && tier !== 'tous') filter.tier = tier;
    if (emailVerified === 'true')  filter.emailVerified = true;
    if (emailVerified === 'false') filter.emailVerified = false;
    if (search) {
      const safe = escapeRegex(search.slice(0, 100));
      filter.$or = [
        { nom:       { $regex: safe, $options: 'i' } },
        { email:     { $regex: safe, $options: 'i' } },
        { telephone: { $regex: safe, $options: 'i' } },
      ];
    }

    const pageNum  = parsePage(page);
    const limitNum = parseLimit(limit);
    const skip  = (pageNum - 1) * limitNum;
    const total = await User.countDocuments(filter);
    const users = await User.find(filter).select(SELECT_SAFE).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean();

    res.json({ success: true, data: users, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération utilisateurs', error: (error as Error).message });
  }
});

// ── GET /api/users/stats ──────────────────────────────────────────────────────
router.get('/stats', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [total, actifs, tiers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ statut: 'actif' }),
      User.aggregate([{ $group: { _id: '$tier', count: { $sum: 1 } } }]),
    ]);
    res.json({
      success: true,
      data: {
        total,
        actifs,
        parTier: Object.fromEntries(tiers.map(t => [t._id, t.count])),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur stats', error: (error as Error).message });
  }
});

// Champs qu'un admin peut lire — exclut les tokens sensibles et le mot de passe
const SELECT_SAFE = '-password -emailVerificationToken -emailVerificationExpires -passwordResetToken -passwordResetExpires';

// Champs qu'un admin peut définir à la création d'un compte
const ALLOWED_CREATE: string[] = [
  'nom', 'prenoms', 'email', 'telephone', 'adresse', 'statut',
];

// Champs qu'un admin peut modifier (jamais les tokens, le hash, l'email vérifié)
const ALLOWED_UPDATE: string[] = [
  'nom', 'prenoms', 'telephone', 'adresse', 'statut', 'tier',
];

function pick(body: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) result[key] = body[key];
  }
  return result;
}

// ── GET /api/users/:id ────────────────────────────────────────────────────────
router.get('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id).select(SELECT_SAFE).lean();
    if (!user) { res.status(404).json({ success: false, message: 'Utilisateur introuvable' }); return; }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/users ───────────────────────────────────────────────────────────
router.post('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const safe = pick(req.body as Record<string, unknown>, ALLOWED_CREATE);
    const user = new User(safe);
    await user.save();
    await logAction(`Utilisateur ${user.nom} créé`, 'utilisateur', 'Admin');
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création utilisateur', error: (error as Error).message });
  }
});

// ── PATCH /api/users/:id ──────────────────────────────────────────────────────
router.patch('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const safe = pick(req.body as Record<string, unknown>, ALLOWED_UPDATE);
    const user = await User.findByIdAndUpdate(req.params.id, { $set: safe }, { new: true, runValidators: true })
      .select(SELECT_SAFE);
    if (!user) { res.status(404).json({ success: false, message: 'Utilisateur introuvable' }); return; }
    await logAction(`Utilisateur ${user.nom} modifié`, 'utilisateur', 'Admin');
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur modification', error: (error as Error).message });
  }
});

// ── PATCH /api/users/:id/points ───────────────────────────────────────────────
router.patch('/:id/points', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { delta } = req.body as { delta: number };
    const user = await User.findById(req.params.id);
    if (!user) { res.status(404).json({ success: false, message: 'Utilisateur introuvable' }); return; }

    user.points = Math.max(0, user.points + delta);
    await user.save();
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur mise à jour points', error: (error as Error).message });
  }
});

// ── GET /api/users/:id/orders — Historique commandes (admin) ─────────────────
router.get('/:id/orders', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const orders = await Order.find({ userId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('numero statut total items modePaiement modeCommande createdAt')
      .lean();
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── DELETE /api/users/cleanup-unverified — Purge comptes non vérifiés expirés ──
router.delete('/cleanup-unverified', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await User.deleteMany({
      emailVerified: false,
      emailVerificationExpires: { $lt: new Date() },
    });
    await logAction(`Purge ${result.deletedCount} compte(s) non vérifié(s) expirés`, 'utilisateur', 'Admin');
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur purge', error: (error as Error).message });
  }
});

// ── DELETE /api/users/:id ─────────────────────────────────────────────────────
router.delete('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) { res.status(404).json({ success: false, message: 'Utilisateur introuvable' }); return; }
    await logAction(`Utilisateur ${user.nom} supprimé`, 'utilisateur', 'Admin');
    res.json({ success: true, message: 'Utilisateur supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur suppression', error: (error as Error).message });
  }
});

export default router;
