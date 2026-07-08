import { Router, Request, Response } from 'express';
import { sendWhatsAppNotification, sendWhatsAppBroadcast } from '../services/whatsapp.service.js';
import { sendPushBroadcast } from '../services/push.service.js';
import { sendBroadcastEmail } from '../services/email.service.js';
import { verifyJWT } from './auth.routes.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
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

    let sent = 0;
    let failed = 0;
    for (const u of users) {
      try {
        await sendBroadcastEmail(u.email, u.nom, subject.trim(), message.trim());
        sent++;
      } catch (err: unknown) {
        failed++;
        logger.error('[Broadcast] Email send error', { to: u.email, error: (err as Error).message });
      }
      await new Promise(r => setTimeout(r, 200));
    }

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
    const [pushCount, recentFidelite] = await Promise.all([
      PushSubscription.countDocuments(),
      FideliteTransaction.countDocuments({ type: 'gain', createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    ]);
    res.json({ success: true, data: { pushSubscriptions: pushCount, fideliteGainsToday: recentFidelite } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// ── POST /api/notifications/push/subscribe ────────────────────────────────────
router.post('/push/subscribe', async (req: Request, res: Response): Promise<void> => {
  const { subscription, userId, userAgent } = req.body as {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    userId?: string;
    userAgent?: string;
  };

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    res.status(400).json({ success: false, message: 'Subscription invalide' });
    return;
  }

  try {
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      { endpoint: subscription.endpoint, keys: subscription.keys, userId: userId ?? undefined, userAgent: userAgent ?? '' },
      { upsert: true, new: true },
    );
    res.json({ success: true });
  } catch (err: unknown) {
    logger.error('[Push] subscribe error', { error: (err as Error).message });
    res.status(500).json({ success: false, message: 'Erreur abonnement push' });
  }
});

// ── DELETE /api/notifications/push/unsubscribe ────────────────────────────────
router.delete('/push/unsubscribe', async (req: Request, res: Response): Promise<void> => {
  const { endpoint } = req.body as { endpoint: string };
  try {
    await PushSubscription.deleteOne({ endpoint });
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
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
    res.status(503).json({ success: false, message: 'VAPID non configuré.' });
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
