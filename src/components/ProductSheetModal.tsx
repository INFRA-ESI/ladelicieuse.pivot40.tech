import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame, Clock, Users, Check, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { publicFetch } from '@/services/publicApiService';
import { ApiProduct } from '@/types/api.types';
import { formatPrice } from '@/data/products';
import { useCart } from '@/context/CartContext';
import { toast } from 'sonner';

// ── Référentiels ──────────────────────────────────────────────────────────────

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten', lait: 'Lait', oeufs: 'Œufs', arachides: 'Arachides',
  soja: 'Soja', noix: 'Fruits à coque', poisson: 'Poisson', crustaces: 'Crustacés',
  sesame: 'Sésame', sulfites: 'Sulfites', celeri: 'Céleri', moutarde: 'Moutarde',
};

const DV = { proteines: 50, glucides: 275, lipides: 78, fibres: 28, sucres: 50, sodium: 2300 };
const pct = (val: number, ref: number) => Math.min(100, Math.round((val / ref) * 100));

const MACRO_BARS = [
  { key: 'proteines', label: 'Protéines',  unit: 'g',  color: 'bg-blue-500',   ref: DV.proteines },
  { key: 'glucides',  label: 'Glucides',   unit: 'g',  color: 'bg-yellow-500', ref: DV.glucides },
  { key: 'lipides',   label: 'Lipides',    unit: 'g',  color: 'bg-red-400',    ref: DV.lipides },
  { key: 'fibres',    label: 'Fibres',     unit: 'g',  color: 'bg-green-500',  ref: DV.fibres },
  { key: 'sucres',    label: 'Sucres',     unit: 'g',  color: 'bg-pink-400',   ref: DV.sucres },
  { key: 'sodium',    label: 'Sodium',     unit: 'mg', color: 'bg-orange-400', ref: DV.sodium },
] as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  productId: string | null;
  onClose: () => void;
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function ProductSheetModal({ productId, onClose }: Props) {
  const { addItem } = useCart();
  const [product, setProduct]   = useState<ApiProduct | null>(null);
  const [loading, setLoading]   = useState(false);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    if (!productId) { setProduct(null); return; }
    setLoading(true);
    setActiveImg(0);
    publicFetch<ApiProduct>(`/api/meals/product/${productId}`)
      .then(data => setProduct(data))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Verrouille le scroll du body pendant l'ouverture
  useEffect(() => {
    if (productId) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [productId]);

  const handleAdd = () => {
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
    onClose();
  };

  const allImages = product
    ? [product.image, ...(product.galerie ?? [])].filter(Boolean)
    : [];

  const hasPromo = product?.prixPromo != null && product.prixPromo < product.prix;

  return (
    <AnimatePresence>
      {productId && (
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
            className="bg-background w-full sm:rounded-2xl sm:max-w-xl max-h-[94vh] overflow-hidden flex flex-col shadow-2xl border border-border/50"
            onClick={e => e.stopPropagation()}
          >

            {/* ── En-tête ── */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <span className="font-body text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Fiche produit
              </span>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                aria-label="Fermer la fiche"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ── Corps scrollable ── */}
            <div className="overflow-y-auto flex-1">

              {/* Skeleton */}
              {loading && (
                <div className="p-5 space-y-3 animate-pulse">
                  <div className="h-56 bg-muted rounded-xl" />
                  <div className="h-5 w-2/3 bg-muted rounded" />
                  <div className="h-3 w-full bg-muted rounded" />
                  <div className="h-3 w-3/4 bg-muted rounded" />
                </div>
              )}

              {!loading && !product && (
                <div className="p-10 flex flex-col items-center justify-center gap-3 text-center">
                  <p className="font-display text-lg text-foreground">Fiche introuvable</p>
                  <p className="font-body text-sm text-muted-foreground">Ce produit n'est pas disponible dans le catalogue.</p>
                </div>
              )}

              {!loading && product && (
                <>
                  {/* ── Galerie ── */}
                  {allImages.length > 0 && (
                    <div className="relative">
                      <div className="h-60 sm:h-72 overflow-hidden bg-muted">
                        <img
                          src={allImages[activeImg]}
                          alt={product.nom}
                          className="w-full h-full object-cover"
                        />
                        {/* Badges status */}
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                          {hasPromo       && <span className="bg-red-500   text-white text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded-full">Promo</span>}
                          {product.vedette    && <span className="bg-amber-500 text-white text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded-full">Vedette</span>}
                          {product.recommande && <span className="bg-primary  text-primary-foreground text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded-full">Recommandé</span>}
                          {product.saisonnier && <span className="bg-emerald-600 text-white text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded-full">Saison</span>}
                        </div>
                        {/* Contrôles galerie */}
                        {allImages.length > 1 && (
                          <>
                            <button
                              onClick={() => setActiveImg(i => (i - 1 + allImages.length) % allImages.length)}
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-background/80 hover:bg-background rounded-full flex items-center justify-center shadow transition-colors"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setActiveImg(i => (i + 1) % allImages.length)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-background/80 hover:bg-background rounded-full flex items-center justify-center shadow transition-colors"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
                              {allImages.map((_, i) => (
                                <button
                                  key={i}
                                  onClick={() => setActiveImg(i)}
                                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeImg ? 'bg-white w-3' : 'bg-white/50'}`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Informations principales ── */}
                  <div className="px-5 pt-4 pb-2 space-y-3">
                    <div>
                      <span className="font-body text-[10px] uppercase tracking-[0.22em] text-primary">{product.categorie}</span>
                      <h2 className="font-display text-xl sm:text-2xl text-foreground mt-0.5 leading-tight">{product.nom}</h2>
                      {product.descriptionCourte && (
                        <p className="font-body text-sm text-muted-foreground mt-1 leading-relaxed">{product.descriptionCourte}</p>
                      )}
                    </div>

                    {/* Prix */}
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-2xl text-primary">{formatPrice(product.prixPromo ?? product.prix)}</span>
                      {hasPromo && (
                        <span className="font-body text-sm text-muted-foreground line-through">{formatPrice(product.prix)}</span>
                      )}
                      {!product.disponible && (
                        <span className="font-body text-xs text-destructive ml-2">Indisponible</span>
                      )}
                    </div>

                    {/* Méta compacte — texte pur, pas d'icônes de contenu */}
                    <div className="flex flex-wrap gap-2">
                      {product.nutrition.calories > 0 && (
                        <span className="font-body text-xs px-2.5 py-1.5 bg-muted rounded-lg">
                          <strong>{product.nutrition.calories}</strong> kcal
                        </span>
                      )}
                      {!!product.tempsPrepMin && (
                        <span className="font-body text-xs px-2.5 py-1.5 bg-muted rounded-lg">
                          <strong>{product.tempsPrepMin}</strong> min
                        </span>
                      )}
                      {product.portions > 0 && (
                        <span className="font-body text-xs px-2.5 py-1.5 bg-muted rounded-lg">
                          <strong>{product.portions}</strong> portion{product.portions > 1 ? 's' : ''}
                        </span>
                      )}
                      {product.portion && (
                        <span className="font-body text-xs px-2.5 py-1.5 bg-muted rounded-lg font-medium">
                          {product.portion}
                        </span>
                      )}
                    </div>

                    {/* Objectifs santé */}
                    {(product.objectifsSante?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {product.objectifsSante!.map(g => (
                          <span key={g} className="font-body text-[11px] px-2.5 py-1 rounded-full border border-primary/25 bg-primary/6 text-primary font-medium">
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Description complète ── */}
                  {product.description && (
                    <div className="px-5 py-3 border-t border-border">
                      <p className="font-body text-sm text-muted-foreground leading-relaxed">{product.description}</p>
                    </div>
                  )}

                  {/* ── Valeurs nutritionnelles ── */}
                  {product.nutrition.calories > 0 && (
                    <div className="px-5 py-4 border-t border-border">
                      <h3 className="font-display text-base text-foreground mb-1">Valeurs nutritionnelles</h3>
                      <p className="font-body text-[11px] text-muted-foreground mb-3">Pour une portion · % des apports journaliers de référence</p>

                      {/* Calories en vedette */}
                      <div className="flex items-center justify-between bg-primary/5 rounded-xl px-4 py-3 mb-3 border border-primary/10">
                        <span className="font-body text-sm text-foreground">Énergie</span>
                        <span className="font-display text-2xl text-primary">{product.nutrition.calories} <span className="text-sm font-body">kcal</span></span>
                      </div>

                      <div className="space-y-2">
                        {MACRO_BARS.map(m => {
                          const val = (product.nutrition as Record<string, number>)[m.key] ?? 0;
                          if (val === 0 && (m.key === 'sucres' || m.key === 'sodium')) return null;
                          const p = pct(val, m.ref);
                          return (
                            <div key={m.key} className="flex items-center gap-3">
                              <span className="font-body text-xs text-foreground w-20 shrink-0">{m.label}</span>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${m.color}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${p}%` }}
                                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                                />
                              </div>
                              <span className="font-body text-xs font-semibold w-10 text-right tabular-nums">{val}{m.unit}</span>
                              <span className="font-body text-[10px] text-muted-foreground w-7 text-right tabular-nums">{p}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Composition — liste simple ── */}
                  {(product.ingredients?.length ?? 0) > 0 && (
                    <div className="px-5 py-4 border-t border-border">
                      <h3 className="font-display text-base text-foreground mb-3">Composition</h3>
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
                    </div>
                  )}

                  {/* ── Bienfaits ── */}
                  {(product.bienfaits?.length ?? 0) > 0 && (
                    <div className="px-5 py-4 border-t border-border">
                      <h3 className="font-display text-base text-foreground mb-3">Bienfaits</h3>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {product.bienfaits!.map((b, i) => (
                          <div key={i} className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span className="font-body text-sm text-emerald-900 leading-snug">{b}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Allergènes ── */}
                  {(product.allergenes?.length ?? 0) > 0 && (
                    <div className="px-5 py-4 border-t border-border">
                      <h3 className="font-display text-base text-foreground mb-2">Allergènes</h3>
                      <div className="flex flex-wrap gap-2">
                        {product.allergenes!.map(a => (
                          <span
                            key={a}
                            className="font-body text-xs px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full font-medium"
                          >
                            {ALLERGEN_LABELS[a] ?? a}
                          </span>
                        ))}
                      </div>
                      <p className="font-body text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Peut contenir des traces des allergènes mentionnés
                      </p>
                    </div>
                  )}

                  {/* ── Conseils de consommation ── */}
                  {(product.conseilsConsommation?.length ?? 0) > 0 && (
                    <div className="px-5 py-4 border-t border-border">
                      <h3 className="font-display text-base text-foreground mb-3">Conseils de consommation</h3>
                      <div className="space-y-2">
                        {product.conseilsConsommation!.map((c, i) => (
                          <div key={i} className="flex items-start gap-3 bg-muted/60 rounded-lg px-4 py-3">
                            <span className="font-display text-xl text-primary/30 leading-none select-none shrink-0 w-5 text-right">
                              {i + 1}
                            </span>
                            <p className="font-body text-sm text-foreground leading-relaxed">{c}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Informations complémentaires ── */}
                  <div className="px-5 py-4 border-t border-border">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-body text-muted-foreground">
                      {product.createdAt && (
                        <span>Ajouté le {new Date(product.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      )}
                      {product.updatedAt && product.updatedAt !== product.createdAt && (
                        <span>Mis à jour le {new Date(product.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      )}
                    </div>
                  </div>

                  <div className="h-2" />
                </>
              )}
            </div>

            {/* ── Pied fixe ── */}
            {!loading && product && (
              <div className="shrink-0 border-t border-border bg-background px-5 py-4">
                <div className="flex gap-3">
                  <button
                    onClick={handleAdd}
                    disabled={!product.disponible}
                    className="flex-1 py-3 bg-primary text-primary-foreground font-body text-sm uppercase tracking-[0.12em] rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Ajouter au panier
                  </button>
                  <button
                    onClick={onClose}
                    className="px-5 py-3 border border-border rounded-xl font-body text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
