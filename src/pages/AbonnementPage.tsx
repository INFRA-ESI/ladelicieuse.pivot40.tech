import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Check, X, ArrowRight, Star,
  Leaf, Zap, Crown, ChevronDown,
  CreditCard, Smartphone, Banknote, Loader2, CheckCircle2, CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { useUser, type Subscription } from '@/context/UserContext';
import Footer from '@/components/Footer';
import prepImage from '@/assets/preparation.jpg';
import prepCloseImage from '@/assets/preparation-close.jpg';
import TestimonialSubmitForm from '@/components/TestimonialSubmitForm';
import juicesImage from '@/assets/juices.jpg';

// ─── Tokens de layout uniformes ───────────────────────────────────────────────
// section standard   : py-20 md:py-28 px-6 md:px-12
// section importante : py-24 md:py-32 px-6 md:px-12
// contenu large      : max-w-6xl mx-auto
// contenu standard   : max-w-5xl mx-auto
// contenu étroit     : max-w-2xl mx-auto
// CTA bouton         : font-body text-sm uppercase tracking-[0.2em] px-8 py-4 rounded-xl

// ─── Data ─────────────────────────────────────────────────────────────────────

const STATS = [
  { value: '−20 %', label: 'sur la facturation annuelle' },
  { value: '0 FCFA', label: 'de frais de livraison' },
  { value: '3', label: 'formules sans engagement' },
];

const PLANS = [
  {
    id: 'essentiel',
    num: '01',
    name: 'Essentiel',
    icon: Leaf,
    monthlyPrice: 25000,
    annualPrice: 20000,
    tag: 'Pour commencer',
    description: 'Idéal pour adopter une routine saine, sans contrainte ni engagement.',
    features: [
      { text: '4 salades personnalisées / mois', ok: true },
      { text: '2 jus détox / mois', ok: true },
      { text: 'Livraison offerte', ok: true },
      { text: 'Compteur de calories', ok: true },
      { text: 'Repas équilibrés inclus', ok: false },
      { text: 'Suivi nutritionnel', ok: false },
      { text: 'Consultation diététicien', ok: false },
    ],
    dark: false,
  },
  {
    id: 'vitalite',
    num: '02',
    name: 'Vitalité',
    icon: Zap,
    monthlyPrice: 45000,
    annualPrice: 36000,
    tag: 'Le plus choisi',
    description: 'Alimentation complète au quotidien — salades, jus, repas et suivi inclus.',
    features: [
      { text: '8 salades personnalisées / mois', ok: true },
      { text: '4 jus détox / mois', ok: true },
      { text: 'Livraison prioritaire offerte', ok: true },
      { text: 'Compteur de calories', ok: true },
      { text: '2 repas équilibrés / mois', ok: true },
      { text: 'Accès au suivi nutritionnel', ok: true },
      { text: 'Consultation diététicien', ok: false },
    ],
    dark: true,
  },
  {
    id: 'premium',
    num: '03',
    name: 'Premium',
    icon: Crown,
    monthlyPrice: 75000,
    annualPrice: 60000,
    tag: "L'expérience totale",
    description: 'Tout inclus, illimité — avec coaching nutritionnel et consultation mensuelle.',
    features: [
      { text: 'Salades personnalisées illimitées', ok: true },
      { text: 'Jus illimités', ok: true },
      { text: 'Livraison express offerte', ok: true },
      { text: 'Compteur de calories', ok: true },
      { text: 'Repas équilibrés illimités', ok: true },
      { text: 'Suivi nutritionnel personnalisé', ok: true },
      { text: '1 consultation diététicien / mois', ok: true },
    ],
    dark: false,
  },
] as const;

const STEPS = [
  { num: '01', title: 'Choisissez', desc: 'Sélectionnez la formule qui correspond à votre rythme et vos objectifs santé.' },
  { num: '02', title: 'Personnalisez', desc: 'Chaque semaine, choisissez vos salades, jus et repas dans notre catalogue complet.' },
  { num: '03', title: 'Recevez', desc: 'Vos préparations fraîches sont livrées à votre porte selon votre planning.' },
];

const TESTIMONIALS = [
  { name: 'Marie-Claire O.', text: 'Depuis mon abonnement Vitalité, je ne me pose plus la question du déjeuner. Frais, goûteux, livré à l\'heure.', rating: 5 },
  { name: 'Franck N.', text: 'La formule Premium avec la consultation diét. a vraiment changé mon rapport à l\'alimentation. Je recommande.', rating: 5 },
  { name: 'Esther B.', text: 'Commencer par l\'Essentiel était la meilleure décision. J\'ai perdu 4 kg en 2 mois sans effort.', rating: 5 },
];

