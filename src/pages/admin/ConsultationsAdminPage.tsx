import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, ToggleLeft, ToggleRight, ImagePlus, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPost, adminPatch, adminDelete, adminUploadImage } from '@/services/adminApiService';

interface Consultation {
  _id: string;
  titre: string;
  description: string;
  prix: number;
  duree: string;
  tag: string;
  image: string;
  actif: boolean;
  ordre: number;
}

const EMPTY: Omit<Consultation, '_id'> = {
  titre: '', description: '', prix: 15000, duree: '60 min', tag: '', image: '', actif: true, ordre: 0,
};

const DUREES = ['30 min', '45 min', '60 min', '90 min', '120 min'];

interface Booking {
  _id: string;
  userNom: string;
  userPrenoms?: string;
  userEmail: string;
  userTelephone: string;
  titre: string;
  prix: number;
  date: string;
  creneau: string;
  mode: string;
  statut: string;
  notes?: string;
  planAlimentaire?: string;
  createdAt: string;
}

const BOOKING_STATUTS: { value: string; label: string; cls: string }[] = [
  { value: 'en_attente', label: 'En attente',  cls: 'bg-amber-50  text-amber-700  border-amber-200' },
  { value: 'confirme',   label: 'Confirmé',    cls: 'bg-blue-50   text-blue-700   border-blue-200' },
  { value: 'effectue',   label: 'Effectué',    cls: 'bg-green-50  text-green-700  border-green-200' },
  { value: 'annule',     label: 'Annulé',      cls: 'bg-red-50    text-red-700    border-red-200' },
];

// ── Helpers calendrier ────────────────────────────────────────────────────────

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toDateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

