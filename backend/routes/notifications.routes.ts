import { Router, Request, Response } from 'express';
import { sendWhatsAppNotification, sendWhatsAppBroadcast } from '../services/whatsapp.service.js';
import { sendPushBroadcast } from '../services/push.service.js';
import { sendBroadcastEmail } from '../services/email.service.js';
import { verifyJWT } from './auth.routes.js';
import { requireClient, type ClientRequest } from '../middleware/clientAuth.js';
import { rateLimiter, memoryRateLimiter } from '../middleware/rateLimiter.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import PushSubscription from '../models/PushSubscription.model.js';
import User from '../models/User.model.js';
import FideliteTransaction from '../models/FideliteTransaction.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { logger } from '../config/logger.js';

const router = Router();

// ── POST /api/notifications/whatsapp/order ────────────────────────────────────
router.post('/whatsapp/order', rateLimiter(20, 60, 'wa-order'), async (req: Request, res: Response): Promise<void> => {
  const { orderId, customerName, customerPhone, items, total, modePaiement } = req.body;

  if (!orderId || !customerName || !items || !total) {
    res.status(400).json({ success: false, message: 'Champs requis manquants' });
    return;
  }

  try {
    const result = await sendWhatsAppNotification({
      orderId,
      customerName,
      customerPhone: customerPhone ?? '',
      items:         items ?? [],
      total,
      modePaiement:  modePaiement ?? 'Non précisé',
    });
    res.json({ success: result.success, method: result.method });
  } catch (err: unknown) {
    logger.error('[Notification] WhatsApp order error', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Erreur envoi notification' });
  }
});

// ── POST /api/notifications/whatsapp/broadcast — Admin ────────────────────────
router.post('/whatsapp/broadcast', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const { message, segment } = req.body as { message: string; segment?: 'all' | 'bronze' | 'argent' | 'or' | 'platine' };

  if (!message || !message.trim()) {
    res.status(400).json({ success: false, message: 'Message requis' });
    return;
  }

  try {
    const filter: Record<string, unknown> = { statut: 'actif', telephone: { $nin: ['', null] } };
    if (segment && segment !== 'all') filter.tier = segment;

    const users = await User.find(filter).select('telephone nom').lean();
    const phones = users.map(u => u.telephone).filter(Boolean);

    if (phones.length === 0) {
      res.json({ success: true, sent: 0, failed: 0, message: 'Aucun destinataire trouvé' });
      return;
    }

    const result = await sendWhatsAppBroadcast(phones, message);
    await logAction(
      `Broadcast WhatsApp — segment: ${segment ?? 'all'} — ${result.sent} envoyés / ${result.failed} échecs`,
      'notification',
      'Admin',
    );
    res.json({ success: true, ...result, total: phones.length });
  } catch (err: unknown) {
    logger.error('[Broadcast] WhatsApp error', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Erreur broadcast' });
  }
});

// ── POST /api/notifications/email/broadcast — Admin ──────────────────────────
router.post('/email/broadcast', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const { subject, message, segment } = req.body as {
    subject: string; message: string; segment?: 'all' | 'bronze' | 'argent' | 'or' | 'platine';
  };

  if (!subject || !subject.trim() || !message || !message.trim()) {
    res.status(400).json({ success: false, message: 'Objet et message requis' });
    return;
  }

  try {
    const filter: Record<string, unknown> = { statut: 'actif', email: { $nin: ['', null] } };
    if (segment && segment !== 'all') filter.tier = segment;

    const users = await User.find(filter).select('email nom').lean();

    if (users.length === 0) {
      res.json({ success: true, sent: 0, failed: 0, total: 0, message: 'Aucun destinataire trouvé' });
      return;
    }

    // 3 envois à la fois, comme le pool SMTP (maxConnections: 3), avec 200 ms entre deux envois d'un même
    // fil : on va ~3 fois plus vite sans dépasser le débit que Gmail tolère.
    const results = await mapWithConcurrency(users, 3, async u => {
      try {
        await sendBroadcastEmail(u.email, u.nom, subject.trim(), message.trim());
        return true;
      } catch (err: unknown) {
        logger.error('[Broadcast] Email send error', { to: u.email, error: (err as Error).message });
        return false;
      } finally {
        await new Promise(r => setTimeout(r, 200));
      }
    });
    const sent   = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const failed = users.length - sent;

    await logAction(
      `Broadcast Email — segment: ${segment ?? 'all'} — ${sent} envoyés / ${failed} échecs`,
      'notification',
      'Admin',
    );
    res.json({ success: true, sent, failed, total: users.length });
  } catch (err: unknown) {
    logger.error('[Broadcast] Email error', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Erreur broadcast email' });
  }
});

// ── GET /api/notifications/stats — Admin ─────────────────────────────────────
router.get('/stats', verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [pushCount, staffDevices, recentFidelite] = await Promise.all([
      PushSubscription.countDocuments({ audience: { $ne: 'admin' } }),
      PushSubscription.countDocuments({ audience: 'admin' }),
      FideliteTransaction.countDocuments({ type: 'gain', createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    ]);
    res.json({ success: true, data: { pushSubscriptions: pushCount, staffDevices, fideliteGainsToday: recentFidelite } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// ── Abonnements push ──────────────────────────────────────────────────────────
// L'identité vient TOUJOURS de la session (jeton vérifié par le serveur), jamais du corps de la requête : un navigateur
// ne peut pas s'abonner aux notifications d'un autre compte. Deux audiences, deux routes, deux jetons :
//   - clients : /push/subscribe          (jeton client)  → notifications de leurs commandes
//   - équipe  : /push/admin/subscribe    (jeton admin)   → alertes de nouvelles commandes

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

interface ValidSubscription { endpoint: string; keys: { p256dh: string; auth: string } }

function parseSubscription(body: unknown): ValidSubscription | null {
  const sub = (body as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } } | undefined)?.subscription;
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 2048) return null;
  let url: URL;
  try { url = new URL(sub.endpoint); } catch { return null; }
  if (url.protocol !== 'https:') return null; // les services push sont tous en HTTPS
  const { p256dh, auth } = sub.keys ?? {};
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (p256dh.length > 200 || auth.length > 100 || !BASE64URL.test(p256dh) || !BASE64URL.test(auth)) return null;
  return { endpoint: sub.endpoint, keys: { p256dh, auth } };
}

const userAgentOf = (req: Request): string => String(req.headers['user-agent'] ?? '').slice(0, 300);

async function saveSubscription(
  req: Request, res: Response, identity: { audience: 'client'; userId: string } | { audience: 'admin' },
): Promise<void> {
  const subscription = parseSubscription(req.body);
  if (!subscription) {
    res.status(400).json({ success: false, message: 'Abonnement invalide.' });
    return;
  }
  try {
    // Un même appareil ne garde qu'un abonnement (clé : endpoint) : se réabonner met à jour, sans doublon,
    // et remet le compteur d'échecs à zéro.
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          keys: subscription.keys,
          audience: identity.audience,
          userAgent: userAgentOf(req),
          failures: 0,
          ...(identity.audience === 'client' ? { userId: identity.userId } : {}),
        },
        ...(identity.audience === 'admin' ? { $unset: { userId: '' } } : {}),
      },
      { upsert: true },
    );
    res.json({ success: true });
  } catch (err: unknown) {
    logger.error('[Push] subscribe error', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Erreur abonnement push' });
  }
}

router.post('/push/subscribe', memoryRateLimiter(20, 900, 'push-subscribe'), requireClient,
  (req: Request, res: Response) => saveSubscription(req, res, { audience: 'client', userId: (req as ClientRequest).clientId as string }));

router.post('/push/admin/subscribe', memoryRateLimiter(20, 900, 'push-subscribe'), verifyJWT,
  (req: Request, res: Response) => saveSubscription(req, res, { audience: 'admin' }));

// Se désabonner : seulement ses propres abonnements (le client ne touche pas à ceux d'un autre compte ni de l'équipe).
router.delete('/push/unsubscribe', memoryRateLimiter(20, 900, 'push-subscribe'), requireClient, async (req: Request, res: Response): Promise<void> => {
  const endpoint = (req.body as { endpoint?: unknown })?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) { res.status(400).json({ success: false, message: 'Endpoint requis.' }); return; }
  try {
    await PushSubscription.deleteOne({ endpoint, audience: { $ne: 'admin' }, userId: (req as ClientRequest).clientId });
    res.json({ success: true });
  } catch (err: unknown) {
    logger.error('[Push] unsubscribe error', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Erreur désabonnement push' });
  }
});

router.delete('/push/admin/unsubscribe', memoryRateLimiter(20, 900, 'push-subscribe'), verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const endpoint = (req.body as { endpoint?: unknown })?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) { res.status(400).json({ success: false, message: 'Endpoint requis.' }); return; }
  try {
    await PushSubscription.deleteOne({ endpoint, audience: 'admin' });
    res.json({ success: true });
  } catch (err: unknown) {
    logger.error('[Push] admin unsubscribe error', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Erreur désabonnement push' });
  }
});

// ── POST /api/notifications/push/send — Admin ─────────────────────────────────
router.post('/push/send', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const { title, body, url, userId } = req.body as {
    title: string; body: string; url?: string; userId?: string;
  };

  if (!title || !body) {
    res.status(400).json({ success: false, message: 'title et body requis' });
    return;
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    res.status(503).json({ success: false, message: 'Les notifications push ne sont pas disponibles pour le moment.' });
    return;
  }

  try {
    const filter: Record<string, unknown> = {};
    if (userId) filter.userId = userId;

    const result = await sendPushBroadcast({ title, body, url }, filter);
    await logAction(`Push notification — ${result.sent} reçus / ${result.failed} expirés`, 'notification', 'Admin');
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    logger.error('[Push] send error', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Erreur envoi push' });
  }
});

// ── GET /api/notifications/push/vapid-key — Clé publique VAPID ───────────────
router.get('/push/vapid-key', (_req: Request, res: Response): void => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    res.status(503).json({ success: false, message: 'Push non configuré' });
    return;
  }
  res.json({ success: true, publicKey: key });
});

export default router;
