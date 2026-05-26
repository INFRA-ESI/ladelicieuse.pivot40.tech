import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import Settings, { ZONES_DEFAULT, SLOTS_DEFAULT } from '../models/Settings.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';

const router = Router();

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
    } = settings;
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: {
      zonesLivraison, creneauxLivraison, etapesConsultation, etapesAbonnement,
      nom, tel, adresse, email, ouverture, fermeture,
      dieteticienNom, dieteticienTitre, dieteticienBio, dieteticienExperience, dieteticienCredentials, dieteticienPhoto,
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
    const forbidden = ['adminPasswordHash', '_id', '__v', 'createdAt', 'updatedAt'];
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

    const pwdRules = [
      nouveauMotDePasse.length >= 8,
      /[A-Z]/.test(nouveauMotDePasse),
      /[0-9]/.test(nouveauMotDePasse),
      /[^a-zA-Z0-9]/.test(nouveauMotDePasse),
    ];
    if (!pwdRules.every(Boolean)) {
      res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial.' });
      return;
    }

    const settings = await Settings.findOne().select('+adminPasswordHash');

    let currentIsValid = false;

    if (settings?.adminPasswordHash) {
      currentIsValid = await bcrypt.compare(motDePasseActuel, settings.adminPasswordHash);
    } else {
      // Fallback: plain-text env var
      const envPassword = process.env.ADMIN_PASSWORD || 'admin123';
      currentIsValid = motDePasseActuel === envPassword;
    }

    if (!currentIsValid) {
      res.status(401).json({ success: false, message: 'Mot de passe actuel incorrect' });
      return;
    }

    const hash = await bcrypt.hash(nouveauMotDePasse, 12);

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
