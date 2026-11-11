import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarDays, Check, Copy, Loader2, X } from '@/components/icons';
import { adminGet, adminPost } from '@/services/adminApiService';

// Réutiliser un menu du jour : le contenu est COPIÉ vers chaque date (nouvelles fiches de repas). Chaque date a ensuite son
// propre menu, modifiable et publiable séparément : modifier le menu d'un jour ne touche jamais celui d'un autre.

interface ScheduleRow { date: string; meals: number; published: boolean; copiedFrom?: string }
interface DuplicateResult {
  created: { date: string; meals: number; published: boolean }[];
  replaced: { date: string; meals: number; published: boolean }[];
  skipped: { date: string; reason: string }[];
  failed: { date: string; reason: string }[];
}

type Direction = 'to-others' | 'from-other';

const pad = (n: number) => String(n).padStart(2, '0');
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return toDay(d); };
const long = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

const field = 'h-10 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary';
const btn = 'min-h-10 px-4 rounded-md font-body text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

export default function ReuseMenuDialog({ date, mealsCount, onClose, onDone }: {
  /** Date affichée dans le back-office. */
  date: string;
  /** Nombre de repas de cette date. */
  mealsCount: number;
  onClose: () => void;
  /** Appelé après une copie réussie, pour recharger la page. */
  onDone: () => void;
}) {
  const today = useMemo(() => toDay(new Date()), []);
  const [direction, setDirection] = useState<Direction>(mealsCount > 0 ? 'to-others' : 'from-other');
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [pending, setPending] = useState('');
  const [sourceDay, setSourceDay] = useState('');
  const [publish, setPublish] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DuplicateResult | null>(null);

  useEffect(() => {
    adminGet<{ data: ScheduleRow[] }>(`/menu/admin/schedule?from=${shift(today, -90)}&to=${shift(today, 120)}`, { ttl: 0 })
      .then(res => setSchedule(res.data))
      .catch(() => { setSchedule([]); toast.error('Calendrier des menus indisponible'); });
  }, [today]);

  const byDate = useMemo(() => new Map((schedule ?? []).map(r => [r.date, r])), [schedule]);
  const sources = useMemo(() => (schedule ?? []).filter(r => r.meals > 0 && r.date !== date).sort((a, b) => b.date.localeCompare(a.date)), [schedule, date]);

  const effectiveSource = direction === 'to-others' ? date : sourceDay;
  const effectiveTargets = direction === 'to-others' ? targets : [date];
  const conflicts = effectiveTargets.filter(t => (byDate.get(t)?.meals ?? 0) > 0 || byDate.has(t));
  const canSubmit = !busy && !!effectiveSource && effectiveTargets.length > 0 && (direction === 'from-other' || mealsCount > 0);

  const addTarget = (day: string) => {
    if (!day) return;
    if (day < today) { toast.error('Cette date est déjà passée'); return; }
    if (day === date) { toast.error('C\'est la date du menu à copier'); return; }
    setTargets(prev => (prev.includes(day) ? prev : [...prev, day].sort()));
    setPending('');
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await adminPost<{ data: DuplicateResult }>('/menu/duplicate', {
        source: effectiveSource,
        targets: effectiveTargets,
        onConflict: replace ? 'replace' : 'skip',
        // Sans choix de publication, une date remplacée garde son état ; avec la case cochée, les menus copiés sont publiés.
        ...(publish ? { published: true } : {}),
      });
      setResult(res.data);
      if (res.data.created.length + res.data.replaced.length > 0) onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'La copie a échoué');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4" role="dialog" aria-modal="true" aria-labelledby="reuse-title"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div>
            <h3 id="reuse-title" className="font-display text-xl text-foreground">Réutiliser un menu</h3>
            <p className="font-body text-sm text-muted-foreground mt-0.5">
              Chaque date reçoit sa propre copie : modifier l'une ne modifie jamais les autres.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-2 -m-2 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            {[...result.created.map(r => ({ ...r, label: 'copié' })), ...result.replaced.map(r => ({ ...r, label: 'remplacé' }))].map(r => (
              <p key={r.date} className="flex items-center gap-2 font-body text-sm text-foreground">
                <Check className="w-4 h-4 text-primary shrink-0" />
                <span className="capitalize">{long(r.date)}</span> : {r.meals} repas {r.label}, {r.published ? 'publié' : 'en brouillon'}
              </p>
            ))}
            {result.skipped.map(r => (
              <p key={r.date} className="flex items-center gap-2 font-body text-sm text-muted-foreground">
                <AlertTriangle className="w-4 h-4 shrink-0" /><span className="capitalize">{long(r.date)}</span> : ignoré. {r.reason}
              </p>
            ))}
            {result.failed.map(r => (
              <p key={r.date} role="alert" className="flex items-center gap-2 font-body text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" /><span className="capitalize">{long(r.date)}</span> : {r.reason}
              </p>
            ))}
            <div className="flex justify-end pt-2">
              <button type="button" onClick={onClose} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>Terminé</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div role="radiogroup" aria-label="Sens de la copie" className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-md">
              {([['to-others', 'Copier ce menu vers d\'autres dates'], ['from-other', 'Copier un autre menu ici']] as const).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={direction === value} onClick={() => setDirection(value)}
                  className={`min-h-10 px-3 rounded-md font-body text-sm text-left sm:text-center transition-colors ${direction === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>

            {direction === 'to-others' ? (
              <div className="space-y-3">
                {mealsCount === 0 ? (
                  <p className="font-body text-sm text-muted-foreground">Ce jour n'a pas encore de repas : ajoutez-en d'abord, ou copiez un autre menu ici.</p>
                ) : (
                  <p className="font-body text-sm text-foreground">
                    Menu à copier : <span className="capitalize font-medium">{long(date)}</span>, {mealsCount} repas.
                  </p>
                )}
                <div>
                  <label htmlFor="reuse-day" className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Dates de destination</label>
                  <div className="flex flex-wrap gap-2">
                    <input id="reuse-day" type="date" min={today} value={pending} onChange={e => setPending(e.target.value)} className={`${field} flex-1 min-w-40`} />
                    <button type="button" onClick={() => addTarget(pending)} disabled={!pending} className={`${btn} border border-border text-foreground hover:bg-muted`}>Ajouter</button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button type="button" onClick={() => addTarget(shift(today, 1))} className="font-body text-xs text-primary hover:underline">Demain</button>
                    <button type="button" onClick={() => addTarget(shift(date, 7))} className="font-body text-xs text-primary hover:underline">Même jour, semaine suivante</button>
                  </div>
                </div>
                {targets.length > 0 && (
                  <ul className="space-y-1.5">
                    {targets.map(t => {
                      const row = byDate.get(t);
                      return (
                        <li key={t} className="flex items-center justify-between gap-3 bg-muted/60 px-3 py-2 rounded-md">
                          <span className="font-body text-sm text-foreground capitalize">{long(t)}</span>
                          <span className="flex items-center gap-3">
                            <span className={`font-body text-xs ${row ? 'text-amber-700' : 'text-muted-foreground'}`}>
                              {row ? `Menu existant (${row.meals} repas${row.published ? ', publié' : ''})` : 'Libre'}
                            </span>
                            <button type="button" aria-label={`Retirer le ${long(t)}`} onClick={() => setTargets(prev => prev.filter(x => x !== t))} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="font-body text-sm text-foreground">
                  Destination : <span className="capitalize font-medium">{long(date)}</span>
                  {(byDate.get(date)?.meals ?? 0) > 0 && <span className="text-amber-700"> (a déjà {byDate.get(date)!.meals} repas)</span>}
                </p>
                <div>
                  <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-2">Menu à copier</p>
                  {schedule === null ? (
                    <p className="font-body text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Chargement</p>
                  ) : sources.length === 0 ? (
                    <p className="font-body text-sm text-muted-foreground">Aucun autre menu à copier pour le moment.</p>
                  ) : (
                    <ul role="radiogroup" aria-label="Menu à copier" className="max-h-56 overflow-y-auto border border-border rounded-md divide-y divide-border">
                      {sources.map(s => (
                        <li key={s.date}>
                          <button type="button" role="radio" aria-checked={sourceDay === s.date} onClick={() => setSourceDay(s.date)}
                            className={`w-full min-h-11 flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${sourceDay === s.date ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                            <span className="font-body text-sm text-foreground capitalize">{long(s.date)}</span>
                            <span className="font-body text-xs text-muted-foreground shrink-0">{s.meals} repas{s.published ? ', publié' : ''}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3 border-t border-border pt-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} className="mt-1 w-4 h-4 accent-primary" />
                <span className="font-body text-sm text-foreground">
                  Publier les menus copiés
                  <span className="block text-xs text-muted-foreground">Un menu publié s'affiche sur le site le jour même. Sinon il reste en brouillon, à publier plus tard.</span>
                </span>
              </label>

              {conflicts.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-md space-y-2">
                  <p className="font-body text-sm text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    {conflicts.length === 1 ? 'Un menu existe déjà à cette date.' : `${conflicts.length} dates ont déjà un menu.`}
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} className="mt-1 w-4 h-4 accent-primary" />
                    <span className="font-body text-sm text-amber-900">
                      Remplacer les menus existants
                      <span className="block text-xs text-amber-800">Leurs repas actuels sont supprimés. Sans cette case, ces dates sont ignorées et rien n'est modifié.</span>
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button type="button" onClick={onClose} disabled={busy} className={`${btn} border border-border text-foreground hover:bg-muted`}>Annuler</button>
              <button type="button" onClick={submit} disabled={!canSubmit} className={`${btn} ${replace && conflicts.length > 0 ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : replace && conflicts.length > 0 ? <CalendarDays className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {replace && conflicts.length > 0 ? 'Remplacer et copier' : 'Copier le menu'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
