import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../config/redis.js';

// Clé normalisée : pathname + query params triés alphabétiquement + longueur bornée
// Protège contre : injection null byte, cache flooding par URL longue, dédoublonnage de params
function buildCacheKey(req: Request): string {
  const sortedQuery = Object.keys(req.query)
    .sort()
    .filter(k => /^[\w.-]+$/.test(k))
    .map(k => `${k}=${String(req.query[k]).replace(/\0/g, '').slice(0, 100)}`)
    .join('&');
  // Chemin complet (baseUrl + path) pour que les préfixes d'invalidateCache correspondent.
  // req.path seul est relatif au point de montage du routeur (ex. '/all' au lieu de '/api/categories/all').
  const fullPath = (req.baseUrl || '') + req.path;
  const raw = fullPath + (sortedQuery ? `?${sortedQuery}` : '');
  return `cache:${raw.slice(0, 200)}`;
}

export function cache(ttlSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const redis = getRedis();
    if (!redis) { next(); return; }

    const key = buildCacheKey(req);

    try {
      const cached = await redis.get<string>(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.json(typeof cached === 'string' ? JSON.parse(cached) : cached);
        return;
      }
    } catch {
      next(); return;
    }

    // Intercepter res.json pour mettre en cache la réponse
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        redis.set(key, JSON.stringify(body), { ex: ttlSeconds }).catch(() => {});
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

export async function invalidateCache(...prefixes: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    for (const prefix of prefixes) {
      const pattern = `cache:${prefix}*`;
      let cursor = 0;
      do {
        const [next, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
        cursor = Number(next);
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== 0);
    }
  } catch {
    // Le cache est facultatif : une erreur Redis ne doit jamais faire échouer la requête.
  }
}
