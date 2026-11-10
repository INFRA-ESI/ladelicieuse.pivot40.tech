import { Link } from 'react-router-dom';
import { Check, AlertTriangle } from '@/components/icons';
import { PREFERENCE_LABELS, type PrefKey } from '@/lib/dietary';

// Pastille sur une carte produit : convient, ou la raison pour laquelle ça ne convient pas.
export function DietChip({ active, reasons }: { active: boolean; reasons: string[] }) {
  if (!active) return null;
  if (reasons.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 font-body text-xs px-2 py-1 rounded-md bg-primary/10 text-primary">
        <Check className="w-3 h-3" />Convient à vos préférences
      </span>
    );
  }
  return (
    <span className="inline-flex items-start gap-1 font-body text-xs px-2 py-1 rounded-md bg-amber-50 text-amber-800">
      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />Ne convient pas : {reasons[0]}
    </span>
  );
}

// Bandeau en tête de liste : les préférences actives, combien de produits sont masqués, et de quoi tout réafficher.
export function DietBar({ preferences, hide, onHideChange, hiddenCount }: {
  preferences: PrefKey[]; hide: boolean; onHideChange: (hide: boolean) => void; hiddenCount: number;
}) {
  if (preferences.length === 0) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-background px-5 py-4">
      <p className="font-body text-sm text-foreground">
        <span className="text-muted-foreground">Selon vos préférences : </span>
        {preferences.map(p => PREFERENCE_LABELS[p]).join(', ')}
        <Link to="/mon-compte" className="ml-2 text-xs text-primary hover:underline">Modifier</Link>
      </p>
      <label className="inline-flex items-center gap-2 font-body text-sm text-foreground cursor-pointer select-none">
        <input type="checkbox" checked={hide} onChange={e => onHideChange(e.target.checked)} className="w-4 h-4 accent-primary" />
        Masquer ce qui ne convient pas{hide && hiddenCount > 0 ? ` (${hiddenCount})` : ''}
      </label>
    </div>
  );
}
