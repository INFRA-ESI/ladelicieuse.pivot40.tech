import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/context/CartContext';
import { JUICES, JuiceProduct, JuiceFormat, formatPrice, slugifyFormatLabel } from '@/data/products';
import { toast } from 'sonner';
import juicesImage from '@/assets/juices.jpg';
import { useFlyToCart } from '@/hooks/useFlyToCart';
import { FlyingIngredient } from '@/components/FlyingIngredient';
import { publicFetch } from '@/services/publicApiService';
import { ApiMeal } from '@/types/api.types';
import Footer from '@/components/Footer';
import ProductSheetModal from '@/components/ProductSheetModal';
import { Check, FileText, Plus, Minus } from 'lucide-react';

function isJuice(cat: string) {
  const c = cat.toLowerCase();
  return c.includes('jus') || c.includes('boisson') || c.includes('détox') || c.includes('detox') || c.includes('smoothie');
}

function toJuiceProduct(m: ApiMeal): JuiceProduct {
  const formats = (m.formats ?? [])
    .filter(f => f.disponible !== false)
    .map(f => ({ label: f.label, price: f.prix }));
  return {
    id:          m._id,
    name:        m.nom,
    description: m.description,
    calories:    m.nutrition.calories,
    price:       m.prix,
    benefits:    m.ingredients.map(i => i.nom),
    type:        m.categorie.toLowerCase().includes('detox') || m.categorie.toLowerCase().includes('détox') ? 'detox' : 'fruit',
    image:       m.image || undefined,
    formats:     formats.length > 0 ? formats : undefined,
  };
}

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

// Préfixe stable utilisé pour identifier les articles jus dans le panier.
// Avec un format choisi, le préfixe inclut le format afin que chaque format
// (1L, 250ml…) forme sa propre ligne de panier indépendante.
const cartPrefix = (id: string, formatLabel?: string) =>
  formatLabel ? `jus-${id}-${slugifyFormatLabel(formatLabel)}-` : `jus-${id}-`;

