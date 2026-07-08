import { useState, useEffect, useCallback } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, Scale, Flame, Beef, Wheat,
  Droplets, Settings2, Plus, Trash2, CheckCircle2, X, ChevronDown,
  Zap, CalendarDays, Target, Activity, AlertCircle,
} from 'lucide-react';
import { useUser, TOKEN_KEY } from '@/context/UserContext';
import { ls } from '@/lib/storage';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProgressEntry {
  _id: string;
  date: string;
  poids?: number;
  calories?: number;
  proteines?: number;
  glucides?: number;
  lipides?: number;
  eau?: number;
  notes?: string;
}

interface Goals {
  taille?: number;
  objectifPoids?: number;
  objectifCalories?: number;
  objectifProteines?: number;
  objectifGlucides?: number;
  objectifLipides?: number;
  objectifEau?: number;
}

interface Stats {
  latest: ProgressEntry | null;
  weekAvg: {
    calories: number | null;
    proteines: number | null;
    glucides: number | null;
    lipides: number | null;
    eau: number | null;
  };
  entreesSemaine: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function trendIcon(current: number | undefined, prev: number | undefined, invert = false) {
  if (current == null || prev == null) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  const diff = current - prev;
  if (Math.abs(diff) < 0.1) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  const isGood = invert ? diff < 0 : diff > 0;
  return isGood
    ? <TrendingUp className="w-3.5 h-3.5 text-green-500" />
    : <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
}

function pct(value: number | undefined, goal: number | undefined) {
  if (!value || !goal) return 0;
  return Math.min(100, Math.round((value / goal) * 100));
}

function calcStreak(entries: ProgressEntry[]): number {
  if (entries.length === 0) return 0;
  const dayMs = 86_400_000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const unique = [...new Set(
    entries.map(e => { const d = new Date(e.date); d.setHours(0, 0, 0, 0); return d.getTime(); })
  )].sort((a, b) => b - a);
  let streak = 0;
  let expected = today.getTime();
  for (const ts of unique) {
    if (ts === expected) { streak++; expected -= dayMs; }
    else if (ts < expected) break;
  }
  return streak;
}

function getTodayEntry(entries: ProgressEntry[]): ProgressEntry | null {
  const t = new Date();
  return entries.find(e => {
    const d = new Date(e.date);
    return (
      d.getFullYear() === t.getFullYear() &&
      d.getMonth() === t.getMonth() &&
      d.getDate() === t.getDate()
    );
  }) ?? null;
}

function isEntryToday(e: ProgressEntry): boolean {
  const t = new Date();
  const d = new Date(e.date);
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function getWeekMonday(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function weekLabel(mondayIso: string): string {
  return new Date(mondayIso + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function avgField(arr: ProgressEntry[], field: keyof ProgressEntry): number | null {
  const vals = arr.map(e => e[field]).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SuiviSkeleton() {
  return (
    <div className="min-h-screen bg-muted/20 pb-20 pt-20">
      <div className="bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <div className="h-3 w-32 bg-muted rounded-full animate-pulse" />
              <div className="h-9 w-52 bg-muted rounded-xl animate-pulse" />
              <div className="flex gap-2 pt-1">
                <div className="h-6 w-28 bg-muted rounded-full animate-pulse" />
                <div className="h-6 w-36 bg-muted rounded-full animate-pulse" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-28 bg-muted rounded-xl animate-pulse" />
              <div className="h-10 w-36 bg-muted rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6 pt-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-background border border-border rounded-2xl p-4 animate-pulse">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-muted" />
                <div className="w-5 h-4 bg-muted rounded" />
              </div>
              <div className="h-7 w-20 bg-muted rounded mb-2" />
              <div className="h-3 w-28 bg-muted rounded" />
              <div className="mt-3 h-1.5 bg-muted rounded-full" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-background border border-border rounded-2xl p-4 animate-pulse">
              <div className="w-9 h-9 rounded-xl bg-muted mb-3" />
              <div className="h-6 w-12 bg-muted rounded mb-2" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
          ))}
        </div>
        <div className="bg-background border border-border rounded-2xl p-5 animate-pulse">
          <div className="h-5 w-40 bg-muted rounded-lg mb-5" />
          <div className="space-y-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="flex justify-between mb-2">
                  <div className="h-4 w-16 bg-muted rounded" />
                  <div className="h-4 w-24 bg-muted rounded" />
                </div>
                <div className="h-2 bg-muted rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-background border border-border rounded-2xl p-5 animate-pulse">
              <div className="flex justify-between mb-4">
                <div className="h-5 w-44 bg-muted rounded-lg" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
              <div className="h-52 bg-muted rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuiviPage() {
  const { user } = useUser();

  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [stats, setStats]     = useState<Stats | null>(null);
  const [goals, setGoals]     = useState<Goals>({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [showForm, setShowForm]       = useState(false);
  const [showGoals, setShowGoals]     = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [form, setForm] = useState({
    poids: '', calories: '', proteines: '', glucides: '', lipides: '', eau: '', notes: '',
  });
  const [goalForm, setGoalForm] = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);

  const token = ls.get(TOKEN_KEY) ?? '';

  const fetchAll = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setError(null);
    try {
      const [entriesRes, statsRes, goalsRes] = await Promise.all([
        fetch(`${API}/api/tracking?days=30`, { headers: authHeaders(token) }),
        fetch(`${API}/api/tracking/stats`,   { headers: authHeaders(token) }),
        fetch(`${API}/api/client/goals`,     { headers: authHeaders(token) }),
      ]);
      const [e, s, g] = await Promise.all([
        entriesRes.json(),
        statsRes.json(),
        goalsRes.json(),
      ]);
      if (e.success) setEntries(e.data ?? []);
      if (s.success) setStats(s.data);
      if (g.success) {
        setGoals(g.data);
        setGoalForm(
          Object.fromEntries(
            Object.entries(g.data as Goals).map(([k, v]) => [k, v != null ? String(v) : ''])
          )
        );
      }
    } catch {
      setError('Impossible de charger vos données. Vérifiez votre connexion et réessayez.');
      toast.error('Erreur de chargement des données.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Save today's entry ────────────────────────────────────────────────────
  const handleSaveEntry = async () => {
    const payload: Record<string, unknown> = {};
    if (form.poids)     payload.poids     = parseFloat(form.poids);
    if (form.calories)  payload.calories  = parseFloat(form.calories);
    if (form.proteines) payload.proteines = parseFloat(form.proteines);
    if (form.glucides)  payload.glucides  = parseFloat(form.glucides);
    if (form.lipides)   payload.lipides   = parseFloat(form.lipides);
    if (form.eau)       payload.eau       = parseFloat(form.eau);
    if (form.notes)     payload.notes     = form.notes;

    if (Object.keys(payload).length === 0) {
      toast.error('Renseignez au moins une valeur.');
      return;
    }

    setSaving(true);
    try {
      const res  = await fetch(`${API}/api/tracking`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success('Entrée enregistrée !');
      setShowForm(false);
      setForm({ poids: '', calories: '', proteines: '', glucides: '', lipides: '', eau: '', notes: '' });
      await fetchAll();
    } catch (err) {
      toast.error((err as Error).message || 'Erreur enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  // ── Save goals ─────────────────────────────────────────────────────────────
  const handleSaveGoals = async () => {
    setSaving(true);
    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(goalForm)) {
      if (v !== '') payload[k] = parseFloat(v);
    }
    try {
      const res  = await fetch(`${API}/api/client/goals`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success('Objectifs mis à jour !');
      setGoals(data.data);
      setShowGoals(false);
    } catch (err) {
      toast.error((err as Error).message || 'Erreur mise à jour.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete entry ───────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/tracking/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      if (!res.ok) throw new Error();
      toast.success('Entrée supprimée.');
      await fetchAll();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const latest    = stats?.latest;
  const prev      = entries.length >= 2 ? entries[entries.length - 2] : null;
  const streak    = calcStreak(entries);
  const todayDone = getTodayEntry(entries) != null;

  const weeklyChartData = (() => {
    const map: Record<string, ProgressEntry[]> = {};
    for (const e of entries) {
      const k = getWeekMonday(e.date);
      (map[k] ??= []).push(e);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([k, w]) => ({
        semaine:   weekLabel(k),
        poids:     avgField(w, 'poids'),
        calories:  avgField(w, 'calories'),
        proteines: avgField(w, 'proteines'),
        glucides:  avgField(w, 'glucides'),
        lipides:   avgField(w, 'lipides'),
        eau:       avgField(w, 'eau'),
      }));
  })();

  // ─────────────────────────────────────────────────────────────────────────

  if (!user) return <Navigate to="/connexion" replace />;
  if (loading) return <SuiviSkeleton />;

  if (error) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6 pt-24">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <h2 className="font-display text-2xl text-foreground mb-2">Erreur de chargement</h2>
          <p className="font-body text-sm text-muted-foreground mb-6 leading-relaxed">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchAll(); }}
            className="inline-flex items-center gap-2 font-body text-sm px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-20 pt-20">

      {/* ── Header ── */}
      <div className="bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p className="font-body text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">
                Mon espace santé
              </p>
              <h1 className="font-display text-3xl md:text-4xl text-foreground">Suivi Diététique</h1>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {streak > 0 && (
                  <motion.div
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-body
                      ${streak >= 7
                        ? 'bg-orange-50 border-orange-200 text-orange-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}
                  >
                    <Zap className={`w-3.5 h-3.5 ${streak >= 7 ? 'text-orange-500' : 'text-amber-500'}`} />
                    {streak} jour{streak > 1 ? 's' : ''} consécutif{streak > 1 ? 's' : ''}
                  </motion.div>
                )}
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.08 }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-body
                    ${todayDone
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-muted/60 border-border text-muted-foreground'
                    }`}
                >
                  {todayDone
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    : <CalendarDays className="w-3.5 h-3.5" />
                  }
                  {todayDone ? 'Entrée du jour enregistrée' : "Pas encore d'entrée aujourd'hui"}
                </motion.div>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => { setShowGoals(v => !v); setShowForm(false); }}
                className={`flex items-center gap-2 font-body text-sm px-4 py-2.5 border rounded-xl transition-colors
                  ${showGoals
                    ? 'border-primary/40 bg-primary/5 text-primary'
                    : 'border-border hover:bg-muted/50'
                  }`}
              >
                <Settings2 className="w-4 h-4" />
                Objectifs
              </button>
              <button
                onClick={() => { setShowForm(v => !v); setShowGoals(false); }}
                className="flex items-center gap-2 font-body text-sm px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                {todayDone ? 'Mettre à jour' : 'Nouvelle entrée'}
              </button>
            </div>
          </div>

          {/* ── Objectifs panel ── */}
          <AnimatePresence>
            {showGoals && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-6 p-5 bg-muted/40 rounded-2xl border border-border">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="font-display text-lg text-foreground">Mes objectifs personnels</h3>
                      <p className="font-body text-xs text-muted-foreground mt-0.5">
                        Ces valeurs servent de référence pour vos barres de progression
                      </p>
                    </div>
                    <button
                      onClick={() => setShowGoals(false)}
                      className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    {[
                      { key: 'taille',            label: 'Taille',         unit: 'cm' },
                      { key: 'objectifPoids',     label: 'Poids cible',    unit: 'kg' },
                      { key: 'objectifCalories',  label: 'Calories/jour',  unit: 'kcal' },
                      { key: 'objectifProteines', label: 'Protéines/jour', unit: 'g' },
                      { key: 'objectifGlucides',  label: 'Glucides/jour',  unit: 'g' },
                      { key: 'objectifLipides',   label: 'Lipides/jour',   unit: 'g' },
                      { key: 'objectifEau',       label: 'Eau/jour',       unit: 'L' },
                    ].map(({ key, label, unit }) => (
                      <div key={key}>
                        <label className="font-body text-xs text-muted-foreground block mb-1">{label}</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={goalForm[key] ?? ''}
                            onChange={e => setGoalForm(f => ({ ...f, [key]: e.target.value }))}
                            placeholder="—"
                            className="w-full font-body text-sm px-3 py-2 pr-12 border border-border rounded-xl bg-background outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-xs text-muted-foreground">
                            {unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={handleSaveGoals}
                      disabled={saving}
                      className="flex items-center gap-2 font-body text-sm px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-60"
                    >
                      {saving
                        ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : <CheckCircle2 className="w-4 h-4" />
                      }
                      {saving ? 'Enregistrement…' : 'Enregistrer les objectifs'}
                    </button>
                    <button
                      onClick={() => setShowGoals(false)}
                      className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Formulaire d'entrée ── */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 p-5 bg-muted/40 rounded-2xl border border-border">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="font-display text-lg text-foreground">
                        {todayDone ? "Mettre à jour l'entrée du jour" : 'Entrée du jour'}
                      </h3>
                      <p className="font-body text-xs text-muted-foreground mt-0.5 capitalize">
                        {formatDateLong(new Date().toISOString())}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowForm(false)}
                      className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                    {[
                      { key: 'poids',     label: 'Poids',      unit: 'kg',   icon: Scale,    step: '0.1' },
                      { key: 'calories',  label: 'Calories',   unit: 'kcal', icon: Flame,    step: '1' },
                      { key: 'proteines', label: 'Protéines',  unit: 'g',    icon: Beef,     step: '0.1' },
                      { key: 'glucides',  label: 'Glucides',   unit: 'g',    icon: Wheat,    step: '0.1' },
                      { key: 'lipides',   label: 'Lipides',    unit: 'g',    icon: Activity, step: '0.1' },
                      { key: 'eau',       label: 'Eau',        unit: 'L',    icon: Droplets, step: '0.1' },
                    ].map(({ key, label, unit, icon: Icon, step }) => (
                      <div key={key}>
                        <label className="flex items-center gap-1 font-body text-xs text-muted-foreground mb-1">
                          <Icon className="w-3 h-3" />{label}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step={step}
                            min="0"
                            value={form[key as keyof typeof form]}
                            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                            placeholder="—"
                            className="w-full font-body text-sm px-3 py-2.5 pr-12 border border-border rounded-xl bg-background outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-xs text-muted-foreground">
                            {unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <label className="font-body text-xs text-muted-foreground block mb-1">Notes (optionnel)</label>
                    <textarea
                      value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Repas, sensations, contexte du jour…"
                      rows={2}
                      className="w-full font-body text-sm px-3 py-2.5 border border-border rounded-xl bg-background outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={handleSaveEntry}
                      disabled={saving}
                      className="flex items-center gap-2 font-body text-sm px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-60"
                    >
                      {saving
                        ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : <CheckCircle2 className="w-4 h-4" />
                      }
                      {saving ? 'Enregistrement…' : "Enregistrer l'entrée"}
                    </button>
                    <button
                      onClick={() => setShowForm(false)}
                      className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Contenu ── */}
      <div className="max-w-5xl mx-auto px-6 pt-8 space-y-6">

        {/* ── KPI principales ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={<Scale className="w-5 h-5 text-violet-500" />}
            label="Poids"
            value={latest?.poids != null ? `${latest.poids} kg` : '—'}
            trend={trendIcon(latest?.poids, prev?.poids, true)}
            goal={goals.objectifPoids ? `cible ${goals.objectifPoids} kg` : undefined}
            color="violet"
          />
          <KpiCard
            icon={<Flame className="w-5 h-5 text-orange-500" />}
            label="Calories moy. / semaine"
            value={stats?.weekAvg.calories != null ? `${stats.weekAvg.calories} kcal` : '—'}
            trend={trendIcon(stats?.weekAvg.calories ?? undefined, undefined)}
            goal={goals.objectifCalories ? `objectif ${goals.objectifCalories} kcal` : undefined}
            color="orange"
            progress={
              goals.objectifCalories && stats?.weekAvg.calories != null
                ? pct(stats.weekAvg.calories, goals.objectifCalories)
                : undefined
            }
          />
          <KpiCard
            icon={<Beef className="w-5 h-5 text-red-500" />}
            label="Protéines moy."
            value={stats?.weekAvg.proteines != null ? `${stats.weekAvg.proteines} g` : '—'}
            goal={goals.objectifProteines ? `objectif ${goals.objectifProteines} g` : undefined}
            color="red"
            progress={
              goals.objectifProteines && stats?.weekAvg.proteines != null
                ? pct(stats.weekAvg.proteines, goals.objectifProteines)
                : undefined
            }
          />
          <KpiCard
            icon={<Droplets className="w-5 h-5 text-blue-500" />}
            label="Eau moy."
            value={stats?.weekAvg.eau != null ? `${stats.weekAvg.eau} L` : '—'}
            goal={goals.objectifEau ? `objectif ${goals.objectifEau} L` : undefined}
            color="blue"
            progress={
              goals.objectifEau && stats?.weekAvg.eau != null
                ? pct(stats.weekAvg.eau, goals.objectifEau)
                : undefined
            }
          />
        </div>

        {/* ── Métriques secondaires ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Streak */}
          <div className={`rounded-2xl p-4 border transition-colors ${
            streak >= 7 ? 'bg-orange-50 border-orange-200'
            : streak >= 3 ? 'bg-amber-50 border-amber-200'
            : 'bg-background border-border'
          }`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
              streak >= 7 ? 'bg-orange-100' : streak >= 3 ? 'bg-amber-100' : 'bg-muted'
            }`}>
              <Zap className={`w-5 h-5 ${
                streak >= 7 ? 'text-orange-500' : streak >= 3 ? 'text-amber-500' : 'text-muted-foreground/40'
              }`} />
            </div>
            <p className={`font-display text-2xl leading-tight ${streak > 0 ? 'text-foreground' : 'text-muted-foreground/30'}`}>
              {streak}{' '}
              <span className="font-body text-sm font-normal text-muted-foreground">
                {streak !== 1 ? 'jours' : 'jour'}
              </span>
            </p>
            <p className="font-body text-xs text-muted-foreground mt-0.5">Jours consécutifs</p>
          </div>

          {/* Entrées semaine */}
          <div className="rounded-2xl p-4 border border-border bg-background">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center mb-3">
              <Target className="w-5 h-5 text-green-500" />
            </div>
            <p className="font-display text-2xl text-foreground leading-tight">
              {stats?.entreesSemaine ?? 0}
              <span className="font-body text-sm font-normal text-muted-foreground">/7</span>
            </p>
            <p className="font-body text-xs text-muted-foreground mt-0.5">Entrées cette semaine</p>
            <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${((stats?.entreesSemaine ?? 0) / 7) * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full rounded-full bg-green-400"
              />
            </div>
          </div>

          {/* Total 30j */}
          <div className="rounded-2xl p-4 border border-border bg-background">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
              <Activity className="w-5 h-5 text-violet-500" />
            </div>
            <p className="font-display text-2xl text-foreground leading-tight">{entries.length}</p>
            <p className="font-body text-xs text-muted-foreground mt-0.5">Entrées (30 jours)</p>
          </div>

          {/* Aujourd'hui */}
          <div className={`rounded-2xl p-4 border transition-colors ${
            todayDone ? 'bg-green-50 border-green-200' : 'bg-background border-border'
          }`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
              todayDone ? 'bg-green-100' : 'bg-muted'
            }`}>
              <CheckCircle2 className={`w-5 h-5 ${todayDone ? 'text-green-500' : 'text-muted-foreground/30'}`} />
            </div>
            <p className={`font-display text-2xl leading-tight ${todayDone ? 'text-green-700' : 'text-muted-foreground/30'}`}>
              {todayDone ? 'Fait' : 'À faire'}
            </p>
            <p className="font-body text-xs text-muted-foreground mt-0.5">Entrée aujourd'hui</p>
          </div>
        </div>

        {/* ── Objectifs du jour ── */}
        {(goals.objectifCalories || goals.objectifProteines || goals.objectifGlucides || goals.objectifLipides || goals.objectifEau) && (
          <div className="bg-background border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl text-foreground">Objectifs du jour</h2>
              {!todayDone && (
                <button
                  onClick={() => { setShowForm(true); setShowGoals(false); }}
                  className="inline-flex items-center gap-1.5 font-body text-xs uppercase tracking-[0.1em] px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-lg"
                >
                  <Plus className="w-3 h-3" />
                  Enregistrer l'entrée du jour
                </button>
              )}
            </div>
            <div className="space-y-4">
              {[
                { label: 'Calories',  value: latest?.calories,  goal: goals.objectifCalories,  unit: 'kcal', color: 'bg-orange-400' },
                { label: 'Protéines', value: latest?.proteines, goal: goals.objectifProteines, unit: 'g',    color: 'bg-red-400' },
                { label: 'Glucides',  value: latest?.glucides,  goal: goals.objectifGlucides,  unit: 'g',    color: 'bg-amber-400' },
                { label: 'Lipides',   value: latest?.lipides,   goal: goals.objectifLipides,   unit: 'g',    color: 'bg-yellow-400' },
                { label: 'Eau',       value: latest?.eau,       goal: goals.objectifEau,       unit: 'L',    color: 'bg-blue-400' },
              ].filter(row => row.goal).map(row => {
                const p = pct(row.value, row.goal);
                return (
                  <div key={row.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-body text-sm text-foreground">{row.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-body text-sm text-muted-foreground tabular-nums">
                          {row.value != null ? row.value : '—'} / {row.goal} {row.unit}
                        </span>
                        {row.value != null && (
                          <span className={`font-body text-[11px] px-2 py-0.5 rounded-full tabular-nums ${
                            p >= 100 ? 'bg-green-50 text-green-600'
                            : p >= 75  ? 'bg-blue-50 text-blue-600'
                            : p >= 50  ? 'bg-amber-50 text-amber-600'
                            :            'bg-muted text-muted-foreground'
                          }`}>
                            {p}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${p}%` }}
                        transition={{ duration: 0.7, ease: 'easeOut' }}
                        className={`h-full rounded-full ${row.color}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Outils de suivi ── */}
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-2xl text-foreground">Outils de suivi</h2>
            <p className="font-body text-xs text-muted-foreground mt-0.5 uppercase tracking-wider">Évolution semaine par semaine</p>
          </div>

          {/* Poids — AreaChart full width */}
          <div className="bg-background border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
                  <Scale className="w-4 h-4 text-violet-500" />
                </div>
                <div>
                  <h3 className="font-display text-lg text-foreground leading-tight">Évolution du poids</h3>
                  <p className="font-body text-[11px] text-muted-foreground">Moyenne par semaine (kg)</p>
                </div>
              </div>
              {goals.objectifPoids && (
                <span className="font-body text-xs px-2.5 py-1 bg-green-50 text-green-700 rounded-full border border-green-100">
                  Cible : {goals.objectifPoids} kg
                </span>
              )}
            </div>
            {weeklyChartData.filter(w => w.poids != null).length >= 2 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={weeklyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="semaine" tick={{ fontSize: 11, fontFamily: 'var(--font-body)' }} />
                  <YAxis tick={{ fontSize: 11, fontFamily: 'var(--font-body)' }} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ fontFamily: 'var(--font-body)', fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                    formatter={(v: number) => [`${v} kg`, 'Poids moy.']}
                  />
                  {goals.objectifPoids && (
                    <ReferenceLine
                      y={goals.objectifPoids} stroke="#10b981" strokeDasharray="5 4" strokeWidth={1.5}
                      label={{ value: `Cible ${goals.objectifPoids} kg`, position: 'insideTopRight', fontSize: 10, fill: '#10b981', fontFamily: 'var(--font-body)' }}
                    />
                  )}
                  <Area
                    type="monotone" dataKey="poids" stroke="hsl(var(--primary))" strokeWidth={2.5}
                    fill="url(#weightGrad)" dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    activeDot={{ r: 6 }} connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart
                label="Enregistrez votre poids sur au moins 2 semaines pour voir l'évolution"
                onAction={!showForm ? () => { setShowForm(true); setShowGoals(false); } : undefined}
                actionLabel="Ajouter l'entrée du jour"
              />
            )}
          </div>

          {/* Calories + Macros — 2 colonnes */}
          <div className="grid md:grid-cols-2 gap-4">

            {/* Calories par semaine */}
            <div className="bg-background border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
                  <Flame className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <h3 className="font-display text-lg text-foreground leading-tight">Calories</h3>
                  <p className="font-body text-[11px] text-muted-foreground">Moy. hebdomadaire (kcal)</p>
                </div>
              </div>
              {weeklyChartData.filter(w => w.calories != null).length >= 2 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="semaine" tick={{ fontSize: 10, fontFamily: 'var(--font-body)' }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-body)' }} domain={[0, 'auto']} />
                    <Tooltip
                      contentStyle={{ fontFamily: 'var(--font-body)', fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                      formatter={(v: number) => [`${v} kcal`, 'Calories moy.']}
                    />
                    {goals.objectifCalories && (
                      <ReferenceLine
                        y={goals.objectifCalories} stroke="#f97316" strokeDasharray="5 4" strokeWidth={1.5}
                        label={{ value: `Objectif ${goals.objectifCalories}`, position: 'insideTopRight', fontSize: 10, fill: '#f97316', fontFamily: 'var(--font-body)' }}
                      />
                    )}
                    <Bar dataKey="calories" name="Calories" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart
                  label="Enregistrez vos calories sur 2 semaines pour voir la progression"
                  onAction={!showForm ? () => { setShowForm(true); setShowGoals(false); } : undefined}
                  actionLabel="Ajouter l'entrée du jour"
                />
              )}
            </div>

            {/* Macronutriments par semaine */}
            <div className="bg-background border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                  <Beef className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <h3 className="font-display text-lg text-foreground leading-tight">Macronutriments</h3>
                  <p className="font-body text-[11px] text-muted-foreground">Moy. hebdomadaire (g)</p>
                </div>
              </div>
              {weeklyChartData.filter(w => w.proteines != null || w.glucides != null || w.lipides != null).length >= 2 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="semaine" tick={{ fontSize: 10, fontFamily: 'var(--font-body)' }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-body)' }} domain={[0, 'auto']} />
                    <Tooltip
                      contentStyle={{ fontFamily: 'var(--font-body)', fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                      formatter={(v: number, name: string) => [`${v} g`, name]}
                    />
                    <Legend wrapperStyle={{ fontFamily: 'var(--font-body)', fontSize: 11, paddingTop: 8 }} />
                    {goals.objectifProteines && (
                      <ReferenceLine y={goals.objectifProteines} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />
                    )}
                    {goals.objectifGlucides && (
                      <ReferenceLine y={goals.objectifGlucides} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} />
                    )}
                    <Bar dataKey="proteines" name="Protéines" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="glucides"  name="Glucides"  fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="lipides"   name="Lipides"   fill="#eab308" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart
                  label="Enregistrez vos macros sur 2 semaines pour voir la répartition"
                  onAction={!showForm ? () => { setShowForm(true); setShowGoals(false); } : undefined}
                  actionLabel="Ajouter l'entrée du jour"
                />
              )}
            </div>
          </div>

          {/* Hydratation — AreaChart pleine largeur */}
          <div className="bg-background border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Droplets className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-display text-lg text-foreground leading-tight">Hydratation</h3>
                  <p className="font-body text-[11px] text-muted-foreground">Consommation d'eau moy. (L/j)</p>
                </div>
              </div>
              {goals.objectifEau && (
                <span className="font-body text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                  Objectif : {goals.objectifEau} L
                </span>
              )}
            </div>
            {weeklyChartData.filter(w => w.eau != null).length >= 2 ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={weeklyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eauGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="semaine" tick={{ fontSize: 10, fontFamily: 'var(--font-body)' }} />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-body)' }} domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{ fontFamily: 'var(--font-body)', fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                    formatter={(v: number) => [`${v} L`, 'Eau moy.']}
                  />
                  {goals.objectifEau && (
                    <ReferenceLine
                      y={goals.objectifEau} stroke="#3b82f6" strokeDasharray="5 4" strokeWidth={1.5}
                      label={{ value: `Objectif ${goals.objectifEau} L`, position: 'insideTopRight', fontSize: 10, fill: '#3b82f6', fontFamily: 'var(--font-body)' }}
                    />
                  )}
                  <Area
                    type="monotone" dataKey="eau" stroke="#3b82f6" strokeWidth={2}
                    fill="url(#eauGrad)" dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart
                label="Enregistrez votre hydratation sur 2 semaines pour voir la progression"
                onAction={!showForm ? () => { setShowForm(true); setShowGoals(false); } : undefined}
                actionLabel="Ajouter l'entrée du jour"
              />
            )}
          </div>
        </div>

        {/* ── Historique ── */}
        <div className="bg-background border border-border rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="w-full flex items-center justify-between p-5 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl text-foreground">Historique complet</h2>
              {entries.length > 0 && (
                <span className="font-body text-xs px-2.5 py-0.5 bg-muted rounded-full text-muted-foreground">
                  {entries.length} entr{entries.length > 1 ? 'ées' : 'ée'}
                </span>
              )}
            </div>
            <motion.div animate={{ rotate: showHistory ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            </motion.div>
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {entries.length === 0 ? (
                  <div className="flex flex-col items-center py-12 px-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                      <Activity className="w-6 h-6 text-muted-foreground/30" />
                    </div>
                    <p className="font-body text-sm text-muted-foreground mb-4">
                      Aucune entrée pour les 30 derniers jours.
                    </p>
                    <button
                      onClick={() => { setShowForm(true); setShowHistory(false); }}
                      className="font-body text-xs text-primary hover:underline transition-colors"
                    >
                      Créer ma première entrée
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full text-sm font-body">
                      <thead>
                        <tr className="bg-muted/30">
                          {['Date', 'Poids', 'Calories', 'Protéines', 'Glucides', 'Lipides', 'Eau', ''].map((h, i) => (
                            <th
                              key={i}
                              className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-normal whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[...entries].reverse().map(e => {
                          const today = isEntryToday(e);
                          return (
                            <tr
                              key={e._id}
                              className={`group transition-colors ${today ? 'bg-primary/3 hover:bg-primary/5' : 'hover:bg-muted/20'}`}
                            >
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`font-body text-sm ${today ? 'text-primary font-semibold' : 'text-foreground'}`}>
                                  {formatDate(e.date)}
                                </span>
                                {today && (
                                  <span className="ml-2 font-body text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">
                                    Aujourd'hui
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground tabular-nums">
                                {e.poids != null ? `${e.poids} kg` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground tabular-nums">
                                {e.calories != null ? `${e.calories} kcal` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground tabular-nums">
                                {e.proteines != null ? `${e.proteines} g` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground tabular-nums">
                                {e.glucides != null ? `${e.glucides} g` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground tabular-nums">
                                {e.lipides != null ? `${e.lipides} g` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground tabular-nums">
                                {e.eau != null ? `${e.eau} L` : <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleDelete(e._id)}
                                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all"
                                  title="Supprimer cette entrée"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── CTA consultation ── */}
        <div className="relative overflow-hidden rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-br from-green-600 to-green-700">
          <div className="absolute inset-0 pointer-events-none opacity-10">
            <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white" />
            <div className="absolute right-12 bottom-0 w-20 h-20 rounded-full bg-white" />
          </div>
          <div className="relative">
            <h3 className="font-display text-xl text-white mb-1">Besoin d'un accompagnement ?</h3>
            <p className="font-body text-sm text-green-100 leading-relaxed max-w-sm">
              Nos diététiciens analysent vos données et créent un plan alimentaire sur mesure.
            </p>
          </div>
          <Link
            to="/dieteticien"
            className="relative shrink-0 font-body text-sm uppercase tracking-[0.15em] px-6 py-3 bg-white text-green-700 hover:bg-green-50 transition-colors rounded-xl font-semibold"
          >
            Réserver une consultation
          </Link>
        </div>

      </div>
    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, trend, goal, color, progress,
}: {
  icon: React.ReactNode; label: string; value: string;
  trend?: React.ReactNode; goal?: string; color: string;
  progress?: number;
}) {
  const rings: Record<string, string> = {
    violet: 'bg-violet-50',
    orange: 'bg-orange-50',
    red:    'bg-red-50',
    blue:   'bg-blue-50',
    green:  'bg-green-50',
  };
  const bars: Record<string, string> = {
    violet: 'bg-violet-500',
    orange: 'bg-orange-400',
    red:    'bg-red-400',
    blue:   'bg-blue-400',
    green:  'bg-green-500',
  };
  return (
    <div className="rounded-2xl p-4 border border-border bg-background hover:border-primary/20 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between mb-2.5">
        <div className={`w-9 h-9 rounded-xl ${rings[color] ?? 'bg-muted'} flex items-center justify-center`}>
          {icon}
        </div>
        {trend}
      </div>
      <p className="font-display text-2xl text-foreground leading-tight">{value}</p>
      <p className="font-body text-xs text-muted-foreground mt-0.5">{label}</p>
      {goal && <p className="font-body text-[10px] text-muted-foreground/60 mt-1">{goal}</p>}
      {progress != null && (
        <div className="mt-2.5 w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className={`h-full rounded-full ${bars[color] ?? 'bg-primary'}`}
          />
        </div>
      )}
    </div>
  );
}

function EmptyChart({
  label, onAction, actionLabel,
}: {
  label: string; onAction?: () => void; actionLabel?: string;
}) {
  return (
    <div className="h-[200px] flex flex-col items-center justify-center gap-3">
      <p className="font-body text-sm text-muted-foreground text-center max-w-xs leading-relaxed">{label}</p>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 font-body text-xs uppercase tracking-[0.12em] px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl"
        >
          <Plus className="w-3.5 h-3.5" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
