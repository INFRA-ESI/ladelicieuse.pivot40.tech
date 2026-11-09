import axios from 'axios';
import { logger } from '../config/logger.js';

interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

interface WhatsAppOrderPayload {
  orderId: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  total: number;
  modePaiement: string;
}

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
}

// ── Normalise un numéro gabonais vers +241XXXXXXXX ───────────────────────────
function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('241')) return `+${cleaned}`;
  if (cleaned.startsWith('0') && cleaned.length === 9) return `+241${cleaned.slice(1)}`;
  if (cleaned.length === 8) return `+241${cleaned}`;
  return cleaned;
}

// ── Canal 1 : Meta WhatsApp Cloud API (production, gratuit) ──────────────────
async function sendViaMeta(to: string, body: string): Promise<boolean> {
  const token   = process.env.META_WHATSAPP_TOKEN;
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneId) return false;

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                to.replace(/^\+/, ''),
        type:              'text',
        text:              { preview_url: false, body },
      },
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return true;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: unknown }; message?: string };
    logger.error('[WhatsApp] Erreur Meta', { detail: JSON.stringify(axiosErr?.response?.data ?? axiosErr?.message) });
    return false;
  }
}

async function sendMessage(to: string, body: string): Promise<boolean> {
  return sendViaMeta(to, body);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━';

const TIER_META: Record<string, { label: string; next: string; nextMin: number }> = {
  bronze:  { label: 'Bronze',  next: 'Argent',  nextMin: 500  },
  argent:  { label: 'Argent',  next: 'Or',      nextMin: 1500 },
  or:      { label: 'Or',      next: 'Platine', nextMin: 3500 },
  platine: { label: 'Platine', next: '',        nextMin: 0    },
};

function prenom(fullName: string): string {
  return fullName.split(' ')[0];
}

// ── 1 — Confirmation de commande ──────────────────────────────────────────────
function buildOrderMessage(payload: WhatsAppOrderPayload): string {
  const ref   = payload.orderId.slice(-8).toUpperCase();
  const lines = payload.items
    .map(i => `   - ${i.name}${i.qty > 1 ? ` x ${i.qty}` : ''} — *${formatFCFA(i.price * i.qty)}*`)
    .join('\n');

  return [
    `*La Délicieuse Diète*`,
    ``,
    `Bonjour *${prenom(payload.customerName)}* !`,
    ``,
    `Votre commande *#${ref}* vient d'être reçue. Merci de nous faire confiance !`,
    ``,
    DIVIDER,
    `*Votre commande*`,
    lines,
    DIVIDER,
    ``,
    `*Total :* ${formatFCFA(payload.total)}`,
    `*Paiement :* ${payload.modePaiement}`,
    ``,
    `Nos équipes se mettent au travail. Vous recevrez un message à chaque étape jusqu'à la livraison.`,
    ``,
    `_La Délicieuse Diète — Manger sain, vivre bien_`,
  ].join('\n');
}

// ── 2 — Changement de statut ──────────────────────────────────────────────────
function buildStatusMessage(
  orderId: string,
  customerName: string,
  newStatus: string,
  note?: string,
): string {
  const ref  = orderId.slice(-8).toUpperCase();
  const name = prenom(customerName);

  const STATUS: Record<string, { titre: string; corps: string }> = {
    confirmee: {
      titre: 'Commande confirmée',
      corps: `Votre commande *#${ref}* est *confirmée* ! Notre cuisine est prête à démarrer.\n\nNous vous prévenons dès que la préparation commence.`,
    },
    en_preparation: {
      titre: 'En cours de préparation',
      corps: `C'est parti ! Votre commande *#${ref}* est *en cours de préparation*.\n\nNos cuisiniers travaillent avec soin pour vous offrir le meilleur.\n\n_Patience, la fraîcheur se mérite !_`,
    },
    prete: {
      titre: 'Prête — Livraison imminente !',
      corps: `Votre commande *#${ref}* est *prête* et notre livreur prend la route !\n\nRestez disponible, il arrive bientôt. La fraîcheur est garantie jusqu'à votre porte.`,
    },
    livree: {
      titre: 'Commande livrée !',
      corps: `Votre commande *#${ref}* a bien été *livrée*.\n\nNous espérons vous faire passer un délicieux moment. Régalez-vous bien !\n\n_Votre avis compte — dites-nous ce que vous avez pensé de votre repas._`,
    },
    annulee: {
      titre: 'Commande annulée',
      corps: `Votre commande *#${ref}* a été *annulée*.\n\n${note ? `_Motif : ${note}_\n\n` : ''}Nous sommes désolés pour la gêne occasionnée. N'hésitez pas à repasser commande quand vous le souhaitez.`,
    },
    remboursee: {
      titre: 'Remboursement en cours',
      corps: `Le remboursement de votre commande *#${ref}* est *en cours de traitement*.\n\n${note ? `_${note}_\n\n` : ''}Votre argent sera restitué sous 24–48 h. Contactez-nous si besoin.`,
    },
  };

  const s = STATUS[newStatus] ?? {
    titre: 'Mise à jour de commande',
    corps: `Votre commande *#${ref}* a été mise à jour : _${newStatus}_.`,
  };

  return [
    `*La Délicieuse Diète — ${s.titre}*`,
    ``,
    `Bonjour *${name}* !`,
    ``,
    s.corps,
    ``,
    `_La Délicieuse Diète — Manger sain, vivre bien_`,
  ].join('\n');
}

// ── 3 — Points de fidélité ────────────────────────────────────────────────────
function buildFideliteMessage(
  customerName: string,
  pointsGagnes: number,
  soldeTotal: number,
  tier: string,
  tierChange?: { avant: string; apres: string },
): string {
  const name    = prenom(customerName);
  const meta    = TIER_META[tier] ?? TIER_META['bronze'];
  const upgrade = tierChange && tierChange.avant !== tierChange.apres;

  let progressLine = '';
  if (meta.next && meta.nextMin > 0) {
    const prevMin = tier === 'argent' ? 500 : tier === 'or' ? 1500 : 0;
    const pct     = Math.min(100, Math.round(((soldeTotal - prevMin) / (meta.nextMin - prevMin)) * 100));
    const filled  = Math.round(pct / 10);
    const bar     = '['.padEnd(filled + 1, '=') + ']'.padStart(11 - filled, '-');
    progressLine  = `\n${bar} ${pct}%\n_${meta.nextMin - soldeTotal > 0 ? (meta.nextMin - soldeTotal) + ' pts pour atteindre ' + meta.next : 'Niveau suivant atteint !'}_`;
  } else {
    progressLine = `\n_Vous avez atteint le niveau maximum — Platine !_`;
  }

  const lines = [
    `*La Délicieuse Diète — Fidélité*`,
    ``,
    upgrade
      ? `*Bravo ${name} ! Vous montez de niveau !*`
      : `Merci *${name}* pour votre commande !`,
    ``,
    DIVIDER,
    `*Points gagnés :* +${pointsGagnes} pts`,
    `*Solde total :* ${soldeTotal} pts`,
    `*Niveau :* ${meta.label}`,
    progressLine,
    DIVIDER,
  ];

  if (upgrade) {
    const newMeta = TIER_META[tierChange!.apres] ?? meta;
    lines.push(
      ``,
      `Vous passez au niveau *${newMeta.label}* !`,
      `De nouveaux avantages vous attendent.`,
    );
  }

  lines.push(
    ``,
    `_100 pts = code promo 500 FCFA sur votre prochaine commande._`,
    `Échangez vos points dans *Mon Compte* sur l'application.`,
    ``,
    `_La Délicieuse Diète — Merci de votre fidélité_`,
  );

  return lines.join('\n');
}

// ── 4 — Confirmation de paiement ─────────────────────────────────────────────
function buildPaymentMessage(
  customerName: string,
  orderId: string,
  amount: number,
  provider: string,
): string {
  const ref = orderId.slice(-8).toUpperCase();
  const providerLabel =
    provider === 'airtel' ? 'Airtel Money' :
    provider === 'moov'   ? 'Moov Money'   : provider;

  return [
    `*La Délicieuse Diète — Paiement reçu*`,
    ``,
    `Bonjour *${prenom(customerName)}* !`,
    ``,
    `Votre paiement a bien été reçu. Merci !`,
    ``,
    DIVIDER,
    `*Commande :* #${ref}`,
    `*Montant :* ${formatFCFA(amount)}`,
    `*Via :* ${providerLabel}`,
    DIVIDER,
    ``,
    `Votre commande est en cours de traitement. Vous recevrez un message à chaque étape jusqu'à la livraison.`,
    ``,
    `_La Délicieuse Diète — Manger sain, vivre bien_`,
  ].join('\n');
}

// ── API publique ───────────────────────────────────────────────────────────────

export async function sendWhatsAppNotification(
  payload: WhatsAppOrderPayload,
): Promise<{ success: boolean; method: string }> {
  if (payload.customerPhone) {
    const phone = normalizePhone(payload.customerPhone);
    const sent  = await sendMessage(phone, buildOrderMessage(payload));
    if (sent) return { success: true, method: 'meta' };
  }

  const storePhone = process.env.WHATSAPP_STORE_PHONE ?? '+24177000000';
  const message    = buildOrderMessage(payload);
  const url        = `https://wa.me/${storePhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
  // Pas d'URL dans les logs : elle contient le détail de la commande (données personnelles).
  logger.info('[WhatsApp] Lien de repli généré');
  return { success: true, method: 'link', ...(process.env.NODE_ENV === 'development' ? { url } : {}) } as { success: boolean; method: string };
}

export async function sendStatusNotification(
  phone: string,
  orderId: string,
  customerName: string,
  newStatus: string,
  note?: string,
): Promise<void> {
  if (!phone) return;
  const msg = buildStatusMessage(orderId, customerName, newStatus, note);
  const sent = await sendMessage(normalizePhone(phone), msg);
  if (!sent) logger.info(`[WhatsApp] Statut non envoyé pour ${orderId} -> ${newStatus}`);
}

export async function sendFideliteNotification(
  phone: string,
  customerName: string,
  pointsGagnes: number,
  soldeTotal: number,
  tier: string,
  tierChange?: { avant: string; apres: string },
): Promise<void> {
  if (!phone) return;
  const msg = buildFideliteMessage(customerName, pointsGagnes, soldeTotal, tier, tierChange);
  const sent = await sendMessage(normalizePhone(phone), msg);
  if (!sent) logger.info(`[WhatsApp] Notification fidélité non envoyée pour ${customerName}`);
}

export async function sendWhatsAppBroadcast(
  phones: string[],
  message: string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const phone of phones) {
    if (!phone) { failed++; continue; }
    const ok = await sendMessage(normalizePhone(phone), message);
    if (ok) sent++; else failed++;
    await new Promise(r => setTimeout(r, 300));
  }
  return { sent, failed };
}

export async function sendPaymentNotification(
  phone: string,
  customerName: string,
  orderId: string,
  amount: number,
  provider: string,
): Promise<void> {
  if (!phone) return;
  const msg = buildPaymentMessage(customerName, orderId, amount, provider);
  const sent = await sendMessage(normalizePhone(phone), msg);
  if (!sent) logger.info(`[WhatsApp] Notification paiement non envoyée — commande ${orderId}`);
}

export { buildOrderMessage, buildStatusMessage, buildFideliteMessage, buildPaymentMessage };
