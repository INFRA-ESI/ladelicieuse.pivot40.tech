import {
  Search, UserCheck, UserX, Eye, X, Mail, Phone, Star, Award,
  Trash2, AlertTriangle, ChevronLeft, ChevronRight, ShoppingBag, Loader2,
  MailCheck, MailX, ShieldAlert,
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { adminGet, adminDelete } from '@/services/adminApiService';

interface RawUser {
  _id: string;
  nom: string;
  prenoms: string;
  email: string;
  telephone: string;
  adresse: string;
  points: number;
  tier: 'bronze' | 'argent' | 'or' | 'platine';
  statut: 'actif' | 'inactif';
  emailVerified: boolean;
  subscription?: { planName: string; status: string; billing: string; endDate: string };
  createdAt: string;
  updatedAt: string;
}

interface RawOrder {
  _id: string;
  numero?: string;
  statut: string;
  total: number;
  modePaiement: string;
  modeCommande: string;
  items: { nom: string; qty: number; prix: number }[];
  createdAt: string;
}

const TIER_COLOR: Record<string, string> = {
  bronze:  'bg-amber-100 text-amber-800',
  argent:  'bg-gray-100 text-gray-700',
  or:      'bg-yellow-100 text-yellow-800',
  platine: 'bg-violet-100 text-violet-700',
};

const TIER_LABEL: Record<string, string> = { bronze: 'Bronze', argent: 'Argent', or: 'Or', platine: 'Platine' };

const fmtDate  = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');
const fmtPrice = (n: number) => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';

const PAGE_SIZE = 20;

function Skeleton() {
  return (
    <tr className="border-b border-border/50">
      {[1,2,3,4,5,6].map(i => (
        <td key={i} className="p-4"><div className="h-4 bg-muted rounded animate-pulse" /></td>
      ))}
    </tr>
  );
}

export default function UsersPage() {
  const [users, setUsers]       = useState<RawUser[]>([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [loading, setLoading]   = useState(true);

  // Filters
  const [search, setSearch]           = useState('');
  const [tierFilter, setTierFilter]   = useState('tous');
  const [statutFilter, setStatutFilter] = useState('tous');
  const [verifFilter, setVerifFilter] = useState('tous');
  const [page, setPage]               = useState(1);

  // Modal state
  const [selectedUser, setSelectedUser]       = useState<RawUser | null>(null);
  const [userOrders, setUserOrders]           = useState<RawOrder[]>([]);
  const [ordersLoading, setOrdersLoading]     = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting]               = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search)                    params.set('search',        search);
      if (tierFilter   !== 'tous')   params.set('tier',          tierFilter);
      if (statutFilter !== 'tous')   params.set('statut',        statutFilter);
      if (verifFilter  !== 'tous')   params.set('emailVerified', verifFilter);
      const res = await adminGet<{ data: RawUser[]; total: number; pages: number }>(`/users?${params}`);
      setUsers(res.data);
      setTotal(res.total);
      setPages(res.pages);
    } catch {
      toast.error('Erreur chargement utilisateurs');
    } finally {
      setLoading(false);
    }
  }, [page, search, tierFilter, statutFilter, verifFilter]);

  useEffect(() => {
    const t = setTimeout(() => loadUsers(), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [loadUsers, search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, tierFilter, statutFilter, verifFilter]);

  const openUserDetail = async (u: RawUser) => {
    setSelectedUser(u);
    setUserOrders([]);
    setOrdersLoading(true);
    try {
      const res = await adminGet<{ data: RawOrder[] }>(`/users/${u._id}/orders`);
      setUserOrders(res.data);
    } catch {
      // pas de commandes
    } finally {
      setOrdersLoading(false);
    }
  };

  async function handleDelete(userId: string) {
    setDeleting(true);
    try {
      await adminDelete(`/users/${userId}`);
      setUsers(prev => prev.filter(u => u._id !== userId));
      setTotal(n => n - 1);
      setSelectedUser(null);
      setConfirmDeleteId(null);
      toast.success('Utilisateur supprimé');
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  }

  const [purging, setPurging] = useState(false);

  async function handlePurgeUnverified() {
    if (!confirm('Supprimer tous les comptes non vérifiés avec token expiré (> 24h) ?')) return;
    setPurging(true);
    try {
      const res = await adminDelete<{ deleted: number }>('/users/cleanup-unverified');
      toast.success(`${res.deleted} compte(s) purgé(s)`);
      loadUsers();
    } catch {
      toast.error('Erreur lors de la purge');
    } finally {
      setPurging(false);
    }
  }

  const stats = useMemo(() => {
    const actifs      = users.filter(u => u.statut === 'actif').length;
    const nonVerifies = users.filter(u => !u.emailVerified).length;
    const abonnes     = users.filter(u => u.subscription?.status === 'active').length;
    const avgPoints   = users.length ? Math.round(users.reduce((s, u) => s + u.points, 0) / users.length) : 0;
    return { actifs, nonVerifies, abonnes, avgPoints };
  }, [users]);

  return (
    <div className="space-y-6 bg-muted/30 -m-6 p-6 min-h-screen">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Utilisateurs</h2>
          <p className="font-body text-sm text-muted-foreground">{total} clients enregistrés</p>
        </div>
        <button
          onClick={handlePurgeUnverified}
          disabled={purging}
          className="flex items-center gap-2 px-3 py-2 text-xs font-body text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          {purging ? <span className="w-3.5 h-3.5 border-2 border-destructive/40 border-t-destructive rounded-full animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          Purger comptes expirés
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total clients',  value: total,               color: 'text-foreground' },
          { label: 'Actifs',         value: stats.actifs,        color: 'text-secondary'  },
          { label: 'Non vérifiés',   value: stats.nonVerifies,   color: stats.nonVerifies > 0 ? 'text-amber-600' : 'text-foreground' },
          { label: 'Points moy.',    value: stats.avgPoints,     color: 'text-foreground' },
        ].map(stat => (
          <div key={stat.label} className="bg-background border border-border rounded-lg p-4 shadow-sm">
            <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            {loading ? <div className="h-8 w-16 bg-muted rounded animate-pulse mt-1" /> :
              <p className={`font-display text-2xl mt-1 ${stat.color}`}>{stat.value}</p>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Nom, email, téléphone…"
            className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={tierFilter}
          onChange={e => setTierFilter(e.target.value)}
          className="h-10 px-3 bg-background border border-border rounded-md font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="tous">Tous les tiers</option>
          <option value="bronze">Bronze</option>
          <option value="argent">Argent</option>
          <option value="or">Or</option>
          <option value="platine">Platine</option>
        </select>
        <select
          value={statutFilter}
          onChange={e => setStatutFilter(e.target.value)}
          className="h-10 px-3 bg-background border border-border rounded-md font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="tous">Tous les statuts</option>
          <option value="actif">Actifs</option>
          <option value="inactif">Inactifs</option>
        </select>
        <select
          value={verifFilter}
          onChange={e => setVerifFilter(e.target.value)}
          className="h-10 px-3 bg-background border border-border rounded-md font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="tous">Vérification email</option>
          <option value="true">Email vérifié</option>
          <option value="false">Email non vérifié</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-background border border-border rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-4 font-body text-xs uppercase tracking-wider text-muted-foreground">Client</th>
              <th className="text-left p-4 font-body text-xs uppercase tracking-wider text-muted-foreground hidden md:table-cell">Téléphone</th>
              <th className="text-left p-4 font-body text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Points</th>
              <th className="text-left p-4 font-body text-xs uppercase tracking-wider text-muted-foreground">Tier</th>
              <th className="text-left p-4 font-body text-xs uppercase tracking-wider text-muted-foreground">Statut</th>
              <th className="text-left p-4 font-body text-xs uppercase tracking-wider text-muted-foreground hidden xl:table-cell">Inscription</th>
              <th className="p-4 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: PAGE_SIZE }).map((_, i) => <Skeleton key={i} />)
              : users.map(u => (
                  <tr
                    key={u._id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => openUserDetail(u)}
                  >
                    <td className="p-4">
                      <p className="font-body font-medium text-foreground">{u.prenoms ? `${u.prenoms} ${u.nom}` : u.nom}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {u.emailVerified
                          ? <MailCheck className="w-3 h-3 text-green-600 shrink-0" />
                          : <MailX    className="w-3 h-3 text-amber-500 shrink-0" />
                        }
                        <p className="font-body text-xs text-muted-foreground truncate">{u.email}</p>
                        {!u.emailVerified && (
                          <span className="shrink-0 text-xs font-body px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Non vérifié</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 font-body text-muted-foreground hidden md:table-cell">{u.telephone || '—'}</td>
                    <td className="p-4 font-body text-foreground hidden lg:table-cell">
                      <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400" />{u.points}</span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-body font-medium ${TIER_COLOR[u.tier]}`}>
                        <Award className="w-3 h-3" />{TIER_LABEL[u.tier]}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-body ${u.statut === 'actif' ? 'bg-secondary/20 text-secondary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {u.statut === 'actif' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                        {u.statut === 'actif' ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="p-4 font-body text-xs text-muted-foreground hidden xl:table-cell">{fmtDate(u.createdAt)}</td>
                    <td className="p-4">
                      <button className="text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); openUserDetail(u); }}>
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
            }
            {!loading && users.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 font-body text-sm text-muted-foreground">Aucun utilisateur trouvé</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="font-body text-xs text-muted-foreground">
            Page {page} / {pages} · {total} résultats
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-body border border-border rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />Préc.
            </button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, pages - 4));
              const p = start + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 text-xs font-body rounded-md transition-colors ${p === page ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted text-foreground'}`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page >= pages || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-body border border-border rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
            >
              Suiv.<ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/70 px-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h4 className="font-display text-lg text-foreground">Supprimer l'utilisateur</h4>
                <p className="font-body text-sm text-muted-foreground">Cette action est irréversible.</p>
              </div>
            </div>
            <p className="font-body text-sm text-foreground">
              Voulez-vous vraiment supprimer <strong>{(() => {
                const u = users.find(u => u._id === confirmDeleteId) ?? selectedUser;
                return u ? (u.prenoms ? `${u.prenoms} ${u.nom}` : u.nom) : '…';
              })()}</strong> ?
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setConfirmDeleteId(null)} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-body border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50">
                Annuler
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-body bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User detail modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={() => setSelectedUser(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background z-10">
              <div>
                <h3 className="font-display text-xl text-foreground">
                  {selectedUser.prenoms ? `${selectedUser.prenoms} ${selectedUser.nom}` : selectedUser.nom}
                </h3>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-body font-medium ${TIER_COLOR[selectedUser.tier]}`}>
                  <Award className="w-3 h-3" />{TIER_LABEL[selectedUser.tier]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setConfirmDeleteId(selectedUser._id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-body text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />Supprimer
                </button>
                <button onClick={() => setSelectedUser(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Contact */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-body text-foreground">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{selectedUser.email}</span>
                  {selectedUser.emailVerified && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Vérifié</span>}
                </div>
                {selectedUser.telephone && (
                  <div className="flex items-center gap-2 text-sm font-body text-foreground">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />{selectedUser.telephone}
                  </div>
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="font-display text-xl text-foreground flex items-center justify-center gap-1">
                    <Star className="w-4 h-4 text-amber-400" />{selectedUser.points}
                  </p>
                  <p className="font-body text-xs text-muted-foreground">Points</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="font-body text-sm text-foreground">{fmtDate(selectedUser.createdAt)}</p>
                  <p className="font-body text-xs text-muted-foreground">Inscription</p>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <span className={`inline-flex items-center gap-0.5 text-xs font-body px-1.5 py-0.5 rounded-full ${selectedUser.statut === 'actif' ? 'bg-secondary/20 text-secondary-foreground' : 'bg-muted-foreground/20 text-muted-foreground'}`}>
                    {selectedUser.statut === 'actif' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                    {selectedUser.statut === 'actif' ? 'Actif' : 'Inactif'}
                  </span>
                  <p className="font-body text-xs text-muted-foreground mt-1">Statut</p>
                </div>
              </div>

              {/* Adresse */}
              {selectedUser.adresse && (
                <div>
                  <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Adresse</p>
                  <p className="font-body text-sm text-foreground">{selectedUser.adresse}</p>
                </div>
              )}

              {/* Abonnement */}
              {selectedUser.subscription && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Abonnement</p>
                  <p className="font-body text-sm font-medium text-foreground">{selectedUser.subscription.planName}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {selectedUser.subscription.billing === 'monthly' ? 'Mensuel' : 'Annuel'} · expire le {fmtDate(selectedUser.subscription.endDate)}
                  </p>
                  <span className={`inline-block mt-1 text-xs font-body px-2 py-0.5 rounded-full ${selectedUser.subscription.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                    {selectedUser.subscription.status}
                  </span>
                </div>
              )}

              {/* Historique commandes */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                  <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">Historique des commandes</p>
                </div>
                {ordersLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : userOrders.length === 0 ? (
                  <p className="font-body text-sm text-muted-foreground text-center py-4 italic">Aucune commande</p>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                    {userOrders.map(o => (
                      <div key={o._id} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-body text-xs text-muted-foreground">
                            {o.numero ?? `#${o._id.slice(-8).toUpperCase()}`} · {fmtDate(o.createdAt)}
                          </span>
                          <span className={`font-body text-xs px-2 py-0.5 rounded-full ${
                            o.statut === 'livree' ? 'bg-green-100 text-green-700' :
                            o.statut === 'annulee' ? 'bg-red-100 text-red-700' :
                            'bg-muted text-muted-foreground'
                          }`}>{o.statut.replace('_', ' ')}</span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="font-body text-xs text-muted-foreground truncate pr-2">
                            {o.items.map(i => `${i.nom} ×${i.qty}`).join(', ')}
                          </span>
                          <span className="font-display text-sm text-primary shrink-0">{fmtPrice(o.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
