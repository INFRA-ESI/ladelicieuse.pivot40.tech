import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, ShoppingCart, Users, CircleDollarSign, Package, ArrowUpRight, Star, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { Link } from 'react-router-dom';
import { adminGet } from '@/services/adminApiService';
import { toast } from 'sonner';

interface DashStats {
  commandesAujourdhui: number;
  revenueAujourdhui: number;
  revenueMensuel: number;
  utilisateursActifs: number;
  abonnementsActifs: number;
  alertesStock: number;
  noteMoyenne: number;
  commandesParStatut: Record<string, number>;
}

interface RevenuePoint { _id: string; revenu: number; factures: number; }
interface TopMeal { _id: string; total: number; revenu: number; }

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const STATUS_COLOR: Record<string, string> = {
  en_attente:     'bg-yellow-100 text-yellow-800',
  confirmee:      'bg-blue-100 text-blue-800',
  en_preparation: 'bg-purple-100 text-purple-800',
  prete:          'bg-green-100 text-green-800',
  livree:         'bg-gray-100 text-gray-700',
  annulee:        'bg-red-100 text-red-800',
  remboursee:     'bg-orange-100 text-orange-800',
};

const STATUS_LABEL: Record<string, string> = {
  en_attente: 'En attente', confirmee: 'Confirmée', en_preparation: 'En préparation',
  prete: 'Prête', livree: 'Livrée', annulee: 'Annulée', remboursee: 'Remboursée',
};

