import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { sendLoginOTPEmail, sendAdminPasswordResetEmail } from '../services/email.service.js';
import { logAction } from '../models/HistoryLog.model.js';
import { getRedis } from '../config/redis.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import Settings from '../models/Settings.model.js';
import { logger } from '../config/logger.js';
import { primaryFrontendUrl } from '../config/frontendUrl.js';
import { passwordSchema, loginPasswordError } from '../utils/password.js';
import { getAdminEmail } from '../services/adminEmail.service.js';

const RequestOTPSchema = z.object({
  email:    z.string().email('Email invalide').max(254),
  password: z.string().min(1, 'Mot de passe requis').max(128),
});

const VerifyOTPSchema = z.object({
  email: z.string().email('Email invalide').max(254),
  otp:   z.string().regex(/^\d{6}$/, 'OTP doit être un code à 6 chiffres'),
});

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET manquant dans les variables d\'environnement.');
if (JWT_SECRET.length < 32) {
  logger.warn('[Auth] JWT_SECRET trop court (< 32 chars). Utilisez au minimum 64 caractères hex aléatoires en production.');
}
const OTP_EXPIRY_S = 5 * 60; // 5 minutes en secondes

const validCredentials = {
  name:     'Administrateur',
  role:     'admin',
};

function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

// ── Helpers OTP (Redis uniquement — fail closed) ──────────────────────────────
// Si Redis est indisponible, on lève une erreur plutôt que de stocker en mémoire
// (fail closed : mieux valoir un 503 qu'une sécurité dégradée silencieusement).

function requireRedis() {
  const redis = getRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  return redis;
}

// Réponse commune aux échecs d'une route d'authentification : Redis indisponible → 503 (fail closed),
// toute autre erreur → 500 journalisé, sans détail technique pour le client.
function failAuth(res: Response, error: unknown, route: string, message: string): void {
  if (error instanceof Error && error.message === 'REDIS_UNAVAILABLE') {
    logger.error(`Redis indisponible — ${route} refusé (fail closed)`);
    res.status(503).json({ success: false, message: 'Service temporairement indisponible. Réessayez dans quelques instants.' });
    return;
  }
  logger.error(`Erreur ${route}`, {
    name:    error instanceof Error ? error.name : undefined,
    message: error instanceof Error ? error.message : String(error),
  });
  res.status(500).json({ success: false, message });
}

async function storeOTP(email: string, otp: string): Promise<void> {
  const redis = requireRedis();
  await redis.set(`otp:${email}`, JSON.stringify({ otp, attempts: 0 }), { ex: OTP_EXPIRY_S });
}

