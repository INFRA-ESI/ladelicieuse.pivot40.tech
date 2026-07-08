import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/context/CartContext';
import ProductSheetModal from '@/components/ProductSheetModal';
import { MEALS, MealProduct, formatPrice } from '@/data/products';
import { toast } from 'sonner';
import mealImage from '@/assets/balanced-meal.jpg';
import { useFlyToCart } from '@/hooks/useFlyToCart';
import { FlyingIngredient } from '@/components/FlyingIngredient';
import { publicFetch } from '@/services/publicApiService';
import { ApiMeal } from '@/types/api.types';
import Footer from '@/components/Footer';
import { Check, FileText, Plus, Minus } from 'lucide-react';

const SECTION_META: Record<string, { subtitle: string; img: string }> = {
  'Repas Équilibrés':  { subtitle: 'Préparés avec soin pour votre équilibre nutritionnel.',        img: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80' },
  'Repas Chauds':      { subtitle: 'Mijotés et rôtis pour réchauffer le corps et nourrir l\'âme.', img: 'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=800&q=80' },
  'Omelettes':         { subtitle: 'Moelleuses, bien garnies, prêtes en quelques minutes.',         img: 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=800&q=80' },
  'Soupes & Bouillons':{ subtitle: 'Veloutés et bouillons maison mijotés avec des légumes frais.',  img: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80' },
  'Salades':           { subtitle: 'Fraîches et colorées, préparées au quotidien.',                 img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80' },
  'Salade':            { subtitle: 'Fraîches et colorées, préparées au quotidien.',                 img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80' },
  'Repas équilibré':   { subtitle: 'Préparés avec soin pour votre équilibre nutritionnel.',         img: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80' },
};

function sectionMeta(cat: string) {
  return SECTION_META[cat] ?? {
    subtitle: 'Préparés avec soin avec les meilleurs ingrédients frais.',
    img:      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80',
  };
}

function isJuice(cat: string) {
  const c = cat.toLowerCase();
  return c.includes('jus') || c.includes('boisson') || c.includes('détox') || c.includes('detox') || c.includes('smoothie');
}

function toMealProduct(m: ApiMeal): MealProduct {
  return {
    id:                m._id,
    name:              m.nom,
    description:       m.description,
    composition:       m.ingredients.map(i => i.nom),
    caloriesPerPortion:m.nutrition.calories,
    portions:          m.portions,
    price:             m.prix,
    image:             m.image || undefined,
    category:          m.categorie,
  };
}

const mealCartPrefix = (id: string) => `repas-${id}-`;

export default function MealsPage() {
  const { addItem, removeItem, updateQuantity, items } = useCart();
  const { flyingItems, launchFly, removeFlyingItem } = useFlyToCart();
  const [meals, setMeals] = useState<MealProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetId, setSheetId] = useState<string | null>(null);

  useEffect(() => {
    publicFetch<ApiMeal[]>('/api/meals?catalog=true').then(data => {
      const repas = (data ?? []).filter(m => !isJuice(m.categorie)).map(toMealProduct);
      setMeals(repas.length > 0 ? repas : MEALS);
      setLoading(false);
    });
  }, []);

  const getCartItem = (meal: MealProduct) =>
    items.find(item => item.id.startsWith(mealCartPrefix(meal.id)));

  const getQty = (meal: MealProduct): number =>
    getCartItem(meal)?.quantity ?? 0;

  const handleIncrement = (meal: MealProduct, e: React.MouseEvent) => {
    const existing = getCartItem(meal);
    if (!existing) {
      addItem({
        id:            `repas-${meal.id}`,
        type:          'repas',
        name:          meal.name,
        product:       meal,
        totalCalories: meal.caloriesPerPortion,
        totalPrice:    meal.price,
        quantity:      1,
      });
      launchFly(e, { image: meal.image });
      toast.success(`${meal.name} ajouté au panier !`);
    } else {
      updateQuantity(existing.id, existing.quantity + 1);
      launchFly(e, { image: meal.image });
    }
  };

  const handleDecrement = (meal: MealProduct) => {
    const existing = getCartItem(meal);
    if (!existing) return;
    if (existing.quantity <= 1) {
      removeItem(existing.id);
      toast.info(`${meal.name} retiré du panier`);
    } else {
      updateQuantity(existing.id, existing.quantity - 1);
    }
  };

  const sections = meals.reduce<{ key: string; meals: MealProduct[] }[]>((acc, meal) => {
    const existing = acc.find(s => s.key === meal.category);
    if (existing) { existing.meals.push(meal); }
    else          { acc.push({ key: meal.category, meals: [meal] }); }
    return acc;
  }, []);

  return (
    <div className="min-h-screen pt-24 pb-32 bg-muted/30">
      <section className="relative h-[50vh] mb-16 overflow-hidden">
        <img src={mealImage} alt="Repas du jour" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/50 to-transparent" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-0 left-0 p-6 md:p-12 max-w-2xl"
        >
          <h1 className="font-display text-4xl md:text-6xl text-foreground mb-3">À Commander</h1>
          <p className="font-body text-foreground/80 text-lg">
            Repas chauds, omelettes, soupes et plats équilibrés préparés avec soin.
          </p>
        </motion.div>
      </section>

      <div className="max-w-5xl mx-auto px-6 space-y-20">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-4">
              <div className="h-8 w-48 bg-muted animate-pulse rounded" />
              <div className="grid md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-72 bg-muted animate-pulse rounded-xl" />
                ))}
              </div>
            </div>
          ))
        ) : (
          sections.map(section => {
            const meta = sectionMeta(section.key);
            return (
              <div key={section.key} id={section.key} className="scroll-mt-28">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="flex items-center gap-6 mb-10 pb-6 border-b border-border"
                >
                  <div className="relative w-24 h-24 md:w-32 md:h-32 flex-shrink-0 rounded-2xl overflow-hidden shadow-md">
                    <img src={meta.img} alt={section.key} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/10" />
                  </div>
                  <div>
                    <h2 className="font-display text-3xl md:text-4xl text-foreground mb-1">{section.key}</h2>
                    <p className="font-body text-muted-foreground">{meta.subtitle}</p>
                  </div>
                </motion.div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {section.meals.map((meal, i) => (
                    <MealCard
                      key={meal.id}
                      meal={meal}
                      qty={getQty(meal)}
                      onIncrement={e => handleIncrement(meal, e)}
                      onDecrement={() => handleDecrement(meal)}
                      onSheet={() => setSheetId(meal.id)}
                      delay={i * 0.08}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {flyingItems.map(item => (
        <FlyingIngredient key={item.id} item={item} onComplete={removeFlyingItem} />
      ))}
      <ProductSheetModal productId={sheetId} onClose={() => setSheetId(null)} />
      <Footer />
    </div>
  );
}

function MealCard({
  meal,
  qty,
  onIncrement,
  onDecrement,
  onSheet,
  delay,
}: {
  meal: MealProduct;
  qty: number;
  onIncrement: (e: React.MouseEvent) => void;
  onDecrement: () => void;
  onSheet: () => void;
  delay: number;
}) {
  const selected = qty > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      viewport={{ once: true }}
      className={`group relative border-2 bg-background flex flex-col rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden
        ${selected
          ? 'border-green-500 ring-2 ring-green-500/30 shadow-green-100'
          : 'border-border hover:border-primary/40'}`}
    >
      {/* Image */}
      <div className="relative h-52 overflow-hidden bg-muted shrink-0">
        {meal.image ? (
          <img
            src={meal.image}
            alt={meal.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Badge sélection */}
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shadow-lg z-10"
            >
              <Check className="w-4 h-4 text-white" strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prix + calories */}
        <div className="absolute bottom-3 left-3">
          <span className="font-display text-xl text-white drop-shadow-md">{formatPrice(meal.price)}</span>
        </div>
        <div className="absolute bottom-3 right-3">
          <span className="font-body text-xs text-white/80 bg-black/30 px-2 py-0.5 rounded-full">{meal.caloriesPerPortion} cal</span>
        </div>
      </div>

      {/* Contenu */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className={`font-display text-xl mb-1.5 ${selected ? 'text-green-700' : 'text-foreground'}`}>{meal.name}</h3>
        <p className="font-body text-sm text-muted-foreground mb-3 flex-1 leading-relaxed line-clamp-3">{meal.description}</p>

        {meal.composition.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {meal.composition.slice(0, 3).map(c => (
              <span key={c} className="font-body text-[10px] uppercase tracking-wider px-2 py-1 bg-primary/10 text-primary rounded">
                {c}
              </span>
            ))}
          </div>
        )}

        {/* Actions : fiche produit + contrôle quantité */}
        <div className="flex items-center gap-2 mt-auto pt-1">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onSheet(); }}
            className="flex-1 flex items-center justify-center gap-1.5 font-body text-xs uppercase tracking-wider px-3 py-2.5 bg-muted text-muted-foreground hover:bg-muted/60 transition-colors rounded-xl"
          >
            <FileText className="w-3.5 h-3.5" />
            Fiche
          </button>
          {qty === 0 ? (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onIncrement(e); }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl font-body text-xs uppercase tracking-wider"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter
            </button>
          ) : (
            <div className="flex items-center border border-primary/30 bg-primary/5 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDecrement(); }}
                className="px-3 py-2.5 text-primary hover:bg-primary/15 transition-colors"
                aria-label="Diminuer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-body text-sm font-bold text-primary min-w-[1.5rem] text-center">{qty}</span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onIncrement(e); }}
                className="px-3 py-2.5 text-primary hover:bg-primary/15 transition-colors"
                aria-label="Augmenter"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
