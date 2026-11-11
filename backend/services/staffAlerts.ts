import { sendPushToAdmins } from './push.service.js';
import { sendNewOrderStaffEmail } from './email.service.js';
import { getAdminEmail } from './adminEmail.service.js';
import { newOrderNotification, STAFF_ORDERS_URL } from './orderNotifications.js';
import { logger } from '../config/logger.js';

export interface NewOrderForStaff {
  _id: unknown;
  numero: string;
  total: number;
  modeCommande: unknown;
  items: { nom: string; qty: number }[];
  client: { nom: string; prenoms?: string; telephone: string; adresse?: string };
}

// Prévient l'équipe d'une nouvelle commande : push sur les appareils des administrateurs, e-mail de secours si le push
// n'a atteint personne (non configuré, aucun appareil abonné, ou tous les envois ont échoué). Jamais d'exception :
// l'alerte ne doit pas faire échouer la commande, et un seul canal en panne ne doit pas faire perdre l'autre.
export async function alertStaffNewOrder(order: NewOrderForStaff): Promise<{ push: number; email: boolean }> {
  const clientNom = [order.client.prenoms, order.client.nom].filter(Boolean).join(' ').trim() || order.client.nom;
  const message = newOrderNotification({
    numero: order.numero,
    total: order.total,
    modeCommande: order.modeCommande,
    clientNom,
    itemCount: order.items.reduce((n, i) => n + i.qty, 0),
  });

  let pushed = 0;
  try {
    pushed = (await sendPushToAdmins({ ...message, url: STAFF_ORDERS_URL, tag: `staff-order-${String(order._id)}` })).sent;
  } catch (error) {
    logger.error('[Alerte équipe] push impossible', { message: (error as Error).message });
  }
  if (pushed > 0) return { push: pushed, email: false };

  try {
    await sendNewOrderStaffEmail(await getAdminEmail(), {
      numero: order.numero,
      clientNom,
      telephone: order.client.telephone,
      total: order.total,
      modeCommande: String(order.modeCommande),
      adresse: order.client.adresse,
      items: order.items.map(i => ({ nom: i.nom, qty: i.qty })),
    });
    return { push: 0, email: true };
  } catch (error) {
    logger.error('[Alerte équipe] e-mail de secours impossible', { message: (error as Error).message });
    return { push: 0, email: false };
  }
}