async function getOTP(email: string): Promise<{ otp: string; attempts: number } | null> {
  const redis = requireRedis();
  const raw = await redis.get<string>(`otp:${email}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function incrementAttempts(email: string): Promise<number> {
  const redis = requireRedis();
  const raw = await redis.get<string>(`otp:${email}`);
  if (!raw) return 99;
  const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { otp: string; attempts: number };
  data.attempts += 1;
  const ttl = await redis.ttl(`otp:${email}`);
  await redis.set(`otp:${email}`, JSON.stringify(data), { ex: Math.max(ttl, 1) });
  return data.attempts;
}

async function deleteOTP(email: string): Promise<void> {
  const redis = requireRedis();
  await redis.del(`otp:${email}`);
}

// ── POST /api/auth/request-otp ────────────────────────────────────────────────
router.post(
  '/request-otp',
  rateLimiter(3, 900, 'otp-request'), // 3 tentatives / 15 min / IP
  validate(RequestOTPSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { password } = req.body as z.infer<typeof RequestOTPSchema>;
      const email = (req.body as z.infer<typeof RequestOTPSchema>).email.trim().toLowerCase();

      if (email !== await getAdminEmail()) {
        res.status(401).json({ success: false, message: 'Identifiants invalides' });
        return;
      }

      // Vérification bcrypt uniquement — jamais de comparaison en clair
      const settings = await Settings.findOne().select('+adminPasswordHash');
      if (!settings?.adminPasswordHash) {
        // Le hash n'a pas encore été initialisé (ne devrait pas arriver après le seed au démarrage)
        res.status(503).json({ success: false, message: 'Service temporairement indisponible. Réessayez dans quelques secondes.' });
        return;
      }
      const passwordOk = await bcrypt.compare(password, settings.adminPasswordHash);
      if (!passwordOk) {
        res.status(401).json({ success: false, message: 'Identifiants invalides' });
        return;
      }

      // Même règle que pour les clients, vérifiée APRÈS le contrôle du mot de passe : aucun code n'est envoyé tant que le
      // mot de passe ne la respecte pas. La sortie de secours est « Mot de passe oublié » (lien envoyé par e-mail).
      const strengthError = loginPasswordError(password);
      if (strengthError) {
        res.status(403).json({ success: false, passwordWeak: true, message: strengthError });
        return;
      }

      const otp = generateOTP();
      await storeOTP(email, otp);

      try {
        await sendLoginOTPEmail(email, otp);
      } catch (mailError) {
        // Un OTP que personne ne peut lire ne doit pas rester valide.
        await deleteOTP(email).catch(() => undefined);
        const { code, command, message } = mailError as NodeJS.ErrnoException & { command?: string };
        logger.error('Envoi email OTP impossible (SMTP)', { code, command, message });
        res.status(502).json({ success: false, message: "Impossible d'envoyer le code par email. Réessayez dans quelques instants." });
        return;
      }
      logger.info('OTP envoyé', { email });

      res.json({
        success: true,
        message: `Code de vérification envoyé à ${email}`,
        expiresIn: OTP_EXPIRY_S,
      });
    } catch (error) {
      failAuth(res, error, 'request-otp', "Erreur lors de la génération de l'OTP");
    }
  }
);

// ── POST /api/auth/verify-otp ─────────────────────────────────────────────────
// 10 tentatives / 15 min / IP — stoppe le bruteforce des 1M combinaisons OTP
router.post('/verify-otp', rateLimiter(10, 900, 'otp-verify'), validate(VerifyOTPSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { otp } = req.body as z.infer<typeof VerifyOTPSchema>;
    const email = (req.body as z.infer<typeof VerifyOTPSchema>).email.trim().toLowerCase();
    const stored = await getOTP(email);

    if (!stored) {
      res.status(400).json({ success: false, message: 'Aucun OTP en attente pour cet email' });
      return;
    }

    if (stored.attempts >= 3) {
      await deleteOTP(email);
      res.status(400).json({ success: false, message: 'Trop de tentatives échouées. Demandez un nouvel OTP.' });
      return;
    }

    const otpString    = String(otp).trim();
    const storedString = String(stored.otp).trim();

    if (otpString !== storedString) {
      const attempts = await incrementAttempts(email);
      logger.warn('OTP invalide', { email, attempts });
      res.status(401).json({
        success: false,
        message: `OTP invalide. ${3 - attempts} tentatives restantes.`,
      });
      return;
    }

    await deleteOTP(email);

    const user = {
      id:    crypto.randomUUID(),
      email,
      name:  validCredentials.name,
      role:  validCredentials.role,
    };

    const token = jwt.sign({ ...user, jti: crypto.randomUUID() }, JWT_SECRET, { expiresIn: '24h' });
    logger.info('Authentification réussie', { email });

    res.json({ success: true, message: 'Connexion réussie', token, user });
  } catch (error) {
    failAuth(res, error, 'verify-otp', "Erreur lors de la vérification de l'OTP");
  }
});

// ── Mot de passe admin oublié ─────────────────────────────────────────────────
// Le lien part vers la même adresse que l'OTP : qui reçoit l'OTP peut déjà accéder au compte.
// Le jeton n'est stocké que haché (Redis, 30 min) et consommé atomiquement à la première utilisation.
const RESET_EXPIRY_S = 30 * 60;

const ForgotPasswordSchema = z.object({
  email: z.string().email('Email invalide').max(254),
});

const ResetPasswordSchema = z.object({
  token:    z.string().regex(/^[a-f0-9]{64}$/, 'Lien invalide'),
  password: passwordSchema,
});

const hashResetToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
router.post(
  '/forgot-password',
  rateLimiter(3, 900, 'admin-forgot'),
  validate(ForgotPasswordSchema),
  async (req: Request, res: Response): Promise<void> => {
    // Même réponse que l'adresse soit la bonne ou non : on ne révèle pas l'e-mail du compte admin.
    const neutral = { success: true, message: "Si cette adresse correspond au compte administrateur, un lien de réinitialisation vient d'être envoyé." };
    try {
      const email = (req.body as z.infer<typeof ForgotPasswordSchema>).email.trim().toLowerCase();
      if (email !== await getAdminEmail()) { res.json(neutral); return; }

      // Jamais l'en-tête Origin/Host de la requête : il permettrait d'envoyer un lien piégé à l'admin.
      const baseUrl = primaryFrontendUrl()
        ?? (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:5100');
      if (!baseUrl) {
        logger.error('forgot-password impossible : FRONTEND_URL non défini en production');
        res.status(503).json({ success: false, message: 'Service temporairement indisponible. Contactez le support.' });
        return;
      }

      const token = crypto.randomBytes(32).toString('hex');
      const key   = `admin-reset:${hashResetToken(token)}`;
      await requireRedis().set(key, email, { ex: RESET_EXPIRY_S });

      try {
        await sendAdminPasswordResetEmail(email, `${baseUrl}/admin/reset-password?token=${token}`);
        logger.info('Lien de réinitialisation admin envoyé');
      } catch (mailError) {
        await requireRedis().del(key).catch(() => undefined);
        const { code, command, message } = mailError as NodeJS.ErrnoException & { command?: string };
        logger.error('Envoi email réinitialisation admin impossible (SMTP)', { code, command, message });
      }
      res.json(neutral);
    } catch (error) {
      failAuth(res, error, 'forgot-password', 'Erreur lors de la demande de réinitialisation');
    }
  }
);

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
router.post(
  '/reset-password',
  rateLimiter(5, 900, 'admin-reset'),
  validate(ResetPasswordSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, password } = req.body as z.infer<typeof ResetPasswordSchema>;

      // getdel : lecture + suppression atomiques, un même lien ne peut servir qu'une fois.
      const email = await requireRedis().getdel<string>(`admin-reset:${hashResetToken(token)}`);
      if (!email) {
        res.status(400).json({ success: false, message: 'Lien invalide ou expiré. Refaites une demande.' });
        return;
      }

      const hash     = await bcrypt.hash(password, 12);
      const settings = await Settings.findOne().select('+adminPasswordHash');
      if (settings) {
        settings.adminPasswordHash = hash;
        await settings.save();
      } else {
        await Settings.create({ adminPasswordHash: hash });
      }

      await deleteOTP(email); // un OTP émis avec l'ancien mot de passe ne doit plus servir
      await logAction('Mot de passe administrateur réinitialisé (mot de passe oublié)', 'parametre', 'Admin');
      res.json({ success: true, message: 'Mot de passe mis à jour. Vous pouvez vous connecter.' });
    } catch (error) {
      failAuth(res, error, 'reset-password', 'Erreur lors de la réinitialisation');
    }
  }
);

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
// Blackliste le token courant dans Redis — invalide le JWT avant son expiration naturelle.
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { jti?: string; exp?: number };
        const redis = getRedis();
        if (redis && decoded.jti) {
          const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 86400;
          if (ttl > 0) await redis.set(`blacklist:${decoded.jti}`, '1', { ex: ttl });
        }
      } catch {
        // Token déjà expiré ou invalide — logout propre quand même
      }
    }
    res.json({ success: true, message: 'Déconnecté avec succès' });
  } catch (error) {
    logger.error('Erreur logout', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, message: 'Erreur lors de la déconnexion' });
  }
});

// ── POST /api/auth/refresh-token ──────────────────────────────────────────────
router.post('/refresh-token', (req: Request, res: Response): void => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ success: false, message: 'Token manquant' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    const newToken = jwt.sign(
      { id: decoded.id, email: decoded.email, name: decoded.name, role: decoded.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Token renouvelé',
      token: newToken,
      user: { id: decoded.id, email: decoded.email, name: decoded.name, role: decoded.role },
    });
  } catch (error) {
    logger.error('Erreur refresh-token', { error: error instanceof Error ? error.message : String(error) });
    res.status(401).json({
      success: false,
      message: 'Token invalide ou expiré',
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    });
  }
});

// ── Middleware JWT admin ───────────────────────────────────────────────────────
interface AdminPayload {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const verifyJWT = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ success: false, message: 'Token manquant' }); return; }

    const decoded = jwt.verify(token, JWT_SECRET) as AdminPayload & { jti?: string };

    if (decoded.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Accès réservé aux administrateurs' });
      return;
    }

    // Vérifier la blacklist Redis (tokens révoqués au logout)
    if (decoded.jti) {
      const redis = getRedis();
      if (redis) {
        const blacklisted = await redis.get(`blacklist:${decoded.jti}`);
        if (blacklisted) {
          res.status(401).json({ success: false, message: 'Session expirée. Reconnectez-vous.' });
          return;
        }
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Token invalide ou expiré',
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    });
  }
};

export default router;
