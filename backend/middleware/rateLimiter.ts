import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../config/redis.js';
import type { ClientRequest } from './clientAuth.js';

// Derrière nginx, l'IP du visiteur est dans X-Forwarded-For. Pour qu'elle ne soit pas falsifiable,
// nginx doit l'écraser (proxy_set_header X-Forwarded-For $remote_addr) au lieu d'y ajouter la sienne.
export function clientIp(req: Request): string {
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function tooManyRequests(res: Response, retryAfterSeconds: number): void {
  res.setHeader('Retry-After', retryAfterSeconds);
  res.status(429).json({
    success: false,
    message: `Trop de tentatives. Réessayez dans ${retryAfterSeconds} seconde${retryAfterSeconds > 1 ? 's' : ''}.`,
    retryAfter: retryAfterSeconds,
  });
}

// ── Limiteur Redis : partagé entre instances, pour les routes de sécurité (OTP, mots de passe) ──
// Chaque requête coûte un aller-retour Upstash : à réserver aux routes où la fiabilité prime sur la latence.
export function rateLimiter(maxRequests: number, windowSeconds: number, label: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const redis = getRedis();
    if (!redis) { next(); return; } // Pas de Redis = pas de limitation (fail open)

    const key = `rl:${label}:${clientIp(req)}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));

      if (count > maxRequests) {
        tooManyRequests(res, await redis.ttl(key));
        return;
      }
    } catch {
      // Erreur Redis : on laisse passer (fail open)
    }

    next();
  };
}

// ── Limiteur mémoire : aucun appel réseau, pour les routes utilisateurs et le filet global ──
// Le compteur est propre au processus (une instance PM2) : suffisant contre les abus courants,
// pas contre un attaquant qui contournerait le processus.
interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000; // borne la mémoire si quelqu'un fait varier son IP à chaque requête

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000).unref();

interface MemoryLimiterOptions {
  /** Compte par client connecté (repli sur l'IP) plutôt que par IP : évite de pénaliser les IP partagées. */
  perUser?: boolean;
}

export function memoryRateLimiter(maxRequests: number, windowSeconds: number, label: string, options: MemoryLimiterOptions = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const owner = options.perUser ? (req as ClientRequest).clientId ?? clientIp(req) : clientIp(req);
    const key = `${label}:${owner}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
      bucket = { count: 0, resetAt: now + windowSeconds * 1000 };
      buckets.set(key, bucket);
    }
    bucket.count++;

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - bucket.count));

    if (bucket.count > maxRequests) {
      tooManyRequests(res, Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
      return;
    }
    next();
  };
}
