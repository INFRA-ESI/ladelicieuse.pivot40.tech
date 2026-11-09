import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

// Les routes de paiement renvoient volontairement `error` : le frontend l'affiche à l'utilisateur
// (ex. « Paiement déjà en cours »). Elles gardent donc leur comportement.
const PUBLIC_ERROR_PREFIXES = ['/payments'];

/**
 * En production, retire des réponses d'erreur le champ `error` (message technique : doublon Mongo,
 * erreur de validation, etc.) et le journalise à la place. En développement, il reste visible pour déboguer.
 * À monter sur `/api` : `req.path` est alors relatif à ce point de montage.
 */
export function hideInternalErrors(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== 'production' || PUBLIC_ERROR_PREFIXES.some(p => req.path.startsWith(p))) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    if (res.statusCode >= 400 && body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      const { error: detail, ...publicBody } = body as { error: string } & Record<string, unknown>;
      logger.error('Erreur API', { method: req.method, path: req.originalUrl, status: res.statusCode, detail });
      return originalJson(publicBody);
    }
    return originalJson(body);
  };
  next();
}
