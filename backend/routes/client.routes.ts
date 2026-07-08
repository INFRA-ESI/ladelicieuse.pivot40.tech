import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import Order from '../models/Order.model.js';
import { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail } from '../services/email.service.js';
import { getHistoriqueFidelite, rachatPoints, calculerPointsGagnes } from '../services/fidelite.service.js';
import { sendPushToUser } from '../services/push.service.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { requireClient, ClientRequest } from '../middleware/clientAuth.js';
import { logger } from '../config/logger.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET manquant dans les variables d\'environnement.');
const CLIENT_TOKEN_EXPIRY = '7d';

function validatePassword(pwd: string): string | null {
  if (pwd.length < 8)          return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (!/[A-Z]/.test(pwd))      return 'Le mot de passe doit contenir au moins une lettre majuscule.';
  if (!/[0-9]/.test(pwd))      return 'Le mot de passe doit contenir au moins un chiffre.';
  if (!/[^a-zA-Z0-9]/.test(pwd)) return 'Le mot de passe doit contenir au moins un caractère spécial (@, !, #, $...).';
  return null;
}

// ── POST /api/client/register ─────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { nom, prenoms, email, password, telephone } = req.body;

    if (!nom?.trim() || !prenoms?.trim() || !email || !password) {
      res.status(400).json({ success: false, message: 'Nom, prénom(s), email et mot de passe sont requis.' });
      return;
    }
    const pwdError = validatePassword(password);
    if (pwdError) { res.status(400).json({ success: false, message: pwdError }); return; }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(409).json({ success: false, message: 'Un compte existe déjà avec cet email.' });
      return;
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = new User({
      nom:     nom.trim(),
      prenoms: prenoms.trim(),
      email,
      password,
      telephone: telephone || '',
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    });
    await user.save();

    try {
      await sendVerificationEmail(email, prenoms.trim(), verificationToken);
    } catch (emailError) {
      logger.error('Échec envoi email vérification', { email, error: (emailError as Error).message });
    }

    logger.info('Nouveau client inscrit', { email });
    res.status(201).json({
      success: true,
      message: `Compte créé ! Un email de vérification a été envoyé à ${email}. Cliquez sur le lien pour activer votre compte.`,
    });
  } catch (error) {
    logger.error('Erreur register', { error: (error as Error).message });
    res.status(500).json({ success: false, message: "Erreur lors de l'inscription.", error: (error as Error).message });
  }
});

// ── GET /api/client/verify-email ──────────────────────────────────────────────
router.get('/verify-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query as { token: string };

    if (!token) {
      res.status(400).json({ success: false, message: 'Token manquant.' });
      return;
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ success: false, message: 'Lien invalide ou expiré. Veuillez vous réinscrire.' });
      return;
    }

    user.emailVerified = true;
    user.statut = 'actif';
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    try {
      await sendWelcomeEmail(user.email, user.prenoms || user.nom);
    } catch {}

    logger.info('Email vérifié', { email: user.email });
    res.json({ success: true, message: 'Email vérifié avec succès ! Vous pouvez maintenant vous connecter.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur vérification email.', error: (error as Error).message });
  }
});

// ── POST /api/client/login ────────────────────────────────────────────────────
router.post('/login', rateLimiter(5, 300, 'client-login'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email et mot de passe requis.' });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.password) {
      res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect.' });
      return;
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect.' });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        success: false,
        message: 'Votre email n\'est pas encore vérifié. Consultez votre boîte mail et cliquez sur le lien d\'activation.',
        needsVerification: true,
      });
      return;
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, nom: user.nom, prenoms: user.prenoms, role: 'client' },
      JWT_SECRET,
      { expiresIn: CLIENT_TOKEN_EXPIRY }
    );

    logger.info('Connexion client', { email });
    res.json({
      success: true,
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        nom: user.nom,
        prenoms: user.prenoms,
        email: user.email,
        telephone: user.telephone,
        points: user.points,
        tier: user.tier,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur connexion.', error: (error as Error).message });
  }
});

