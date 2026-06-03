import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { verifyJWT } from './auth.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Vérification des magic bytes (signature binaire réelle du fichier) ─────────
// Ces octets sont définis par la spec de chaque format — impossibles à falsifier
// via le header HTTP Content-Type.
const MAGIC_CHECKS: Array<{ label: string; check: (buf: Buffer) => boolean }> = [
  {
    label: 'JPEG',
    check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    label: 'PNG',
    check: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    label: 'GIF',
    // GIF87a ou GIF89a
    check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    label: 'WebP',
    // RIFF....WEBP
    check: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

async function isRealImage(filePath: string): Promise<boolean> {
  try {
    // 12 octets suffisent pour tous les formats ci-dessus
    const fd  = await fs.promises.open(filePath, 'r');
    const buf = Buffer.alloc(12);
    await fd.read(buf, 0, 12, 0);
    await fd.close();
    return MAGIC_CHECKS.some(({ check }) => check(buf));
  } catch {
    return false;
  }
}

// ── Vérification magic bytes vidéo ───────────────────────────────────────────
const VIDEO_MAGIC_CHECKS: Array<{ label: string; check: (buf: Buffer) => boolean }> = [
  {
    label: 'MP4/MOV',
    // Box ISO ftyp : octets 4-7 = 0x66 0x74 0x79 0x70 ('ftyp') — couvre MP4, MOV, M4V
    check: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  },
  {
    label: 'WebM',
    // En-tête EBML : octets 0-3 = 0x1A 0x45 0xDF 0xA3
    check: (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
  },
];

async function isRealVideo(filePath: string): Promise<boolean> {
  try {
    const fd  = await fs.promises.open(filePath, 'r');
    const buf = Buffer.alloc(12);
    await fd.read(buf, 0, 12, 0);
    await fd.close();
    return VIDEO_MAGIC_CHECKS.some(({ check }) => check(buf));
  } catch {
    return false;
  }
}

// ── Stockage Multer ───────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Nom aléatoire — l'extension d'origine n'est jamais conservée telle quelle
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (_req, file, cb) => {
    // Première barrière : le MIME type déclaré (facile à bypasser, mais filtre les erreurs courantes)
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images JPEG, PNG, WebP et GIF sont acceptées'));
    }
  },
});

// ── Multer vidéo — limite 200 Mo, formats MP4 / WebM / MOV ──────────────────
const videoUpload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^video\/(mp4|webm|quicktime)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers MP4, WebM et MOV sont acceptés'));
    }
  },
});

const router = Router();

// ── POST /api/upload — Image ──────────────────────────────────────────────────
router.post('/', verifyJWT, upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Aucun fichier reçu' });
    return;
  }

  // Deuxième barrière : vérification des magic bytes réels du fichier
  const valid = await isRealImage(req.file.path);
  if (!valid) {
    // Supprimer le fichier malveillant immédiatement
    fs.unlink(req.file.path, () => {});
    res.status(400).json({
      success: false,
      message: 'Le fichier ne correspond pas à une image valide.',
    });
    return;
  }

  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, url });
});

// ── POST /api/upload/video — Vidéo de présentation ───────────────────────────
router.post('/video', verifyJWT, videoUpload.single('video'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Aucun fichier reçu' });
    return;
  }

  const valid = await isRealVideo(req.file.path);
  if (!valid) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ success: false, message: 'Le fichier ne correspond pas à une vidéo MP4, WebM ou MOV valide.' });
    return;
  }

  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, url });
});

// ── DELETE /api/upload — Suppression d'un fichier uploadé (nettoyage) ─────────
router.delete('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const { url } = req.body as { url?: string };

  if (!url || typeof url !== 'string' || !url.startsWith('/uploads/')) {
    res.status(400).json({ success: false, message: 'URL invalide' });
    return;
  }

  // Résolution absolue pour prévenir tout path traversal
  const filename = path.basename(url);
  const filePath = path.resolve(UPLOAD_DIR, filename);
  if (!filePath.startsWith(path.resolve(UPLOAD_DIR))) {
    res.status(400).json({ success: false, message: 'Chemin non autorisé' });
    return;
  }

  try {
    await fs.promises.unlink(filePath);
  } catch {
    // Le fichier n'existe plus — non bloquant
  }

  res.json({ success: true });
});

export default router;
