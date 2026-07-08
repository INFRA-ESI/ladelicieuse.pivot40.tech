import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, X, Search, Tag, Gift, Star, Edit2, Trash2, Copy,
  CheckCircle, Clock, AlertCircle, TrendingUp, Users, Zap,
  ChevronUp, ChevronDown, ToggleLeft, ToggleRight, RefreshCw,
  ShieldCheck, Flame, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { adminGet, adminPost, adminPatch, adminDelete } from '@/services/adminApiService';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab        = 'offres' | 'codes' | 'fidelite';
type OfferType  = 'pourcentage' | 'fixe' | 'bundle' | 'flash';
type OfferStatus = 'active' | 'inactive' | 'expiree' | 'a_venir';
type CodeStatus  = 'active' | 'inactive' | 'expiree' | 'epuisee';
type MemberSort  = 'nom' | 'points' | 'tier';

interface TierDef {
  _id: string;
  nom: string;
  slug: string;
  pointsMin: number;
  pointsMax: number | null;
  couleur: string;
  ordre: number;
}

interface Promotion {
  _id: string;
  nom: string;
  type: OfferType;
  valeur: number;
  categories: string[];
  dateDebut: string;
  dateFin: string;
  active: boolean;
  utilisations: number;
  limiteUtilisations?: number;
}

interface PromoCode {
  _id: string;
  code: string;
  typeReduction: 'pourcentage' | 'fixe';
  reduction: number;
  minCommande?: number;
  maxUtilisations?: number;
  utilisations: number;
  active: boolean;
  expiry?: string;
}

interface LoyaltyUser {
  _id: string;
  nom: string;
  email: string;
  telephone: string;
  points: number;
  tier: string;
  statut: 'actif' | 'inactif';
  createdAt: string;
}

interface LoyaltyReward { _id: string; nom: string; points: number; description: string; actif: boolean; }

// ─── Config ────────────────────────────────────────────────────────────────────

const OFFER_TYPE_CONFIG: Record<OfferType, { label: string; color: string }> = {
  pourcentage: { label: 'Pourcentage', color: 'bg-blue-100 text-blue-700' },
  fixe:        { label: 'Montant fixe', color: 'bg-emerald-100 text-emerald-700' },
  bundle:      { label: 'Bundle', color: 'bg-violet-100 text-violet-700' },
  flash:       { label: 'Flash', color: 'bg-orange-100 text-orange-700' },
};

