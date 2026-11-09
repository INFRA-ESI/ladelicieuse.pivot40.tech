import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, ToggleLeft, ToggleRight } from '@/components/icons';
import { toast } from 'sonner';
import { adminGet, adminPost, adminPatch, adminDelete } from '@/services/adminApiService';

type PageType = 'consultations' | 'abonnement';

interface FAQ {
  _id: string;
  question: string;
  reponse: string;
  page: PageType;
  ordre: number;
  actif: boolean;
}

const EMPTY: Omit<FAQ, '_id'> = { question: '', reponse: '', page: 'consultations', ordre: 0, actif: true };

export default function FAQsAdminPage() {
  const [items, setItems]       = useState<FAQ[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<PageType>('consultations');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState<Omit<FAQ, '_id'>>(EMPTY);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    let mounted = true;
    adminGet<{ data: FAQ[] }>('/faqs/all')
      .then(r => { if (mounted) setItems(r.data); })
      .catch(() => toast.error('Erreur chargement'))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const filtered = items.filter(f => f.page === tab);

  function openNew() { setForm({ ...EMPTY, page: tab }); setEditId(null); setShowForm(true); }
  function openEdit(f: FAQ) {
    setForm({ question: f.question, reponse: f.reponse, page: f.page, ordre: f.ordre, actif: f.actif });
    setEditId(f._id);
    setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditId(null); }

  async function handleSave() {
    if (!form.question.trim() || !form.reponse.trim()) { toast.error('Question et réponse requises'); return; }
    setSaving(true);
    try {
      if (editId) {
        const res = await adminPatch<{ data: FAQ }>(`/faqs/${editId}`, form);
        setItems(prev => prev.map(i => i._id === editId ? res.data : i));
        toast.success('FAQ mise à jour');
      } else {
        const res = await adminPost<{ data: FAQ }>('/faqs', form);
        setItems(prev => [...prev, res.data]);
        toast.success('FAQ créée');
      }
      closeForm();
    } catch { toast.error('Erreur sauvegarde'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette FAQ ?')) return;
    try {
      await adminDelete(`/faqs/${id}`);
      setItems(prev => prev.filter(i => i._id !== id));
      toast.success('FAQ supprimée');
    } catch { toast.error('Erreur suppression'); }
  }

  async function toggleActif(f: FAQ) {
    try {
      const res = await adminPatch<{ data: FAQ }>(`/faqs/${f._id}`, { actif: !f.actif });
      setItems(prev => prev.map(i => i._id === f._id ? res.data : i));
    } catch { toast.error('Erreur'); }
  }

  const PAGE_LABELS: Record<PageType, string> = { consultations: 'Consultations', abonnement: 'Abonnement' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl text-foreground">FAQs</h2>
          <p className="font-body text-sm text-muted-foreground">{items.length} FAQ(s) au total — modifiez les questions/réponses en temps réel</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Nouvelle FAQ
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {(['consultations', 'abonnement'] as PageType[]).map(p => (
          <button
            key={p}
            onClick={() => setTab(p)}
            className={`px-4 py-2.5 font-body text-sm transition-colors border-b-2 -mb-px ${tab === p ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {PAGE_LABELS[p]} ({items.filter(f => f.page === p).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-background border border-border rounded-lg p-12 text-center font-body text-sm text-muted-foreground">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-background border border-border rounded-lg p-12 text-center font-body text-sm text-muted-foreground">
          Aucune FAQ pour la section « {PAGE_LABELS[tab]} ». <button onClick={openNew} className="text-primary hover:underline">Créer la première</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.sort((a, b) => a.ordre - b.ordre).map(f => (
            <div key={f._id} className={`bg-background border border-border rounded-lg p-4 ${!f.actif ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base text-foreground mb-1">{f.question}</p>
                  <p className="font-body text-sm text-muted-foreground line-clamp-2">{f.reponse}</p>
                  <p className="font-body text-xs text-muted-foreground mt-1">Ordre : {f.ordre}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActif(f)} className={`flex items-center gap-1 font-body text-xs transition-colors ${f.actif ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {f.actif ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(f)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => handleDelete(f._id)} className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
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
              <h3 className="font-display text-lg text-foreground">{editId ? 'Modifier' : 'Nouvelle'} FAQ</h3>
              <button onClick={closeForm}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Page *</label>
                  <select value={form.page} onChange={e => setForm(f => ({ ...f, page: e.target.value as PageType }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="consultations">Consultations</option>
                    <option value="abonnement">Abonnement</option>
                  </select>
                </div>
                <div>
                  <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Ordre</label>
                  <input type="number" value={form.ordre} onChange={e => setForm(f => ({ ...f, ordre: Number(e.target.value) }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Question *</label>
                <input value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} className="w-full h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Ex : Puis-je annuler à tout moment ?" />
              </div>
              <div>
                <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1">Réponse *</label>
                <textarea value={form.reponse} onChange={e => setForm(f => ({ ...f, reponse: e.target.value }))} rows={4} className="w-full px-3 py-2 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.actif} onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))} className="w-4 h-4 rounded" />
                <span className="font-body text-sm text-foreground">Visible sur le site</span>
              </label>
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
