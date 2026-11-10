import { useState, useEffect } from 'react';
import PageIntro, { introPrimaryClass, introSecondaryClass } from '@/components/PageIntro';
import { useUser } from '@/context/UserContext';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Leaf, Truck, Heart, ChefHat, Star, ArrowRight, Play, X, Tag, Calendar, ShoppingCart, FileText } from '@/components/icons';
import { toast } from 'sonner';
import heroImage from '@/assets/hero-salad.jpg';
import juicesImage from '@/assets/juices.jpg';
import mealImage from '@/assets/balanced-meal.jpg';
import prepImage from '@/assets/preparation.jpg';
import Footer from '@/components/Footer';
import ProductSheetModal from '@/components/ProductSheetModal';
import TestimonialSubmitForm from '@/components/TestimonialSubmitForm';
import { FlyingIngredient } from '@/components/FlyingIngredient';
import { useFlyToCart } from '@/hooks/useFlyToCart';
import { useCart } from '@/context/CartContext';
import { publicFetch } from '@/services/publicApiService';
import { ApiPromotion, ApiDailyMenu, ApiMeal } from '@/types/api.types';
import { formatPrice, MealProduct } from '@/data/products';

function toMealProduct(m: ApiMeal): MealProduct {
  return {
    id:                 m._id,
    name:               m.nom,
    description:        m.description,
    composition:        m.ingredients.map(i => i.nom),
    caloriesPerPortion: m.nutrition.calories,
    portions:           m.portions,
    price:              m.prix,
    image:              m.image || undefined,
    category:           m.categorie,
  };
}

const menuCartPrefix = (id: string) => `repas-${id}-`;

const ADVANTAGES = [
  { icon: Leaf,    title: 'Ingrédients frais',  desc: 'Produits locaux sélectionnés chaque matin au marché de Libreville' },
  { icon: ChefHat, title: 'Sur mesure',          desc: 'Commandez votre salade selon vos goûts et besoins nutritionnels' },
  { icon: Truck,   title: 'Livraison rapide',    desc: 'Livré chez vous en 45 minutes dans tout Libreville' },
  { icon: Heart,   title: 'Suivi diététique',    desc: 'Compteur de calories et conseils nutritionnels personnalisés' },
];

const STEPS = [
  { num: '01', title: 'Choisissez',    desc: 'Parcourez notre carte de salades, jus et repas équilibrés' },
  { num: '02', title: 'Personnalisez', desc: 'Ajoutez ou retirez des ingrédients selon vos envies' },
  { num: '03', title: 'Commandez',     desc: 'Validez votre panier et choisissez votre mode de livraison' },
];

const TESTIMONIALS = [
  { name: 'Ange M.',    text: 'Les salades sont incroyablement fraîches ! Je commande chaque semaine pour le bureau.', rating: 5 },
  { name: 'Sylvie N.', text: 'Le jus Détox Verte est devenu mon rituel du matin. Merci La Délicieuse Diète !',        rating: 5 },
  { name: 'Patrick O.',text: 'Enfin un restaurant qui allie santé et saveur à Libreville. Les repas sont top.',        rating: 4 },
];

function promoLabel(p: ApiPromotion): string {
  if (p.type === 'pourcentage') return `-${p.valeur}%`;
  if (p.type === 'fixe')        return `-${formatPrice(p.valeur)}`;
  if (p.type === 'flash')       return `Flash -${p.valeur}%`;
  return p.nom;
}

