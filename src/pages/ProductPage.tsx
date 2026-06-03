import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ShoppingCart, ChevronRight, Clock, Users, Flame,
  Check, AlertTriangle, ChevronLeft, Zap, X,
} from 'lucide-react';

import { useCart } from '@/context/CartContext';
import { publicFetch } from '@/services/publicApiService';
import { ApiProduct } from '@/types/api.types';
import { formatPrice } from '@/data/products';
import { toast } from 'sonner';
import Footer from '@/components/Footer';

// ── Référentiels ──────────────────────────────────────────────────────────────

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten', lait: 'Lait', oeufs: 'Œufs', arachides: 'Arachides',
  soja: 'Soja', noix: 'Fruits à coque', poisson: 'Poisson', crustaces: 'Crustacés',
  mollusques: 'Mollusques', celeri: 'Céleri', moutarde: 'Moutarde',
  sesame: 'Sésame', sulfites: 'Sulfites', lupin: 'Lupin',
};

const GOAL_COLORS: Record<string, string> = {
  detox:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  minceur:  'bg-sky-50 text-sky-700 border-sky-200',
  energie:  'bg-amber-50 text-amber-700 border-amber-200',
  sport:    'bg-orange-50 text-orange-700 border-orange-200',
  'bien-être': 'bg-violet-50 text-violet-700 border-violet-200',
  default:  'bg-primary/8 text-primary border-primary/20',
};

function goalColor(g: string) {
  return GOAL_COLORS[g.toLowerCase()] ?? GOAL_COLORS.default;
}

// Valeurs journalières de référence (mg/g)
const DV = { proteines: 50, glucides: 275, lipides: 78, fibres: 28, sucres: 50, sodium: 2300 };

function pct(val: number, ref: number) {
  return Math.min(100, Math.round((val / ref) * 100));
}

const MACRO_BARS = [
  { key: 'proteines', label: 'Protéines',   unit: 'g',  color: 'bg-blue-500',   ref: DV.proteines },
  { key: 'glucides',  label: 'Glucides',    unit: 'g',  color: 'bg-yellow-500', ref: DV.glucides },
  { key: 'lipides',   label: 'Lipides',     unit: 'g',  color: 'bg-red-400',    ref: DV.lipides },
  { key: 'fibres',    label: 'Fibres',      unit: 'g',  color: 'bg-green-500',  ref: DV.fibres },
  { key: 'sucres',    label: 'Sucres',      unit: 'g',  color: 'bg-pink-400',   ref: DV.sucres },
  { key: 'sodium',    label: 'Sodium',      unit: 'mg', color: 'bg-orange-400', ref: DV.sodium },
] as const;

