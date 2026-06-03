import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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

// Métadonnées de section par nom de catégorie (tel qu'il est en base)
const SECTION_META: Record<string, { subtitle: string; img: string }> = {
  'Repas Équilibrés':  { subtitle: 'Préparés avec soin pour votre équilibre nutritionnel.',         img: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80' },
  'Repas Chauds':      { subtitle: 'Mijotés et rôtis pour réchauffer le corps et nourrir l\'âme.',  img: 'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=800&q=80' },
  'Omelettes':         { subtitle: 'Moelleuses, bien garnies, prêtes en quelques minutes.',          img: 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=800&q=80' },
  'Soupes & Bouillons':{ subtitle: 'Veloutés et bouillons maison mijotés avec des légumes frais.',   img: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80' },
  'Salades':           { subtitle: 'Fraîches et colorées, préparées au quotidien.',                  img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80' },
  'Salade':            { subtitle: 'Fraîches et colorées, préparées au quotidien.',                  img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80' },
  'Repas équilibré':   { subtitle: 'Préparés avec soin pour votre équilibre nutritionnel.',          img: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80' },
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

export default function MealsPage() {
  const { addItem } = useCart();
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

  const handleAdd = (meal: MealProduct, e: React.MouseEvent) => {
    addItem({
      id:            `repas-${meal.id}-${Date.now()}`,
      type:          'repas',
      name:          meal.name,
      product:       meal,
      totalCalories: meal.caloriesPerPortion,
      totalPrice:    meal.price,
      quantity:      1,
    });
    launchFly(e, { image: meal.image });
    toast.success(`${meal.name} ajouté au panier !`);
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
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="h-52 bg-muted animate-pulse rounded-xl" />
              ))}
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

                <div className="space-y-6">
                  {section.meals.map((meal, i) => (
                    <motion.div
                      key={meal.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      viewport={{ once: true }}
                      className="border border-border bg-background rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden"
                    >
                      {meal.image && (
                        <div className="relative h-52 overflow-hidden">
                          <img
                            src={meal.image}
                            alt={meal.name}
                            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
                        </div>
                      )}
                      <div className="grid md:grid-cols-12 gap-6 p-6 md:p-8">
                        <div className="md:col-span-8">
                          <h3 className="font-display text-2xl md:text-3xl text-foreground mb-3">{meal.name}</h3>
                          <p className="font-body text-muted-foreground mb-4">{meal.description}</p>
                          {meal.composition.length > 0 && (
                            <div className="mb-4">
                              <span className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Composition</span>
                              <div className="flex flex-wrap gap-2">
                                {meal.composition.map(c => (
                                  <span key={c} className="font-body text-xs px-3 py-1 bg-primary/15 text-primary rounded">
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex gap-6 font-body text-sm text-muted-foreground">
                            <span>{meal.caloriesPerPortion} cal / portion</span>
                            <span>{meal.portions} {meal.portions > 1 ? 'portions' : 'portion'}</span>
                          </div>
                        </div>
                        <div className="md:col-span-4 flex flex-col justify-between items-end">
                          <span className="font-display text-3xl text-primary">{formatPrice(meal.price)}</span>
                          <div className="flex flex-col items-end gap-2 mt-4 w-full md:w-auto">
                            <button
                              onClick={(e) => handleAdd(meal, e)}
                              className="w-full font-body text-xs uppercase tracking-[0.15em] px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all rounded-lg"
                            >
                              Ajouter au panier
                            </button>
                            <button
                              onClick={() => setSheetId(meal.id)}
                              className="w-full font-body text-xs uppercase tracking-[0.15em] px-6 py-2.5 border-2 border-primary text-primary bg-transparent hover:bg-primary/10 active:scale-95 transition-all rounded-lg"
                            >
                              Voir la fiche produit
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
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
