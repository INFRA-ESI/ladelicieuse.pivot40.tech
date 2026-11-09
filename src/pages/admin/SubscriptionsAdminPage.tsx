import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Pause, Play, Search, X, Repeat, Loader2 } from '@/components/icons';
import { toast } from 'sonner';
import { adminGet, adminPatch } from '@/services/adminApiService';
import { usePagination } from '@/hooks/usePagination';
import { useRealtime } from '@/hooks/useRealtime';
import TablePagination from '@/components/admin/TablePagination';

type Statut = 'en_attente' | 'active' | 'paused' | 'cancelled';
type Filtre = 'tous' | Statut;

interface Abonnement {
  _id: string;
  clientNom: string;
  clientEmail: string;
  clientTelephone: string;
  planName: string;
  billing: 'weekly' | 'monthly' | 'annual';
  price: number;
  statut: Statut;
  /** true : paiement en ligne retrouvé ; false : non retrouvé (espèces ou en ligne) ; absent : abonnement ancien. */
  paiementVerifie?: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
}

const STATUT_META: Record<Statut, { label: string; cls: string }> = {
  en_attente: { label: 'En attente', cls: 'text-amber-700' },
  active:     { label: 'Actif',      cls: 'text-primary' },
  paused:     { label: 'En pause',   cls: 'text-muted-foreground' },
  cancelled:  { label: 'Annulé',     cls: 'text-destructive' },
};

const FILTRES: { value: Filtre; label: string }[] = [
  { value: 'tous',       label: 'Tous les statuts' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'active',     label: 'Actifs' },
  { value: 'paused',     label: 'En pause' },
  { value: 'cancelled',  label: 'Annulés' },
];

const FACTURATION: Record<Abonnement['billing'], { label: string; unite: string }> = {
  weekly:  { label: 'Hebdomadaire',        unite: 'semaine' },
  monthly: { label: 'Mensuel',             unite: 'mois' },
  annual:  { label: 'Annuel (historique)', unite: 'mois' },
};

const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;
const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

