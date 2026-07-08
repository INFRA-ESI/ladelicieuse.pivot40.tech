import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, ToggleLeft, ToggleRight, ImagePlus, Sparkles, Leaf, Grape, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPost, adminPatch, adminDelete, adminUploadImage } from '@/services/adminApiService';
import { INGREDIENTS } from '@/data/products';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

type IngredientItem = { id: string; name: string };
type IngredientGroup = { label: string; category: string; items: IngredientItem[] };

// Static fallback groups (used when the API has no data yet)
const STATIC_INGREDIENT_GROUPS: IngredientGroup[] = [
  { label: 'Bases',       category: 'base',      items: INGREDIENTS.filter(i => i.category === 'base').map(i => ({ id: i.id, name: i.name }))      },
  { label: 'Légumes',     category: 'legume',    items: INGREDIENTS.filter(i => i.category === 'legume').map(i => ({ id: i.id, name: i.name }))    },
  { label: 'Protéines',   category: 'proteine',  items: INGREDIENTS.filter(i => i.category === 'proteine').map(i => ({ id: i.id, name: i.name }))  },
  { label: 'Garnitures',  category: 'garniture', items: INGREDIENTS.filter(i => i.category === 'garniture').map(i => ({ id: i.id, name: i.name })) },
  { label: 'Sauces',      category: 'sauce',     items: INGREDIENTS.filter(i => i.category === 'sauce').map(i => ({ id: i.id, name: i.name }))     },
  { label: 'Fruits',      category: 'fruit',     items: INGREDIENTS.filter(i => i.category === 'fruit').map(i => ({ id: i.id, name: i.name }))     },
];

// Normalise une catégorie free-text admin vers les catégories connues
function normalizeCat(c: string): string {
  const s = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  if (['base','salade','verdure','laitue','roquette','epinard','feuille'].some(k => s.includes(k))) return 'base';
  if (['legume','vegetal','crudite','legum'].some(k => s.includes(k))) return 'legume';
  if (['proteine','protein','viande','poisson','volaille','oeuf','fromage'].some(k => s.includes(k))) return 'proteine';
  if (['garniture','topping','graine','noix','croquant','olive','crouton'].some(k => s.includes(k))) return 'garniture';
  if (['sauce','vinaigrette','dressing','huile','assaisonnement','citron'].some(k => s.includes(k))) return 'sauce';
  if (['fruit','exotique','tropical','baie'].some(k => s.includes(k))) return 'fruit';
  return 'garniture';
}

interface Suggestion {
  _id: string;
  nom: string;
  description: string;
  type: 'crudites' | 'fruits';
  base: string;
  ingredients: string[];
  image: string;
  actif: boolean;
  createdAt: string;
}

type FilterType = 'all' | 'crudites' | 'fruits';

const TYPE_CONFIG = {
  crudites: { label: 'Crudités',         icon: Leaf,  badge: 'bg-green-100 text-green-700 border-green-200' },
  fruits:   { label: 'Fruits de saison', icon: Grape, badge: 'bg-rose-100 text-rose-700 border-rose-200'    },
};

const EMPTY_FORM = {
  nom:         '',
  description: '',
  type:        'crudites' as 'crudites' | 'fruits',
  base:        '',
  ingredients: [] as string[],
  image:       '',
};

