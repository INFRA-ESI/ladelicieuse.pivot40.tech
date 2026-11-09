import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, ToggleLeft, ToggleRight, Merge } from '@/components/icons';
import { toast } from 'sonner';
import { adminGet, adminPost, adminPatch, adminDelete } from '@/services/adminApiService';

interface Category {
  _id: string;
  nom: string;
  description: string;
  active: boolean;
  ordre: number;
}

// Même règle que le serveur : accents, casse et « s » final ignorés ("Sauce et pain" = "Sauces et Pains").
const similarKey = (nom: string) =>
  nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean)
    .map(w => (w.length > 3 ? w.replace(/s$/, '') : w))
    .join(' ');

export default function CategoriesPage() {
  const [mergeSource, setMergeSource] = useState<Category | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');
  const [merging, setMerging]         = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState({ nom: '', description: '' });
  const [saving, setSaving]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    adminGet<{ data: Category[] }>('/categories/all')
      .then(r => { if (mounted) setCategories(r.data); })
      .catch(() => toast.error('Erreur chargement catégories'))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const resetForm = () => { setForm({ nom: '', description: '' }); setShowForm(false); setEditId(null); };

  const handleSave = async () => {
    if (!form.nom.trim()) { toast.error('Le nom est requis'); return; }
    setSaving(true);
    try {
      if (editId) {
        const res = await adminPatch<{ data: Category }>(`/categories/${editId}`, {
          nom: form.nom, description: form.description,
        });
        setCategories(prev => prev.map(c => c._id === editId ? res.data : c));
        toast.success('Catégorie modifiée');
      } else {
        const res = await adminPost<{ data: Category }>('/categories', {
          nom: form.nom, description: form.description, ordre: 0,
        });
        setCategories(prev => [...prev, res.data]);
        toast.success('Catégorie ajoutée');
      }
      resetForm();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur serveur');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c: Category) => {
    setForm({ nom: c.nom, description: c.description });
    setEditId(c._id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await adminDelete(`/categories/${id}`);
      setCategories(prev => prev.filter(c => c._id !== id));
      toast.success('Catégorie supprimée');
      setDeleteConfirm(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur suppression');
    }
  };

  const handleMerge = async () => {
    if (!mergeSource || !mergeTarget) return;
    setMerging(true);
    try {
      await adminPost(`/categories/${mergeSource._id}/merge`, { intoId: mergeTarget });
      setCategories(prev => prev.filter(c => c._id !== mergeSource._id));
      toast.success(`« ${mergeSource.nom} » fusionnée`);
      setMergeSource(null);
      setMergeTarget('');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur fusion');
    } finally {
      setMerging(false);
    }
  };

  const toggleActive = async (c: Category) => {
    try {
      const res = await adminPatch<{ data: Category }>(`/categories/${c._id}`, { active: !c.active });
      setCategories(prev => prev.map(cat => cat._id === c._id ? res.data : cat));
    } catch {
      toast.error('Erreur mise à jour');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Catégories</h2>
          <p className="font-body text-sm text-muted-foreground">
            {categories.length} catégorie{categories.length > 1 ? 's' : ''} · {categories.filter(c => c.active).length} active{categories.filter(c => c.active).length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={resetForm}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="font-display text-lg text-foreground">
                {editId ? 'Modifier' : 'Nouvelle'} catégorie
              </h3>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Nom *</label>
                <input
                  value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Ex : Légumes"
                  className="w-full h-10 px-4 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Description courte (optionnelle)"
                  className="w-full px-4 py-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 disabled:opacity-60"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button onClick={resetForm} className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md hover:bg-muted/80">
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fusion */}
      {mergeSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={() => setMergeSource(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg text-foreground mb-2">Fusionner « {mergeSource.nom} »</h3>
            <p className="font-body text-sm text-muted-foreground mb-4">
              Ses ingrédients et plats passent dans la catégorie choisie, puis « {mergeSource.nom} » est supprimée. Action irréversible.
            </p>
            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Garder la catégorie</label>
            <select
              value={mergeTarget}
              onChange={e => setMergeTarget(e.target.value)}
              className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Choisir…</option>
              {categories.filter(c => c._id !== mergeSource._id).map(c => <option key={c._id} value={c._id}>{c.nom}</option>)}
            </select>
            <div className="flex gap-3">
              <button onClick={handleMerge} disabled={!mergeTarget || merging}
                className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-body rounded-md hover:bg-primary/90 disabled:opacity-60">
                {merging ? 'Fusion…' : 'Fusionner'}
              </button>
              <button onClick={() => setMergeSource(null)} className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg text-foreground mb-2">Supprimer cette catégorie ?</h3>
            <p className="font-body text-sm text-muted-foreground mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 bg-destructive text-destructive-foreground text-sm font-body rounded-md hover:bg-destructive/90">Supprimer</button>
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2.5 bg-muted text-muted-foreground text-sm font-body rounded-md">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-background border border-border rounded-lg p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-background border border-border rounded-lg p-12 text-center">
          <p className="font-body text-muted-foreground">Aucune catégorie. <button onClick={() => setShowForm(true)} className="text-primary hover:underline">Créer la première</button></p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map(c => (
            <div
              key={c._id}
              className={`bg-background border rounded-lg p-5 shadow-sm hover:shadow-md transition-all duration-300 ${c.active ? 'border-border' : 'border-border/50 opacity-60'}`}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-display text-sm text-primary shrink-0">
                  {c.nom.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-base text-foreground">{c.nom}</h3>
                  {categories.some(o => o._id !== c._id && similarKey(o.nom) === similarKey(c.nom)) && (
                    <span className="text-amber-700 inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-body">Doublon probable</span>
                  )}
                  {c.description && (
                    <p className="font-body text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.description}</p>
                  )}
                </div>
                <button onClick={() => toggleActive(c)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  {c.active ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(c)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-body bg-muted rounded-md hover:bg-muted/80 text-foreground"
                >
                  <Edit2 className="w-3 h-3" /> Modifier
                </button>
                {categories.length > 1 && (
                  <button
                    onClick={() => { setMergeSource(c); setMergeTarget(''); }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-body bg-muted rounded-md hover:bg-muted/80 text-foreground"
                  >
                    <Merge className="w-3 h-3" /> Fusionner
                  </button>
                )}
                <button
                  onClick={() => setDeleteConfirm(c._id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-body bg-destructive/10 rounded-md hover:bg-destructive/20 text-destructive"
                >
                  <Trash2 className="w-3 h-3" /> Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
