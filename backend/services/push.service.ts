import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.model.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

export interface PushPayload {
  title: string;
  body:  string;
  url?:  string;
  icon?: string;
}

const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const vapidEmail   = process.env.VAPID_EMAIL ?? `mailto:${process.env.EMAIL_USER ?? 'admin@ladelicieuse.ga'}`;

const configured = !!(vapidPublic && vapidPrivate);
if (configured) {
  webpush.setVapidDetails(vapidEmail, vapidPublic!, vapidPrivate!);
}

async function dispatch(
  subs: Array<{ _id: unknown; endpoint: string; keys: { p256dh: string; auth: string } }>,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const data = JSON.stringify(payload);
  // Les abonnements pointent vers des services push différents : on les envoie par groupes de 10.
  const results = await mapWithConcurrency(subs, 10, async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, data);
      return true;
    } catch {
      // Subscription expirée ou invalide — on la supprime
      await PushSubscription.deleteOne({ _id: sub._id });
      return false;
    }
  });
  const sent = results.filter(r => r.status === 'fulfilled' && r.value).length;
  return { sent, failed: subs.length - sent };
}

// Envoyer une notification à un utilisateur spécifique (toutes ses sessions)
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!configured) return { sent: 0, failed: 0 };
  const subs = await PushSubscription.find({ userId }).lean();
  if (subs.length === 0) return { sent: 0, failed: 0 };
  return dispatch(subs, payload);
}

// Broadcast à tous les abonnés (ou sous-ensemble filtré)
export async function sendPushBroadcast(
  payload: PushPayload,
  filter: Record<string, unknown> = {},
): Promise<{ sent: number; failed: number }> {
  if (!configured) return { sent: 0, failed: 0 };
  const subs = await PushSubscription.find(filter).lean();
  if (subs.length === 0) return { sent: 0, failed: 0 };
  return dispatch(subs, payload);
}
