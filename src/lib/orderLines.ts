import type { CartItem } from '@/data/products';

/** Référence au catalogue que le serveur utilise pour vérifier le prix d'une ligne (jamais pour le fixer). */
export type OrderLineRef =
  | { type: 'repas' | 'jus'; id: string }
  | { type: 'salade'; composition: { id: string; quantity: number }[] }
  | { type: 'consultation'; id: string; mode: 'virtuel' | 'presentiel' };

export interface OrderLine {
  nom: string;
  qty: number;
  prix: number;
  customizations: string[];
  /** Absente quand la ligne ne peut pas être rattachée au catalogue : le serveur la refusera avec un message clair. */
  ref?: OrderLineRef;
}

function refFor(item: CartItem): OrderLineRef | undefined {
  switch (item.type) {
    case 'repas':
    case 'jus':
      return item.product ? { type: item.type, id: item.product.id } : undefined;
    case 'salade':
      return item.items?.length
        ? { type: 'salade', composition: item.items.map(i => ({ id: i.ingredient.id, quantity: i.quantity })) }
        : undefined;
    case 'consultation':
      return item.meta ? { type: 'consultation', id: item.meta.consultationId, mode: item.meta.mode } : undefined;
  }
}

/** Ligne de commande envoyée au serveur pour établir le devis. */
export function toOrderLine(item: CartItem, customizations: string[]): OrderLine {
  return { nom: item.name, qty: item.quantity, prix: item.totalPrice, customizations, ref: refFor(item) };
}
