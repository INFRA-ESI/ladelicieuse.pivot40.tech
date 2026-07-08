import { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Search, X, AlertTriangle, TrendingUp, Package, ChevronUp, ChevronDown, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPost, adminPatch, adminDelete, adminUploadImage } from '@/services/adminApiService';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ingredient {
  _id: string;
  nom: string;
  categorie: string;
  unite: string;
  prixVente: number;
  prixAchat: number;
  stock: number;
  stockMin: number;
  image?: string;
  nutrition: { calories: number; proteines: number; glucides: number; lipides: number; fibres: number };
  actif: boolean;
  stockLevel?: string;
}

type SortKey = 'nom' | 'categorie' | 'prixVente' | 'prixAchat' | 'marge' | 'stock' | 'calories';
type SortDir = 'asc' | 'desc';

const CATEGORIES_FALLBACK = ['Bases', 'Légumes', 'Protéines', 'Garnitures', 'Sauces', 'Fruits'];
const UNITES = ['portion', 'pièce', 'litre', 'kg', 'g'];

const EMPTY_FORM = {
  nom: '', categorie: 'Bases', unite: 'portion',
  prixVente: '', prixAchat: '', stock: '', stockMin: '5', stockOptimal: '20',
  calories: '', proteines: '', glucides: '', lipides: '', fibres: '',
  image: '',
};

const marge = (i: Ingredient) => i.prixVente > 0 ? Math.round(((i.prixVente - i.prixAchat) / i.prixVente) * 100) : 0;

function MargeBadge({ pct }: { pct: number }) {
  const cls = pct >= 50 ? 'bg-green-100 text-green-700' : pct >= 25 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-body font-medium ${cls}`}>{pct}%</span>;
}

function StockBadge({ stock, min }: { stock: number; min: number }) {
  const ratio = stock / (min || 1);
  const cls = ratio >= 3 ? 'bg-green-100 text-green-700' : ratio >= 1 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-body font-medium ${cls}`}>{stock}</span>;
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/50">
      {[1,2,3,4,5,6,7].map(i => (
        <td key={i} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
      ))}
    </tr>
  );
}

function IngSortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp className="w-3 h-3 opacity-20" />;
  return dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
}

function IngTh({ label, k, sortKey, sortDir, onSort, cls = '' }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (k: SortKey) => void; cls?: string;
}) {
  return (
    <th className={`p-3 font-body text-xs uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground ${cls}`}
      onClick={() => onSort(k)}>
      <div className="flex items-center gap-1">{label}<IngSortIcon active={sortKey === k} dir={sortDir} /></div>
    </th>
  );
}

function IngF({ label, value, onChange, type = 'number', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">{label}</label>
      <input value={value} type={type} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
    </div>
  );
}

