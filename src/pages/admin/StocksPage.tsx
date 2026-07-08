import { useState, useEffect, useMemo } from 'react';
import {
  Search, Plus, Edit2, Trash2, X, AlertTriangle, CheckCircle,
  Package, Truck, ChevronRight, ChevronDown, RefreshCw, Star, Phone,
  Mail, Send, ClipboardList, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPost, adminPatch, adminDelete } from '@/services/adminApiService';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ingredient {
  _id: string;
  nom: string;
  categorie: string;
  unite: string;
  stock: number;
  stockMin: number;
  prixAchat: number;
}

interface Supplier {
  _id: string;
  nom: string;
  contact: string;
  telephone: string;
  email: string;
  categories: string[];
  delaiLivraison: string;
  rating: number;
  actif: boolean;
}

interface ReapproArticle {
  ingredientId: string;
  nom: string;
  quantiteCommandee: number;
  quantiteRecue: number;
  prixUnitaire: number;
}

type ReapproStatut = 'brouillon' | 'envoyee' | 'confirmee' | 'recue';

interface StockReappro {
  _id: string;
  fournisseurId: string;
  fournisseur: string;
  articles: ReapproArticle[];
  statut: ReapproStatut;
  total: number;
  notes: string;
  createdAt: string;
}

// ─── Static config ─────────────────────────────────────────────────────────────

