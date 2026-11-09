import type { ComponentType } from 'react';
import {
  Clock, CheckCircle, ChefHat, Package, Truck, XCircle, RotateCcw,
  type IconProps,
} from '@/components/icons';

export type OrderStatus =
  | 'en_attente'
  | 'confirmee'
  | 'en_preparation'
  | 'prete'
  | 'livree'
  | 'annulee'
  | 'remboursee';

interface OrderStatusStyle {
  label: string;
  /** L'icône décrit l'étape, et sa couleur la rappelle : les deux se lisent sans le libellé. */
  icon: ComponentType<IconProps>;
  color: string;
}

// Une seule définition pour le site et le back-office. Seule l'icône est colorée : le libellé reste neutre.
export const ORDER_STATUS: Record<OrderStatus, OrderStatusStyle> = {
  en_attente:     { label: 'En attente',     icon: Clock,       color: 'text-amber-600' },
  confirmee:      { label: 'Confirmée',      icon: CheckCircle, color: 'text-blue-600' },
  en_preparation: { label: 'En préparation', icon: ChefHat,     color: 'text-violet-600' },
  prete:          { label: 'Prête',          icon: Package,     color: 'text-green-600' },
  livree:         { label: 'Livrée',         icon: Truck,       color: 'text-slate-500' },
  annulee:        { label: 'Annulée',        icon: XCircle,     color: 'text-red-600' },
  remboursee:     { label: 'Remboursée',     icon: RotateCcw,   color: 'text-orange-600' },
};
