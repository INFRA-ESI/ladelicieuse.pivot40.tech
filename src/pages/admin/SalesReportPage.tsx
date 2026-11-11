import { useState, useMemo, useEffect } from 'react';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, type TooltipProps,
} from 'recharts';
import {
  TrendingUp, TrendingDown, ChevronLeft, ChevronRight,
  Download, ChevronUp, ChevronDown, Minus, Loader2,
} from '@/components/icons';
import { toast } from 'sonner';
import { adminGet } from '@/services/adminApiService';
import { BRAND, downloadPdf, toneFor, type PdfBlock } from '@/lib/pdfDocument';
import { downloadBlob, safeFileName } from '@/lib/downloadFile';
import { usePagination } from '@/hooks/usePagination';
import TablePagination from '@/components/admin/TablePagination';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'jour' | 'semaine' | 'mois';
type SortKey = 'nom' | 'vendu' | 'ca' | 'marge' | 'margePct';

interface RevenuePoint { _id: string; revenu: number; factures: number; }
interface TopMeal { _id: string; total: number; revenu: number; }

interface DayData {
  date: Date;
  dateStr: string;
  revenus: number;
  commandes: number;
  cout: number;
}

interface BilanRow {
  mois: string;
  moisKey: string;
  revenus: number;
  coutMatieres: number;
  benefice: number;
  count: number;
}

interface ProductStat {
  id: number;
  nom: string;
  categorie: string;
  vendu: number;
  prix: number;
  cout: number;
  ca: number;
  coutTotal: number;
  marge: number;
  margePct: number;
}

const PROD_COLORS = ['hsl(var(--primary))', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtK   = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
const fmtFCFA = (n: number) => n.toLocaleString('fr-FR') + ' FCFA';
const fmtPct  = (n: number) => `${n > 0 ? '+' : ''}${n}%`;
const r1      = (n: number) => Math.round(n * 10) / 10;

const aggregateStats = (days: DayData[]) => {
  const revenus     = days.reduce((s, d) => s + d.revenus, 0);
  const cout        = days.reduce((s, d) => s + d.cout, 0);
  const commandes   = days.reduce((s, d) => s + d.commandes, 0);
  const marge       = revenus - cout;
  const margePct    = revenus > 0 ? marge / revenus * 100 : 0;
  const panierMoyen = commandes > 0 ? revenus / commandes : 0;
  return { revenus, cout, commandes, marge, margePct, panierMoyen };
};

const aggregateStatsBilan = (rows: BilanRow[]) => {
  const revenus   = rows.reduce((s, r) => s + r.revenus, 0);
  const cout      = rows.reduce((s, r) => s + r.coutMatieres, 0);
  const commandes = rows.reduce((s, r) => s + r.count, 0);
  const marge     = revenus - cout;
  const margePct  = revenus > 0 ? marge / revenus * 100 : 0;
  const panierMoyen = commandes > 0 ? revenus / commandes : 0;
  return { revenus, cout, commandes, marge, margePct, panierMoyen };
};

const delta = (cur: number, prev: number) =>
  prev === 0 ? 0 : Math.round((cur - prev) / prev * 100);

// ─── Period helpers ───────────────────────────────────────────────────────────

// Clé « AAAA-MM-JJ » du jour local (le serveur regroupe les ventes par jour de Libreville, la même clé).
const toDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Les `count` jours qui se terminent à celui du rapport journalier, pour montrer la tendance autour de lui.
const getTrailingDays = (data: DayData[], offset: number, count: number): DayData[] => {
  const end = new Date(); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() - offset);
  const start = new Date(end); start.setDate(end.getDate() - (count - 1));
  return data.filter(d => d.dateStr >= toDayKey(start) && d.dateStr <= toDayKey(end));
};