const CMD_STATUT_LABEL: Record<ReapproStatut, string> = {
  brouillon: 'Brouillon', envoyee: 'Envoyée', confirmee: 'Confirmée', recue: 'Reçue',
};
const CMD_STATUT_COLOR: Record<ReapproStatut, string> = {
  brouillon: 'bg-gray-100 text-gray-700',
  envoyee:   'bg-blue-100 text-blue-700',
  confirmee: 'bg-green-100 text-green-700',
  recue:     'bg-primary/10 text-primary',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtFCFA = (n: number) => n.toLocaleString('fr-FR') + ' FCFA';

type StockLevel = 'rupture' | 'critique' | 'faible' | 'normal';

const stockLevel = (s: Ingredient): StockLevel => {
  if (s.stock === 0) return 'rupture';
  if (s.stock <= s.stockMin) return 'critique';
  if (s.stock <= s.stockMin * 1.5) return 'faible';
  return 'normal';
};

const levelColor: Record<StockLevel, string> = {
  rupture:  'bg-red-100 text-red-800',
  critique: 'bg-orange-100 text-orange-800',
  faible:   'bg-yellow-100 text-yellow-800',
  normal:   'bg-green-100 text-green-800',
};
const levelLabel: Record<StockLevel, string> = {
  rupture: 'Rupture', critique: 'Critique', faible: 'Faible', normal: 'Normal',
};
const barColor: Record<StockLevel, string> = {
  rupture: 'bg-red-500', critique: 'bg-orange-500', faible: 'bg-yellow-400', normal: 'bg-green-500',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function StockBar({ item }: { item: Ingredient }) {
  const stockMax = Math.max(item.stockMin * 3, 1);
  const pct = Math.min(100, Math.round((item.stock / stockMax) * 100));
  const lvl = stockLevel(item);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[60px]">
        <div className={`h-full rounded-full transition-all ${barColor[lvl]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`px-1.5 py-0.5 rounded text-xs font-body font-medium shrink-0 ${levelColor[lvl]}`}>
        {item.stock}
      </span>
    </div>
  );
}

function StarRating({ n }: { n: number }) {
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= n ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
      ))}
    </div>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-border/50">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
      ))}
    </tr>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

type Tab = 'stocks' | 'fournisseurs' | 'reappro';
type AjustType = 'entree' | 'sortie' | 'ajustement';

const AJUST_LABEL: Record<AjustType, string> = {
  entree: 'Entrée stock', sortie: 'Sortie / Consommation', ajustement: 'Ajustement inventaire',
};

const EMPTY_SUPPLIER: Omit<Supplier, '_id'> = {
  nom: '', contact: '', telephone: '', email: '', categories: [], delaiLivraison: '2 jours', rating: 4, actif: true,
};

interface NewArticle {
  ingredientId: string;
  nom: string;
  quantiteCommandee: string;
  prixUnitaire: string;
}

export default function StocksPage() {
  const [tab, setTab] = useState<Tab>('stocks');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [reappros, setReappros] = useState<StockReappro[]>([]);
  const [loadingIng, setLoadingIng] = useState(true);
  const [loadingSup, setLoadingSup] = useState(true);
  const [loadingReap, setLoadingReap] = useState(true);

  // Stocks tab
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<StockLevel | 'tous'>('tous');
  const [detailItem, setDetailItem] = useState<Ingredient | null>(null);

  // Ajustement modal
  const [ajustModal, setAjustModal] = useState<Ingredient | null>(null);
  const [ajustForm, setAjustForm] = useState<{ type: AjustType; quantite: string; motif: string }>({
    type: 'entree', quantite: '', motif: '',
  });
  const [ajustSaving, setAjustSaving] = useState(false);

  // Suppliers
  const [supplierForm, setSupplierForm] = useState<Omit<Supplier, '_id'>>({ ...EMPTY_SUPPLIER });
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [deleteSupplierConfirm, setDeleteSupplierConfirm] = useState<string | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Reappro
  const [showNewCmd, setShowNewCmd] = useState(false);
  const [newCmd, setNewCmd] = useState<{ fournisseurId: string; articles: NewArticle[]; notes: string }>({
    fournisseurId: '', articles: [], notes: '',
  });
  const [savingCmd, setSavingCmd] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [viewCmd, setViewCmd] = useState<StockReappro | null>(null);
  const [receptionModal, setReceptionModal] = useState<StockReappro | null>(null);
  const [receptionQty, setReceptionQty] = useState<Record<string, string>>({});
  const [quickCmdItem, setQuickCmdItem] = useState<Ingredient | null>(null);

  // ── Load all data at mount ─────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [ingRes, supRes, reapRes] = await Promise.all([
          adminGet<{ data: Ingredient[] }>('/ingredients?limit=500'),
          adminGet<{ data: Supplier[] }>('/suppliers'),
          adminGet<{ data: StockReappro[] }>('/stocks/reappro?limit=100'),
        ]);
        if (mounted) {
          setIngredients(ingRes.data);
          setSuppliers(supRes.data);
          setReappros(reapRes.data);
        }
      } catch {
        if (mounted) toast.error('Erreur chargement des données stocks');
      } finally {
        if (mounted) { setLoadingIng(false); setLoadingSup(false); setLoadingReap(false); }
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const rupture    = ingredients.filter(s => s.stock === 0).length;
    const critique   = ingredients.filter(s => stockLevel(s) === 'critique').length;
    const faible     = ingredients.filter(s => stockLevel(s) === 'faible').length;
    const valeur     = ingredients.reduce((sum, s) => sum + s.prixAchat * s.stock, 0);
    const cmdEnCours = reappros.filter(r => ['envoyee', 'confirmee'].includes(r.statut)).length;
    return { rupture, critique, faible, valeur, cmdEnCours };
  }, [ingredients, reappros]);

  const filteredStocks = useMemo(() => ingredients.filter(s => {
    const ms = s.nom.toLowerCase().includes(search.toLowerCase());
    const ml = levelFilter === 'tous' || stockLevel(s) === levelFilter;
    return ms && ml;
  }), [ingredients, search, levelFilter]);

  const categories = useMemo(() =>
    Array.from(new Set(ingredients.map(i => i.categorie))).sort(),
    [ingredients]
  );

  // ── Stock adjustment ──────────────────────────────────────────────────────

  const submitAjust = async () => {
    if (!ajustModal) return;
    if (!ajustForm.quantite || +ajustForm.quantite < 0) { toast.error('Quantité invalide'); return; }
    if (!ajustForm.motif.trim()) { toast.error('Motif requis'); return; }

    const qty = +ajustForm.quantite;
    let newStock = ajustModal.stock;
    if (ajustForm.type === 'entree') newStock += qty;
    else if (ajustForm.type === 'sortie') newStock = Math.max(0, newStock - qty);
    else newStock = qty;

    setAjustSaving(true);
    try {
      const res = await adminPatch<{ data: Ingredient }>(`/ingredients/${ajustModal._id}`, { stock: newStock });
      setIngredients(prev => prev.map(s => s._id === ajustModal._id ? res.data : s));
      if (detailItem?._id === ajustModal._id) setDetailItem(res.data);
      toast.success(`Stock ${ajustForm.type === 'entree' ? 'augmenté' : ajustForm.type === 'sortie' ? 'diminué' : 'ajusté'} — ${ajustModal.nom}`);
      setAjustModal(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur mise à jour stock');
    } finally {
      setAjustSaving(false);
    }
  };

  // ── Suppliers CRUD ────────────────────────────────────────────────────────

  const openEditSupplier = (s: Supplier) => {
    setSupplierForm({ nom: s.nom, contact: s.contact, telephone: s.telephone, email: s.email, categories: [...s.categories], delaiLivraison: s.delaiLivraison, rating: s.rating, actif: s.actif });
    setEditSupplierId(s._id);
    setShowSupplierForm(true);
  };

  const saveSupplier = async () => {
    if (!supplierForm.nom.trim()) { toast.error('Nom requis'); return; }
    setSavingSupplier(true);
    try {
      if (editSupplierId) {
        const res = await adminPatch<{ data: Supplier }>(`/suppliers/${editSupplierId}`, supplierForm);
        setSuppliers(prev => prev.map(s => s._id === editSupplierId ? res.data : s));
        toast.success('Fournisseur modifié');
      } else {
        const res = await adminPost<{ data: Supplier }>('/suppliers', supplierForm);
        setSuppliers(prev => [...prev, res.data]);
        toast.success('Fournisseur ajouté');
      }
      setShowSupplierForm(false); setEditSupplierId(null); setSupplierForm({ ...EMPTY_SUPPLIER });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur enregistrement');
    } finally {
      setSavingSupplier(false);
    }
  };

  const deleteSupplier = async (id: string) => {
    try {
      await adminDelete(`/suppliers/${id}`);
      setSuppliers(prev => prev.filter(s => s._id !== id));
      toast.success('Fournisseur supprimé');
      setDeleteSupplierConfirm(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur suppression');
    }
  };

  const toggleCatSupplier = (cat: string) => {
    setSupplierForm(f => ({
      ...f, categories: f.categories.includes(cat)
        ? f.categories.filter(c => c !== cat)
        : [...f.categories, cat],
    }));
  };

  // ── Réappro CRUD ──────────────────────────────────────────────────────────

  const advanceReappro = async (id: string, to: ReapproStatut) => {
    setAdvancingId(id);
    try {
      const res = await adminPatch<{ data: StockReappro }>(`/stocks/reappro/${id}/status`, { statut: to });
      setReappros(prev => prev.map(r => r._id === id ? res.data : r));
      toast.success(`Commande → ${CMD_STATUT_LABEL[to]}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur mise à jour');
    } finally {
      setAdvancingId(null);
    }
  };

  const openReception = (cmd: StockReappro) => {
    const init: Record<string, string> = {};
    cmd.articles.forEach(a => { init[a.ingredientId] = String(a.quantiteCommandee); });
    setReceptionQty(init);
    setReceptionModal(cmd);
  };

  const confirmReception = async () => {
    if (!receptionModal) return;
    const articles = receptionModal.articles.map(a => ({
      ingredientId: a.ingredientId,
      quantiteRecue: +receptionQty[a.ingredientId] || 0,
    }));
    setAdvancingId(receptionModal._id);
    try {
      const res = await adminPatch<{ data: StockReappro }>(`/stocks/reappro/${receptionModal._id}/status`, {
        statut: 'recue', articles,
      });
      setReappros(prev => prev.map(r => r._id === receptionModal._id ? res.data : r));
      // Refresh ingredients after backend updated stocks
      const ingRes = await adminGet<{ data: Ingredient[] }>('/ingredients?limit=500');
      setIngredients(ingRes.data);
      toast.success('Réception enregistrée — stocks mis à jour');
      setReceptionModal(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur réception');
    } finally {
      setAdvancingId(null);
    }
  };

  const addCmdArticle = () => setNewCmd(c => ({
    ...c, articles: [...c.articles, { ingredientId: '', nom: '', quantiteCommandee: '', prixUnitaire: '' }],
  }));
  const removeCmdArticle = (i: number) => setNewCmd(c => ({ ...c, articles: c.articles.filter((_, idx) => idx !== i) }));

  const updateCmdArticle = (i: number, field: keyof NewArticle, val: string) => {
    setNewCmd(c => ({
      ...c, articles: c.articles.map((a, idx) => {
        if (idx !== i) return a;
        if (field === 'ingredientId') {
          const ing = ingredients.find(x => x._id === val);
          return { ...a, ingredientId: val, nom: ing?.nom ?? '', prixUnitaire: String(ing?.prixAchat ?? '') };
        }
        return { ...a, [field]: val };
      }),
    }));
  };

  const saveNewCmd = async (send: boolean) => {
    if (!newCmd.fournisseurId) { toast.error('Sélectionnez un fournisseur'); return; }
    if (newCmd.articles.length === 0) { toast.error('Ajoutez au moins un article'); return; }
    if (newCmd.articles.some(a => !a.ingredientId || !a.quantiteCommandee)) {
      toast.error('Remplissez tous les articles'); return;
    }
    const supplier = suppliers.find(s => s._id === newCmd.fournisseurId);
    setSavingCmd(true);
    try {
      const payload = {
        fournisseurId: newCmd.fournisseurId,
        fournisseur: supplier?.nom ?? '',
        statut: send ? 'envoyee' : 'brouillon',
        articles: newCmd.articles.map(a => ({
          ingredientId: a.ingredientId,
          nom: a.nom,
          quantiteCommandee: +a.quantiteCommandee || 0,
          quantiteRecue: 0,
          prixUnitaire: +a.prixUnitaire || 0,
        })),
        notes: newCmd.notes,
      };
      const res = await adminPost<{ data: StockReappro }>('/stocks/reappro', payload);
      setReappros(prev => [res.data, ...prev]);
      toast.success(send ? 'Commande envoyée' : 'Brouillon enregistré');
      setShowNewCmd(false);
      setNewCmd({ fournisseurId: '', articles: [], notes: '' });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur création');
    } finally {
      setSavingCmd(false);
    }
  };

  const submitQuickCmd = async () => {
    if (!quickCmdItem) return;
    const supplier = suppliers.find(s => s.actif);
    if (!supplier) { toast.error('Aucun fournisseur actif disponible'); return; }
    const qty = quickCmdItem.stockMin * 2;
    setSavingCmd(true);
    try {
      const payload = {
        fournisseurId: supplier._id,
        fournisseur: supplier.nom,
        statut: 'brouillon',
        articles: [{ ingredientId: quickCmdItem._id, nom: quickCmdItem.nom, quantiteCommandee: qty, quantiteRecue: 0, prixUnitaire: quickCmdItem.prixAchat }],
        notes: `Commande rapide — ${quickCmdItem.nom}`,
      };
      const res = await adminPost<{ data: StockReappro }>('/stocks/reappro', payload);
      setReappros(prev => [res.data, ...prev]);
      toast.success(`Brouillon créé — ${qty} ${quickCmdItem.unite}s de ${quickCmdItem.nom}`);
      setQuickCmdItem(null);
      setTab('reappro');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur création');
    } finally {
      setSavingCmd(false);
    }
  };

  const deleteReappro = async (id: string) => {
    try {
      await adminDelete(`/stocks/reappro/${id}`);
      setReappros(prev => prev.filter(r => r._id !== id));
      toast.success('Commande supprimée');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur suppression');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 bg-muted/30 -m-6 p-6 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Gestion des stocks</h2>
          <p className="font-body text-sm text-muted-foreground">
            {ingredients.length} ingrédients · {suppliers.filter(s => s.actif).length} fournisseurs actifs
          </p>
        </div>
        {tab === 'stocks' && (
          <button onClick={() => { setShowNewCmd(true); setTab('reappro'); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Nouvelle commande
          </button>
        )}
        {tab === 'fournisseurs' && (
          <button onClick={() => { setShowSupplierForm(true); setEditSupplierId(null); setSupplierForm({ ...EMPTY_SUPPLIER }); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Ajouter fournisseur
          </button>
        )}
        {tab === 'reappro' && (
          <button onClick={() => setShowNewCmd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Nouvelle commande
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className={`bg-background border rounded-lg p-4 ${kpis.rupture > 0 ? 'border-red-300' : 'border-border'}`}>
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Ruptures</p>
          <p className={`font-display text-3xl ${kpis.rupture > 0 ? 'text-red-600' : 'text-foreground'}`}>{kpis.rupture}</p>
          <p className="font-body text-xs text-muted-foreground mt-1">stock à 0</p>
        </div>
        <div className={`bg-background border rounded-lg p-4 ${kpis.critique > 0 ? 'border-orange-300' : 'border-border'}`}>
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Critiques</p>
          <p className={`font-display text-3xl ${kpis.critique > 0 ? 'text-orange-600' : 'text-foreground'}`}>{kpis.critique}</p>
          <p className="font-body text-xs text-muted-foreground mt-1">sous le seuil min</p>
        </div>
        <div className={`bg-background border rounded-lg p-4 ${kpis.faible > 0 ? 'border-yellow-300' : 'border-border'}`}>
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Stock faible</p>
          <p className={`font-display text-3xl ${kpis.faible > 0 ? 'text-yellow-600' : 'text-foreground'}`}>{kpis.faible}</p>
          <p className="font-body text-xs text-muted-foreground mt-1">proche du seuil</p>
        </div>
        <div className="bg-background border border-border rounded-lg p-4">
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Valeur stock</p>
          <p className="font-display text-xl text-foreground">{Math.round(kpis.valeur / 1000)}k</p>
          <p className="font-body text-xs text-muted-foreground mt-1">FCFA (achat × qté)</p>
        </div>
        <div className={`bg-background border rounded-lg p-4 ${kpis.cmdEnCours > 0 ? 'border-blue-300' : 'border-border'}`}>
          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-1">Cmdes en cours</p>
          <p className={`font-display text-3xl ${kpis.cmdEnCours > 0 ? 'text-blue-600' : 'text-foreground'}`}>{kpis.cmdEnCours}</p>
          <p className="font-body text-xs text-muted-foreground mt-1">en attente/confirmée</p>
        </div>
      </div>

      {/* Alert banner */}
      {!loadingIng && (kpis.rupture + kpis.critique) > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-body text-sm font-medium text-red-700">
              {kpis.rupture} rupture{kpis.rupture > 1 ? 's' : ''} · {kpis.critique} stock{kpis.critique > 1 ? 's' : ''} critique{kpis.critique > 1 ? 's' : ''}
            </p>
            <p className="font-body text-xs text-red-600 mt-1">
              {ingredients.filter(s => ['rupture', 'critique'].includes(stockLevel(s))).map(s => `${s.nom} (${s.stock}/${s.stockMin})`).join(' · ')}
            </p>
          </div>
          <button onClick={() => { setLevelFilter('rupture'); setTab('stocks'); }}
            className="text-xs font-body text-red-600 hover:underline flex items-center gap-1 shrink-0">
            Voir <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-border">
        {(['stocks', 'fournisseurs', 'reappro'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap shrink-0 px-5 py-3 font-body text-sm transition-colors ${tab === t ? 'border-b-2 border-primary text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'stocks'
              ? `Stocks (${ingredients.length})`
              : t === 'fournisseurs'
              ? `Fournisseurs (${suppliers.length})`
              : `Réapprovisionnements (${reappros.length})`}
          </button>
        ))}
      </div>

      {/* ── TAB: STOCKS ─────────────────────────────────────────────────────── */}
      {tab === 'stocks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un ingrédient…"
                className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-between gap-2 px-3 py-2 min-w-[180px] rounded-md text-xs font-body bg-background border border-border text-foreground hover:bg-muted/50 transition-colors">
                  <span>{levelFilter === 'tous' ? 'Tous niveaux' : levelLabel[levelFilter]}</span>
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[180px]">
                {(['tous', 'rupture', 'critique', 'faible', 'normal'] as const).map(l => (
                  <DropdownMenuItem
                    key={l}
                    onClick={() => setLevelFilter(l)}
                    className={`text-xs font-body cursor-pointer ${levelFilter === l ? 'bg-primary/10 text-primary font-medium' : ''}`}
                  >
                    {l === 'tous' ? 'Tous niveaux' : levelLabel[l]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="bg-background border border-border rounded-lg overflow-x-auto shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Ingrédient</th>
                  <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground hidden md:table-cell">Catégorie</th>
                  <th className="text-left p-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Niveau stock</th>
                  <th className="text-center p-3 font-body text-xs uppercase tracking-wider text-muted-foreground">Seuil min</th>
                  <th className="text-right p-3 font-body text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Valeur</th>
                  <th className="p-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {loadingIng
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                  : filteredStocks.map(s => {
                    const lvl = stockLevel(s);
                    return (
                      <tr key={s._id}
                        className={`border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer ${lvl === 'rupture' ? 'bg-red-50/30' : lvl === 'critique' ? 'bg-orange-50/20' : ''}`}
                        onClick={() => setDetailItem(s)}>
                        <td className="p-3">
                          <p className="font-body font-medium text-foreground">{s.nom}</p>
                          <p className="font-body text-xs text-muted-foreground">{s.unite}</p>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <span className="px-2 py-0.5 rounded-full text-xs font-body bg-muted text-muted-foreground">{s.categorie}</span>
                        </td>
                        <td className="p-3 min-w-[140px]"><StockBar item={s} /></td>
                        <td className="p-3 text-center font-body text-xs text-muted-foreground">{s.stockMin}</td>
                        <td className="p-3 text-right font-body text-xs text-muted-foreground hidden lg:table-cell">{fmtFCFA(s.prixAchat * s.stock)}</td>
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1.5">
                            <button onClick={() => { setAjustModal(s); setAjustForm({ type: 'entree', quantite: '', motif: '' }); }}
                              title="Ajuster stock"
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setQuickCmdItem(s)}
                              title="Commander rapidement"
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary">
                              <Truck className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDetailItem(s)}
                              title="Voir détails"
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
              {!loadingIng && filteredStocks.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-muted/30">
                    <td colSpan={3} className="p-3 font-body text-xs text-muted-foreground">
                      {filteredStocks.length} ingrédient{filteredStocks.length > 1 ? 's' : ''}
                    </td>
                    <td />
                    <td className="p-3 text-right font-body text-xs font-medium text-foreground hidden lg:table-cell">
                      {fmtFCFA(filteredStocks.reduce((s, i) => s + i.prixAchat * i.stock, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
            {!loadingIng && filteredStocks.length === 0 && (
              <p className="text-center py-10 font-body text-sm text-muted-foreground">Aucun ingrédient trouvé</p>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: FOURNISSEURS ───────────────────────────────────────────────── */}
      {tab === 'fournisseurs' && (
        loadingSup
          ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-background border border-border rounded-xl p-5 h-48 animate-pulse" />
              ))}
            </div>
          )
          : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {suppliers.map(s => (
                <div key={s._id} className={`bg-background border rounded-xl p-5 ${!s.actif ? 'opacity-60' : 'border-border'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-display text-base text-foreground truncate">{s.nom}</h3>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-body shrink-0 ${s.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {s.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                      <p className="font-body text-xs text-muted-foreground">{s.contact}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEditSupplier(s)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteSupplierConfirm(s._id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2 text-xs font-body text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 shrink-0" /> {s.telephone}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-body text-muted-foreground">
                      <Mail className="w-3.5 h-3.5 shrink-0" /> {s.email}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-body text-muted-foreground">
                      <Truck className="w-3.5 h-3.5 shrink-0" /> Délai : <strong className="text-foreground">{s.delaiLivraison}</strong>
                    </div>
                  </div>
                  {s.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {s.categories.map(c => (
                        <span key={c} className="px-2 py-0.5 bg-muted rounded-full text-xs font-body text-muted-foreground">{c}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <StarRating n={s.rating} />
                    <button onClick={() => { setNewCmd(n => ({ ...n, fournisseurId: s._id })); setShowNewCmd(true); setTab('reappro'); }}
                      className="flex items-center gap-1 text-xs font-body text-primary hover:underline">
                      <ClipboardList className="w-3 h-3" /> Commander
                    </button>
                  </div>
                </div>
              ))}
              {suppliers.length === 0 && (
                <p className="col-span-3 text-center py-12 font-body text-sm text-muted-foreground">Aucun fournisseur enregistré</p>
              )}
            </div>
          )
      )}

      {/* ── TAB: RÉAPPROVISIONNEMENTS ────────────────────────────────────────── */}
      {tab === 'reappro' && (
        <div className="space-y-3">
          {loadingReap
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-background border border-border rounded-xl p-5 h-32 animate-pulse" />
              ))
            : reappros.length === 0
            ? (
              <p className="text-center py-16 font-body text-sm text-muted-foreground italic">
                Aucune commande de réapprovisionnement
              </p>
            )
            : reappros.map(cmd => (
              <div key={cmd._id} className="bg-background border border-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-body text-sm font-medium text-foreground">#{cmd._id.slice(-6).toUpperCase()}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-body font-medium ${CMD_STATUT_COLOR[cmd.statut]}`}>
                        {CMD_STATUT_LABEL[cmd.statut]}
                      </span>
                      <span className="font-body text-xs text-muted-foreground">{cmd.fournisseur}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {cmd.articles.map((a, i) => (
                        <span key={i} className="px-2 py-0.5 bg-muted rounded-full text-xs font-body text-muted-foreground">
                          {a.nom} × {a.quantiteCommandee}
                        </span>
                      ))}
                    </div>
                    {cmd.notes && <p className="font-body text-xs text-muted-foreground italic">{cmd.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-lg text-foreground">{fmtFCFA(cmd.total)}</p>
                    <p className="font-body text-xs text-muted-foreground">{fmtDate(cmd.createdAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap pt-3 border-t border-border">
                  <button onClick={() => setViewCmd(cmd)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground text-xs font-body rounded-md hover:text-foreground">
                    <Eye className="w-3.5 h-3.5" /> Détails
                  </button>
                  {cmd.statut === 'brouillon' && (
                    <>
                      <button onClick={() => advanceReappro(cmd._id, 'envoyee')} disabled={advancingId === cmd._id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-body rounded-md hover:bg-blue-100 border border-blue-200 disabled:opacity-50">
                        <Send className="w-3.5 h-3.5" /> Envoyer
                      </button>
                      <button onClick={() => deleteReappro(cmd._id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive text-xs font-body rounded-md hover:bg-destructive/20">
                        <Trash2 className="w-3.5 h-3.5" /> Supprimer
                      </button>
                    </>
                  )}
                  {cmd.statut === 'envoyee' && (
                    <button onClick={() => advanceReappro(cmd._id, 'confirmee')} disabled={advancingId === cmd._id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-body rounded-md hover:bg-green-100 border border-green-200 disabled:opacity-50">
                      <CheckCircle className="w-3.5 h-3.5" /> Confirmée par fournisseur
                    </button>
                  )}
                  {cmd.statut === 'confirmee' && (
                    <button onClick={() => openReception(cmd)} disabled={advancingId === cmd._id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-body rounded-md hover:bg-primary/90 disabled:opacity-50">
                      <Package className="w-3.5 h-3.5" /> Marquer reçue
                    </button>
                  )}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ── DETAIL PANEL ─────────────────────────────────────────────────────── */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/50" onClick={() => setDetailItem(null)}>
          <div className="bg-background h-full w-full max-w-md shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <div>
                <h3 className="font-display text-lg text-foreground">{detailItem.nom}</h3>
                <p className="font-body text-xs text-muted-foreground">{detailItem.categorie} · {detailItem.unite}</p>
              </div>
              <button onClick={() => setDetailItem(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="bg-muted/50 rounded-xl p-4">
                <div className="flex items-end gap-3 mb-3">
                  <p className={`font-display text-4xl ${stockLevel(detailItem) === 'rupture' ? 'text-red-600' : stockLevel(detailItem) === 'critique' ? 'text-orange-600' : 'text-foreground'}`}>
                    {detailItem.stock}
                  </p>
                  <p className="font-body text-sm text-muted-foreground mb-1">{detailItem.unite}s en stock</p>
                </div>
                <div className="flex justify-between font-body text-xs">
                  <span className="text-muted-foreground">Seuil min : {detailItem.stockMin}</span>
                  <span className={`px-2 py-0.5 rounded font-medium ${levelColor[stockLevel(detailItem)]}`}>
                    {levelLabel[stockLevel(detailItem)]}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted rounded-lg p-3">
                  <p className="font-body text-xs text-muted-foreground mb-0.5">Prix d'achat</p>
                  <p className="font-body text-sm font-medium text-foreground">{fmtFCFA(detailItem.prixAchat)}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="font-body text-xs text-muted-foreground mb-0.5">Valeur en stock</p>
                  <p className="font-body text-sm font-medium text-foreground">{fmtFCFA(detailItem.prixAchat * detailItem.stock)}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="font-body text-xs text-muted-foreground mb-0.5">Catégorie</p>
                  <p className="font-body text-sm font-medium text-foreground">{detailItem.categorie}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="font-body text-xs text-muted-foreground mb-0.5">Unité</p>
                  <p className="font-body text-sm font-medium text-foreground">{detailItem.unite}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setAjustModal(detailItem); setAjustForm({ type: 'entree', quantite: '', motif: '' }); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary text-primary-foreground text-xs font-body rounded-md hover:bg-primary/90">
                  <RefreshCw className="w-3.5 h-3.5" /> Ajuster stock
                </button>
                <button onClick={() => setQuickCmdItem(detailItem)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-muted text-muted-foreground text-xs font-body rounded-md hover:text-foreground">
                  <Truck className="w-3.5 h-3.5" /> Commander
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AJUSTEMENT MODAL ─────────────────────────────────────────────────── */}
      {ajustModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 px-4" onClick={() => setAjustModal(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-foreground">Ajuster le stock</h3>
              <button onClick={() => setAjustModal(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <p className="font-body text-sm text-muted-foreground mb-4">
              {ajustModal.nom} — stock actuel : <strong className="text-foreground">{ajustModal.stock} {ajustModal.unite}s</strong>
            </p>
            <div className="space-y-4">
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Type d'opération</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['entree', 'sortie', 'ajustement'] as AjustType[]).map(t => (
                    <button key={t} onClick={() => setAjustForm(f => ({ ...f, type: t }))}
                      className={`py-2 text-xs font-body rounded-md border transition-colors ${ajustForm.type === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border text-muted-foreground hover:text-foreground'}`}>
                      {t === 'entree' ? 'Entrée' : t === 'sortie' ? 'Sortie' : 'Inventaire'}
                    </button>
                  ))}
                </div>
                <p className="font-body text-xs text-muted-foreground mt-1">{AJUST_LABEL[ajustForm.type]}</p>
              </div>
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">
                  {ajustForm.type === 'ajustement' ? 'Nouveau stock absolu' : 'Quantité'}
                </label>
                <input type="number" min="0" value={ajustForm.quantite}
                  onChange={e => setAjustForm(f => ({ ...f, quantite: e.target.value }))}
                  placeholder="0"
                  className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                {ajustForm.type !== 'ajustement' && ajustForm.quantite && +ajustForm.quantite > 0 && (
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    Nouveau stock estimé : <strong className="text-foreground">
                      {ajustForm.type === 'entree' ? ajustModal.stock + +ajustForm.quantite : Math.max(0, ajustModal.stock - +ajustForm.quantite)}
                    </strong>
                  </p>
                )}
              </div>
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Motif *</label>
                <input type="text" value={ajustForm.motif}
                  onChange={e => setAjustForm(f => ({ ...f, motif: e.target.value }))}
                  placeholder="Ex: Réappro, Perte, Inventaire…"
                  className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex gap-3">
                <button onClick={submitAjust} disabled={ajustSaving}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 disabled:opacity-60">
                  {ajustSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button onClick={() => setAjustModal(null)}
                  className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── QUICK ORDER MODAL ────────────────────────────────────────────────── */}
      {quickCmdItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 px-4" onClick={() => setQuickCmdItem(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg text-foreground mb-2">Commander — {quickCmdItem.nom}</h3>
            <p className="font-body text-sm text-muted-foreground mb-2">
              Quantité suggérée : <strong className="text-foreground">{quickCmdItem.stockMin * 2} {quickCmdItem.unite}s</strong> (2× seuil min)
            </p>
            <p className="font-body text-xs text-muted-foreground mb-4">
              Un brouillon sera créé dans Réapprovisionnements (fournisseur ajustable).
            </p>
            <div className="flex gap-3">
              <button onClick={submitQuickCmd} disabled={savingCmd}
                className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-1.5">
                <Truck className="w-4 h-4" /> Créer le brouillon
              </button>
              <button onClick={() => setQuickCmdItem(null)}
                className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RÉCEPTION MODAL ──────────────────────────────────────────────────── */}
      {receptionModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 px-4" onClick={() => setReceptionModal(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-foreground">Réception #{receptionModal._id.slice(-6).toUpperCase()}</h3>
              <button onClick={() => setReceptionModal(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <p className="font-body text-xs text-muted-foreground mb-4">
              Ajustez les quantités réellement reçues si elles diffèrent de la commande.
            </p>
            <div className="space-y-3 mb-5">
              {receptionModal.articles.map(a => (
                <div key={a.ingredientId} className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-body text-sm font-medium text-foreground">{a.nom}</p>
                    <p className="font-body text-xs text-muted-foreground">Commandé : {a.quantiteCommandee}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" value={receptionQty[a.ingredientId] ?? ''}
                      onChange={e => setReceptionQty(q => ({ ...q, [a.ingredientId]: e.target.value }))}
                      className="w-20 h-9 px-2 text-center bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    <span className="font-body text-xs text-muted-foreground w-12 truncate">reçu</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={confirmReception} disabled={advancingId === receptionModal._id}
                className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Confirmer la réception
              </button>
              <button onClick={() => setReceptionModal(null)}
                className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW CMD MODAL ───────────────────────────────────────────────────── */}
      {viewCmd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 px-4" onClick={() => setViewCmd(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-foreground">Commande #{viewCmd._id.slice(-6).toUpperCase()}</h3>
              <button onClick={() => setViewCmd(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="font-body text-xs text-muted-foreground">Fournisseur</p><p className="font-body text-sm font-medium text-foreground">{viewCmd.fournisseur}</p></div>
                <div>
                  <p className="font-body text-xs text-muted-foreground">Statut</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-body font-medium ${CMD_STATUT_COLOR[viewCmd.statut]}`}>
                    {CMD_STATUT_LABEL[viewCmd.statut]}
                  </span>
                </div>
                <div><p className="font-body text-xs text-muted-foreground">Date</p><p className="font-body text-sm text-foreground">{fmtDate(viewCmd.createdAt)}</p></div>
              </div>
              {viewCmd.notes && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="font-body text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="font-body text-sm text-foreground">{viewCmd.notes}</p>
                </div>
              )}
              <div>
                <p className="font-body text-xs text-muted-foreground mb-2">Articles</p>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {viewCmd.articles.map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-body text-sm text-foreground">{a.nom}</p>
                        <p className="font-body text-xs text-muted-foreground">{a.quantiteCommandee} × {fmtFCFA(a.prixUnitaire)}</p>
                        {a.quantiteRecue > 0 && (
                          <p className="font-body text-xs text-green-600">Reçu : {a.quantiteRecue}</p>
                        )}
                      </div>
                      <p className="font-body text-sm font-medium text-foreground">{fmtFCFA(a.quantiteCommandee * a.prixUnitaire)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 bg-muted/40">
                    <p className="font-body text-sm font-semibold">Total</p>
                    <p className="font-display text-lg text-primary">{fmtFCFA(viewCmd.total)}</p>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setViewCmd(null)} className="w-full py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">Fermer</button>
          </div>
        </div>
      )}

      {/* ── FOURNISSEUR FORM MODAL ───────────────────────────────────────────── */}
      {showSupplierForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4 py-8 overflow-y-auto" onClick={() => setShowSupplierForm(false)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-display text-lg text-foreground">{editSupplierId ? 'Modifier' : 'Nouveau'} fournisseur</h3>
              <button onClick={() => setShowSupplierForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {([
                { label: 'Nom de la société', field: 'nom', placeholder: 'Ex: Agro Gabon SARL' },
                { label: 'Nom du contact', field: 'contact', placeholder: 'Ex: Votre prénom et nom' },
                { label: 'Téléphone', field: 'telephone', placeholder: '+241 77 00 00 00' },
                { label: 'Email', field: 'email', placeholder: 'contact@fournisseur.ga' },
                { label: 'Délai de livraison', field: 'delaiLivraison', placeholder: 'Ex: 2 jours, 48h…' },
              ] as { label: string; field: keyof Omit<Supplier, '_id'>; placeholder: string }[]).map(({ label, field, placeholder }) => (
                <div key={String(field)}>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">{label}</label>
                  <input value={String(supplierForm[field] ?? '')}
                    onChange={e => setSupplierForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={placeholder} type="text"
                    className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              ))}
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Note (1–5)</label>
                <input type="number" min="1" max="5" value={supplierForm.rating}
                  onChange={e => setSupplierForm(f => ({ ...f, rating: Math.min(5, Math.max(1, +e.target.value)) }))}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              {categories.length > 0 && (
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Catégories fournies</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(c => (
                      <button key={c} onClick={() => toggleCatSupplier(c)}
                        className={`px-3 py-1.5 rounded-md text-xs font-body transition-colors ${supplierForm.categories.includes(c) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <label className="font-body text-sm text-muted-foreground">Fournisseur actif</label>
                <button onClick={() => setSupplierForm(f => ({ ...f, actif: !f.actif }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${supplierForm.actif ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${supplierForm.actif ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-3">
              <button onClick={saveSupplier} disabled={savingSupplier}
                className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 disabled:opacity-60">
                {savingSupplier ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button onClick={() => setShowSupplierForm(false)}
                className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE SUPPLIER CONFIRM ──────────────────────────────────────────── */}
      {deleteSupplierConfirm !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 px-4" onClick={() => setDeleteSupplierConfirm(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg text-foreground mb-2">Supprimer ce fournisseur ?</h3>
            <p className="font-body text-sm text-muted-foreground mb-1">
              {suppliers.find(s => s._id === deleteSupplierConfirm)?.nom}
            </p>
            <p className="font-body text-xs text-muted-foreground mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteSupplier(deleteSupplierConfirm!)}
                className="flex-1 py-2.5 bg-destructive text-destructive-foreground text-sm font-body rounded-md hover:bg-destructive/90">
                Supprimer
              </button>
              <button onClick={() => setDeleteSupplierConfirm(null)}
                className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW REAPPRO MODAL ────────────────────────────────────────────────── */}
      {showNewCmd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4 py-8 overflow-y-auto" onClick={() => setShowNewCmd(false)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-display text-lg text-foreground">Nouvelle commande fournisseur</h3>
              <button onClick={() => setShowNewCmd(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Fournisseur</label>
                <select value={newCmd.fournisseurId} onChange={e => setNewCmd(c => ({ ...c, fournisseurId: e.target.value }))}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Sélectionner…</option>
                  {suppliers.filter(s => s.actif).map(s => <option key={s._id} value={s._id}>{s.nom}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground">Articles</label>
                  <button onClick={addCmdArticle} className="flex items-center gap-1 text-xs font-body text-primary hover:underline">
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                </div>
                {newCmd.articles.map((a, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_90px_28px] gap-2 mb-2 items-center">
                    <select value={a.ingredientId} onChange={e => updateCmdArticle(i, 'ingredientId', e.target.value)}
                      className="h-9 px-2 bg-muted border border-border rounded-md font-body text-xs focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="">Ingrédient…</option>
                      {ingredients.map(s => <option key={s._id} value={s._id}>{s.nom}</option>)}
                    </select>
                    <input type="number" min="1" value={a.quantiteCommandee}
                      onChange={e => updateCmdArticle(i, 'quantiteCommandee', e.target.value)}
                      placeholder="Qté"
                      className="h-9 px-2 bg-muted border border-border rounded-md font-body text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary" />
                    <input type="number" min="0" value={a.prixUnitaire}
                      onChange={e => updateCmdArticle(i, 'prixUnitaire', e.target.value)}
                      placeholder="Prix u."
                      className="h-9 px-2 bg-muted border border-border rounded-md font-body text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary" />
                    <button onClick={() => removeCmdArticle(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {newCmd.articles.length === 0 && (
                  <p className="font-body text-xs text-muted-foreground italic py-2">Cliquez sur "Ajouter" pour inclure des articles</p>
                )}
                {newCmd.articles.length > 0 && (
                  <p className="font-body text-xs text-muted-foreground text-right mt-1">
                    Total estimé : {fmtFCFA(newCmd.articles.reduce((s, a) => s + (+a.quantiteCommandee || 0) * (+a.prixUnitaire || 0), 0))}
                  </p>
                )}
              </div>
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Notes (optionnel)</label>
                <textarea value={newCmd.notes} onChange={e => setNewCmd(c => ({ ...c, notes: e.target.value }))}
                  rows={2} placeholder="Instructions particulières, urgence…"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md font-body text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-3">
              <button onClick={() => saveNewCmd(true)} disabled={savingCmd}
                className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-1.5">
                <Send className="w-4 h-4" /> Envoyer la commande
              </button>
              <button onClick={() => saveNewCmd(false)} disabled={savingCmd}
                className="flex-1 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md hover:bg-muted/70 disabled:opacity-60">
                Enregistrer brouillon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