// ── GET /api/client/me ────────────────────────────────────────────────────────
router.get('/me', requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.clientId).select('-password -emailVerificationToken -passwordResetToken').lean();
    if (!user) { res.status(404).json({ success: false, message: 'Compte introuvable.' }); return; }
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── POST /api/client/forgot-password ─────────────────────────────────────────
router.post('/forgot-password', rateLimiter(3, 900, 'client-forgot-pwd'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, message: 'Email requis.' });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Toujours répondre OK pour ne pas révéler si l'email existe
    if (!user || !user.emailVerified) {
      res.json({ success: true, message: 'Si un compte correspond à cet email, vous recevrez un lien de réinitialisation.' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = token;
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    await user.save();

    await sendPasswordResetEmail(user.email, user.nom, token);
    logger.info('Email reset mot de passe envoyé', { email: user.email });

    res.json({ success: true, message: 'Si un compte correspond à cet email, vous recevrez un lien de réinitialisation.' });
  } catch (error) {
    logger.error('Erreur forgot-password', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors de la demande de réinitialisation.' });
  }
});

// ── POST /api/client/resend-verification ─────────────────────────────────────
// Renvoi de l'email de vérification pour les comptes non vérifiés.
// Rate limité à 3/15min/IP pour éviter le spam email.
// Réponse identique qu'un compte existe ou non (anti-énumération).
router.post('/resend-verification', rateLimiter(3, 900, 'resend-verification'), async (req: Request, res: Response): Promise<void> => {
  const SAFE_RESPONSE = { success: true, message: "Si un compte non vérifié correspond à cet email, vous recevrez un nouveau lien de vérification." };
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.json(SAFE_RESPONSE); // ne pas indiquer que l'email est invalide
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('+emailVerificationToken +emailVerificationExpires');

    if (!user || user.emailVerified) {
      res.json(SAFE_RESPONSE);
      return;
    }

    // Régénère un token frais (24h)
    const token = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken   = token;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(user.email, user.nom, token);
    logger.info('Email de vérification renvoyé', { email: user.email });

    res.json(SAFE_RESPONSE);
  } catch (error) {
    logger.error('Erreur resend-verification', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors du renvoi du lien de vérification.' });
  }
});

// ── POST /api/client/reset-password ──────────────────────────────────────────
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ success: false, message: 'Token et nouveau mot de passe requis.' });
      return;
    }
    const pwdError = validatePassword(password);
    if (pwdError) { res.status(400).json({ success: false, message: pwdError }); return; }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ success: false, message: 'Lien invalide ou expiré. Demandez un nouveau lien.' });
      return;
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    logger.info('Mot de passe réinitialisé', { email: user.email });
    res.json({ success: true, message: 'Mot de passe mis à jour avec succès. Vous pouvez vous connecter.' });
  } catch (error) {
    logger.error('Erreur reset-password', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors de la réinitialisation.' });
  }
});

// ── GET /api/client/fidelite — Historique des points ─────────────────────────
router.get('/fidelite', requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.clientId).select('points tier nom').lean();
    if (!user) { res.status(404).json({ success: false, message: 'Compte introuvable.' }); return; }

    const historique = await getHistoriqueFidelite(req.clientId!, 30);
    res.json({ success: true, data: { points: user.points, tier: user.tier, historique } });
  } catch {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── GET /api/client/goals — Objectifs nutritionnels personnels ────────────────
router.get('/goals', requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.clientId)
      .select('taille objectifPoids objectifCalories objectifProteines objectifGlucides objectifLipides objectifEau')
      .lean();
    if (!user) { res.status(404).json({ success: false, message: 'Compte introuvable.' }); return; }
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── PATCH /api/client/goals — Mettre à jour les objectifs nutritionnels ───────
router.patch('/goals', requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const ALLOWED = ['taille', 'objectifPoids', 'objectifCalories', 'objectifProteines', 'objectifGlucides', 'objectifLipides', 'objectifEau'];
    const update: Record<string, number> = {};
    for (const key of ALLOWED) {
      const val = (req.body as Record<string, unknown>)[key];
      if (val !== undefined && val !== null && val !== '') {
        const n = Number(val);
        if (!isNaN(n)) update[key] = n;
      }
    }

    const user = await User.findByIdAndUpdate(req.clientId, { $set: update }, { new: true, runValidators: true })
      .select('taille objectifPoids objectifCalories objectifProteines objectifGlucides objectifLipides objectifEau');
    if (!user) { res.status(404).json({ success: false, message: 'Compte introuvable.' }); return; }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Mise à jour échouée.', error: (error as Error).message });
  }
});

// ── POST /api/client/fidelite/racheter — Convertir des points en code promo ──
router.post('/fidelite/racheter', requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const { points } = req.body as { points: number };

    if (!points || points < 100) {
      res.status(400).json({ success: false, message: 'Minimum 100 points pour un rachat.' });
      return;
    }

    const result = await rachatPoints(req.clientId!, points);

    // Push — envoyer le code promo directement sur l'appareil
    sendPushToUser(req.clientId!, {
      title: 'Code promo genere',
      body:  `${result.code} — ${result.valeurFCFA.toLocaleString('fr-FR')} FCFA`,
      url:   '/mon-compte',
    }).catch(() => {});

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
});