const getPeriodDays = (period: Period, offset: number, data: DayData[]): DayData[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (period === 'jour') {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    return data.filter(d => d.dateStr === toDayKey(day));
  }

  if (period === 'semaine') {
    const dow = today.getDay() || 7;
    const mon = new Date(today);
    mon.setDate(today.getDate() - (dow - 1) - offset * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return data.filter(d => d.date >= mon && d.date <= sun);
  }

  // mois
  const ref = new Date(today);
  ref.setDate(1);
  ref.setMonth(ref.getMonth() - offset);
  const yr = ref.getFullYear();
  const mo = ref.getMonth();
  return data.filter(d => d.date.getFullYear() === yr && d.date.getMonth() === mo);
};

const getPeriodBilan = (period: Period, offset: number, bilan: BilanRow[]): BilanRow[] => {
  if (period !== 'mois') return [];
  const today = new Date();
  const ref = new Date(today.getFullYear(), today.getMonth() - offset, 1);
  const moisKey = ref.toISOString().substring(0, 7);
  return bilan.filter(b => b.moisKey === moisKey);
};

const getPeriodLabel = (period: Period, offset: number, days: DayData[], bilan: BilanRow[]): string => {
  if (period === 'jour') {
    const day = new Date(); day.setDate(day.getDate() - offset);
    const label = day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return offset === 0 ? `Aujourd'hui · ${label}` : label;
  }
  if (period === 'semaine') {
    if (days.length === 0) return offset === 0 ? 'Cette semaine' : `Semaine -${offset}`;
    const f = days[0].date;
    const l = days[days.length - 1].date;
    return `${f.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${l.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  const bilRows = getPeriodBilan(period, offset, bilan);
  if (bilRows.length > 0) return bilRows[0].mois + ' ' + new Date(bilRows[0].moisKey + '-01').getFullYear();
  if (days.length > 0) return days[0].date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const ref = new Date(); ref.setMonth(ref.getMonth() - offset);
  return ref.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

const getChartData = (period: Period, days: DayData[], prevDays: DayData[]) => {
  const dayLabel = (d: DayData) => period === 'semaine'
    ? d.date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')
    : period === 'jour'
      ? d.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', '')
      : d.date.getDate().toString();

  const prevMap = new Map(prevDays.map((d, i) => [i, d.revenus]));
  return days.map((d, i) => ({
    label: dayLabel(d),
    revenus: d.revenus,
    cout: d.cout,
    marge: d.revenus - d.cout,
    commandes: d.commandes,
    prevRevenus: prevMap.get(i) ?? 0,
  }));
};

// ─── Tooltip formatters ───────────────────────────────────────────────────────

const CurrencyTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg text-xs font-body">
      <p className="font-medium text-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium text-foreground">{fmtK(p.value as number)} FCFA</span>
        </div>
      ))}
    </div>
  );
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, d }: { label: string; value: string; sub?: string; d: number }) {
  const up = d > 0, neutral = d === 0;
  return (
    <div className="bg-background border border-border rounded-xl p-4 shadow-sm">
      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      <p className="font-display text-2xl text-foreground mb-1">{value}</p>
      {sub && <p className="font-body text-xs text-muted-foreground mb-2">{sub}</p>}
      <div className={`flex items-center gap-1 text-xs font-body ${neutral ? 'text-muted-foreground' : up ? 'text-green-600' : 'text-red-600'}`}>
        {neutral ? <Minus className="w-3 h-3" /> : up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {neutral ? 'stable' : fmtPct(d)} vs période préc.
      </div>
    </div>
  );
}

// ─── Sort header ──────────────────────────────────────────────────────────────

function Th({ label, k, sortKey, sortDir, onSort, cls = '' }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void; cls?: string;
}) {
  const active = sortKey === k;
  return (
    <th onClick={() => onSort(k)}
      className={`p-3 font-body text-xs uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground ${cls}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          : <ChevronUp className="w-3 h-3 opacity-20" />}
      </span>
    </th>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SalesReportPage() {
  const [period, setPeriod]   = useState<Period>('semaine');
  const [offset, setOffset]   = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('ca');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showPrev, setShowPrev] = useState(true);

  const [revenueApiData, setRevenueApiData] = useState<RevenuePoint[]>([]);
  const [topMealsData, setTopMealsData]     = useState<TopMeal[]>([]);
  const [bilanData, setBilanData]           = useState<BilanRow[]>([]);
  const [dataLoading, setDataLoading]       = useState(true);
  // Produits vendus le jour affiché (rapport journalier) : le classement général ne dit rien d'un jour précis.
  const [dayMealsData, setDayMealsData]     = useState<TopMeal[]>([]);

  useEffect(() => {
    Promise.all([
      adminGet<{ success: boolean; data: RevenuePoint[] }>('/dashboard/revenue'),
      adminGet<{ success: boolean; data: TopMeal[] }>('/dashboard/top-meals'),
      adminGet<{ success: boolean; data: BilanRow[] }>('/invoices/bilan?months=12'),
    ])
      .then(([rev, meals, bilan]) => {
        setRevenueApiData(rev.data ?? []);
        setTopMealsData(meals.data ?? []);
        setBilanData(bilan.data ?? []);
      })
      .catch(console.error)
      .finally(() => setDataLoading(false));
  }, []);

  const dayKey = (() => {
    if (period !== 'jour') return null;
    const day = new Date(); day.setDate(day.getDate() - offset);
    return toDayKey(day);
  })();
  useEffect(() => {
    if (!dayKey) return;
    let current = true;
    setDayMealsData([]);
    adminGet<{ success: boolean; data: TopMeal[] }>(`/dashboard/top-meals?date=${dayKey}`)
      .then(res => { if (current) setDayMealsData(res.data ?? []); })
      .catch(() => { if (current) toast.error('Erreur chargement des produits du jour'); });
    return () => { current = false; };
  }, [dayKey]);

  // Construit allDays depuis les données journalières réelles, en estimant le coût d'après le ratio du bilan mensuel
  const allDays = useMemo<DayData[]>(() => {
    return revenueApiData.map(r => {
      const date = new Date(r._id + 'T12:00:00');
      const moisKey = r._id.substring(0, 7);
      const moisBilan = bilanData.find(b => b.moisKey === moisKey);
      const coutRatio = moisBilan && moisBilan.revenus > 0 ? moisBilan.coutMatieres / moisBilan.revenus : 0.40;
      return { date, dateStr: r._id, revenus: r.revenu, commandes: r.factures, cout: Math.round(r.revenu * coutRatio) };
    });
  }, [revenueApiData, bilanData]);

  // Vue mensuelle : utilise les lignes du bilan pour un coût plus précis
  const periodBilanRows = useMemo(() => getPeriodBilan(period, offset, bilanData), [period, offset, bilanData]);

  const periodDays = useMemo(() => getPeriodDays(period, offset, allDays), [period, offset, allDays]);
  const prevDays   = useMemo(() => getPeriodDays(period, offset + 1, allDays), [period, offset, allDays]);
  const prevBilanRows = useMemo(() => getPeriodBilan(period, offset + 1, bilanData), [period, offset, bilanData]);

  const stats     = useMemo(() => {
    if (period === 'mois' && periodBilanRows.length > 0) return aggregateStatsBilan(periodBilanRows);
    return aggregateStats(periodDays);
  }, [period, periodDays, periodBilanRows]);

  const prevStats = useMemo(() => {
    if (period === 'mois' && prevBilanRows.length > 0) return aggregateStatsBilan(prevBilanRows);
    return aggregateStats(prevDays);
  }, [period, prevDays, prevBilanRows]);

  const periodLabel = useMemo(() => getPeriodLabel(period, offset, periodDays, bilanData), [period, offset, periodDays, bilanData]);
  const chartData   = useMemo(
    () => period === 'jour'
      ? getChartData(period, getTrailingDays(allDays, offset, 7), [])
      : getChartData(period, periodDays, prevDays),
    [period, offset, allDays, periodDays, prevDays],
  );

  const productStats = useMemo<ProductStat[]>(() => {
    return (period === 'jour' ? dayMealsData : topMealsData).map((m, i) => {
      const prix      = m.total > 0 ? Math.round(m.revenu / m.total) : 0;
      const cout      = Math.round(prix * 0.40);
      const vendu     = m.total;
      const ca        = vendu * prix;
      const coutTotal = vendu * cout;
      const marge     = ca - coutTotal;
      const margePct  = ca > 0 ? Math.round(marge / ca * 100) : 0;
      return { id: i + 1, nom: m._id, categorie: 'Plats', vendu, prix, cout, ca, coutTotal, marge, margePct };
    });
  }, [period, dayMealsData, topMealsData]);

  const sortedProducts = useMemo(() => {
    return [...productStats].sort((a, b) => {
      const va = sortKey === 'nom' ? a.nom : sortKey === 'vendu' ? a.vendu : sortKey === 'ca' ? a.ca : sortKey === 'marge' ? a.marge : a.margePct;
      const vb = sortKey === 'nom' ? b.nom : sortKey === 'vendu' ? b.vendu : sortKey === 'ca' ? b.ca : sortKey === 'marge' ? b.marge : b.margePct;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [productStats, sortKey, sortDir]);

  const productsPagination = usePagination(sortedProducts, `${sortKey}|${sortDir}|${period}`);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const topProductsChartData = useMemo(() =>
    productStats.slice(0, 6).map((p, i) => ({
      name: p.nom.length > 20 ? p.nom.substring(0, 18) + '…' : p.nom,
      ca: p.ca,
      marge: p.marge,
      color: PROD_COLORS[i % PROD_COLORS.length],
    })),
  [productStats]);

  const bestDay = useMemo(() => {
    if (periodDays.length < 1) return null;
    return periodDays.reduce((best, d) => d.revenus > best.revenus ? d : best);
  }, [periodDays]);

  const bestProduct  = sortedProducts[0];

  // ── Export CSV ───────────────────────────────────────────────────────────────
  // Un CSV est du texte brut : il ne peut pas contenir d'image. L'identité de la boutique figure donc en tête de fichier,
  // et le logo est sur le PDF. Les montants sont des nombres purs (sans « FCFA ») pour que le tableur puisse les additionner.
  const exportCSV = () => {
    const sep = ';';
    const cell = (v: string | number) => {
      const t = String(v);
      return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const rows: (string | number)[][] = [];

    rows.push([BRAND.name.toUpperCase()]);
    rows.push([BRAND.tagline]);
    rows.push([`${BRAND.address} · ${BRAND.email} · ${BRAND.phone}`]);
    rows.push([]);
    rows.push([period === 'jour' ? 'RAPPORT JOURNALIER' : 'RAPPORT DE VENTES']);
    rows.push(['Période', periodLabel]);
    rows.push(['Généré le', new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })]);
    rows.push([]);

    rows.push(['1. INDICATEURS CLÉS']);
    rows.push(['Indicateur', 'Valeur', 'Unité']);
    rows.push(['Revenus', stats.revenus, 'FCFA']);
    rows.push(['Coût matières (estimé)', stats.cout, 'FCFA']);
    rows.push(['Marge brute', stats.marge, 'FCFA']);
    rows.push(['Taux de marge', r1(stats.margePct), '%']);
    rows.push(['Commandes', stats.commandes, '']);
    rows.push(['Panier moyen', Math.round(stats.panierMoyen), 'FCFA']);
    rows.push([]);

    if (periodDays.length > 0) {
      rows.push(['2. DÉTAIL JOURNALIER']);
      rows.push(['Date', 'Revenus (FCFA)', 'Commandes', 'Coût (FCFA)', 'Marge (FCFA)', 'Marge (%)']);
      periodDays.forEach(d => {
        const marge = d.revenus - d.cout;
        rows.push([d.dateStr, d.revenus, d.commandes, d.cout, marge, d.revenus > 0 ? r1(marge / d.revenus * 100) : 0]);
      });
      rows.push([]);
    }

    if (sortedProducts.length > 0) {
      rows.push(['3. PRODUITS']);
      rows.push(['Rang', 'Produit', 'Qté vendue', 'CA (FCFA)', 'Coût total (FCFA)', 'Marge (FCFA)', 'Marge (%)']);
      sortedProducts.forEach((p, i) => {
        rows.push([i + 1, p.nom, p.vendu, p.ca, p.coutTotal, p.marge, p.margePct]);
      });
    }

    const csv = '﻿' + rows.map(r => r.map(cell).join(sep)).join('\r\n'); // BOM pour Excel
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `${period === 'jour' ? 'rapport-journalier' : 'rapport-ventes'}-${safeFileName(periodLabel)}.csv`,
    );
    toast.success('CSV enregistré dans vos téléchargements');
  };

  // ── Export PDF : fichier enregistré dans le dossier de téléchargements ───────
  const exportPDF = () => {
    const genDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const n = (v: number) => v.toLocaleString('fr-FR');
    const daily = period === 'jour';
    const totalMarge = r1(stats.margePct);

    const detailRows: string[][] = (period === 'mois' && periodBilanRows.length > 0)
      ? periodBilanRows.map(r => [
          `${r.mois} ${new Date(r.moisKey + '-01').getFullYear()}`, n(r.revenus), String(r.count), n(r.coutMatieres), n(r.benefice),
          `${r.revenus > 0 ? r1(r.benefice / r.revenus * 100) : 0}%`,
        ])
      : periodDays.map(d => {
          const m = d.revenus - d.cout;
          return [d.dateStr, n(d.revenus), String(d.commandes), n(d.cout), n(m), `${d.revenus > 0 ? r1(m / d.revenus * 100) : 0}%`];
        });

    const blocks: PdfBlock[] = [
      { kind: 'section', title: '1. Indicateurs clés de performance' },
      { kind: 'kpis', items: [
        { label: 'Revenus totaux', value: n(stats.revenus), unit: 'FCFA', strong: true },
        { label: 'Marge brute', value: n(stats.marge), unit: 'FCFA', strong: true },
        { label: 'Commandes', value: String(stats.commandes) },
        { label: 'Panier moyen', value: n(Math.round(stats.panierMoyen)), unit: 'FCFA' },
        { label: 'Coût matières', value: n(stats.cout), unit: 'FCFA' },
        { label: 'Résultat net', value: n(stats.revenus - stats.cout), unit: 'FCFA', tone: toneFor(totalMarge) },
      ] },
      { kind: 'gauge', label: 'Taux de marge global', value: totalMarge, tone: toneFor(totalMarge),
        caption: totalMarge >= 55 ? 'Excellente rentabilité' : totalMarge >= 40 ? 'Rentabilité correcte' : 'Marge à améliorer' },
    ];
    if (detailRows.length > 0) {
      blocks.push(
        { kind: 'section', title: daily ? '2. Ventes du jour' : `2. Détail ${period === 'mois' ? 'mensuel' : 'journalier'}` },
        { kind: 'table', head: ['Période', 'Revenus (FCFA)', 'Commandes', 'Coût (FCFA)', 'Marge (FCFA)', 'Marge %'], rows: detailRows,
          align: ['left', 'right', 'right', 'right', 'right', 'right'], toneColumn: 5 },
      );
    }
    if (sortedProducts.length > 0) {
      blocks.push(
        { kind: 'section', title: daily ? '3. Produits vendus ce jour' : '3. Performance produits' },
        { kind: 'table', head: ['#', 'Produit', 'Qté vendue', 'CA (FCFA)', 'Coût total', 'Marge (FCFA)', 'Marge %'],
          rows: sortedProducts.map((p, i) => [String(i + 1), p.nom, String(p.vendu), n(p.ca), n(p.coutTotal), n(p.marge), `${p.margePct}%`]),
          align: ['right', 'left', 'right', 'right', 'right', 'right', 'right'], widths: [10, undefined, 22, 28, 26, 28, 18], toneColumn: 6 },
      );
    }

    downloadPdf({
      fileName: `${daily ? 'rapport-journalier' : 'rapport-ventes'}-${safeFileName(periodLabel)}`,
      heading: daily ? 'Rapport journalier' : 'Rapport de ventes',
      lines: [periodLabel, `Généré le ${genDate}`],
      blocks,
      footerRight: ['Document confidentiel — usage interne', `Généré le ${genDate}`],
    })
      .then(() => toast.success('Rapport enregistré dans vos téléchargements'))
      .catch(() => toast.error('Impossible de générer le PDF'));
  };
  const worstMarge   = productStats.length > 0 ? [...productStats].sort((a, b) => a.margePct - b.margePct)[0] : null;

  const canGoNext = offset > 0;
  // Les ventes journalières ne sont chargées que sur 30 jours, même s'il n'y a eu aucune vente la veille.
  const canGoPrev = period === 'jour' ? offset < 29 : (() => {
    if (period === 'mois') {
      const prev = getPeriodBilan(period, offset + 1, bilanData);
      if (prev.length > 0) return true;
    }
    const prev = getPeriodDays(period, offset + 1, allDays);
    return prev.length > 0;
  })();

  const prevPeriodLabel = getPeriodLabel(period, offset + 1, getPeriodDays(period, offset + 1, allDays), bilanData);

  // Margin color
  const margeColor = (pct: number) =>
    pct >= 55 ? 'text-green-600' : pct >= 40 ? 'text-yellow-600' : 'text-red-600';
  const margeBg = (pct: number) =>
    pct >= 55 ? 'text-primary' : pct >= 40 ? 'text-amber-700' : 'text-destructive';

  return (
    <div className="space-y-6 bg-muted/30 -m-6 p-6 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Rapports de ventes</h2>
          <p className="font-body text-sm text-muted-foreground">
            Revenus, produits vendus et marges par période
            {dataLoading && <span className="ml-2 inline-flex items-center gap-1 text-primary"><Loader2 className="w-3 h-3 animate-spin" />chargement données réelles…</span>}
            {!dataLoading && revenueApiData.length > 0 && <span className="ml-2 text-green-600">• {revenueApiData.length} jours · {bilanData.length} mois</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-background border border-border text-sm font-body text-muted-foreground rounded-md hover:text-foreground hover:border-foreground transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={exportPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-background border border-border text-sm font-body text-muted-foreground rounded-md hover:text-foreground hover:border-foreground transition-colors">
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Period tabs */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex bg-background border border-border rounded-lg overflow-hidden">
          {(['jour', 'semaine', 'mois'] as Period[]).map(p => (
            <button key={p} onClick={() => { setPeriod(p); setOffset(0); }}
              className={`px-4 py-2 font-body text-sm transition-colors capitalize ${period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {p === 'jour' ? 'Jour' : p === 'semaine' ? 'Semaine' : 'Mois'}
            </button>
          ))}
        </div>

        {/* Period navigation */}
        <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
          <button onClick={() => setOffset(o => o + 1)} disabled={!canGoPrev}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-body text-sm text-foreground min-w-[180px] text-center capitalize">{periodLabel}</span>
          <button onClick={() => setOffset(o => o - 1)} disabled={!canGoNext}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <div onClick={() => setShowPrev(v => !v)}
            className={`w-9 h-5 rounded-full transition-colors ${showPrev ? 'bg-primary' : 'bg-muted-foreground/30'} relative`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showPrev ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="font-body text-xs text-muted-foreground">Comparer ({prevPeriodLabel})</span>
        </label>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Revenus"
          value={fmtK(stats.revenus) + ' FCFA'}
          sub={fmtFCFA(stats.revenus)}
          d={delta(stats.revenus, prevStats.revenus)}
        />
        <KpiCard
          label="Commandes"
          value={stats.commandes.toString()}
          d={delta(stats.commandes, prevStats.commandes)}
        />
        <KpiCard
          label="Panier moyen"
          value={fmtK(Math.round(stats.panierMoyen)) + ' FCFA'}
          d={delta(stats.panierMoyen, prevStats.panierMoyen)}
        />
        <KpiCard
          label="Marge brute"
          value={fmtK(stats.marge) + ' FCFA'}
          d={delta(stats.marge, prevStats.marge)}
        />
        <KpiCard
          label="Taux de marge"
          value={r1(stats.margePct) + '%'}
          sub={`Coût : ${fmtK(stats.cout)} FCFA`}
          d={delta(Math.round(stats.margePct * 10), Math.round(prevStats.margePct * 10))}
        />
        <KpiCard
          label="Produits vendus"
          value={period === 'jour' ? productStats.reduce((n, p) => n + p.vendu, 0).toString() : Math.round(stats.commandes * 2.2).toString()}
          sub={period === 'jour' ? 'articles vendus ce jour' : '~2.2 articles / commande'}
          d={delta(stats.commandes, prevStats.commandes)}
        />
      </div>

      {/* Main chart + Category */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* Revenue chart (2/3) */}
        <div className="lg:col-span-2 bg-background border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-lg text-foreground">
              {period === 'jour' ? 'Revenus des 7 derniers jours' : period === 'semaine' ? 'Revenus par jour' : 'Revenus par jour du mois'}
            </h3>
            <div className="flex gap-3 font-body text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-primary inline-block" /> Revenus</span>
              <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-green-500 inline-block" /> Marge</span>
              {showPrev && period !== 'jour' && <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-muted-foreground/40 inline-block" /> Préc.</span>}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: 'inherit' }} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="rev" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))"
                tickFormatter={v => fmtK(v)} />
              <YAxis yAxisId="cmd" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<CurrencyTooltip />} />
              {showPrev && period !== 'jour' && (
                <Bar yAxisId="rev" dataKey="prevRevenus" name="Préc." fill="hsl(var(--muted-foreground) / 0.2)" radius={[3, 3, 0, 0]} />
              )}
              <Bar yAxisId="rev" dataKey="revenus" name="Revenus" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Line yAxisId="rev" type="monotone" dataKey="marge" name="Marge" stroke="#22c55e"
                strokeWidth={2} dot={false} />
              <Line yAxisId="cmd" type="monotone" dataKey="commandes" name="Commandes"
                stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Top produits (1/3) */}
        <div className="bg-background border border-border rounded-xl p-5 shadow-sm">
          <h3 className="font-display text-lg text-foreground mb-2">Top produits</h3>
          {topProductsChartData.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground py-8 text-center">Aucune vente enregistrée</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProductsChartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => fmtK(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip formatter={(v: number) => [fmtFCFA(v)]} />
                <Bar dataKey="ca" name="CA" radius={[0, 3, 3, 0]}>
                  {topProductsChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="font-body text-xs text-muted-foreground mb-2">Taux de marge global</p>
            <div className="flex items-end gap-1">
              <p className={`font-display text-2xl ${margeColor(r1(stats.margePct))}`}>{r1(stats.margePct)}%</p>
              <p className="font-body text-xs text-muted-foreground mb-1 ml-1">
                {delta(Math.round(stats.margePct * 10), Math.round(prevStats.margePct * 10)) >= 0 ? '▲' : '▼'} {Math.abs(delta(Math.round(stats.margePct * 10), Math.round(prevStats.margePct * 10)))} pts
              </p>
            </div>
            <div className="w-full h-2 bg-border rounded-full mt-2 overflow-hidden">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(100, stats.margePct)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Top products table */}
      <div className="bg-background border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-display text-lg text-foreground">Performances par produit</h3>
          <p className="font-body text-xs text-muted-foreground">{sortedProducts.length} produits · {period === 'jour' ? 'ce jour' : 'toutes périodes'}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <Th label="Produit"   k="nom"      sortKey={sortKey} sortDir={sortDir} onSort={onSort} cls="text-left" />
                <th className="p-3 font-body text-xs uppercase tracking-wider text-muted-foreground text-left hidden md:table-cell">Catégorie</th>
                <Th label="Vendus"    k="vendu"    sortKey={sortKey} sortDir={sortDir} onSort={onSort} cls="text-right" />
                <Th label="CA"        k="ca"       sortKey={sortKey} sortDir={sortDir} onSort={onSort} cls="text-right" />
                <Th label="Coût total" k="marge"   sortKey={sortKey} sortDir={sortDir} onSort={onSort} cls="text-right hidden lg:table-cell" />
                <Th label="Marge brute" k="marge"  sortKey={sortKey} sortDir={sortDir} onSort={onSort} cls="text-right" />
                <Th label="% Marge"   k="margePct" sortKey={sortKey} sortDir={sortDir} onSort={onSort} cls="text-center" />
              </tr>
            </thead>
            <tbody>
              {sortedProducts.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center font-body text-sm text-muted-foreground">Aucune vente enregistrée en base</td></tr>
              ) : productsPagination.pageItems.map((p, i) => {
                // Le rang reste celui du classement complet, pas celui de la page.
                const rank = (productsPagination.page - 1) * productsPagination.pageSize + i;
                return (
                <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-body text-muted-foreground shrink-0">{rank + 1}</span>
                      <span className="font-body text-sm font-medium text-foreground">{p.nom}</span>
                    </div>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <span className="px-2 py-0.5 rounded-full text-xs font-body bg-muted text-muted-foreground">
                      {p.categorie}
                    </span>
                  </td>
                  <td className="p-3 text-right font-body text-sm text-foreground">{p.vendu.toLocaleString()}</td>
                  <td className="p-3 text-right font-body text-sm font-medium text-foreground">{fmtK(p.ca)} FCFA</td>
                  <td className="p-3 text-right font-body text-xs text-muted-foreground hidden lg:table-cell">{fmtK(p.coutTotal)} FCFA</td>
                  <td className="p-3 text-right font-body text-sm text-green-600 font-medium">{fmtK(p.marge)} FCFA</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-body font-medium ${margeBg(p.margePct)}`}>
                      {p.margePct}%
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td colSpan={2} className="p-3 font-body text-xs text-muted-foreground">{sortedProducts.length} produits</td>
                <td className="p-3 text-right font-body text-xs font-medium text-foreground">
                  {sortedProducts.reduce((s, p) => s + p.vendu, 0).toLocaleString()}
                </td>
                <td className="p-3 text-right font-body text-xs font-semibold text-foreground">
                  {fmtK(sortedProducts.reduce((s, p) => s + p.ca, 0))} FCFA
                </td>
                <td className="p-3 hidden lg:table-cell"></td>
                <td className="p-3 text-right font-body text-xs font-semibold text-green-600">
                  {fmtK(sortedProducts.reduce((s, p) => s + p.marge, 0))} FCFA
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-body font-medium ${margeBg(Math.round(sortedProducts.reduce((s, p) => s + p.margePct, 0) / sortedProducts.length))}`}>
                    {Math.round(sortedProducts.reduce((s, p) => s + p.margePct, 0) / sortedProducts.length)}% moy.
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <TablePagination {...productsPagination} onPageChange={productsPagination.setPage} />
      </div>

      {/* Insights */}
      <div className="grid md:grid-cols-3 gap-4">
        {bestDay && (
          <div className="bg-background border border-green-200 rounded-xl p-5">
            <p className="font-body text-xs uppercase tracking-wider text-green-600 mb-2">Meilleur jour</p>
            <p className="font-display text-xl text-foreground mb-1 capitalize">
              {bestDay.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}
            </p>
            <p className="font-body text-sm font-semibold text-green-600">{fmtFCFA(bestDay.revenus)}</p>
            <p className="font-body text-xs text-muted-foreground mt-1">{bestDay.commandes} commandes · marge {Math.round((bestDay.revenus - bestDay.cout) / bestDay.revenus * 100)}%</p>
          </div>
        )}
        {bestProduct && (
          <div className="bg-background border border-primary/20 rounded-xl p-5">
            <p className="font-body text-xs uppercase tracking-wider text-primary mb-2">Meilleur produit (CA)</p>
            <p className="font-display text-lg text-foreground mb-1 leading-tight">{bestProduct.nom}</p>
            <p className="font-body text-sm font-semibold text-primary">{fmtFCFA(bestProduct.ca)}</p>
            <p className="font-body text-xs text-muted-foreground mt-1">{bestProduct.vendu} vendus · marge {bestProduct.margePct}%</p>
          </div>
        )}
        {worstMarge && (
          <div className="bg-background border border-orange-200 rounded-xl p-5">
            <p className="font-body text-xs uppercase tracking-wider text-orange-600 mb-2">Marge à optimiser</p>
            <p className="font-display text-lg text-foreground mb-1 leading-tight">{worstMarge.nom}</p>
            <p className={`font-body text-sm font-semibold ${margeColor(worstMarge.margePct)}`}>{worstMarge.margePct}% de marge</p>
            <p className="font-body text-xs text-muted-foreground mt-1">
              Coût : {fmtFCFA(worstMarge.cout)} · Prix vente : {fmtFCFA(worstMarge.prix)}
            </p>
          </div>
        )}
      </div>

      {/* Bilan mensuel — évolution réelle */}
      {bilanData.length > 0 && (
        <div className="bg-background border border-border rounded-xl p-5 shadow-sm">
          <h3 className="font-display text-lg text-foreground mb-4">Évolution mensuelle des revenus (données réelles)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={bilanData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
              <Tooltip content={<CurrencyTooltip />} />
              <Bar dataKey="revenus" name="Revenus" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Line type="monotone" dataKey="benefice" name="Bénéfice" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