export default function SubscriptionsAdminPage() {
  const [items, setItems]       = useState<Abonnement[]>([]);
  const [mrr, setMrr]           = useState(0);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filtre, setFiltre]     = useState<Filtre>('tous');
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [aAnnuler, setAAnnuler] = useState<Abonnement | null>(null);

  // Toujours rechargé (ttl 0) : une nouvelle demande peut arriver à tout moment.
  const load = useCallback(async () => {
    try {
      const [liste, stats] = await Promise.all([
        adminGet<{ data: Abonnement[] }>('/subscriptions?limit=200', { ttl: 0 }),
        adminGet<{ data: { mrr: number } }>('/subscriptions/stats', { ttl: 0 }),
      ]);
      setItems(liste.data);
      setMrr(stats.data.mrr);
    } catch {
      toast.error('Erreur chargement des abonnements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Temps réel : une nouvelle demande ou un changement fait ailleurs recharge la liste.
  useRealtime('admin', ['subscription:created', 'subscription:updated'], { refresh: () => { void load(); } });

  const changerStatut = async (sub: Abonnement, statut: Statut) => {
    setBusyId(sub._id);
    try {
      const res = await adminPatch<{ data: Abonnement }>(`/subscriptions/${sub._id}/status`, { statut });
      setItems(prev => prev.map(s => (s._id === sub._id ? { ...s, ...res.data } : s)));
      toast.success(`Abonnement de ${sub.clientNom} : ${STATUT_META[statut].label.toLowerCase()}`);
      void load(); // met à jour le revenu mensuel
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur mise à jour');
    } finally {
      setBusyId(null);
      setAAnnuler(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(s =>
      (filtre === 'tous' || s.statut === filtre) &&
      (!q || [s.clientNom, s.clientEmail, s.clientTelephone, s.planName].some(v => v?.toLowerCase().includes(q))),
    );
  }, [items, search, filtre]);

  const pagination = usePagination(filtered, `${search}|${filtre}`);
  const compte = (s: Statut) => items.filter(i => i.statut === s).length;
  const enAttente = compte('en_attente');

  const actions = (sub: Abonnement) => {
    const occupe = busyId === sub._id;
    const bouton = 'flex items-center gap-1 px-3 py-1.5 text-xs font-body rounded-md disabled:opacity-50 transition-colors';
    return (
      <div className="flex flex-wrap gap-2 justify-end">
        {(sub.statut === 'en_attente' || sub.statut === 'paused') && (
          <button disabled={occupe} onClick={() => changerStatut(sub, 'active')} className={`${bouton} bg-primary text-primary-foreground hover:bg-primary/90`}>
            {sub.statut === 'en_attente' ? <Check className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {sub.statut === 'en_attente' ? 'Activer' : 'Reprendre'}
          </button>
        )}
        {sub.statut === 'active' && (
          <button disabled={occupe} onClick={() => changerStatut(sub, 'paused')} className={`${bouton} bg-muted text-foreground hover:bg-muted/80`}>
            <Pause className="w-3 h-3" /> Pause
          </button>
        )}
        {sub.statut !== 'cancelled' && (
          <button disabled={occupe} onClick={() => setAAnnuler(sub)} className={`${bouton} bg-destructive/10 text-destructive hover:bg-destructive/20`}>
            <X className="w-3 h-3" /> Annuler
          </button>
        )}
      </div>
    );
  };

  const paiement = (sub: Abonnement) => {
    if (sub.paiementVerifie === true) return <span className="text-xs text-green-700">Paiement en ligne vérifié</span>;
    if (sub.paiementVerifie === false && sub.statut === 'en_attente') return <span className="text-xs text-amber-700">Paiement non reçu</span>;
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Abonnements</h2>
        <p className="font-body text-sm text-muted-foreground">
          {items.length} abonnement{items.length > 1 ? 's' : ''} · {compte('active')} actif{compte('active') > 1 ? 's' : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">En attente d'activation</p>
          <p className="font-display text-2xl text-foreground mt-1">{enAttente}</p>
        </div>
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">Abonnements actifs</p>
          <p className="font-display text-2xl text-foreground mt-1">{compte('active')}</p>
        </div>
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">Revenu mensuel estimé</p>
          <p className="font-display text-2xl text-foreground mt-1">{fcfa(mrr)}</p>
        </div>
      </div>

      {enAttente > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 font-body text-sm text-amber-900">
          {enAttente} demande{enAttente > 1 ? 's' : ''} en attente de paiement. Activez-la{enAttente > 1 ? 's' : ''} à la réception du règlement :
          la période d'abonnement démarre alors.
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un client, un téléphone, une formule…"
            className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={filtre}
          onChange={e => setFiltre(e.target.value as Filtre)}
          aria-label="Filtrer par statut"
          className="h-10 md:w-56 px-3 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {FILTRES.map(f => (
            <option key={f.value} value={f.value}>
              {f.label} ({f.value === 'tous' ? items.length : compte(f.value)})
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-background border border-border rounded-lg p-12 text-center">
          <Repeat className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-body text-sm text-muted-foreground">Aucun abonnement trouvé.</p>
        </div>
      ) : (
        <>
          {/* Tableau (≥ md) */}
          <div className="hidden md:block bg-background border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  {['Client', 'Formule', 'Prix', 'Période', 'Statut', ''].map(h => (
                    <th key={h} className="p-3 font-body text-xs uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map(sub => (
                  <tr key={sub._id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 align-top">
                    <td className="p-3">
                      <p className="font-body font-medium text-foreground">{sub.clientNom}</p>
                      <p className="font-body text-xs text-muted-foreground">{sub.clientTelephone}</p>
                      <p className="font-body text-xs text-muted-foreground">{sub.clientEmail}</p>
                    </td>
                    <td className="p-3">
                      <p className="font-body text-foreground">{sub.planName}</p>
                      <p className="font-body text-xs text-muted-foreground">{FACTURATION[sub.billing].label}</p>
                    </td>
                    <td className="p-3 font-body text-foreground whitespace-nowrap">
                      {fcfa(sub.price)} <span className="text-xs text-muted-foreground">/ {FACTURATION[sub.billing].unite}</span>
                    </td>
                    <td className="p-3 font-body text-xs text-muted-foreground whitespace-nowrap">
                      {date(sub.startDate)} → {date(sub.endDate)}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-body ${STATUT_META[sub.statut].cls}`}>{STATUT_META[sub.statut].label}</span>
                      <div className="mt-1">{paiement(sub)}</div>
                    </td>
                    <td className="p-3">{actions(sub)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartes (< md) */}
          <div className="md:hidden space-y-3">
            {pagination.pageItems.map(sub => (
              <div key={sub._id} className="bg-background border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-body font-semibold text-foreground">{sub.clientNom}</p>
                    <p className="font-body text-xs text-muted-foreground">{sub.clientTelephone}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-body shrink-0 ${STATUT_META[sub.statut].cls}`}>{STATUT_META[sub.statut].label}</span>
                </div>
                <p className="font-body text-sm text-foreground">
                  {sub.planName} · {FACTURATION[sub.billing].label} · {fcfa(sub.price)}
                </p>
                <p className="font-body text-xs text-muted-foreground">{date(sub.startDate)} → {date(sub.endDate)}</p>
                {paiement(sub)}
                {actions(sub)}
              </div>
            ))}
          </div>

          <TablePagination {...pagination} onPageChange={pagination.setPage} />
        </>
      )}

      {aAnnuler && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={() => setAAnnuler(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg text-foreground mb-2">Annuler cet abonnement ?</h3>
            <p className="font-body text-sm text-muted-foreground mb-6">
              {aAnnuler.clientNom} · {aAnnuler.planName}. Un abonnement annulé ne peut plus être réactivé depuis cette page.
            </p>
            <div className="flex gap-3">
              <button onClick={() => changerStatut(aAnnuler, 'cancelled')} className="flex-1 py-2.5 bg-destructive text-destructive-foreground text-sm font-body rounded-md hover:bg-destructive/90">
                Annuler l'abonnement
              </button>
              <button onClick={() => setAAnnuler(null)} className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">Retour</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