export default function JuicesPage() {
  const { addItem, removeItem, updateQuantity, items } = useCart();
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

  const getCartItem = (juice: JuiceProduct, format?: JuiceFormat) =>
    items.find(item => item.id.startsWith(cartPrefix(juice.id, format?.label)));

  const getQty = (juice: JuiceProduct, format?: JuiceFormat): number =>
    getCartItem(juice, format)?.quantity ?? 0;

  const handleIncrement = (juice: JuiceProduct, e: React.MouseEvent, format?: JuiceFormat) => {
    const existing = getCartItem(juice, format);
    const displayName = format ? `${juice.name} — ${format.label}` : juice.name;
    if (!existing) {
      addItem({
        id:            format ? `jus-${juice.id}-${slugifyFormatLabel(format.label)}` : `jus-${juice.id}`,
        type:          'jus',
        name:          displayName,
        product:       juice,
        totalCalories: juice.calories,
        totalPrice:    format ? format.price : juice.price,
        quantity:      1,
      });
      launchFly(e, { image: juice.image });
      toast.success(`${displayName} ajouté au panier !`);
    } else {
      updateQuantity(existing.id, existing.quantity + 1);
      launchFly(e, { image: juice.image });
    }
  };

  const handleDecrement = (juice: JuiceProduct, format?: JuiceFormat) => {
    const existing = getCartItem(juice, format);
    if (!existing) return;
    const displayName = format ? `${juice.name} — ${format.label}` : juice.name;
    if (existing.quantity <= 1) {
      removeItem(existing.id);
      toast.info(`${displayName} retiré du panier`);
    } else {
      updateQuantity(existing.id, existing.quantity - 1);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-32 bg-muted/30">
      <section className="relative h-[50vh] mb-16 overflow-hidden">
        <img src={juicesImage} alt="Nos jus détox et fruits" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/50 to-transparent" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-0 left-0 p-6 md:p-12 max-w-2xl"
        >
          <h1 className="font-display text-4xl md:text-6xl text-foreground mb-3">Jus & Détox</h1>
          <p className="font-body text-foreground/80 text-lg">Des recettes pensées pour purifier, énergiser et ravir.</p>
        </motion.div>
      </section>

      <div className="max-w-5xl mx-auto px-6 space-y-20">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-4">
              <div className="h-8 w-48 bg-muted animate-pulse rounded" />
              <div className="grid md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-80 bg-muted animate-pulse rounded-xl" />
                ))}
              </div>
            </div>
          ))
        ) : (
          SECTION_DISPLAY.map(section => {
            const sectionItems = juices.filter(j => j.type === section.type);
            if (sectionItems.length === 0) return null;
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
                  {sectionItems.map((juice, i) => (
                    <JuiceCard
                      key={juice.id}
                      juice={juice}
                      qty={getQty(juice)}
                      onIncrement={e => handleIncrement(juice, e)}
                      onDecrement={() => handleDecrement(juice)}
                      onSheet={() => setSheetId(juice.id)}
                      delay={i * 0.1}
                      getFormatQty={format => getQty(juice, format)}
                      onFormatIncrement={(format, e) => handleIncrement(juice, e, format)}
                      onFormatDecrement={format => handleDecrement(juice, format)}
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

function JuiceCard({
  juice,
  qty,
  onIncrement,
  onDecrement,
  onSheet,
  delay,
  getFormatQty,
  onFormatIncrement,
  onFormatDecrement,
}: {
  juice: JuiceProduct;
  qty: number;
  onIncrement: (e: React.MouseEvent) => void;
  onDecrement: () => void;
  onSheet: () => void;
  delay: number;
  getFormatQty: (format: JuiceFormat) => number;
  onFormatIncrement: (format: JuiceFormat, e: React.MouseEvent) => void;
  onFormatDecrement: (format: JuiceFormat) => void;
}) {
  const formats = juice.formats;
  const hasFormats = !!formats && formats.length > 0;
  const selected = hasFormats ? formats.some(f => getFormatQty(f) > 0) : qty > 0;
  const lowestPrice = hasFormats ? Math.min(...formats.map(f => f.price)) : juice.price;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      viewport={{ once: true }}
      className={`group relative border-2 bg-background flex flex-col rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden
        ${selected
          ? 'border-green-500 ring-2 ring-green-500/30 shadow-green-100'
          : 'border-border hover:border-primary/50'}`}
    >
      {/* Image */}
      <div className="relative h-52 overflow-hidden bg-muted shrink-0">
        {juice.image ? (
          <img
            src={juice.image}
            alt={juice.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

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
          <span className="font-display text-xl text-white drop-shadow-md">
            {hasFormats ? `Dès ${formatPrice(lowestPrice)}` : formatPrice(juice.price)}
          </span>
        </div>
        <div className="absolute bottom-3 right-3">
          <span className="font-body text-xs text-white/80 bg-black/30 px-2 py-0.5 rounded-full">{juice.calories} cal</span>
        </div>
      </div>

      {/* Contenu texte */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className={`font-display text-xl mb-1.5 ${selected ? 'text-green-700' : 'text-foreground'}`}>{juice.name}</h3>
        <p className="font-body text-sm text-muted-foreground mb-3 flex-1 leading-relaxed line-clamp-3">{juice.description}</p>
        {juice.benefits.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {juice.benefits.slice(0, 3).map(b => (
              <span key={b} className="font-body text-[10px] uppercase tracking-wider px-2 py-1 bg-primary/10 text-primary rounded">
                {b}
              </span>
            ))}
          </div>
        )}

        {hasFormats ? (
          /* Formats de vente (ex: 1L, 250ml…), chacun avec son propre prix et sa propre quantité */
          <div className="flex flex-col gap-2 mt-auto pt-1">
            {formats.map(format => {
              const fQty = getFormatQty(format);
              return (
                <div
                  key={format.label}
                  className={`flex items-center justify-between gap-2 border rounded-xl px-3 py-2 transition-colors ${
                    fQty > 0 ? 'border-green-500 bg-green-50/60' : 'border-border'
                  }`}
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="font-body text-sm font-semibold text-foreground shrink-0">{format.label}</span>
                    <span className="font-body text-xs text-primary font-semibold truncate">{formatPrice(format.price)}</span>
                  </div>
                  {fQty === 0 ? (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onFormatIncrement(format, e); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-lg font-body text-[11px] uppercase tracking-wider shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      Ajouter
                    </button>
                  ) : (
                    <div className="flex items-center border border-primary/30 bg-primary/5 rounded-lg overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onFormatDecrement(format); }}
                        className="px-2 py-1.5 text-primary hover:bg-primary/15 transition-colors"
                        aria-label={`Diminuer ${format.label}`}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-body text-xs font-bold text-primary min-w-[1.25rem] text-center">{fQty}</span>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onFormatIncrement(format, e); }}
                        className="px-2 py-1.5 text-primary hover:bg-primary/15 transition-colors"
                        aria-label={`Augmenter ${format.label}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onSheet(); }}
              className="flex items-center justify-center gap-1.5 font-body text-xs uppercase tracking-wider px-3 py-2.5 bg-muted text-muted-foreground hover:bg-muted/60 transition-colors rounded-xl mt-1"
            >
              <FileText className="w-3.5 h-3.5" />
              Fiche
            </button>
          </div>
        ) : (
          /* Actions : fiche produit + contrôle quantité (produit à prix unique — comportement inchangé) */
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
        )}
      </div>
    </motion.div>
  );
}
