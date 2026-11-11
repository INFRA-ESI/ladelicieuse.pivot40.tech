import { createHash } from 'node:crypto';
import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.model.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import { logger } from '../config/logger.js';

export interface PushPayload {
  title: string;
  body:  string;
  url?:  string;
  icon?: string;
  /**
   * Regroupe les notifications d'un même sujet : sur l'appareil, la nouvelle remplace l'ancienne au lieu de s'empiler ;
   * côté service push, si l'appareil était éteint, seule la dernière est livrée.
   */
  tag?:  string;
}

export interface PushResult {
  sent:    number;
  /** Envois qui ont échoué (abonnement expiré ou panne passagère). */
  failed:  number;
  /** Abonnements retirés de la base : expirés, ou trop d'échecs consécutifs. */
  removed: number;
}

const EMPTY: PushResult = { sent: 0, failed: 0, removed: 0 };

// Trop d'échecs de suite : l'abonnement ne fonctionne plus (clé invalide, service push qui refuse) et on arrête d'insister.
export const MAX_CONSECUTIVE_FAILURES = 5;
// 404 / 410 : le service push dit que l'abonnement n'existe plus (appli désinstallée, autorisation retirée).
const GONE = new Set([404, 410]);
// Durée pendant laquelle le service push garde le message pour un appareil éteint : un état de commande périmé n'a plus d'intérêt.
const TTL_SECONDS = 6 * 60 * 60;

const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const vapidEmail   = process.env.VAPID_EMAIL ?? `mailto:${process.env.EMAIL_USER ?? 'admin@ladelicieuse.ga'}`;

const configured = !!(vapidPublic && vapidPrivate);
if (configured) {
  webpush.setVapidDetails(vapidEmail, vapidPublic!, vapidPrivate!);
}

export const isPushConfigured = (): boolean => configured;

type Target = { _id: unknown; endpoint: string; keys: { p256dh: string; auth: string }; failures?: number };

// L'en-tête « Topic » du protocole accepte 32 caractères URL-safe : on en dérive un du tag.
const topicOf = (tag: string): string => createHash('sha256').update(tag).digest('base64url').slice(0, 32);

async function dispatch(subs: Target[], payload: PushPayload): Promise<PushResult> {
  const data = JSON.stringify(payload);
  const options = { TTL: TTL_SECONDS, urgency: 'high' as const, ...(payload.tag ? { topic: topicOf(payload.tag) } : {}) };
  const now = new Date();

  // Les abonnements pointent vers des services push différents : on les envoie par groupes de 10.
  const results = await mapWithConcurrency(subs, 10, async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, data, options);
      return { sub, ok: true as const };
    } catch (error) {
      return { sub, ok: false as const, status: (error as { statusCode?: number }).statusCode, message: (error as Error).message };
    }
  });

  let sent = 0;
  let removed = 0;
  const successIds: unknown[] = [];
  const toDelete: unknown[] = [];
  const toBump: unknown[] = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const outcome = r.value;
    if (outcome.ok) {
      sent++;
      successIds.push(outcome.sub._id);
    } else if (outcome.status !== undefined && GONE.has(outcome.status)) {
      toDelete.push(outcome.sub._id);
    } else {
      // Panne passagère du service push, limite de débit, réseau : on garde l'abonnement, on compte l'échec.
      if ((outcome.sub.failures ?? 0) + 1 >= MAX_CONSECUTIVE_FAILURES) toDelete.push(outcome.sub._id);
      else toBump.push(outcome.sub._id);
      logger.warn('[Push] envoi échoué', { status: outcome.status, message: outcome.message });
    }
  }

  // Une seule écriture par catégorie : l'envoi à beaucoup d'abonnés ne fait pas autant d'allers-retours en base.
  const writes: Promise<unknown>[] = [];
  if (successIds.length) writes.push(PushSubscription.updateMany({ _id: { $in: successIds } }, { $set: { failures: 0, lastSuccessAt: now } }));
  if (toBump.length) writes.push(PushSubscription.updateMany({ _id: { $in: toBump } }, { $inc: { failures: 1 }, $set: { lastFailureAt: now } }));
  if (toDelete.length) {
    removed = toDelete.length;
    writes.push(PushSubscription.deleteMany({ _id: { $in: toDelete } }));
  }
  await Promise.allSettled(writes);

  return { sent, failed: subs.length - sent, removed };
}

async function sendTo(filter: Record<string, unknown>, payload: PushPayload): Promise<PushResult> {
  if (!configured) return { ...EMPTY };
  const subs = await PushSubscription.find(filter).lean();
  if (subs.length === 0) return { ...EMPTY };
  return dispatch(subs as unknown as Target[], payload);
}

// Les abonnements enregistrés avant l'ajout du champ « audience » n'en ont pas : ce sont tous des abonnements de clients.
// On exclut donc l'équipe (`$ne: 'admin'`) plutôt que d'exiger « client », sinon ils ne recevraient plus rien.
const CLIENTS = { audience: { $ne: 'admin' } };

// Notification à un client : tous ses appareils, jamais ceux de l'équipe.
export function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  return sendTo({ userId, ...CLIENTS }, payload);
}

// Notification à l'équipe : les appareils des administrateurs qui ont activé les notifications.
export function sendPushToAdmins(payload: PushPayload): Promise<PushResult> {
  return sendTo({ audience: 'admin' }, payload);
}

// Message à tous les clients abonnés (ou à un sous-ensemble) : ne part jamais vers les appareils de l'équipe.
export function sendPushBroadcast(payload: PushPayload, filter: Record<string, unknown> = {}): Promise<PushResult> {
  return sendTo({ ...filter, ...CLIENTS }, payload);
}