// ── Composant principal ───────────────────────────────────────────────────────

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();

  const [product, setProduct]     = useState<ApiProduct | null>(null);
  const [similar, setSimilar]     = useState<ApiProduct[]>([]);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox]   = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    setActiveImg(0);

    publicFetch<ApiProduct>(`/api/meals/product/${slug}`)
      .then(data => {
        if (!data) { setNotFound(true); return; }
        setProduct(data);
        // Produits similaires (même catégorie, exclu lui-même)
        publicFetch<ApiProduct[]>(`/api/meals?catalog=true&categorie=${encodeURIComponent(data.categorie)}`)
          .then(list => {
            setSimilar((list ?? []).filter(p => p._id !== data._id).slice(0, 4));
          });
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleAddToCart = () => {
    if (!product) return;
    addItem({
      id:            `prod-${product._id}-${Date.now()}`,
      type:          'jus',
      name:          product.nom,
      product:       { id: product._id, name: product.nom, description: product.description, calories: product.nutrition.calories, price: product.prixPromo ?? product.prix, benefits: product.bienfaits ?? [], type: 'fruit', image: product.image },
      totalCalories: product.nutrition.calories,
      totalPrice:    product.prixPromo ?? product.prix,
      quantity:      1,
    });
    toast.success(`${product.nom} ajouté au panier !`);
  };

  if (loading) return <ProductSkeleton />;

  if (notFound || !product) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 pt-24">
      <p className="font-body text-muted-foreground">Produit introuvable.</p>
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 font-body text-sm text-primary hover:underline">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>
    </div>
  );

  const allImages = [product.image, ...(product.galerie ?? [])].filter(Boolean);
  const prix = product.prixPromo ?? product.prix;
  const hasPromo = product.prixPromo != null && product.prixPromo < product.prix;

  return (
    <div className="min-h-screen bg-background pt-20 pb-32">

      {/* ── Fil d'Ariane ── */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4">
        <nav className="flex items-center gap-2 text-xs font-body text-muted-foreground">
          <Link to="/" className="hover:text-primary transition-colors">Accueil</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/repas" className="hover:text-primary transition-colors">Catalogue</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground truncate max-w-[180px]">{product.nom}</span>
        </nav>
      </div>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 mb-16">
        <div className="grid lg:grid-cols-2 gap-12 items-start">

          {/* Galerie */}
          <div className="space-y-3">
            <div
              className="relative aspect-square rounded-2xl overflow-hidden bg-muted cursor-zoom-in shadow-lg"
              onClick={() => allImages.length > 0 && setLightbox(true)}
            >
              {allImages[activeImg] ? (
                <img src={allImages[activeImg]} alt={product.nom} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <Leaf className="w-16 h-16 opacity-30" />
                </div>
              )}
              {/* Badges */}
              <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                {product.vedette    && <span className="bg-amber-500 text-white text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded">⭐ Vedette</span>}
                {product.recommande && <span className="bg-primary text-primary-foreground text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded">Recommandé</span>}
                {product.saisonnier && <span className="bg-emerald-600 text-white text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded">🍃 Saison</span>}
                {hasPromo           && <span className="bg-red-500 text-white text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded">Promo</span>}
              </div>
            </div>
            {/* Thumbnails */}
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {allImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${i === activeImg ? 'border-primary' : 'border-border hover:border-primary/50'}`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Infos produit */}
          <div className="space-y-5">
            <div>
              <span className="font-body text-xs uppercase tracking-[0.2em] text-primary">{product.categorie}</span>
              <h1 className="font-display text-3xl md:text-4xl text-foreground mt-1 leading-tight">{product.nom}</h1>
              {product.descriptionCourte && (
                <p className="font-body text-muted-foreground mt-2 text-base leading-relaxed">{product.descriptionCourte}</p>
              )}
            </div>

            {/* Prix */}
            <div className="flex items-baseline gap-3">
              <span className="font-display text-3xl text-primary">{formatPrice(prix)}</span>
              {hasPromo && (
                <span className="font-body text-lg text-muted-foreground line-through">{formatPrice(product.prix)}</span>
              )}
            </div>

            {/* Méta rapide */}
            <div className="flex flex-wrap gap-3">
              {product.nutrition.calories > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-muted rounded-lg">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="font-body text-sm"><strong>{product.nutrition.calories}</strong> kcal</span>
                </div>
              )}
              {product.tempsPrepMin != null && product.tempsPrepMin > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-muted rounded-lg">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span className="font-body text-sm"><strong>{product.tempsPrepMin}</strong> min</span>
                </div>
              )}
              {product.portions > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-muted rounded-lg">
                  <Users className="w-4 h-4 text-violet-500" />
                  <span className="font-body text-sm"><strong>{product.portions}</strong> portion{product.portions > 1 ? 's' : ''}</span>
                </div>
              )}
              {product.portion && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-muted rounded-lg">
                  <span className="font-body text-sm font-medium">{product.portion}</span>
                </div>
              )}
            </div>

            {/* Objectifs santé */}
            {(product.objectifsSante?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.objectifsSante!.map(g => (
                  <span key={g} className={`font-body text-xs px-3 py-1 rounded-full border font-medium ${goalColor(g)}`}>{g}</span>
                ))}
              </div>
            )}

            {/* Disponibilité */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${product.disponible ? 'bg-emerald-500' : 'bg-red-400'}`} />
              <span className="font-body text-sm text-muted-foreground">
                {product.disponible ? 'Disponible' : 'Indisponible actuellement'}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddToCart}
                disabled={!product.disponible}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground font-body text-sm uppercase tracking-[0.12em] rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="w-4 h-4" />
                Ajouter au panier
              </button>
              <Link
                to="/panier"
                onClick={handleAddToCart}
                className="flex items-center justify-center gap-2 px-5 py-3.5 border-2 border-primary text-primary font-body text-sm uppercase tracking-[0.12em] rounded-xl hover:bg-primary/5 transition-colors"
              >
                <Zap className="w-4 h-4" />
                Commander
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Description complète ── */}
      {product.description && (
        <section className="max-w-4xl mx-auto px-4 md:px-8 mb-16">
          <h2 className="font-display text-2xl text-foreground mb-4">À propos de ce produit</h2>
          <p className="font-body text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</p>
        </section>
      )}

      {/* ── Valeurs nutritionnelles ── */}
      {product.nutrition.calories > 0 && (
        <section className="max-w-4xl mx-auto px-4 md:px-8 mb-16">
          <h2 className="font-display text-2xl text-foreground mb-6">Valeurs nutritionnelles</h2>
          <div className="bg-background border border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Calories featured */}
            <div className="bg-primary/5 border-b border-border px-6 py-5 flex items-center justify-between">
              <div>
                <span className="font-body text-xs uppercase tracking-[0.2em] text-muted-foreground">Calories</span>
                <div className="font-display text-5xl text-primary mt-1">{product.nutrition.calories}</div>
                <span className="font-body text-xs text-muted-foreground">kcal par portion</span>
              </div>
              <Flame className="w-14 h-14 text-primary/20" />
            </div>
            {/* Macros */}
            <div className="p-6 space-y-4">
              {MACRO_BARS.map(m => {
                const val = (product.nutrition as Record<string, number>)[m.key] ?? 0;
                if (val === 0 && (m.key === 'sucres' || m.key === 'sodium')) return null;
                const p = pct(val, m.ref);
                return (
                  <div key={m.key} className="flex items-center gap-4">
                    <span className="font-body text-sm text-foreground w-24 shrink-0">{m.label}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${m.color}`}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${p}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="font-body text-sm font-medium w-16 text-right">{val}{m.unit}</span>
                    <span className="font-body text-xs text-muted-foreground w-10 text-right">{p}%*</span>
                  </div>
                );
              })}
              <p className="font-body text-[11px] text-muted-foreground pt-2 border-t border-border mt-2">
                * % des Apports Journaliers de Référence (AJR) pour un adulte (2000 kcal/jour)
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Composition — liste simple ── */}
      {(product.ingredients?.length ?? 0) > 0 && (
        <section className="max-w-4xl mx-auto px-4 md:px-8 mb-16">
          <h2 className="font-display text-2xl text-foreground mb-4">Composition</h2>
          <div className="flex flex-wrap gap-2">
            {product.ingredients.map((ing, i) => (
              <span key={i} className="font-body text-sm px-3 py-1.5 bg-muted rounded-full text-foreground">
                {ing.nom}
                {ing.quantite > 0 && (
                  <span className="text-muted-foreground ml-1">· {ing.quantite} {ing.unite}</span>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Bienfaits ── */}
      {(product.bienfaits?.length ?? 0) > 0 && (
        <section className="max-w-4xl mx-auto px-4 md:px-8 mb-16">
          <h2 className="font-display text-2xl text-foreground mb-6">Bienfaits</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {product.bienfaits!.map((b, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3"
              >
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-body text-sm text-emerald-900">{b}</span>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── Allergènes ── */}
      {(product.allergenes?.length ?? 0) > 0 && (
        <section className="max-w-4xl mx-auto px-4 md:px-8 mb-16">
          <h2 className="font-display text-2xl text-foreground mb-4">Allergènes</h2>
          <div className="flex flex-wrap gap-2">
            {product.allergenes!.map(a => (
              <span key={a} className="flex items-center gap-1.5 font-body text-xs px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                {ALLERGEN_LABELS[a] ?? a}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Conseils ── */}
      {(product.conseilsConsommation?.length ?? 0) > 0 && (
        <section className="max-w-4xl mx-auto px-4 md:px-8 mb-16">
          <h2 className="font-display text-2xl text-foreground mb-5">Conseils de consommation</h2>
          <div className="space-y-3">
            {product.conseilsConsommation!.map((c, i) => (
              <div key={i} className="flex items-start gap-4 bg-muted rounded-xl px-5 py-4">
                <span className="font-display text-2xl text-primary/40 leading-none select-none">{String(i + 1).padStart(2, '0')}</span>
                <p className="font-body text-sm text-foreground leading-relaxed">{c}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Produits similaires ── */}
      {similar.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 md:px-8 mb-16">
          <h2 className="font-display text-2xl text-foreground mb-6">Vous pourriez aussi aimer</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {similar.map(p => (
              <Link key={p._id} to={`/produit/${p.slug ?? p._id}`} className="group border border-border rounded-xl overflow-hidden bg-background hover:shadow-md transition-shadow">
                <div className="h-36 bg-muted overflow-hidden">
                  {p.image ? (
                    <img src={p.image} alt={p.nom} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Leaf className="w-8 h-8 text-muted-foreground/30" /></div>
                  )}
                </div>
                <div className="p-3">
                  <p className="font-display text-sm text-foreground leading-tight line-clamp-1">{p.nom}</p>
                  <p className="font-body text-xs text-primary mt-1 font-semibold">{formatPrice(p.prixPromo ?? p.prix)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Retour ── */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 mb-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>
      </div>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightbox && allImages.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightbox(false)}
          >
            <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(false)}>
              <X className="w-8 h-8" />
            </button>
            {allImages.length > 1 && (
              <>
                <button
                  className="absolute left-4 p-2 text-white/70 hover:text-white"
                  onClick={e => { e.stopPropagation(); setActiveImg(i => (i - 1 + allImages.length) % allImages.length); }}
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <button
                  className="absolute right-14 p-2 text-white/70 hover:text-white"
                  onClick={e => { e.stopPropagation(); setActiveImg(i => (i + 1) % allImages.length); }}
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              </>
            )}
            <img
              src={allImages[activeImg]}
              alt={product.nom}
              className="max-w-3xl max-h-[80vh] w-full object-contain rounded-xl"
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}

// ── Skeleton loading ──────────────────────────────────────────────────────────

function ProductSkeleton() {
  return (
    <div className="min-h-screen pt-24 pb-32 max-w-6xl mx-auto px-4 md:px-8 animate-pulse">
      <div className="h-4 w-48 bg-muted rounded mb-8" />
      <div className="grid lg:grid-cols-2 gap-12">
        <div className="aspect-square bg-muted rounded-2xl" />
        <div className="space-y-4">
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="h-10 w-3/4 bg-muted rounded" />
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-2/3 bg-muted rounded" />
          <div className="h-10 w-32 bg-muted rounded" />
          <div className="h-12 w-full bg-muted rounded-xl mt-6" />
        </div>
      </div>
    </div>
  );
}
