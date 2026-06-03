import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Search, Loader2, X, Star, Eye, EyeOff,
  ImagePlus, ChevronUp, ChevronDown, Copy, Leaf,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPost, adminPatch, adminDelete, adminUploadImage } from '@/services/adminApiService';
import { ApiProduct, ApiCategory } from '@/types/api.types';
import { formatPrice } from '@/data/products';

// ── Constantes ────────────────────────────────────────────────────────────────

const ALLERGENS = [
  { key: 'gluten', label: 'Gluten' }, { key: 'lait', label: 'Lait' },
  { key: 'oeufs', label: 'Œufs' },  { key: 'arachides', label: 'Arachides' },
  { key: 'soja', label: 'Soja' },   { key: 'noix', label: 'Fruits à coque' },
  { key: 'poisson', label: 'Poisson' }, { key: 'crustaces', label: 'Crustacés' },
  { key: 'sesame', label: 'Sésame' }, { key: 'sulfites', label: 'Sulfites' },
];

const HEALTH_GOALS = ['Détox', 'Minceur', 'Énergie', 'Sport', 'Bien-être', 'Digestion', 'Immunité', 'Rééquilibrage'];

const TABS = ['Général', 'Médias', 'Nutrition', 'Ingrédients', 'Attributs'] as const;
type Tab = typeof TABS[number];

type SortKey = 'nom' | 'prix' | 'categorie';

// ── Types formulaire ──────────────────────────────────────────────────────────

interface IngForm {
  nom: string; quantite: number; unite: string;
  image: string; description: string; apportNutritif: string; calories: number;
}

interface ProductForm {
  nom: string; categorie: string; categorieId: string;
  description: string; descriptionCourte: string;
  prix: number; prixPromo: number | ''; portions: number; portion: string; tempsPrepMin: number;
  image: string; galerie: string[];
  nutrition: { calories: number; proteines: number; glucides: number; lipides: number; fibres: number; sucres: number; sodium: number };
  ingredients: IngForm[];
  bienfaits: string[]; allergenes: string[]; objectifsSante: string[]; conseilsConsommation: string[];
  popular: boolean; vedette: boolean; recommande: boolean; saisonnier: boolean; disponible: boolean;
}

const EMPTY_ING: IngForm = { nom: '', quantite: 0, unite: 'g', image: '', description: '', apportNutritif: '', calories: 0 };

const EMPTY_FORM: ProductForm = {
  nom: '', categorie: '', categorieId: '',
  description: '', descriptionCourte: '',
  prix: 0, prixPromo: '', portions: 1, portion: '', tempsPrepMin: 0,
  image: '', galerie: [],
  nutrition: { calories: 0, proteines: 0, glucides: 0, lipides: 0, fibres: 0, sucres: 0, sodium: 0 },
  ingredients: [],
  bienfaits: [], allergenes: [], objectifsSante: [], conseilsConsommation: [],
  popular: false, vedette: false, recommande: false, saisonnier: false, disponible: true,
};

// ── Composants UI réutilisables ───────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = 'text', placeholder = '', className = '', min }: {
  value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string; className?: string; min?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      className={`w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary ${className}`}
    />
  );
}

