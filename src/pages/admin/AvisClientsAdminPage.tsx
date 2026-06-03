import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Star, Plus, Edit2, Trash2, X, ToggleLeft, ToggleRight,
  Check, Clock, Ban, BarChart2, Search, ChevronDown, ChevronUp,
  UserCircle, ShieldCheck, RotateCcw, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPost, adminPatch, adminDelete } from '@/services/adminApiService';

type PageType  = 'consultations' | 'abonnement';
type Source    = 'admin' | 'client';
type Statut    = 'en_attente' | 'approuve' | 'refuse';
type Tab       = 'attente' | 'publies' | 'analyse';

interface Testimonial {
  _id: string;
  nom: string;
  texte: string;
  note: number;
  page: PageType;
  actif: boolean;
  source: Source;
  statut: Statut;
  email?: string;
  createdAt: string;
}

const EMPTY: Omit<Testimonial, '_id' | 'createdAt'> = {
  nom: '', texte: '', note: 5, page: 'consultations',
  actif: true, source: 'admin', statut: 'approuve', email: '',
};

const PAGE_LABELS: Record<PageType, string> = {
  consultations: 'Consultations',
  abonnement:    'Abonnement',
};

const TEXT_MAX = 1000;

// ─── Stars ───────────────────────────────────────────────────────────────────

