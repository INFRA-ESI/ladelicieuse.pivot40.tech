import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, ArrowUpRight, Star, AlertTriangle } from '@/components/icons';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Link } from 'react-router-dom';
import { adminGet } from '@/services/adminApiService';
import { useRealtime } from '@/hooks/useRealtime';
import { clearRequestCache } from '@/lib/requestCache';
import { toast } from 'sonner';
import { ORDER_STATUS, type OrderStatus } from '@/lib/orderStatus';

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

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className}`} />;
}

export default function DashboardPage() {
  const [stats, setStats]     = useState<DashStats | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [topMeals, setTopMeals] = useState<TopMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState<7 | 30>(30);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [s, r, t] = await Promise.all([
          adminGet<{ data: DashStats }>('/dashboard/stats', { ttl: 30_000 }),
          adminGet<{ data: RevenuePoint[] }>('/dashboard/revenue', { ttl: 30_000 }),
          adminGet<{ data: TopMeal[] }>('/dashboard/top-meals', { ttl: 30_000 }),
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
  }, [reloadTick]);

  // Temps réel : un signal vide le cache de 30 s puis recharge les chiffres, sans clignotement.
  useRealtime('admin', ['order:created', 'order:status'], { refresh: () => { clearRequestCache(); setReloadTick(t => t + 1); } });

  // Série affichée : 7 jours (un point par jour de la semaine) ou 30 jours (date jj-mm).
  const revenueSeries = periode === 7
    ? (() => {
        const days: { label: string; revenus: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          const found = revenue.find(r => r._id === key);
          days.push({ label: JOURS[d.getDay()], revenus: found?.revenu ?? 0 });
        }
        return days;
      })()
    : revenue.slice(-30).map(r => ({ label: r._id.slice(5), revenus: r.revenu }));

  const statusEntries = Object.entries(stats?.commandesParStatut ?? {});
  const totalCommandes = statusEntries.reduce((s, [, v]) => s + v, 0);
  const statusRanking = statusEntries
    .map(([k, v]) => ({ name: ORDER_STATUS[k as OrderStatus]?.label ?? k, value: v }))
    .sort((a, b) => b.value - a.value);

  const kpis = [
    {
      label: 'Revenus aujourd\'hui',
      value: stats ? `${(stats.revenueAujourdhui ?? 0).toLocaleString('fr-FR')} FCFA` : '—',
      sub: `${(stats?.revenueMensuel ?? 0).toLocaleString('fr-FR')} FCFA ce mois`,
      up: true,
    },
    {
      label: 'Commandes aujourd\'hui',
      value: stats?.commandesAujourdhui ?? '—',
      sub: `${totalCommandes} total`,
      up: (stats?.commandesAujourdhui ?? 0) > 0,
    },
    {
      label: 'Clients actifs',
      value: stats?.utilisateursActifs ?? '—',
      sub: `${stats?.abonnementsActifs ?? 0} abonnés actifs`,
      up: true,
    },
    {
      label: 'Alertes stock',
      value: stats?.alertesStock ?? '—',
      sub: stats?.alertesStock ? 'Réapprovisionnement requis' : 'Stock OK',
      up: (stats?.alertesStock ?? 0) === 0,
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
            <span className="font-body text-sm text-muted-foreground block mb-3">{kpi.label}</span>
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
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="font-body text-sm text-amber-700">
            <strong>{stats!.alertesStock} ingrédient{stats!.alertesStock > 1 ? 's' : ''}</strong> en rupture ou stock critique.{' '}
            <Link to="/admin/stocks" className="underline">Voir les stocks</Link>
          </p>
        </div>
      )}

      {/* Graphique principal : une seule courbe, période au choix */}
      <div className="bg-background border border-border rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-display text-lg text-foreground">Revenus</h3>
          <div className="inline-flex border border-border rounded-md overflow-hidden" role="group" aria-label="Période">
            {([7, 30] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriode(p)}
                aria-pressed={periode === p}
                className={`px-3 py-1.5 font-body text-xs transition-colors ${periode === p ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              >
                {p} jours
              </button>
            ))}
          </div>
        </div>
        {loading ? <Skeleton className="h-72 w-full" /> : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [`${v.toLocaleString('fr-FR')} FCFA`, 'Revenus']} />
              <Area type="monotone" dataKey="revenus" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.12)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Listes classées : statuts et produits */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-background border border-border rounded-lg p-6 shadow-sm">
          <h3 className="font-display text-lg text-foreground mb-4">Commandes par statut</h3>
          {loading ? <Skeleton className="h-48 w-full" /> : statusRanking.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground text-center py-12">Aucune donnée disponible</p>
          ) : (
            <ul className="space-y-3">
              {statusRanking.map((s, i) => (
                <li key={s.name}>
                  <div className="flex items-center justify-between">
                    <span className="font-body text-sm text-foreground">{s.name}</span>
                    <span className="font-body text-xs text-muted-foreground tabular-nums">{s.value}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                    <div
                      className={`h-1.5 rounded-full ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                      style={{ width: `${Math.round((s.value / (statusRanking[0]?.value || 1)) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2 bg-background border border-border rounded-lg p-6 shadow-sm">
          <h3 className="font-display text-lg text-foreground mb-4">Top produits commandés</h3>
          {loading ? <Skeleton className="h-48 w-full" /> : topMeals.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground text-center py-12">Aucune donnée disponible</p>
          ) : (
            <div className="space-y-3">
              {topMeals.map((p, i) => (
                <div key={p._id} className="flex items-center gap-3">
                  <span className="w-6 text-xs font-body text-muted-foreground tabular-nums shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-body text-sm text-foreground truncate">{p._id}</p>
                      <p className="font-body text-xs text-muted-foreground shrink-0 ml-2 tabular-nums">{p.total} ventes</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                      <div
                        className={`h-1.5 rounded-full ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                        style={{ width: `${Math.round((p.total / (topMeals[0]?.total || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <p className="font-body text-xs text-muted-foreground shrink-0 tabular-nums">{p.revenu.toLocaleString('fr-FR')} F</p>
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