export default function IngredientsPage() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<string[]>(CATEGORIES_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('Tous');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'nom', dir: 'asc' });
  const [imagePreview, setImagePreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [ingRes, catRes] = await Promise.all([
          adminGet<{ data: Ingredient[] }>('/ingredients?limit=500'),
          adminGet<{ data: Array<{ nom: string; ordre: number }> }>('/categories/all'),
        ]);
        if (mounted) {
          setItems(ingRes.data);
          if (catRes.data.length > 0) {
            const sorted = [...catRes.data].sort((a, b) => a.ordre - b.ordre);
            setCategories(sorted.map(c => c.nom));
          }
        }
      } catch {
        if (mounted) toast.error('Erreur chargement ingrédients');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const kpis = useMemo(() => {
    const alertes = items.filter(i => i.stock <= i.stockMin).length;
    const marges = items.map(marge);
    const avgMarge = marges.length ? Math.round(marges.reduce((a, b) => a + b, 0) / marges.length) : 0;
    const valeurStock = items.reduce((sum, i) => sum + i.prixAchat * i.stock, 0);
    return { total: items.length, alertes, avgMarge, valeurStock };
  }, [items]);

  const liveMarge = useMemo(() => {
    const p = +form.prixVente;
    const c = +form.prixAchat;
    if (!p || p <= 0) return null;
    return Math.round(((p - c) / p) * 100);
  }, [form.prixVente, form.prixAchat]);

  const filtered = useMemo(() => {
    const base = items.filter(i => {
      const matchSearch = i.nom.toLowerCase().includes(search.toLowerCase());
      const matchCat = catFilter === 'Tous' || i.categorie === catFilter;
      return matchSearch && matchCat;
    });
    return base.sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sort.key === 'marge')     { va = marge(a); vb = marge(b); }
      else if (sort.key === 'calories') { va = a.nutrition.calories; vb = b.nutrition.calories; }
      else { va = (a as Record<string, unknown>)[sort.key] as string | number; vb = (b as Record<string, unknown>)[sort.key] as string | number; }
      if (typeof va === 'string') return sort.dir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sort.dir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [items, search, catFilter, sort]);

  const toggleSort = (key: SortKey) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const resetForm = () => { setForm({ ...EMPTY_FORM }); setShowForm(false); setEditId(null); setImagePreview(''); };

  const handleImageFile = async (file: File) => {
    const preview = URL.createObjectURL(file);
    setImagePreview(preview);
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
  };

  const handleSave = async () => {
    if (!form.nom.trim()) { toast.error('Nom requis'); return; }
    if (!form.prixVente || +form.prixVente <= 0) { toast.error('Prix de vente requis'); return; }
    if (!form.prixAchat || +form.prixAchat < 0) { toast.error('Coût d\'achat requis'); return; }
    if (!form.stock || +form.stock < 0) { toast.error('Stock requis'); return; }

    setSaving(true);
    const payload = {
      nom: form.nom.trim(), categorie: form.categorie, unite: form.unite,
      prixVente: +form.prixVente, prixAchat: +form.prixAchat,
      stock: +form.stock, stockMin: +form.stockMin || 0, stockOptimal: +form.stockOptimal || 0,
      image: form.image || '',
      nutrition: {
        calories: +form.calories || 0, proteines: +form.proteines || 0,
        glucides: +form.glucides || 0, lipides: +form.lipides || 0, fibres: +form.fibres || 0,
      },
    };

    try {
      if (editId) {
        const res = await adminPatch<{ data: Ingredient }>(`/ingredients/${editId}`, payload);
        setItems(prev => prev.map(i => i._id === editId ? res.data : i));
        toast.success('Ingrédient modifié');
      } else {
        const res = await adminPost<{ data: Ingredient }>('/ingredients', payload);
        setItems(prev => [...prev, res.data]);
        toast.success('Ingrédient ajouté');
      }
      resetForm();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur serveur');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (i: Ingredient) => {
    setForm({
      nom: i.nom, categorie: i.categorie, unite: i.unite,
      prixVente: String(i.prixVente), prixAchat: String(i.prixAchat),
      stock: String(i.stock), stockMin: String(i.stockMin), stockOptimal: '20',
      calories: String(i.nutrition.calories), proteines: String(i.nutrition.proteines),
      glucides: String(i.nutrition.glucides), lipides: String(i.nutrition.lipides), fibres: String(i.nutrition.fibres),
      image: i.image || '',
    });
    setImagePreview(i.image || '');
    setEditId(i._id); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await adminDelete(`/ingredients/${id}`);
      setItems(prev => prev.filter(x => x._id !== id));
      toast.success('Ingrédient supprimé');
      setDeleteConfirm(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur suppression');
    }
  };

  return (
    <div className="space-y-6 bg-muted/30 -m-6 p-6 min-h-screen">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Ingrédients</h2>
          <p className="font-body text-sm text-muted-foreground">{items.length} ingrédients gérés</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ ...EMPTY_FORM }); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 shrink-0">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Total</p>
          {loading ? <div className="h-10 bg-muted rounded animate-pulse" /> : (
            <>
              <p className="font-display text-3xl text-foreground">{kpis.total}</p>
              <p className="font-body text-xs text-muted-foreground mt-1">ingrédients actifs</p>
            </>
          )}
        </div>
        <div className={`bg-background border rounded-lg p-4 ${kpis.alertes > 0 ? 'border-red-300' : 'border-border'}`}>
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Alertes stock</p>
          {loading ? <div className="h-10 bg-muted rounded animate-pulse" /> : (
            <>
              <p className={`font-display text-3xl ${kpis.alertes > 0 ? 'text-red-500' : 'text-foreground'}`}>{kpis.alertes}</p>
              <p className="font-body text-xs text-muted-foreground mt-1">sous le seuil minimum</p>
            </>
          )}
        </div>
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Marge moyenne</p>
          {loading ? <div className="h-10 bg-muted rounded animate-pulse" /> : (
            <div className="flex items-end gap-2 mt-1">
              <p className="font-display text-3xl text-foreground">{kpis.avgMarge}%</p>
              <TrendingUp className="w-5 h-5 text-green-500 mb-1" />
            </div>
          )}
        </div>
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Valeur stock</p>
          {loading ? <div className="h-10 bg-muted rounded animate-pulse" /> : (
            <>
              <p className="font-display text-2xl text-foreground">{kpis.valeurStock.toLocaleString()}</p>
              <p className="font-body text-xs text-muted-foreground mt-1">FCFA (coût × stock)</p>
            </>
          )}
        </div>
      </div>

      {!loading && kpis.alertes > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-body text-sm font-medium text-red-700">Stock critique</p>
            <p className="font-body text-xs text-red-600 mt-1">
              {items.filter(i => i.stock <= i.stockMin).map(i => `${i.nom} (${i.stock}/${i.stockMin})`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un ingrédient…"
            className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-between gap-2 px-3 py-2 min-w-[180px] rounded-md text-xs font-body bg-background border border-border text-foreground hover:bg-muted/50 transition-colors">
              <span>{catFilter}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {['Tous', ...categories].map(c => (
              <DropdownMenuItem
                key={c}
                onClick={() => setCatFilter(c)}
                className={`text-xs font-body cursor-pointer ${catFilter === c ? 'bg-primary/10 text-primary font-medium' : ''}`}
              >
                {c}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Vue mobile en cartes (< md) ── */}
      <div className="md:hidden space-y-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-background border border-border rounded-xl p-4 animate-pulse space-y-2">
                <div className="h-4 w-1/2 bg-muted rounded" />
                <div className="h-3 w-1/3 bg-muted rounded" />
              </div>
            ))
          : filtered.length === 0
            ? <div className="text-center py-10 bg-background border border-border rounded-xl">
                <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-body text-sm text-muted-foreground">Aucun ingrédient trouvé</p>
              </div>
            : filtered.map(i => {
                const m = marge(i);
                return (
                  <div key={i._id} className="bg-background border border-border rounded-xl p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      {i.image && (
                        <img src={i.image} alt={i.nom} className="w-12 h-12 rounded-lg object-cover shrink-0 border border-border" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-body font-semibold text-foreground leading-tight">{i.nom}</p>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => handleEdit(i)} className="p-2 rounded-lg hover:bg-muted transition-colors"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            <button onClick={() => setDeleteConfirm(i._id)} className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                          </div>
                        </div>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-body bg-muted text-muted-foreground">{i.categorie}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-muted rounded-lg p-2">
                        <p className="font-body text-[10px] text-muted-foreground uppercase tracking-wide">Vente</p>
                        <p className="font-body text-sm font-semibold text-foreground">{i.prixVente.toLocaleString()}</p>
                      </div>
                      <div className="bg-muted rounded-lg p-2">
                        <p className="font-body text-[10px] text-muted-foreground uppercase tracking-wide">Marge</p>
                        <MargeBadge pct={m} />
                      </div>
                      <div className="bg-muted rounded-lg p-2">
                        <p className="font-body text-[10px] text-muted-foreground uppercase tracking-wide">Stock</p>
                        <StockBadge stock={i.stock} min={i.stockMin} />
                      </div>
                    </div>
                    {i.nutrition.calories > 0 && (
                      <p className="mt-2 font-body text-xs text-muted-foreground">{i.nutrition.calories} kcal · P {i.nutrition.proteines}g · G {i.nutrition.glucides}g · L {i.nutrition.lipides}g</p>
                    )}
                  </div>
                );
              })
        }
      </div>

      {/* ── Vue tableau desktop (≥ md) ── */}
      <div className="hidden md:block bg-background border border-border rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <IngTh label="Nom" k="nom" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} cls="text-left" />
              <IngTh label="Catégorie" k="categorie" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} cls="text-left" />
              <IngTh label="Prix vente" k="prixVente" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} cls="text-right" />
              <IngTh label="Coût" k="prixAchat" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} cls="text-right" />
              <IngTh label="Marge" k="marge" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} cls="text-center" />
              <IngTh label="Stock" k="stock" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} cls="text-center" />
              <IngTh label="Cal" k="calories" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} cls="text-right" />
              <th className="p-3 font-body text-xs uppercase tracking-wider text-muted-foreground text-right hidden lg:table-cell">P / G / L / F</th>
              <th className="p-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              : filtered.map(i => {
                  const m = marge(i);
                  return (
                    <tr key={i._id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-body font-medium text-foreground">{i.nom}</td>
                      <td className="p-3"><span className="px-2 py-0.5 rounded-full text-xs font-body bg-muted text-muted-foreground">{i.categorie}</span></td>
                      <td className="p-3 font-body text-foreground text-right">{i.prixVente.toLocaleString()}</td>
                      <td className="p-3 font-body text-muted-foreground text-right">{i.prixAchat.toLocaleString()}</td>
                      <td className="p-3 text-center"><MargeBadge pct={m} /></td>
                      <td className="p-3 text-center"><StockBadge stock={i.stock} min={i.stockMin} /></td>
                      <td className="p-3 font-body text-muted-foreground text-right">{i.nutrition.calories}</td>
                      <td className="p-3 font-body text-xs text-muted-foreground text-right hidden lg:table-cell">
                        {i.nutrition.proteines}g / {i.nutrition.glucides}g / {i.nutrition.lipides}g / {i.nutrition.fibres}g
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => handleEdit(i)} className="text-muted-foreground hover:text-foreground p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteConfirm(i._id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td colSpan={2} className="p-3 font-body text-xs text-muted-foreground">{filtered.length} ingrédient{filtered.length > 1 ? 's' : ''}</td>
                <td className="p-3 font-body text-xs font-medium text-foreground text-right">
                  {Math.round(filtered.reduce((s, i) => s + i.prixVente, 0) / filtered.length).toLocaleString()} moy.
                </td>
                <td className="p-3 font-body text-xs text-muted-foreground text-right">
                  {Math.round(filtered.reduce((s, i) => s + i.prixAchat, 0) / filtered.length).toLocaleString()} moy.
                </td>
                <td className="p-3 text-center">
                  <MargeBadge pct={Math.round(filtered.reduce((s, i) => s + marge(i), 0) / filtered.length)} />
                </td>
                <td className="p-3 font-body text-xs font-medium text-center">
                  <Package className="w-3.5 h-3.5 inline text-muted-foreground" /> {filtered.reduce((s, i) => s + i.stock, 0)}
                </td>
                <td colSpan={2} className="hidden lg:table-cell" /><td />
              </tr>
            </tfoot>
          )}
        </table>
        {!loading && filtered.length === 0 && (
          <div className="text-center py-10">
            <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="font-body text-sm text-muted-foreground">Aucun ingrédient trouvé</p>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4 py-8 overflow-y-auto" onClick={resetForm}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-display text-lg text-foreground">{editId !== null ? 'Modifier' : 'Nouvel'} ingrédient</h3>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
              <div>
                <p className="font-body text-xs uppercase tracking-wider text-primary mb-3">Identification</p>
                <div className="space-y-3">
                  <IngF label="Nom de l'ingrédient" type="text" placeholder="Ex: Laitue romaine" value={form.nom} onChange={v => setForm(f => ({ ...f, nom: v }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Catégorie</label>
                      <select value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}
                        className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                        {categories.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Unité</label>
                      <select value={form.unite} onChange={e => setForm(f => ({ ...f, unite: e.target.value }))}
                        className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                        {UNITES.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="font-body text-xs uppercase tracking-wider text-primary mb-3">Photo</p>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden" onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); }} />
                {imagePreview ? (
                  <div className="relative w-full h-40 rounded-lg overflow-hidden border border-border">
                    <img src={imagePreview} alt="Aperçu" className="w-full h-full object-cover" />
                    <button onClick={() => { setImagePreview(''); setForm(f => ({ ...f, image: '' })); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="absolute top-2 right-2 p-1 bg-foreground/70 text-background rounded-full hover:bg-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {uploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()} type="button"
                    className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                    <ImagePlus className="w-7 h-7" />
                    <span className="font-body text-xs">Cliquer pour ajouter une photo</span>
                    <span className="font-body text-xs opacity-60">JPEG, PNG, WebP · max 5 Mo</span>
                  </button>
                )}
              </div>

              <div>
                <p className="font-body text-xs uppercase tracking-wider text-primary mb-3">Prix & Coût</p>
                <div className="grid grid-cols-2 gap-3">
                  <IngF label="Prix de vente (FCFA)" placeholder="1500" value={form.prixVente} onChange={v => setForm(f => ({ ...f, prixVente: v }))} />
                  <IngF label="Coût d'achat (FCFA)" placeholder="800" value={form.prixAchat} onChange={v => setForm(f => ({ ...f, prixAchat: v }))} />
                </div>
                {liveMarge !== null && (
                  <div className={`mt-3 p-3 rounded-md flex items-center justify-between ${liveMarge >= 50 ? 'bg-green-50 border border-green-200' : liveMarge >= 25 ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'}`}>
                    <span className="font-body text-sm text-muted-foreground">Marge brute</span>
                    <div className="flex items-center gap-2">
                      <span className="font-body text-sm font-medium">{(+form.prixVente - +form.prixAchat).toLocaleString()} FCFA</span>
                      <MargeBadge pct={liveMarge} />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p className="font-body text-xs uppercase tracking-wider text-primary mb-3">Stock</p>
                <div className="grid grid-cols-2 gap-3">
                  <IngF label="Quantité en stock" placeholder="20" value={form.stock} onChange={v => setForm(f => ({ ...f, stock: v }))} />
                  <IngF label="Seuil d'alerte minimum" placeholder="5" value={form.stockMin} onChange={v => setForm(f => ({ ...f, stockMin: v }))} />
                </div>
              </div>

              <div>
                <p className="font-body text-xs uppercase tracking-wider text-primary mb-3">Valeurs nutritionnelles (par portion)</p>
                <div className="grid grid-cols-2 gap-3">
                  <IngF label="Calories (kcal)" placeholder="0" value={form.calories} onChange={v => setForm(f => ({ ...f, calories: v }))} />
                  <IngF label="Protéines (g)" placeholder="0" value={form.proteines} onChange={v => setForm(f => ({ ...f, proteines: v }))} />
                  <IngF label="Glucides (g)" placeholder="0" value={form.glucides} onChange={v => setForm(f => ({ ...f, glucides: v }))} />
                  <IngF label="Lipides (g)" placeholder="0" value={form.lipides} onChange={v => setForm(f => ({ ...f, lipides: v }))} />
                  <IngF label="Fibres (g)" placeholder="0" value={form.fibres} onChange={v => setForm(f => ({ ...f, fibres: v }))} />
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 disabled:opacity-60">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button onClick={resetForm} className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md hover:bg-muted/70">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg text-foreground mb-2">Supprimer cet ingrédient ?</h3>
            <p className="font-body text-sm text-muted-foreground mb-1">
              {items.find(i => i._id === deleteConfirm)?.nom}
            </p>
            <p className="font-body text-xs text-muted-foreground mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 bg-destructive text-destructive-foreground text-sm font-body rounded-md hover:bg-destructive/90">Supprimer</button>
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
