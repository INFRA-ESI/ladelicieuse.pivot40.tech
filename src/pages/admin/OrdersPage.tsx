import { useState, useMemo, useEffect } from 'react';
import {
  Search, Eye, X, MapPin, Clock, Phone, ChevronRight, ChevronDown,
  AlertTriangle, RefreshCw, Ban, RotateCcw, CheckCircle,
  Package, Truck, UtensilsCrossed, XCircle,
  CreditCard, Banknote, Smartphone, FileText, Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPatch, adminPost } from '@/services/adminApiService';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus =
  | 'en_attente'
  | 'confirmee'
  | 'en_preparation'
  | 'prete'
  | 'livree'
  | 'annulee'
  | 'remboursee';

type AnomalieType = 'annulation' | 'remboursement';
type ModePaiement = 'Mobile Money' | 'Carte bancaire' | 'Espèces';
type ModeCommande = 'Livraison' | 'Sur place' | 'À emporter';

interface OrderEvent {
  statut: OrderStatus;
  date: string;
  note?: string;
  par?: string;
}

interface OrderItem {
  nom: string;
  qty: number;
  prix: number;
  // Composition détaillée pour les salades du salad bar virtuel (crudités/fruits) —
  // ex: ["Laitue", "Poulet grillé ×2", "Vinaigrette maison"]. Vide/absent pour les
  // produits standards (jus, repas) qui n'ont pas de composition personnalisée.
  customizations?: string[];
}

interface Anomalie {
  type: AnomalieType;
  raison: string;
  montant: number;
  date: string;
}

interface Order {
  dbId: string;
  id: string;
  client: string;
  email: string;
  tel: string;
  items: OrderItem[];
  montant: number;
  statut: OrderStatus;
  mode: ModeCommande;
  paiement: ModePaiement;
  adresse: string;
  // Date/heure choisie par le client — livraison ou retrait selon `mode`
  datelivraison?: string;
  creneauLivraison?: string;
  notes: string;
  createdAt: string;
  history: OrderEvent[];
  anomalie?: Anomalie;
}

interface RawOrder {
  _id: string;
  numero: string;
  client: { nom: string; prenoms?: string; email: string; telephone: string; adresse: string };
  items: Array<{ nom: string; qty: number; prix: number; customizations?: string[] }>;
  total: number;
  statut: OrderStatus;
  modeCommande: string;
  modePaiement: string;
  datelivraison?: string;
  creneauLivraison?: string;
  notes: string;
  createdAt: string;
  historique: Array<{ statut: OrderStatus; date: string; note?: string; par?: string }>;
  anomalie?: { type: AnomalieType; raison: string; montant: number; date: string };
}

// ─── Static config ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<OrderStatus, string> = {
  en_attente:     'En attente',
  confirmee:      'Confirmée',
  en_preparation: 'En préparation',
  prete:          'Prête',
  livree:         'Livrée',
  annulee:        'Annulée',
  remboursee:     'Remboursée',
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  en_attente:     'bg-yellow-100 text-yellow-800',
  confirmee:      'bg-blue-100 text-blue-800',
  en_preparation: 'bg-purple-100 text-purple-800',
  prete:          'bg-green-100 text-green-800',
  livree:         'bg-gray-100 text-gray-700',
  annulee:        'bg-red-100 text-red-800',
  remboursee:     'bg-orange-100 text-orange-800',
};

const STATUS_ICON: Record<OrderStatus, React.ReactNode> = {
  en_attente:     <Clock className="w-3.5 h-3.5" />,
  confirmee:      <CheckCircle className="w-3.5 h-3.5" />,
  en_preparation: <UtensilsCrossed className="w-3.5 h-3.5" />,
  prete:          <Package className="w-3.5 h-3.5" />,
  livree:         <Truck className="w-3.5 h-3.5" />,
  annulee:        <XCircle className="w-3.5 h-3.5" />,
  remboursee:     <RotateCcw className="w-3.5 h-3.5" />,
};

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  en_attente:     ['confirmee', 'annulee'],
  confirmee:      ['en_preparation', 'annulee'],
  en_preparation: ['prete', 'annulee'],
  prete:          ['livree', 'annulee'],
  livree:         ['remboursee'],
  annulee:        ['remboursee'],
};

