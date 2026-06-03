import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Leaf, Truck, Heart, ChefHat, Star, ArrowRight, Play, X, Tag, Calendar, UtensilsCrossed } from 'lucide-react';
import heroImage from '@/assets/hero-salad.jpg';
import juicesImage from '@/assets/juices.jpg';
import mealImage from '@/assets/balanced-meal.jpg';
import prepImage from '@/assets/preparation.jpg';
import Footer from '@/components/Footer';
import { publicFetch } from '@/services/publicApiService';
import { ApiPromotion, ApiDailyMenu } from '@/types/api.types';
import { formatPrice } from '@/data/products';

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
  if (p.type === 'fixe')        return `-${new Intl.NumberFormat('fr-FR').format(p.valeur)} FCFA`;
  if (p.type === 'flash')       return `Flash -${p.valeur}%`;
  return p.nom;
}

export default function HomePage() {
  const [videoOpen, setVideoOpen]       = useState(false);
  const [promotions, setPromotions]     = useState<ApiPromotion[]>([]);
  const [menuDuJour, setMenuDuJour]     = useState<ApiDailyMenu | null>(null);
  const [promoBanner, setPromoBanner]   = useState(true);
  const [videoUrl, setVideoUrl]         = useState<string | null>(null);

  useEffect(() => {
    publicFetch<ApiPromotion[]>('/api/promotions/active').then(data => {
      if (data && data.length > 0) setPromotions(data);
    });
    publicFetch<ApiDailyMenu>('/api/menu').then(data => {
      if (data) setMenuDuJour(data);
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
            className="fixed top-16 left-0 right-0 z-40 bg-primary text-primary-foreground shadow-sm"
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
          <p className="font-display text-xl md:text-2xl text-primary-foreground/80 italic max-w-xl mb-10">
            Où chaque bouchée est une célébration du bien-être
          </p>
          <Link
            to="/composer"
            className="inline-block font-body text-sm uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl"
          >
            Commander ma salade
          </Link>
        </motion.div>
      </section>

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
                <p className="font-body text-[11px] uppercase tracking-[0.2em] text-primary">Aujourd'hui seulement</p>
                <h2 className="font-display text-3xl md:text-4xl text-foreground">Menu du Jour</h2>
              </div>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {menuDuJour.repas.map((repas, i) => (
                <motion.div
                  key={repas._id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  viewport={{ once: true }}
                  className="border border-border bg-background rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  {repas.image && (
                    <div className="relative h-40 overflow-hidden">
                      <img src={repas.image} alt={repas.nom} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" loading="lazy" />
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <UtensilsCrossed className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="font-body text-[10px] uppercase tracking-wider text-primary">{repas.categorie}</span>
                    </div>
                    <h3 className="font-display text-lg text-foreground mb-1">{repas.nom}</h3>
                    <p className="font-body text-xs text-muted-foreground mb-3 line-clamp-2">{repas.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-body text-xs text-muted-foreground">{repas.nutrition.calories} cal</span>
                      <span className="font-display text-lg text-primary">{formatPrice(repas.prix)}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 text-center">
              <Link
                to="/repas"
                className="inline-flex items-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-6 py-3 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors rounded-xl"
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
                <span className="font-body text-xs uppercase tracking-[0.25em] text-primary mb-4 block">Notre concept</span>
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
                    className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-700 pointer-events-none"
                  />
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      whileHover={{ scale: 1.1 }}
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
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
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
            className="grid md:grid-cols-12 gap-8 md:gap-16 items-center"
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
                <span className="text-primary italic">sans compromis</span>
              </h2>
              <p className="font-body text-base md:text-lg text-muted-foreground leading-relaxed mb-4">
                Chez La Délicieuse Diète, nous croyons que la santé et le plaisir ne s'opposent jamais.
                Chaque salade est une composition unique, chaque jus une invitation au bien-être.
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
            <Link to="/composer" className="inline-flex items-center gap-2 font-body text-sm uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl">
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
                <img src={heroImage} alt="À commander" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6 md:p-10">
                  <span className="font-body text-xs uppercase tracking-[0.2em] text-secondary mb-2 block">Toutes nos catégories</span>
                  <h3 className="font-display text-3xl md:text-4xl text-primary-foreground">À Commander</h3>
                  <p className="font-body text-sm text-primary-foreground/75 mt-2">Salades, jus, repas chauds, omelettes, soupes</p>
                </div>
              </Link>
            </motion.div>
            <div className="md:col-span-5 flex flex-col gap-6 md:gap-8">
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} viewport={{ once: true }} className="group">
                <Link to="/jus" className="block relative overflow-hidden aspect-square rounded-xl">
                  <img src={juicesImage} alt="Jus détox et fruits pressés" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6">
                    <span className="font-body text-xs uppercase tracking-[0.2em] text-secondary mb-2 block">Détox & Pressés minute</span>
                    <h3 className="font-display text-2xl md:text-3xl text-primary-foreground">Jus vitaminés</h3>
                  </div>
                </Link>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} viewport={{ once: true }} className="group">
                <Link to="/repas" className="block relative overflow-hidden aspect-[4/3] rounded-xl">
                  <img src={mealImage} alt="Repas chauds, omelettes et soupes" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6">
                    <span className="font-body text-xs uppercase tracking-[0.2em] text-secondary mb-2 block">Chauds & mijotés</span>
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
            {TESTIMONIALS.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }} className="bg-background p-8 border border-border rounded-xl">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, si) => (
                    <Star key={si} className={`w-4 h-4 ${si < t.rating ? 'text-primary fill-primary' : 'text-border'}`} />
                  ))}
                </div>
                <p className="font-body text-sm text-muted-foreground leading-relaxed mb-6 italic">« {t.text} »</p>
                <p className="font-display text-base text-foreground">{t.name}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 md:py-32 px-6 md:px-12 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="max-w-2xl mx-auto">
          <h2 className="font-display text-4xl md:text-6xl text-foreground mb-6 italic">« Manger bien, vivre mieux »</h2>
          <p className="font-body text-muted-foreground text-lg mb-10">
            Commandez votre salade idéale, choisissez vos jus préférés, et faites-vous livrer la santé à domicile.
          </p>
          <Link to="/composer" className="inline-block font-body text-sm uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl">
            Commencer ma commande
          </Link>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
}
