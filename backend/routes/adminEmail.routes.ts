import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import Settings from '../models/Settings.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { getRedis } from '../config/redis.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../config/logger.js';
import { getAdminEmail, isAdminPassword } from '../services/adminEmail.service.js';
import { sendAdminEmailChangeCode, sendAdminEmailChangedNotice } from '../services/email.service.js';

// Changer l'adresse de connexion revient à choisir qui reçoit les codes d'accès : c'est la porte d'entrée du back-office.
// On exige donc le mot de passe actuel, puis un code lu dans la NOUVELLE boîte (une faute de frappe ne peut pas verrouiller l'accès).
const PENDING_KEY = 'admin-email-change';
const PENDING_TTL_S = 10 * 60;
const MAX_ATTEMPTS = 5;

const RequestSchema = z.object({
  nouvelEmail: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(254),
  motDePasse:  z.string().min(1, 'Mot de passe requis').max(128),
});
const ConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code compte 6 chiffres'),
});

interface Pending { email: string; codeHash: string; attempts: number }

const hashCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex');
const sameHash = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Sans Redis on ne peut pas garder le code : on refuse plutôt que d'affaiblir la vérification.
function redisOr503(res: Response) {
  const redis = getRedis();
  if (!redis) {
    logger.error('Redis indisponible — changement d\'adresse administrateur refusé (fail closed)');
    res.status(503).json({ success: false, message: 'Service temporairement indisponible. Réessayez dans quelques instants.' });
  }
  return redis;
}

const router = Router();

// ── GET /api/settings/email — adresse de connexion actuelle ───────────────────
router.get('/', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { email: await getAdminEmail() } });
  } catch (error) {
    logger.error('GET /settings/email error', { message: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /api/settings/email/request — envoie un code à la nouvelle adresse ───
router.post('/request', verifyJWT, rateLimiter(5, 900, 'admin-email-request'), validate(RequestSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { nouvelEmail, motDePasse } = req.body as z.infer<typeof RequestSchema>;

    if (!(await isAdminPassword(motDePasse))) {
      // 403 et non 401 : le client admin déconnecte sur tout 401, une erreur de saisie ne doit pas fermer la session.
      res.status(403).json({ success: false, message: 'Mot de passe actuel incorrect' });
      return;
    }
    if (nouvelEmail === await getAdminEmail()) {
      res.status(400).json({ success: false, message: "C'est déjà l'adresse de connexion actuelle" });
      return;
    }

    const redis = redisOr503(res);
    if (!redis) return;

    const code = crypto.randomInt(100000, 1000000).toString();
    const pending: Pending = { email: nouvelEmail, codeHash: hashCode(code), attempts: 0 };
    await redis.set(PENDING_KEY, JSON.stringify(pending), { ex: PENDING_TTL_S });

    try {
      await sendAdminEmailChangeCode(nouvelEmail, code);
    } catch (mailError) {
      await redis.del(PENDING_KEY).catch(() => undefined);
      const { code: smtpCode, command, message } = mailError as NodeJS.ErrnoException & { command?: string };
      logger.error('Envoi du code de changement d\'adresse impossible (SMTP)', { code: smtpCode, command, message });
      res.status(502).json({ success: false, message: "Impossible d'envoyer le code à cette adresse. Vérifiez-la et réessayez." });
      return;
    }

    res.json({ success: true, message: `Code envoyé à ${nouvelEmail}`, expiresIn: PENDING_TTL_S });
  } catch (error) {
    logger.error('POST /settings/email/request error', { message: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /api/settings/email/confirm — valide le code et change l'adresse ─────
router.post('/confirm', verifyJWT, rateLimiter(10, 900, 'admin-email-confirm'), validate(ConfirmSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body as z.infer<typeof ConfirmSchema>;
    const redis = redisOr503(res);
    if (!redis) return;

    const raw = await redis.get<string | Pending>(PENDING_KEY);
    if (!raw) {
      res.status(400).json({ success: false, message: 'Aucune demande en cours ou code expiré. Refaites une demande.' });
      return;
    }
    const pending = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Pending;

    if (pending.attempts >= MAX_ATTEMPTS) {
      await redis.del(PENDING_KEY);
      res.status(400).json({ success: false, message: 'Trop de tentatives. Refaites une demande.' });
      return;
    }
    if (!sameHash(hashCode(code), pending.codeHash)) {
      const attempts = pending.attempts + 1;
      const ttl = await redis.ttl(PENDING_KEY);
      await redis.set(PENDING_KEY, JSON.stringify({ ...pending, attempts }), { ex: Math.max(ttl, 1) });
      res.status(400).json({ success: false, message: `Code incorrect. ${Math.max(MAX_ATTEMPTS - attempts, 0)} tentative(s) restante(s).` });
      return;
    }

    const previous = await getAdminEmail();
    // Le code ne sert qu'une fois, même si l'enregistrement échoue juste après.
    await redis.del(PENDING_KEY);

    const settings = (await Settings.findOne()) ?? new Settings();
    settings.adminEmail = pending.email;
    await settings.save();

    // Un code de connexion déjà envoyé à l'ancienne adresse ne doit plus ouvrir l'accès.
    await redis.del(`otp:${previous}`).catch(() => undefined);
    await logAction(`Adresse de connexion administrateur modifiée (${previous} → ${pending.email})`, 'parametre', 'Admin');

    sendAdminEmailChangedNotice(previous, pending.email).catch(mailError =>
      logger.warn('Avis de changement d\'adresse non envoyé', { message: (mailError as Error).message }));

    res.json({ success: true, message: 'Adresse de connexion mise à jour', data: { email: pending.email } });
  } catch (error) {
    logger.error('POST /settings/email/confirm error', { message: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

export default router;