const PAYMENT_ICON: Record<ModePaiement, React.ReactNode> = {
  'Mobile Money':   <Smartphone className="w-3.5 h-3.5" />,
  'Carte bancaire': <CreditCard className="w-3.5 h-3.5" />,
  'Espèces':        <Banknote className="w-3.5 h-3.5" />,
};

const MODE_MAP: Record<string, ModeCommande> = {
  livraison: 'Livraison', sur_place: 'Sur place', emporter: 'À emporter',
};

const PAY_MAP: Record<string, ModePaiement> = {
  mobile_money: 'Mobile Money', carte: 'Carte bancaire', especes: 'Espèces',
};

// ─── Normalize raw API order → local Order ────────────────────────────────────

function normalizeOrder(raw: RawOrder): Order {
  return {
    dbId: raw._id,
    id: `#${raw.numero}`,
    client: raw.client.prenoms ? `${raw.client.prenoms} ${raw.client.nom}` : raw.client.nom,
    email: raw.client.email,
    tel: raw.client.telephone,
    items: raw.items.map(i => ({ nom: i.nom, qty: i.qty, prix: i.prix, customizations: i.customizations })),
    montant: raw.total,
    statut: raw.statut,
    mode: (MODE_MAP[raw.modeCommande] ?? 'Livraison') as ModeCommande,
    paiement: (PAY_MAP[raw.modePaiement] ?? 'Espèces') as ModePaiement,
    adresse: raw.client.adresse,
    datelivraison: raw.datelivraison,
    creneauLivraison: raw.creneauLivraison,
    notes: raw.notes,
    createdAt: raw.createdAt,
    history: (raw.historique ?? []).map(h => ({
      statut: h.statut,
      date: h.date,
      note: h.note,
      par: h.par,
    })),
    anomalie: raw.anomalie
      ? { type: raw.anomalie.type, raison: raw.anomalie.raison, montant: raw.anomalie.montant, date: raw.anomalie.date }
      : undefined,
  };
}

// ─── Helper: relative time ────────────────────────────────────────────────────

const ago = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return new Date(iso).toLocaleDateString('fr-FR');
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const fmtFCFA = (n: number) => n.toLocaleString('fr-FR') + ' FCFA';

// ─── Is late: > 45 min in a non-terminal status ──────────────────────────────

const isLate = (order: Order): boolean => {
  if (['livree', 'annulee', 'remboursee'].includes(order.statut)) return false;
  const lastEvent = order.history[order.history.length - 1];
  if (!lastEvent) return false;
  const diff = Date.now() - new Date(lastEvent.date).getTime();
  return diff > 45 * 60 * 1000;
};

const minutesSinceLastUpdate = (order: Order): number => {
  const lastEvent = order.history[order.history.length - 1];
  if (!lastEvent) return 0;
  return Math.floor((Date.now() - new Date(lastEvent.date).getTime()) / 60000);
};

