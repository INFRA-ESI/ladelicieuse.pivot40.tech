import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/context/CartContext';
import { INGREDIENTS, CATEGORY_LABELS, formatPrice, type Ingredient, type IngredientCategory } from '@/data/products';
import { toast } from 'sonner';
import { FlyingIngredient, type FlyingItem } from '@/components/FlyingIngredient';
import { ChevronRight, ChevronLeft, ShoppingCart, Check, Info } from 'lucide-react';
import { publicFetch } from '@/services/publicApiService';
import { ApiIngredient } from '@/types/api.types';
import { ss } from '@/lib/storage';
import IngredientSheetModal from '@/components/IngredientSheetModal';

type SaladType = 'crudites' | 'fruits';

interface StepConfig {
  key: string;
  label: string;
  categories: IngredientCategory[];
  single: boolean;
  /** Au moins un élément doit être sélectionné dans cette étape pour continuer. */
  required?: boolean;
  hint: string;
}

interface Suggestion {
  name: string;
  description: string;
  base?: string;
  ingredients: string[];
  image?: string;
}

const CRUDITES_STEPS: StepConfig[] = [
  { key: 'base',        label: 'Base',           categories: ['base'],                            single: false, required: true, hint: 'Choisissez une ou plusieurs bases pour votre salade' },
  { key: 'ingredients', label: 'Ingrédients',    categories: ['legume', 'proteine', 'garniture'], single: false, hint: 'Ajoutez légumes, protéines et garnitures' },
  { key: 'sauces',      label: 'Sauces & Finitions', categories: ['sauce'],                       single: false, hint: 'La touche finale qui fait la différence' },
  { key: 'recap',       label: 'Récapitulatif',  categories: [],                                  single: false, hint: 'Votre salade personnalisée' },
];

const FRUITS_STEPS: StepConfig[] = [
  { key: 'fruits',  label: 'Fruits',       categories: ['fruit'],  single: false, required: true, hint: 'Composez votre mélange de fruits' },
  { key: 'recap',   label: 'Récapitulatif',categories: [],         single: false, hint: 'Votre salade de fruits' },
];

const CRUDITES_SUGGESTIONS: Suggestion[] = [
  { name: 'Salade César',  description: 'Laitue, poulet, croûtons, œuf',            base: 'laitue',   ingredients: ['poulet', 'croutons', 'oeuf'] },
  { name: 'Bowl Detox',    description: 'Épinard, avocat, noix, concombre',          base: 'epinard',  ingredients: ['avocat', 'noix', 'concombre'] },
  { name: 'Niçoise',       description: 'Laitue, thon, œuf, olives, tomate',         base: 'laitue',   ingredients: ['thon', 'oeuf', 'olive', 'tomate'] },
  { name: 'Power Bowl',    description: 'Roquette, poulet, œuf, graines',            base: 'roquette', ingredients: ['poulet', 'oeuf', 'graines-tournesol'] },
];

const FRUITS_SUGGESTIONS: Suggestion[] = [
  { name: 'Tropical Mix',  description: 'Mangue, ananas, banane',          ingredients: ['mangue', 'ananas', 'banane'] },
  { name: 'Fruits Rouges', description: 'Fraises, papaye, mangue',          ingredients: ['fraise', 'papaye', 'mangue'] },
  { name: 'Exotique',      description: 'Papaye, mangue, ananas',           ingredients: ['papaye', 'mangue', 'ananas'] },
];

// Normalise la catégorie free-text admin vers IngredientCategory frontend
function normalizeCategory(cat: string): IngredientCategory {
  const c = cat.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
  if (['base','salade','verdure','laitue','roquette','epinard','feuille'].some(k => c.includes(k))) return 'base';
  if (['legume','vegetal','crudite','legum'].some(k => c.includes(k))) return 'legume';
  if (['proteine','protein','viande','poisson','volaille','oeuf','fromage'].some(k => c.includes(k))) return 'proteine';
  if (['garniture','topping','graine','noix','croquant','olive','crouton'].some(k => c.includes(k))) return 'garniture';
  if (['sauce','vinaigrette','dressing','huile','assaisonnement','citron'].some(k => c.includes(k))) return 'sauce';
  if (['fruit','exotique','tropical','baie'].some(k => c.includes(k))) return 'fruit';
  // Correspondance exacte sur les clés valides
  const valid: IngredientCategory[] = ['base','legume','proteine','garniture','sauce','fruit'];
  if (valid.includes(c as IngredientCategory)) return c as IngredientCategory;
  return 'garniture';
}

