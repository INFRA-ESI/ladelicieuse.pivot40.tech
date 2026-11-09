import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface ClientRequest extends Request {
  clientId?:    string;
  clientEmail?: string;
  clientRole?:  string;
}

interface ClientPayload {
  id:    string;
  email: string;
  role:  string;
}

/**
 * Identifie le client s'il envoie un jeton valide, sans jamais refuser la requête :
 * sans jeton, ou avec un jeton invalide ou non client, la requête continue comme celle d'un invité.
 * Sert aux routes ouvertes à tous mais qui rattachent l'action au compte quand il est connu (commande).
 */
export function optionalClient(req: ClientRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const secret = process.env.JWT_SECRET;
  if (header?.startsWith('Bearer ') && secret) {
    try {
      const payload = jwt.verify(header.slice(7), secret) as ClientPayload;
      if (payload.role === 'client') {
        req.clientId    = payload.id;
        req.clientEmail = payload.email;
        req.clientRole  = payload.role;
      }
    } catch {
      // Jeton expiré ou falsifié : traité comme un invité.
    }
  }
  next();
}

export function requireClient(req: ClientRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Token manquant' });
    return;
  }

  const token = header.slice(7);
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET absent');

    const payload = jwt.verify(token, secret) as ClientPayload;
    if (payload.role !== 'client') {
      res.status(403).json({ success: false, message: 'Accès refusé' });
      return;
    }
    req.clientId    = payload.id;
    req.clientEmail = payload.email;
    req.clientRole  = payload.role;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalide ou expiré' });
  }
}