const fmtElapsed = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatusBadge({ statut, small = false }: { statut: OrderStatus; small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-body font-medium ${small ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'} ${STATUS_COLOR[statut]}`}>
      {STATUS_ICON[statut]}
      {STATUS_LABEL[statut]}
    </span>
  );
}

function Timeline({ history }: { history: OrderEvent[] }) {
  return (
    <div className="space-y-0">
      {history.map((evt, idx) => {
        const isLast = idx === history.length - 1;
        return (
          <div key={idx} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${isLast ? 'bg-primary' : 'bg-border'}`} />
              {!isLast && <div className="w-px flex-1 bg-border my-0.5" />}
            </div>
            <div className="pb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge statut={evt.statut} small />
                <span className="font-body text-xs text-muted-foreground">{fmtTime(evt.date)}</span>
                {evt.par && <span className="font-body text-xs text-muted-foreground">· {evt.par}</span>}
              </div>
              {evt.note && <p className="font-body text-xs text-muted-foreground mt-0.5 italic">{evt.note}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/50">
      {[1,2,3,4,5].map(i => (
        <td key={i} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
      ))}
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type ActiveTab = 'resume' | 'historique' | 'anomalie';

const ALL_STATUSES: (OrderStatus | 'tous')[] = ['tous', 'en_attente', 'confirmee', 'en_preparation', 'prete', 'livree', 'annulee', 'remboursee'];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'tous'>('tous');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('resume');
  const [refreshTick, setRefreshTick] = useState(0);

  const [anomalyModal, setAnomalyModal] = useState<{ order: Order; type: AnomalieType } | null>(null);
  const [anomalyForm, setAnomalyForm] = useState({ raison: '', montant: '' });
  const [anomalyLoading, setAnomalyLoading] = useState(false);

  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Fetch orders (real data)
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    async function load() {
      try {
        const res = await adminGet<{ data: RawOrder[]; total: number }>('/orders?limit=200');
        if (!mounted) return;
        setOrders(res.data.map(normalizeOrder));
        setLastRefresh(new Date());
      } catch {
        if (mounted) toast.error('Erreur chargement commandes');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [refreshTick]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => setRefreshTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const kpis = useMemo(() => ({
    total:       orders.length,
    attente:     orders.filter(o => o.statut === 'en_attente').length,
    preparation: orders.filter(o => o.statut === 'en_preparation').length,
    prete:       orders.filter(o => o.statut === 'prete').length,
    livree:      orders.filter(o => o.statut === 'livree').length,
    anomalies:   orders.filter(o => ['annulee', 'remboursee'].includes(o.statut)).length,
    caTotal:     orders.filter(o => o.statut === 'livree').reduce((s, o) => s + o.montant, 0),
  }), [orders]);

  const lateOrders = useMemo(() => orders.filter(isLate), [orders, refreshTick]);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = !search
        || o.client.toLowerCase().includes(search.toLowerCase())
        || o.id.toLowerCase().includes(search.toLowerCase())
        || o.tel.includes(search);
      const matchStatus = statusFilter === 'tous' || o.statut === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  const updateStatus = async (order: Order, next: OrderStatus, note?: string) => {
    try {
      const res = await adminPatch<{ data: RawOrder }>(`/orders/${order.dbId}/status`, { statut: next, par: 'Admin', note });
      const updated = normalizeOrder(res.data);
      setOrders(prev => prev.map(o => o.dbId === order.dbId ? updated : o));
      if (selectedOrder?.dbId === order.dbId) setSelectedOrder(updated);
      toast.success(`Commande ${order.id} → ${STATUS_LABEL[next]}`);
    } catch {
      toast.error('Erreur mise à jour statut');
    }
  };

  const openAnomalyModal = (order: Order, type: AnomalieType) => {
    setAnomalyForm({ raison: '', montant: String(order.montant) });
    setAnomalyModal({ order, type });
  };

  const submitAnomaly = async () => {
    if (!anomalyModal) return;
    if (!anomalyForm.raison.trim()) { toast.error('Raison requise'); return; }
    const { order, type } = anomalyModal;
    const montant = +anomalyForm.montant || 0;
    setAnomalyLoading(true);
    try {
      const res = await adminPost<{ data: RawOrder }>(`/orders/${order.dbId}/anomalie`, {
        type, raison: anomalyForm.raison, montant,
      });
      const updated = normalizeOrder(res.data);
      setOrders(prev => prev.map(o => o.dbId === order.dbId ? updated : o));
      if (selectedOrder?.dbId === order.dbId) setSelectedOrder(updated);
      toast.success(type === 'remboursement' ? `Remboursement enregistré — ${fmtFCFA(montant)}` : 'Commande annulée');
      setAnomalyModal(null);
    } catch {
      toast.error('Erreur enregistrement anomalie');
    } finally {
      setAnomalyLoading(false);
    }
  };

  const canAnomaly = (o: Order) => !['annulee', 'remboursee'].includes(o.statut);
  const canRefund  = (o: Order) => ['livree', 'annulee'].includes(o.statut) && o.statut !== 'remboursee';

  return (
    <div className="space-y-5 bg-muted/30 -m-6 p-6 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Suivi des commandes</h2>
          <p className="font-body text-sm text-muted-foreground">{orders.length} commandes · actualisé {ago(lastRefresh.toISOString())}</p>
        </div>
        <button onClick={() => setRefreshTick(t => t + 1)}
          className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-md text-sm font-body text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'En attente',    value: kpis.attente,     color: 'text-yellow-600', dot: 'bg-yellow-400' },
          { label: 'En prép.',      value: kpis.preparation,  color: 'text-purple-600', dot: 'bg-purple-400' },
          { label: 'Prêtes',        value: kpis.prete,        color: 'text-green-600',  dot: 'bg-green-400'  },
          { label: 'Livrées',       value: kpis.livree,       color: 'text-gray-600',   dot: 'bg-gray-400'   },
          { label: 'Anomalies',     value: kpis.anomalies,    color: 'text-red-600',    dot: 'bg-red-400'    },
          { label: 'CA livré',      value: null,              color: 'text-primary',    dot: 'bg-primary'    },
        ].map(({ label, value, color, dot }) => (
          <div key={label} className="bg-background border border-border rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <div className={`w-2 h-2 rounded-full ${dot}`} />
              <p className="font-body text-xs text-muted-foreground">{label}</p>
            </div>
            {loading
              ? <div className="h-8 bg-muted rounded animate-pulse mx-auto w-12" />
              : value !== null
                ? <p className={`font-display text-2xl ${color}`}>{value}</p>
                : <p className={`font-display text-base ${color}`}>{Math.round(kpis.caTotal / 1000)}k FCFA</p>
            }
          </div>
        ))}
      </div>

      {/* Late orders alert */}
      {!loading && lateOrders.length > 0 && (() => {
        const sorted = [...lateOrders].sort((a, b) => minutesSinceLastUpdate(b) - minutesSinceLastUpdate(a));
        const criticalCount = sorted.filter(o => minutesSinceLastUpdate(o) > 90).length;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-left hover:bg-red-100/60 transition-colors">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="font-body text-sm font-semibold text-red-700">
                  {sorted.length} commande{sorted.length > 1 ? 's' : ''} en retard
                </p>
                <span className="font-body text-xs text-red-500/80 hidden sm:inline">— plus de 45 min sans mise à jour</span>
                {criticalCount > 0 && (
                  <span className="font-body text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-600 text-white">
                    {criticalCount} critique{criticalCount > 1 ? 's' : ''}
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-red-500/70 ml-auto shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width] min-w-[320px] max-h-80 overflow-y-auto">
              {sorted.map(o => {
                const minutes = minutesSinceLastUpdate(o);
                const critical = minutes > 90;
                return (
                  <DropdownMenuItem
                    key={o.dbId}
                    onClick={() => { setSelectedOrder(o); setActiveTab('resume'); }}
                    className="flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-body text-xs font-semibold text-foreground shrink-0">{o.id}</span>
                      <span className="font-body text-xs text-muted-foreground truncate">{o.client}</span>
                      <StatusBadge statut={o.statut} small />
                    </div>
                    <span
                      className={`shrink-0 font-body text-xs font-medium px-2 py-0.5 rounded-full ${
                        critical ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {fmtElapsed(minutes)}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })()}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Client, numéro, téléphone…"
            className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-between gap-2 px-3 py-2 min-w-[180px] rounded-md text-xs font-body bg-background border border-border text-foreground hover:bg-muted/50 transition-colors">
              <span>
                {statusFilter === 'tous' ? 'Toutes' : STATUS_LABEL[statusFilter]}
                <span className="ml-1 opacity-60">
                  ({statusFilter === 'tous' ? orders.length : orders.filter(o => o.statut === statusFilter).length})
                </span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {ALL_STATUSES.map(s => (
              <DropdownMenuItem
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs font-body cursor-pointer ${statusFilter === s ? 'bg-primary/10 text-primary font-medium' : ''}`}
              >
                {s === 'tous' ? 'Toutes' : STATUS_LABEL[s]}
                <span className="ml-1 opacity-60">
                  ({s === 'tous' ? orders.length : orders.filter(o => o.statut === s).length})
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="bg-background border border-border rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Commande</th>
              <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Client</th>
              <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground hidden md:table-cell">Articles</th>
              <th className="text-right p-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Montant</th>
              <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Statut</th>
              <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Mode</th>
              <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Créée</th>
              <th className="p-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : filtered.map(o => {
                  const late = isLate(o);
                  return (
                    <tr key={o.dbId}
                      className={`border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${late ? 'bg-red-50/40' : ''}`}
                      onClick={() => { setSelectedOrder(o); setActiveTab('resume'); }}>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {late && <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="En retard" />}
                          <span className="font-body font-medium text-foreground">{o.id}</span>
                        </div>
                        <p className="font-body text-xs text-muted-foreground">{ago(o.createdAt)}</p>
                      </td>
                      <td className="p-3">
                        <p className="font-body text-foreground">{o.client}</p>
                        <p className="font-body text-xs text-muted-foreground">{o.tel}</p>
                      </td>
                      <td className="p-3 font-body text-xs text-muted-foreground hidden md:table-cell max-w-[200px]">
                        <span className="truncate block">{o.items.map(i => `${i.nom} ×${i.qty}`).join(', ')}</span>
                      </td>
                      <td className="p-3 text-right font-body font-medium text-foreground">{fmtFCFA(o.montant)}</td>
                      <td className="p-3"><StatusBadge statut={o.statut} /></td>
                      <td className="p-3 font-body text-xs text-muted-foreground hidden lg:table-cell">{o.mode}</td>
                      <td className="p-3 font-body text-xs text-muted-foreground hidden lg:table-cell">{fmtTime(o.createdAt)}</td>
                      <td className="p-3" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setSelectedOrder(o); setActiveTab('resume'); }}
                          className="p-1 text-muted-foreground hover:text-foreground">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="text-center py-10">
            <Filter className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="font-body text-sm text-muted-foreground">Aucune commande trouvée</p>
          </div>
        )}
      </div>

      {/* Anomalies section */}
      {!loading && kpis.anomalies > 0 && (
        <div>
          <h3 className="font-display text-lg text-foreground mb-3">Anomalies récentes</h3>
          <div className="space-y-2">
            {orders.filter(o => o.anomalie).map(o => (
              <div key={o.dbId} className={`bg-background border rounded-lg p-4 flex items-start justify-between gap-4 ${o.statut === 'remboursee' ? 'border-orange-200' : 'border-red-200'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-body text-sm font-medium text-foreground">{o.id}</span>
                    <span className="font-body text-sm text-muted-foreground">— {o.client}</span>
                    <StatusBadge statut={o.statut} small />
                    <span className={`px-2 py-0.5 rounded-full text-xs font-body font-medium ${o.anomalie!.type === 'remboursement' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                      {o.anomalie!.type === 'remboursement' ? 'Remboursement' : 'Annulation'}
                    </span>
                  </div>
                  <p className="font-body text-xs text-muted-foreground truncate">{o.anomalie!.raison}</p>
                  {o.anomalie!.type === 'remboursement' && o.anomalie!.montant > 0 && (
                    <p className="font-body text-xs text-orange-600 font-medium mt-0.5">Remboursé : {fmtFCFA(o.anomalie!.montant)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-body text-xs text-muted-foreground">{ago(o.anomalie!.date)}</span>
                  <button onClick={() => { setSelectedOrder(o); setActiveTab('anomalie'); }}
                    className="text-xs font-body text-primary hover:underline flex items-center gap-1">
                    Voir <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/50"
          onClick={() => setSelectedOrder(null)}>
          <div className="bg-background h-full w-full max-w-xl shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <div>
                <h3 className="font-display text-xl text-foreground">{selectedOrder.id}</h3>
                <p className="font-body text-xs text-muted-foreground">{selectedOrder.client} · {fmtTime(selectedOrder.createdAt)}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex border-b border-border shrink-0">
              {(['resume', 'historique', 'anomalie'] as ActiveTab[]).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 font-body text-sm capitalize transition-colors ${activeTab === tab ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                  {tab === 'resume' ? 'Résumé' : tab === 'historique' ? 'Historique' : 'Anomalie'}
                  {tab === 'anomalie' && selectedOrder.anomalie && (
                    <span className="ml-1.5 w-2 h-2 rounded-full bg-red-500 inline-block" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {activeTab === 'resume' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Client</p>
                      <p className="font-body text-sm font-medium text-foreground">{selectedOrder.client}</p>
                      <p className="font-body text-xs text-muted-foreground">{selectedOrder.email}</p>
                    </div>
                    <div>
                      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Contact</p>
                      <p className="font-body text-sm text-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {selectedOrder.tel}
                      </p>
                    </div>
                    <div>
                      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Mode</p>
                      <p className="font-body text-sm text-foreground">{selectedOrder.mode}</p>
                    </div>
                    <div>
                      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Paiement</p>
                      <p className="font-body text-sm text-foreground flex items-center gap-1">
                        {PAYMENT_ICON[selectedOrder.paiement]} {selectedOrder.paiement}
                      </p>
                    </div>
                  </div>

                  {selectedOrder.adresse && (
                    <div>
                      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">
                        {selectedOrder.mode === 'Sur place' ? 'Retrait' : 'Adresse de livraison'}
                      </p>
                      <p className="font-body text-sm text-foreground flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0" /> {selectedOrder.adresse}
                      </p>
                    </div>
                  )}

                  {(selectedOrder.datelivraison || selectedOrder.creneauLivraison) && (
                    <div>
                      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">
                        {selectedOrder.mode === 'Sur place' ? 'Date & heure de retrait' : 'Date & heure de livraison'}
                      </p>
                      <p className="font-body text-sm text-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        {selectedOrder.datelivraison
                          ? new Date(`${selectedOrder.datelivraison}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                          : ''}
                        {selectedOrder.creneauLivraison ? ` à ${selectedOrder.creneauLivraison}` : ''}
                      </p>
                    </div>
                  )}

                  {selectedOrder.notes && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="font-body text-xs uppercase tracking-wider text-yellow-700 mb-1">Notes client</p>
                      <p className="font-body text-sm text-foreground">{selectedOrder.notes}</p>
                    </div>
                  )}

                  <div>
                    <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-2">Articles commandés</p>
                    <div className="border border-border rounded-lg divide-y divide-border">
                      {selectedOrder.items.map((item, i) => (
                        <div key={i} className="p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-body text-sm text-foreground">{item.nom}</span>
                              <span className="font-body text-xs text-muted-foreground ml-2">× {item.qty}</span>
                            </div>
                            <span className="font-body text-sm font-medium text-foreground">{fmtFCFA(item.prix * item.qty)}</span>
                          </div>
                          {/* Composition détaillée — salades du salad bar virtuel (crudités/fruits) */}
                          {(item.customizations?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {item.customizations!.map((c, ci) => (
                                <span key={ci} className="font-body text-[11px] px-2 py-1 bg-muted rounded-full text-muted-foreground">
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center justify-between p-3 bg-muted/40">
                        <span className="font-body text-sm font-semibold text-foreground">Total</span>
                        <span className="font-display text-lg text-primary">{fmtFCFA(selectedOrder.montant)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-2">Statut actuel</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <StatusBadge statut={selectedOrder.statut} />
                      {(NEXT_STATUS[selectedOrder.statut] ?? [])
                        .filter(ns => ns !== 'annulee' && ns !== 'remboursee')
                        .map(ns => (
                          <button key={ns} onClick={() => updateStatus(selectedOrder, ns)}
                            className="px-3 py-1.5 text-xs font-body bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" /> {STATUS_LABEL[ns]}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border">
                    {canAnomaly(selectedOrder) && (
                      <button onClick={() => openAnomalyModal(selectedOrder, 'annulation')}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-md text-xs font-body hover:bg-red-100 transition-colors">
                        <Ban className="w-3.5 h-3.5" /> Annuler la commande
                      </button>
                    )}
                    {canRefund(selectedOrder) && (
                      <button onClick={() => openAnomalyModal(selectedOrder, 'remboursement')}
                        className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-md text-xs font-body hover:bg-orange-100 transition-colors">
                        <RotateCcw className="w-3.5 h-3.5" /> Rembourser
                      </button>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'historique' && (
                <div>
                  <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-4">
                    Historique complet — {selectedOrder.history.length} événements
                  </p>
                  <Timeline history={[...selectedOrder.history].reverse()} />
                </div>
              )}

              {activeTab === 'anomalie' && (
                <>
                  {selectedOrder.anomalie ? (
                    <div className="space-y-4">
                      <div className={`rounded-lg p-4 border ${selectedOrder.anomalie.type === 'remboursement' ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-center gap-2 mb-3">
                          {selectedOrder.anomalie.type === 'remboursement'
                            ? <RotateCcw className="w-5 h-5 text-orange-600" />
                            : <Ban className="w-5 h-5 text-red-600" />}
                          <span className={`font-body text-sm font-semibold ${selectedOrder.anomalie.type === 'remboursement' ? 'text-orange-700' : 'text-red-700'}`}>
                            {selectedOrder.anomalie.type === 'remboursement' ? 'Remboursement' : 'Annulation'}
                          </span>
                          <span className="font-body text-xs text-muted-foreground">{ago(selectedOrder.anomalie.date)}</span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Raison</p>
                            <p className="font-body text-sm text-foreground">{selectedOrder.anomalie.raison}</p>
                          </div>
                          {selectedOrder.anomalie.type === 'remboursement' && (
                            <div>
                              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Montant remboursé</p>
                              <p className="font-body text-sm font-semibold text-orange-700">{fmtFCFA(selectedOrder.anomalie.montant)}</p>
                              {selectedOrder.anomalie.montant < selectedOrder.montant && (
                                <p className="font-body text-xs text-muted-foreground">
                                  Remboursement partiel ({Math.round(selectedOrder.anomalie.montant / selectedOrder.montant * 100)}% du total)
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-2">Référence commande</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-muted rounded-md p-3">
                            <p className="font-body text-xs text-muted-foreground">Montant initial</p>
                            <p className="font-body text-sm font-medium text-foreground">{fmtFCFA(selectedOrder.montant)}</p>
                          </div>
                          <div className="bg-muted rounded-md p-3">
                            <p className="font-body text-xs text-muted-foreground">Mode de paiement</p>
                            <p className="font-body text-sm font-medium text-foreground flex items-center gap-1">
                              {PAYMENT_ICON[selectedOrder.paiement]} {selectedOrder.paiement}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="font-body text-sm text-muted-foreground italic">Aucune anomalie enregistrée pour cette commande.</p>
                      <div className="flex gap-2">
                        {canAnomaly(selectedOrder) && (
                          <button onClick={() => openAnomalyModal(selectedOrder, 'annulation')}
                            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-md text-xs font-body hover:bg-red-100">
                            <Ban className="w-3.5 h-3.5" /> Annuler la commande
                          </button>
                        )}
                        {canRefund(selectedOrder) && (
                          <button onClick={() => openAnomalyModal(selectedOrder, 'remboursement')}
                            className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-md text-xs font-body hover:bg-orange-100">
                            <RotateCcw className="w-3.5 h-3.5" /> Rembourser
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Anomaly form modal */}
      {anomalyModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 px-4"
          onClick={() => setAnomalyModal(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              {anomalyModal.type === 'remboursement'
                ? <RotateCcw className="w-5 h-5 text-orange-600" />
                : <Ban className="w-5 h-5 text-red-600" />}
              <h3 className="font-display text-xl text-foreground">
                {anomalyModal.type === 'remboursement' ? 'Rembourser' : 'Annuler'} la commande {anomalyModal.order.id}
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Raison *</label>
                <textarea value={anomalyForm.raison}
                  onChange={e => setAnomalyForm(f => ({ ...f, raison: e.target.value }))}
                  rows={3} placeholder="Expliquez la raison de cette action…"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md font-body text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {anomalyModal.type === 'remboursement' && (
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Montant à rembourser (FCFA)</label>
                  <input type="number" value={anomalyForm.montant}
                    onChange={e => setAnomalyForm(f => ({ ...f, montant: e.target.value }))}
                    min="0" max={anomalyModal.order.montant}
                    className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <p className="font-body text-xs text-muted-foreground mt-1">Total : {fmtFCFA(anomalyModal.order.montant)}</p>
                  {+anomalyForm.montant > 0 && +anomalyForm.montant < anomalyModal.order.montant && (
                    <p className="font-body text-xs text-orange-600 mt-0.5">
                      Remboursement partiel : {Math.round(+anomalyForm.montant / anomalyModal.order.montant * 100)}%
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={submitAnomaly} disabled={anomalyLoading}
                  className={`flex-1 py-2.5 text-sm font-body rounded-md text-white transition-colors disabled:opacity-60 ${anomalyModal.type === 'remboursement' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {anomalyLoading ? 'Enregistrement…' : anomalyModal.type === 'remboursement' ? 'Confirmer le remboursement' : 'Confirmer l\'annulation'}
                </button>
                <button onClick={() => setAnomalyModal(null)}
                  className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md hover:bg-muted/70">
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
