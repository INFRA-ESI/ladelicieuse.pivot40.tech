import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X, Star, ChevronUp, ChevronDown } from '@/components/icons';
import { adminGet, adminPatch } from '@/services/adminApiService';
import { canMove, moveRow } from '@/lib/displayOrder';

interface Row {
  _id: string;
  nom: string;
  epinglee?: boolean;
  actif?: boolean;
  disponible?: boolean;
}

interface Props {
  title: string;
  /** Ce que l'équipe règle ici, dit en une phrase (ex. « ordre dans le composeur »). */
  hint: string;
  /** Ressource à régler : ses routes /order, /reorder et /:id/pin. */
  basePath: '/ingredients' | '/meals';
  categories: string[];
  initialCategory?: string;
  onClose: () => void;
}

// Réglage de l'ordre d'affichage d'UNE catégorie : « le meilleur » épinglé en première position, puis monter / descendre.
// Même fonctionnement que les suggestions du chef. L'ordre est enregistré à chaque geste et visible tout de suite côté client.
export default function DisplayOrderModal({ title, hint, basePath, categories, initialCategory, onClose }: Props) {
  const [categorie, setCategorie] = useState(initialCategory && categories.includes(initialCategory) ? initialCategory : categories[0] ?? '');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (cat: string) => {
    const res = await adminGet<{ data: Row[] }>(`${basePath}/order?categorie=${encodeURIComponent(cat)}`, { ttl: 0 });
    setRows(res.data);
  }, [basePath]);

  useEffect(() => {
    if (!categorie) { setLoading(false); return; }
    let mounted = true;
    setLoading(true);
    load(categorie)
      .catch(() => { if (mounted) toast.error('Impossible de charger cette catégorie'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [categorie, load]);

  const togglePin = async (row: Row) => {
    if (busy) return;
    setBusy(true);
    try {
      await adminPatch(`${basePath}/${row._id}/pin`, { epinglee: !row.epinglee });
      await load(categorie);
      toast.success(row.epinglee ? `${row.nom} n'est plus épinglé` : `${row.nom} est en première position`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur mise à jour');
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (busy) return;
    const next = moveRow(rows, index, direction);
    if (!next) return;
    const previous = rows;
    setRows(next);
    setBusy(true);
    try {
      await adminPatch(`${basePath}/reorder`, { categorie, ids: next.map(r => r._id) });
      await load(categorie);
    } catch (e: unknown) {
      setRows(previous);
      toast.error(e instanceof Error ? e.message : 'Ordre non enregistré');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/60 sm:px-4 sm:py-8" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className="bg-background w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-t-xl sm:rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border">
          <h3 className="font-display text-lg text-foreground">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
          <p className="font-body text-xs text-muted-foreground">{hint}</p>
          <label className="block">
            <span className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">Catégorie</span>
            <select
              value={categorie} onChange={e => setCategorie(e.target.value)} disabled={busy}
              className="w-full h-11 px-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          {loading ? (
            <div className="space-y-2" aria-hidden="true">{[0, 1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground py-6 text-center">Rien dans cette catégorie pour le moment.</p>
          ) : (
            <ol className="space-y-2">
              {rows.map((row, index) => {
                const hidden = row.actif === false || row.disponible === false;
                return (
                  <li key={row._id} className={`flex items-center gap-2 border px-3 min-h-12 ${row.epinglee ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <span className="font-body text-xs text-muted-foreground w-5 tabular-nums">{index + 1}</span>
                    <span className="flex-1 min-w-0 font-body text-sm text-foreground truncate">
                      {row.nom}
                      {hidden && <span className="ml-2 text-[11px] text-muted-foreground">masqué</span>}
                    </span>
                    <button
                      type="button" onClick={() => togglePin(row)} disabled={busy}
                      aria-pressed={!!row.epinglee} aria-label={`${row.epinglee ? 'Retirer de la première position' : 'Épingler en première position'} : ${row.nom}`}
                      title={row.epinglee ? 'Retirer de la première position' : 'Épingler en première position'}
                      className={`min-h-11 min-w-11 flex items-center justify-center border transition-colors disabled:opacity-50 ${row.epinglee ? 'border-primary text-primary bg-primary/10' : 'border-border text-foreground hover:bg-muted'}`}
                    >
                      <Star className="w-4 h-4" />
                    </button>
                    <button
                      type="button" onClick={() => move(index, -1)} disabled={busy || !canMove(rows, index, -1)}
                      aria-label={`Monter ${row.nom}`} title="Monter d'un cran"
                      className="min-h-11 min-w-11 flex items-center justify-center border border-border text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button" onClick={() => move(index, 1)} disabled={busy || !canMove(rows, index, 1)}
                      aria-label={`Descendre ${row.nom}`} title="Descendre d'un cran"
                      className="min-h-11 min-w-11 flex items-center justify-center border border-border text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