const FAQS = [
  { q: 'Puis-je annuler à tout moment ?', a: 'Oui, sans engagement ni frais. Annulez ou mettez en pause depuis votre espace personnel avant le prochain renouvellement.' },
  { q: 'Comment fonctionne la livraison hebdomadaire ?', a: 'Chaque semaine, vous recevez une notification pour valider votre sélection. Votre commande est préparée le matin et livrée dans la journée dans tout Libreville.' },
  { q: 'Puis-je changer de formule en cours d\'abonnement ?', a: 'Absolument. Upgradez ou downgradez à tout moment. La différence est calculée au prorata.' },
  { q: 'Les abonnés cumulent-ils des points fidélité ?', a: 'Oui, et en bonus. Vitalité : points doublés. Premium : points triplés par rapport à la commande à la carte.' },
  { q: 'Les ingrédients sont-ils frais chaque semaine ?', a: 'Toujours. Nos ingrédients sont sélectionnés chaque matin au marché de Libreville. Aucun produit surgelé.' },
];

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
}

// ─── FaqItem ──────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-center justify-between gap-6 py-5 group"
      >
        <span className="font-display text-xl text-foreground group-hover:text-primary transition-colors">
          {q}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22 }}
          className="shrink-0"
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <p className="font-body text-sm text-muted-foreground leading-relaxed pb-5">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type CheckoutStep = 'account' | 'payment' | 'processing' | 'success';

function nextRenewalDate(annual: boolean): string {
  const d = new Date();
  if (annual) d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString('fr-FR');
}

type IconKey = 'leaf' | 'zap' | 'crown' | 'star';
const ICON_MAP: Record<IconKey, React.ElementType> = { leaf: Leaf, zap: Zap, crown: Crown, star: Crown };

