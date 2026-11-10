import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import User from '../models/User.model.js';
import { requireClient, type ClientRequest } from '../middleware/clientAuth.js';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';
import { detectImageType, IMAGE_EXTENSION } from '../utils/imageType.js';
import { logger } from '../config/logger.js';
import { purgeVariants } from '../services/imageVariants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 2 * 1024 * 1024;
const PUBLIC_PREFIX = '/uploads/avatars/';

// Lu à chaque appel pour pouvoir pointer ailleurs (tests).
const avatarDir = () => process.env.AVATAR_DIR ?? path.join(__dirname, '..', 'public', 'uploads', 'avatars');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });
const limit = memoryRateLimiter(20, 3600, 'client-avatar', { perUser: true });

// Supprime l'ancien fichier, mais seulement s'il est bien dans le dossier des photos de profil.
async function removeStored(url: string | undefined): Promise<void> {
  if (!url?.startsWith(PUBLIC_PREFIX)) return;
  const file = path.resolve(avatarDir(), path.basename(url));
  if (!file.startsWith(path.resolve(avatarDir()))) return;
  await fs.unlink(file).catch(() => undefined);
  await purgeVariants(path.join(__dirname, '..', 'public', 'uploads'), `${PUBLIC_PREFIX}${path.basename(url)}`);
}

function receive(req: ClientRequest, res: Response, next: NextFunction): void {
  upload.single('avatar')(req, res, err => {
    if (!err) { next(); return; }
    const tooBig = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({ success: false, message: tooBig ? 'Photo trop lourde (2 Mo maximum).' : 'Fichier illisible.' });
  });
}

const router = Router();

// ── PUT /api/client/avatar — Remplace la photo de profil ─────────────────────
router.put('/', requireClient, limit, receive, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) { res.status(400).json({ success: false, message: 'Aucune photo reçue.' }); return; }
    const type = detectImageType(file.buffer);
    if (!type) { res.status(400).json({ success: false, message: 'Le fichier doit être une image JPEG, PNG ou WebP.' }); return; }

    const user = await User.findById(req.clientId).select('avatar');
    if (!user) { res.status(404).json({ success: false, message: 'Compte introuvable.' }); return; }

    // Nom aléatoire : jamais celui du fichier envoyé, et il change à chaque envoi (pas de cache périmé).
    const name = `${String(req.clientId)}-${crypto.randomBytes(6).toString('hex')}.${IMAGE_EXTENSION[type]}`;
    await fs.mkdir(avatarDir(), { recursive: true });
    await fs.writeFile(path.join(avatarDir(), name), file.buffer);

    const previous = user.avatar;
    user.avatar = `${PUBLIC_PREFIX}${name}`;
    await user.save();
    await removeStored(previous);

    res.json({ success: true, data: { avatar: user.avatar } });
  } catch (error) {
    logger.error('Envoi photo de profil impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: "La photo n'a pas pu être enregistrée." });
  }
});

// ── DELETE /api/client/avatar — Retire la photo ──────────────────────────────
router.delete('/', requireClient, limit, async (req: ClientRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.clientId).select('avatar');
    if (!user) { res.status(404).json({ success: false, message: 'Compte introuvable.' }); return; }
    const previous = user.avatar;
    user.avatar = '';
    await user.save();
    await removeStored(previous);
    res.json({ success: true, data: { avatar: '' } });
  } catch (error) {
    logger.error('Suppression photo de profil impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: "La photo n'a pas pu être retirée." });
  }
});

export default router;