function apiToIngredient(i: ApiIngredient): Ingredient {
  return {
    id:                String(i._id),
    name:              i.nom,
    category:          normalizeCategory(i.categorie),
    caloriesPer100g:   i.nutrition.calories,
    portionGrams:      100,
    caloriesPerPortion:i.nutrition.calories,
    pricePerPortion:   i.prixVente,
    benefits:          '',
    image:             i.image,
    inStock:           i.stock > 0 && i.actif,
  };
}

// Resolves any ingredient identifier (static ID, MongoDB ObjectId, or ingredient name)
// to the actual ID in the current ingredients list.
// Handles all three data states:
//   1. static IDs + static ingredients (no API) → direct match
//   2. MongoDB ObjectIds + API ingredients (suggestion stored by new admin) → direct match
//   3. static IDs + API ingredients → name-based lookup via INGREDIENTS reference table
//   4. ingredient names + API ingredients (edge case) → direct name match
function resolveIngredientId(idOrName: string, currentIngredients: Ingredient[]): string | null {
  // Step 1: direct ID match (fastest path — works for static AND MongoDB ObjectId cases)
  if (currentIngredients.some(i => i.id === idOrName)) return idOrName;

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const query = norm(idOrName);

  // Step 2: direct name match against current ingredients
  // (handles suggestions that store ingredient names, or fuzzy ObjectId mismatches)
  const nameMatch = currentIngredients.find(i => {
    const n = norm(i.name);
    return n === query || n.startsWith(query) || query.startsWith(n);
  });
  if (nameMatch) return nameMatch.id;

  // Step 3: static ID → name lookup then match against current ingredients
  // (handles static suggestion IDs like 'poulet' when API ingredients are loaded)
  const staticRef = INGREDIENTS.find(i => i.id === idOrName);
  if (!staticRef) return null;
  const refName = norm(staticRef.name);
  const staticMatch = currentIngredients.find(i => {
    const n = norm(i.name);
    return n === refName || n.startsWith(refName) || refName.startsWith(n);
  });
  return staticMatch?.id ?? null;
}

function getSuggestionCover(s: Suggestion, ingredients: Ingredient[]): string {
  if (s.image) return s.image;
  const ids = s.base ? [s.base, ...s.ingredients] : s.ingredients;
  for (const idOrName of ids) {
    const resolvedId = resolveIngredientId(idOrName, ingredients);
    const ing = resolvedId ? ingredients.find(i => i.id === resolvedId) : null;
    if (ing?.image) return ing.image;
  }
  return '';
}

// Petit "pop" animé à chaque changement de valeur — rend le compteur calorique vivant.
function PulseValue({ value, className }: { value: string | number; className?: string }) {
  return (
    <motion.span
      key={String(value)}
      initial={{ scale: 1.45, y: -6 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 14 }}
      className={`inline-block ${className ?? ''}`}
    >
      {value}
    </motion.span>
  );
}

