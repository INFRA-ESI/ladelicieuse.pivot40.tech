import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, X, ChevronLeft, ChevronRight,
  Flame, Eye, EyeOff, Search, GripVertical, ImagePlus, Loader2,
  Send, Globe, BookOpen, CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminUploadImage, adminGet, adminPost, adminPatch, adminDelete } from '@/services/adminApiService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LibIngredient {
  id: string;
  nom: string;
  categorie: string;
  cal: number;
  prot: number;
  glu: number;
  lip: number;
  fib: number;
}

interface MealIngredient {
  ingredientId: string;
  grams: number;
  nom?: string;
}

interface Meal {
  _id: string;
  date: string | null;
  nom: string;
  categorie: 'Salade' | 'Jus & Détox' | 'Repas équilibré';
  description: string;
  descriptionCourte?: string;
  prix: number;
  prixPromo?: number | null;
  portions: number;
  portion?: string;
  tempsPrepMin?: number;
  image?: string;
  ingredients: Array<{ ingredientId: string; nom: string; quantite: number; unite: string }>;
  disponible: boolean;
  bienfaits?: string[];
  allergenes?: string[];
  objectifsSante?: string[];
  conseilsConsommation?: string[];
  vedette?: boolean;
  recommande?: boolean;
  saisonnier?: boolean;
}