const CATEGORY_COLORS = [
  'hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))',
];

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className}`} />;
}

export default function DashboardPage() {
  const [stats, setStats]     = useState<DashStats | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [topMeals, setTopMeals] = useState<TopMeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [s, r, t] = await Promise.all([
          adminGet<{ data: DashStats }>('/dashboard/stats'),
          adminGet<{ data: RevenuePoint[] }>('/dashboard/revenue'),
          adminGet<{ data: TopMeal[] }>('/dashboard/top-meals'),
        ]);
        if (!mounted) return;
        setStats(s.data);
        setRevenue(r.data);
        setTopMeals(t.data.slice(0, 5));
      } catch (e) {
        if (mounted) toast.error('Erreur chargement dashboard');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // Revenus 7 derniers jours
  const rev7 = (() => {
    const days: { jour: string; revenus: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = revenue.find(r => r._id === key);
      days.push({ jour: JOURS[d.getDay()], revenus: found?.revenu ?? 0 });
    }
    return days;
  })();

  const statusEntries = Object.entries(stats?.commandesParStatut ?? {});
  const totalCommandes = statusEntries.reduce((s, [, v]) => s + v, 0);
  const pieData = statusEntries.map(([k, v], i) => ({
    name: STATUS_LABEL[k] || k,
    value: v,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  const kpis = [
    {
      label: 'Revenus aujourd\'hui',
      value: stats ? `${(stats.revenueAujourdhui ?? 0).toLocaleString('fr-FR')} FCFA` : '—',
      sub: `${(stats?.revenueMensuel ?? 0).toLocaleString('fr-FR')} FCFA ce mois`,
      icon: CircleDollarSign, up: true,
    },
    {
      label: 'Commandes aujourd\'hui',
      value: stats?.commandesAujourdhui ?? '—',
      sub: `${totalCommandes} total`,
      icon: ShoppingCart, up: (stats?.commandesAujourdhui ?? 0) > 0,
    },
    {
      label: 'Clients actifs',
      value: stats?.utilisateursActifs ?? '—',
      sub: `${stats?.abonnementsActifs ?? 0} abonnés actifs`,
      icon: Users, up: true,
    },
    {
      label: 'Alertes stock',
      value: stats?.alertesStock ?? '—',
      sub: stats?.alertesStock ? 'Réapprovisionnement requis' : 'Stock OK',
      icon: Package, up: (stats?.alertesStock ?? 0) === 0,
    },
  ];

  return (
    <div className="space-y-8 bg-muted/30 -m-6 p-6 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Tableau de bord</h2>
          <p className="font-body text-sm text-muted-foreground">
            Vue d'ensemble · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-background border border-border rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-3">
              <span className="font-body text-xs uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <kpi.icon className="w-4 h-4 text-primary" />
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-24 mb-2" />
            ) : (
              <>
                <p className="font-display text-2xl text-foreground mb-1">{String(kpi.value)}</p>
                <div className={`flex items-center gap-1 text-xs font-body ${kpi.up ? 'text-secondary' : 'text-destructive'}`}>
                  {kpi.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {kpi.sub}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Alerte stock */}
      {!loading && (stats?.alertesStock ?? 0) > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
          <p className="font-body text-sm text-orange-700">
            <strong>{stats!.alertesStock} ingrédient{stats!.alertesStock > 1 ? 's' : ''}</strong> en rupture ou stock critique.{' '}
            <Link to="/admin/stocks" className="underline">Voir les stocks</Link>
          </p>
        </div>
      )}

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
          <h3 className="font-display text-lg text-foreground mb-4">Revenus (7 jours)</h3>
          {loading ? <Skeleton className="h-60 w-full" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={rev7}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="jour" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString('fr-FR')} FCFA`, 'Revenus']} />
                <Bar dataKey="revenus" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
          <h3 className="font-display text-lg text-foreground mb-4">Revenus (30 jours)</h3>
          {loading ? <Skeleton className="h-60 w-full" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={revenue.slice(-30).map(r => ({ date: r._id.slice(5), revenu: r.revenu }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString('fr-FR')} FCFA`, 'Revenus']} />
                <Area type="monotone" dataKey="revenu" stroke="hsl(var(--secondary))" fill="hsl(var(--secondary) / 0.12)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
          <h3 className="font-display text-lg text-foreground mb-4">Commandes par statut</h3>
          {loading ? <Skeleton className="h-48 w-full" /> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" paddingAngle={3}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, 'commandes']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {pieData.map(c => (
                  <div key={c.name} className="flex items-center gap-1 text-xs font-body text-muted-foreground">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-2 bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
          <h3 className="font-display text-lg text-foreground mb-4">Top produits commandés</h3>
          {loading ? <Skeleton className="h-48 w-full" /> : topMeals.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground text-center py-12">Aucune donnée disponible</p>
          ) : (
            <div className="space-y-3">
              {topMeals.map((p, i) => (
                <div key={p._id} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-body font-medium text-primary shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-body text-sm text-foreground truncate">{p._id}</p>
                      <p className="font-body text-xs text-muted-foreground shrink-0 ml-2">{p.total} ventes</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{ width: `${Math.round((p.total / (topMeals[0]?.total || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <p className="font-body text-xs text-secondary shrink-0">{p.revenu.toLocaleString('fr-FR')} F</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Note moyenne */}
      {!loading && stats && (
        <div className="bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <Star className="w-6 h-6 text-primary fill-primary shrink-0" />
              <div>
                <p className="font-display text-3xl text-foreground">{(stats.noteMoyenne ?? 0).toFixed(1)}</p>
                <p className="font-body text-xs text-muted-foreground">Note moyenne clients</p>
              </div>
            </div>
            <div className="hidden sm:block h-10 w-px bg-border" />
            <div>
              <p className="font-display text-2xl text-foreground">{stats.abonnementsActifs}</p>
              <p className="font-body text-xs text-muted-foreground">Abonnements actifs</p>
            </div>
            <div className="hidden sm:block h-10 w-px bg-border" />
            <div>
              <p className="font-display text-2xl text-foreground">{stats.utilisateursActifs}</p>
              <p className="font-body text-xs text-muted-foreground">Clients actifs</p>
            </div>
            <div className="sm:ml-auto">
              <Link to="/admin/avis" className="flex items-center gap-1 text-xs font-body text-primary hover:underline">
                Voir les avis <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
