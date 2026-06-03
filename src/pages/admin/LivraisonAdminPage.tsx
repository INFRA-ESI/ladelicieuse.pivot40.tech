import { useState, useEffect } from 'react';
import { Plus, Trash2, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPatch } from '@/services/adminApiService';

interface Zone {
  label: string;
  keywords: string[];
  frais: number;
}

interface LivraisonSettings {
  zonesLivraison: Zone[];
  creneauxLivraison: string[];
}

export default function LivraisonAdminPage() {
  const [data, setData]         = useState<LivraisonSettings>({ zonesLivraison: [], creneauxLivraison: [] });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [newSlot, setNewSlot]   = useState('');

  useEffect(() => {
    let mounted = true;
    adminGet<{ data: LivraisonSettings }>('/settings')
      .then(r => { if (mounted) setData({ zonesLivraison: r.data.zonesLivraison || [], creneauxLivraison: r.data.creneauxLivraison || [] }); })
      .catch(() => toast.error('Erreur chargement'))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      await adminPatch('/settings', { zonesLivraison: data.zonesLivraison, creneauxLivraison: data.creneauxLivraison });
      toast.success('Paramètres livraison enregistrés');
    } catch { toast.error('Erreur sauvegarde'); }
    finally { setSaving(false); }
  }

  function updateZone(idx: number, field: keyof Zone, val: string | number | string[]) {
    setData(d => ({ ...d, zonesLivraison: d.zonesLivraison.map((z, i) => i === idx ? { ...z, [field]: val } : z) }));
  }

  function updateKeywords(idx: number, raw: string) {
    const keywords = raw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    updateZone(idx, 'keywords', keywords);
  }

  function addZone() {
    setData(d => ({ ...d, zonesLivraison: [...d.zonesLivraison, { label: '', keywords: [], frais: 3000 }] }));
  }

  function removeZone(idx: number) {
    setData(d => ({ ...d, zonesLivraison: d.zonesLivraison.filter((_, i) => i !== idx) }));
  }

  function addSlot() {
    const slot = newSlot.trim();
    if (!slot) return;
    if (data.creneauxLivraison.includes(slot)) { toast.error('Créneau déjà existant'); return; }
    setData(d => ({ ...d, creneauxLivraison: [...d.creneauxLivraison, slot].sort() }));
    setNewSlot('');
  }

  function removeSlot(slot: string) {
    setData(d => ({ ...d, creneauxLivraison: d.creneauxLivraison.filter(s => s !== slot) }));
  }

  if (loading) return <div className="bg-background border border-border rounded-lg p-12 text-center font-body text-sm text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl text-foreground">Zones & Créneaux de livraison</h2>
          <p className="font-body text-sm text-muted-foreground">Configurez les zones de livraison, leurs mots-clés de détection et les frais associés</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
          <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      {/* Zones */}
      <div className="bg-background border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-foreground">Zones de livraison ({data.zonesLivraison.length})</h3>
          <button onClick={addZone} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-md font-body text-xs hover:bg-border transition-colors">
            <Plus className="w-3.5 h-3.5" /> Ajouter une zone
          </button>
        </div>
        <div className="text-xs font-body text-muted-foreground bg-muted rounded-md px-3 py-2">
          Les mots-clés sont recherchés dans l'adresse saisie par le client (séparés par des virgules, insensibles à la casse).
          Si aucun mot-clé ne correspond, la commande est classée « Libreville » avec les frais de livraison standard.
        </div>
        <div className="space-y-3">
          {data.zonesLivraison.map((z, idx) => (
            <div key={idx} className="flex flex-col sm:grid sm:grid-cols-[1fr_2fr_120px_36px] gap-3 items-start">
              <div>
                <label className="font-body text-xs text-muted-foreground block mb-1">Label</label>
                <input value={z.label} onChange={e => updateZone(idx, 'label', e.target.value)} placeholder="Ex : Owendo" className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground block mb-1">Mots-clés (virgule)</label>
                <input value={z.keywords.join(', ')} onChange={e => updateKeywords(idx, e.target.value)} placeholder="owendo, owendo-village" className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground block mb-1">Frais (FCFA)</label>
                <input type="number" value={z.frais} onChange={e => updateZone(idx, 'frais', Number(e.target.value))} className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="pt-5">
                <button onClick={() => removeZone(idx)} className="p-2 rounded-md hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Créneaux */}
      <div className="bg-background border border-border rounded-lg p-6 space-y-4">
        <h3 className="font-display text-lg text-foreground">Créneaux horaires ({data.creneauxLivraison.length})</h3>
        <div className="flex items-center gap-2">
          <input value={newSlot} onChange={e => setNewSlot(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSlot()} placeholder="Ex : 08h30" className="h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary w-36" />
          <button onClick={addSlot} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-md font-body text-xs hover:bg-border transition-colors">
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.creneauxLivraison.map(slot => (
            <span key={slot} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-full font-body text-sm">
              {slot}
              <button onClick={() => removeSlot(slot)} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