interface Nutrients { cal: number; prot: number; glu: number; lip: number; fib: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

const addDays = (date: string, n: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

const fmtDate = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

const calcTotal = (composition: MealIngredient[], libMap: Map<string, LibIngredient>): Nutrients =>
  composition.reduce<Nutrients>((acc, mi) => {
    const ing = libMap.get(mi.ingredientId);
    if (!ing || !mi.grams) return acc;
    const f = mi.grams / 100;
    return {
      cal:  acc.cal  + ing.cal  * f,
      prot: acc.prot + ing.prot * f,
      glu:  acc.glu  + ing.glu  * f,
      lip:  acc.lip  + ing.lip  * f,
      fib:  acc.fib  + ing.fib  * f,
    };
  }, { cal: 0, prot: 0, glu: 0, lip: 0, fib: 0 });

const perPortion = (n: Nutrients, portions: number): Nutrients => {
  const p = Math.max(portions, 1);
  return { cal: n.cal / p, prot: n.prot / p, glu: n.glu / p, lip: n.lip / p, fib: n.fib / p };
};

const r = (v: number) => Math.round(v * 10) / 10;

const mealToComposition = (meal: Meal): MealIngredient[] =>
  meal.ingredients.map(i => ({ ingredientId: i.ingredientId, grams: i.quantite, nom: i.nom }));

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLERGENS = [
  { key: 'gluten', label: 'Gluten' }, { key: 'lait', label: 'Lait' },
  { key: 'oeufs', label: 'Œufs' },   { key: 'arachides', label: 'Arachides' },
  { key: 'soja', label: 'Soja' },    { key: 'noix', label: 'Fruits à coque' },
  { key: 'poisson', label: 'Poisson' }, { key: 'crustaces', label: 'Crustacés' },
  { key: 'sesame', label: 'Sésame' }, { key: 'sulfites', label: 'Sulfites' },
];

const HEALTH_GOALS = ['Détox', 'Minceur', 'Énergie', 'Sport', 'Bien-être', 'Digestion', 'Immunité', 'Rééquilibrage'];

const EMPTY_FORM = {
  nom: '', categorie: 'Repas équilibré' as Meal['categorie'],
  description: '', descriptionCourte: '',
  prix: '', prixPromo: '',
  portions: '1', portion: '', tempsPrepMin: '',
  image: '',
  composition: [] as MealIngredient[],
  // Nutrition complémentaire (saisie manuelle)
  sucres: '', sodium: '',
  // Fiche produit
  bienfaits: [] as string[],
  allergenes: [] as string[],
  objectifsSante: [] as string[],
  conseilsConsommation: [] as string[],
  vedette: false, recommande: false, saisonnier: false,
};

const CATEGORIES: Meal['categorie'][] = ['Salade', 'Jus & Détox', 'Repas équilibré'];

const CAT_COLOR: Record<Meal['categorie'], string> = {
  'Salade':          'bg-green-100 text-green-700',
  'Jus & Détox':     'bg-blue-100 text-blue-700',
  'Repas équilibré': 'bg-orange-100 text-orange-700',
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

function NutriBadge({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg ${color}`}>
      <span className="font-body text-xs opacity-70">{label}</span>
      <span className="font-body text-sm font-semibold">{r(value)}{unit}</span>
    </div>
  );
}

function MealCard({ meal, libMap, onEdit, onDelete, onToggle }: {
  meal: Meal;
  libMap: Map<string, LibIngredient>;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const composition = mealToComposition(meal);
  const total = calcTotal(composition, libMap);
  const pp    = perPortion(total, meal.portions);

  return (
    <div className={`bg-background border rounded-xl overflow-hidden transition-opacity ${!meal.disponible ? 'opacity-60' : ''}`}>
      {meal.image && (
        <div className="w-full h-40 overflow-hidden">
          <img src={meal.image} alt={meal.nom} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-display text-lg text-foreground truncate">{meal.nom}</h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-body shrink-0 ${CAT_COLOR[meal.categorie]}`}>{meal.categorie}</span>
              {!meal.disponible && <span className="px-2 py-0.5 rounded-full text-xs font-body bg-muted text-muted-foreground shrink-0">Masqué</span>}
            </div>
            {meal.description && <p className="font-body text-xs text-muted-foreground line-clamp-1">{meal.description}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={onToggle} title={meal.disponible ? 'Masquer' : 'Publier'}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
              {meal.disponible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button onClick={onEdit} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
              <Edit2 className="w-4 h-4" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {meal.ingredients.map((ing, idx) => (
            <span key={idx} className="px-2 py-0.5 bg-muted rounded-full font-body text-xs text-muted-foreground">
              {ing.nom} · {ing.quantite}g
            </span>
          ))}
          {meal.ingredients.length === 0 && (
            <span className="font-body text-xs text-muted-foreground italic">Aucun ingrédient</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-lg px-3 py-1.5">
            <Flame className="w-3.5 h-3.5" />
            <span className="font-body text-sm font-bold">{Math.round(pp.cal)} kcal</span>
            <span className="font-body text-xs opacity-70">/ portion</span>
          </div>
          <NutriBadge label="Prot." value={pp.prot} unit="g" color="bg-blue-50 text-blue-700" />
          <NutriBadge label="Gluc." value={pp.glu}  unit="g" color="bg-yellow-50 text-yellow-700" />
          <NutriBadge label="Lip."  value={pp.lip}  unit="g" color="bg-red-50 text-red-700" />
          <NutriBadge label="Fibr." value={pp.fib}  unit="g" color="bg-green-50 text-green-700" />
        </div>

        <div className="flex items-center justify-between font-body text-xs text-muted-foreground">
          <span>{meal.portions} portion{meal.portions > 1 ? 's' : ''} · Total : {Math.round(total.cal)} kcal</span>
          <span className="font-medium text-foreground">{meal.prix.toLocaleString()} FCFA</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CatalogMeal {
  _id: string;
  nom: string;
  categorie: string;
  description: string;
  prix: number;
  portions: number;
  image?: string;
  popular: boolean;
  ingredients: Array<{ nom: string; quantite: number; unite: string }>;
}

export default function MenuDayPage() {
  const [meals, setMeals]               = useState<Meal[]>([]);
  const [lib, setLib]                   = useState<LibIngredient[]>([]);
  const [libMap, setLibMap]             = useState<Map<string, LibIngredient>>(new Map());
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [loadingLib, setLoadingLib]     = useState(true);
  const [saving, setSaving]             = useState(false);
  const [date, setDate]                 = useState(today());
  const [showForm, setShowForm]         = useState(false);
  const [editId, setEditId]             = useState<string | null>(null);
  const [form, setForm]                 = useState({ ...EMPTY_FORM });
  const [published, setPublished]         = useState(false);
  const [publishing, setPublishing]       = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [ingSearch, setIngSearch]       = useState('');
  const [ingCat, setIngCat]             = useState('Tous');
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading]       = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab]       = useState<'menu' | 'catalogue'>('menu');
  const [catalogMeals, setCatalogMeals] = useState<Meal[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [showCatalog, setShowCatalog]   = useState(false);
  const [catalog, setCatalog]           = useState<CatalogMeal[]>([]);
  const [importing, setImporting]       = useState<string | null>(null);
  const catalogLoadedRef                = useRef(false);

  // ── Fetch ingredient library ─────────────────────────────────────────────────
  useEffect(() => {
    adminGet<{ data: Array<{ _id: string; nom: string; categorie: string; nutrition: { calories: number; proteines: number; glucides: number; lipides: number; fibres: number } }> }>('/ingredients?limit=500&actif=true')
      .then(res => {
        const items: LibIngredient[] = res.data.map(i => ({
          id:  i._id,
          nom: i.nom,
          categorie: i.categorie,
          cal:  i.nutrition?.calories  ?? 0,
          prot: i.nutrition?.proteines ?? 0,
          glu:  i.nutrition?.glucides  ?? 0,
          lip:  i.nutrition?.lipides   ?? 0,
          fib:  i.nutrition?.fibres    ?? 0,
        }));
        setLib(items);
        setLibMap(new Map(items.map(i => [i.id, i])));
      })
      .catch(() => toast.error('Erreur chargement ingrédients'))
      .finally(() => setLoadingLib(false));
  }, []);

  // ── Fetch meals + DailyMenu status for selected date ─────────────────────────
  const loadMeals = useCallback(async (d: string) => {
    setLoadingMeals(true);
    try {
      const [mealsRes] = await Promise.all([
        adminGet<{ data: Meal[] }>(`/meals/admin?date=${d}`),
        // Load DailyMenu status — 404 = not published yet, ignore error
        adminGet<{ data: { published: boolean } }>(`/menu/${d}`)
          .then(r => setPublished(r.data?.published ?? false))
          .catch(() => setPublished(false)),
      ]);
      setMeals(mealsRes.data);
    } catch {
      toast.error('Erreur chargement repas');
    } finally {
      setLoadingMeals(false);
    }
  }, []);

  useEffect(() => { loadMeals(date); }, [date, loadMeals]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const visible = meals.filter(m => m.disponible);
    const cals = meals.map(m => perPortion(calcTotal(mealToComposition(m), libMap), m.portions).cal);
    const minCal = cals.length ? Math.round(Math.min(...cals)) : 0;
    const maxCal = cals.length ? Math.round(Math.max(...cals)) : 0;
    return { total: meals.length, visible: visible.length, minCal, maxCal };
  }, [meals, libMap]);

  const liveNutri = useMemo(() => {
    const total = calcTotal(form.composition, libMap);
    return perPortion(total, +form.portions || 1);
  }, [form.composition, form.portions, libMap]);

  const liveTotalCal = useMemo(() => calcTotal(form.composition, libMap).cal, [form.composition, libMap]);

  const filteredLib = useMemo(() => lib.filter(i => {
    const matchSearch = i.nom.toLowerCase().includes(ingSearch.toLowerCase());
    const matchCat    = ingCat === 'Tous' || i.categorie === ingCat;
    return matchSearch && matchCat;
  }), [lib, ingSearch, ingCat]);

  const libCategories = useMemo(() => ['Tous', ...Array.from(new Set(lib.map(i => i.categorie)))], [lib]);

  // ── Image upload ──────────────────────────────────────────────────────────────
  const handleImageFile = async (file: File) => {
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
  };

  // ── Modal open/close ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY_FORM, composition: [] });
    setEditId(null);
    setImagePreview('');
    setShowForm(true);
  };

  const openEdit = (meal: Meal) => {
    setForm({
      nom: meal.nom,
      categorie: meal.categorie,
      description: meal.description ?? '',
      descriptionCourte: meal.descriptionCourte ?? '',
      prix: String(meal.prix),
      prixPromo: meal.prixPromo != null ? String(meal.prixPromo) : '',
      portions: String(meal.portions),
      portion: meal.portion ?? '',
      tempsPrepMin: meal.tempsPrepMin != null ? String(meal.tempsPrepMin) : '',
      image: meal.image || '',
      composition: mealToComposition(meal),
      sucres: '',
      sodium: '',
      bienfaits: meal.bienfaits ?? [],
      allergenes: meal.allergenes ?? [],
      objectifsSante: meal.objectifsSante ?? [],
      conseilsConsommation: meal.conseilsConsommation ?? [],
      vedette: meal.vedette ?? false,
      recommande: meal.recommande ?? false,
      saisonnier: meal.saisonnier ?? false,
    });
    if (meal.image) setImagePreview(meal.image);
    else setImagePreview('');
    setEditId(meal._id);
    setShowForm(true);
  };

  const resetForm = () => { setShowForm(false); setEditId(null); setForm({ ...EMPTY_FORM, composition: [] }); setImagePreview(''); };

  // ── Charger le catalogue (repas permanents date:null) ────────────────────────
  const loadCatalog = useCallback(async () => {
    if (catalogLoadedRef.current) return;
    setLoadingCatalog(true);
    try {
      const res = await adminGet<{ data: Meal[] }>('/meals/admin?catalog=true');
      setCatalogMeals(res.data);
      catalogLoadedRef.current = true;
    } catch {
      toast.error('Erreur chargement catalogue');
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'catalogue') loadCatalog();
  }, [activeTab, loadCatalog]);

  // ── Catalogue import modal ────────────────────────────────────────────────────
  const openCatalog = async () => {
    setShowCatalog(true);
    if (catalog.length > 0) return;
    setLoadingCatalog(true);
    try {
      const res = await adminGet<{ data: CatalogMeal[] }>('/meals/admin?disponible=true');
      // Garder uniquement les repas sans date (catalogue permanent)
      setCatalog(res.data.filter(m => !(m as unknown as { date?: string }).date));
    } catch {
      toast.error('Erreur chargement catalogue');
    } finally {
      setLoadingCatalog(false);
    }
  };

  const importFromCatalog = async (catalogMeal: CatalogMeal) => {
    if (meals.some(m => m.nom === catalogMeal.nom)) {
      toast.info(`${catalogMeal.nom} est déjà dans le menu du jour`); return;
    }
    setImporting(catalogMeal._id);
    try {
      // Détermine la catégorie compatible MenuDayPage
      const cat = catalogMeal.categorie.toLowerCase().includes('jus') || catalogMeal.categorie.toLowerCase().includes('détox')
        ? 'Jus & Détox' as const
        : catalogMeal.categorie.toLowerCase().includes('salade')
          ? 'Salade' as const
          : 'Repas équilibré' as const;

      const payload = {
        nom:         catalogMeal.nom,
        categorie:   cat,
        description: catalogMeal.description,
        prix:        catalogMeal.prix,
        portions:    catalogMeal.portions,
        image:       catalogMeal.image || '',
        ingredients: catalogMeal.ingredients.map(i => ({ ingredientId: '', nom: i.nom, quantite: i.quantite, unite: i.unite })),
        date,
        disponible:  true,
      };
      const res = await adminPost<{ data: Meal }>('/meals', payload);
      setMeals(prev => [...prev, res.data]);
      toast.success(`${catalogMeal.nom} ajouté au menu du ${date}`);
    } catch {
      toast.error('Erreur import');
    } finally {
      setImporting(null);
    }
  };

  // ── Save (create or update) ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nom.trim())         { toast.error('Nom requis'); return; }
    if (!form.prix || +form.prix <= 0) { toast.error('Prix requis'); return; }
    if (form.composition.length === 0) { toast.error('Ajoutez au moins un ingrédient'); return; }

    const ingredients = form.composition
      .filter(mi => mi.grams > 0)
      .map(mi => ({
        ingredientId: mi.ingredientId,
        nom:    libMap.get(mi.ingredientId)?.nom ?? mi.nom ?? 'Ingrédient',
        quantite: mi.grams,
        unite:  'g',
      }));

    const isCatalog = activeTab === 'catalogue';
    const payload = {
      nom: form.nom.trim(),
      categorie: form.categorie,
      description: form.description,
      descriptionCourte: form.descriptionCourte.trim(),
      prix: +form.prix,
      prixPromo: form.prixPromo !== '' && +form.prixPromo > 0 ? +form.prixPromo : null,
      portions: Math.max(1, +form.portions || 1),
      portion: form.portion.trim(),
      tempsPrepMin: form.tempsPrepMin !== '' ? +form.tempsPrepMin : 0,
      image: form.image || '',
      ingredients,
      date: isCatalog ? null : date,
      disponible: true,
      bienfaits: form.bienfaits.filter(Boolean),
      allergenes: form.allergenes,
      objectifsSante: form.objectifsSante,
      conseilsConsommation: form.conseilsConsommation.filter(Boolean),
      vedette: form.vedette,
      recommande: form.recommande,
      saisonnier: form.saisonnier,
    };

    setSaving(true);
    try {
      if (editId !== null) {
        const res = await adminPatch<{ data: Meal }>(`/meals/${editId}`, payload);
        if (isCatalog) {
          setCatalogMeals(prev => prev.map(m => m._id === editId ? res.data : m));
        } else {
          setMeals(prev => prev.map(m => m._id === editId ? res.data : m));
        }
        toast.success('Repas modifié');
      } else {
        const res = await adminPost<{ data: Meal }>('/meals', payload);
        if (isCatalog) {
          setCatalogMeals(prev => [...prev, res.data]);
        } else {
          setMeals(prev => [...prev, res.data]);
        }
        toast.success(isCatalog ? 'Repas ajouté au catalogue' : 'Repas ajouté au menu');
      }
      resetForm();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    const isCatalog = catalogMeals.some(m => m._id === id);
    try {
      await adminDelete(`/meals/${id}`);
      if (isCatalog) setCatalogMeals(prev => prev.filter(m => m._id !== id));
      else setMeals(prev => prev.filter(m => m._id !== id));
      toast.success('Repas supprimé');
    } catch {
      toast.error('Erreur suppression');
    } finally {
      setDeleteConfirm(null);
    }
  };

  // ── Toggle disponible ─────────────────────────────────────────────────────────
  const toggleDisponible = async (meal: Meal) => {
    const isCatalog = catalogMeals.some(m => m._id === meal._id);
    try {
      const res = await adminPatch<{ data: Meal }>(`/meals/${meal._id}`, { disponible: !meal.disponible });
      if (isCatalog) setCatalogMeals(prev => prev.map(m => m._id === meal._id ? res.data : m));
      else setMeals(prev => prev.map(m => m._id === meal._id ? res.data : m));
    } catch {
      toast.error('Erreur mise à jour');
    }
  };

  // ── Publish / unpublish DailyMenu ─────────────────────────────────────────────
  const handlePublishToggle = async () => {
    if (meals.length === 0 && !published) {
      toast.error('Ajoutez au moins un repas avant de publier');
      return;
    }
    setPublishing(true);
    try {
      if (!published) {
        // Sync repas list then publish
        await adminPost('/menu', { date, repas: meals.map(m => m._id) });
        await adminPatch(`/menu/${date}/publish`, { published: true });
        setPublished(true);
        toast.success('Menu du jour publié — il apparaît maintenant sur le site');
      } else {
        await adminPatch(`/menu/${date}/publish`, { published: false });
        setPublished(false);
        toast.success('Menu dépublié');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur publication');
    } finally {
      setPublishing(false);
    }
  };

  // ── Ingredient picker ─────────────────────────────────────────────────────────
  const addIngredient = (id: string) => {
    if (form.composition.some(mi => mi.ingredientId === id)) {
      toast.info('Ingrédient déjà dans la composition'); return;
    }
    const ing = libMap.get(id)!;
    const defaultGrams = ing.categorie.toLowerCase().includes('protéine') ? 100 : ing.categorie.toLowerCase().includes('sauce') ? 25 : 80;
    setForm(f => ({ ...f, composition: [...f.composition, { ingredientId: id, grams: defaultGrams }] }));
  };

  const updateGrams = (idx: number, grams: number) =>
    setForm(f => ({ ...f, composition: f.composition.map((mi, i) => i === idx ? { ...mi, grams } : mi) }));

  const removeIngredient = (idx: number) =>
    setForm(f => ({ ...f, composition: f.composition.filter((_, i) => i !== idx) }));

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 bg-muted/30 -m-6 p-6 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Menu & Catalogue</h2>
          <p className="font-body text-sm text-muted-foreground">Gérez le menu du jour et le catalogue permanent du site</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90">
          <Plus className="w-4 h-4" /> {activeTab === 'catalogue' ? 'Nouveau repas catalogue' : 'Nouveau repas du jour'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('menu')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-body transition-all ${activeTab === 'menu' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <CalendarDays className="w-4 h-4" /> Menu du jour
        </button>
        <button
          onClick={() => setActiveTab('catalogue')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-body transition-all ${activeTab === 'catalogue' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <BookOpen className="w-4 h-4" /> Catalogue site
          <span className="bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full font-body">
            {catalogMeals.length || ''}
          </span>
        </button>
      </div>

      {/* ═══ ONGLET CATALOGUE ═══════════════════════════════════════════════════ */}
      {activeTab === 'catalogue' && (
        <div>
          {loadingCatalog ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : catalogMeals.length === 0 ? (
            <div className="text-center py-16 bg-background border border-border rounded-xl">
              <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-display text-xl text-muted-foreground italic mb-4">Catalogue vide</p>
              <p className="font-body text-sm text-muted-foreground mb-6">Ajoutez des repas permanents qui seront visibles sur la page Repas et Jus du site.</p>
              <button onClick={openAdd}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90">
                <Plus className="w-4 h-4" /> Ajouter un repas au catalogue
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="font-body text-sm text-muted-foreground">
                  {catalogMeals.length} repas · {catalogMeals.filter(m => m.disponible).length} visibles sur le site
                </p>
              </div>
              <div className="space-y-4">
                {catalogMeals.map(meal => (
                  <MealCard
                    key={meal._id}
                    meal={meal}
                    libMap={libMap}
                    onEdit={() => openEdit(meal)}
                    onDelete={() => setDeleteConfirm(meal._id)}
                    onToggle={() => toggleDisponible(meal)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ ONGLET MENU DU JOUR ════════════════════════════════════════════════ */}
      {activeTab === 'menu' && <>

      {/* Date navigation */}
      <div className="bg-background border border-border rounded-xl p-4 flex items-center gap-4">
        <button onClick={() => setDate(d => addDays(d, -1))}
          className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 text-center">
          <p className="font-display text-lg text-foreground capitalize">{fmtDate(date)}</p>
          {date !== today() && (
            <button onClick={() => setDate(today())}
              className="font-body text-xs text-primary hover:underline mt-0.5">
              Revenir à aujourd'hui
            </button>
          )}
        </div>
        <button onClick={() => setDate(d => addDays(d, 1))}
          className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="hidden sm:block border-l border-border pl-4">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      </div>

      {/* Publish bar */}
      <div className="bg-background border border-border rounded-xl px-5 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Globe className={`w-4 h-4 shrink-0 ${published ? 'text-green-500' : 'text-muted-foreground'}`} />
          <div>
            <p className={`font-body text-sm font-medium ${published ? 'text-green-600' : 'text-muted-foreground'}`}>
              {published ? 'Menu publié' : 'Menu non publié'}
            </p>
            <p className="font-body text-xs text-muted-foreground">
              {published
                ? 'Visible sur la page d\'accueil du site'
                : 'Non visible par les clients — publiez pour l\'afficher'}
            </p>
          </div>
        </div>
        <button
          onClick={handlePublishToggle}
          disabled={publishing || loadingMeals}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-body rounded-md transition-all disabled:opacity-60 ${
            published
              ? 'bg-muted text-muted-foreground hover:bg-muted/70'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {publishing
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Send className="w-3.5 h-3.5" />
          }
          {published ? 'Dépublier' : 'Publier le menu'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-background border border-border rounded-lg p-4 text-center">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Repas ce jour</p>
          <p className="font-display text-3xl text-foreground">{loadingMeals ? '—' : kpis.total}</p>
        </div>
        <div className="bg-background border border-border rounded-lg p-4 text-center">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Publiés</p>
          <p className="font-display text-3xl text-foreground">{loadingMeals ? '—' : kpis.visible}</p>
        </div>
        <div className="bg-background border border-border rounded-lg p-4 text-center">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Plage cal./portion</p>
          {loadingMeals || loadingLib
            ? <p className="font-display text-xl text-muted-foreground">—</p>
            : kpis.total > 0
              ? <p className="font-display text-xl text-foreground">{kpis.minCal}–{kpis.maxCal}<span className="font-body text-sm text-muted-foreground ml-1">kcal</span></p>
              : <p className="font-display text-xl text-muted-foreground">—</p>}
        </div>
      </div>

      {/* Meal list */}
      {loadingMeals ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : meals.length === 0 ? (
        <div className="text-center py-16 bg-background border border-border rounded-xl">
          <p className="font-display text-xl text-muted-foreground italic mb-4">Aucun repas pour ce jour</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button onClick={openAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90">
              <Plus className="w-4 h-4" /> Nouveau repas
            </button>
            <button onClick={openCatalog}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-muted text-foreground text-sm font-body rounded-md hover:bg-muted/70 border border-border">
              <BookOpen className="w-4 h-4" /> Depuis le catalogue
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {meals.map(meal => (
            <MealCard
              key={meal._id}
              meal={meal}
              libMap={libMap}
              onEdit={() => openEdit(meal)}
              onDelete={() => setDeleteConfirm(meal._id)}
              onToggle={() => toggleDisponible(meal)}
            />
          ))}
        </div>
      )}

      </> /* fin onglet menu du jour */}

      {/* Add / Edit modal — commun aux deux onglets */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/60 px-4 py-8 overflow-y-auto"
          onClick={resetForm}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-3xl my-auto" onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-display text-xl text-foreground">
                {editId !== null ? 'Modifier le repas' : activeTab === 'catalogue' ? 'Nouveau repas catalogue' : 'Nouveau repas du jour'}
              </h3>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto">

              {/* ─ Section 1 : Composition (2 colonnes) ─ */}
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">

                {/* Left — Identification + sélecteur ingrédients */}
                <div className="p-5 space-y-4">
                  <p className="font-body text-xs uppercase tracking-wider text-primary">Identification</p>
                  <div className="space-y-3">
                    <div>
                      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Nom du repas *</label>
                      <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                        placeholder="Ex: Poulet Grillé & Riz Basmati" type="text"
                        className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Description courte</label>
                      <input value={form.descriptionCourte} onChange={e => setForm(f => ({ ...f, descriptionCourte: e.target.value }))}
                        placeholder="Résumé en une phrase"
                        className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Description complète</label>
                      <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        rows={2} placeholder="Ingrédients principaux, mode de cuisson…"
                        className="w-full px-3 py-2 bg-muted border border-border rounded-md font-body text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Catégorie</label>
                        <select value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value as Meal['categorie'] }))}
                          className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Portions</label>
                        <input value={form.portions} onChange={e => setForm(f => ({ ...f, portions: e.target.value }))}
                          type="number" min="1" max="20" placeholder="1"
                          className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Prix (FCFA) *</label>
                        <input value={form.prix} onChange={e => setForm(f => ({ ...f, prix: e.target.value }))}
                          type="number" min="0" step="100" placeholder="3500"
                          className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Prix promo</label>
                        <input value={form.prixPromo} onChange={e => setForm(f => ({ ...f, prixPromo: e.target.value }))}
                          type="number" min="0" step="100" placeholder="—"
                          className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Taille/portion</label>
                        <input value={form.portion} onChange={e => setForm(f => ({ ...f, portion: e.target.value }))}
                          placeholder="Ex: 350ml" type="text"
                          className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Prépa (min)</label>
                        <input value={form.tempsPrepMin} onChange={e => setForm(f => ({ ...f, tempsPrepMin: e.target.value }))}
                          type="number" min="0" placeholder="5"
                          className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    <div>
                      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Photo du plat</label>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                        onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); }} />
                      {imagePreview ? (
                        <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
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
                          className="w-full h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                          <ImagePlus className="w-5 h-5" />
                          <span className="font-body text-xs">Ajouter une photo</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Ingredient picker */}
                  <div>
                    <p className="font-body text-xs uppercase tracking-wider text-primary mb-3">Ajouter des ingrédients</p>
                    {loadingLib ? (
                      <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    ) : lib.length === 0 ? (
                      <p className="font-body text-xs text-muted-foreground italic text-center py-4">Aucun ingrédient en base. Ajoutez-en depuis la page Ingrédients.</p>
                    ) : (
                      <>
                        <div className="flex gap-2 mb-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input value={ingSearch} onChange={e => setIngSearch(e.target.value)}
                              placeholder="Rechercher…"
                              className="w-full h-8 pl-8 pr-3 bg-muted border border-border rounded-md font-body text-xs focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <select value={ingCat} onChange={e => setIngCat(e.target.value)}
                            className="h-8 px-2 bg-muted border border-border rounded-md font-body text-xs focus:outline-none focus:ring-2 focus:ring-primary">
                            {libCategories.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                          {filteredLib.map(ing => {
                            const already = form.composition.some(mi => mi.ingredientId === ing.id);
                            return (
                              <button key={ing.id} onClick={() => addIngredient(ing.id)} disabled={already}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left transition-colors ${already ? 'bg-muted/40 opacity-50 cursor-not-allowed' : 'bg-muted hover:bg-muted/70'}`}>
                                <div>
                                  <span className="font-body text-xs font-medium text-foreground">{ing.nom}</span>
                                  <span className="font-body text-xs text-muted-foreground ml-2">{ing.categorie}</span>
                                </div>
                                <span className="font-body text-xs text-muted-foreground shrink-0">{ing.cal} kcal/100g</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Right — Composition + nutrition */}
                <div className="p-5 space-y-5">
                  <div>
                    <p className="font-body text-xs uppercase tracking-wider text-primary mb-3">
                      Composition ({form.composition.length} ingrédient{form.composition.length !== 1 ? 's' : ''})
                    </p>
                    {form.composition.length === 0 ? (
                      <p className="font-body text-xs text-muted-foreground italic py-4 text-center">
                        Sélectionnez des ingrédients dans la bibliothèque
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {form.composition.map((mi, idx) => {
                          const ing = libMap.get(mi.ingredientId);
                          if (!ing) return null;
                          const calContrib = mi.grams > 0 ? Math.round(ing.cal * mi.grams / 100) : 0;
                          return (
                            <div key={idx} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                              <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-body text-xs font-medium text-foreground truncate">{ing.nom}</p>
                                <p className="font-body text-xs text-muted-foreground">{calContrib} kcal</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="number" min="1" max="2000" value={mi.grams}
                                  onChange={e => updateGrams(idx, +e.target.value)}
                                  className="w-16 h-7 px-2 text-center bg-background border border-border rounded font-body text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <span className="font-body text-xs text-muted-foreground">g</span>
                                <button onClick={() => removeIngredient(idx)}
                                  className="p-1 text-muted-foreground hover:text-destructive ml-1">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Live nutrition */}
                  <div className="bg-muted/50 border border-border rounded-xl p-4">
                    <p className="font-body text-xs uppercase tracking-wider text-primary mb-3">Aperçu nutritionnel</p>
                    {form.composition.length === 0 ? (
                      <p className="font-body text-xs text-muted-foreground italic text-center py-2">Ajoutez des ingrédients pour voir le calcul</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-center gap-2 mb-4 p-3 bg-primary/10 rounded-lg">
                          <Flame className="w-5 h-5 text-primary" />
                          <div className="text-center">
                            <p className="font-display text-2xl text-primary">{Math.round(liveNutri.cal)}</p>
                            <p className="font-body text-xs text-muted-foreground">kcal / portion</p>
                          </div>
                          {+form.portions > 1 && (
                            <div className="text-center border-l border-border pl-3 ml-1">
                              <p className="font-display text-lg text-foreground">{Math.round(liveTotalCal)}</p>
                              <p className="font-body text-xs text-muted-foreground">kcal total ({form.portions}p)</p>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-blue-50 rounded-lg p-2.5">
                            <p className="font-body text-xs text-blue-600 mb-0.5">Protéines</p>
                            <p className="font-body text-sm font-semibold text-blue-700">{r(liveNutri.prot)} g</p>
                          </div>
                          <div className="bg-yellow-50 rounded-lg p-2.5">
                            <p className="font-body text-xs text-yellow-600 mb-0.5">Glucides</p>
                            <p className="font-body text-sm font-semibold text-yellow-700">{r(liveNutri.glu)} g</p>
                          </div>
                          <div className="bg-red-50 rounded-lg p-2.5">
                            <p className="font-body text-xs text-red-600 mb-0.5">Lipides</p>
                            <p className="font-body text-sm font-semibold text-red-700">{r(liveNutri.lip)} g</p>
                          </div>
                          <div className="bg-green-50 rounded-lg p-2.5">
                            <p className="font-body text-xs text-green-600 mb-0.5">Fibres</p>
                            <p className="font-body text-sm font-semibold text-green-700">{r(liveNutri.fib)} g</p>
                          </div>
                        </div>
                        {(() => {
                          const totalMacro = liveNutri.prot * 4 + liveNutri.glu * 4 + liveNutri.lip * 9;
                          if (totalMacro <= 0) return null;
                          const pPct = Math.round(liveNutri.prot * 4 / totalMacro * 100);
                          const gPct = Math.round(liveNutri.glu  * 4 / totalMacro * 100);
                          const lPct = 100 - pPct - gPct;
                          return (
                            <div className="mt-3">
                              <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                                <div className="bg-blue-400 transition-all" style={{ width: `${pPct}%` }} />
                                <div className="bg-yellow-400 transition-all" style={{ width: `${gPct}%` }} />
                                <div className="bg-red-400 transition-all" style={{ width: `${lPct}%` }} />
                              </div>
                              <div className="flex justify-between font-body text-xs text-muted-foreground mt-1">
                                <span className="text-blue-500">P {pPct}%</span>
                                <span className="text-yellow-600">G {gPct}%</span>
                                <span className="text-red-500">L {lPct}%</span>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ─ Section 2 : Fiche produit (pleine largeur) ─ */}
              <div className="border-t border-border p-5 space-y-5">
                <p className="font-body text-xs uppercase tracking-wider text-primary">Fiche produit</p>

                {/* Bienfaits */}
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Bienfaits</label>
                  <div className="space-y-2">
                    {form.bienfaits.map((b, i) => (
                      <div key={i} className="flex gap-2">
                        <input value={b}
                          onChange={e => { const n = [...form.bienfaits]; n[i] = e.target.value; setForm(f => ({ ...f, bienfaits: n })); }}
                          placeholder="Ex: Renforce l'immunité"
                          className="flex-1 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        <button onClick={() => setForm(f => ({ ...f, bienfaits: f.bienfaits.filter((_, j) => j !== i) }))}
                          className="p-2 hover:bg-destructive/10 rounded-md transition-colors">
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setForm(f => ({ ...f, bienfaits: [...f.bienfaits, ''] }))}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-md font-body text-xs hover:bg-border transition-colors">
                      <Plus className="w-3 h-3" /> Ajouter un bienfait
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
                          form.allergenes.includes(a.key)
                            ? 'bg-amber-50 border-amber-400 text-amber-800'
                            : 'border-border text-muted-foreground hover:border-amber-300'
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
                          form.objectifsSante.includes(g)
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/40'
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
                        <input value={c}
                          onChange={e => { const n = [...form.conseilsConsommation]; n[i] = e.target.value; setForm(f => ({ ...f, conseilsConsommation: n })); }}
                          placeholder="Ex: À consommer frais, idéal le matin"
                          className="flex-1 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        <button onClick={() => setForm(f => ({ ...f, conseilsConsommation: f.conseilsConsommation.filter((_, j) => j !== i) }))}
                          className="p-2 hover:bg-destructive/10 rounded-md transition-colors">
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setForm(f => ({ ...f, conseilsConsommation: [...f.conseilsConsommation, ''] }))}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-md font-body text-xs hover:bg-border transition-colors">
                      <Plus className="w-3 h-3" /> Ajouter un conseil
                    </button>
                  </div>
                </div>

                {/* Flags produit */}
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Mise en avant</label>
                  <div className="flex flex-wrap gap-3">
                    {([
                      ['vedette',   'Produit vedette'],
                      ['recommande','Recommandé'],
                      ['saisonnier','Saisonnier'],
                    ] as [keyof typeof form, string][]).map(([k, lbl]) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form[k] as boolean}
                          onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))}
                          className="w-4 h-4 rounded accent-primary" />
                        <span className="font-body text-sm text-foreground">{lbl}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-border flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId !== null ? 'Enregistrer les modifications' : activeTab === 'catalogue' ? 'Ajouter au catalogue' : 'Ajouter au menu'}
              </button>
              <button onClick={resetForm}
                className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md hover:bg-muted/70">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal catalogue (import dans menu du jour) */}
      {showCatalog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/60 px-4 py-8 overflow-y-auto"
          onClick={() => setShowCatalog(false)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="font-display text-xl text-foreground">Catalogue des repas</h3>
                <p className="font-body text-xs text-muted-foreground mt-0.5">Repas permanents — cliquez pour ajouter au menu du {fmtDate(date)}</p>
              </div>
              <button onClick={() => setShowCatalog(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {loadingCatalog ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : catalog.length === 0 ? (
                <p className="text-center font-body text-sm text-muted-foreground py-10 italic">
                  Aucun repas catalogue. Lancez le seed pour peupler la base de données.
                </p>
              ) : (
                <div className="grid gap-3">
                  {catalog.map(m => {
                    const alreadyIn = meals.some(dm => dm.nom === m.nom);
                    return (
                      <div key={m._id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${alreadyIn ? 'border-border/50 bg-muted/30 opacity-60' : 'border-border bg-background hover:border-primary/40'}`}>
                        {m.image && (
                          <img src={m.image} alt={m.nom} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <p className="font-display text-base text-foreground truncate">{m.nom}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-body shrink-0 ${CAT_COLOR[
                              m.categorie.toLowerCase().includes('jus') || m.categorie.toLowerCase().includes('détox') ? 'Jus & Détox' :
                              m.categorie.toLowerCase().includes('salade') ? 'Salade' : 'Repas équilibré'
                            ]}`}>
                              {m.categorie}
                            </span>
                            {m.popular && <span className="px-2 py-0.5 rounded-full text-xs font-body bg-primary/10 text-primary shrink-0">Populaire</span>}
                          </div>
                          <p className="font-body text-xs text-muted-foreground line-clamp-1">{m.description}</p>
                          <p className="font-body text-xs text-muted-foreground mt-1">{m.prix.toLocaleString()} FCFA · {m.portions} portion{m.portions > 1 ? 's' : ''}</p>
                        </div>
                        <button
                          onClick={() => importFromCatalog(m)}
                          disabled={alreadyIn || importing === m._id}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-body rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          {importing === m._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          {alreadyIn ? 'Déjà ajouté' : 'Ajouter'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4"
          onClick={() => setDeleteConfirm(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg text-foreground mb-2">Supprimer ce repas ?</h3>
            <p className="font-body text-sm text-muted-foreground mb-1">
              {(meals.find(m => m._id === deleteConfirm) ?? catalogMeals.find(m => m._id === deleteConfirm))?.nom}
            </p>
            <p className="font-body text-xs text-muted-foreground mb-6">Il sera retiré définitivement de la base de données.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 bg-destructive text-destructive-foreground text-sm font-body rounded-md hover:bg-destructive/90">
                Supprimer
              </button>
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