export default function AbonnementPage() {
  const { user, register, subscribe } = useUser();
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans]               = useState<typeof PLANS[number][]>([...PLANS]);
  const [faqs, setFaqs]                 = useState(FAQS);
  const [testimonials, setTestimonials] = useState(TESTIMONIALS);
  const [steps, setSteps]               = useState(STEPS);

  useEffect(() => {
    const ac  = new AbortController();
    const tid = setTimeout(() => ac.abort(), 8000);
    const sig = ac.signal;

    fetch('/api/plans', { signal: sig })
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const mapped = json.data.map((p: { _id: string; nom: string; description: string; prixMensuel: number; prixAnnuel: number; tag: string; icone: string; features: { texte: string; inclus: boolean }[]; populaire: boolean }, idx: number) => ({
            id:           p._id,
            num:          String(idx + 1).padStart(2, '0'),
            name:         p.nom,
            icon:         ICON_MAP[(p.icone as IconKey)] ?? Leaf,
            monthlyPrice: p.prixMensuel,
            annualPrice:  p.prixAnnuel,
            tag:          p.tag,
            description:  p.description,
            features:     p.features.map(f => ({ text: f.texte, ok: f.inclus })),
            dark:         p.populaire,
          }));
          setPlans(mapped as typeof PLANS[number][]);
        }
      })
      .catch((err) => { if (err.name !== 'AbortError') console.warn('[AbonnementPage] /api/plans :', err); });

    fetch('/api/faqs?page=abonnement', { signal: sig })
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setFaqs(json.data.map((f: { question: string; reponse: string }) => ({ q: f.question, a: f.reponse })));
        }
      })
      .catch((err) => { if (err.name !== 'AbortError') console.warn('[AbonnementPage] /api/faqs :', err); });

    fetch('/api/testimonials?page=abonnement', { signal: sig })
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setTestimonials(json.data.map((t: { nom: string; texte: string; note: number }) => ({ name: t.nom, text: t.texte, rating: t.note })));
        }
      })
      .catch((err) => { if (err.name !== 'AbortError') console.warn('[AbonnementPage] /api/testimonials :', err); });

    fetch('/api/settings/public', { signal: sig })
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data?.etapesAbonnement) && json.data.etapesAbonnement.length > 0) {
          setSteps(json.data.etapesAbonnement.map((e: { num: string; titre: string; description: string }) => ({ num: e.num, title: e.titre, desc: e.description })));
        }
      })
      .catch((err) => { if (err.name !== 'AbortError') console.warn('[AbonnementPage] /api/settings :', err); });

    return () => { clearTimeout(tid); ac.abort(); };
  }, []);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Checkout modal state
  const [selectedPlan, setSelectedPlan] = useState<(typeof PLANS)[number] | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('account');
  const [form, setForm] = useState({ nom: '', telephone: '', email: '' });
  const [formErrors, setFormErrors] = useState({ nom: '', telephone: '', email: '' });

  const openCheckout = (plan: (typeof PLANS)[number]) => {
    setSelectedPlan(plan);
    setFormErrors({ nom: '', telephone: '', email: '' });
    if (user) {
      setForm({ nom: user.nom, telephone: user.telephone, email: user.email });
      setCheckoutStep('payment');
    } else {
      setForm({ nom: '', telephone: '', email: '' });
      setCheckoutStep('account');
    }
  };

  const closeCheckout = () => {
    if (checkoutStep === 'processing') return;
    setSelectedPlan(null);
  };

  const handleAccountSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors = { nom: '', telephone: '', email: '' };
    if (!form.nom.trim()) errors.nom = 'Nom requis';
    if (!form.telephone.trim()) errors.telephone = 'Téléphone requis';
    if (!form.email.includes('@')) errors.email = 'Email valide requis';
    if (errors.nom || errors.telephone || errors.email) { setFormErrors(errors); return; }
    register(form.nom.trim(), form.telephone.trim(), form.email.trim().toLowerCase());
    setCheckoutStep('payment');
  };

  const handlePayment = async (method: 'card' | 'mobile_money' | 'cash') => {
    if (!selectedPlan) return;
    setCheckoutStep('processing');
    const price = annual ? selectedPlan.annualPrice : selectedPlan.monthlyPrice;
    const totalCharged = annual ? price * 12 : price;
    try {
      const endpoint = method === 'cash' ? '/api/payments/singpay/cash' : '/api/payments/singpay/init';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalCharged,
          paymentMethod: method,
          customer: { name: form.nom, phone: form.telephone, email: form.email },
          description: `Abonnement ${selectedPlan.name} – ${annual ? 'Annuel' : 'Mensuel'}`,
        }),
      });
    } catch { /* API indisponible, on continue quand même */ }

    const sub: Subscription = {
      planId: selectedPlan.id as 'essentiel' | 'vitalite' | 'premium',
      planName: selectedPlan.name,
      billing: annual ? 'annual' : 'monthly',
      startDate: new Date().toLocaleDateString('fr-FR'),
      nextRenewal: nextRenewalDate(annual),
      status: 'active',
      price,
    };
    subscribe(sub);
    toast.success(`Abonnement ${selectedPlan.name} activé !`);
    setCheckoutStep('success');
  };

  return (
    <div className="min-h-screen">

      {/* ══════════════════════════════════════════════════════════
          1. HERO — h-screen, texte ancré en bas-gauche
      ══════════════════════════════════════════════════════════ */}
      <section className="relative h-screen flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={prepImage}
            alt="Chef préparant des légumes frais"
            className="w-full h-full object-cover object-center"
            fetchPriority="high"
            decoding="sync"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/75 via-foreground/20 to-transparent" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="relative z-10 w-full max-w-5xl mx-auto px-6 md:px-12 pb-16 md:pb-24"
        >
          <span className="font-body text-xs uppercase tracking-[0.3em] text-primary mb-4 block">
            Abonnements
          </span>
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl text-primary-foreground leading-[0.95] mb-6">
            Mangez bien,<br />
            <span className="italic">chaque semaine</span>
          </h1>
          <p className="font-display text-xl md:text-2xl text-primary-foreground/75 italic max-w-xl mb-10">
            Salades, jus et repas préparés avec soin, livrés à votre porte — sans engagement.
          </p>
          {/* Boutons alignés horizontalement, même hauteur */}
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="#formules"
              className="font-body text-sm uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl"
            >
              Voir les formules
            </a>
            <Link
              to="/composer"
              className="font-body text-sm uppercase tracking-[0.2em] px-8 py-4 border border-white/40 text-white hover:bg-white/10 transition-colors rounded-xl"
            >
              Commander à la carte
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          2. STATS — 3 colonnes égales, séparateurs visuels
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 md:px-12 bg-muted">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className={`
                  flex flex-col items-center text-center px-8 py-6
                  sm:py-0
                  ${i > 0 ? 'border-t sm:border-t-0 sm:border-l border-border' : ''}
                `}
              >
                <span className="font-display text-5xl md:text-6xl text-primary leading-none mb-3">
                  {s.value}
                </span>
                <p className="font-body text-sm text-muted-foreground uppercase tracking-wider">
                  {s.label}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          3. POURQUOI S'ABONNER — grille 5/7, badge sans overflow
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-12 gap-8 md:gap-16 items-center"
          >
            {/* Image — padding bas sur mobile pour que le badge ne déborde pas */}
            <div className="md:col-span-5 relative pb-6 md:pb-0">
              <img
                src={juicesImage}
                alt="Jus frais La Délicieuse Diète"
                className="w-full aspect-[4/3] object-cover rounded-xl shadow-elevated"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45 }}
                viewport={{ once: true }}
                className="absolute bottom-2 md:-bottom-4 right-2 md:-right-4 bg-primary text-primary-foreground rounded-2xl px-5 py-4 shadow-warm"
              >
                <p className="font-display text-2xl leading-none">+2 000</p>
                <p className="font-body text-xs uppercase tracking-wider opacity-75 mt-1">
                  abonnés satisfaits
                </p>
              </motion.div>
            </div>

            {/* Texte */}
            <div className="md:col-span-7 flex flex-col gap-6">
              <div>
                <span className="font-body text-xs uppercase tracking-[0.25em] text-primary mb-3 block">
                  Pourquoi s'abonner
                </span>
                <h2 className="font-display text-3xl md:text-5xl text-foreground leading-tight">
                  Plus qu'une commande,<br />
                  <span className="text-primary italic">un mode de vie</span>
                </h2>
              </div>
              <p className="font-body text-base md:text-lg text-muted-foreground leading-relaxed">
                Avec un abonnement La Délicieuse Diète, chaque semaine est planifiée pour vous.
                Vous choisissez vos produits, nous préparons et livrons — frais, ponctuel, sans effort.
              </p>
              <ul className="flex flex-col gap-3">
                {[
                  'Livraison offerte sur toutes les commandes',
                  'Sélection hebdomadaire entièrement personnalisable',
                  'Priorité sur les ingrédients premium du marché',
                  'Points fidélité multipliés × 2 ou × 3',
                ].map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    viewport={{ once: true }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="font-body text-sm text-foreground">{item}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          4. FORMULES — toggle + 3 cards égales en hauteur
      ══════════════════════════════════════════════════════════ */}
      <section id="formules" className="py-20 md:py-28 px-6 md:px-12 bg-muted">
        <div className="max-w-6xl mx-auto">

          {/* En-tête centré */}
          <div className="flex flex-col items-center text-center gap-4 mb-14">
            <motion.h2
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="font-display text-3xl md:text-5xl text-foreground"
            >
              Choisissez votre formule
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              viewport={{ once: true }}
              className="font-body text-muted-foreground"
            >
              Résiliable à tout moment · Pas de frais cachés
            </motion.p>

            {/* Toggle mensuel / annuel */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-4 bg-background border border-border rounded-full px-6 py-3 shadow-soft"
            >
              <button
                onClick={() => setAnnual(false)}
                className={`font-body text-sm transition-colors ${!annual ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
              >
                Mensuel
              </button>

              {/* Switch */}
              <button
                onClick={() => setAnnual(a => !a)}
                aria-label="Basculer facturation annuelle"
                className={`relative w-11 h-6 rounded-full transition-colors duration-300 shrink-0 ${annual ? 'bg-primary' : 'bg-border'}`}
              >
                <motion.span
                  animate={{ x: annual ? 22 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="absolute top-1 w-4 h-4 rounded-full bg-white shadow block"
                />
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAnnual(true)}
                  className={`font-body text-sm transition-colors ${annual ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                >
                  Annuel
                </button>
                <span className="font-body text-[10px] uppercase tracking-wider bg-primary text-primary-foreground px-2.5 py-1 rounded-full">
                  −20 %
                </span>
              </div>
            </motion.div>
          </div>

          {/* Grille 3 cards — hauteurs égales grâce à items-stretch */}
          <div className="grid md:grid-cols-3 gap-6 md:gap-8 items-stretch">
            {plans.map((plan, i) => {
              const Icon = plan.icon;
              const price = annual ? plan.annualPrice : plan.monthlyPrice;
              const isActive = user?.subscription?.planId === plan.id && user?.subscription?.status === 'active';

              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  whileHover={{ y: -6, transition: { duration: 0.22 } }}
                  className={`
                    flex flex-col rounded-2xl overflow-hidden
                    ${plan.dark
                      ? 'bg-foreground shadow-elevated'
                      : 'bg-background border border-border shadow-soft hover:shadow-elevated transition-shadow duration-300'
                    }
                  `}
                >
                  {/* Barre accentuée en haut uniquement pour la card dark */}
                  {plan.dark && <div className="h-1 w-full bg-primary shrink-0" />}

                  {/* Corps de la card — flex col avec espace automatique */}
                  <div className="flex flex-col flex-1 p-7 gap-6">

                    {/* Tag + numéro décoratif */}
                    <div className="flex items-center justify-between">
                      <span className={`
                        font-body text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 rounded-full
                        ${plan.dark ? 'bg-white/10 text-white/70' : 'bg-primary/10 text-primary'}
                      `}>
                        {plan.tag}
                      </span>
                      <span className={`font-display text-5xl leading-none opacity-20 ${plan.dark ? 'text-white' : 'text-foreground'}`}>
                        {plan.num}
                      </span>
                    </div>

                    {/* Icône + nom */}
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${plan.dark ? 'bg-white/10' : 'bg-primary/10'}`}>
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className={`font-display text-2xl ${plan.dark ? 'text-white' : 'text-foreground'}`}>
                        {plan.name}
                      </h3>
                    </div>

                    {/* Description */}
                    <p className={`font-body text-sm leading-relaxed ${plan.dark ? 'text-white/60' : 'text-muted-foreground'}`}>
                      {plan.description}
                    </p>

                    {/* Prix avec transition AnimatePresence */}
                    <div className={`pb-6 border-b ${plan.dark ? 'border-white/10' : 'border-border'}`}>
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`${plan.id}-${annual}`}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.18 }}
                          className="flex items-baseline gap-2"
                        >
                          <span className={`font-display text-4xl leading-none ${plan.dark ? 'text-white' : 'text-foreground'}`}>
                            {fmt(price)}
                          </span>
                          <span className={`font-body text-sm ${plan.dark ? 'text-white/50' : 'text-muted-foreground'}`}>
                            / mois
                          </span>
                        </motion.div>
                      </AnimatePresence>
                      {annual && (
                        <p className={`font-body text-xs mt-1.5 ${plan.dark ? 'text-white/40' : 'text-muted-foreground/60'}`}>
                          Facturé {fmt(price * 12)} / an
                        </p>
                      )}
                    </div>

                    {/* Features — flex-1 pour pousser le CTA en bas */}
                    <ul className="flex flex-col gap-3 flex-1">
                      {plan.features.map(f => (
                        <li key={f.text} className="flex items-center gap-3">
                          <div className={`
                            w-4 h-4 rounded-full flex items-center justify-center shrink-0
                            ${f.ok
                              ? plan.dark ? 'bg-primary/30' : 'bg-primary/15'
                              : 'bg-border/50'
                            }
                          `}>
                            {f.ok
                              ? <Check className="w-2.5 h-2.5 text-primary" />
                              : <X className="w-2.5 h-2.5 text-muted-foreground/40" />
                            }
                          </div>
                          <span className={`font-body text-sm leading-snug ${
                            f.ok
                              ? plan.dark ? 'text-white/80' : 'text-foreground'
                              : plan.dark ? 'text-white/25' : 'text-muted-foreground/40'
                          }`}>
                            {f.text}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={isActive ? undefined : () => openCheckout(plan)}
                      disabled={isActive}
                      className={`
                        w-full font-body text-sm uppercase tracking-[0.15em] px-8 py-4 rounded-xl
                        transition-colors flex items-center justify-center gap-2
                        ${isActive
                          ? plan.dark
                            ? 'bg-white/15 text-white/60 cursor-default'
                            : 'bg-primary/10 text-primary/60 cursor-default border-2 border-primary/20'
                          : plan.dark
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground'
                        }
                      `}
                    >
                      {isActive ? (
                        <><Check className="w-4 h-4" /> Abonnement actif</>
                      ) : (
                        'Choisir cette formule'
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          5. COMMENT ÇA MARCHE — numéros géants, CTA centré
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="font-display text-3xl md:text-5xl text-foreground mb-16 text-center"
          >
            Comment ça marche
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-10 md:gap-16">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.15 }}
                viewport={{ once: true }}
                className="flex flex-col items-center text-center gap-2"
              >
                <span className="font-display text-6xl md:text-7xl text-primary/20 leading-none">
                  {step.num}
                </span>
                <h3 className="font-display text-2xl text-foreground mt-2">{step.title}</h3>
                <p className="font-body text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="flex justify-center mt-14">
            <a
              href="#formules"
              className="inline-flex items-center gap-2 font-body text-sm uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl"
            >
              Voir les formules <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          6. GRILLE PRODUITS — 7/5 colonnes, hauteurs alignées
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 md:px-12 bg-muted">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="font-display text-3xl md:text-5xl text-foreground mb-16 text-center"
          >
            Ce qui est inclus dans votre abonnement
          </motion.h2>

          {/* Grille asymétrique — items-stretch pour hauteurs égales entre colonnes */}
          <div className="grid md:grid-cols-12 gap-6 md:gap-8 items-stretch">

            {/* Colonne gauche 7/12 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              viewport={{ once: true }}
              className="md:col-span-7 group"
            >
              <Link
                to="/composer"
                className="block relative w-full h-full min-h-[280px] overflow-hidden rounded-xl"
              >
                <img
                  src={prepImage}
                  alt="Homme noir préparant des légumes frais"
                  className="absolute inset-0 w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6 md:p-10">
                  <span className="font-body text-xs uppercase tracking-[0.2em] text-secondary mb-2 block">
                    Inclus dans toutes les formules
                  </span>
                  <h3 className="font-display text-3xl md:text-4xl text-primary-foreground">
                    Salades sur mesure
                  </h3>
                </div>
              </Link>
            </motion.div>

            {/* Colonne droite 5/12 — deux cartes à hauteur égale via flex */}
            <div className="md:col-span-5 flex flex-col gap-6 md:gap-8">

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                viewport={{ once: true }}
                className="group flex-1"
              >
                <Link
                  to="/jus"
                  className="block relative w-full h-full min-h-[160px] overflow-hidden rounded-xl"
                >
                  <img
                    src={juicesImage}
                    alt="Jus détox et fruits"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6">
                    <span className="font-body text-xs uppercase tracking-[0.2em] text-secondary mb-2 block">
                      Inclus dès l'Essentiel
                    </span>
                    <h3 className="font-display text-2xl md:text-3xl text-primary-foreground">
                      Jus détox
                    </h3>
                  </div>
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                viewport={{ once: true }}
                className="group flex-1"
              >
                <Link
                  to="/dieteticien"
                  className="block relative w-full h-full min-h-[160px] overflow-hidden rounded-xl"
                >
                  <img
                    src={prepCloseImage}
                    alt="Mains coupant des légumes verts frais"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6">
                    <span className="font-body text-xs uppercase tracking-[0.2em] text-secondary mb-2 block">
                      Formule Premium
                    </span>
                    <h3 className="font-display text-2xl md:text-3xl text-primary-foreground">
                      Consultation diét.
                    </h3>
                  </div>
                </Link>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          7. TÉMOIGNAGES — cards hauteur égale, quote flex-1
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="font-display text-3xl md:text-5xl text-foreground mb-16 text-center"
          >
            Ce que disent nos abonnés
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-8 items-stretch">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="flex flex-col gap-4 bg-background p-8 border border-border rounded-xl hover:shadow-elevated transition-shadow duration-300"
              >
                {/* Étoiles */}
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, si) => (
                    <Star
                      key={si}
                      className={`w-4 h-4 ${si < t.rating ? 'text-primary fill-primary' : 'text-border'}`}
                    />
                  ))}
                </div>
                {/* Quote — flex-1 pour équilibrer la hauteur des cards */}
                <p className="font-body text-sm text-muted-foreground leading-relaxed italic flex-1">
                  « {t.text} »
                </p>
                {/* Auteur toujours en bas */}
                <p className="font-display text-base text-foreground">{t.name}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          7b. LAISSER UN AVIS
      ══════════════════════════════════════════════════════════ */}
      <section className="py-16 md:py-20 px-6 md:px-12 bg-muted/50">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            <span className="font-body text-xs uppercase tracking-[0.25em] text-primary mb-3 block">
              Votre expérience
            </span>
            <h2 className="font-display text-3xl text-foreground mb-2">
              Laissez votre témoignage
            </h2>
            <p className="font-body text-sm text-muted-foreground">
              Partagez votre expérience — votre avis sera publié après validation.
            </p>
          </motion.div>
          <div className="bg-background border border-border rounded-2xl p-7">
            <TestimonialSubmitForm page="abonnement" />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          8. FAQ — max-w-2xl, fond blanc, padding uniforme
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 md:px-12 bg-muted">
        <div className="max-w-2xl mx-auto">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="font-display text-3xl md:text-5xl text-foreground mb-12 text-center"
          >
            Questions fréquentes
          </motion.h2>
          <div className="bg-background rounded-2xl px-6 md:px-8 shadow-soft">
            {faqs.map(f => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          9. CTA FINAL — dark, formulaire + 2 boutons uniformes
      ══════════════════════════════════════════════════════════ */}
      <section className="py-24 md:py-32 px-6 md:px-12 bg-foreground">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto flex flex-col items-center text-center gap-8"
        >
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-4xl md:text-6xl text-primary-foreground italic">
              « Soyez parmi les premiers »
            </h2>
            <p className="font-body text-primary-foreground/60 text-lg leading-relaxed">
              Les abonnements ouvrent très prochainement. Laissez votre email
              pour être notifié en avant-première avec une offre de lancement exclusive.
            </p>
          </div>

          {/* Formulaire email */}
          <div className="w-full max-w-md">
            <AnimatePresence mode="wait">
              {!submitted ? (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={e => { e.preventDefault(); if (email.trim()) setSubmitted(true); }}
                  className="flex flex-col sm:flex-row gap-3 w-full"
                >
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    required
                    className="flex-1 min-w-0 bg-white/10 border border-white/20 text-white placeholder:text-white/40 rounded-xl px-5 py-4 font-body text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    type="submit"
                    className="shrink-0 font-body text-sm uppercase tracking-[0.15em] px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl"
                  >
                    Me notifier
                  </button>
                </motion.form>
              ) : (
                <motion.div
                  key="ok"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-3 w-full bg-primary/20 border border-primary/30 rounded-xl px-6 py-4"
                >
                  <Check className="w-5 h-5 text-primary shrink-0" />
                  <p className="font-body text-sm text-white/80">
                    Parfait ! Vous serez notifié dès le lancement.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Boutons secondaires — même hauteur, même padding */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
            <Link
              to="/composer"
              className="flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl w-full sm:w-auto"
            >
              Commander à la carte <ArrowRight className="w-4 h-4 shrink-0" />
            </Link>
            <Link
              to="/dieteticien"
              className="flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.2em] px-8 py-4 border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors rounded-xl w-full sm:w-auto"
            >
              Voir les consultations
            </Link>
          </div>
        </motion.div>
      </section>

      <Footer />

      {/* ══════════════════════════════════════════════════════════
          CHECKOUT MODAL
      ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeCheckout(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-background rounded-2xl shadow-elevated w-full max-w-md relative overflow-hidden"
            >
              {/* Close button */}
              {checkoutStep !== 'processing' && (
                <button
                  onClick={closeCheckout}
                  className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}

              {/* Plan summary header */}
              {checkoutStep !== 'success' && (
                <div className={`px-7 pt-7 pb-5 border-b border-border ${checkoutStep === 'processing' ? 'pt-7' : ''}`}>
                  <p className="font-body text-xs uppercase tracking-[0.2em] text-primary mb-1">
                    Formule sélectionnée
                  </p>
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-2xl text-foreground">{selectedPlan.name}</h2>
                    <div className="text-right">
                      <p className="font-display text-xl text-primary">
                        {fmt(annual ? selectedPlan.annualPrice : selectedPlan.monthlyPrice)}
                        <span className="font-body text-sm text-muted-foreground"> / mois</span>
                      </p>
                      {annual && (
                        <p className="font-body text-xs text-muted-foreground">
                          {fmt((annual ? selectedPlan.annualPrice : selectedPlan.monthlyPrice) * 12)} / an
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step: Account ── */}
              {checkoutStep === 'account' && (
                <form onSubmit={handleAccountSubmit} className="px-7 py-6 flex flex-col gap-5">
                  <div>
                    <h3 className="font-display text-xl text-foreground mb-1">Votre compte</h3>
                    <p className="font-body text-sm text-muted-foreground">
                      Pour activer votre abonnement, nous avons besoin de quelques informations.
                    </p>
                  </div>
                  {(['nom', 'telephone', 'email'] as const).map(field => (
                    <div key={field}>
                      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">
                        {field === 'nom' ? 'Nom complet' : field === 'telephone' ? 'Téléphone' : 'Email'}
                      </label>
                      <input
                        type={field === 'email' ? 'email' : field === 'telephone' ? 'tel' : 'text'}
                        value={form[field]}
                        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                        placeholder={field === 'nom' ? 'Votre nom' : field === 'telephone' ? '+241 ...' : 'vous@email.com'}
                        className={`w-full font-body text-sm px-4 py-3 border rounded-xl bg-background outline-none transition-colors
                          ${formErrors[field] ? 'border-red-400' : 'border-border focus:border-primary'}`}
                      />
                      {formErrors[field] && (
                        <p className="font-body text-xs text-red-500 mt-1">{formErrors[field]}</p>
                      )}
                    </div>
                  ))}
                  <button
                    type="submit"
                    className="w-full font-body text-sm uppercase tracking-[0.15em] px-8 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl mt-1 flex items-center justify-center gap-2"
                  >
                    Continuer <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* ── Step: Payment ── */}
              {checkoutStep === 'payment' && (
                <div className="px-7 py-6 flex flex-col gap-5">
                  <div>
                    <h3 className="font-display text-xl text-foreground mb-1">Mode de paiement</h3>
                    <p className="font-body text-sm text-muted-foreground">
                      Bonjour {form.nom.split(' ')[0]}, choisissez comment régler votre abonnement.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    {[
                      { method: 'card' as const, icon: CreditCard, label: 'Carte bancaire', sub: 'Visa, Mastercard' },
                      { method: 'mobile_money' as const, icon: Smartphone, label: 'Mobile Money', sub: 'Airtel, Moov' },
                      { method: 'cash' as const, icon: Banknote, label: 'Paiement sur place', sub: 'En boutique à Libreville' },
                    ].map(({ method, icon: Icon, label, sub }) => (
                      <button
                        key={method}
                        onClick={() => handlePayment(method)}
                        className="flex items-center gap-4 p-4 border border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-colors text-left group"
                      >
                        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-body text-sm font-semibold text-foreground">{label}</p>
                          <p className="font-body text-xs text-muted-foreground">{sub}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto group-hover:text-primary transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step: Processing ── */}
              {checkoutStep === 'processing' && (
                <div className="px-7 py-16 flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="font-display text-xl text-foreground">Activation en cours…</p>
                  <p className="font-body text-sm text-muted-foreground text-center">
                    Patientez, nous configurons votre abonnement.
                  </p>
                </div>
              )}

              {/* ── Step: Success ── */}
              {checkoutStep === 'success' && user?.subscription && (
                <div className="px-7 py-8 flex flex-col items-center gap-6 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.1 }}
                    className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"
                  >
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                  </motion.div>

                  <div>
                    <h3 className="font-display text-3xl text-foreground mb-2">Abonnement activé !</h3>
                    <p className="font-body text-sm text-muted-foreground">
                      Bienvenue dans la formule <span className="text-foreground font-semibold">{user.subscription.planName}</span>.
                    </p>
                  </div>

                  <div className="w-full bg-muted rounded-xl p-5 text-left flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <span className="font-body text-xs text-muted-foreground uppercase tracking-wider">Formule</span>
                      <span className="font-display text-base text-foreground">{user.subscription.planName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-body text-xs text-muted-foreground uppercase tracking-wider">Facturation</span>
                      <span className="font-body text-sm text-foreground capitalize">{user.subscription.billing === 'annual' ? 'Annuelle (−20 %)' : 'Mensuelle'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-body text-xs text-muted-foreground uppercase tracking-wider">Montant / mois</span>
                      <span className="font-display text-base text-primary">{fmt(user.subscription.price)}</span>
                    </div>
                    <div className="border-t border-border pt-3 flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-body text-xs text-muted-foreground uppercase tracking-wider">Prochain renouvellement</span>
                      </div>
                      <span className="font-body text-sm text-foreground">{user.subscription.nextRenewal}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 w-full">
                    <button
                      onClick={closeCheckout}
                      className="flex-1 font-body text-sm uppercase tracking-[0.15em] px-6 py-3 border border-border text-muted-foreground hover:text-foreground transition-colors rounded-xl"
                    >
                      Fermer
                    </button>
                    <Link
                      to="/mon-compte"
                      onClick={closeCheckout}
                      className="flex-1 font-body text-sm uppercase tracking-[0.15em] px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl text-center"
                    >
                      Voir mon compte
                    </Link>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