export default function SaladComposerPage() {
  const { type } = useParams<{ type: string }>();
  const saladType = (type === 'crudites' || type === 'fruits' ? type : null) as SaladType | null;

  const { addItem } = useCart();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [step, setStep] = useState(0);
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [slideDir, setSlideDir] = useState(1);
  const [apiSuggestions, setApiSuggestions] = useState<Suggestion[] | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientsLoaded, setIngredientsLoaded] = useState(false);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [sheetIngredient, setSheetIngredient] = useState<Ingredient | null>(null);
  // Empêche la persistance immédiate au montage (avant réhydratation)
  const draftRestoredRef = useRef(false);

  // Clé sessionStorage pour le brouillon en cours
  const draftKey = saladType ? `ld_salade_draft_${saladType}` : null;

  // Charger les ingrédients depuis l'API — démarrer avec tableau vide pour éviter le flash
  useEffect(() => {
    publicFetch<ApiIngredient[]>('/api/ingredients/public')
      .then(data => {
        const list = data && data.length > 0 ? data.map(apiToIngredient) : INGREDIENTS;
        setIngredients(list);
        // Réhydrater le brouillon après chargement des ingrédients
        if (draftKey && !draftRestoredRef.current) {
          try {
            const raw = ss.get(draftKey);
            if (raw) {
              const { entries, step: savedStep } = JSON.parse(raw) as { entries: [string, number][]; step: number };
              const validEntries = entries.filter(([id]) => list.some(i => i.id === id));
              if (validEntries.length > 0) {
                setSelected(new Map(validEntries));
                setStep(savedStep ?? 0);
                toast.info('Votre composition précédente a été restaurée.');
              }
            }
          } catch { /* brouillon corrompu — ignorer */ }
          draftRestoredRef.current = true;
        }
      })
      .catch(() => { setIngredients(INGREDIENTS); draftRestoredRef.current = true; })
      .finally(() => setIngredientsLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persister le brouillon à chaque changement (après réhydratation)
  useEffect(() => {
    if (!draftKey || !draftRestoredRef.current) return;
    if (selected.size === 0) {
      ss.remove(draftKey);
    } else {
      ss.set(draftKey, JSON.stringify({ entries: Array.from(selected.entries()), step }));
    }
  }, [selected, step, draftKey]);

  // Charger les suggestions depuis l'API
  useEffect(() => {
    if (!saladType) return;
    fetch(`/api/suggestions?type=${saladType}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setApiSuggestions(json.data.map((s: { nom: string; description: string; base?: string; ingredients: string[]; image?: string }) => ({
            name:        s.nom,
            description: s.description,
            base:        s.base,
            ingredients: s.ingredients,
            image:       s.image,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setSuggestionsLoaded(true));
  }, [saladType]);

  const steps = saladType === 'crudites' ? CRUDITES_STEPS : FRUITS_STEPS;
  const fallbackSuggestions = saladType === 'crudites' ? CRUDITES_SUGGESTIONS : FRUITS_SUGGESTIONS;
  const suggestions = apiSuggestions ?? fallbackSuggestions;
  const activeSuggestion = suggestions[Math.min(suggestionIdx, suggestions.length - 1)];
  const activeCover = getSuggestionCover(activeSuggestion, ingredients);
  const recapStepIndex = steps.length - 1;
  // Après une suggestion : les crudités passent encore par les sauces, les fruits vont direct au récap.
  const suggestionJumpIndex = saladType === 'crudites' ? steps.length - 2 : recapStepIndex;
  const currentStepConfig = steps[step];

  const removeFlyingItem = useCallback((id: string) => {
    setFlyingItems(prev => prev.filter(f => f.id !== id));
  }, []);

  // Recherche un ingrédient par ID avec re-résolution si l'état ingredients a changé depuis la sélection
  const findIngredient = (id: string): Ingredient | undefined => {
    const direct = ingredients.find(i => i.id === id);
    if (direct) return direct;
    const resolvedId = resolveIngredientId(id, ingredients);
    return resolvedId ? ingredients.find(i => i.id === resolvedId) : undefined;
  };

  const totalCalories = useMemo(() => {
    let cal = 0;
    selected.forEach((qty, id) => {
      const ing = findIngredient(id);
      if (ing) cal += ing.caloriesPerPortion * qty;
    });
    return cal;
  }, [selected, ingredients]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPrice = useMemo(() => {
    let price = 0;
    selected.forEach((qty, id) => {
      const ing = findIngredient(id);
      if (ing) price += ing.pricePerPortion * qty;
    });
    return price;
  }, [selected, ingredients]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fait "pulser" le panneau calorique à chaque changement de sélection, pour un retour visuel immédiat.
  const [calorieBump, setCalorieBump] = useState(false);
  const mountedCaloriesRef = useRef(false);
  useEffect(() => {
    if (!mountedCaloriesRef.current) { mountedCaloriesRef.current = true; return; }
    setCalorieBump(true);
    const t = setTimeout(() => setCalorieBump(false), 500);
    return () => clearTimeout(t);
  }, [totalCalories]);

  const toggleIngredient = (ingredient: Ingredient, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isCurrentlySelected = selected.has(ingredient.id);

    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(ingredient.id)) {
        next.delete(ingredient.id);
      } else {
        if (currentStepConfig.single) {
          currentStepConfig.categories.forEach(cat => {
            ingredients.filter(i => i.category === cat).forEach(i => next.delete(i.id));
          });
        }
        next.set(ingredient.id, 1);
      }
      return next;
    });

    if (!isCurrentlySelected) {
      setFlyingItems(items => [...items, {
        id:     `${ingredient.id}-${Date.now()}`,
        image:  ingredient.image,
        startX: rect.left + rect.width / 2 - 24,
        startY: rect.top + rect.height / 3,
      }]);
    }
  };

  const changeQuantity = (id: string, delta: number, e: React.MouseEvent) => {
    if (delta > 0) {
      const ing = ingredients.find(i => i.id === id);
      if (ing) {
        const card = (e.currentTarget as HTMLElement).closest('[data-ingredient-card]');
        const rect = card ? card.getBoundingClientRect() : (e.currentTarget as HTMLElement).getBoundingClientRect();
        setFlyingItems(items => [...items, {
          id:     `${id}-${Date.now()}`,
          image:  ing.image,
          startX: rect.left + rect.width / 2 - 24,
          startY: rect.top + rect.height / 3,
        }]);
      }
    }
    setSelected(prev => {
      const next = new Map(prev);
      const current = next.get(id) || 0;
      const newQty = current + delta;
      if (newQty <= 0) next.delete(id);
      else next.set(id, newQty);
      return next;
    });
  };

  const applySuggestion = (suggestion: Suggestion) => {
    const next = new Map<string, number>();
    if (suggestion.base) {
      const id = resolveIngredientId(suggestion.base, ingredients);
      if (id) next.set(id, 1);
    }
    suggestion.ingredients.forEach(staticId => {
      const id = resolveIngredientId(staticId, ingredients);
      if (id) next.set(id, 1);
    });
    setSelected(next);
    setStep(suggestionJumpIndex);
    toast.success(saladType === 'crudites'
      ? `"${suggestion.name}" chargé — choisissez votre sauce !`
      : `"${suggestion.name}" chargé !`);
  };

  const addCurrentToCart = () => {
    if (selected.size === 0 || !saladType) return;
    const items = Array.from(selected.entries())
      .map(([id, qty]) => ({ ingredient: findIngredient(id), quantity: qty }))
      .filter((item): item is { ingredient: Ingredient; quantity: number } => item.ingredient !== undefined);
    if (items.length === 0) return;
    addItem({
      id:            `salade-${saladType}`,
      type:          'salade',
      name:          saladType === 'crudites' ? 'Salade de crudités' : 'Salade de fruits',
      items,
      totalCalories,
      totalPrice,
      quantity:      1,
    });
    // Vider le brouillon une fois ajouté au panier
    if (draftKey) ss.remove(draftKey);
  };

  const handleFinaliser  = () => { addCurrentToCart(); navigate('/panier'); };
  const handleAddAnother = () => { addCurrentToCart(); navigate('/composer'); toast.success('Salade ajoutée — choisissez un autre produit !'); };
  const handleAddToCart  = () => { addCurrentToCart(); setSelected(new Map()); setStep(0); toast.success('Salade ajoutée au panier !'); };

  const canGoNext = () => {
    if (!currentStepConfig.required) return true;
    return currentStepConfig.categories.some(cat =>
      ingredients.filter(i => i.category === cat).some(i => selected.has(i.id))
    );
  };

  if (!saladType) return <Navigate to="/composer" replace />;

  const allCategories = steps.flatMap(s => s.categories);

  return (
    <div className="min-h-screen pb-36 bg-muted/30">

      {/* ── Suggestions du chef ── */}
      {step < recapStepIndex && (
        <div className="pt-20 bg-background border-b border-border/60">
          <div className="max-w-4xl mx-auto px-4 md:px-6 pt-8 pb-6 flex items-end justify-between">
            <div>
              <p className="font-body text-[11px] uppercase tracking-[0.25em] text-primary mb-1.5">Recommandations</p>
              <h2 className="font-display text-3xl md:text-4xl text-foreground">Suggestions du chef</h2>
            </div>
            <p className="font-body text-xs text-muted-foreground hidden sm:block italic">Appuyez pour pré-remplir</p>
          </div>

          <div className="relative max-w-4xl mx-auto px-12 md:px-16">
            {!suggestionsLoaded && (
              <div className="w-full h-60 md:h-72 rounded-2xl bg-muted animate-pulse" />
            )}
            <AnimatePresence mode="wait" initial={false}>
              {suggestionsLoaded && <motion.button
                key={`suggestion-${suggestionIdx}`}
                initial={{ opacity: 0, x: slideDir * 32 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -slideDir * 32 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => applySuggestion(activeSuggestion)}
                className="relative w-full h-60 md:h-72 rounded-2xl overflow-hidden group shadow-elevated block active:scale-[0.99] transition-transform duration-100"
              >
                {activeCover ? (
                  <img src={activeCover} alt={activeSuggestion.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-secondary/30" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/55 via-foreground/8 to-transparent" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/[0.035]" />
                <div className="absolute top-5 right-5">
                  <span className="font-body text-[10px] text-white/70 tabular-nums bg-black/20 backdrop-blur-md px-2 py-1 rounded-full">{suggestionIdx + 1} / {suggestions.length}</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-5 md:p-7">
                  <h3 className="font-display text-3xl md:text-4xl text-white leading-none mb-3 drop-shadow-md">{activeSuggestion.name}</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {activeSuggestion.description.split(', ').map(tag => (
                      <span key={tag} className="font-body text-xs px-3 py-1.5 bg-white/30 backdrop-blur-md border border-white/40 text-primary rounded-full font-semibold shadow-sm">{tag}</span>
                    ))}
                  </div>
                  <span className="inline-flex items-center gap-2 font-body text-xs uppercase tracking-[0.14em] px-5 py-2.5 bg-white/35 backdrop-blur-md border border-white/50 text-primary group-hover:bg-white/50 rounded-xl transition-colors shadow-sm font-semibold">
                    Composer cette salade
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </motion.button>}
            </AnimatePresence>

            {suggestionsLoaded && suggestions.length > 1 && (
              <>
                <button
                  onClick={() => { setSlideDir(-1); setSuggestionIdx(i => (i - 1 + suggestions.length) % suggestions.length); }}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-background border border-border shadow-soft hover:bg-primary hover:border-primary hover:text-primary-foreground text-foreground flex items-center justify-center transition-all duration-200"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setSlideDir(1); setSuggestionIdx(i => (i + 1) % suggestions.length); }}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-background border border-border shadow-soft hover:bg-primary hover:border-primary hover:text-primary-foreground text-foreground flex items-center justify-center transition-all duration-200"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          <div className="flex justify-center gap-2 py-6">
            {suggestionsLoaded && suggestions.map((_, dotIdx) => (
              <button
                key={dotIdx}
                onClick={() => { setSlideDir(dotIdx > suggestionIdx ? 1 : -1); setSuggestionIdx(dotIdx); }}
                className={`rounded-full transition-all duration-300 ${dotIdx === suggestionIdx ? 'w-6 h-2 bg-primary' : 'w-2 h-2 bg-border hover:bg-muted-foreground/40'}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className={`max-w-4xl mx-auto px-4 md:px-6${step >= recapStepIndex ? ' pt-20' : ''}`}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="pt-8 pb-6 text-center">
          <h1 className="font-display text-4xl md:text-5xl text-foreground mb-2">
            {saladType === 'crudites' ? "C'est vous le chef" : 'Votre salade de fruits'}
          </h1>
          <p className="font-body text-muted-foreground">{currentStepConfig.hint}</p>
        </motion.div>

        {/* Step progress */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body transition-all ${
                  i === step      ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : i < step      ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30'
                  : 'bg-muted text-muted-foreground cursor-default'
                }`}
              >
                {i < step
                  ? <Check className="w-3 h-3 shrink-0" />
                  : <span className="w-3.5 h-3.5 flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
                }
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < steps.length - 1 && (
                <div className={`h-px w-4 md:w-8 transition-colors ${i < step ? 'bg-primary' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
            {currentStepConfig.categories.length > 0 && (
              <div className="space-y-8">
                {currentStepConfig.categories.map(cat => {
                  const catIngredients = ingredients.filter(i => i.category === cat && i.inStock);
                  return (
                    <div key={cat}>
                      {!currentStepConfig.single && (
                        <h3 className="font-display text-xl text-foreground mb-4">{CATEGORY_LABELS[cat]}</h3>
                      )}
                      <div className={`grid gap-4 ${currentStepConfig.single ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
                        {!ingredientsLoaded
                          ? Array.from({ length: currentStepConfig.single ? 3 : 8 }).map((_, i) => (
                              <div key={i} className="rounded-xl bg-muted animate-pulse aspect-[4/3]" />
                            ))
                          : catIngredients.map(ingredient => {
                          const isSelected = selected.has(ingredient.id);
                          const qty = selected.get(ingredient.id) || 0;
                          return (
                            <motion.div
                              key={ingredient.id}
                              layout
                              data-ingredient-card
                              onClick={(e) => toggleIngredient(ingredient, e)}
                              className={`group relative border overflow-hidden flex flex-col rounded-xl transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md'
                                  : 'border-border hover:border-primary/40 bg-background hover:shadow-md'
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute top-2 right-2 z-10 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-sm">
                                  <Check className="w-3.5 h-3.5 text-primary-foreground" />
                                </div>
                              )}
                              <div className="relative aspect-[4/3] overflow-hidden">
                                <img
                                  src={ingredient.image}
                                  alt={ingredient.name}
                                  className={`w-full h-full object-cover transition-transform duration-700 ${isSelected ? 'scale-105' : 'group-hover:scale-105'}`}
                                />
                              </div>
                              <div className="p-3 flex flex-col flex-1">
                                <div className="flex items-start justify-between gap-1 mb-1">
                                  <h4 className="font-display text-base text-foreground leading-tight">{ingredient.name}</h4>
                                  <button
                                    onClick={e => { e.stopPropagation(); setSheetIngredient(ingredient); }}
                                    className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                                    title="Voir la fiche"
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-body text-xs text-muted-foreground">{ingredient.caloriesPerPortion} cal</span>
                                  <span className="font-body text-sm text-primary font-semibold">{formatPrice(ingredient.pricePerPortion)}</span>
                                </div>
                                {!currentStepConfig.single && ingredient.benefits && (
                                  <p className="font-body text-xs text-muted-foreground leading-relaxed flex-1">{ingredient.benefits}</p>
                                )}
                                <AnimatePresence>
                                  {isSelected && !currentStepConfig.single && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="flex items-center justify-between mt-3 pt-3 border-t border-border"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <button onClick={(e) => changeQuantity(ingredient.id, -1, e)} className="w-7 h-7 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-foreground text-base transition-colors">−</button>
                                      <span className="font-body text-sm font-bold text-foreground">{qty}</span>
                                      <button onClick={(e) => changeQuantity(ingredient.id, 1, e)} className="w-7 h-7 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-foreground text-base transition-colors">+</button>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {currentStepConfig.key === 'recap' && (
              <div className="bg-background border border-border rounded-2xl p-6 shadow-sm">
                <h2 className="font-display text-2xl text-foreground mb-6">Votre salade</h2>
                {selected.size === 0 ? (
                  <p className="font-body text-sm text-muted-foreground italic text-center py-8">Aucun ingrédient sélectionné</p>
                ) : (
                  <div className="space-y-4 mb-6">
                    {allCategories.map(cat => {
                      const selectedInCat = Array.from(selected.entries())
                        .map(([id, qty]) => ({ ingredient: findIngredient(id), qty }))
                        .filter((item): item is { ingredient: Ingredient; qty: number } =>
                          item.ingredient !== undefined && item.ingredient.category === cat
                        );
                      if (selectedInCat.length === 0) return null;
                      return (
                        <div key={cat}>
                          <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-2">{CATEGORY_LABELS[cat]}</p>
                          {selectedInCat.map(({ ingredient: ing, qty }) => (
                            <div key={ing.id} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                              <div className="flex items-center gap-3">
                                <img src={ing.image} alt={ing.name} className="w-9 h-9 rounded-lg object-cover" />
                                <span className="font-body text-sm text-foreground">{ing.name} × {qty}</span>
                              </div>
                              <div className="text-right">
                                <div className="font-body text-sm text-primary font-semibold">{formatPrice(ing.pricePerPortion * qty)}</div>
                                <div className="font-body text-xs text-muted-foreground">{ing.caloriesPerPortion * qty} cal</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="border-t border-border pt-4 space-y-2 mb-6">
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-muted-foreground">Calories totales</span>
                    <span className="font-bold text-foreground">{totalCalories} cal</span>
                  </div>
                  <div className="flex justify-between font-body text-base">
                    <span className="font-bold text-foreground">Total</span>
                    <span className="font-bold text-primary text-lg">{formatPrice(totalPrice)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleFinaliser}
                    disabled={selected.size === 0}
                    className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-6 py-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/80 active:scale-[0.98] transition-all shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Finaliser
                  </button>
                  <button
                    onClick={handleAddAnother}
                    disabled={selected.size === 0}
                    className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-6 py-4 rounded-xl border-2 border-primary text-primary bg-transparent hover:bg-primary/8 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="text-base leading-none">+</span>
                    Ajouter un autre produit
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className={`flex items-center mt-8 pb-4 ${step > 0 ? 'justify-between' : 'justify-end'}`}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-xl font-body text-sm text-foreground hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4" />
              Précédent
            </button>
          )}
          <span className="font-body text-xs text-muted-foreground">{step + 1} / {steps.length}</span>
          {currentStepConfig.key !== 'recap' ? (
            <button
              onClick={() => setStep(s => Math.min(recapStepIndex, s + 1))}
              disabled={!canGoNext()}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-body text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Suivant
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div />
          )}
        </div>
      </div>

      {/* Desktop floating calorie summary — cible de l'effet "vol vers le calcul calorique" */}
      <motion.div
        id="composer-summary"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`hidden lg:flex fixed bottom-6 right-6 z-50 items-center gap-5 bg-background border-2 border-primary rounded-2xl shadow-elevated px-6 py-4 transition-shadow duration-500 ${calorieBump ? 'shadow-[0_0_0_6px_hsl(var(--primary)/0.25)]' : ''}`}
      >
        <div className="text-center">
          <div className="font-body text-[11px] uppercase tracking-wider text-muted-foreground">Calories</div>
          <div className="font-display text-2xl text-foreground font-bold"><PulseValue value={totalCalories} className="text-2xl" /> <span className="text-sm font-body font-normal text-muted-foreground">cal</span></div>
        </div>
        <div className="h-10 w-px bg-border" />
        <div className="text-center">
          <div className="font-body text-[11px] uppercase tracking-wider text-muted-foreground">Total</div>
          <div className="font-display text-2xl text-primary font-bold"><PulseValue value={formatPrice(totalPrice)} className="text-2xl" /></div>
        </div>
      </motion.div>

      {/* Mobile floating bottom bar — cible de l'effet "vol vers le calcul calorique" */}
      <motion.div
        id="composer-bottom-bar"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t-2 border-primary shadow-2xl transition-shadow duration-500 ${calorieBump ? 'shadow-[0_-6px_24px_-2px_hsl(var(--primary)/0.45)]' : ''}`}
      >
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="font-body text-xs text-muted-foreground">Calories</div>
                <div className="font-display text-lg text-foreground font-bold"><PulseValue value={totalCalories} /></div>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <div className="font-body text-xs text-muted-foreground">Total</div>
                <div className="font-display text-lg text-primary font-bold"><PulseValue value={formatPrice(totalPrice)} /></div>
              </div>
            </div>
            {currentStepConfig.key === 'recap' ? (
              <button onClick={handleFinaliser} disabled={selected.size === 0} className="flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-5 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed">
                <ShoppingCart className="w-3.5 h-3.5" />
                Finaliser
              </button>
            ) : (
              <button onClick={() => setStep(s => Math.min(recapStepIndex, s + 1))} disabled={!canGoNext()} className="flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-5 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed">
                Suivant
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
              {Array.from(selected.entries()).map(([id, qty]) => {
                const ing = findIngredient(id);
                if (!ing) return null;
                return (
                  <div key={id} className="flex items-center gap-1 bg-muted rounded-full px-2 py-1 shrink-0">
                    <img src={ing.image} alt={ing.name} className="w-5 h-5 rounded-full object-cover" />
                    <span className="font-body text-xs text-foreground">×{qty}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      {flyingItems.map(item => (
        <FlyingIngredient key={item.id} item={item} onComplete={removeFlyingItem} />
      ))}

      <IngredientSheetModal ingredient={sheetIngredient} onClose={() => setSheetIngredient(null)} />
    </div>
  );
}
