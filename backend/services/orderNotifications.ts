// Contenu des notifications de commande, adapté au mode de réception : livraison à domicile ou retrait sur place.
// Source unique pour le push ; WhatsApp réutilise `isPickup` pour ses propres textes.

export type OrderMode = 'livraison' | 'sur_place';

// Les clients retrouvent leurs commandes dans « Mon compte » (la page « /commandes » n'existe pas).
export const CLIENT_ORDERS_URL = '/mon-compte';
export const STAFF_ORDERS_URL = '/admin/commandes';

export const isPickup = (mode: unknown): boolean => mode === 'sur_place';

export interface StatusNotification {
  title: string;
  body: string;
}

export function statusNotification(statut: string, mode: unknown, numero: string, note?: string): StatusNotification | null {
  const ref = `#${numero}`;
  const pickup = isPickup(mode);

  switch (statut) {
    case 'confirmee':
      return { title: 'Commande confirmée', body: `Votre commande ${ref} est confirmée.` };
    case 'en_preparation':
      return { title: 'En préparation', body: `Nos cuisiniers préparent votre commande ${ref}.` };
    case 'prete':
      return pickup
        ? { title: 'Commande prête à retirer', body: `Votre commande ${ref} vous attend sur place.` }
        : { title: 'Commande prête, livraison imminente', body: `Votre commande ${ref} part bientôt : restez joignable.` };
    case 'livree':
      return pickup
        ? { title: 'Commande retirée', body: `Merci de votre visite, bon appétit ! (${ref})` }
        : { title: 'Commande livrée', body: `Votre commande ${ref} est arrivée, bon appétit !` };
    case 'annulee':
      return { title: 'Commande annulée', body: note?.trim() || `Votre commande ${ref} a été annulée.` };
    case 'remboursee':
      return { title: 'Remboursement en cours', body: `Le remboursement de la commande ${ref} est en traitement.` };
    default:
      return null; // « en attente » : le client vient de passer commande, rien à lui annoncer
  }
}

export interface NewOrderSummary {
  numero: string;
  total: number;
  modeCommande: unknown;
  clientNom: string;
  itemCount: number;
}

const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n).replace(/\s/g, ' ')} FCFA`;

// Alerte de l'équipe pour une nouvelle commande (push et e-mail de secours partagent ce texte).
export function newOrderNotification(order: NewOrderSummary): StatusNotification {
  const mode = isPickup(order.modeCommande) ? 'retrait sur place' : 'livraison';
  const articles = `${order.itemCount} article${order.itemCount > 1 ? 's' : ''}`;
  return {
    title: `Nouvelle commande ${order.numero}`,
    body: `${order.clientNom} · ${fcfa(order.total)} · ${articles} · ${mode}`,
  };
}
