import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import Settings, { ZONES_DEFAULT, SLOTS_DEFAULT } from '../models/Settings.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { passwordError } from '../utils/password.js';
import adminEmailRoutes from './adminEmail.routes.js';
import { isAdminPassword } from '../services/adminEmail.service.js';

const router = Router();

// Adresse de connexion de l'administrateur : routes dédiées (mot de passe + code de confirmation), jamais via le PATCH général.
router.use('/email', adminEmailRoutes);

const CACHE_KEY = 'settings:main';

async function invalidateSettingsCache() {
  const redis = getRedis();
  if (redis) await redis.del(CACHE_KEY);
}

// ── GET /api/settings/public — No auth required ───────────────────────────────
router.get('/public', async (_req: Request, res: Response): Promise<void> => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    // Migration : document existant avant l'ajout des défauts
    let dirty = false;
    if (settings.zonesLivraison.length === 0)    { settings.zonesLivraison    = ZONES_DEFAULT as typeof settings.zonesLivraison; dirty = true; }
    if (settings.creneauxLivraison.length === 0) { settings.creneauxLivraison = [...SLOTS_DEFAULT];                               dirty = true; }
    if (dirty) await settings.save();

    const {
      zonesLivraison, creneauxLivraison, etapesConsultation, etapesAbonnement,
      nom, tel, adresse, email, ouverture, fermeture,
      dieteticienNom, dieteticienTitre, dieteticienBio, dieteticienExperience, dieteticienCredentials, dieteticienPhoto,
      videoPresentation,
    } = settings;
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: {
      zonesLivraison, creneauxLivraison, etapesConsultation, etapesAbonnement,
      nom, tel, adresse, email, ouverture, fermeture,
      dieteticienNom, dieteticienTitre, dieteticienBio, dieteticienExperience, dieteticienCredentials, dieteticienPhoto,
      videoPresentation,
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /api/settings ─────────────────────────────────────────────────────────
router.get('/', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const redis = getRedis();
    if (redis) {
      const cached = await redis.get<object>(CACHE_KEY);
      if (cached) { res.json({ success: true, data: cached }); return; }
    }

    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    if (redis) await redis.set(CACHE_KEY, settings.toObject(), { ex: 600 });

    res.json({ success: true, data: settings });
  } catch (error) {
    logger.error('GET /settings error', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── PATCH /api/settings ───────────────────────────────────────────────────────
router.patch('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const forbidden = ['adminPasswordHash', 'adminEmail', '_id', '__v', 'createdAt', 'updatedAt'];
    const update = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => !forbidden.includes(k))
    );

    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    Object.assign(settings, update);
    await settings.save();

    await invalidateSettingsCache();

    await logAction(`Paramètres mis à jour (${Object.keys(update).join(', ')})`, 'parametre', 'Admin');

    res.json({ success: true, message: 'Paramètres enregistrés', data: settings });
  } catch (error) {
    logger.error('PATCH /settings error', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /api/settings/password ───────────────────────────────────────────────
router.post('/password', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { motDePasseActuel, nouveauMotDePasse } = req.body;

    if (!motDePasseActuel || !nouveauMotDePasse) {
      res.status(400).json({ success: false, message: 'Les deux mots de passe sont requis' });
      return;
    }

    const pwdError = passwordError(nouveauMotDePasse);
    if (pwdError) {
      res.status(400).json({ success: false, message: pwdError });
      return;
    }

    const currentIsValid = await isAdminPassword(motDePasseActuel);

    if (!currentIsValid) {
      // 403 et non 401 : le client admin déconnecte sur tout 401, une erreur de saisie ne doit pas fermer la session.
      res.status(403).json({ success: false, message: 'Mot de passe actuel incorrect' });
      return;
    }

    const hash = await bcrypt.hash(nouveauMotDePasse, 12);
    const settings = await Settings.findOne().select('+adminPasswordHash');

    if (settings) {
      settings.adminPasswordHash = hash;
      await settings.save();
    } else {
      await Settings.create({ adminPasswordHash: hash });
    }

    await logAction('Mot de passe administrateur modifié via back-office', 'parametre', 'Admin');

    res.json({ success: true, message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    logger.error('POST /settings/password error', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

export default router;