const OFFER_STATUS_CONFIG: Record<OfferStatus, { label: string; color: string; icon: React.ReactNode }> = {
  active:   { label: 'Active',   color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
  inactive: { label: 'Inactive', color: 'bg-muted text-muted-foreground',  icon: <ToggleLeft  className="w-3 h-3" /> },
  expiree:  { label: 'Expirée',  color: 'bg-red-100 text-red-700',         icon: <AlertCircle className="w-3 h-3" /> },
  a_venir:  { label: 'À venir',  color: 'bg-amber-100 text-amber-700',     icon: <Clock       className="w-3 h-3" /> },
};

const CODE_STATUS_CONFIG: Record<CodeStatus, { label: string; color: string }> = {
  active:   { label: 'Actif',    color: 'bg-emerald-100 text-emerald-700' },
  inactive: { label: 'Inactif',  color: 'bg-muted text-muted-foreground' },
  expiree:  { label: 'Expiré',   color: 'bg-red-100 text-red-700' },
  epuisee:  { label: 'Épuisé',   color: 'bg-amber-100 text-amber-700' },
};

const COLOR_PRESETS: Record<string, { color: string; bg: string }> = {
  bronze:   { color: 'text-amber-700',   bg: 'bg-amber-100'   },
  argent:   { color: 'text-slate-600',   bg: 'bg-slate-100'   },
  or:       { color: 'text-yellow-600',  bg: 'bg-yellow-100'  },
  platine:  { color: 'text-violet-700',  bg: 'bg-violet-100'  },
  emeraude: { color: 'text-emerald-700', bg: 'bg-emerald-100' },
  bleu:     { color: 'text-blue-700',    bg: 'bg-blue-100'    },
};

const COLOR_OPTIONS = Object.keys(COLOR_PRESETS);
const CATEGORIES = ['Tous', 'Salades', 'Jus', 'Repas', 'Consultations'];
const PIE_COLORS = ['#92400e', '#64748b', '#ca8a04', '#7c3aed', '#059669', '#2563eb'];

function getTierDisplay(tiers: TierDef[], slug: string) {
  const t = tiers.find(t => t.slug === slug);
  const preset = COLOR_PRESETS[t?.couleur ?? 'bronze'] ?? COLOR_PRESETS.bronze;
  return { label: t?.nom ?? slug, min: t?.pointsMin ?? 0, max: t?.pointsMax ?? null, ...preset };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const toDateInput = (iso: string) => iso ? iso.slice(0, 10) : '';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const offerStatus = (p: Promotion): OfferStatus => {
  const now = new Date();
  if (new Date(p.dateFin) < now) return 'expiree';
  if (!p.active) return 'inactive';
  if (new Date(p.dateDebut) > now) return 'a_venir';
  return 'active';
};

const codeStatus = (c: PromoCode): CodeStatus => {
  if (!c.active) return 'inactive';
  if (c.expiry && new Date(c.expiry) < new Date()) return 'expiree';
  if (c.maxUtilisations && c.utilisations >= c.maxUtilisations) return 'epuisee';
  return 'active';
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className={`bg-background border rounded-lg p-4 ${color || 'border-border'}`}>
      <div className="flex items-start justify-between">
        <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="font-display text-2xl text-foreground mt-1">{value}</p>
      {sub && <p className="font-body text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function TierBadge({ tiers, slug }: { tiers: TierDef[]; slug: string }) {
  const { label, color, bg } = getTierDisplay(tiers, slug);
  return (
    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-body w-fit ${color} ${bg}`}>
      {label}
    </span>
  );
}

// ─── Offer form modal ──────────────────────────────────────────────────────────

type OfferForm = {
  nom: string; type: OfferType; valeur: number; categories: string[];
  dateDebut: string; dateFin: string; active: boolean; limiteUtilisations: string;
};

function OfferModal({ offer, onClose, onSave }: {
  offer: Promotion | null; onClose: () => void; onSave: (form: OfferForm) => Promise<void>;
}) {
  const blank: OfferForm = { nom: '', type: 'pourcentage', valeur: 10, categories: ['Tous'], dateDebut: '', dateFin: '', active: true, limiteUtilisations: '' };
  const [form, setForm] = useState<OfferForm>(
    offer
      ? { nom: offer.nom, type: offer.type, valeur: offer.valeur, categories: [...offer.categories],
          dateDebut: toDateInput(offer.dateDebut), dateFin: toDateInput(offer.dateFin),
          active: offer.active, limiteUtilisations: offer.limiteUtilisations ? String(offer.limiteUtilisations) : '' }
      : blank
  );
  const [saving, setSaving] = useState(false);
  const toggleCat = (cat: string) => setForm(p => ({
    ...p, categories: p.categories.includes(cat) ? p.categories.filter(c => c !== cat) : [...p.categories, cat],
  }));
  const handleSave = async () => {
    if (!form.nom || !form.dateDebut || !form.dateFin || !form.categories.length) { toast.error('Champs obligatoires manquants'); return; }
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2"><Zap className="w-5 h-5 text-primary" />
            <h3 className="font-display text-xl">{offer ? "Modifier l'offre" : 'Nouvelle offre'}</h3>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Nom *</label>
            <input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Ex: Happy Hour Salades"
              className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as OfferType }))}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="pourcentage">Pourcentage (%)</option>
                <option value="fixe">Montant fixe (FCFA)</option>
                <option value="bundle">Bundle / Pack</option>
                <option value="flash">Flash sale</option>
              </select>
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                {form.type === 'pourcentage' || form.type === 'flash' ? 'Réduction (%)' : form.type === 'bundle' ? 'Prix bundle (FCFA)' : 'Montant (FCFA)'}
              </label>
              <input type="number" value={form.valeur} onChange={e => setForm(p => ({ ...p, valeur: parseFloat(e.target.value) || 0 }))} min={0}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Date début *</label>
              <input type="date" value={form.dateDebut} onChange={e => setForm(p => ({ ...p, dateDebut: e.target.value }))}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Date fin *</label>
              <input type="date" value={form.dateFin} onChange={e => setForm(p => ({ ...p, dateFin: e.target.value }))}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Utilisations max.</label>
              <input type="number" value={form.limiteUtilisations} onChange={e => setForm(p => ({ ...p, limiteUtilisations: e.target.value }))} placeholder="Illimité"
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex items-center gap-3 mt-5">
              <label className="font-body text-sm text-muted-foreground">Active</label>
              <button onClick={() => setForm(p => ({ ...p, active: !p.active }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.active ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-2">Catégories *</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => toggleCat(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-body border transition-colors ${form.categories.includes(cat) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="h-9 px-4 font-body text-sm border border-border rounded-md hover:bg-muted">Annuler</button>
            <button onClick={handleSave} disabled={saving}
              className="h-9 px-4 font-body text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60">
              {saving ? 'Enregistrement…' : offer ? 'Mettre à jour' : "Créer l'offre"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Code form modal ───────────────────────────────────────────────────────────

type CodeForm = {
  code: string; typeReduction: 'pourcentage' | 'fixe'; reduction: number;
  minCommande: string; maxUtilisations: string; expiry: string; active: boolean;
};

function CodeModal({ code, onClose, onSave }: {
  code: PromoCode | null; onClose: () => void; onSave: (form: CodeForm) => Promise<void>;
}) {
  const blank: CodeForm = { code: generateCode(), typeReduction: 'pourcentage', reduction: 10, minCommande: '', maxUtilisations: '100', expiry: '', active: true };
  const [form, setForm] = useState<CodeForm>(
    code
      ? { code: code.code, typeReduction: code.typeReduction, reduction: code.reduction,
          minCommande: code.minCommande ? String(code.minCommande) : '',
          maxUtilisations: code.maxUtilisations ? String(code.maxUtilisations) : '',
          expiry: code.expiry ? toDateInput(code.expiry) : '', active: code.active }
      : blank
  );
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!form.code) { toast.error('Code obligatoire'); return; }
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2"><Tag className="w-5 h-5 text-primary" />
            <h3 className="font-display text-xl">{code ? 'Modifier le code' : 'Nouveau code promo'}</h3>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Code *</label>
            <div className="flex gap-2">
              <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                className="flex-1 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm font-medium tracking-widest focus:outline-none focus:ring-2 focus:ring-primary uppercase" />
              <button onClick={() => setForm(p => ({ ...p, code: generateCode() }))} className="h-9 px-3 border border-border rounded-md hover:bg-muted" title="Générer">
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Type</label>
              <select value={form.typeReduction} onChange={e => setForm(p => ({ ...p, typeReduction: e.target.value as 'pourcentage' | 'fixe' }))}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="pourcentage">Pourcentage (%)</option>
                <option value="fixe">Montant fixe (FCFA)</option>
              </select>
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                {form.typeReduction === 'pourcentage' ? 'Réduction (%)' : 'Montant (FCFA)'}
              </label>
              <input type="number" value={form.reduction} min={0}
                onChange={e => setForm(p => ({ ...p, reduction: parseFloat(e.target.value) || 0 }))}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Commande min. (FCFA)</label>
              <input type="number" value={form.minCommande} onChange={e => setForm(p => ({ ...p, minCommande: e.target.value }))} placeholder="0"
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Utilisations max.</label>
              <input type="number" value={form.maxUtilisations} onChange={e => setForm(p => ({ ...p, maxUtilisations: e.target.value }))} placeholder="100"
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Expiration</label>
              <input type="date" value={form.expiry} onChange={e => setForm(p => ({ ...p, expiry: e.target.value }))}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex items-center gap-3 mt-5">
              <label className="font-body text-sm text-muted-foreground">Actif</label>
              <button onClick={() => setForm(p => ({ ...p, active: !p.active }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.active ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="h-9 px-4 font-body text-sm border border-border rounded-md hover:bg-muted">Annuler</button>
            <button onClick={handleSave} disabled={saving}
              className="h-9 px-4 font-body text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60">
              {saving ? 'Enregistrement…' : code ? 'Mettre à jour' : 'Créer le code'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tier form modal ───────────────────────────────────────────────────────────

type TierForm = { nom: string; slug: string; pointsMin: number; pointsMax: string; couleur: string; ordre: number };

function TierModal({ tier, onClose, onSave }: {
  tier: TierDef | null; onClose: () => void; onSave: (form: TierForm) => Promise<void>;
}) {
  const [form, setForm] = useState<TierForm>({
    nom:       tier?.nom ?? '',
    slug:      tier?.slug ?? '',
    pointsMin: tier?.pointsMin ?? 0,
    pointsMax: tier?.pointsMax != null ? String(tier.pointsMax) : '',
    couleur:   tier?.couleur ?? 'bronze',
    ordre:     tier?.ordre ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!form.nom.trim() || !form.slug.trim()) { toast.error('Nom et slug obligatoires'); return; }
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };
  const preview = COLOR_PRESETS[form.couleur] ?? COLOR_PRESETS.bronze;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            <h3 className="font-display text-xl">{tier ? 'Modifier le niveau' : 'Nouveau niveau de fidélité'}</h3>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Nom *</label>
              <input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Ex : Or"
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Slug *</label>
              <input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} placeholder="ex : or"
                disabled={!!tier}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Points min</label>
              <input type="number" value={form.pointsMin} min={0}
                onChange={e => setForm(p => ({ ...p, pointsMin: parseInt(e.target.value) || 0 }))}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Points max (vide = ∞)</label>
              <input type="number" value={form.pointsMax} onChange={e => setForm(p => ({ ...p, pointsMax: e.target.value }))} placeholder="∞"
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Couleur</label>
              <select value={form.couleur} onChange={e => setForm(p => ({ ...p, couleur: e.target.value }))}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {COLOR_OPTIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Ordre</label>
              <input type="number" value={form.ordre} min={0}
                onChange={e => setForm(p => ({ ...p, ordre: parseInt(e.target.value) || 0 }))}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-md ${preview.bg}`}>
            <span className={`font-body text-sm font-medium ${preview.color}`}>Aperçu : {form.nom || 'Niveau'}</span>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="h-9 px-4 font-body text-sm border border-border rounded-md hover:bg-muted">Annuler</button>
            <button onClick={handleSave} disabled={saving}
              className="h-9 px-4 font-body text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60">
              {saving ? 'Enregistrement…' : tier ? 'Mettre à jour' : 'Créer le niveau'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Member detail panel ───────────────────────────────────────────────────────

function MemberPanel({ member, tiers, rewards, onClose, onAdjustPoints }: {
  member: LoyaltyUser; tiers: TierDef[]; rewards: LoyaltyReward[]; onClose: () => void;
  onAdjustPoints: (id: string, delta: number) => Promise<void>;
}) {
  const [delta, setDelta] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const sortedTiers = [...tiers].sort((a, b) => a.ordre - b.ordre);
  const currentIdx = sortedTiers.findIndex(t => t.slug === member.tier);
  const nextTier = currentIdx >= 0 && currentIdx < sortedTiers.length - 1 ? sortedTiers[currentIdx + 1] : null;
  const cfg = getTierDisplay(tiers, member.tier);
  const progress = nextTier ? Math.min((member.points / nextTier.pointsMin) * 100, 100) : 100;

  const handleAdjust = async () => {
    const d = parseInt(delta);
    if (!d) { toast.error('Entrez une valeur'); return; }
    setAdjusting(true);
    try { await onAdjustPoints(member._id, d); setDelta(''); toast.success(`${d > 0 ? '+' : ''}${d} points appliqués`); }
    finally { setAdjusting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/40" onClick={onClose}>
      <div className="bg-background h-full w-full max-w-md shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="font-display text-xl">Détail membre</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center font-display text-xl text-primary">
              {member.nom.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <p className="font-display text-lg text-foreground">{member.nom}</p>
              <p className="font-body text-xs text-muted-foreground">{member.email}</p>
              <TierBadge tiers={tiers} slug={member.tier} />
            </div>
          </div>
          <div className="bg-muted rounded-lg p-4">
            <div className="flex justify-between mb-2">
              <p className="font-body text-sm text-foreground font-medium">{member.points.toLocaleString('fr-FR')} pts</p>
              {nextTier && <p className="font-body text-xs text-muted-foreground">{nextTier.nom} à {nextTier.pointsMin.toLocaleString('fr-FR')} pts</p>}
            </div>
            <div className="h-2 bg-background rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            {nextTier && (
              <p className="font-body text-xs text-muted-foreground mt-1">
                {Math.max(0, nextTier.pointsMin - member.points).toLocaleString('fr-FR')} pts pour {nextTier.nom}
              </p>
            )}
            {!nextTier && (
              <p className="font-body text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Niveau maximum atteint
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={`${cfg.bg} rounded-lg p-3 text-center`}>
              <p className="font-body text-xs text-muted-foreground">Tier actuel</p>
              <p className={`font-body text-sm font-medium mt-0.5 ${cfg.color}`}>{cfg.label}</p>
            </div>
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="font-body text-xs text-muted-foreground">Statut</p>
              <span className={`font-body text-xs font-medium px-2 py-0.5 rounded-full ${member.statut === 'actif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {member.statut === 'actif' ? 'Actif' : 'Inactif'}
              </span>
            </div>
          </div>
          <div className="border border-border rounded-lg p-4 space-y-2">
            <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">Ajustement manuel des points</p>
            <div className="flex gap-2">
              <input type="number" value={delta} onChange={e => setDelta(e.target.value)} placeholder="+500 ou -200"
                className="flex-1 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <button onClick={handleAdjust} disabled={adjusting}
                className="h-9 px-4 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 disabled:opacity-60">
                Appliquer
              </button>
            </div>
          </div>
          <div>
            <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-2">Récompenses disponibles</p>
            <div className="space-y-2">
              {rewards.filter(r => r.actif && r.points <= member.points).map(r => (
                <div key={r._id} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                  <div>
                    <p className="font-body text-sm font-medium text-foreground">{r.nom}</p>
                    <p className="font-body text-xs text-muted-foreground">{r.points.toLocaleString('fr-FR')} pts</p>
                  </div>
                  <button onClick={() => onAdjustPoints(member._id, -r.points).then(() => toast.success(`${r.nom} échangé`))}
                    className="text-xs font-body text-emerald-700 border border-emerald-300 rounded px-2 py-1 hover:bg-emerald-100">
                    Échanger
                  </button>
                </div>
              ))}
              {rewards.filter(r => r.actif && r.points <= member.points).length === 0 && (
                <p className="font-body text-xs text-muted-foreground italic">Pas de récompenses disponibles pour ce solde</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PromoSortTh({ label, k, sortKey, sortDir, onSort }: {
  label: string; k: MemberSort; sortKey: MemberSort; sortDir: 'asc' | 'desc'; onSort: (k: MemberSort) => void;
}) {
  return (
    <th className="p-3 text-left font-body text-xs uppercase tracking-wider text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
      onClick={() => onSort(k)}>
      <span className="flex items-center gap-1">
        {label}
        {sortKey === k ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronDown className="w-3 h-3 opacity-20" />}
      </span>
    </th>
  );
}

// ─── Reward form modal ────────────────────────────────────────────────────────

function RewardModal({ reward, onClose, onSave }: {
  reward: LoyaltyReward | null; onClose: () => void;
  onSave: (form: { nom: string; description: string; points: number; actif: boolean }) => Promise<void>;
}) {
  const [form, setForm] = useState({ nom: reward?.nom ?? '', description: reward?.description ?? '', points: reward?.points ?? 500, actif: reward?.actif ?? true });
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!form.nom.trim() || form.points < 1) { toast.error('Nom et points obligatoires'); return; }
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2"><Gift className="w-5 h-5 text-primary" />
            <h3 className="font-display text-xl">{reward ? 'Modifier la récompense' : 'Nouvelle récompense'}</h3>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Nom *</label>
            <input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Ex : Jus offert"
              className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Description</label>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Ex : 1 jus de votre choix"
              className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Points requis *</label>
            <input type="number" value={form.points} min={1} onChange={e => setForm(p => ({ ...p, points: parseInt(e.target.value) || 1 }))}
              className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex items-center gap-3">
            <label className="font-body text-sm text-muted-foreground">Actif</label>
            <button onClick={() => setForm(p => ({ ...p, actif: !p.actif }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.actif ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.actif ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="h-9 px-4 font-body text-sm border border-border rounded-md hover:bg-muted">Annuler</button>
            <button onClick={handleSave} disabled={saving}
              className="h-9 px-4 font-body text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60">
              {saving ? 'Enregistrement…' : reward ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PromotionsPage() {
  const [tab, setTab] = useState<Tab>('offres');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [members, setMembers] = useState<LoyaltyUser[]>([]);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [tiers, setTiers] = useState<TierDef[]>([]);
  const [loadingPromo, setLoadingPromo] = useState(true);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [loadingTiers, setLoadingTiers] = useState(true);

  const [searchOffers, setSearchOffers] = useState('');
  const [searchCodes, setSearchCodes] = useState('');
  const [searchMembers, setSearchMembers] = useState('');

  const [offerModal, setOfferModal] = useState<Promotion | null | 'new'>(null);
  const [codeModal, setCodeModal] = useState<PromoCode | null | 'new'>(null);
  const [memberPanel, setMemberPanel] = useState<LoyaltyUser | null>(null);
  const [rewardModal, setRewardModal] = useState<LoyaltyReward | null | 'new'>(null);
  const [tierDefModal, setTierDefModal] = useState<TierDef | null | 'new'>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'offer' | 'code' | 'reward' | 'tier'; id: string } | null>(null);

  const [memberSort, setMemberSort] = useState<MemberSort>('points');
  const [memberDir, setMemberDir] = useState<'asc' | 'desc'>('desc');
  const [tierFilter, setTierFilter] = useState<string>('all');

  // ── Load ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [promoRes, codesRes, usersRes, rewardsRes, tiersRes] = await Promise.all([
          adminGet<{ data: Promotion[] }>('/promotions'),
          adminGet<{ data: PromoCode[] }>('/promotions/codes'),
          adminGet<{ data: LoyaltyUser[] }>('/users?limit=500'),
          adminGet<{ data: LoyaltyReward[] }>('/fidelite/rewards'),
          adminGet<{ data: TierDef[] }>('/fidelite/tiers'),
        ]);
        if (mounted) {
          setPromotions(promoRes.data);
          setCodes(codesRes.data);
          setMembers(usersRes.data);
          setRewards(rewardsRes.data);
          setTiers(tiersRes.data);
        }
      } catch {
        if (mounted) toast.error('Erreur chargement promotions');
      } finally {
        if (mounted) {
          setLoadingPromo(false); setLoadingCodes(false);
          setLoadingMembers(false); setLoadingRewards(false); setLoadingTiers(false);
        }
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const activeOffers = promotions.filter(p => offerStatus(p) === 'active');
  const activeCodes  = codes.filter(c => codeStatus(c) === 'active');
  const totalUtils   = promotions.reduce((s, p) => s + p.utilisations, 0) + codes.reduce((s, c) => s + c.utilisations, 0);
  const totalPoints  = members.reduce((s, m) => s + m.points, 0);
  const sortedTiers  = useMemo(() => [...tiers].sort((a, b) => a.ordre - b.ordre), [tiers]);

  const filteredOffers  = useMemo(() => promotions.filter(p => p.nom.toLowerCase().includes(searchOffers.toLowerCase())), [promotions, searchOffers]);
  const filteredCodes   = useMemo(() => codes.filter(c => c.code.toLowerCase().includes(searchCodes.toLowerCase())), [codes, searchCodes]);

  const filteredMembers = useMemo(() => {
    const tierOrder: Record<string, number> = {};
    sortedTiers.forEach((t, i) => { tierOrder[t.slug] = i; });
    const list = members.filter(m =>
      m.nom.toLowerCase().includes(searchMembers.toLowerCase()) &&
      (tierFilter === 'all' || m.tier === tierFilter)
    );
    return [...list].sort((a, b) => {
      const v = (m: LoyaltyUser) => memberSort === 'tier' ? (tierOrder[m.tier] ?? 0) : (m[memberSort] as number);
      return memberDir === 'desc' ? v(b) - v(a) : v(a) - v(b);
    });
  }, [members, sortedTiers, searchMembers, tierFilter, memberSort, memberDir]);

  const tierData = useMemo(() =>
    sortedTiers.map(t => ({ tier: t.nom, count: members.filter(m => m.tier === t.slug).length })),
    [sortedTiers, members]
  );

  const offerUsageData = filteredOffers.slice(0, 6).map(p => ({ nom: p.nom.split(' ').slice(0, 2).join(' '), utilisations: p.utilisations }));

  const handleMemberSort = (k: MemberSort) => {
    if (k === memberSort) setMemberDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setMemberSort(k); setMemberDir('desc'); }
  };

  // ── Offer actions ─────────────────────────────────────────────────────────────

  const saveOffer = async (form: OfferForm, editId: string | null) => {
    const payload = { nom: form.nom, type: form.type, valeur: form.valeur, categories: form.categories,
      dateDebut: form.dateDebut, dateFin: form.dateFin, active: form.active,
      limiteUtilisations: form.limiteUtilisations ? +form.limiteUtilisations : null };
    if (editId) {
      const res = await adminPatch<{ data: Promotion }>(`/promotions/${editId}`, payload);
      setPromotions(prev => prev.map(p => p._id === editId ? res.data : p));
      toast.success('Offre mise à jour');
    } else {
      const res = await adminPost<{ data: Promotion }>('/promotions', payload);
      setPromotions(prev => [res.data, ...prev]);
      toast.success('Offre créée');
    }
    setOfferModal(null);
  };

  const toggleOffer = async (p: Promotion) => {
    if (offerStatus(p) === 'expiree') return;
    try {
      const res = await adminPatch<{ data: Promotion }>(`/promotions/${p._id}`, { active: !p.active });
      setPromotions(prev => prev.map(x => x._id === p._id ? res.data : x));
    } catch { toast.error('Erreur mise à jour'); }
  };

  const deleteOffer = async (id: string) => {
    try {
      await adminDelete(`/promotions/${id}`);
      setPromotions(prev => prev.filter(p => p._id !== id));
      toast.success('Offre supprimée'); setDeleteConfirm(null);
    } catch { toast.error('Erreur suppression'); }
  };

  // ── Code actions ──────────────────────────────────────────────────────────────

  const saveCode = async (form: CodeForm, editId: string | null) => {
    const payload = { code: form.code, typeReduction: form.typeReduction, reduction: form.reduction,
      minCommande: form.minCommande ? +form.minCommande : 0,
      maxUtilisations: form.maxUtilisations ? +form.maxUtilisations : 100,
      expiry: form.expiry || null, active: form.active };
    if (editId) {
      const res = await adminPatch<{ data: PromoCode }>(`/promotions/codes/${editId}`, payload);
      setCodes(prev => prev.map(c => c._id === editId ? res.data : c));
      toast.success('Code mis à jour');
    } else {
      const res = await adminPost<{ data: PromoCode }>('/promotions/codes', payload);
      setCodes(prev => [res.data, ...prev]);
      toast.success(`Code ${form.code} créé`);
    }
    setCodeModal(null);
  };

  const toggleCode = async (c: PromoCode) => {
    const st = codeStatus(c);
    if (st === 'expiree' || st === 'epuisee') return;
    try {
      const res = await adminPatch<{ data: PromoCode }>(`/promotions/codes/${c._id}`, { active: !c.active });
      setCodes(prev => prev.map(x => x._id === c._id ? res.data : x));
    } catch { toast.error('Erreur mise à jour'); }
  };

  const deleteCode = async (id: string) => {
    try {
      await adminDelete(`/promotions/codes/${id}`);
      setCodes(prev => prev.filter(c => c._id !== id));
      toast.success('Code supprimé'); setDeleteConfirm(null);
    } catch { toast.error('Erreur suppression'); }
  };

  // ── Reward actions ────────────────────────────────────────────────────────────

  type RewardForm = { nom: string; description: string; points: number; actif: boolean };

  const saveReward = async (form: RewardForm, editId: string | null) => {
    if (editId) {
      const res = await adminPatch<{ data: LoyaltyReward }>(`/fidelite/rewards/${editId}`, form);
      setRewards(prev => prev.map(r => r._id === editId ? res.data : r));
      toast.success('Récompense mise à jour');
    } else {
      const res = await adminPost<{ data: LoyaltyReward }>('/fidelite/rewards', form);
      setRewards(prev => [...prev, res.data].sort((a, b) => a.points - b.points));
      toast.success('Récompense créée');
    }
    setRewardModal(null);
  };

  const toggleReward = async (r: LoyaltyReward) => {
    try {
      const res = await adminPatch<{ data: LoyaltyReward }>(`/fidelite/rewards/${r._id}`, { actif: !r.actif });
      setRewards(prev => prev.map(x => x._id === r._id ? res.data : x));
    } catch { toast.error('Erreur'); }
  };

  const deleteReward = async (id: string) => {
    try {
      await adminDelete(`/fidelite/rewards/${id}`);
      setRewards(prev => prev.filter(r => r._id !== id));
      toast.success('Récompense supprimée'); setDeleteConfirm(null);
    } catch { toast.error('Erreur suppression'); }
  };

  // ── Tier actions ──────────────────────────────────────────────────────────────

  const saveTier = async (form: TierForm, editId: string | null) => {
    const payload = { nom: form.nom, slug: form.slug, pointsMin: form.pointsMin,
      pointsMax: form.pointsMax ? parseInt(form.pointsMax) : null, couleur: form.couleur, ordre: form.ordre };
    if (editId) {
      const res = await adminPatch<{ data: TierDef }>(`/fidelite/tiers/${editId}`, payload);
      setTiers(prev => prev.map(t => t._id === editId ? res.data : t).sort((a, b) => a.ordre - b.ordre));
      toast.success('Niveau mis à jour');
    } else {
      const res = await adminPost<{ data: TierDef }>('/fidelite/tiers', payload);
      setTiers(prev => [...prev, res.data].sort((a, b) => a.ordre - b.ordre));
      toast.success('Niveau créé');
    }
    setTierDefModal(null);
  };

  const deleteTierDef = async (id: string) => {
    try {
      await adminDelete(`/fidelite/tiers/${id}`);
      setTiers(prev => prev.filter(t => t._id !== id));
      toast.success('Niveau supprimé'); setDeleteConfirm(null);
    } catch { toast.error('Erreur suppression'); }
  };

  // ── Points actions ────────────────────────────────────────────────────────────

  const adjustPoints = async (id: string, delta: number) => {
    const res = await adminPatch<{ data: LoyaltyUser }>(`/users/${id}/points`, { delta });
    setMembers(prev => prev.map(m => m._id === id ? res.data : m));
    if (memberPanel?._id === id) setMemberPanel(res.data);
  };

  const deleteItem = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'offer')  deleteOffer(deleteConfirm.id);
    else if (deleteConfirm.type === 'code')   deleteCode(deleteConfirm.id);
    else if (deleteConfirm.type === 'reward') deleteReward(deleteConfirm.id);
    else deleteTierDef(deleteConfirm.id);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Promotions & Fidélité</h2>
          <p className="font-body text-sm text-muted-foreground">Offres spéciales, codes promo, programme de fidélité</p>
        </div>
        <button
          onClick={() => {
            if (tab === 'offres')   setOfferModal('new');
            if (tab === 'codes')    setCodeModal('new');
            if (tab === 'fidelite') setRewardModal('new');
          }}
          className="flex items-center gap-2 h-9 px-4 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 shrink-0"
        >
          <Plus className="w-4 h-4" />
          {tab === 'offres' ? 'Nouvelle offre' : tab === 'codes' ? 'Nouveau code' : 'Nouvelle récompense'}
        </button>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Offres actives" value={String(activeOffers.length)} sub={`/${promotions.length} au total`} color="border-l-4 border-l-primary" icon={<Zap className="w-4 h-4" />} />
        <KpiCard label="Codes actifs" value={String(activeCodes.length)} sub={`/${codes.length} au total`} color="border-l-4 border-l-blue-500" icon={<Tag className="w-4 h-4" />} />
        <KpiCard label="Utilisations totales" value={fmtK(totalUtils)} sub="offres + codes" color="border-l-4 border-l-emerald-500" icon={<TrendingUp className="w-4 h-4" />} />
        <KpiCard label="Membres fidélité" value={String(members.length)} sub={`${(totalPoints / 1000).toFixed(0)}k pts en circulation`} color="border-l-4 border-l-violet-500" icon={<Users className="w-4 h-4" />} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {([['offres', <Zap className="w-4 h-4" />, 'Offres spéciales'], ['codes', <Tag className="w-4 h-4" />, 'Codes promo'], ['fidelite', <Star className="w-4 h-4" />, 'Programme fidélité']] as const).map(([key, icon, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className={`whitespace-nowrap shrink-0 flex items-center gap-2 px-4 py-2.5 font-body text-sm border-b-2 transition-colors -mb-px ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── TAB: OFFRES ─────────────────────────────────────────────────────── */}
      {tab === 'offres' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['active', 'a_venir', 'inactive', 'expiree'] as OfferStatus[]).map(s => (
              <div key={s} className="bg-background border border-border rounded-lg p-3">
                <span className={`flex items-center gap-1 text-xs font-body px-2 py-0.5 rounded-full w-fit ${OFFER_STATUS_CONFIG[s].color}`}>
                  {OFFER_STATUS_CONFIG[s].icon}{OFFER_STATUS_CONFIG[s].label}
                </span>
                {loadingPromo ? <div className="h-8 w-12 bg-muted rounded animate-pulse mt-2" />
                  : <p className="font-display text-2xl text-foreground mt-2">{promotions.filter(p => offerStatus(p) === s).length}</p>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-background border border-border rounded-lg p-5">
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-4">Utilisations par offre</p>
              {loadingPromo ? <div className="h-48 bg-muted rounded animate-pulse" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={offerUsageData} margin={{ top: 0, right: 0, left: 0, bottom: 30 }}>
                    <XAxis dataKey="nom" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="utilisations" name="Utilisations" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="bg-background border border-border rounded-lg p-5">
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-3">Répartition par type</p>
              {(['pourcentage', 'fixe', 'bundle', 'flash'] as OfferType[]).map(t => {
                const count = promotions.filter(p => p.type === t).length;
                const pct = promotions.length ? Math.round((count / promotions.length) * 100) : 0;
                const cfg = OFFER_TYPE_CONFIG[t];
                return (
                  <div key={t} className="mb-3">
                    <div className="flex justify-between text-xs font-body mb-1">
                      <span className={`px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-muted-foreground">{count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={searchOffers} onChange={e => setSearchOffers(e.target.value)} placeholder="Rechercher une offre…"
              className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="space-y-3">
            {loadingPromo
              ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-background border border-border rounded-lg animate-pulse" />)
              : filteredOffers.map(offer => {
                const st = offerStatus(offer);
                const statusCfg = OFFER_STATUS_CONFIG[st];
                const typeCfg = OFFER_TYPE_CONFIG[offer.type];
                const usagePct = offer.limiteUtilisations ? Math.round((offer.utilisations / offer.limiteUtilisations) * 100) : null;
                return (
                  <div key={offer._id} className={`bg-background border rounded-lg p-4 ${st === 'active' ? 'border-border' : 'border-border/50 opacity-75'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="font-display text-base text-foreground">{offer.nom}</h4>
                          <span className={`text-xs font-body px-2 py-0.5 rounded-full ${typeCfg.color}`}>{typeCfg.label}</span>
                          <span className={`flex items-center gap-1 text-xs font-body px-2 py-0.5 rounded-full ${statusCfg.color}`}>{statusCfg.icon}{statusCfg.label}</span>
                          {offer.type === 'flash' && <span className="flex items-center gap-1 text-xs font-body px-2 py-0.5 rounded-full bg-orange-100 text-orange-700"><Flame className="w-3 h-3" />Flash</span>}
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs font-body text-muted-foreground">
                          <span>{fmtDate(offer.dateDebut)} → {fmtDate(offer.dateFin)}</span>
                          <span>{offer.utilisations} utilisation{offer.utilisations > 1 ? 's' : ''}{offer.limiteUtilisations ? ` / ${offer.limiteUtilisations}` : ''}</span>
                          {offer.categories.length > 0 && <span>{offer.categories.join(', ')}</span>}
                        </div>
                        {usagePct !== null && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${usagePct >= 90 ? 'bg-red-500' : usagePct >= 60 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${usagePct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{usagePct}%</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <p className="font-display text-xl text-primary">
                          {offer.type === 'pourcentage' || offer.type === 'flash' ? `-${offer.valeur}%` : offer.type === 'bundle' ? `${offer.valeur.toLocaleString('fr-FR')} F` : `-${offer.valeur.toLocaleString('fr-FR')} F`}
                        </p>
                        <div className="flex gap-1">
                          {st !== 'expiree' && (
                            <button onClick={() => toggleOffer(offer)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                              {offer.active && st !== 'a_venir' ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4" />}
                            </button>
                          )}
                          <button onClick={() => setOfferModal(offer)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => setDeleteConfirm({ type: 'offer', id: offer._id })} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* ── TAB: CODES PROMO ─────────────────────────────────────────────────── */}
      {tab === 'codes' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['active', 'inactive', 'epuisee', 'expiree'] as CodeStatus[]).map(s => (
              <div key={s} className="bg-background border border-border rounded-lg p-3">
                <span className={`text-xs font-body px-2 py-0.5 rounded-full ${CODE_STATUS_CONFIG[s].color}`}>{CODE_STATUS_CONFIG[s].label}</span>
                {loadingCodes ? <div className="h-8 w-12 bg-muted rounded animate-pulse mt-2" />
                  : <p className="font-display text-2xl text-foreground mt-2">{codes.filter(c => codeStatus(c) === s).length}</p>}
              </div>
            ))}
          </div>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={searchCodes} onChange={e => setSearchCodes(e.target.value)} placeholder="Rechercher un code…"
              className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="bg-background border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-4 text-left font-body text-xs uppercase tracking-wider text-muted-foreground">Code</th>
                  <th className="p-4 text-left font-body text-xs uppercase tracking-wider text-muted-foreground">Réduction</th>
                  <th className="p-4 text-left font-body text-xs uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Utilisations</th>
                  <th className="p-4 text-left font-body text-xs uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Expiration</th>
                  <th className="p-4 text-left font-body text-xs uppercase tracking-wider text-muted-foreground">Statut</th>
                  <th className="p-4 text-left font-body text-xs uppercase tracking-wider text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {loadingCodes
                  ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[1,2].map(j => <td key={j} className="p-4"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                    {[3,4].map(j => <td key={j} className="p-4 hidden sm:table-cell"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                    {[5,6].map(j => <td key={j} className="p-4"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                    </tr>
                  ))
                  : filteredCodes.map(code => {
                    const st = codeStatus(code);
                    const cfg = CODE_STATUS_CONFIG[st];
                    const usagePct = code.maxUtilisations ? Math.round((code.utilisations / code.maxUtilisations) * 100) : null;
                    return (
                      <tr key={code._id} className={`border-b border-border/50 last:border-0 hover:bg-muted/30 ${st !== 'active' ? 'opacity-60' : ''}`}>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-body font-bold text-foreground tracking-widest">{code.code}</span>
                            <button onClick={() => { navigator.clipboard.writeText(code.code); toast.success('Code copié'); }}
                              className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="font-body font-medium text-foreground">
                            {code.typeReduction === 'pourcentage' ? `-${code.reduction}%` : `-${code.reduction.toLocaleString('fr-FR')} F`}
                          </span>
                          {code.minCommande && code.minCommande > 0 && (
                            <p className="font-body text-xs text-muted-foreground">min. {code.minCommande.toLocaleString('fr-FR')} F</p>
                          )}
                        </td>
                        <td className="p-4 hidden sm:table-cell">
                          <span className="font-body text-foreground">{code.utilisations}{code.maxUtilisations ? `/${code.maxUtilisations}` : ''}</span>
                          {usagePct !== null && (
                            <div className="mt-1 h-1 w-20 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${usagePct >= 90 ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${usagePct}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="p-4 font-body text-muted-foreground hidden sm:table-cell">{code.expiry ? fmtDate(code.expiry) : '—'}</td>
                        <td className="p-4"><span className={`px-2 py-0.5 rounded-full text-xs font-body ${cfg.color}`}>{cfg.label}</span></td>
                        <td className="p-4">
                          <div className="flex gap-1">
                            {st !== 'expiree' && st !== 'epuisee' && (
                              <button onClick={() => toggleCode(code)} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                                {code.active ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4" />}
                              </button>
                            )}
                            <button onClick={() => setCodeModal(code)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => setDeleteConfirm({ type: 'code', id: code._id })} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
            {!loadingCodes && filteredCodes.length === 0 && (
              <p className="text-center py-10 font-body text-sm text-muted-foreground">Aucun code trouvé</p>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: PROGRAMME FIDÉLITÉ ──────────────────────────────────────────── */}
      {tab === 'fidelite' && (
        <div className="space-y-5">
          {/* Tier KPI cards */}
          {loadingTiers
            ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-background border border-border rounded-lg animate-pulse" />)}</div>
            : sortedTiers.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {sortedTiers.map(tier => {
                  const { color, bg } = getTierDisplay(tiers, tier.slug);
                  const count = members.filter(m => m.tier === tier.slug).length;
                  return (
                    <div key={tier._id} className={`bg-background border rounded-lg p-4 ${bg} border-border`}>
                      <div className={`font-body text-sm font-medium mb-1 ${color}`}>{tier.nom}</div>
                      {loadingMembers ? <div className="h-8 w-10 bg-muted/60 rounded animate-pulse" />
                        : <p className="font-display text-2xl text-foreground">{count}</p>}
                      <p className="font-body text-xs text-muted-foreground">
                        {tier.pointsMin.toLocaleString('fr-FR')} pts{tier.pointsMax != null ? ` → ${tier.pointsMax.toLocaleString('fr-FR')}` : '+'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )
          }

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Rewards catalog */}
            <div className="bg-background border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">Récompenses</p>
                <button onClick={() => setRewardModal('new')} className="flex items-center gap-1 text-xs font-body text-primary hover:underline">
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              </div>
              {loadingRewards
                ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-muted rounded-md animate-pulse" />)}</div>
                : rewards.length === 0
                  ? <p className="font-body text-sm text-muted-foreground text-center py-6">Aucune récompense. <button onClick={() => setRewardModal('new')} className="text-primary hover:underline">Créer</button></p>
                  : (
                    <div className="space-y-2">
                      {rewards.map(r => (
                        <div key={r._id} className={`flex items-center justify-between p-3 rounded-md border border-border ${!r.actif ? 'opacity-50' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Gift className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span className="font-body text-sm font-medium text-foreground truncate">{r.nom}</span>
                            </div>
                            <p className="font-body text-xs text-muted-foreground ml-5">
                              {r.points.toLocaleString('fr-FR')} pts{r.description ? ` — ${r.description}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button onClick={() => toggleReward(r)} className={`transition-colors ${r.actif ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                              {r.actif ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setRewardModal(r)} className="p-1 rounded hover:bg-muted text-muted-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeleteConfirm({ type: 'reward', id: r._id })} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
              }
            </div>

            {/* Tiers management */}
            <div className="bg-background border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">Niveaux de fidélité</p>
                <button onClick={() => setTierDefModal('new')} className="flex items-center gap-1 text-xs font-body text-primary hover:underline">
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              </div>
              {loadingTiers
                ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded-md animate-pulse" />)}</div>
                : sortedTiers.length === 0
                  ? <p className="font-body text-sm text-muted-foreground text-center py-6">Aucun niveau. <button onClick={() => setTierDefModal('new')} className="text-primary hover:underline">Créer</button></p>
                  : (
                    <div className="space-y-2">
                      {sortedTiers.map(t => {
                        const { color, bg } = getTierDisplay(tiers, t.slug);
                        return (
                          <div key={t._id} className={`flex items-center justify-between p-3 rounded-md border border-border ${bg}`}>
                            <div className="flex-1 min-w-0">
                              <span className={`font-body text-sm font-medium ${color}`}>{t.nom}</span>
                              <p className="font-body text-xs text-muted-foreground">
                                {t.pointsMin.toLocaleString('fr-FR')} pts{t.pointsMax != null ? ` → ${t.pointsMax.toLocaleString('fr-FR')}` : '+'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <button onClick={() => setTierDefModal(t)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setDeleteConfirm({ type: 'tier', id: t._id })} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
              }
            </div>

            {/* Pie chart */}
            <div className="bg-background border border-border rounded-lg p-5">
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-3">Répartition par niveau</p>
              {loadingMembers || loadingTiers
                ? <div className="h-40 bg-muted rounded animate-pulse" />
                : (
                  <div className="flex gap-4 items-center">
                    <div style={{ width: 160, height: 160 }}>
                      <PieChart width={160} height={160}>
                        <Pie data={tierData} dataKey="count" nameKey="tier" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                          {tierData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </div>
                    <div className="flex-1 space-y-2">
                      {tierData.map((d, i) => (
                        <div key={d.tier} className="flex items-center justify-between text-xs font-body">
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{d.tier}
                          </span>
                          <span className="font-medium">{d.count} ({members.length ? Math.round((d.count / members.length) * 100) : 0}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
            </div>
          </div>

          {/* Members filter + search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={searchMembers} onChange={e => setSearchMembers(e.target.value)} placeholder="Rechercher un membre…"
                className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setTierFilter('all')}
                className={`h-10 px-3 rounded-md font-body text-sm transition-colors ${tierFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-background border border-border hover:bg-muted'}`}>
                Tous
              </button>
              {sortedTiers.map(t => (
                <button key={t.slug} onClick={() => setTierFilter(t.slug)}
                  className={`h-10 px-3 rounded-md font-body text-sm transition-colors ${tierFilter === t.slug ? 'bg-primary text-primary-foreground' : 'bg-background border border-border hover:bg-muted'}`}>
                  {t.nom}
                </button>
              ))}
            </div>
          </div>

          {/* Members table */}
          <div className="bg-background border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <PromoSortTh label="Membre" k="nom" sortKey={memberSort} sortDir={memberDir} onSort={handleMemberSort} />
                  <PromoSortTh label="Niveau" k="tier" sortKey={memberSort} sortDir={memberDir} onSort={handleMemberSort} />
                  <PromoSortTh label="Points" k="points" sortKey={memberSort} sortDir={memberDir} onSort={handleMemberSort} />
                  <th className="p-3 text-left font-body text-xs uppercase tracking-wider text-muted-foreground hidden md:table-cell">Statut</th>
                  <th className="p-3 text-left font-body text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Inscrit le</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {loadingMembers
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[1,2,3,4,5,6].map(j => <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                    </tr>
                  ))
                  : filteredMembers.map(m => (
                    <tr key={m._id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setMemberPanel(m)}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-display text-sm text-primary shrink-0">
                            {m.nom.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-body text-sm font-medium text-foreground">{m.nom}</p>
                            <p className="font-body text-xs text-muted-foreground">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3"><TierBadge tiers={tiers} slug={m.tier} /></td>
                      <td className="p-3 font-body font-medium text-foreground">{m.points.toLocaleString('fr-FR')}</td>
                      <td className="p-3 hidden md:table-cell">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-body ${m.statut === 'actif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {m.statut === 'actif' ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="p-3 font-body text-muted-foreground hidden lg:table-cell">{fmtDate(m.createdAt)}</td>
                      <td className="p-3"><ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90" /></td>
                    </tr>
                  ))
                }
                {!loadingMembers && filteredMembers.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 font-body text-sm text-muted-foreground">Aucun membre trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────────────────── */}
      {offerModal && (
        <OfferModal offer={offerModal === 'new' ? null : offerModal} onClose={() => setOfferModal(null)}
          onSave={form => saveOffer(form, offerModal !== 'new' ? (offerModal as Promotion)._id : null)} />
      )}
      {codeModal && (
        <CodeModal code={codeModal === 'new' ? null : codeModal} onClose={() => setCodeModal(null)}
          onSave={form => saveCode(form, codeModal !== 'new' ? (codeModal as PromoCode)._id : null)} />
      )}
      {memberPanel && (
        <MemberPanel member={memberPanel} tiers={tiers} rewards={rewards} onClose={() => setMemberPanel(null)} onAdjustPoints={adjustPoints} />
      )}
      {rewardModal && (
        <RewardModal reward={rewardModal === 'new' ? null : rewardModal} onClose={() => setRewardModal(null)}
          onSave={form => saveReward(form, rewardModal !== 'new' ? (rewardModal as LoyaltyReward)._id : null)} />
      )}
      {tierDefModal && (
        <TierModal tier={tierDefModal === 'new' ? null : tierDefModal} onClose={() => setTierDefModal(null)}
          onSave={form => saveTier(form, tierDefModal !== 'new' ? (tierDefModal as TierDef)._id : null)} />
      )}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="font-display text-lg">Confirmer la suppression</p>
                <p className="font-body text-sm text-muted-foreground">Cette action est irréversible.</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="h-9 px-4 font-body text-sm border border-border rounded-md hover:bg-muted">Annuler</button>
              <button onClick={deleteItem} className="h-9 px-4 font-body text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
