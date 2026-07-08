import { useState, useEffect } from 'react';
import { Clock, ShoppingCart, User, Settings, Package, FileText, Search, Tag, UtensilsCrossed, Megaphone, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { adminGet } from '@/services/adminApiService';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface HistoryEntry {
  _id: string;
  action: string;
  type: string;
  user: string;
  createdAt: string;
}

const TYPE_ICON: Record<string, React.FC<{ className?: string }>> = {
  commande:    ShoppingCart,
  utilisateur: User,
  stock:       Package,
  facture:     FileText,
  parametre:   Settings,
  menu:        UtensilsCrossed,
  promotion:   Megaphone,
};

const typeColor: Record<string, string> = {
  commande:    'bg-primary/15 text-primary',
  utilisateur: 'bg-secondary/20 text-secondary-foreground',
  stock:       'bg-accent/20 text-accent-foreground',
  facture:     'bg-muted text-foreground',
  parametre:   'bg-muted text-muted-foreground',
  menu:        'bg-blue-100 text-blue-700',
  promotion:   'bg-purple-100 text-purple-700',
};

const TYPE_OPTIONS = ['Tous', 'commande', 'utilisateur', 'stock', 'facture', 'parametre', 'menu', 'promotion'];
const TYPE_LABELS: Record<string, string> = {
  Tous: 'Tous', commande: 'Commandes', utilisateur: 'Utilisateurs', stock: 'Stock',
  facture: 'Factures', parametre: 'Paramètres', menu: 'Menu', promotion: 'Promotions',
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function Skeleton() {
  return (
    <div className="bg-background border border-border rounded-lg p-4 flex items-start gap-4 animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-muted shrink-0" />
      <div className="flex-1">
        <div className="h-4 bg-muted rounded w-2/3 mb-2" />
        <div className="h-3 bg-muted rounded w-1/4" />
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('Tous');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await adminGet<{ data: HistoryEntry[]; total: number }>('/history?limit=200');
        if (mounted) setHistory(res.data);
      } catch {
        if (mounted) toast.error('Erreur chargement historique');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const filtered = history.filter(h => {
    const matchSearch = !search
      || h.action.toLowerCase().includes(search.toLowerCase())
      || h.user.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'Tous' || h.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Historique</h2>
        <p className="font-body text-sm text-muted-foreground">Journal d'activité de la plateforme · {history.length} événements</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-between gap-2 px-3 py-2 min-w-[180px] rounded-md text-xs font-body bg-background border border-border text-foreground hover:bg-muted/50 transition-colors">
              <span>{TYPE_LABELS[typeFilter]}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {TYPE_OPTIONS.map(t => (
              <DropdownMenuItem
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`text-xs font-body cursor-pointer ${typeFilter === t ? 'bg-primary/10 text-primary font-medium' : ''}`}
              >
                {TYPE_LABELS[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} />)
          : filtered.length === 0
            ? (
              <div className="text-center py-12">
                <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-body text-sm text-muted-foreground">Aucun événement trouvé</p>
              </div>
            )
            : filtered.map((h, idx) => {
                const prevDate = idx > 0 ? fmtDate(filtered[idx - 1].createdAt) : '';
                const currentDate = fmtDate(h.createdAt);
                const showDateHeader = currentDate !== prevDate;
                const IconComp = TYPE_ICON[h.type] ?? Tag;

                return (
                  <div key={h._id}>
                    {showDateHeader && (
                      <div className="py-3 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="font-body text-xs text-muted-foreground">{currentDate}</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div className="bg-background border border-border rounded-lg p-4 flex items-start gap-4 hover:shadow-sm hover:bg-muted/20 transition-all duration-200">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${typeColor[h.type] ?? 'bg-muted text-muted-foreground'}`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm text-foreground">{h.action}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="font-body text-xs text-muted-foreground">{h.user}</span>
                          <span className="font-body text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {fmtTime(h.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
        }
      </div>
    </div>
  );
}
