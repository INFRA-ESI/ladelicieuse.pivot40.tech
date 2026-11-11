import {
  Download, Eye, Search, X, FileText, Plus, TrendingUp, TrendingDown,
  Minus, BarChart2, ChevronUp, ChevronDown, RefreshCw, CheckCircle, Clock,
  AlertCircle, Receipt, Layers, Mail, Trash2, AlertTriangle,
} from '@/components/icons';
import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { adminGet, adminPost, adminPatch, adminDelete } from '@/services/adminApiService';
import { formatPrixFcfa as fmt } from '@/lib/fcfa';
import { usePagination } from '@/hooks/usePagination';
import { BRAND, downloadPdf } from '@/lib/pdfDocument';
import { safeFileName } from '@/lib/downloadFile';
import TablePagination from '@/components/admin/TablePagination';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'payee' | 'en_attente' | 'annulee' | 'remboursee';
type PayMode = 'Mobile Money' | 'Espèces' | 'Carte bancaire';
type Tab = 'factures' | 'rentabilite' | 'bilan';
type SortKey = 'nom' | 'cout' | 'revenus' | 'marge' | 'margePct' | 'plats';

interface InvoiceItem { nom: string; qty: number; prixUnit: number; coutUnit: number; }

interface Invoice {
  _id: string;
  numero: string;
  client: string;
  email: string;
  telephone: string;
  items: InvoiceItem[];
  statut: InvoiceStatus;
  modePaiement: string;
  notes: string;
  totalHT: number;
  tva: number;
  totalTTC: number;
  createdAt: string;
}

interface IngredientRenta {
  id: string; nom: string; categorie: string; unite: string;
  qteConsommee: number; coutTotal: number; revenusAttribues: number;
  marge: number; margePct: number; platsUtilisant: number;
}

// ─── Types pour les onglets Rentabilité & Bilan ───────────────────────────────

interface BilanRow {
  mois: string;
  moisKey: string;
  revenus: number;
  coutMatieres: number;
  chargesOp: number;
  benefice: number;
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const totalCout = (inv: Invoice) => inv.items.reduce((s, it) => s + it.coutUnit * it.qty, 0);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; icon: React.ReactNode }> = {
  payee:      { label: 'Payée',      color: 'text-primary', icon: <CheckCircle className="w-3 h-3" /> },
  en_attente: { label: 'En attente', color: 'text-amber-700',     icon: <Clock       className="w-3 h-3" /> },
  annulee:    { label: 'Annulée',    color: 'text-destructive',         icon: <X           className="w-3 h-3" /> },
  remboursee: { label: 'Remboursée', color: 'text-muted-foreground',   icon: <RefreshCw   className="w-3 h-3" /> },
};