function NumberInput({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
    />
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function ProductsAdminPage() {
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterDispo, setFilterDispo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('nom');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Modal
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Général');
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingIng, setUploadingIng] = useState<number | null>(null);
  const mainImgRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const ingImgRef  = useRef<HTMLInputElement>(null);
  const [ingImgTarget, setIngImgTarget] = useState<number | null>(null);

  // ── Chargement initial ──────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      adminGet<{ data: ApiProduct[] }>('/meals/admin?catalog=true'),
      adminGet<{ data: ApiCategory[] }>('/categories/all').catch(() => ({ data: [] as ApiCategory[] })),
    ]).then(([mp, mc]) => {
      setProducts(mp.data ?? []);
      setCategories(mc.data ?? []);
    }).catch(() => toast.error('Chargement échoué'))
      .finally(() => setLoading(false));
  }, []);

  // ── Produits filtrés + triés ────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = [...products];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.nom.toLowerCase().includes(q) || p.categorie.toLowerCase().includes(q));
    }
    if (filterCat) list = list.filter(p => p.categorie === filterCat);
    if (filterDispo === 'true')  list = list.filter(p => p.disponible);
    if (filterDispo === 'false') list = list.filter(p => !p.disponible);
    list.sort((a, b) => {
      const va = sortKey === 'prix' ? a.prix : String(a[sortKey] ?? '');
      const vb = sortKey === 'prix' ? b.prix : String(b[sortKey] ?? '');
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [products, search, filterCat, filterDispo, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 text-muted-foreground/40" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
  }

  // ── Formulaire ──────────────────────────────────────────────────────────────
  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setTab('Général');
    setShowForm(true);
  }

  function openEdit(p: ApiProduct) {
    setEditId(p._id);
    setForm({
      nom: p.nom, categorie: p.categorie, categorieId: '',
      description: p.description ?? '',
      descriptionCourte: p.descriptionCourte ?? '',
      prix: p.prix, prixPromo: p.prixPromo ?? '',
      portions: p.portions ?? 1, portion: p.portion ?? '',
      tempsPrepMin: p.tempsPrepMin ?? 0,
      image: p.image ?? '', galerie: p.galerie ?? [],
      nutrition: {
        calories:  p.nutrition.calories,
        proteines: p.nutrition.proteines,
        glucides:  p.nutrition.glucides,
        lipides:   p.nutrition.lipides,
        fibres:    p.nutrition.fibres,
        sucres:    p.nutrition.sucres ?? 0,
        sodium:    p.nutrition.sodium ?? 0,
      },
      ingredients: (p.ingredients ?? []).map(i => ({
        nom: i.nom, quantite: i.quantite, unite: i.unite,
        image: i.image ?? '', description: i.description ?? '',
        apportNutritif: i.apportNutritif ?? '', calories: i.calories ?? 0,
      })),
      bienfaits:            p.bienfaits ?? [],
      allergenes:           p.allergenes ?? [],
      objectifsSante:       p.objectifsSante ?? [],
      conseilsConsommation: p.conseilsConsommation ?? [],
      popular: p.popular ?? false, vedette: p.vedette ?? false,
      recommande: p.recommande ?? false, saisonnier: p.saisonnier ?? false,
      disponible: p.disponible,
    });
    setTab('Général');
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditId(null); }

  function setN(field: keyof ProductForm['nutrition'], v: string) {
    setForm(f => ({ ...f, nutrition: { ...f.nutrition, [field]: Number(v) || 0 } }));
  }

  function setIng(idx: number, field: keyof IngForm, v: string | number) {
    setForm(f => {
      const ings = [...f.ingredients];
      ings[idx] = { ...ings[idx], [field]: v };
      return { ...f, ingredients: ings };
    });
  }

  function addIng() { setForm(f => ({ ...f, ingredients: [...f.ingredients, { ...EMPTY_ING }] })); }
  function removeIng(i: number) { setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, j) => j !== i) })); }

  // ── Upload images ───────────────────────────────────────────────────────────
  const handleMainImage = async (file: File) => {
    setUploadingMain(true);
    try {
      const url = await adminUploadImage(file);
      setForm(f => ({ ...f, image: url }));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur upload'); }
    finally { setUploadingMain(false); }
  };

  const handleGalleryImage = async (file: File) => {
    setUploadingGallery(true);
    try {
      const url = await adminUploadImage(file);
      setForm(f => ({ ...f, galerie: [...f.galerie, url] }));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur upload'); }
    finally { setUploadingGallery(false); }
  };

  const handleIngImage = async (file: File, idx: number) => {
    setUploadingIng(idx);
    try {
      const url = await adminUploadImage(file);
      setIng(idx, 'image', url);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur upload'); }
    finally { setUploadingIng(null); }
  };

  // ── Sauvegarde ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nom.trim()) { toast.error('Le nom est requis'); setTab('Général'); return; }
    if (form.prix <= 0)   { toast.error('Le prix doit être > 0'); setTab('Général'); return; }
    if (!form.categorie)  { toast.error('La catégorie est requise'); setTab('Général'); return; }

    const payload = {
      ...form,
      prixPromo:  form.prixPromo === '' ? null : Number(form.prixPromo),
      date:       null, // catalogue permanent
    };

    setSaving(true);
    try {
      if (editId) {
        const res = await adminPatch<{ data: ApiProduct }>(`/meals/${editId}`, payload);
        setProducts(ps => ps.map(p => p._id === editId ? res.data : p));
        toast.success('Produit mis à jour');
      } else {
        const res = await adminPost<{ data: ApiProduct }>('/meals', payload);
        setProducts(ps => [res.data, ...ps]);
        toast.success('Produit créé');
      }
      closeForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  };

  // ── Suppression ─────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await adminDelete(`/meals/${id}`);
      setProducts(ps => ps.filter(p => p._id !== id));
      toast.success('Produit supprimé');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur suppression');
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  // ── Toggle rapide ───────────────────────────────────────────────────────────
  const toggleField = async (id: string, field: 'disponible' | 'vedette' | 'recommande', val: boolean) => {
    try {
      const res = await adminPatch<{ data: ApiProduct }>(`/meals/${id}`, { [field]: val });
      setProducts(ps => ps.map(p => p._id === id ? res.data : p));
    } catch { toast.error('Erreur mise à jour'); }
  };

  // ── Duplication ─────────────────────────────────────────────────────────────
  const handleDuplicate = async (p: ApiProduct) => {
    const payload = { ...p, nom: `${p.nom} (copie)`, disponible: false, _id: undefined, slug: undefined, createdAt: undefined, updatedAt: undefined, date: null };
    try {
      const res = await adminPost<{ data: ApiProduct }>('/meals', payload);
      setProducts(ps => [res.data, ...ps]);
      toast.success('Produit dupliqué');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur duplication'); }
  };

  // ── Rendu ────────────────────────────────────────────────────────────────────
  const catList = useMemo(() => [...new Set(products.map(p => p.categorie))].sort(), [products]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Catalogue Produits</h2>
          <p className="font-body text-sm text-muted-foreground">{products.length} produits — fiches administrables</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Nouveau produit
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full h-9 pl-9 pr-3 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="h-9 px-3 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Toutes catégories</option>
          {catList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterDispo}
          onChange={e => setFilterDispo(e.target.value)}
          className="h-9 px-3 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Disponibilité</option>
          <option value="true">Disponible</option>
          <option value="false">Indisponible</option>
        </select>
      </div>

      {/* Tableau */}
      <div className="bg-background border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground w-10" />
              <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-primary" onClick={() => toggleSort('nom')}>
                <div className="flex items-center gap-1">Nom <SortIcon k="nom" /></div>
              </th>
              <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-primary hidden md:table-cell" onClick={() => toggleSort('categorie')}>
                <div className="flex items-center gap-1">Catégorie <SortIcon k="categorie" /></div>
              </th>
              <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-primary" onClick={() => toggleSort('prix')}>
                <div className="flex items-center gap-1">Prix <SortIcon k="prix" /></div>
              </th>
              <th className="text-center p-3 font-body text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Vedette</th>
              <th className="text-center p-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Dispo</th>
              <th className="text-right p-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayed.length === 0 ? (
              <tr><td colSpan={7} className="p-10 text-center font-body text-sm text-muted-foreground">Aucun produit</td></tr>
            ) : displayed.map(p => (
              <tr key={p._id} className="hover:bg-muted/20 transition-colors">
                <td className="p-3">
                  <div className="w-9 h-9 rounded-md overflow-hidden bg-muted shrink-0">
                    {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <Leaf className="w-4 h-4 m-auto mt-2.5 text-muted-foreground/30" />}
                  </div>
                </td>
                <td className="p-3">
                  <p className="font-body font-medium text-foreground">{p.nom}</p>
                  {p.slug && <p className="font-body text-xs text-muted-foreground">/produit/{p.slug}</p>}
                </td>
                <td className="p-3 hidden md:table-cell">
                  <span className="font-body text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">{p.categorie}</span>
                </td>
                <td className="p-3">
                  <span className="font-body text-sm font-medium text-primary">{formatPrice(p.prixPromo ?? p.prix)}</span>
                  {p.prixPromo != null && p.prixPromo < p.prix && (
                    <span className="font-body text-xs text-muted-foreground line-through ml-1">{formatPrice(p.prix)}</span>
                  )}
                </td>
                <td className="p-3 text-center hidden lg:table-cell">
                  <button onClick={() => toggleField(p._id, 'vedette', !p.vedette)} className="mx-auto">
                    <Star className={`w-4 h-4 ${p.vedette ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                  </button>
                </td>
                <td className="p-3 text-center">
                  <button onClick={() => toggleField(p._id, 'disponible', !p.disponible)} className="mx-auto">
                    {p.disponible
                      ? <Eye className="w-4 h-4 text-emerald-500" />
                      : <EyeOff className="w-4 h-4 text-muted-foreground/40" />}
                  </button>
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-muted rounded transition-colors" title="Modifier">
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDuplicate(p)} className="p-1.5 hover:bg-muted rounded transition-colors" title="Dupliquer">
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(p._id)}
                      className="p-1.5 hover:bg-destructive/10 rounded transition-colors"
                      title="Supprimer"
                    >
                      {deleting === p._id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-destructive" />
                        : <Trash2 className="w-3.5 h-3.5 text-destructive" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal formulaire ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-foreground/60 flex items-start justify-center p-4 overflow-y-auto" onClick={closeForm}>
          <div
            className="bg-background rounded-xl shadow-2xl w-full max-w-3xl my-8"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-display text-xl text-foreground">{editId ? 'Modifier le produit' : 'Nouveau produit'}</h3>
              <button onClick={closeForm}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {/* Onglets */}
            <div className="flex border-b border-border px-6 gap-1 overflow-x-auto">
              {TABS.map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2.5 font-body text-xs uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${
                    tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Contenu onglets */}
            <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">

              {/* ── Onglet Général ── */}
              {tab === 'Général' && (
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="Nom *">
                      <Input value={form.nom} onChange={v => setForm(f => ({ ...f, nom: v }))} placeholder="Ex: Jus Détox Vert" />
                    </Field>
                    <Field label="Catégorie *">
                      <div className="flex gap-2">
                        <select
                          value={form.categorie}
                          onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}
                          className="flex-1 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">Choisir…</option>
                          {categories.length > 0
                            ? categories.filter(c => c.active).map(c => <option key={c._id} value={c.nom}>{c.nom}</option>)
                            : catList.map(c => <option key={c} value={c}>{c}</option>)
                          }
                        </select>
                        {form.categorie === '' && (
                          <Input value={form.categorie} onChange={v => setForm(f => ({ ...f, categorie: v }))} placeholder="Ou saisir" className="w-32" />
                        )}
                      </div>
                    </Field>
                  </div>
                  <Field label="Description courte">
                    <Input value={form.descriptionCourte} onChange={v => setForm(f => ({ ...f, descriptionCourte: v }))} placeholder="Résumé en une phrase" />
                  </Field>
                  <Field label="Description complète">
                    <textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </Field>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="Prix (FCFA) *"><NumberInput value={form.prix} onChange={v => setForm(f => ({ ...f, prix: v }))} /></Field>
                    <Field label="Prix promo"><NumberInput value={Number(form.prixPromo) || 0} onChange={v => setForm(f => ({ ...f, prixPromo: v || '' }))} /></Field>
                    <Field label="Portions"><NumberInput value={form.portions} onChange={v => setForm(f => ({ ...f, portions: v }))} min={1} /></Field>
                    <Field label="Taille"><Input value={form.portion} onChange={v => setForm(f => ({ ...f, portion: v }))} placeholder="250ml" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Préparation (min)"><NumberInput value={form.tempsPrepMin} onChange={v => setForm(f => ({ ...f, tempsPrepMin: v }))} /></Field>
                  </div>
                  {/* Flags */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                    {([
                      ['disponible', 'Disponible'], ['popular', 'Populaire'],
                      ['vedette', 'Vedette'], ['recommande', 'Recommandé'], ['saisonnier', 'Saisonnier'],
                    ] as [keyof ProductForm, string][]).map(([k, lbl]) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form[k] as boolean}
                          onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))}
                          className="w-4 h-4 rounded accent-primary" />
                        <span className="font-body text-sm">{lbl}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Onglet Médias ── */}
              {tab === 'Médias' && (
                <div className="space-y-5">
                  <Field label="Image principale">
                    <input ref={mainImgRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) handleMainImage(e.target.files[0]); }} />
                    {form.image ? (
                      <div className="relative w-full max-w-xs h-40 rounded-lg overflow-hidden border border-border">
                        <img src={form.image} alt="" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setForm(f => ({ ...f, image: '' }))}
                          className="absolute top-2 right-2 p-1 bg-foreground/70 text-background rounded-full">
                          <X className="w-3.5 h-3.5" />
                        </button>
                        {uploadingMain && <div className="absolute inset-0 bg-background/60 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}
                      </div>
                    ) : (
                      <button type="button" onClick={() => mainImgRef.current?.click()}
                        className="w-full max-w-xs h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                        {uploadingMain ? <Loader2 className="w-6 h-6 animate-spin" /> : <><ImagePlus className="w-7 h-7" /><span className="font-body text-xs">Ajouter une image</span></>}
                      </button>
                    )}
                  </Field>
                  <Field label="Galerie d'images">
                    <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) handleGalleryImage(e.target.files[0]); }} />
                    <div className="flex flex-wrap gap-2">
                      {form.galerie.map((url, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => setForm(f => ({ ...f, galerie: f.galerie.filter((_, j) => j !== i) }))}
                            className="absolute top-1 right-1 p-0.5 bg-foreground/70 text-background rounded-full">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={() => galleryRef.current?.click()}
                        className="w-20 h-20 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                        {uploadingGallery ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                      </button>
                    </div>
                  </Field>
                </div>
              )}

              {/* ── Onglet Nutrition ── */}
              {tab === 'Nutrition' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {([
                    ['calories', 'Calories (kcal)'], ['proteines', 'Protéines (g)'],
                    ['glucides', 'Glucides (g)'],    ['lipides', 'Lipides (g)'],
                    ['fibres', 'Fibres (g)'],         ['sucres', 'Sucres (g)'],
                    ['sodium', 'Sodium (mg)'],
                  ] as [keyof ProductForm['nutrition'], string][]).map(([k, lbl]) => (
                    <Field key={k} label={lbl}>
                      <NumberInput value={form.nutrition[k]} onChange={v => setN(k, String(v))} />
                    </Field>
                  ))}
                </div>
              )}

              {/* ── Onglet Ingrédients ── */}
              {tab === 'Ingrédients' && (
                <div className="space-y-4">
                  <input ref={ingImgRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={e => {
                      if (e.target.files?.[0] && ingImgTarget !== null) handleIngImage(e.target.files[0], ingImgTarget);
                    }} />
                  {form.ingredients.map((ing, i) => (
                    <div key={i} className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="font-body text-xs uppercase tracking-wider text-muted-foreground">Ingrédient {i + 1}</span>
                        <button onClick={() => removeIng(i)} className="p-1 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      </div>
                      {/* Image ingrédient */}
                      <div className="flex gap-3 items-start">
                        <div className="shrink-0">
                          {ing.image ? (
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                              <img src={ing.image} alt="" className="w-full h-full object-cover" />
                              {uploadingIng === i && <div className="absolute inset-0 bg-background/60 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>}
                              <button type="button" onClick={() => setIng(i, 'image', '')}
                                className="absolute top-0.5 right-0.5 p-0.5 bg-foreground/70 text-background rounded-full">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <button type="button"
                              onClick={() => { setIngImgTarget(i); ingImgRef.current?.click(); }}
                              className="w-16 h-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                              {uploadingIng === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                            </button>
                          )}
                        </div>
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <Field label="Nom">
                            <Input value={ing.nom} onChange={v => setIng(i, 'nom', v)} placeholder="Mangue fraîche" />
                          </Field>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Field label="Qtité">
                              <NumberInput value={ing.quantite} onChange={v => setIng(i, 'quantite', v)} />
                            </Field>
                            <Field label="Unité">
                              <select value={ing.unite} onChange={e => setIng(i, 'unite', e.target.value)}
                                className="w-full h-9 px-2 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                {['g', 'kg', 'ml', 'cl', 'l', 'pièce', 'portion', 'cs', 'cc'].map(u => <option key={u}>{u}</option>)}
                              </select>
                            </Field>
                          </div>
                          <Field label="Description">
                            <Input value={ing.description} onChange={v => setIng(i, 'description', v)} placeholder="Riche en vitamine C" />
                          </Field>
                          <Field label="Apport nutritif">
                            <Input value={ing.apportNutritif} onChange={v => setIng(i, 'apportNutritif', v)} placeholder="Antioxydant" />
                          </Field>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={addIng}
                    className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg font-body text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                    <Plus className="w-4 h-4" /> Ajouter un ingrédient
                  </button>
                </div>
              )}

              {/* ── Onglet Attributs ── */}
              {tab === 'Attributs' && (
                <div className="space-y-6">
                  {/* Bienfaits */}
                  <div>
                    <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Bienfaits</label>
                    <div className="space-y-2">
                      {form.bienfaits.map((b, i) => (
                        <div key={i} className="flex gap-2">
                          <Input value={b} onChange={v => { const n = [...form.bienfaits]; n[i] = v; setForm(f => ({ ...f, bienfaits: n })); }} placeholder="Ex: Renforce l'immunité" />
                          <button onClick={() => setForm(f => ({ ...f, bienfaits: f.bienfaits.filter((_, j) => j !== i) }))} className="p-2 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                        </div>
                      ))}
                      <button onClick={() => setForm(f => ({ ...f, bienfaits: [...f.bienfaits, ''] }))}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded font-body text-xs hover:bg-border transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Ajouter un bienfait
                      </button>
                    </div>
                  </div>

                  {/* Allergènes */}
                  <div>
                    <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Allergènes</label>
                    <div className="flex flex-wrap gap-2">
                      {ALLERGENS.map(a => (
                        <button key={a.key} type="button"
                          onClick={() => setForm(f => ({
                            ...f,
                            allergenes: f.allergenes.includes(a.key)
                              ? f.allergenes.filter(x => x !== a.key)
                              : [...f.allergenes, a.key],
                          }))}
                          className={`px-3 py-1.5 rounded-full border font-body text-xs transition-colors ${
                            form.allergenes.includes(a.key) ? 'bg-amber-50 border-amber-400 text-amber-800' : 'border-border text-muted-foreground hover:border-amber-300'
                          }`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Objectifs santé */}
                  <div>
                    <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Objectifs santé</label>
                    <div className="flex flex-wrap gap-2">
                      {HEALTH_GOALS.map(g => (
                        <button key={g} type="button"
                          onClick={() => setForm(f => ({
                            ...f,
                            objectifsSante: f.objectifsSante.includes(g)
                              ? f.objectifsSante.filter(x => x !== g)
                              : [...f.objectifsSante, g],
                          }))}
                          className={`px-3 py-1.5 rounded-full border font-body text-xs transition-colors ${
                            form.objectifsSante.includes(g) ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Conseils de consommation */}
                  <div>
                    <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Conseils de consommation</label>
                    <div className="space-y-2">
                      {form.conseilsConsommation.map((c, i) => (
                        <div key={i} className="flex gap-2">
                          <Input value={c} onChange={v => { const n = [...form.conseilsConsommation]; n[i] = v; setForm(f => ({ ...f, conseilsConsommation: n })); }} placeholder="Ex: À consommer frais" />
                          <button onClick={() => setForm(f => ({ ...f, conseilsConsommation: f.conseilsConsommation.filter((_, j) => j !== i) }))} className="p-2 hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                        </div>
                      ))}
                      <button onClick={() => setForm(f => ({ ...f, conseilsConsommation: [...f.conseilsConsommation, ''] }))}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded font-body text-xs hover:bg-border transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Ajouter un conseil
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <button onClick={closeForm} className="px-4 py-2 font-body text-sm border border-border rounded-md hover:bg-muted transition-colors">
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground font-body text-sm rounded-md hover:bg-primary/90 disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation suppression ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-foreground/60 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-background rounded-xl shadow-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h4 className="font-display text-lg text-foreground mb-2">Supprimer ce produit ?</h4>
            <p className="font-body text-sm text-muted-foreground mb-5">Cette action est irréversible. La fiche produit sera définitivement supprimée.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 border border-border rounded-md font-body text-sm hover:bg-muted transition-colors">Annuler</button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={deleting !== null}
                className="flex-1 py-2 bg-destructive text-destructive-foreground rounded-md font-body text-sm hover:bg-destructive/90 flex items-center justify-center gap-2 disabled:opacity-60">
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
