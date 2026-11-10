import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { logger } from '../config/logger.js';

// Les images envoyées depuis le back office arrivent telles que l'appareil les a produites (jusqu'à plusieurs Mo).
// Le site demande `/uploads/photo.jpg?w=480` : on lui sert une copie WebP à cette largeur, fabriquée une seule fois
// puis gardée sur disque. Seules les largeurs de la liste sont acceptées, sinon n'importe qui pourrait remplir le disque.
export const VARIANT_WIDTHS = [96, 192, 320, 480, 640, 960, 1280, 1600] as const;
const SOURCE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const CACHE_DIR = '.cache';
const IMMUTABLE = 'public, max-age=31536000, immutable';

export const MAX_UPLOAD_SIDE = 1600;
const WEBP_QUALITY = 80;

// Chaque image n'est lue qu'une fois pour fabriquer sa copie : pas de cache interne (il garderait aussi les fichiers ouverts, ce qui bloque leur suppression sous Windows).
sharp.cache(false);

const inFlight = new Map<string, Promise<string>>();

const keyOf = (publicUrl: string): string => crypto.createHash('sha1').update(publicUrl).digest('hex').slice(0, 16);
const variantFile = (root: string, publicUrl: string, width: number): string =>
  path.join(root, CACHE_DIR, `${keyOf(publicUrl)}-${width}.webp`);

async function build(source: string, target: string, width: number): Promise<string> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const partial = `${target}.${process.pid}.tmp`;
  await sharp(source, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(partial);
  await fs.rename(partial, target);
  return target;
}

// Deux visiteurs qui demandent la même taille en même temps ne déclenchent qu'une seule fabrication.
function ensureVariant(source: string, target: string, width: number): Promise<string> {
  const pending = inFlight.get(target);
  if (pending) return pending;
  const job = build(source, target, width).finally(() => inFlight.delete(target));
  inFlight.set(target, job);
  return job;
}

export function variantMiddleware(root: string) {
  const base = path.resolve(root);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requested = req.query.w;
    if (requested === undefined) { next(); return; }

    const width = Number(requested);
    const ext = path.extname(req.path).toLowerCase();
    if (!(VARIANT_WIDTHS as readonly number[]).includes(width) || !SOURCE_EXT.has(ext)) { next(); return; }

    let relative: string;
    try { relative = decodeURIComponent(req.path); } catch { next(); return; }
    const source = path.resolve(base, `.${relative}`);
    if (!source.startsWith(base + path.sep) || source.includes(`${path.sep}${CACHE_DIR}${path.sep}`)) { next(); return; }

    try {
      const target = variantFile(base, `/uploads${relative}`, width);
      const ready = await fs.access(target).then(() => target, () => null);
      const file = ready ?? await ensureVariant(source, target, width);
      res.type('image/webp').set('Cache-Control', IMMUTABLE).sendFile(file, err => { if (err && !res.headersSent) next(); });
    } catch (error) {
      // Fichier absent ou illisible : on laisse le service de fichiers statiques répondre (404 ou original).
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') logger.warn('Variante d\'image impossible', { message: (error as Error).message });
      next();
    }
  };
}

/** Supprime les copies redimensionnées d'une image quand l'originale disparaît. */
export async function purgeVariants(root: string, publicUrl: string): Promise<void> {
  const dir = path.join(path.resolve(root), CACHE_DIR);
  const prefix = `${keyOf(publicUrl)}-`;
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  await Promise.all(names.filter(n => n.startsWith(prefix)).map(n => fs.unlink(path.join(dir, n)).catch(() => undefined)));
}

/**
 * Réduit une image envoyée : 1600 px maximum, WebP. Renvoie le chemin du fichier à garder
 * (l'original si la réduction n'apporte rien ou échoue).
 */
export async function shrinkUpload(filePath: string): Promise<string> {
  if (path.extname(filePath).toLowerCase() === '.gif') return filePath;
  const target = `${filePath.slice(0, filePath.length - path.extname(filePath).length)}.webp`;
  const partial = `${target}.tmp`;
  try {
    const original = await fs.stat(filePath);
    await sharp(filePath, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: MAX_UPLOAD_SIDE, height: MAX_UPLOAD_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(partial);
    const reduced = await fs.stat(partial);
    if (reduced.size >= original.size && target === filePath) { await fs.unlink(partial); return filePath; }
    await fs.rename(partial, target);
    if (target !== filePath) await fs.unlink(filePath).catch(() => undefined);
    return target;
  } catch (error) {
    await fs.unlink(partial).catch(() => undefined);
    logger.warn('Image gardée telle quelle (réduction impossible)', { message: (error as Error).message });
    return filePath;
  }
}