const JOURS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function ConsultationsAdminPage() {
  const [tab, setTab] = useState<'consultations' | 'reservations' | 'calendrier'>('consultations');

  const [items, setItems]           = useState<Consultation[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<Omit<Consultation, '_id'>>(EMPTY);
  const [saving, setSaving]         = useState(false);
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading]   = useState(false);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  const [bookings, setBookings]             = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [planText, setPlanText]             = useState('');
  const [calWeekStart, setCalWeekStart]     = useState<Date>(() => getMondayOfWeek(new Date()));

  useEffect(() => {
    let mounted = true;
    adminGet<{ data: Consultation[] }>('/consultations/all')
      .then(r => { if (mounted) setItems(r.data); })
      .catch(() => toast.error('Erreur chargement'))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  // Données calendrier : groupées par date pour la semaine affichée
  const calendarDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day  = addDays(calWeekStart, i);
      const key  = toDateKey(day);
      const list = bookings
        .filter(b => toDateKey(new Date(b.date)) === key)
        .sort((a, b) => a.creneau.localeCompare(b.creneau));
      return { day, key, list };
    });
  }, [calWeekStart, bookings]);

  useEffect(() => {
    if ((tab !== 'reservations' && tab !== 'calendrier') || bookings.length > 0) return;
    setBookingsLoading(true);
    adminGet<{ data: Booking[] }>('/consultation-bookings')
      .then(r => setBookings(r.data))
      .catch(() => toast.error('Erreur chargement réservations'))
      .finally(() => setBookingsLoading(false));
  }, [tab, bookings.length]);

  async function updateBookingStatut(id: string, statut: string) {
    try {
      const res = await adminPatch<{ data: Booking }>(`/consultation-bookings/${id}`, { statut });
      setBookings(prev => prev.map(b => b._id === id ? res.data : b));
      toast.success('Statut mis à jour');
    } catch { toast.error('Erreur mise à jour'); }
  }

  async function savePlan(id: string) {
    try {
      const res = await adminPatch<{ data: Booking }>(`/consultation-bookings/${id}`, { planAlimentaire: planText });
      setBookings(prev => prev.map(b => b._id === id ? res.data : b));
      toast.success('Plan alimentaire enregistré');
      setExpandedBooking(null);
    } catch { toast.error('Erreur enregistrement plan'); }
  }

  function openNew() {
    setForm(EMPTY);
    setImagePreview('');
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(c: Consultation) {
    setForm({ titre: c.titre, description: c.description, prix: c.prix, duree: c.duree, tag: c.tag, image: c.image, actif: c.actif, ordre: c.ordre });
    setImagePreview(c.image || '');
    setEditId(c._id);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setImagePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleImageFile(file: File) {
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await adminUploadImage(file);
      setForm(f => ({ ...f, image: url }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur upload image');
      setImagePreview('');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!form.titre.trim() || !form.description.trim()) { toast.error('Titre et description requis'); return; }
    setSaving(true);
    try {
      if (editId) {
        const res = await adminPatch<{ data: Consultation }>(`/consultations/${editId}`, form);
        setItems(prev => prev.map(i => i._id === editId ? res.data : i));
        toast.success('Consultation mise à jour');
      } else {
        const res = await adminPost<{ data: Consultation }>('/consultations', form);
        setItems(prev => [...prev, res.data]);
        toast.success('Consultation créée');
      }
      closeForm();
    } catch { toast.error('Erreur sauvegarde'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string, titre: string) {
    if (!confirm(`Supprimer "${titre}" ?`)) return;
    try {
      await adminDelete(`/consultations/${id}`);
      setItems(prev => prev.filter(i => i._id !== id));
      toast.success('Supprimée');
    } catch { toast.error('Erreur suppression'); }
  }

  async function toggleActif(c: Consultation) {
    try {
      const res = await adminPatch<{ data: Consultation }>(`/consultations/${c._id}`, { actif: !c.actif });
      setItems(prev => prev.map(i => i._id === c._id ? res.data : i));
    } catch { toast.error('Erreur'); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl text-foreground">Consultations</h2>
          <p className="font-body text-sm text-muted-foreground">{items.length} offre(s) · {bookings.length > 0 ? `${bookings.length} réservation(s)` : 'Onglet Réservations pour les rendez-vous'}</p>
        </div>
        {tab === 'consultations' && (
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Nouvelle consultation
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {(['consultations', 'reservations', 'calendrier'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-5 py-3 font-body text-sm border-b-2 transition-colors whitespace-nowrap ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'reservations' ? <><CalendarDays className="w-4 h-4" />Réservations{bookings.length > 0 && <span className="bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full">{bookings.length}</span>}</> : t === 'calendrier' ? <><CalendarDays className="w-4 h-4" />Calendrier</> : 'Offres'}
          </button>
        ))}
      </div>

      {/* ═══ CALENDRIER ══════════════════════════════════════════════════════════ */}
      {tab === 'calendrier' && (
        <div className="space-y-4">
          {/* Navigation semaine */}
          <div className="flex items-center justify-between bg-background border border-border rounded-xl px-4 py-3">
            <button onClick={() => setCalWeekStart(d => addDays(d, -7))} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center">
              <p className="font-body text-sm font-medium text-foreground">
                Semaine du {calWeekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au{' '}
                {addDays(calWeekStart, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {bookingsLoading && <p className="font-body text-xs text-muted-foreground">Chargement…</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalWeekStart(getMondayOfWeek(new Date()))}
                className="px-3 py-1.5 bg-muted rounded-lg font-body text-xs hover:bg-border transition-colors"
              >
                Aujourd'hui
              </button>
              <button onClick={() => setCalWeekStart(d => addDays(d, 7))} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Grille 7 jours */}
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
            {calendarDays.map(({ day, key, list }, dayIdx) => {
              const isToday = toDateKey(new Date()) === key;
              const isPast  = day < getMondayOfWeek(new Date()) && !isToday;
              return (
                <div
                  key={key}
                  className={`rounded-xl border min-h-[120px] ${isToday ? 'border-primary bg-primary/3' : 'border-border bg-background'} ${isPast ? 'opacity-60' : ''}`}
                >
                  {/* En-tête jour */}
                  <div className={`px-3 py-2 border-b ${isToday ? 'border-primary/20' : 'border-border'}`}>
                    <p className={`font-body text-xs uppercase tracking-wider ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {JOURS_FR[dayIdx]}
                    </p>
                    <p className={`font-display text-lg leading-tight ${isToday ? 'text-primary' : 'text-foreground'}`}>
                      {day.getDate()}
                    </p>
                  </div>

                  {/* Réservations du jour */}
                  <div className="p-2 space-y-1.5">
                    {list.length === 0 ? (
                      <p className="font-body text-[11px] text-muted-foreground/50 text-center py-2 italic">Libre</p>
                    ) : (
                      list.map(b => {
                        const s = BOOKING_STATUTS.find(x => x.value === b.statut) ?? BOOKING_STATUTS[0];
                        return (
                          <div key={b._id} className={`rounded-lg px-2 py-1.5 border text-[11px] font-body ${s.cls}`}>
                            <p className="font-semibold leading-tight truncate">{b.creneau}</p>
                            <p className="truncate opacity-80">{b.userPrenoms ? `${b.userPrenoms} ${b.userNom}` : b.userNom}</p>
                            <p className="truncate opacity-70">{b.titre}</p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Légende statuts */}
          <div className="flex flex-wrap gap-3 pt-1">
            {BOOKING_STATUTS.map(s => (
              <span key={s.value} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-body text-xs ${s.cls}`}>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {tab === 'reservations' ? (
        bookingsLoading ? (
          <div className="bg-background border border-border rounded-lg p-12 text-center font-body text-sm text-muted-foreground">Chargement…</div>
        ) : bookings.length === 0 ? (
          <div className="bg-background border border-border rounded-lg p-12 text-center font-body text-sm text-muted-foreground">Aucune réservation pour l'instant.</div>
        ) : (
          <div className="space-y-3">
            {bookings.map(b => {
              const statutCfg = BOOKING_STATUTS.find(s => s.value === b.statut) ?? BOOKING_STATUTS[0];
              const isExpanded = expandedBooking === b._id;
              return (
                <div key={b._id} className="bg-background border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-4 p-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`px-2.5 py-0.5 rounded-full border font-body text-xs ${statutCfg.cls}`}>{statutCfg.label}</span>
                        <span className="font-body text-xs text-muted-foreground">{b.mode}</span>
                      </div>
                      <p className="font-body text-sm font-medium text-foreground">{b.userPrenoms ? `${b.userPrenoms} ${b.userNom}` : b.userNom}</p>
                      <p className="font-body text-xs text-muted-foreground">{b.titre} · {new Date(b.date).toLocaleDateString('fr-FR')} à {b.creneau}</p>
                      <p className="font-body text-xs text-muted-foreground">{b.userTelephone} · {b.userEmail}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={b.statut}
                        onChange={e => updateBookingStatut(b._id, e.target.value)}
                        className="h-8 px-2 bg-muted border border-border rounded-md font-body text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {BOOKING_STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <button
                        onClick={() => { setExpandedBooking(isExpanded ? null : b._id); setPlanText(b.planAlimentaire ?? ''); }}
                        className="px-3 py-1.5 border border-border rounded-md font-body text-xs hover:bg-muted transition-colors"
                      >
                        {isExpanded ? 'Fermer' : 'Plan alimentaire'}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border p-4 space-y-3">
                      <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block">Plan alimentaire personnalisé</label>
                      <textarea
                        value={planText}
                        onChange={e => setPlanText(e.target.value)}
                        rows={6}
                        placeholder="Rédigez le plan alimentaire pour ce patient…"
                        className="w-full px-3 py-2 bg-muted border border-border rounded-md font-body text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => savePlan(b._id)} className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 transition-colors">Enregistrer</button>
                        <button onClick={() => setExpandedBooking(null)} className="px-4 py-2 border border-border rounded-md font-body text-sm hover:bg-muted transition-colors">Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : loading ? (
        <div className="bg-background border border-border rounded-lg p-12 text-center font-body text-sm text-muted-foreground">Chargement...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(c => (
            <div key={c._id} className={`bg-background border rounded-lg overflow-hidden flex flex-col gap-0 ${c.actif ? 'border-border' : 'border-border opacity-60'}`}>
              {c.image ? (
                <img src={c.image} alt={c.titre} className="w-full h-36 object-cover" />
              ) : (
                <div className="w-full h-36 bg-muted flex items-center justify-center">
                  <ImagePlus className="w-8 h-8 text-muted-foreground/40" />
                </div>
              )}
              <div className="p-5 flex flex-col gap-3 flex-1">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-display text-base text-foreground truncate">{c.titre}</h3>
                    {c.tag && <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full font-body text-xs">{c.tag}</span>}
                  </div>
                  <p className="font-body text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                </div>
                <div className="flex items-center gap-3 font-body text-sm">
                  <span className="font-semibold text-foreground">{c.prix.toLocaleString('fr-FR')} FCFA</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{c.duree}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <button onClick={() => toggleActif(c)} className={`flex items-center gap-1.5 font-body text-xs transition-colors ${c.actif ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {c.actif ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {c.actif ? 'Visible' : 'Masquée'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => handleDelete(c._id, c.titre)} className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulaire */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50">
          <div className="bg-background rounded-xl w-full max-w-lg p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-foreground">{editId ? 'Modifier' : 'Nouvelle'} consultation</h3>
              <button onClick={closeForm}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Titre *</label>
                <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Ex : Perte de poids équilibrée" />
              </div>
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Description *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-3 py-2 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Prix (FCFA) *</label>
                  <input type="number" value={form.prix} onChange={e => setForm(f => ({ ...f, prix: Number(e.target.value) }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Durée *</label>
                  <select value={form.duree} onChange={e => setForm(f => ({ ...f, duree: e.target.value }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {DUREES.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Tag (optionnel)</label>
                  <input value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Ex : Populaire" />
                </div>
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Ordre</label>
                  <input type="number" value={form.ordre} onChange={e => setForm(f => ({ ...f, ordre: Number(e.target.value) }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              {/* Image upload */}
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Photo</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); }}
                />
                {imagePreview ? (
                  <div className="relative w-full h-40 rounded-lg overflow-hidden border border-border">
                    <img src={imagePreview} alt="Aperçu" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { setImagePreview(''); setForm(f => ({ ...f, image: '' })); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="absolute top-2 right-2 p-1 bg-foreground/70 text-background rounded-full hover:bg-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {uploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                    className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <ImagePlus className="w-7 h-7" />
                    <span className="font-body text-xs">Cliquer pour ajouter une photo</span>
                    <span className="font-body text-xs opacity-60">JPEG, PNG, WebP · max 5 Mo</span>
                  </button>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.actif} onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))} className="w-4 h-4 rounded" />
                <span className="font-body text-sm text-foreground">Visible sur le site</span>
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={closeForm} className="flex-1 py-2 border border-border rounded-md font-body text-sm hover:bg-muted transition-colors">Annuler</button>
              <button onClick={handleSave} disabled={saving || uploading} className="flex-1 py-2 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? 'Enregistrement...' : uploading ? 'Upload en cours...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