// ── GET /api/client/orders — Historique réel des commandes ────────────────────
router.get('/orders', requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const orders = await Order.find({ userId: req.clientId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('numero statut total sousTotal fraisLivraison items modePaiement modeCommande createdAt')
      .lean();

    const data = orders.map(o => ({
      id:           String(o._id),
      numero:       o.numero,
      date:         new Date(o.createdAt).toLocaleDateString('fr-FR'),
      items:        o.items.map(i => ({ name: i.nom, qty: i.qty, price: i.prix })),
      total:        o.total,
      sousTotal:    o.sousTotal,
      fraisLivraison: o.fraisLivraison,
      statut:       o.statut,
      modePaiement: o.modePaiement,
      modeCommande: o.modeCommande,
      pointsGagnes: calculerPointsGagnes(o.total),
    }));

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Erreur get orders client', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── PATCH /api/client/profile — Mise à jour du profil ────────────────────────
router.patch('/profile', requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const { nom, prenoms, telephone, email } = req.body as { nom?: string; prenoms?: string; telephone?: string; email?: string };

    if (!nom?.trim() || nom.trim().length > 100) {
      res.status(400).json({ success: false, message: 'Nom invalide (1–100 caractères requis).' });
      return;
    }
    if (prenoms !== undefined && prenoms.trim().length > 100) {
      res.status(400).json({ success: false, message: 'Prénom(s) trop long (max 100 caractères).' });
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      res.status(400).json({ success: false, message: 'Adresse email invalide.' });
      return;
    }
    if (telephone && telephone.length > 20) {
      res.status(400).json({ success: false, message: 'Numéro de téléphone trop long (max 20 caractères).' });
      return;
    }

    // Unicité email — exclure l'utilisateur courant
    const emailTaken = await User.findOne({ email: email.toLowerCase(), _id: { $ne: req.clientId } }).lean();
    if (emailTaken) {
      res.status(409).json({ success: false, message: 'Cette adresse email est déjà utilisée par un autre compte.' });
      return;
    }

    const updated = await User.findByIdAndUpdate(
      req.clientId,
      { $set: { nom: nom.trim(), prenoms: (prenoms || '').trim(), telephone: (telephone || '').trim(), email: email.toLowerCase() } },
      { new: true, runValidators: true }
    ).select('nom prenoms email telephone points tier');

    if (!updated) { res.status(404).json({ success: false, message: 'Compte introuvable.' }); return; }

    logger.info('Profil client mis à jour', { email: updated.email });
    res.json({
      success: true,
      message: 'Profil mis à jour avec succès.',
      data: {
        id: String(updated._id),
        nom: updated.nom,
        prenoms: updated.prenoms,
        email: updated.email,
        telephone: updated.telephone,
        points: updated.points,
        tier: updated.tier,
      },
    });
  } catch (error) {
    logger.error('Erreur update profile client', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du profil.' });
  }
});

// ── GET /api/client/preferences — Préférences alimentaires ───────────────────
router.get('/preferences', requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.clientId).select('preferences').lean();
    if (!user) { res.status(404).json({ success: false, message: 'Compte introuvable.' }); return; }
    res.json({ success: true, data: { preferences: user.preferences ?? [] } });
  } catch {
    res.status(500).json({ success: false, message: 'Erreur serveur.' });
  }
});

// ── PATCH /api/client/preferences — Mettre à jour les préférences ─────────────
const ALLOWED_PREFERENCES = [
  'vegetarien', 'vegan', 'sans_gluten', 'sans_lactose',
  'halal', 'sans_porc', 'low_carb', 'riche_proteines',
] as const;

router.patch('/preferences', requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const { preferences } = req.body as { preferences?: unknown };
    if (!Array.isArray(preferences)) {
      res.status(400).json({ success: false, message: 'preferences doit être un tableau.' });
      return;
    }
    const valid = (preferences as unknown[]).filter(
      (p): p is string => typeof p === 'string' && (ALLOWED_PREFERENCES as readonly string[]).includes(p)
    );
    const user = await User.findByIdAndUpdate(
      req.clientId,
      { $set: { preferences: valid } },
      { new: true }
    ).select('preferences');
    if (!user) { res.status(404).json({ success: false, message: 'Compte introuvable.' }); return; }
    res.json({ success: true, data: { preferences: user.preferences } });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Mise à jour échouée.', error: (error as Error).message });
  }
});

// ── POST /api/client/change-password — Changement de mot de passe ─────────────
router.post('/change-password', rateLimiter(5, 900, 'client-change-pwd'), requireClient, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'Mot de passe actuel et nouveau mot de passe requis.' });
      return;
    }

    const pwdError = validatePassword(newPassword);
    if (pwdError) { res.status(400).json({ success: false, message: pwdError }); return; }

    const user = await User.findById(req.clientId);
    if (!user || !user.password) {
      res.status(404).json({ success: false, message: 'Compte introuvable.' });
      return;
    }

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      res.status(401).json({ success: false, message: 'Mot de passe actuel incorrect.' });
      return;
    }

    if (currentPassword === newPassword) {
      res.status(400).json({ success: false, message: 'Le nouveau mot de passe doit être différent de l\'actuel.' });
      return;
    }

    user.password = newPassword;
    await user.save();

    logger.info('Mot de passe changé', { email: user.email });
    res.json({ success: true, message: 'Mot de passe mis à jour avec succès.' });
  } catch (error) {
    logger.error('Erreur change-password', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors du changement de mot de passe.' });
  }
});

export default router;