export default function HomePage() {
  const { user } = useUser();
  const { addItem, updateQuantity, items } = useCart();
  const { flyingItems, launchFly, removeFlyingItem } = useFlyToCart();
  const [videoOpen, setVideoOpen]       = useState(false);
  const [promotions, setPromotions]     = useState<ApiPromotion[]>([]);
  const [menuDuJour, setMenuDuJour]     = useState<ApiDailyMenu | null>(null);
  const [promoBanner, setPromoBanner]   = useState(true);
  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [sheetId, setSheetId]           = useState<string | null>(null);
  // Avis validés depuis l'admin ; tant qu'il n'y en a aucun, on garde les exemples ci-dessus.
  const [testimonials, setTestimonials] = useState(TESTIMONIALS);

  const getMenuCartItem = (mealId: string) => items.find(item => item.id.startsWith(menuCartPrefix(mealId)));
  const getMenuQty = (mealId: string) => getMenuCartItem(mealId)?.quantity ?? 0;

  const handleMenuAdd = (meal: MealProduct, e: React.MouseEvent) => {
    const existing = getMenuCartItem(meal.id);
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
      toast.success(`${meal.name} ajouté au panier`);
    } else {
      updateQuantity(existing.id, existing.quantity + 1);
    }
    launchFly(e, { image: meal.image });
  };

  useEffect(() => {
    publicFetch<ApiPromotion[]>('/api/promotions/active').then(data => {
      if (data && data.length > 0) setPromotions(data);
    });
    publicFetch<ApiDailyMenu>('/api/menu').then(data => {
      if (data) setMenuDuJour(data);
    });
    publicFetch<Array<{ nom: string; texte: string; note: number }>>('/api/testimonials?page=accueil').then(data => {
      if (data && data.length > 0) {
        setTestimonials(data.slice(0, 6).map(t => ({ name: t.nom, text: t.texte, rating: t.note })));
      }
    });
    publicFetch<{ videoPresentation?: string }>('/api/settings/public').then(data => {
      if (data?.videoPresentation) setVideoUrl(data.videoPresentation);
    });
  }, []);

  return (
    <div className="min-h-screen">

      {/* ── Bannière promotions (si actives) ── */}
      <AnimatePresence>
        {promotions.length > 0 && promoBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`fixed right-0 z-40 bg-primary text-primary-foreground shadow-sm ${user ? 'top-0 left-0 md:left-64' : 'top-16 left-0'}`}
          >
            <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
                <Tag className="w-3.5 h-3.5 shrink-0" />
                <div className="flex items-center gap-4">
                  {promotions.map(p => (
                    <span key={p._id} className="font-body text-xs whitespace-nowrap">
                      <strong>{p.nom}</strong> — {promoLabel(p)}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setPromoBanner(false)}
                className="shrink-0 p-1 rounded hover:bg-primary-foreground/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      {user ? (
        <PageIntro
          clearBar
          eyebrow="Accueil"
          title={<>Bonjour, {(user.prenoms || user.nom).split(' ')[0]}</>}
          subtitle="Salades à composer, jus pressés et repas équilibrés, livrés à Libreville"
          actions={<Link to="/composer" className={introPrimaryClass}>Commander</Link>}
        />
      ) : (
      <section className="relative h-screen flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImage} alt="Salade fraîche préparée avec soin" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="relative z-10 max-w-4xl px-6 md:px-12 pb-16 md:pb-24"
        >
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl text-primary-foreground leading-[0.95] mb-6">
            La Délicieuse Diète
          </h1>
          <p className="font-display text-xl md:text-2xl text-primary-foreground/80 max-w-xl mb-10">
            Salades à composer, jus pressés et repas équilibrés, livrés à Libreville
          </p>
          <div className="flex justify-center md:justify-start">
            <Link
              to="/composer"
              className="inline-block font-body text-sm px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl"
            >
              Commander
            </Link>
          </div>
        </motion.div>
      </section>
      )}

      {/* ── Menu du Jour (dynamique depuis le back-office) ── */}
      {menuDuJour && menuDuJour.repas && menuDuJour.repas.length > 0 && (
        <section className="py-16 md:py-20 px-6 md:px-12 bg-primary/5 border-b border-primary/10">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex items-center gap-3 mb-10"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-body text-xs text-primary">Aujourd'hui seulement</p>
                <h2 className="font-display text-3xl md:text-4xl text-foreground">Menu du Jour</h2>
              </div>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {menuDuJour.repas.map((repas, i) => {
                const meal = toMealProduct(repas);
                const qty = getMenuQty(meal.id);
                const ingredientNames = (repas.ingredients ?? []).map(i => i.nom).filter(Boolean).slice(0, 5);
                const calories = repas.nutrition?.calories ?? 0;
                return (
                  <motion.div
                    key={repas._id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    viewport={{ once: true }}
                    className="group relative rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300 bg-background border border-border flex flex-col"
                  >
                    {/* Photo libre : aucun texte ni dégradé par-dessus, tout le détail est sous l'image */}
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                      {repas.image ? (
                        <img src={repas.image} alt={repas.nom} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/30 to-secondary/20" />
                      )}
                    </div>

                    <div className="p-4 flex flex-col gap-3 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-body text-xs text-primary font-semibold">{repas.categorie}</span>
                        {calories > 0 && <span className="font-body text-xs text-muted-foreground">{calories} cal</span>}
                      </div>
                      <h3 className="font-display text-xl text-foreground leading-snug line-clamp-2">{repas.nom}</h3>
                      {ingredientNames.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {ingredientNames.map(nom => (
                            <span key={nom} className="font-body text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-full">{nom}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-auto pt-1">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleMenuAdd(meal, e); }}
                          className="flex-1 flex items-center justify-center gap-1.5 font-body text-xs px-3 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl transition-colors font-semibold"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          {qty > 0 ? `Ajouté ×${qty}` : `Ajouter — ${formatPrice(repas.prix)}`}
                        </button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setSheetId(repas._id); }}
                          className="flex items-center justify-center px-3 py-2.5 bg-muted text-muted-foreground hover:bg-muted/70 rounded-xl transition-colors"
                          aria-label="Voir la fiche"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-8 text-center">
              <Link
                to="/repas"
                className="inline-flex items-center gap-2 font-body text-sm px-6 py-3 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors rounded-xl"
              >
                Voir tous les repas <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Video Section — masquée si aucune vidéo configurée */}
      {videoUrl && (
        <>
          <section className="py-20 md:py-28 px-6 md:px-12 bg-background">
            <div className="max-w-4xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
              >
                <span className="font-body text-xs text-primary mb-4 block">Notre concept</span>
                <h2 className="font-display text-3xl md:text-5xl text-foreground mb-6">
                  Comment ça se passe chez nous ?
                </h2>
                <p className="font-body text-muted-foreground text-lg mb-10 max-w-2xl mx-auto">
                  Découvrez comment nous préparons nos salades de fruits colorées — des produits frais,
                  choisis avec soin, assemblés avec amour à la façon africaine.
                </p>

                <button
                  onClick={() => setVideoOpen(true)}
                  className="relative group mx-auto block w-full max-w-2xl overflow-hidden rounded-2xl shadow-xl hover:shadow-2xl transition-shadow bg-black"
                  aria-label="Lancer la vidéo de présentation"
                >
                  {/* Première image du fichier vidéo comme miniature naturelle */}
                  <video
                    src={videoUrl}
                    preload="metadata"
                    muted
                    playsInline
                    className="w-full aspect-video object-cover pointer-events-none"
                  />
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      whileTap={{ scale: 0.95 }}
                      className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-lg"
                    >
                      <Play className="w-8 h-8 text-primary fill-primary ml-1" />
                    </motion.div>
                  </div>
                </button>
              </motion.div>
            </div>
          </section>

          {videoOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
              onClick={(e) => { if (e.target === e.currentTarget) setVideoOpen(false); }}
            >
              <div className="relative w-full max-w-3xl">
                <button
                  onClick={() => setVideoOpen(false)}
                  className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors"
                  aria-label="Fermer"
                >
                  <X className="w-8 h-8" />
                </button>
                <div className="aspect-video rounded-xl overflow-hidden shadow-2xl bg-black">
                  <video
                    src={videoUrl}
                    autoPlay
                    controls
                    className="w-full h-full"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Advantages strip */}
      <section className="py-16 md:py-20 px-6 md:px-12 bg-muted">
        <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          {ADVANTAGES.map((adv, i) => (
            <motion.div
              key={adv.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center">
                <adv.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-display text-lg md:text-xl text-foreground mb-2">{adv.title}</h3>
              <p className="font-body text-sm text-muted-foreground leading-relaxed">{adv.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="py-24 md:py-32 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-12 gap-8 md:gap-6 lg:gap-16 items-center"
          >
            <div className="md:col-span-5">
              <img
                src={prepImage}
                alt="Chef coupant des légumes frais sur une planche en bois"
                className="w-full aspect-[4/3] object-cover object-top rounded-xl"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="md:col-span-7">
              <h2 className="font-display text-3xl md:text-5xl text-foreground mb-6 leading-tight">
                Le plaisir de manger sainement,{' '}
                <span className="text-primary">sans compromis</span>
              </h2>
              <p className="font-body text-base md:text-lg text-muted-foreground leading-relaxed mb-4">
                Chez La Délicieuse Diète, nous croyons que la santé et le plaisir ne s'opposent jamais.
                Vous composez votre salade ingrédient par ingrédient, avec les calories et les valeurs nutritives de chaque choix.
              </p>
              <p className="font-body text-base md:text-lg text-muted-foreground leading-relaxed">
                Personnalisez votre repas, découvrez les bienfaits de chaque ingrédient,
                et laissez-vous guider par le goût.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 md:py-28 px-6 md:px-12 bg-muted">
        <div className="max-w-5xl mx-auto">
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="font-display text-3xl md:text-5xl text-foreground mb-16 text-center">
            Comment ça marche
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-10 md:gap-16">
            {STEPS.map((step, i) => (
              <motion.div key={step.num} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }} viewport={{ once: true }} className="text-center">
                <span className="font-display text-6xl md:text-7xl text-primary/20 leading-none">{step.num}</span>
                <h3 className="font-display text-2xl text-foreground mt-2 mb-3">{step.title}</h3>
                <p className="font-body text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
          <div className="text-center mt-14">
            <Link to="/composer" className="inline-flex items-center gap-2 font-body text-sm px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl">
              Commencer <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 md:py-24 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="font-display text-3xl md:text-5xl text-foreground mb-16 text-center">
            Découvrir
          </motion.h2>
          <div className="grid md:grid-cols-12 gap-6 md:gap-8">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} viewport={{ once: true }} className="md:col-span-7 group">
              <Link to="/composer" className="block relative overflow-hidden aspect-[4/3] rounded-xl">
                <img src={heroImage} alt="À commander" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6 md:p-10">
                  <span className="font-body text-xs text-secondary mb-2 block">Toutes nos catégories</span>
                  <h3 className="font-display text-3xl md:text-4xl text-primary-foreground">À Commander</h3>
                  <p className="font-body text-sm text-primary-foreground/75 mt-2">Salades, jus, repas chauds, omelettes, soupes</p>
                </div>
              </Link>
            </motion.div>
            <div className="md:col-span-5 flex flex-col gap-6 md:gap-8">
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} viewport={{ once: true }} className="group">
                <Link to="/jus" className="block relative overflow-hidden aspect-square rounded-xl">
                  <img src={juicesImage} alt="Jus détox et fruits pressés" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6">
                    <span className="font-body text-xs text-secondary mb-2 block">Détox & Pressés minute</span>
                    <h3 className="font-display text-2xl md:text-3xl text-primary-foreground">Jus vitaminés</h3>
                  </div>
                </Link>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} viewport={{ once: true }} className="group">
                <Link to="/repas" className="block relative overflow-hidden aspect-[4/3] rounded-xl">
                  <img src={mealImage} alt="Repas chauds, omelettes et soupes" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6">
                    <span className="font-body text-xs text-secondary mb-2 block">Chauds & mijotés</span>
                    <h3 className="font-display text-2xl md:text-3xl text-primary-foreground">Repas, Omelettes & Soupes</h3>
                  </div>
                </Link>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 md:py-28 px-6 md:px-12 bg-muted">
        <div className="max-w-5xl mx-auto">
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="font-display text-3xl md:text-5xl text-foreground mb-16 text-center">
            Ce que disent nos clients
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }} className="bg-background p-8 border border-border rounded-xl">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, si) => (
                    <Star key={si} className={`w-4 h-4 ${si < t.rating ? 'text-primary fill-primary' : 'text-border'}`} />
                  ))}
                </div>
                <p className="font-body text-sm text-muted-foreground leading-relaxed mb-6">« {t.text} »</p>
                <p className="font-display text-base text-foreground">{t.name}</p>
              </motion.div>
            ))}
          </div>

          <div id="laisser-un-avis" className="mt-16 max-w-2xl mx-auto bg-background p-6 md:p-8 border border-border rounded-xl scroll-mt-28">
            <h3 className="font-display text-2xl text-foreground mb-1">Laissez votre avis</h3>
            <p className="font-body text-sm text-muted-foreground mb-6">
              Une note et quelques mots sur nos salades, jus ou repas : votre avis est publié après validation.
            </p>
            <TestimonialSubmitForm page="accueil" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 md:py-32 px-6 md:px-12 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="max-w-2xl mx-auto">
          <h2 className="font-display text-4xl md:text-6xl text-foreground mb-6">« Manger bien, vivre mieux »</h2>
          <p className="font-body text-muted-foreground text-lg mb-10">
            Composez votre salade, choisissez vos jus et faites-vous livrer à domicile.
          </p>
          <Link to="/composer" className="inline-block font-body text-sm px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl">
            Commencer ma commande
          </Link>
        </motion.div>
      </section>

      <Footer />

      <ProductSheetModal productId={sheetId} onClose={() => setSheetId(null)} />
      {flyingItems.map(item => (
        <FlyingIngredient key={item.id} item={item} onComplete={removeFlyingItem} />
      ))}
    </div>
  );
}
