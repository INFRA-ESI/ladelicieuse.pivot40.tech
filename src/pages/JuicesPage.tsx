import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useCart } from '@/context/CartContext';
import { JUICES, JuiceProduct, formatPrice } from '@/data/products';
import { toast } from 'sonner';
import juicesImage from '@/assets/juices.jpg';
import { useFlyToCart } from '@/hooks/useFlyToCart';
import { FlyingIngredient } from '@/components/FlyingIngredient';
import { publicFetch } from '@/services/publicApiService';
import { ApiMeal } from '@/types/api.types';
import Footer from '@/components/Footer';
import ProductSheetModal from '@/components/ProductSheetModal';

function isJuice(cat: string) {
  const c = cat.toLowerCase();
  return c.includes('jus') || c.includes('boisson') || c.includes('détox') || c.includes('detox') || c.includes('smoothie');
}

function toJuiceProduct(m: ApiMeal): JuiceProduct {
  return {
    id:          m._id,
    name:        m.nom,
    description: m.description,
    calories:    m.nutrition.calories,
    price:       m.prix,
    benefits:    m.ingredients.map(i => i.nom),
    type:        m.categorie.toLowerCase().includes('detox') || m.categorie.toLowerCase().includes('détox') ? 'detox' : 'fruit',
    image:       m.image || undefined,
  };
}

// Sections d'affichage — générées dynamiquement à partir des catégories DB
const SECTION_DISPLAY = [
  {
    type: 'detox' as const,
    label: 'Jus Détox',
    subtitle: 'Purifiants, anti-inflammatoires et boosteurs d\'énergie naturelle.',
    sectionImg: 'https://images.unsplash.com/photo-1610970881699-44a5587cabec?auto=format&fit=crop&w=800&q=80',
    accentClass: 'text-secondary',
  },
  {
    type: 'fruit' as const,
    label: 'Jus de Fruits Pressés',
    subtitle: 'Orange, mangue, ananas, pastèque — pressés à la commande.',
    sectionImg: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=800&q=80',
    accentClass: 'text-primary',
  },
];

export default function JuicesPage() {
  const { addItem } = useCart();
  const { flyingItems, launchFly, removeFlyingItem } = useFlyToCart();
  const [juices, setJuices] = useState<JuiceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetId, setSheetId] = useState<string | null>(null);

  useEffect(() => {
    publicFetch<ApiMeal[]>('/api/meals?catalog=true').then(data => {
      const fromApi = (data ?? []).filter(m => isJuice(m.categorie)).map(toJuiceProduct);
      setJuices(fromApi.length > 0 ? fromApi : JUICES);
      setLoading(false);
    });
  }, []);

  const handleAdd = (juice: JuiceProduct, e: React.MouseEvent) => {
    addItem({
      id:            `jus-${juice.id}-${Date.now()}`,
      type:          'jus',
      name:          juice.name,
      product:       juice,
      totalCalories: juice.calories,
      totalPrice:    juice.price,
      quantity:      1,
    });
    launchFly(e, { image: juice.image });
    toast.success(`${juice.name} ajouté au panier !`);
  };

  return (
    <div className="min-h-screen pt-24 pb-32 bg-muted/30">
      {/* Hero */}
      <section className="relative h-[50vh] mb-16 overflow-hidden">
        <img src={juicesImage} alt="Nos jus détox et fruits" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/50 to-transparent" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-0 left-0 p-6 md:p-12 max-w-2xl"
        >
          <h1 className="font-display text-4xl md:text-6xl text-foreground mb-3">Jus & Détox</h1>
          <p className="font-body text-foreground/80 text-lg">
            Des recettes pensées pour purifier, énergiser et ravir.
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
                  <div key={j} className="h-64 bg-muted animate-pulse rounded-xl" />
                ))}
              </div>
            </div>
          ))
        ) : (
          SECTION_DISPLAY.map(section => {
            const items = juices.filter(j => j.type === section.type);
            if (items.length === 0) return null;
            return (
              <div key={section.type} id={section.type} className="scroll-mt-28">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="flex items-center gap-6 mb-10 pb-6 border-b border-border"
                >
                  <div className="relative w-24 h-24 md:w-32 md:h-32 flex-shrink-0 rounded-2xl overflow-hidden shadow-md">
                    <img src={section.sectionImg} alt={section.label} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/10" />
                  </div>
                  <div>
                    <h2 className="font-display text-3xl md:text-4xl text-foreground mb-1">
                      Jus{' '}
                      <span className={`italic ${section.accentClass}`}>
                        {section.type === 'detox' ? 'Détox' : 'de fruits pressés'}
                      </span>
                    </h2>
                    <p className="font-body text-muted-foreground">{section.subtitle}</p>
                  </div>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-6">
                  {items.map((juice, i) => (
                    <JuiceCard key={juice.id} juice={juice} onAdd={handleAdd} onSheet={() => setSheetId(juice.id)} delay={i * 0.1} />
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

function JuiceCard({
  juice,
  onAdd,
  onSheet,
  delay,
}: {
  juice: JuiceProduct;
  onAdd: (j: JuiceProduct, e: React.MouseEvent) => void;
  onSheet: () => void;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      viewport={{ once: true }}
      className="border border-border bg-background flex flex-col rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden"
    >
      {juice.image && (
        <div className="relative h-44 overflow-hidden">
          <img
            src={juice.image}
            alt={juice.name}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-6 flex flex-col flex-1">
        <h3 className="font-display text-xl text-foreground mb-2">{juice.name}</h3>
        <p className="font-body text-sm text-muted-foreground mb-4 flex-1">{juice.description}</p>

        {juice.benefits.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {juice.benefits.slice(0, 3).map(b => (
              <span key={b} className="font-body text-[10px] uppercase tracking-wider px-2 py-1 bg-primary/15 text-primary rounded">
                {b}
              </span>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mb-4">
          <span className="font-body text-xs text-muted-foreground">{juice.calories} cal</span>
          <span className="font-body text-sm font-bold text-primary">{formatPrice(juice.price)}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={(e) => onAdd(juice, e)}
            className="flex-1 font-body text-xs uppercase tracking-[0.15em] px-4 py-3 bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all rounded-lg"
          >
            Ajouter au panier
          </button>
          <button
            onClick={onSheet}
            className="flex-1 font-body text-xs uppercase tracking-[0.15em] px-4 py-3 border-2 border-primary text-primary bg-transparent hover:bg-primary/10 active:scale-95 transition-all rounded-lg"
          >
            Voir la fiche produit
          </button>
        </div>
      </div>
    </motion.div>
  );
}