export default function SuggestionsPage() {
  const [suggestions, setSuggestions]         = useState<Suggestion[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [filter, setFilter]                   = useState<FilterType>('all');
  const [showForm, setShowForm]               = useState(false);
  const [editId, setEditId]                   = useState<string | null>(null);
  const [form, setForm]                       = useState(EMPTY_FORM);
  const [saving, setSaving]                   = useState(false);
  const [deleteConfirm, setDeleteConfirm]     = useState<string | null>(null);
  const [imagePreview, setImagePreview]       = useState('');
  const [uploading, setUploading]             = useState(false);
  const [ingredientGroups, setIngredientGroups] = useState<IngredientGroup[]>(STATIC_INGREDIENT_GROUPS);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await adminGet<{ data: Suggestion[] }>('/suggestions/all');
        if (mounted) setSuggestions(res.data);
      } catch {
        if (mounted) toast.error('Erreur chargement suggestions');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // Charger les vrais ingrédients du back-office pour le sélecteur de suggestions
  useEffect(() => {
    adminGet<{ data: Array<{ _id: string; nom: string; categorie: string; actif: boolean; stock: number }> }>('/ingredients?actif=true&limit=500')
      .then(res => {
        if (!res.data?.length) return;
        const catOrder = ['base', 'legume', 'proteine', 'garniture', 'sauce', 'fruit'] as const;
        const catLabels: Record<string, string> = { base: 'Bases', legume: 'Légumes', proteine: 'Protéines', garniture: 'Garnitures', sauce: 'Sauces', fruit: 'Fruits' };
        const map = new Map<string, IngredientItem[]>();
        for (const ing of res.data) {
          const cat = normalizeCat(ing.categorie);
          if (!map.has(cat)) map.set(cat, []);
          map.get(cat)!.push({ id: String(ing._id), name: ing.nom });
        }
        const groups = catOrder
          .filter(cat => map.has(cat))
          .map(cat => ({ label: catLabels[cat], category: cat, items: map.get(cat)! }));
        if (groups.length > 0) setIngredientGroups(groups);
      })
      .catch(() => { /* keep static fallback */ });
  }, []);

  const filtered = useMemo(() =>
    filter === 'all' ? suggestions : suggestions.filter(s => s.type === filter),
    [suggestions, filter]
  );

  const kpi = useMemo(() => ({
    total:    suggestions.length,
    actives:  suggestions.filter(s => s.actif).length,
    crudites: suggestions.filter(s => s.type === 'crudites').length,
    fruits:   suggestions.filter(s => s.type === 'fruits').length,
  }), [suggestions]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setShowForm(false);
    setEditId(null);
    setImagePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleEdit = (s: Suggestion) => {
    setForm({
      nom:         s.nom,
      description: s.description,
      type:        s.type,
      base:        s.base || '',
      ingredients: Array.isArray(s.ingredients) ? s.ingredients : [],
      image:       s.image || '',
    });
    setImagePreview(s.image && (s.image.startsWith('/') || s.image.startsWith('http')) ? s.image : '');
    setEditId(s._id);
    setShowForm(true);
  };

  const toggleIngredient = (id: string) => {
    setForm(f => ({
      ...f,
      ingredients: f.ingredients.includes(id)
        ? f.ingredients.filter(x => x !== id)
        : [...f.ingredients, id],
    }));
  };

  const handleSave = async () => {
    if (!form.nom.trim())         { toast.error('Le nom est requis'); return; }
    if (!form.description.trim()) { toast.error('La description est requise'); return; }
    setSaving(true);
    try {
      const payload = {
        nom:         form.nom.trim(),
        description: form.description.trim(),
        type:        form.type,
        base:        form.base,
        ingredients: form.ingredients,
        image:       form.image.trim(),
      };
      if (editId) {
        const res = await adminPatch<{ data: Suggestion }>(`/suggestions/${editId}`, payload);
        setSuggestions(prev => prev.map(s => s._id === editId ? res.data : s));
        toast.success('Suggestion modifiée');
      } else {
        const res = await adminPost<{ data: Suggestion }>('/suggestions', payload);
        setSuggestions(prev => [res.data, ...prev]);
        toast.success('Suggestion ajoutée');
      }
      resetForm();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur serveur');
    } finally {
      setSaving(false);
    }
  };

  const handleImageFile = async (file: File) => {
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await adminUploadImage(file);
      setForm(f => ({ ...f, image: url }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur upload');
      setImagePreview('');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminDelete(`/suggestions/${id}`);
      setSuggestions(prev => prev.filter(s => s._id !== id));
      toast.success('Suggestion supprimée');
      setDeleteConfirm(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur suppression');
    }
  };

  const toggleActif = async (s: Suggestion) => {
    try {
      const res = await adminPatch<{ data: Suggestion }>(`/suggestions/${s._id}`, { actif: !s.actif });
      setSuggestions(prev => prev.map(x => x._id === s._id ? res.data : x));
      toast.success(`${s.nom} ${s.actif ? 'désactivée' : 'activée'}`);
    } catch {
      toast.error('Erreur mise à jour');
    }
  };

  const isUrl = (v: string) => v.startsWith('/') || v.startsWith('http');

  // Groupes visibles selon le type (utilise les vrais ingrédients du back-office)
  const visibleGroups = form.type === 'fruits'
    ? ingredientGroups.filter(g => ['fruit', 'sauce'].includes(g.category))
    : ingredientGroups.filter(g => ['legume', 'proteine', 'garniture', 'sauce'].includes(g.category));

  const baseIngredients = ingredientGroups.find(g => g.category === 'base')?.items ?? [];

  return (
    <div className="space-y-6 bg-muted/30 -m-6 p-6 min-h-screen">

      {/* En-tête */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Suggestions du Chef</h2>
          <p className="font-body text-sm text-muted-foreground">
            {kpi.total} suggestions · {kpi.actives} actives · {kpi.crudites} crudités · {kpi.fruits} fruits
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM); setImagePreview(''); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total',    value: kpi.total,    color: 'text-foreground' },
          { label: 'Actives',  value: kpi.actives,  color: 'text-primary'    },
          { label: 'Crudités', value: kpi.crudites, color: 'text-green-600'  },
          { label: 'Fruits',   value: kpi.fruits,   color: 'text-rose-600'   },
        ].map(k => (
          <div key={k.label} className="bg-background border border-border rounded-lg px-4 py-3">
            <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">{k.label}</p>
            <p className={`font-display text-2xl ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      {(() => {
        const options: { key: FilterType; label: string; count: number }[] = [
          { key: 'all',      label: 'Toutes',           count: kpi.total    },
          { key: 'crudites', label: 'Crudités',         count: kpi.crudites },
          { key: 'fruits',   label: 'Fruits de saison',  count: kpi.fruits   },
        ];
        const active = options.find(o => o.key === filter)!;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-between gap-2 px-3 py-2 min-w-[180px] rounded-md font-body text-sm bg-background border border-border text-foreground hover:bg-muted/50 transition-colors">
                <span>
                  {active.label} <span className="ml-1 opacity-60">({active.count})</span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px]">
              {options.map(f => (
                <DropdownMenuItem
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-sm font-body cursor-pointer ${filter === f.key ? 'bg-primary/10 text-primary font-medium' : ''}`}
                >
                  {f.label} <span className="ml-1 opacity-60">({f.count})</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })()}

      {/* Liste */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-background border border-border rounded-lg h-56 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Sparkles className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-body text-muted-foreground">Aucune suggestion{filter !== 'all' ? ' pour ce type' : ''}</p>
          <button
            onClick={() => { setShowForm(true); setEditId(null); setForm({ ...EMPTY_FORM, type: filter !== 'all' ? filter : 'crudites' }); }}
            className="mt-4 text-sm font-body text-primary hover:underline"
          >
            Créer la première suggestion
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(s => {
            const cfg = TYPE_CONFIG[s.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG['crudites'];
            const TypeIcon = cfg.icon;
            return (
              <div
                key={s._id}
                className={`bg-background border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 ${
                  s.actif ? 'border-border' : 'border-border/50 opacity-60'
                }`}
              >
                <div className="relative h-40 overflow-hidden">
                  {s.image && isUrl(s.image) ? (
                    <img src={s.image} alt={s.nom} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${
                      s.type === 'crudites'
                        ? 'bg-gradient-to-br from-green-100 to-emerald-200'
                        : 'bg-gradient-to-br from-rose-100 to-pink-200'
                    }`}>
                      <TypeIcon className={`w-10 h-10 ${s.type === 'crudites' ? 'text-green-500' : 'text-rose-400'}`} />
                    </div>
                  )}
                  <span className={`absolute top-2 left-2 font-body text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                  <span className={`absolute top-2 right-2 font-body text-[10px] px-2 py-0.5 rounded-full ${
                    s.actif ? 'bg-primary/90 text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {s.actif ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="p-4">
                  <h3 className="font-display text-lg text-foreground leading-tight mb-1">{s.nom}</h3>
                  <div className="flex flex-wrap gap-1 mb-3 min-h-[24px]">
                    {s.description.split(',').slice(0, 4).map(tag => (
                      <span key={tag} className="font-body text-[10px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(s)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-body bg-muted rounded-md hover:bg-muted/80 text-foreground"
                      >
                        <Edit2 className="w-3 h-3" /> Modifier
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(s._id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-body bg-destructive/10 rounded-md hover:bg-destructive/20 text-destructive"
                      >
                        <Trash2 className="w-3 h-3" /> Supprimer
                      </button>
                    </div>
                    <button onClick={() => toggleActif(s)} className="text-muted-foreground hover:text-foreground">
                      {s.actif
                        ? <ToggleRight className="w-6 h-6 text-primary" />
                        : <ToggleLeft className="w-6 h-6" />
                      }
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal formulaire ──────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4 py-6 overflow-y-auto" onClick={resetForm}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="font-display text-lg text-foreground">
                {editId ? 'Modifier la suggestion' : 'Nouvelle suggestion du chef'}
              </h3>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">

              {/* Nom */}
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Nom *</label>
                <input
                  value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Ex : Salade César, Bowl Détox…"
                  className="w-full h-10 px-4 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Description */}
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">
                  Description *
                </label>
                <p className="font-body text-xs text-muted-foreground/70 mb-2">Affiché sous forme de tags sur le site (séparés par des virgules)</p>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Ex : Laitue, poulet, croûtons, œuf"
                  className="w-full h-10 px-4 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Type */}
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Catégorie *</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['crudites', 'fruits'] as const).map(t => {
                    const cfg = TYPE_CONFIG[t];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, type: t, base: '', ingredients: [] }))}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all text-sm font-body ${
                          form.type === t
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border bg-background text-foreground hover:border-primary/40'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Base (uniquement crudités) */}
              {form.type === 'crudites' && (
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">
                    Base de la salade
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {baseIngredients.map(ing => (
                      <button
                        key={ing.id}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, base: f.base === ing.id ? '' : ing.id }))}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-body transition-all ${
                          form.base === ing.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-foreground hover:border-primary/40'
                        }`}
                      >
                        {ing.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ingrédients (multi-select) */}
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">
                  Ingrédients composant la suggestion
                </label>
                <p className="font-body text-xs text-muted-foreground/70 mb-3">
                  Sélectionnez les ingrédients — ils seront pré-remplis quand l'utilisateur clique sur la suggestion
                </p>
                <div className="space-y-3">
                  {visibleGroups.map(group => (
                    <div key={group.category}>
                      <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{group.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map(ing => (
                          <button
                            key={ing.id}
                            type="button"
                            onClick={() => toggleIngredient(ing.id)}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-body transition-all ${
                              form.ingredients.includes(ing.id)
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-background text-foreground hover:border-primary/40'
                            }`}
                          >
                            {ing.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {form.ingredients.length > 0 && (
                  <p className="font-body text-xs text-muted-foreground mt-2">
                    {form.ingredients.length} ingrédient{form.ingredients.length > 1 ? 's' : ''} sélectionné{form.ingredients.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Image */}
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Photo</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); }}
                />
                {imagePreview ? (
                  <div className="relative w-full h-36 rounded-lg overflow-hidden border border-border">
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
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <ImagePlus className="w-6 h-6" />
                    <span className="font-body text-xs">Ajouter une photo (optionnel)</span>
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md hover:bg-muted/80"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation suppression ──────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg text-foreground mb-2">Supprimer cette suggestion ?</h3>
            <p className="font-body text-sm text-muted-foreground mb-6">Elle disparaîtra du carrousel du site.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 bg-destructive text-destructive-foreground text-sm font-body rounded-md hover:bg-destructive/90"
              >
                Supprimer
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
