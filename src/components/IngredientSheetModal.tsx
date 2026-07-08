import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useEffect } from 'react';
import { type Ingredient, formatPrice } from '@/data/products';

const DV = { proteines: 50, glucides: 275, lipides: 78, fibres: 28 };
const pct = (val: number, ref: number) => Math.min(100, Math.round((val / ref) * 100));

const MACRO_BARS = [
  { key: 'proteines', label: 'Protéines', unit: 'g', color: 'bg-blue-500',   ref: DV.proteines },
  { key: 'glucides',  label: 'Glucides',  unit: 'g', color: 'bg-yellow-500', ref: DV.glucides },
  { key: 'lipides',   label: 'Lipides',   unit: 'g', color: 'bg-red-400',    ref: DV.lipides },
  { key: 'fibres',    label: 'Fibres',    unit: 'g', color: 'bg-green-500',  ref: DV.fibres },
] as const;

// Les ingrédients du salad bar ont des valeurs nutrition via caloriesPerPortion
// et portionGrams. Les macros (si disponibles) sont dans l'objet étendu.
interface ExtendedIngredient extends Ingredient {
  nutrition?: { proteines?: number; glucides?: number; lipides?: number; fibres?: number };
}

interface Props {
  ingredient: Ingredient | null;
  onClose: () => void;
}

export default function IngredientSheetModal({ ingredient, onClose }: Props) {
  const ing = ingredient as ExtendedIngredient | null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (ingredient) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [ingredient]);

  return (
    <AnimatePresence>
      {ing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="bg-background w-full sm:rounded-2xl sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-border/50"
            onClick={e => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <span className="font-body text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Fiche ingrédient
              </span>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                aria-label="Fermer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {/* Image */}
              {ing.image && (
                <div className="h-52 overflow-hidden bg-muted">
                  <img src={ing.image} alt={ing.name} className="w-full h-full object-cover" />
                </div>
              )}

              {/* Infos principales */}
              <div className="px-5 pt-4 pb-3 space-y-3">
                <div>
                  <span className="font-body text-[10px] uppercase tracking-[0.22em] text-primary">{ing.category}</span>
                  <h2 className="font-display text-2xl text-foreground mt-0.5">{ing.name}</h2>
                </div>

                {/* Prix + grammage */}
                <div className="flex flex-wrap gap-2">
                  <span className="font-display text-xl text-primary">{formatPrice(ing.pricePerPortion)}</span>
                  {ing.portionGrams > 0 && (
                    <span className="font-body text-xs px-2.5 py-1.5 bg-muted rounded-lg self-center">
                      <strong>{ing.portionGrams}</strong> g / portion
                    </span>
                  )}
                  <span className="font-body text-xs px-2.5 py-1.5 bg-muted rounded-lg self-center">
                    <strong>{ing.caloriesPerPortion}</strong> kcal
                  </span>
                </div>

                {/* Bienfaits si présents */}
                {ing.benefits && (
                  <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="font-body text-sm text-emerald-900 leading-snug">{ing.benefits}</span>
                  </div>
                )}
              </div>

              {/* Valeurs nutritionnelles */}
              <div className="px-5 py-4 border-t border-border">
                <h3 className="font-display text-base text-foreground mb-1">Valeurs nutritionnelles</h3>
                <p className="font-body text-[11px] text-muted-foreground mb-3">Pour une portion · % apports journaliers de référence</p>

                <div className="flex items-center justify-between bg-primary/5 rounded-xl px-4 py-3 mb-3 border border-primary/10">
                  <span className="font-body text-sm text-foreground">Énergie</span>
                  <span className="font-display text-2xl text-primary">
                    {ing.caloriesPerPortion} <span className="text-sm font-body">kcal</span>
                  </span>
                </div>

                {ing.nutrition && (
                  <div className="space-y-2">
                    {MACRO_BARS.map(m => {
                      const val = (ing.nutrition as Record<string, number | undefined>)[m.key] ?? 0;
                      if (val === 0) return null;
                      const p = pct(val, m.ref);
                      return (
                        <div key={m.key} className="flex items-center gap-3">
                          <span className="font-body text-xs text-foreground w-20 shrink-0">{m.label}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${m.color}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${p}%` }}
                              transition={{ duration: 0.5, ease: 'easeOut' }}
                            />
                          </div>
                          <span className="font-body text-xs font-semibold w-10 text-right tabular-nums">{val}{m.unit}</span>
                          <span className="font-body text-[10px] text-muted-foreground w-7 text-right tabular-nums">{p}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-2" />
            </div>

            {/* Pied fixe */}
            <div className="shrink-0 border-t border-border bg-background px-5 py-4">
              <button
                onClick={onClose}
                className="w-full py-3 border border-border rounded-xl font-body text-sm text-foreground hover:bg-muted transition-colors"
              >
                Fermer
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
