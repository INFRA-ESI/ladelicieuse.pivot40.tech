import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, ToggleLeft, ToggleRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPost, adminPatch, adminDelete } from '@/services/adminApiService';

interface PlanFeature { texte: string; inclus: boolean; }

interface Plan {
  _id: string;
  nom: string;
  description: string;
  prixMensuel: number;
  prixAnnuel: number;
  tag: string;
  icone: string;
  features: PlanFeature[];
  populaire: boolean;
  actif: boolean;
  ordre: number;
}

const EMPTY_PLAN: Omit<Plan, '_id'> = {
  nom: '', description: '', prixMensuel: 0, prixAnnuel: 0, tag: '', icone: 'leaf',
  features: [{ texte: '', inclus: true }], populaire: false, actif: true, ordre: 0,
};

const ICONES = [
  { value: 'leaf',  label: 'Feuille (Essentiel)' },
  { value: 'zap',   label: 'Éclair (Vitalité)' },
  { value: 'crown', label: 'Couronne (Premium)' },
  { value: 'star',  label: 'Étoile' },
];

export default function PlansAdminPage() {
  const [items, setItems]       = useState<Plan[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState<Omit<Plan, '_id'>>(EMPTY_PLAN);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    let mounted = true;
    adminGet<{ data: Plan[] }>('/plans/all')
      .then(r => { if (mounted) setItems(r.data); })
      .catch(() => toast.error('Erreur chargement'))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  function openNew() { setForm(EMPTY_PLAN); setEditId(null); setShowForm(true); }
  function openEdit(p: Plan) {
    setForm({ nom: p.nom, description: p.description, prixMensuel: p.prixMensuel, prixAnnuel: p.prixAnnuel, tag: p.tag, icone: p.icone, features: [...p.features], populaire: p.populaire, actif: p.actif, ordre: p.ordre });
    setEditId(p._id);
    setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditId(null); }

  function addFeature() { setForm(f => ({ ...f, features: [...f.features, { texte: '', inclus: true }] })); }
  function removeFeature(i: number) { setForm(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) })); }
  function updateFeature(i: number, field: keyof PlanFeature, val: string | boolean) {
    setForm(f => ({ ...f, features: f.features.map((ft, idx) => idx === i ? { ...ft, [field]: val } : ft) }));
  }

  async function handleSave() {
    if (!form.nom.trim() || !form.description.trim()) { toast.error('Nom et description requis'); return; }
    if (form.prixMensuel <= 0) { toast.error('Prix mensuel invalide'); return; }
    setSaving(true);
    try {
      const payload = { ...form, features: form.features.filter(f => f.texte.trim()) };
      if (editId) {
        const res = await adminPatch<{ data: Plan }>(`/plans/${editId}`, payload);
        setItems(prev => prev.map(i => i._id === editId ? res.data : i));
        toast.success('Plan mis à jour');
      } else {
        const res = await adminPost<{ data: Plan }>('/plans', payload);
        setItems(prev => [...prev, res.data]);
        toast.success('Plan créé');
      }
      closeForm();
    } catch { toast.error('Erreur sauvegarde'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string, nom: string) {
    if (!confirm(`Supprimer le plan "${nom}" ?`)) return;
    try {
      await adminDelete(`/plans/${id}`);
      setItems(prev => prev.filter(i => i._id !== id));
      toast.success('Plan supprimé');
    } catch { toast.error('Erreur suppression'); }
  }

  async function toggleActif(p: Plan) {
    try {
      const res = await adminPatch<{ data: Plan }>(`/plans/${p._id}`, { actif: !p.actif });
      setItems(prev => prev.map(i => i._id === p._id ? res.data : i));
    } catch { toast.error('Erreur'); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl text-foreground">Plans d'abonnement</h2>
          <p className="font-body text-sm text-muted-foreground">{items.length} plan(s) — modifiez offres, prix et avantages en temps réel</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Nouveau plan
        </button>
      </div>

      {loading ? (
        <div className="bg-background border border-border rounded-lg p-12 text-center font-body text-sm text-muted-foreground">Chargement...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {items.map(p => (
            <div key={p._id} className={`bg-background border rounded-lg p-5 flex flex-col gap-3 ${p.populaire ? 'border-primary ring-1 ring-primary' : 'border-border'} ${!p.actif ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display text-lg text-foreground">{p.nom}</h3>
                    {p.populaire && <span className="px-2 py-0.5 bg-primary text-primary-foreground rounded-full font-body text-xs">Populaire</span>}
                  </div>
                  {p.tag && <p className="font-body text-xs text-muted-foreground">{p.tag}</p>}
                </div>
              </div>
              <div className="space-y-0.5">
                <p className="font-display text-2xl text-foreground">{p.prixMensuel.toLocaleString('fr-FR')} <span className="text-sm font-body text-muted-foreground">FCFA/mois</span></p>
                <p className="font-body text-xs text-muted-foreground">{p.prixAnnuel.toLocaleString('fr-FR')} FCFA/mois en annuel</p>
              </div>
              <ul className="space-y-1">
                {p.features.slice(0, 4).map((f, i) => (
                  <li key={i} className={`flex items-center gap-2 font-body text-xs ${f.inclus ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                    <Check className={`w-3 h-3 shrink-0 ${f.inclus ? 'text-green-600' : 'text-muted-foreground'}`} />
                    {f.texte}
                  </li>
                ))}
                {p.features.length > 4 && <li className="font-body text-xs text-muted-foreground">+{p.features.length - 4} avantages</li>}
              </ul>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <button onClick={() => toggleActif(p)} className={`flex items-center gap-1.5 font-body text-xs transition-colors ${p.actif ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {p.actif ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {p.actif ? 'Visible' : 'Masqué'}
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => handleDelete(p._id, p.nom)} className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulaire */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50">
          <div className="bg-background rounded-xl w-full max-w-xl p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-foreground">{editId ? 'Modifier' : 'Nouveau'} plan</h3>
              <button onClick={closeForm}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Nom *</label>
                  <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Ex : Essentiel" />
                </div>
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Icône</label>
                  <select value={form.icone} onChange={e => setForm(f => ({ ...f, icone: e.target.value }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {ICONES.map(ic => <option key={ic.value} value={ic.value}>{ic.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Description *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Prix mensuel (FCFA) *</label>
                  <input type="number" value={form.prixMensuel} onChange={e => setForm(f => ({ ...f, prixMensuel: Number(e.target.value) }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Prix annuel/mois (FCFA) *</label>
                  <input type="number" value={form.prixAnnuel} onChange={e => setForm(f => ({ ...f, prixAnnuel: Number(e.target.value) }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Tag</label>
                  <input value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Ex : Le plus choisi" />
                </div>
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Ordre</label>
                  <input type="number" value={form.ordre} onChange={e => setForm(f => ({ ...f, ordre: Number(e.target.value) }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              {/* Avantages */}
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Avantages</label>
                <div className="space-y-2">
                  {form.features.map((ft, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={ft.inclus}
                        onChange={e => updateFeature(i, 'inclus', e.target.checked)}
                        className="w-4 h-4 rounded shrink-0"
                      />
                      <input
                        value={ft.texte}
                        onChange={e => updateFeature(i, 'texte', e.target.value)}
                        className="flex-1 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Ex : Livraison offerte"
                      />
                      <button onClick={() => removeFeature(i)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors">
                        <X className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addFeature} className="flex items-center gap-1.5 font-body text-xs text-primary hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Ajouter un avantage
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.populaire} onChange={e => setForm(f => ({ ...f, populaire: e.target.checked }))} className="w-4 h-4 rounded" />
                  <span className="font-body text-sm text-foreground">Plan mis en avant</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.actif} onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))} className="w-4 h-4 rounded" />
                  <span className="font-body text-sm text-foreground">Visible sur le site</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={closeForm} className="flex-1 py-2 border border-border rounded-md font-body text-sm hover:bg-muted transition-colors">Annuler</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
