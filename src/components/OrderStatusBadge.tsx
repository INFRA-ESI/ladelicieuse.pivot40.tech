import { ORDER_STATUS, type OrderStatus } from '@/lib/orderStatus';

// Icône colorée selon le statut + libellé neutre : lisible d'un coup d'oeil, sans pastille.
export default function OrderStatusBadge({ statut, className = '' }: { statut: OrderStatus; className?: string }) {
  const { label, icon: Icone, color } = ORDER_STATUS[statut];
  return (
    <span className={`inline-flex items-center gap-1.5 font-body text-xs text-foreground ${className}`}>
      <Icone className={`w-3.5 h-3.5 shrink-0 ${color}`} />
      {label}
    </span>
  );
}
