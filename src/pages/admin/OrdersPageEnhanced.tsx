import { useState, useEffect } from 'react';
import { Search, Clock, AlertCircle, ChevronDown, Phone, MapPin, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { orderService } from '@/services/orderService';
import { Order, OrderStatus, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_ICONS } from '@/types/order';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function OrdersPageEnhanced() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [lateOrders, setLateOrders] = useState<Order[]>([]);

  useEffect(() => {
    loadOrders();
    // Polling toutes les 5 secondes
    const unsubscribe = orderService.subscribeToOrderUpdates((newOrders) => {
      setOrders(newOrders);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    filterOrders();
    checkLateOrders();
  }, [orders, search, statusFilter]);

  const loadOrders = async () => {
    setLoading(true);
    const data = await orderService.getOrders();
    setOrders(data || []);
    setLoading(false);
  };

  const checkLateOrders = async () => {
    const late = await orderService.getLateOrders();
    setLateOrders(late || []);
  };

  const filterOrders = () => {
    let filtered = orders;

    // Filtre par statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    // Filtre par recherche
    if (search) {
      filtered = filtered.filter(order =>
        order.customerName.toLowerCase().includes(search.toLowerCase()) ||
        order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        order.customerPhone.includes(search)
      );
    }

    setFilteredOrders(filtered);
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const success = await orderService.updateOrderStatus(orderId, newStatus);
    if (success) {
      toast.success('Statut mis à jour');
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus as OrderStatus } : o));
    } else {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const getStatusStats = () => {
    return {
      pending: orders.filter(o => o.status === 'pending').length,
      preparing: orders.filter(o => o.status === 'preparing').length,
      ready: orders.filter(o => o.status === 'ready').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      late: lateOrders.length,
    };
  };

  const stats = getStatusStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Suivi des Commandes</h1>
        <p className="text-foreground/60">Gestion et suivi en temps réel des commandes clients</p>
      </div>

      {/* Alertes */}
      {lateOrders.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            ⚠️ {lateOrders.length} commande(s) en retard!
          </AlertDescription>
        </Alert>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <p className="text-xs text-foreground/60">En attente</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.preparing}</div>
              <p className="text-xs text-foreground/60">En prep.</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.ready}</div>
              <p className="text-xs text-foreground/60">Prête</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{stats.delivered}</div>
              <p className="text-xs text-foreground/60">Livrée</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.late}</div>
              <p className="text-xs text-foreground/60">En retard</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('all')}
            >
              Tous
            </Button>
            {['pending', 'confirmed', 'preparing', 'ready', 'delivered'].map(status => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                onClick={() => setStatusFilter(status)}
              >
                {ORDER_STATUS_LABELS[status as OrderStatus]}
              </Button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
            <Input
              placeholder="Chercher par client, numéro ou téléphone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Liste des commandes */}
      {loading ? (
        <div className="text-center py-8">Chargement...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-foreground/60">Aucune commande trouvée</div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Commandes ({filteredOrders.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredOrders.map(order => (
                <div
                  key={order.id}
                  className="p-4 border rounded-lg hover:bg-foreground/5 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold">{order.orderNumber}</h4>
                        <Badge>{PRIORITY_ICONS[order.priority] || '🔵'}</Badge>
                        <Badge className={ORDER_STATUS_COLORS[order.status]}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-foreground/60 mb-2">
                        <span>{order.customerName}</span>
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {order.customerPhone}
                        </span>
                        {order.deliveryAddress && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {order.deliveryAddress}
                          </span>
                        )}
                      </div>

                      <div className="mb-2">
                        <div className="text-sm mb-1">Articles:</div>
                        <div className="flex flex-wrap gap-2">
                          {order.items.map((item, i) => (
                            <span key={i} className="text-xs bg-foreground/5 px-2 py-1 rounded">
                              {item.name} x{item.quantity}
                            </span>
                          ))}
                        </div>
                      </div>

                      {order.notes && (
                        <p className="text-sm text-foreground/60 italic">Note: {order.notes}</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="text-lg font-bold">{order.totalAmount} FCFA</div>
                      <div className="text-xs text-foreground/60">
                        {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Détails
                      </Button>
                    </div>
                  </div>

                  {/* Sélecteur de statut */}
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground/60">Changer le statut:</span>
                      <select
                        className="text-sm border rounded px-2 py-1"
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      >
                        <option value="pending">En attente</option>
                        <option value="confirmed">Confirmée</option>
                        <option value="preparing">En préparation</option>
                        <option value="ready">Prête</option>
                        <option value="delivered">Livrée</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal détails (optionnel) */}
      {selectedOrder && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedOrder.orderNumber}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Détails complète */}
            <p className="text-sm">Détails: {selectedOrder.customerName}</p>
            <Button
              variant="outline"
              onClick={() => setSelectedOrder(null)}
              className="mt-4"
            >
              Fermer
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