function Stars({ note, size = 'sm' }: { note: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`${cls} ${i < note ? 'fill-amber-400 text-amber-400' : 'text-border'}`} />
      ))}
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)} className="focus:outline-none"
        >
          <Star className={`w-6 h-6 transition-colors ${n <= (hover || value) ? 'fill-amber-400 text-amber-400' : 'text-border'}`} />
        </button>
      ))}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function TestimonialCard({
  item, onApprove, onReject, onToggle, onEdit, onDelete, onRepublish,
  showActions = 'all', isLoading = false,
}: {
  item: Testimonial;
  onApprove?:   (id: string) => void;
  onReject?:    (id: string) => void;
  onToggle?:    (item: Testimonial) => void;
  onEdit?:      (item: Testimonial) => void;
  onDelete?:    (id: string) => void;
  onRepublish?: (id: string) => void;
  showActions?: 'pending' | 'published' | 'refused' | 'all';
  isLoading?:   boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  return (
    <div className={`bg-background border border-border rounded-lg p-4 flex flex-col gap-3 transition-opacity ${isLoading ? 'opacity-60 pointer-events-none' : ''} ${!item.actif ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Stars note={item.note} />
          <span className="font-body text-xs text-muted-foreground">{PAGE_LABELS[item.page]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {item.source === 'client'
            ? <UserCircle className="w-3.5 h-3.5 text-primary" />
            : <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="font-body text-[10px] uppercase tracking-wide text-muted-foreground">
            {item.source === 'client' ? 'Client' : 'Admin'}
          </span>
        </div>
      </div>

      <p className="font-body text-sm text-muted-foreground italic flex-1 line-clamp-4">"{item.texte}"</p>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div>
          <p className="font-display text-sm text-foreground">{item.nom}</p>
          {item.email && <p className="font-body text-xs text-muted-foreground">{item.email}</p>}
          <p className="font-body text-xs text-muted-foreground">
            {new Date(item.createdAt).toLocaleDateString('fr-FR')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {showActions === 'pending' && onApprove && (
            <button onClick={() => onApprove(item._id)} title="Approuver"
              className="p-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 transition-colors text-emerald-700">
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          {showActions === 'pending' && onReject && (
            <button onClick={() => onReject(item._id)} title="Refuser"
              className="p-1.5 rounded-md bg-red-50 hover:bg-red-100 transition-colors text-destructive">
              <Ban className="w-3.5 h-3.5" />
            </button>
          )}
          {showActions === 'refused' && onRepublish && (
            <button onClick={() => onRepublish(item._id)} title="Remettre en attente"
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors text-blue-700 text-xs font-body">
              <RotateCcw className="w-3 h-3" /> Republier
            </button>
          )}
          {(showActions === 'published' || showActions === 'all') && onToggle && (
            <button onClick={() => onToggle(item)}
              className={`transition-colors ${item.actif ? 'text-emerald-600' : 'text-muted-foreground'}`}
              title={item.actif ? 'Masquer' : 'Afficher'}>
              {item.actif ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
          )}
          {(showActions === 'published' || showActions === 'all') && onEdit && (
            <button onClick={() => onEdit(item)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          {onDelete && (
            confirming ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { onDelete(item._id); setConfirming(false); }}
                  className="p-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  title="Confirmer la suppression"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                  title="Annuler"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AvisClientsAdminPage() {
  const [all,        setAll]        = useState<Testimonial[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<Tab>('attente');
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [showRefused, setShowRefused] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [form,     setForm]     = useState<Omit<Testimonial, '_id' | 'createdAt'>>(EMPTY);
  const [saving,   setSaving]   = useState(false);

  const [pageFilter, setPageFilter] = useState<PageType | 'all'>('all');
  const [search,     setSearch]     = useState('');
  const [sortDir,    setSortDir]    = useState<'desc' | 'asc'>('desc');

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    adminGet<{ data: Testimonial[] }>('/testimonials/all')
      .then(r => { if (mounted) setAll(r.data); })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Erreur chargement'))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  // ── Derived lists ─────────────────────────────────────────────────────────

  const pending  = useMemo(() => all.filter(t => t.statut === 'en_attente'), [all]);
  const refused  = useMemo(() => all.filter(t => t.statut === 'refuse'),     [all]);

  const published = useMemo(() => {
    let list = all.filter(t => t.statut === 'approuve');
    if (pageFilter !== 'all') list = list.filter(t => t.page === pageFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.nom.toLowerCase().includes(q) || t.texte.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => sortDir === 'desc'
      ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [all, pageFilter, search, sortDir]);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const approved = all.filter(t => t.statut === 'approuve');
    const avg = approved.length
      ? +(approved.reduce((s, t) => s + t.note, 0) / approved.length).toFixed(1)
      : 0;
    const byNote = [5, 4, 3, 2, 1].map(n => ({
      n, count: approved.filter(t => t.note === n).length,
    }));
    return {
      avg,
      total:        approved.length,
      byNote,
      consultCount: approved.filter(t => t.page === 'consultations').length,
      abonnCount:   approved.filter(t => t.page === 'abonnement').length,
      clientCount:  approved.filter(t => t.source === 'client').length,
      pendingCount: pending.length,
      refusedCount: refused.length,
    };
  }, [all, pending.length, refused.length]);

  // ── Loading helpers ───────────────────────────────────────────────────────

  const startLoading = (id: string) => setLoadingIds(prev => new Set(prev).add(id));
  const stopLoading  = (id: string) => setLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  const isLoading    = (id: string) => loadingIds.has(id);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleApprove = useCallback(async (id: string) => {
    if (isLoading(id)) return;
    startLoading(id);
    try {
      const res = await adminPatch<{ data: Testimonial }>(`/testimonials/${id}`, { statut: 'approuve', actif: true });
      setAll(prev => prev.map(t => t._id === id ? res.data : t));
      toast.success('Témoignage approuvé et publié');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); }
    finally { stopLoading(id); }
  }, [loadingIds]);

  const handleReject = useCallback(async (id: string) => {
    if (isLoading(id)) return;
    startLoading(id);
    try {
      const res = await adminPatch<{ data: Testimonial }>(`/testimonials/${id}`, { statut: 'refuse', actif: false });
      setAll(prev => prev.map(t => t._id === id ? res.data : t));
      toast.info('Témoignage refusé');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); }
    finally { stopLoading(id); }
  }, [loadingIds]);

  const handleRepublish = useCallback(async (id: string) => {
    if (isLoading(id)) return;
    startLoading(id);
    try {
      const res = await adminPatch<{ data: Testimonial }>(`/testimonials/${id}`, { statut: 'en_attente', actif: false });
      setAll(prev => prev.map(t => t._id === id ? res.data : t));
      toast.success('Témoignage remis en attente de validation');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); }
    finally { stopLoading(id); }
  }, [loadingIds]);

  const handleToggle = useCallback(async (item: Testimonial) => {
    if (isLoading(item._id)) return;
    startLoading(item._id);
    try {
      const res = await adminPatch<{ data: Testimonial }>(`/testimonials/${item._id}`, { actif: !item.actif });
      setAll(prev => prev.map(t => t._id === item._id ? res.data : t));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); }
    finally { stopLoading(item._id); }
  }, [loadingIds]);

  const handleDelete = useCallback(async (id: string) => {
    if (isLoading(id)) return;
    startLoading(id);
    try {
      await adminDelete(`/testimonials/${id}`);
      setAll(prev => prev.filter(t => t._id !== id));
      toast.success('Témoignage supprimé');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur suppression'); }
    finally { stopLoading(id); }
  }, [loadingIds]);

  function openNew() {
    setForm({ ...EMPTY, page: pageFilter === 'all' ? 'consultations' : pageFilter });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(item: Testimonial) {
    setForm({
      nom: item.nom, texte: item.texte, note: item.note, page: item.page,
      actif: item.actif, source: item.source, statut: item.statut, email: item.email || '',
    });
    setEditId(item._id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.nom.trim())  { toast.error('Le nom est requis');        return; }
    if (!form.texte.trim()) { toast.error('Le témoignage est requis'); return; }
    if (form.texte.length > TEXT_MAX) { toast.error(`Témoignage trop long (max ${TEXT_MAX} caractères)`); return; }
    setSaving(true);
    try {
      if (editId) {
        const res = await adminPatch<{ data: Testimonial }>(`/testimonials/${editId}`, form);
        setAll(prev => prev.map(t => t._id === editId ? res.data : t));
        toast.success('Témoignage mis à jour');
      } else {
        const res = await adminPost<{ data: Testimonial }>('/testimonials', form);
        setAll(prev => [...prev, res.data]);
        toast.success('Témoignage créé');
      }
      setShowForm(false);
      setEditId(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur sauvegarde'); }
    finally { setSaving(false); }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl text-foreground">Avis clients</h2>
          <p className="font-body text-sm text-muted-foreground">
            {kpis.total} publiés · {kpis.pendingCount} en attente
            {kpis.refusedCount > 0 && ` · ${kpis.refusedCount} refusé${kpis.refusedCount > 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nouveau témoignage
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          ['attente', <Clock className="w-4 h-4" />,    `En attente (${kpis.pendingCount})`],
          ['publies', <Star  className="w-4 h-4" />,    `Publiés (${kpis.total})`],
          ['analyse', <BarChart2 className="w-4 h-4" />, 'Analyse'],
        ] as const).map(([key, icon, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className={`flex items-center gap-2 px-4 py-2.5 font-body text-sm border-b-2 transition-colors -mb-px ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── TAB: EN ATTENTE ── */}
      {tab === 'attente' && (
        <div className="space-y-6">
          {loading ? (
            <div className="py-12 text-center font-body text-sm text-muted-foreground">Chargement…</div>
          ) : pending.length === 0 ? (
            <div className="bg-background border border-border rounded-lg p-12 text-center">
              <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-body text-muted-foreground">Aucun témoignage en attente de validation.</p>
            </div>
          ) : (
            <>
              <p className="font-body text-xs text-muted-foreground">
                {pending.length} soumission{pending.length > 1 ? 's' : ''} client{pending.length > 1 ? 's' : ''} à valider
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pending.map(t => (
                  <TestimonialCard key={t._id} item={t} showActions="pending"
                    isLoading={isLoading(t._id)}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </>
          )}

          {/* Refusés — section repliable */}
          {refused.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setShowRefused(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Ban className="w-4 h-4 text-muted-foreground" />
                  <span className="font-body text-sm text-muted-foreground">
                    {refused.length} refusé{refused.length > 1 ? 's' : ''} — cliquer pour réviser
                  </span>
                </div>
                {showRefused
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showRefused && (
                <div className="p-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {refused.map(t => (
                      <TestimonialCard key={t._id} item={t} showActions="refused"
                        isLoading={isLoading(t._id)}
                        onRepublish={handleRepublish}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: PUBLIÉS ── */}
      {tab === 'publies' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex rounded-md border border-border overflow-hidden">
                {(['all', 'consultations', 'abonnement'] as const).map(p => (
                  <button key={p} onClick={() => setPageFilter(p)}
                    className={`px-3 h-10 font-body text-sm transition-colors ${pageFilter === p ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                  >
                    {p === 'all' ? 'Tous' : PAGE_LABELS[p]}
                  </button>
                ))}
              </div>
              <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                className="flex items-center gap-1 h-10 px-3 border border-border rounded-md font-body text-sm hover:bg-muted"
              >
                {sortDir === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center font-body text-sm text-muted-foreground">Chargement…</div>
          ) : published.length === 0 ? (
            <div className="bg-background border border-border rounded-lg p-12 text-center">
              <Star className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-body text-muted-foreground">
                Aucun témoignage approuvé.{' '}
                <button onClick={() => setTab('attente')} className="text-primary hover:underline">
                  Voir les soumissions en attente
                </button>
              </p>
            </div>
          ) : (
            <>
              <p className="font-body text-xs text-muted-foreground">{published.length} témoignage{published.length > 1 ? 's' : ''}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {published.map(t => (
                  <TestimonialCard key={t._id} item={t} showActions="published"
                    isLoading={isLoading(t._id)}
                    onToggle={handleToggle}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: ANALYSE ── */}
      {tab === 'analyse' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-background border border-border rounded-lg p-4 border-l-4 border-l-amber-400">
              <p className="font-body text-xs text-muted-foreground mb-1">Note moyenne</p>
              <p className="font-display text-2xl text-foreground">{kpis.avg || '—'}/5</p>
              <p className="font-body text-xs text-muted-foreground">{kpis.total} publiés</p>
            </div>
            <div className="bg-background border border-border rounded-lg p-4 border-l-4 border-l-primary">
              <p className="font-body text-xs text-muted-foreground mb-1">Consultations</p>
              <p className="font-display text-2xl text-foreground">{kpis.consultCount}</p>
              <p className="font-body text-xs text-muted-foreground">témoignages publiés</p>
            </div>
            <div className="bg-background border border-border rounded-lg p-4 border-l-4 border-l-secondary">
              <p className="font-body text-xs text-muted-foreground mb-1">Abonnement</p>
              <p className="font-display text-2xl text-foreground">{kpis.abonnCount}</p>
              <p className="font-body text-xs text-muted-foreground">témoignages publiés</p>
            </div>
            <div className="bg-background border border-border rounded-lg p-4 border-l-4 border-l-emerald-500">
              <p className="font-body text-xs text-muted-foreground mb-1">Soumis par clients</p>
              <p className="font-display text-2xl text-foreground">{kpis.clientCount}</p>
              <p className="font-body text-xs text-muted-foreground">approuvés</p>
            </div>
          </div>

          {/* Distribution des notes */}
          <div className="bg-background border border-border rounded-lg p-5">
            <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-4">Distribution des notes</p>
            {kpis.total === 0 ? (
              <p className="font-body text-sm text-muted-foreground text-center py-4">Aucun avis publié pour l'instant.</p>
            ) : (
              <div className="flex items-start gap-8">
                <div className="text-center">
                  <p className="font-display text-5xl text-foreground">{kpis.avg}</p>
                  <Stars note={Math.round(kpis.avg)} size="md" />
                  <p className="font-body text-xs text-muted-foreground mt-1">{kpis.total} avis</p>
                </div>
                <div className="flex-1 space-y-2">
                  {kpis.byNote.map(({ n, count }) => {
                    const pct = kpis.total > 0 ? Math.round((count / kpis.total) * 100) : 0;
                    return (
                      <div key={n} className="flex items-center gap-3">
                        <span className="font-body text-xs w-4 text-right">{n}</span>
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="font-body text-xs text-muted-foreground w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Alerte en attente */}
          {kpis.pendingCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="font-body text-sm font-medium text-amber-800">
                    {kpis.pendingCount} témoignage{kpis.pendingCount > 1 ? 's' : ''} en attente
                  </p>
                  <p className="font-body text-xs text-amber-700">Soumis par des clients depuis le site</p>
                </div>
              </div>
              <button onClick={() => setTab('attente')}
                className="px-3 py-1.5 bg-amber-600 text-white rounded-md font-body text-sm hover:bg-amber-700 transition-colors">
                Valider
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Formulaire modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50">
          <div className="bg-background rounded-xl w-full max-w-lg p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-foreground">
                {editId ? 'Modifier' : 'Nouveau'} témoignage
              </h3>
              <button onClick={() => setShowForm(false)}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Nom *</label>
                  <input
                    value={form.nom}
                    onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    maxLength={100}
                    className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Ex : Marie-Claire O."
                  />
                </div>
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Page</label>
                  <select
                    value={form.page}
                    onChange={e => setForm(f => ({ ...f, page: e.target.value as PageType }))}
                    className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="consultations">Consultations</option>
                    <option value="abonnement">Abonnement</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  maxLength={200}
                  className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="client@exemple.com (optionnel)"
                />
              </div>
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Note</label>
                <StarPicker value={form.note} onChange={n => setForm(f => ({ ...f, note: n }))} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground">Témoignage *</label>
                  <span className={`font-body text-xs ${form.texte.length > TEXT_MAX * 0.9 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {form.texte.length}/{TEXT_MAX}
                  </span>
                </div>
                <textarea
                  value={form.texte}
                  onChange={e => setForm(f => ({ ...f, texte: e.target.value }))}
                  maxLength={TEXT_MAX}
                  rows={4}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Ce que le client a dit…"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.actif}
                  onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <span className="font-body text-sm text-foreground">Visible sur le site</span>
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 border border-border rounded-md font-body text-sm hover:bg-muted transition-colors">
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
