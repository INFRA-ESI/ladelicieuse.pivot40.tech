import { useState, useMemo, useEffect } from 'react';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, type TooltipProps,
} from 'recharts';
import {
  TrendingUp, TrendingDown, ChevronLeft, ChevronRight,
  Download, ChevronUp, ChevronDown, Minus, Loader2,
} from 'lucide-react';
import { adminGet } from '@/services/adminApiService';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'semaine' | 'mois';

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
const catColor = (_cat: string, i: number) => PROD_COLORS[i % PROD_COLORS.length];

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

const getPeriodDays = (period: Period, offset: number, data: DayData[]): DayData[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
  if (period === 'semaine') return [];
  const today = new Date();
  const ref = new Date(today.getFullYear(), today.getMonth() - offset, 1);
  const moisKey = ref.toISOString().substring(0, 7);
  return bilan.filter(b => b.moisKey === moisKey);
};

const getPeriodLabel = (period: Period, offset: number, days: DayData[], bilan: BilanRow[]): string => {
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

  // Build allDays from real daily data, estimating cost from monthly bilan ratio
  const allDays = useMemo<DayData[]>(() => {
    return revenueApiData.map(r => {
      const date = new Date(r._id + 'T12:00:00');
      const moisKey = r._id.substring(0, 7);
      const moisBilan = bilanData.find(b => b.moisKey === moisKey);
      const coutRatio = moisBilan && moisBilan.revenus > 0 ? moisBilan.coutMatieres / moisBilan.revenus : 0.40;
      return { date, dateStr: r._id, revenus: r.revenu, commandes: r.factures, cout: Math.round(r.revenu * coutRatio) };
    });
  }, [revenueApiData, bilanData]);

  // For mois view: use bilan rows for better cost accuracy
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
  const chartData   = useMemo(() => getChartData(period, periodDays, prevDays), [period, periodDays, prevDays]);

  const productStats = useMemo<ProductStat[]>(() => {
    return topMealsData.map((m, i) => {
      const prix      = m.total > 0 ? Math.round(m.revenu / m.total) : 0;
      const cout      = Math.round(prix * 0.40);
      const vendu     = m.total;
      const ca        = vendu * prix;
      const coutTotal = vendu * cout;
      const marge     = ca - coutTotal;
      const margePct  = ca > 0 ? Math.round(marge / ca * 100) : 0;
      return { id: i + 1, nom: m._id, categorie: 'Plats', vendu, prix, cout, ca, coutTotal, marge, margePct };
    });
  }, [topMealsData]);

  const sortedProducts = useMemo(() => {
    return [...productStats].sort((a, b) => {
      const va = sortKey === 'nom' ? a.nom : sortKey === 'vendu' ? a.vendu : sortKey === 'ca' ? a.ca : sortKey === 'marge' ? a.marge : a.margePct;
      const vb = sortKey === 'nom' ? b.nom : sortKey === 'vendu' ? b.vendu : sortKey === 'ca' ? b.ca : sortKey === 'marge' ? b.marge : b.margePct;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [productStats, sortKey, sortDir]);

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
  const exportCSV = () => {
    const rows: string[][] = [];
    const sep = ';';

    rows.push(['La Délicieuse Diète — Rapport de ventes']);
    rows.push([`Période : ${periodLabel}`]);
    rows.push([`Généré le : ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`]);
    rows.push([]);

    rows.push(['=== RÉSUMÉ ===']);
    rows.push(['Revenus', `${stats.revenus} FCFA`]);
    rows.push(['Coût matières (estimé)', `${stats.cout} FCFA`]);
    rows.push(['Marge brute', `${stats.marge} FCFA`]);
    rows.push(['Marge %', `${r1(stats.margePct)}%`]);
    rows.push(['Commandes', String(stats.commandes)]);
    rows.push(['Panier moyen', `${Math.round(stats.panierMoyen)} FCFA`]);
    rows.push([]);

    if (periodDays.length > 0) {
      rows.push(['=== DONNÉES JOURNALIÈRES ===']);
      rows.push(['Date', 'Revenus (FCFA)', 'Commandes', 'Coût (FCFA)', 'Marge (FCFA)', 'Marge %']);
      periodDays.forEach(d => {
        const marge = d.revenus - d.cout;
        const pct   = d.revenus > 0 ? r1(marge / d.revenus * 100) : 0;
        rows.push([d.dateStr, String(d.revenus), String(d.commandes), String(d.cout), String(marge), `${pct}%`]);
      });
      rows.push([]);
    }

    if (sortedProducts.length > 0) {
      rows.push(['=== PRODUITS ===']);
      rows.push(['Rang', 'Produit', 'Qté vendue', 'CA (FCFA)', 'Coût total (FCFA)', 'Marge (FCFA)', 'Marge %']);
      sortedProducts.forEach((p, i) => {
        rows.push([String(i + 1), p.nom, String(p.vendu), String(p.ca), String(p.coutTotal), String(p.marge), `${p.margePct}%`]);
      });
    }

    const csv = '﻿' + rows.map(r => r.join(sep)).join('\n'); // BOM pour Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `rapport-ventes-${periodLabel.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Export PDF (impression navigateur) ───────────────────────────────────────
  const printReport = () => {
    const G1 = '#1c4028', G2 = '#267340', GL = '#f4f7f2';
    const genDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Barre de progression CSS pour la marge
    const bar = (pct: number) => {
      const clr = pct >= 55 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626';
      const w   = Math.max(4, Math.min(100, pct));
      return `<div style="display:flex;align-items:center;gap:6px">
        <div style="flex:1;height:5px;background:#eee;border-radius:3px;overflow:hidden">
          <div style="width:${w}%;height:100%;background:${clr};border-radius:3px"></div>
        </div>
        <span style="font-size:11px;font-weight:700;color:${clr};width:36px;text-align:right">${pct}%</span>
      </div>`;
    };

    const detailRows = (period === 'mois' && periodBilanRows.length > 0)
      ? periodBilanRows.map(r => {
          const pct = r.revenus > 0 ? r1(r.benefice / r.revenus * 100) : 0;
          return `<tr>
            <td><strong>${r.mois} ${new Date(r.moisKey + '-01').getFullYear()}</strong></td>
            <td class="r">${r.revenus.toLocaleString('fr-FR')}</td>
            <td class="r">${r.count}</td>
            <td class="r">${r.coutMatieres.toLocaleString('fr-FR')}</td>
            <td class="r">${r.benefice.toLocaleString('fr-FR')}</td>
            <td style="min-width:120px">${bar(pct)}</td>
          </tr>`;
        }).join('')
      : periodDays.map(d => {
          const m = d.revenus - d.cout;
          const pct = d.revenus > 0 ? r1(m / d.revenus * 100) : 0;
          return `<tr>
            <td>${d.dateStr}</td>
            <td class="r">${d.revenus.toLocaleString('fr-FR')}</td>
            <td class="r">${d.commandes}</td>
            <td class="r">${d.cout.toLocaleString('fr-FR')}</td>
            <td class="r">${m.toLocaleString('fr-FR')}</td>
            <td style="min-width:120px">${bar(pct)}</td>
          </tr>`;
        }).join('');

    const prodRows = sortedProducts.map((p, i) =>
      `<tr>
        <td class="r" style="color:#888;font-weight:300">${i + 1}</td>
        <td><strong>${p.nom}</strong></td>
        <td class="r">${p.vendu}</td>
        <td class="r"><strong>${p.ca.toLocaleString('fr-FR')}</strong></td>
        <td class="r">${p.coutTotal.toLocaleString('fr-FR')}</td>
        <td class="r">${p.marge.toLocaleString('fr-FR')}</td>
        <td style="min-width:120px">${bar(p.margePct)}</td>
      </tr>`
    ).join('');

    const totalMarge = r1(stats.margePct);
    const margeCls   = totalMarge >= 55 ? '#16a34a' : totalMarge >= 40 ? '#d97706' : '#dc2626';

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>Rapport de ventes — ${periodLabel}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#333;font-size:12px;background:#fff;line-height:1.5}
  .bar-top{height:4px;background:#267340;font-size:0;line-height:0}
  .bar-mid{height:2px;background:#267340;font-size:0;line-height:0}
  .bar-bot{height:4px;background:#267340;font-size:0;line-height:0}
  /* ── En-tête ─────────────────────────────────────────────────────────── */
  .header{background:#1c4028;color:#fff;padding:28px 44px;display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;position:relative;overflow:hidden}
  .header::before{content:'';position:absolute;right:-60px;bottom:-60px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.04)}
  .brand-wrap{display:flex;align-items:center;gap:12px}
  .brand-mono{width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:700;color:#fff;letter-spacing:-1px;flex-shrink:0}
  .brand-name{font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:400;letter-spacing:4px;text-transform:uppercase;line-height:1.1}
  .brand-tag{font-size:9px;color:#267340;letter-spacing:3px;text-transform:uppercase;margin-top:4px}
  .doc-info{text-align:right}
  .doc-title{font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:400;letter-spacing:3px;text-transform:uppercase;opacity:.95}
  .doc-period{font-size:11px;opacity:.7;margin-top:4px}
  .doc-date{font-size:10px;opacity:.5;margin-top:2px}
  /* ── Séparateur ──────────────────────────────────────────────────────── */
  .stripe{height:0}
  /* ── Corps ───────────────────────────────────────────────────────────── */
  .body{padding:32px 44px}
  /* Section */
  .section{margin-bottom:32px}
  .section-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
  .section-num{width:22px;height:22px;background:${G2};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
  .section-title{font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:${G2};font-weight:700}
  .section-line{flex:1;height:1px;background:${GL}}
  /* KPI */
  .kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .kpi-card{border-radius:10px;padding:14px 16px;border:1px solid transparent}
  .kpi-card.primary{background:#f4f7f2;border-color:#d0dccb}
  .kpi-card.secondary{background:#f9faf9;border-color:#e4ebe2}
  .kpi-lbl{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#7a9488;font-weight:700;margin-bottom:6px}
  .kpi-val{font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400;line-height:1.1}
  .kpi-card.primary .kpi-val{color:#267340}
  .kpi-card.secondary .kpi-val{color:#1c4028}
  .kpi-unit{font-size:10px;font-family:Arial,Helvetica,sans-serif;font-weight:400;color:#7a9488;margin-left:3px}
  /* Synthèse marge */
  .marge-summary{display:flex;align-items:center;gap:16px;background:#f4f7f2;border-left:3px solid #267340;border-radius:0 8px 8px 0;padding:14px 18px;margin-top:10px}
  .marge-big{font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:400;color:${margeCls}}
  .marge-bar-wrap{flex:1}
  .marge-bar-bg{height:6px;background:#d0dccb;border-radius:4px;overflow:hidden}
  .marge-bar-fill{height:100%;background:${margeCls};border-radius:4px;width:${Math.min(100, totalMarge)}%}
  .marge-label{font-size:10px;color:#4a6357;margin-top:4px}
  /* Tables */
  .table-wrap{border-radius:6px;overflow:hidden;border:1px solid #e4ebe2}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  thead tr{background:#1c4028}
  th{padding:10px 12px;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:2px;font-weight:700;text-align:left}
  th.r{text-align:right}
  td{padding:10px 12px;border-bottom:1px solid #f0f4f0;color:#333}
  tr:last-child td{border-bottom:none}
  tr:nth-child(even) td{background:#f9fbf9}
  td.r{text-align:right}
  /* Pied */
  .footer-sep{height:1px;background:#e4ebe2;margin-top:24px;font-size:0}
  .footer{background:#f4f7f2;padding:20px 44px;display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}
  .footer-brand{font-family:Georgia,'Times New Roman',serif;font-size:12px;font-weight:400;color:#267340;letter-spacing:3px;text-transform:uppercase}
  .footer-info{font-size:10px;color:#7a9488;line-height:1.7;margin-top:2px}
  .footer-right{text-align:right;font-size:10px;color:#aaa;line-height:1.8}
  @media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
</style></head><body>

<div class="bar-top"></div>
<div class="header">
  <div class="brand-wrap">
    <div class="brand-mono">LD</div>
    <div>
      <div class="brand-name">La Délicieuse Diète</div>
      <div class="brand-tag">Cuisine saine &amp; savoureuse · Libreville, Gabon</div>
    </div>
  </div>
  <div class="doc-info">
    <div class="doc-title">Rapport de ventes</div>
    <div class="doc-period">${periodLabel}</div>
    <div class="doc-date">Généré le ${genDate}</div>
  </div>
</div>
<div class="bar-mid"></div>
<div class="stripe"></div>

<div class="body">

  <!-- 1. KPI -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">1</div>
      <div class="section-title">Indicateurs clés de performance</div>
      <div class="section-line"></div>
    </div>
    <div class="kpi">
      <div class="kpi-card primary">
        <div class="kpi-lbl">Revenus totaux</div>
        <div class="kpi-val">${stats.revenus.toLocaleString('fr-FR')}<span class="kpi-unit">FCFA</span></div>
      </div>
      <div class="kpi-card primary">
        <div class="kpi-lbl">Marge brute</div>
        <div class="kpi-val">${stats.marge.toLocaleString('fr-FR')}<span class="kpi-unit">FCFA</span></div>
      </div>
      <div class="kpi-card secondary">
        <div class="kpi-lbl">Commandes</div>
        <div class="kpi-val">${stats.commandes}</div>
      </div>
      <div class="kpi-card secondary">
        <div class="kpi-lbl">Panier moyen</div>
        <div class="kpi-val">${Math.round(stats.panierMoyen).toLocaleString('fr-FR')}<span class="kpi-unit">FCFA</span></div>
      </div>
      <div class="kpi-card secondary">
        <div class="kpi-lbl">Coût matières</div>
        <div class="kpi-val">${stats.cout.toLocaleString('fr-FR')}<span class="kpi-unit">FCFA</span></div>
      </div>
      <div class="kpi-card secondary">
        <div class="kpi-lbl">Résultat net</div>
        <div class="kpi-val" style="color:${margeCls}">${(stats.revenus - stats.cout).toLocaleString('fr-FR')}<span class="kpi-unit">FCFA</span></div>
      </div>
    </div>
    <div class="marge-summary">
      <div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#666;margin-bottom:4px">Taux de marge global</div>
        <div class="marge-big">${totalMarge}%</div>
      </div>
      <div class="marge-bar-wrap">
        <div class="marge-bar-bg"><div class="marge-bar-fill"></div></div>
        <div class="marge-label">${totalMarge >= 55 ? '✓ Excellente rentabilité' : totalMarge >= 40 ? '→ Rentabilité correcte' : '⚠ Marge à améliorer'}</div>
      </div>
    </div>
  </div>

  <!-- 2. Détail -->
  ${detailRows ? `
  <div class="section">
    <div class="section-head">
      <div class="section-num">2</div>
      <div class="section-title">Détail ${period === 'mois' ? 'mensuel' : 'journalier'}</div>
      <div class="section-line"></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Période</th>
          <th class="r">Revenus (FCFA)</th>
          <th class="r">Commandes</th>
          <th class="r">Coût (FCFA)</th>
          <th class="r">Marge (FCFA)</th>
          <th>Marge %</th>
        </tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>
  </div>` : ''}

  <!-- 3. Produits -->
  ${prodRows ? `
  <div class="section">
    <div class="section-head">
      <div class="section-num">3</div>
      <div class="section-title">Performance produits</div>
      <div class="section-line"></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th class="r">#</th>
          <th>Produit</th>
          <th class="r">Qté vendue</th>
          <th class="r">CA (FCFA)</th>
          <th class="r">Coût total</th>
          <th class="r">Marge (FCFA)</th>
          <th>Marge %</th>
        </tr></thead>
        <tbody>${prodRows}</tbody>
      </table>
    </div>
  </div>` : ''}


</div>

<div class="footer-sep"></div>
<div class="footer">
  <div>
    <div class="footer-brand">La Délicieuse Diète</div>
    <div class="footer-info">Quartier Louis, Libreville, Gabon · ladelicieuse.1@gmail.com · +241 76 35 90 20</div>
  </div>
  <div class="footer-right">
    Document confidentiel — usage interne<br>
    Généré le ${genDate}
  </div>
</div>
<div class="bar-bot"></div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  };
  const worstMarge   = productStats.length > 0 ? [...productStats].sort((a, b) => a.margePct - b.margePct)[0] : null;

  const canGoNext = offset > 0;
  const canGoPrev = (() => {
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
    pct >= 55 ? 'bg-green-100 text-green-700' : pct >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';

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
            onClick={printReport}
            className="flex items-center gap-2 px-4 py-2.5 bg-background border border-border text-sm font-body text-muted-foreground rounded-md hover:text-foreground hover:border-foreground transition-colors">
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Period tabs */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex bg-background border border-border rounded-lg overflow-hidden">
          {(['semaine', 'mois'] as Period[]).map(p => (
            <button key={p} onClick={() => { setPeriod(p); setOffset(0); }}
              className={`px-4 py-2 font-body text-sm transition-colors capitalize ${period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {p === 'semaine' ? 'Semaine' : 'Mois'}
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
          value={Math.round(stats.commandes * 2.2).toString()}
          sub="~2.2 articles / commande"
          d={delta(stats.commandes, prevStats.commandes)}
        />
      </div>

      {/* Main chart + Category */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* Revenue chart (2/3) */}
        <div className="lg:col-span-2 bg-background border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-lg text-foreground">
              {period === 'semaine' ? 'Revenus par jour' : 'Revenus par jour du mois'}
            </h3>
            <div className="flex gap-3 font-body text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-primary inline-block" /> Revenus</span>
              <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-green-500 inline-block" /> Marge</span>
              {showPrev && <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-muted-foreground/40 inline-block" /> Préc.</span>}
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
              {showPrev && (
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
          <p className="font-body text-xs text-muted-foreground">{sortedProducts.length} produits · toutes périodes</p>
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
              ) : sortedProducts.map((p, rank) => (
                <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-body text-muted-foreground shrink-0">{rank + 1}</span>
                      <span className="font-body text-sm font-medium text-foreground">{p.nom}</span>
                    </div>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <span className="px-2 py-0.5 rounded-full text-xs font-body bg-muted text-muted-foreground" style={{ borderLeft: `3px solid ${catColor(p.categorie, rank)}` }}>
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
              ))}
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