function MargeBadge({ pct }: { pct: number }) {
  const c = pct >= 65 ? 'text-primary' : pct >= 50 ? 'text-amber-700' : 'text-destructive';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-body ${c}`}>{pct.toFixed(1)}%</span>;
}

function KpiCard({ label, value, sub, color, loading }: { label: string; value: string; sub?: string; color?: string; loading?: boolean }) {
  return (
    <div className={`bg-background border rounded-lg p-4 ${color || 'border-border'}`}>
      <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      {loading
        ? <div className="h-8 w-20 bg-muted rounded animate-pulse mt-1" />
        : <p className="font-display text-2xl text-foreground mt-1">{value}</p>}
      {sub && !loading && <p className="font-body text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Th({ label, sortKey, cur, dir, onSort }: {
  label: string; sortKey: SortKey; cur: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
}) {
  return (
    <th className="p-3 text-left font-body text-xs uppercase tracking-wider text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
      onClick={() => onSort(sortKey)}>
      <span className="flex items-center gap-1">
        {label}
        {cur === sortKey
          ? (dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
          : <ChevronDown className="w-3 h-3 opacity-20" />}
      </span>
    </th>
  );
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

const STATUS_PDF: Record<InvoiceStatus, { fill: [number, number, number]; color: [number, number, number] }> = {
  payee:      { fill: [209, 250, 229], color: [6, 95, 70] },
  en_attente: { fill: [254, 243, 199], color: [146, 64, 14] },
  annulee:    { fill: [254, 226, 226], color: [153, 27, 27] },
  remboursee: { fill: [237, 233, 254], color: [91, 33, 182] },
};
const WATERMARK: Partial<Record<InvoiceStatus, string>> = { payee: 'PAYÉE', annulee: 'ANNULÉE', remboursee: 'REMBOURSÉE' };

// Télécharge la facture en PDF dans le dossier de téléchargements de l'appareil.
function downloadInvoice(inv: Invoice) {
  const f = (n: number) => `${n.toLocaleString('fr-FR')} F`;
  const statusLabel = STATUS_CONFIG[inv.statut].label;
  downloadPdf({
    fileName: `facture-${safeFileName(inv.numero)}`,
    label: 'Document',
    heading: `Facture ${inv.numero}`,
    lines: [`Émise le ${fmtDate(inv.createdAt)}`],
    badge: { text: statusLabel, ...(STATUS_PDF[inv.statut] ?? STATUS_PDF.en_attente) },
    watermark: WATERMARK[inv.statut],
    footerRight: [`Document généré le ${fmtDate(new Date().toISOString())}`, 'Document non contractuel'],
    blocks: [
      { kind: 'columns', columns: [
        { title: 'Émetteur', strong: BRAND.name, lines: [BRAND.address, BRAND.email, BRAND.phone] },
        { title: 'Facturé à', strong: inv.client, lines: [inv.email, inv.telephone].filter(Boolean) },
        { title: 'Détails', lines: [`N° ${inv.numero}`, `Date : ${fmtDate(inv.createdAt)}`, `Statut : ${statusLabel}`] },
      ] },
      {
        kind: 'table',
        head: ['Description', 'Qté', 'Prix unit.', 'Total HT'],
        rows: inv.items.map(it => [it.nom, String(it.qty), f(it.prixUnit), f(it.prixUnit * it.qty)]),
        align: ['left', 'right', 'right', 'right'],
        widths: [undefined, 18, 32, 34],
      },
      { kind: 'totals', rows: [['Sous-total HT', f(inv.totalHT)], ['TVA (18 %)', f(inv.tva)]], total: ['Total TTC', `${inv.totalTTC.toLocaleString('fr-FR')} FCFA`] },
      ...(inv.modePaiement || inv.notes
        ? [{ kind: 'note' as const, text: inv.modePaiement ? `Mode de paiement : ${inv.modePaiement}` : '', aside: inv.notes || undefined }]
        : []),
      { kind: 'thanks', text: 'Merci pour votre confiance et à très bientôt' },
    ],
  })
    .then(() => toast.success('Facture enregistrée dans vos téléchargements'))
    .catch(() => toast.error('Impossible de générer le PDF'));
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-border/50">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <td key={i} className="p-4"><div className="h-4 bg-muted rounded animate-pulse" /></td>
      ))}
    </tr>
  );
}

// ─── Fenêtre de création de facture ─────────────────────────────────────────────────────

type NewInvoicePayload = {
  client: string; email: string; telephone: string;
  items: InvoiceItem[]; modePaiement: string; notes: string;
  totalHT: number; tva: number; totalTTC: number;
};

function AutoGenModal({ onClose, onGenerate }: { onClose: () => void; onGenerate: (p: NewInvoicePayload) => void }) {
  const [client, setClient] = useState('');
  const [email, setEmail]   = useState('');
  const [tel, setTel]       = useState('');
  const [mode, setMode]     = useState<PayMode>('Mobile Money');
  const [notes, setNotes]   = useState('');
  const [items, setItems]   = useState<InvoiceItem[]>([{ nom: '', qty: 1, prixUnit: 0, coutUnit: 0 }]);

  const addItem    = () => setItems(p => [...p, { nom: '', qty: 1, prixUnit: 0, coutUnit: 0 }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: string | number) =>
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const ht  = items.reduce((s, it) => s + it.prixUnit * it.qty, 0);
  const tva = Math.round(ht * 0.18);
  const ttc = ht + tva;

  const handleSubmit = () => {
    if (!client || items.some(it => !it.nom || it.prixUnit <= 0)) {
      toast.error('Veuillez remplir tous les champs obligatoires'); return;
    }
    onGenerate({ client, email, telephone: tel, items, modePaiement: mode, notes, totalHT: ht, tva, totalTTC: ttc });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2"><Plus className="w-5 h-5 text-primary" /><h3 className="font-display text-xl">Nouvelle facture</h3></div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([['Client *', client, setClient, 'text', 'Nom complet'],
               ['Email',    email,  setEmail,  'email', 'email@exemple.com'],
               ['Téléphone',tel,    setTel,    'tel',   '+241 77…']] as const).map(([label, val, set, type, ph]) => (
              <div key={label as string}>
                <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">{label as string}</label>
                <input value={val as string} onChange={e => (set as (v: string) => void)(e.target.value)}
                  type={type as string} placeholder={ph as string}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Mode de paiement</label>
              <select value={mode} onChange={e => setMode(e.target.value as PayMode)}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {(['Mobile Money', 'Espèces', 'Carte bancaire'] as PayMode[]).map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider block mb-1">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">Articles</p>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-primary hover:underline font-body">
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-body px-1 mb-1">
                <span className="col-span-5">Désignation *</span>
                <span className="col-span-2 text-center">Qté</span>
                <span className="col-span-2">Prix unit.</span>
                <span className="col-span-2">Coût unit.</span>
              </div>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input value={it.nom} onChange={e => updateItem(i, 'nom', e.target.value)}
                    placeholder="Article *" className="col-span-5 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <input type="number" value={it.qty} min={1} onChange={e => updateItem(i, 'qty', parseInt(e.target.value) || 1)}
                    className="col-span-2 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary" />
                  <input type="number" value={it.prixUnit || ''} onChange={e => updateItem(i, 'prixUnit', parseInt(e.target.value) || 0)}
                    placeholder="Prix *" className="col-span-2 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <input type="number" value={it.coutUnit || ''} onChange={e => updateItem(i, 'coutUnit', parseInt(e.target.value) || 0)}
                    placeholder="Coût" className="col-span-2 h-9 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)} className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-muted rounded-lg p-4 flex justify-between items-center">
            <div><p className="font-body text-xs text-muted-foreground">Sous-total HT</p><p className="font-body text-sm">{fmt(ht)}</p></div>
            <div><p className="font-body text-xs text-muted-foreground">TVA 18%</p><p className="font-body text-sm">{fmt(tva)}</p></div>
            <div><p className="font-body text-xs text-muted-foreground">Total TTC</p><p className="font-display text-xl text-primary">{fmt(ttc)}</p></div>
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="h-9 px-4 font-body text-sm border border-border rounded-md hover:bg-muted">Annuler</button>
            <button onClick={handleSubmit} className="h-9 px-4 font-body text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">Créer la facture</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice detail modal ─────────────────────────────────────────────────────

function InvoiceModal({ inv, onClose, onMarkPaid }: { inv: Invoice; onClose: () => void; onMarkPaid: (id: string) => void }) {
  const cout     = totalCout(inv);
  const marge    = inv.totalHT - cout;
  const margePct = inv.totalHT > 0 ? (marge / inv.totalHT) * 100 : 0;
  const cfg      = STATUS_CONFIG[inv.statut];
  const [sending, setSending] = useState(false);

  const handleSendEmail = async () => {
    if (!inv.email) { toast.error('Aucun email renseigné pour ce client'); return; }
    setSending(true);
    try {
      await adminPost(`/invoices/${inv._id}/send`, {});
      toast.success(`Facture envoyée à ${inv.email}`);
    } catch {
      toast.error('Erreur lors de l\'envoi de l\'email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 px-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h3 className="font-display text-xl">{inv.numero}</h3>
            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-body ${cfg.color}`}>{cfg.icon}{cfg.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSendEmail} disabled={sending} className="text-muted-foreground hover:text-primary disabled:opacity-40" title="Envoyer par email">
              <Mail className="w-4 h-4" />
            </button>
            <button onClick={() => downloadInvoice(inv)} className="text-muted-foreground hover:text-foreground" title="Télécharger le PDF">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex justify-between">
            <div>
              <p className="font-display text-base">La Délicieuse Diète</p>
              <p className="font-body text-xs text-muted-foreground">Quartier Louis, Libreville, Gabon</p>
              <p className="font-body text-xs text-muted-foreground">ladelicieuse.1@gmail.com</p>
            </div>
            <div className="text-right">
              <p className="font-body text-xs text-muted-foreground">Date : {fmtDate(inv.createdAt)}</p>
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Facturé à</p>
            <p className="font-body text-sm font-medium">{inv.client}</p>
            <p className="font-body text-xs text-muted-foreground">{inv.email}{inv.telephone ? ' · ' + inv.telephone : ''}</p>
          </div>
          <div className="border border-border rounded-md divide-y divide-border">
            <div className="grid grid-cols-12 p-3 bg-muted/50 text-xs font-body uppercase tracking-wider text-muted-foreground">
              <span className="col-span-5">Article</span>
              <span className="col-span-2 text-right">Qté</span>
              <span className="col-span-2 text-right">P.U.</span>
              <span className="col-span-3 text-right">Total HT</span>
            </div>
            {inv.items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 p-3 text-sm font-body">
                <span className="col-span-5 text-foreground">{it.nom}</span>
                <span className="col-span-2 text-right text-muted-foreground">{it.qty}</span>
                <span className="col-span-2 text-right text-muted-foreground">{it.prixUnit.toLocaleString('fr-FR')} F</span>
                <span className="col-span-3 text-right">{(it.prixUnit * it.qty).toLocaleString('fr-FR')} F</span>
              </div>
            ))}
            <div className="p-3 space-y-1 text-sm font-body">
              <div className="flex justify-between text-muted-foreground"><span>Sous-total HT</span><span>{inv.totalHT.toLocaleString('fr-FR')} F</span></div>
              <div className="flex justify-between text-muted-foreground"><span>TVA (18%)</span><span>{inv.tva.toLocaleString('fr-FR')} F</span></div>
              <div className="flex justify-between font-medium text-base border-t border-border pt-2 mt-1">
                <span>Total TTC</span><span className="text-primary font-display text-lg">{inv.totalTTC.toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted rounded-lg p-3">
              <p className="font-body text-xs text-muted-foreground">Marge brute</p>
              <p className="font-display text-lg text-foreground">{marge.toLocaleString('fr-FR')} F</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="font-body text-xs text-muted-foreground">Taux de marge</p>
              <p className={`font-display text-lg ${margePct >= 50 ? 'text-emerald-600' : 'text-amber-600'}`}>{margePct.toFixed(1)}%</p>
            </div>
          </div>

          <div className="flex justify-between items-center text-sm font-body text-muted-foreground">
            <span>Paiement : {inv.modePaiement}</span>
            {inv.notes && <span className="italic">{inv.notes}</span>}
          </div>

          {inv.statut === 'en_attente' && (
            <button onClick={() => { onMarkPaid(inv._id); onClose(); }}
              className="w-full h-9 bg-emerald-600 text-white rounded-md font-body text-sm hover:bg-emerald-700 flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Marquer comme payée
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const [tab, setTab]               = useState<Tab>('factures');
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showGenModal, setShowGenModal]       = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('revenus');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [confirmDeleteInvoiceId, setConfirmDeleteInvoiceId] = useState<string | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState(false);

  const [bilanData, setBilanData]           = useState<BilanRow[]>([]);
  const [bilanLoading, setBilanLoading]     = useState(false);
  const [rentaData, setRentaData]           = useState<IngredientRenta[]>([]);
  const [rentaLoading, setRentaLoading]     = useState(false);

  // ── Chargement des factures ─────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await adminGet<{ data: Invoice[]; total: number }>('/invoices?limit=200');
        if (mounted) setInvoices(res.data);
      } catch {
        if (mounted) toast.error('Erreur chargement factures');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // ── Chargement du bilan mensuel ────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'bilan') return;
    let mounted = true;
    setBilanLoading(true);
    adminGet<{ data: BilanRow[] }>('/invoices/bilan?months=7')
      .then(res => { if (mounted) setBilanData(res.data); })
      .catch(() => { if (mounted) toast.error('Erreur chargement bilan'); })
      .finally(() => { if (mounted) setBilanLoading(false); });
    return () => { mounted = false; };
  }, [tab]);

  // ── Chargement de la rentabilité ──────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'rentabilite') return;
    let mounted = true;
    setRentaLoading(true);
    adminGet<{ data: IngredientRenta[] }>('/invoices/rentabilite')
      .then(res => {
        if (mounted) setRentaData(res.data.map((r, i) => ({ ...r, id: String(i), categorie: '', unite: '' })));
      })
      .catch(() => { if (mounted) toast.error('Erreur chargement rentabilité'); })
      .finally(() => { if (mounted) setRentaLoading(false); });
    return () => { mounted = false; };
  }, [tab]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const markPaid = async (id: string) => {
    try {
      const res = await adminPatch<{ data: Invoice }>(`/invoices/${id}/status`, { statut: 'payee' });
      setInvoices(p => p.map(i => i._id === id ? res.data : i));
      toast.success('Facture marquée comme payée');
    } catch {
      toast.error('Erreur mise à jour du statut');
    }
  };

  const deleteInvoice = async (id: string) => {
    setDeletingInvoice(true);
    try {
      await adminDelete(`/invoices/${id}`);
      setInvoices(p => p.filter(i => i._id !== id));
      setConfirmDeleteInvoiceId(null);
      toast.success('Facture supprimée');
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeletingInvoice(false);
    }
  };

  const addInvoice = async (payload: NewInvoicePayload) => {
    try {
      const res = await adminPost<{ data: Invoice }>('/invoices', payload);
      setInvoices(p => [res.data, ...p]);
      toast.success(`Facture ${res.data.numero} créée`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur création facture');
    }
  };

  // ── État dérivé ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => invoices.filter(inv => {
    const matchSearch = inv.client.toLowerCase().includes(search.toLowerCase())
      || inv.numero.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || inv.statut === statusFilter;
    return matchSearch && matchStatus;
  }), [invoices, search, statusFilter]);

  const pagination = usePagination(filtered, `${search}|${statusFilter}`);

  const kpis = useMemo(() => {
    const paid    = invoices.filter(i => i.statut === 'payee');
    const revenue = paid.reduce((s, i) => s + i.totalHT, 0);
    const cout    = paid.reduce((s, i) => s + totalCout(i), 0);
    const marge   = revenue - cout;
    return {
      total:     invoices.length,
      paid:      paid.length,
      pending:   invoices.filter(i => i.statut === 'en_attente').length,
      cancelled: invoices.filter(i => i.statut === 'annulee' || i.statut === 'remboursee').length,
      revenue,
      marge,
      margePct: revenue > 0 ? (marge / revenue) * 100 : 0,
      ttc:      paid.reduce((s, i) => s + i.totalTTC, 0),
    };
  }, [invoices]);

  const sortedIngredients = useMemo(() => {
    return [...rentaData].sort((a, b) => {
      const v = (x: IngredientRenta) => x[sortKey as keyof IngredientRenta] as number;
      return sortDir === 'desc' ? v(b) - v(a) : v(a) - v(b);
    });
  }, [rentaData, sortKey, sortDir]);

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const latestBilan  = bilanData[bilanData.length - 1];
  const prevBilan    = bilanData[bilanData.length - 2];
  const bilanDelta   = latestBilan && prevBilan && prevBilan.benefice !== 0
    ? ((latestBilan.benefice - prevBilan.benefice) / Math.abs(prevBilan.benefice)) * 100
    : 0;
  const totalRentaCout   = rentaData.reduce((s, i) => s + i.coutTotal, 0);
  const totalRentaRevenu = rentaData.reduce((s, i) => s + i.revenusAttribues, 0);
  const totalRentaMarge  = rentaData.reduce((s, i) => s + i.marge, 0);
  const PIE_COLORS = ['#16a34a','#2563eb','#d97706','#dc2626','#7c3aed','#0891b2'];
  const catData = useMemo(() => {
    const map: Record<string, number> = {};
    rentaData.forEach(i => { if (i.categorie) map[i.categorie] = (map[i.categorie] || 0) + i.marge; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rentaData]);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Comptabilité</h2>
          <p className="font-body text-sm text-muted-foreground">Facturation, rentabilité par ingrédient, bilan mensuel</p>
        </div>
        {tab === 'factures' && (
          <button onClick={() => setShowGenModal(true)}
            className="flex items-center gap-2 h-9 px-4 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 shrink-0">
            <Plus className="w-4 h-4" /> Nouvelle facture
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {([
          ['factures',    <Receipt  className="w-4 h-4" />, 'Factures'],
          ['rentabilite', <Layers   className="w-4 h-4" />, 'Rentabilité ingrédients'],
          ['bilan',       <BarChart2 className="w-4 h-4" />, 'Bilan mensuel'],
        ] as const).map(([key, icon, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className={`whitespace-nowrap shrink-0 flex items-center gap-2 px-4 py-2.5 font-body text-sm border-b-2 transition-colors -mb-px ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── TAB: FACTURES ── */}
      {tab === 'factures' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Total factures"   value={String(kpis.total)}                                    loading={loading} />
            <KpiCard label="Payées"           value={String(kpis.paid)}     color="" loading={loading} />
            <KpiCard label="En attente"       value={String(kpis.pending)}  color=""   loading={loading} />
            <KpiCard label="Annulées/Remb."   value={String(kpis.cancelled)}color=""     loading={loading} />
            <KpiCard label="CA HT encaissé"   value={loading ? '—' : `${(kpis.revenue/1000).toFixed(0)}k`} sub="FCFA" color=""  loading={loading} />
            <KpiCard label="Marge brute"      value={loading ? '—' : `${kpis.margePct.toFixed(1)}%`}       sub={loading ? '' : `${(kpis.marge/1000).toFixed(0)}k FCFA`} color="" loading={loading} />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Client, numéro…"
                className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            {(() => {
              const options = [['all','Tous'],['payee','Payées'],['en_attente','En attente'],['annulee','Annulées']] as const;
              const activeLabel = options.find(([v]) => v === statusFilter)?.[1] ?? 'Tous';
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-between gap-2 h-10 px-3 min-w-[160px] rounded-md font-body text-sm bg-background border border-border hover:bg-muted transition-colors">
                      <span>{activeLabel}</span>
                      <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[160px]">
                    {options.map(([v, l]) => (
                      <DropdownMenuItem
                        key={v}
                        onClick={() => setStatusFilter(v)}
                        className={`text-sm font-body cursor-pointer ${statusFilter === v ? 'bg-primary/10 text-primary font-medium' : ''}`}
                      >
                        {l}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })()}
          </div>

          <div className="bg-background border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {[['Facture',''],['Client',''],['Total TTC',''],['Marge',''],['Statut',''],['Paiement','hidden lg:table-cell'],['Date','hidden md:table-cell'],['','']].map(([h, cls]) => (
                    <th key={h} className={`text-left p-4 font-body text-xs uppercase tracking-wider text-muted-foreground ${cls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                  : pagination.pageItems.map(inv => {
                      const cout  = totalCout(inv);
                      const mp    = inv.totalHT > 0 ? ((inv.totalHT - cout) / inv.totalHT) * 100 : 0;
                      const cfg   = STATUS_CONFIG[inv.statut];
                      return (
                        <tr key={inv._id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                          <td className="p-4 font-body font-medium text-foreground">{inv.numero}</td>
                          <td className="p-4 font-body text-foreground">{inv.client}</td>
                          <td className="p-4 font-body font-medium text-foreground">{inv.totalTTC.toLocaleString('fr-FR')} F</td>
                          <td className="p-4"><MargeBadge pct={mp} /></td>
                          <td className="p-4">
                            <span className={`flex items-center gap-1 w-fit px-2.5 py-1 rounded-full text-xs font-body ${cfg.color}`}>
                              {cfg.icon}{cfg.label}
                            </span>
                          </td>
                          <td className="p-4 font-body text-muted-foreground hidden lg:table-cell">{inv.modePaiement}</td>
                          <td className="p-4 font-body text-muted-foreground hidden md:table-cell">{fmtDate(inv.createdAt)}</td>
                          <td className="p-4 flex gap-2">
                            <button onClick={() => setSelectedInvoice(inv)} className="text-muted-foreground hover:text-foreground" title="Voir"><Eye className="w-4 h-4" /></button>
                            <button onClick={() => downloadInvoice(inv)} className="text-muted-foreground hover:text-primary" title="Télécharger le PDF"><Download className="w-4 h-4" /></button>
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteInvoiceId(inv._id); }} className="text-muted-foreground hover:text-destructive" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      );
                    })
                }
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 font-body text-sm text-muted-foreground">Aucune facture trouvée</td></tr>
                )}
              </tbody>
              {!loading && filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/40 border-t border-border">
                    <td className="p-4 font-body text-xs text-muted-foreground" colSpan={2}>{filtered.length} facture(s)</td>
                    <td className="p-4 font-body font-medium text-sm">
                      {filtered.filter(i => i.statut === 'payee').reduce((s, i) => s + i.totalTTC, 0).toLocaleString('fr-FR')} F
                    </td>
                    <td className="p-4"><MargeBadge pct={kpis.margePct} /></td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <TablePagination {...pagination} onPageChange={pagination.setPage} />
        </div>
      )}

      {/* ── TAB: RENTABILITÉ ── */}
      {tab === 'rentabilite' && (
        <div className="space-y-5">
          {rentaLoading ? (
            <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : rentaData.length === 0 ? (
            <div className="text-center py-16 bg-background border border-border rounded-xl">
              <p className="font-display text-xl text-muted-foreground italic">Aucune facture payée en base</p>
              <p className="font-body text-sm text-muted-foreground mt-2">Créez des factures et marquez-les comme payées pour voir la rentabilité.</p>
            </div>
          ) : null}
          {!rentaLoading && rentaData.length > 0 && (<>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Articles analysés"   value={String(rentaData.length)} />
            <KpiCard label="Coût total matières" value={`${(totalRentaCout/1000).toFixed(0)}k`}   sub="FCFA" color="" />
            <KpiCard label="Revenus attribués"   value={`${(totalRentaRevenu/1000).toFixed(0)}k`} sub="FCFA" color="" />
            <KpiCard label="Marge totale"        value={totalRentaRevenu > 0 ? `${((totalRentaMarge/totalRentaRevenu)*100).toFixed(1)}%` : '—'} sub={`${(totalRentaMarge/1000).toFixed(0)}k FCFA`} color="" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="bg-background border border-border rounded-lg p-5 lg:col-span-2">
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-4">Marge brute par ingrédient (Top 10)</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[...rentaData].sort((a, b) => b.marge - a.marge).slice(0, 10)}
                  margin={{ top: 0, right: 0, left: 0, bottom: 40 }}>
                  <XAxis dataKey="nom" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString('fr-FR')} F`, 'Marge']} />
                  <Bar dataKey="marge" fill="#16a34a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-background border border-border rounded-lg p-5">
              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-4">Marge par catégorie</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {catData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString('fr-FR')} F`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {catData.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-xs font-body">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {c.name}
                    </span>
                    <span className="text-muted-foreground">{(c.value / 1000).toFixed(0)}k F</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-background border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-3 text-left font-body text-xs uppercase tracking-wider text-muted-foreground">Ingrédient</th>
                  <th className="p-3 text-left font-body text-xs uppercase tracking-wider text-muted-foreground hidden md:table-cell">Catégorie</th>
                  <Th label="Coût total"       sortKey="cout"      cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Revenus attribués" sortKey="revenus"   cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Marge"            sortKey="marge"     cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="% Marge"          sortKey="margePct"  cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Plats"            sortKey="plats"     cur={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sortedIngredients.map(ing => (
                  <tr key={ing.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-body text-foreground font-medium">{ing.nom}</td>
                    <td className="p-3 font-body text-muted-foreground hidden md:table-cell">{ing.categorie}</td>
                    <td className="p-3 font-body text-muted-foreground">{ing.coutTotal.toLocaleString('fr-FR')} F</td>
                    <td className="p-3 font-body text-foreground">{ing.revenusAttribues.toLocaleString('fr-FR')} F</td>
                    <td className="p-3 font-body text-foreground font-medium">{ing.marge.toLocaleString('fr-FR')} F</td>
                    <td className="p-3"><MargeBadge pct={ing.margePct} /></td>
                    <td className="p-3 font-body text-muted-foreground text-center">{ing.platsUtilisant}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 border-t border-border">
                  <td className="p-3 font-body text-xs text-muted-foreground" colSpan={2}>Total</td>
                  <td className="p-3 font-body text-sm font-medium">{totalRentaCout.toLocaleString('fr-FR')} F</td>
                  <td className="p-3 font-body text-sm font-medium">{totalRentaRevenu.toLocaleString('fr-FR')} F</td>
                  <td className="p-3 font-body text-sm font-medium">{totalRentaMarge.toLocaleString('fr-FR')} F</td>
                  <td className="p-3"><MargeBadge pct={(totalRentaMarge / totalRentaRevenu) * 100} /></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {(() => {
            const worst = [...rentaData].sort((a, b) => a.margePct - b.margePct).slice(0, 3);
            return worst.length > 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <p className="font-body text-sm font-medium text-amber-800">Articles à faible rentabilité</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {worst.map(i => (
                    <div key={i.id} className="bg-white rounded-md px-3 py-1.5 border border-amber-200 flex items-center gap-2">
                      <span className="font-body text-sm text-foreground">{i.nom}</span>
                      <MargeBadge pct={i.margePct} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
          </>)}
        </div>
      )}

      {/* ── TAB: BILAN MENSUEL ── */}
      {tab === 'bilan' && (
        <div className="space-y-5">
          {bilanLoading ? (
            <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : bilanData.length === 0 ? (
            <div className="text-center py-16 bg-background border border-border rounded-xl">
              <p className="font-display text-xl text-muted-foreground italic">Aucune facture payée en base</p>
              <p className="font-body text-sm text-muted-foreground mt-2">Créez des factures et marquez-les comme payées pour générer le bilan mensuel.</p>
            </div>
          ) : (<>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label={`Revenus ${latestBilan?.mois ?? '—'}`} value={latestBilan ? `${(latestBilan.revenus/1000000).toFixed(2)}M` : '—'} sub="FCFA" color="" />
            <KpiCard label="Coût matières" value={latestBilan ? `${(latestBilan.coutMatieres/1000000).toFixed(2)}M` : '—'} sub={latestBilan && latestBilan.revenus > 0 ? `${((latestBilan.coutMatieres/latestBilan.revenus)*100).toFixed(0)}% des revenus` : ''} color="" />
            <KpiCard label="Factures payées" value={latestBilan ? String(latestBilan.count) : '—'} sub="ce mois" color="" />
            {latestBilan && (
              <div className="bg-background border border-border rounded-lg p-4">
                <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">Bénéfice net</p>
                <p className={`font-display text-2xl mt-1 ${latestBilan.benefice >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {(latestBilan.benefice/1000000).toFixed(2)}M
                </p>
                <p className="font-body text-xs mt-0.5 flex items-center gap-1">
                  {bilanDelta > 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : bilanDelta < 0 ? <TrendingDown className="w-3 h-3 text-red-500" /> : <Minus className="w-3 h-3 text-muted-foreground" />}
                  <span className={bilanDelta > 0 ? 'text-emerald-600' : bilanDelta < 0 ? 'text-red-600' : 'text-muted-foreground'}>
                    {bilanDelta > 0 ? '+' : ''}{bilanDelta.toFixed(1)}% vs mois préc.
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="bg-background border border-border rounded-lg p-5">
            <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-4">Évolution mensuelle (factures payées)</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={bilanData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString('fr-FR')} FCFA`]} />
                <Legend />
                <Line type="monotone" dataKey="revenus"      name="Revenus HT"    stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="coutMatieres" name="Coût matières"  stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="benefice"     name="Bénéfice net"   stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-background border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Mois','Revenus HT','Coût matières','% Coût','Factures','Bénéfice net','Marge nette'].map(h => (
                    <th key={h} className="p-4 text-left font-body text-xs uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bilanData.map((row, i) => {
                  const coutPct  = row.revenus > 0 ? (row.coutMatieres / row.revenus) * 100 : 0;
                  const margePct = row.revenus > 0 ? ((row.revenus - row.coutMatieres) / row.revenus) * 100 : 0;
                  const isLast   = i === bilanData.length - 1;
                  return (
                    <tr key={row.moisKey} className={`border-b border-border/50 last:border-0 ${isLast ? 'bg-primary/5 font-medium' : 'hover:bg-muted/30'}`}>
                      <td className="p-4 font-body text-foreground">{row.mois}</td>
                      <td className="p-4 font-body text-foreground">{(row.revenus/1000000).toFixed(2)}M F</td>
                      <td className="p-4 font-body text-muted-foreground">{(row.coutMatieres/1000000).toFixed(2)}M F</td>
                      <td className="p-4"><MargeBadge pct={100 - coutPct} /></td>
                      <td className="p-4 font-body text-muted-foreground">{row.count}</td>
                      <td className={`p-4 font-body font-medium ${row.benefice >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {row.benefice >= 0 ? '+' : ''}{(row.benefice/1000000).toFixed(2)}M F
                      </td>
                      <td className="p-4"><MargeBadge pct={margePct} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>)}
        </div>
      )}

      {selectedInvoice && <InvoiceModal inv={selectedInvoice} onClose={() => setSelectedInvoice(null)} onMarkPaid={markPaid} />}
      {showGenModal && <AutoGenModal onClose={() => setShowGenModal(false)} onGenerate={addInvoice} />}

      {confirmDeleteInvoiceId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/70 px-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h4 className="font-display text-lg text-foreground">Supprimer la facture</h4>
                <p className="font-body text-sm text-muted-foreground">Cette action est irréversible.</p>
              </div>
            </div>
            <p className="font-body text-sm text-foreground">
              Voulez-vous vraiment supprimer la facture <strong>{invoices.find(i => i._id === confirmDeleteInvoiceId)?.numero}</strong> ?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmDeleteInvoiceId(null)}
                disabled={deletingInvoice}
                className="flex-1 px-4 py-2 text-sm font-body border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={() => deleteInvoice(confirmDeleteInvoiceId)}
                disabled={deletingInvoice}
                className="flex-1 px-4 py-2 text-sm font-body bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingInvoice ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
