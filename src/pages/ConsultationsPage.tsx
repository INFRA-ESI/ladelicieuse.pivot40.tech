import { useState, useEffect, type FormEvent } from 'react';
import SmartImage from '@/components/SmartImage';
import PageIntro, { introPrimaryClass, introSecondaryClass } from '@/components/PageIntro';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Stethoscope, MessageCircle, ChevronDown, X, ArrowRight,
  CheckCircle2, Star, Award, Users, Clock, CalendarDays,
  Loader2, ShoppingCart,
} from '@/components/icons';
import { useCart } from '@/context/CartContext';
import { useUser, TOKEN_KEY } from '@/context/UserContext';
import { ls } from '@/lib/storage';
import { formatPrixFcfa as fmt } from '@/lib/fcfa';
import { toast } from 'sonner';
import Footer from '@/components/Footer';
import balancedMealImg from '@/assets/balanced-meal.webp';
import TestimonialSubmitForm from '@/components/TestimonialSubmitForm';
import { cachedJson } from '@/services/publicApiService';
import { STORE_WHATSAPP } from '@/lib/config';
import bilanSuiviImg from '@/assets/consultations/bilan-suivi.webp';
import pertePoids from '@/assets/consultations/perte-poids.webp';
import prisePoids from '@/assets/consultations/prise-poids.webp';
import maladieChroniqueImg from '@/assets/consultations/maladie-chronique.webp';
import femmeEnceinteImg from '@/assets/consultations/femme-enceinte.webp';
import expressImg from '@/assets/consultations/express.webp';

// ─── Data ─────────────────────────────────────────────────────────────────────

// `price` = tarif téléconsultation ; le présentiel est facturé 25 000 FCFA (valeur de repli hors API).
const PRESENTIEL_PRICE = 25000;

const CONSULTATIONS_BASE = [
  {
    id: 'consult-perte-poids',
    title: 'Perte de poids équilibrée',
    description: 'Plan alimentaire sur mesure pour maigrir durablement, sans frustration ni carence nutritionnelle.',
    price: 15000,
    duration: '60 min',
    image: pertePoids,
    tag: 'Populaire',
  },
  {
    id: 'consult-prise-poids',
    title: 'Prise de masse saine',
    description: 'Programme nutritionnel pour prendre du poids et renforcer la masse musculaire de façon équilibrée.',
    price: 15000,
    duration: '60 min',
    image: prisePoids,
    tag: null,
  },
  {
    id: 'consult-maladie-chronique',
    title: 'Maladie chronique',
    description: 'Suivi diététique spécialisé : diabète, hypertension, obésité et autres pathologies métaboliques.',
    price: 15000,
    duration: '60 min',
    image: maladieChroniqueImg,
    tag: 'Spécialisé',
  },
  {
    id: 'consult-femme-enceinte',
    title: 'Femme enceinte',
    description: 'Accompagnement nutritionnel adapté à chaque trimestre pour la santé de la mère et du bébé.',
    price: 15000,
    duration: '60 min',
    image: femmeEnceinteImg,
    tag: null,
  },
  {
    id: 'consult-express',
    title: 'Consultation express',
    description: 'Avis nutritionnel ciblé et réponses rapides à vos questions urgentes en alimentation.',
    price: 15000,
    duration: '30 min',
    image: expressImg,
    tag: 'Rapide',
  },
  {
    id: 'consult-bilan-suivi',
    title: 'Bilan & Suivi personnalisé',
    description: 'Bilan nutritionnel complet, objectifs chiffrés et suivi mensuel de vos progrès.',
    price: 15000,
    duration: '90 min',
    image: bilanSuiviImg,
    tag: 'Complet',
  },
];

const CONSULTATIONS = CONSULTATIONS_BASE.map(c => ({ ...c, presentielPrice: PRESENTIEL_PRICE }));

type BookingMode = 'virtuel' | 'presentiel';
const priceFor = (c: { price: number; presentielPrice: number }, mode: string) =>
  mode === 'presentiel' ? c.presentielPrice : c.price;

const STATS = [
  { value: '500+', label: 'patients accompagnés', icon: Users },
  { value: '10 ans', label: "d'expérience clinique", icon: Award },
  { value: '6', label: 'types de consultation', icon: Stethoscope },
];

const PROCESS_STEPS = [
  { num: '01', title: 'Réservation', desc: 'Choisissez votre type de consultation et un créneau disponible depuis cette page.' },
  { num: '02', title: 'Anamnèse', desc: 'Échange sur vos habitudes alimentaires, antécédents médicaux et objectifs de santé.' },
  { num: '03', title: 'Plan personnalisé', desc: 'Vous recevez un programme nutritionnel adapté à votre profil, vos goûts et votre mode de vie.' },
  { num: '04', title: 'Suivi', desc: 'Des séances de suivi régulières pour ajuster le plan et maintenir la motivation dans la durée.' },
];

const TESTIMONIALS = [
  {
    name: 'Sandrine M.',
    text: 'Grâce au Dr. BATTY, j\'ai perdu 8 kg en 3 mois sans me priver. Son approche bienveillante et ses conseils pratiques ont tout changé.',
    rating: 5,
  },
  {
    name: 'Jean-Claude O.',
    text: 'Diabétique depuis 4 ans, je n\'avais jamais eu un suivi aussi personnalisé. Mon taux de glycémie est stable et je me sens en pleine forme.',
    rating: 5,
  },
  {
    name: 'Chloé A.',
    text: 'Le suivi grossesse m\'a aidée à manger mieux sans stress. Mon bébé est né en parfaite santé et j\'ai retrouvé mon poids rapidement après.',
    rating: 5,
  },
];

const FAQS = [
  { q: 'Quelle est la durée d\'une consultation standard ?', a: 'Les consultations standard durent 60 minutes. La consultation express dure 30 minutes et le bilan complet peut aller jusqu\'à 90 minutes selon le profil du patient.' },
  { q: 'Les consultations se font-elles en présentiel ou en ligne ?', a: 'Les deux options sont disponibles. En présentiel au cabinet de Libreville (Quartier Louis) ou en téléconsultation via WhatsApp / visioconférence, selon votre préférence.' },
  { q: 'Combien de séances sont généralement nécessaires ?', a: 'En moyenne, 3 à 6 séances suffisent pour un rééquilibrage alimentaire. Pour les maladies chroniques, un suivi mensuel sur 6 à 12 mois est recommandé pour des résultats durables.' },
  { q: 'Que dois-je préparer avant ma consultation ?', a: 'Notez vos habitudes alimentaires des 3 derniers jours, vos antécédents médicaux et vos objectifs. Pour les maladies chroniques, apportez vos derniers bilans sanguins.' },
  { q: 'Les abonnés La Délicieuse Diète bénéficient-ils d\'un avantage ?', a: 'Oui. Les abonnés Premium bénéficient d\'une consultation mensuelle incluse dans leur formule. Les abonnés Vitalité accèdent au suivi nutritionnel en ligne.' },
];

const TIME_SLOTS = ['08h00', '09h00', '10h00', '11h00', '14h00', '15h00', '16h00', '17h00'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── FaqItem ──────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-center justify-between gap-6 py-5 group"
      >
        <span className="font-display text-xl text-foreground group-hover:text-primary transition-colors">{q}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }} className="shrink-0">
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
            <p className="font-body text-sm text-muted-foreground leading-relaxed pb-5">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConsultationsPage() {
  const { addItem } = useCart();
  const { user } = useUser();

  const [consultations, setConsultations] = useState(CONSULTATIONS);
  const [faqs, setFaqs]                   = useState(FAQS);
  const [testimonials, setTestimonials]   = useState(TESTIMONIALS);
  const [processSteps, setProcessSteps]   = useState(PROCESS_STEPS);
  const [doctor, setDoctor] = useState({
    nom:         'Dr. Carlos BATTY',
    titre:       'Diététicien Nutritionniste',
    bio:         'Diététicien nutritionniste spécialisé en sécurité alimentaire, le Dr. BATTY accompagne ses patients gabonais vers une alimentation saine, équilibrée et adaptée à leurs réalités culturelles et médicales.',
    experience:  '10+',
    credentials: [
      'Master en Sciences de l\'Alimentation et Nutrition',
      'Spécialisation en sécurité alimentaire appliquée',
      'Prise en charge des maladies métaboliques et chroniques',
      'Suivi nutritionnel périnatal (grossesse & post-partum)',
    ],
    photo: '',
  });
  const [pageLoading, setPageLoading]     = useState(true);

  useEffect(() => {
    const p1 = cachedJson('/api/consultations')
      .then(json => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setConsultations(json.data.map((c: { _id: string; titre: string; description: string; prix: number; prixPresentiel?: number; duree: string; tag?: string; image?: string }) => ({
            id:          c._id,
            title:       c.titre,
            description: c.description,
            price:       c.prix,
            presentielPrice: c.prixPresentiel ?? PRESENTIEL_PRICE,
            duration:    c.duree,
            tag:         c.tag || null,
            image:       c.image || balancedMealImg,
          })));
        }
      })
      .catch(() => {});

    const p2 = cachedJson('/api/faqs?page=consultations')
      .then(json => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setFaqs(json.data.map((f: { question: string; reponse: string }) => ({ q: f.question, a: f.reponse })));
        }
      })
      .catch(() => {});

    const p3 = cachedJson('/api/testimonials?page=consultations')
      .then(json => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setTestimonials(json.data.map((t: { nom: string; texte: string; note: number }) => ({ name: t.nom, text: t.texte, rating: t.note })));
        }
      })
      .catch(() => {});

    const p4 = cachedJson('/api/settings/public')
      .then(json => {
        if (!json.success || !json.data) return;
        const d = json.data;
        if (Array.isArray(d.etapesConsultation) && d.etapesConsultation.length > 0) {
          setProcessSteps(d.etapesConsultation.map((e: { num: string; titre: string; description: string }) => ({ num: e.num, title: e.titre, desc: e.description })));
        }
        if (d.dieteticienNom) {
          setDoctor(prev => ({
            nom:         d.dieteticienNom         || prev.nom,
            titre:       d.dieteticienTitre        || prev.titre,
            bio:         d.dieteticienBio          || prev.bio,
            experience:  d.dieteticienExperience   || prev.experience,
            credentials: Array.isArray(d.dieteticienCredentials) && d.dieteticienCredentials.length > 0
              ? d.dieteticienCredentials : prev.credentials,
            photo:       d.dieteticienPhoto        || prev.photo,
          }));
        }
      })
      .catch(() => {});

    Promise.allSettled([p1, p2, p3, p4]).then(() => setPageLoading(false));
  }, []);

  const [selectedConsult, setSelectedConsult] = useState<typeof CONSULTATIONS[0] | null>(null);
  const [bookingStep, setBookingStep] = useState<'form' | 'processing' | 'success'>('form');
  const [bookingForm, setBookingForm] = useState({ nom: '', email: '', telephone: '', date: '', time: '', mode: 'virtuel' });
  const [formErrors, setFormErrors] = useState({ nom: '', email: '', telephone: '', date: '', time: '' });

  const openBooking = (c: typeof CONSULTATIONS[0]) => {
    setSelectedConsult(c);
    setBookingStep('form');
    setFormErrors({ nom: '', email: '', telephone: '', date: '', time: '' });
    const fullNom = user ? `${user.prenoms ?? ''} ${user.nom ?? ''}`.trim() : '';
    setBookingForm({ nom: fullNom || '', email: user?.email ?? '', telephone: user?.telephone ?? '', date: '', time: '', mode: 'virtuel' });
  };

  const closeBooking = () => {
    if (bookingStep === 'processing') return;
    setSelectedConsult(null);
  };

  const handleBookingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = { nom: '', email: '', telephone: '', date: '', time: '' };
    if (!bookingForm.nom.trim())       errors.nom       = 'Nom requis';
    if (!bookingForm.telephone.trim()) errors.telephone = 'Téléphone requis';
    if (!bookingForm.date)             errors.date      = 'Date requise';
    if (!bookingForm.time)             errors.time      = 'Créneau requis';
    if (Object.values(errors).some(Boolean)) { setFormErrors(errors); return; }

    setBookingStep('processing');

    // Enregistre la réservation en base (sans attendre, ne bloque pas l'interface)
    if (selectedConsult) {
      const token = user ? (ls.get(TOKEN_KEY) ?? '') : '';
      fetch('/api/consultation-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          userId:        user?.id ?? undefined,
          userNom:       bookingForm.nom.trim(),
          userEmail:     bookingForm.email.trim() || 'non-renseigne@ladelicieuse.com',
          userTelephone: bookingForm.telephone.trim(),
          consultationId: selectedConsult.id.startsWith('consult-') ? undefined : selectedConsult.id,
          titre:         selectedConsult.title,
          prix:          priceFor(selectedConsult, bookingForm.mode),
          date:          new Date(bookingForm.date).toISOString(),
          creneau:       bookingForm.time,
          mode:          bookingForm.mode,
        }),
      }).catch(err => console.warn('[ConsultationsPage] Booking DB save failed:', err));
    }

    await new Promise(r => setTimeout(r, 900));

    if (selectedConsult) {
      addItem({
        id: selectedConsult.id,
        type: 'consultation',
        meta: { consultationId: selectedConsult.id, mode: bookingForm.mode as 'virtuel' | 'presentiel' },
        name: `${selectedConsult.title} — ${bookingForm.date} à ${bookingForm.time}`,
        totalPrice: priceFor(selectedConsult, bookingForm.mode),
        totalCalories: 0,
        quantity: 1,
      });
      toast.success(`Consultation réservée — ${bookingForm.date} à ${bookingForm.time}`);
    }
    setBookingStep('success');
  };

  return (
    <div className="min-h-screen">

      {/* ══════════════════════════════════════════════════════════
          1. HERO
      ══════════════════════════════════════════════════════════ */}
      {user ? (
        <PageIntro
          clearBar
          eyebrow={pageLoading ? undefined : `${doctor.nom} · ${doctor.titre}`}
          title="Nutrition personnalisée"
          subtitle="Spécialisé en sécurité alimentaire — des conseils sur mesure pour votre santé à Libreville."
          actions={<>
            <a href="#consultations" className={introPrimaryClass}>Prendre rendez-vous</a>
            <a href="#profil" className={introSecondaryClass}>En savoir plus</a>
          </>}
        />
      ) : (
      <section className="relative min-h-[60vh] md:min-h-[64vh] pt-28 flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <img src={balancedMealImg} alt="Nutrition équilibrée" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/25 to-transparent" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="relative z-10 w-full max-w-5xl mx-auto px-6 md:px-12 pb-10 md:pb-14"
        >
          {pageLoading ? (
            <div className="h-10 w-80 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full mb-6 animate-pulse" />
          ) : (
            <div className="inline-flex items-center gap-2 bg-primary/20 backdrop-blur-sm border border-primary/30 text-primary px-4 py-2 rounded-full mb-6">
              <Stethoscope className="w-4 h-4" />
              <span className="font-body text-sm">{doctor.nom} · {doctor.titre}</span>
            </div>
          )}
          <h1 className="font-display text-4xl md:text-6xl lg:text-7xl text-primary-foreground leading-[0.95] mb-6">
            Nutrition<br />
            <span>personnalisée</span>
          </h1>
          <p className="font-display text-xl md:text-2xl text-primary-foreground/75 max-w-xl mb-10">
            Spécialisé en sécurité alimentaire — des conseils sur mesure pour votre santé à Libreville.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="#consultations"
              className="font-body text-sm px-8 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl"
            >
              Prendre rendez-vous
            </a>
            <a
              href="#profil"
              className="font-body text-sm px-8 py-4 border border-white/40 text-white hover:bg-white/10 transition-colors rounded-xl"
            >
              En savoir plus
            </a>
          </div>
        </motion.div>
      </section>
      )}

      {/* ══════════════════════════════════════════════════════════
          2. PROFIL DU MÉDECIN
      ══════════════════════════════════════════════════════════ */}
      <section id="profil" className="py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          {pageLoading ? (
            <div className="grid md:grid-cols-12 gap-8 md:gap-6 lg:gap-16 items-center animate-pulse">
              <div className="md:col-span-5">
                <div className="w-full aspect-[4/3] bg-muted rounded-xl" />
              </div>
              <div className="md:col-span-7 flex flex-col gap-5">
                <div className="h-3 w-20 bg-muted rounded" />
                <div className="h-10 w-56 bg-muted rounded" />
                <div className="space-y-2">
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-4/5 bg-muted rounded" />
                  <div className="h-4 w-3/4 bg-muted rounded" />
                </div>
                {[0,1,2,3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-muted shrink-0" />
                    <div className="h-4 bg-muted rounded flex-1" />
                  </div>
                ))}
                <div className="h-12 w-48 bg-muted rounded-xl" />
              </div>
            </div>
          ) : (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-12 gap-8 md:gap-6 lg:gap-16 items-center"
          >
            {/* Image */}
            <div className="md:col-span-5 relative pb-6 md:pb-0">
              <img
                src={doctor.photo || bilanSuiviImg}
                alt={doctor.nom}
                className="w-full aspect-[4/3] object-cover rounded-xl shadow-elevated"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                viewport={{ once: true }}
                className="absolute bottom-2 md:-bottom-4 right-2 md:-right-4 bg-primary text-primary-foreground rounded-2xl px-5 py-4 shadow-warm"
              >
                <p className="font-display text-2xl leading-none">{doctor.experience}</p>
                <p className="font-body text-xs opacity-75 mt-1">ans d'expérience</p>
              </motion.div>
            </div>

            {/* Texte */}
            <div className="md:col-span-7 flex flex-col gap-6">
              <div>
                <span className="font-body text-xs text-primary mb-3 block">Votre spécialiste</span>
                <h2 className="font-display text-3xl md:text-5xl text-foreground leading-tight">
                  {doctor.nom}
                </h2>
              </div>
              <p className="font-body text-base md:text-lg text-muted-foreground leading-relaxed">
                {doctor.bio}
              </p>
              <ul className="flex flex-col gap-3">
                {doctor.credentials.map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    viewport={{ once: true }}
                    className="flex items-start gap-3"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3 h-3 text-primary" />
                    </div>
                    <span className="font-body text-sm text-foreground">{item}</span>
                  </motion.li>
                ))}
              </ul>
              <a
                href={`https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(`Bonjour ${doctor.nom}, je souhaite prendre un rendez-vous pour une consultation nutritionnelle.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-body text-sm px-8 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl w-fit"
              >
                <MessageCircle className="w-4 h-4" />
                Contacter via WhatsApp
              </a>
            </div>
          </motion.div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          3. STATS
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 md:px-12 bg-muted">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            {STATS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  viewport={{ once: true }}
                  className={`flex flex-col items-center text-center px-8 py-6 sm:py-0 ${i > 0 ? 'border-t sm:border-t-0 sm:border-l border-border' : ''}`}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="font-display text-5xl md:text-6xl text-primary leading-none mb-3">{s.value}</span>
                  <p className="font-body text-sm text-muted-foreground">{s.label}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          4. PROCESSUS
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="font-body text-xs text-primary mb-3 block"
            >
              Déroulement
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              viewport={{ once: true }}
              className="font-display text-3xl md:text-5xl text-foreground"
            >
              Comment ça se passe
            </motion.h2>
          </div>

          {pageLoading ? (
            <div className="grid md:grid-cols-4 gap-8 md:gap-6 animate-pulse">
              {[0,1,2,3].map(i => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="h-16 w-14 bg-muted rounded" />
                  <div className="h-5 w-24 bg-muted rounded" />
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-3/4 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : (
          <div className="grid md:grid-cols-4 gap-8 md:gap-6">
            {processSteps.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 }}
                viewport={{ once: true }}
                className="flex flex-col items-center text-center gap-2"
              >
                <span className="font-display text-6xl md:text-7xl text-primary/20 leading-none">{step.num}</span>
                <h3 className="font-display text-xl text-foreground mt-1">{step.title}</h3>
                <p className="font-body text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          5. GRILLE CONSULTATIONS
      ══════════════════════════════════════════════════════════ */}
      <section id="consultations" className="py-20 md:py-28 px-6 md:px-12 bg-muted">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center text-center gap-3 mb-14">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="font-body text-xs text-primary"
            >
              Nos prestations
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              viewport={{ once: true }}
              className="font-display text-3xl md:text-5xl text-foreground"
            >
              Choisissez votre consultation
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              viewport={{ once: true }}
              className="font-body text-muted-foreground max-w-xl"
            >
              Toutes les consultations sont disponibles en présentiel ou en téléconsultation.
            </motion.p>
          </div>

          {pageLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className="bg-background border border-border rounded-2xl overflow-hidden animate-pulse">
                  <div className="aspect-[4/3] bg-muted" />
                  <div className="p-6 flex flex-col gap-3">
                    <div className="h-6 w-3/4 bg-muted rounded" />
                    <div className="h-4 w-full bg-muted rounded" />
                    <div className="h-4 w-2/3 bg-muted rounded" />
                    <div className="flex items-center justify-between mt-3 pt-4 border-t border-border">
                      <div className="h-6 w-28 bg-muted rounded" />
                      <div className="h-9 w-24 bg-muted rounded-xl" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {consultations.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                viewport={{ once: true }}
                className="group bg-background border border-border rounded-2xl overflow-hidden flex flex-col shadow-soft hover:shadow-elevated transition-shadow duration-300"
              >
                {/* Image */}
                <div className="relative aspect-[4/3] overflow-hidden">
                  <SmartImage
                    src={c.image}
                    alt={c.title}
                    className="w-full h-full object-cover"
                    sizes="(min-width: 768px) 33vw, 100vw"
                  />
                  {/* Tag */}
                  {c.tag && (
                    <div className="absolute top-3 left-3 font-body text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-full">
                      {c.tag}
                    </div>
                  )}
                  {/* Duration */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-foreground/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-full">
                    <Clock className="w-3 h-3" />
                    <span className="font-body text-xs">{c.duration}</span>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="font-display text-xl text-foreground mb-2 leading-snug">{c.title}</h3>
                  <p className="font-body text-sm text-muted-foreground leading-relaxed flex-1 mb-5">
                    {c.description}
                  </p>
                  <div className="flex items-center justify-between pt-4 border-t border-border mt-auto">
                    <div className="flex flex-col leading-tight">
                      <span className="font-display text-lg text-primary font-semibold">
                        {fmt(c.price)} <span className="font-body text-xs font-normal text-muted-foreground">en ligne</span>
                      </span>
                      <span className="font-body text-xs text-muted-foreground mt-0.5">
                        {fmt(c.presentielPrice)} en présentiel
                      </span>
                    </div>
                    <button
                      onClick={() => openBooking(c)}
                      className="flex items-center gap-2 font-body text-xs px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl"
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      Réserver
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          6. TÉMOIGNAGES
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="font-body text-xs text-primary mb-3 block"
            >
              Avis patients
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              viewport={{ once: true }}
              className="font-display text-3xl md:text-5xl text-foreground"
            >
              Ce qu'ils en disent
            </motion.h2>
          </div>

          {pageLoading ? (
            <div className="grid md:grid-cols-3 gap-6 animate-pulse">
              {[0,1,2].map(i => (
                <div key={i} className="bg-background border border-border rounded-2xl p-7 flex flex-col gap-4">
                  <div className="flex gap-1">
                    {[0,1,2,3,4].map(j => <div key={j} className="w-4 h-4 bg-muted rounded" />)}
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-full bg-muted rounded" />
                    <div className="h-4 w-full bg-muted rounded" />
                    <div className="h-4 w-3/4 bg-muted rounded" />
                  </div>
                  <div className="h-5 w-28 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : (
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-background border border-border rounded-2xl p-7 flex flex-col gap-4"
              >
                <div className="flex gap-1">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="font-body text-sm text-muted-foreground leading-relaxed flex-1">
                  "{t.text}"
                </p>
                <p className="font-display text-base text-foreground">{t.name}</p>
              </motion.div>
            ))}
          </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          6b. LAISSER UN AVIS
      ══════════════════════════════════════════════════════════ */}
      <section className="py-16 md:py-20 px-6 md:px-12 bg-muted/50">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            <span className="font-body text-xs text-primary mb-3 block">
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
            <TestimonialSubmitForm page="consultations" />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          7. FAQ
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 md:px-12 bg-muted">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="font-body text-xs text-primary mb-3 block"
            >
              Questions fréquentes
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              viewport={{ once: true }}
              className="font-display text-3xl md:text-5xl text-foreground"
            >
              Vos questions
            </motion.h2>
          </div>
          {pageLoading ? (
            <div className="bg-background rounded-2xl border border-border px-6 md:px-10 divide-y divide-border animate-pulse">
              {[80,65,75,70,60].map((w, i) => (
                <div key={i} className="py-5">
                  <div className="h-5 bg-muted rounded" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          ) : (
          <div className="bg-background rounded-2xl border border-border px-6 md:px-10 divide-y-0">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          8. CTA DARK
      ══════════════════════════════════════════════════════════ */}
      <section className="py-24 md:py-32 px-6 md:px-12 bg-foreground">
        <div className="max-w-3xl mx-auto flex flex-col items-center text-center gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col items-center gap-4"
          >
            <span className="font-body text-xs text-primary">Prenez soin de vous</span>
            <h2 className="font-display text-4xl md:text-6xl text-primary-foreground leading-tight">
              Commencez votre<br />
              <span className="text-primary">transformation</span>
            </h2>
            <p className="font-body text-lg text-primary-foreground/60 max-w-lg">
              Une consultation suffit pour poser les bases d'une alimentation saine. {doctor.nom || 'Dr. BATTY'} vous accompagne à chaque étape.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            viewport={{ once: true }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <a
              href="#consultations"
              className="font-body text-sm px-8 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl inline-flex items-center gap-2"
            >
              Réserver une consultation <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href={`https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(`Bonjour ${doctor.nom || 'Dr. BATTY'}, je souhaite prendre un rendez-vous.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-sm px-8 py-4 border border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 transition-colors rounded-xl inline-flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            viewport={{ once: true }}
            className="font-body text-xs text-primary-foreground/30"
          >
            Consultations disponibles du lundi au samedi · Libreville, Gabon
          </motion.p>
        </div>
      </section>

      <Footer />

      {/* ══════════════════════════════════════════════════════════
          MODAL DE RÉSERVATION
      ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedConsult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeBooking(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-background rounded-2xl shadow-elevated w-full max-w-md relative overflow-hidden"
            >
              {/* Close */}
              {bookingStep !== 'processing' && (
                <button
                  onClick={closeBooking}
                  className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}

              {/* Header */}
              {bookingStep !== 'success' && (
                <div className="px-7 pt-7 pb-5 border-b border-border">
                  <p className="font-body text-xs text-primary mb-1">Réservation</p>
                  <div className="flex items-start justify-between gap-4 pr-8">
                    <h2 className="font-display text-2xl text-foreground leading-snug">{selectedConsult.title}</h2>
                    <div className="text-right shrink-0">
                      <p className="font-display text-xl text-primary">{fmt(priceFor(selectedConsult, bookingForm.mode))}</p>
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="font-body text-xs text-muted-foreground">{selectedConsult.duration}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Form ── */}
              {bookingStep === 'form' && (
                <form onSubmit={handleBookingSubmit} className="px-7 py-6 flex flex-col gap-5">
                  <div>
                    <h3 className="font-display text-xl text-foreground mb-1">Vos informations</h3>
                    <p className="font-body text-sm text-muted-foreground">Choisissez une date et un créneau horaire.</p>
                  </div>

                  {/* Nom */}
                  <div>
                    <label className="font-body text-xs text-muted-foreground block mb-1.5">Nom complet</label>
                    <input
                      type="text"
                      value={bookingForm.nom}
                      onChange={e => setBookingForm(f => ({ ...f, nom: e.target.value }))}
                      placeholder="Votre nom"
                      className={`w-full font-body text-sm px-4 py-3 border rounded-xl bg-background outline-none transition-colors ${formErrors.nom ? 'border-red-400' : 'border-border focus:border-primary'}`}
                    />
                    {formErrors.nom && <p className="font-body text-xs text-red-500 mt-1">{formErrors.nom}</p>}
                  </div>

                  {/* Téléphone */}
                  <div>
                    <label className="font-body text-xs text-muted-foreground block mb-1.5">Téléphone</label>
                    <input
                      type="tel"
                      value={bookingForm.telephone}
                      onChange={e => setBookingForm(f => ({ ...f, telephone: e.target.value }))}
                      placeholder="+241 ..."
                      className={`w-full font-body text-sm px-4 py-3 border rounded-xl bg-background outline-none transition-colors ${formErrors.telephone ? 'border-red-400' : 'border-border focus:border-primary'}`}
                    />
                    {formErrors.telephone && <p className="font-body text-xs text-red-500 mt-1">{formErrors.telephone}</p>}
                  </div>

                  {/* Mode */}
                  <div>
                    <label className="font-body text-xs text-muted-foreground block mb-1.5">Mode</label>
                    <div className="flex gap-2">
                      {(['virtuel', 'presentiel'] as BookingMode[]).map(m => (
                        <button
                          key={m} type="button"
                          onClick={() => setBookingForm(f => ({ ...f, mode: m }))}
                          className={`flex-1 font-body text-sm py-3 border rounded-xl transition-colors ${
                            bookingForm.mode === m ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                          }`}
                        >
                          {m === 'virtuel' ? 'Téléconsultation' : 'Présentiel'}
                          <span className="block text-xs opacity-80">{fmt(priceFor(selectedConsult, m))}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date + Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="font-body text-xs text-muted-foreground block mb-1.5">Date souhaitée</label>
                      <input
                        type="date"
                        value={bookingForm.date}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => setBookingForm(f => ({ ...f, date: e.target.value }))}
                        className={`w-full font-body text-sm px-4 py-3 border rounded-xl bg-background outline-none transition-colors ${formErrors.date ? 'border-red-400' : 'border-border focus:border-primary'}`}
                      />
                      {formErrors.date && <p className="font-body text-xs text-red-500 mt-1">{formErrors.date}</p>}
                    </div>
                    <div>
                      <label className="font-body text-xs text-muted-foreground block mb-1.5">Créneau</label>
                      <select
                        value={bookingForm.time}
                        onChange={e => setBookingForm(f => ({ ...f, time: e.target.value }))}
                        className={`w-full font-body text-sm px-4 py-3 border rounded-xl bg-background outline-none transition-colors ${formErrors.time ? 'border-red-400' : 'border-border focus:border-primary'}`}
                      >
                        <option value="">Heure</option>
                        {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {formErrors.time && <p className="font-body text-xs text-red-500 mt-1">{formErrors.time}</p>}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full font-body text-sm px-8 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl flex items-center justify-center gap-2 mt-1"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Ajouter au panier
                  </button>
                </form>
              )}

              {/* ── Processing ── */}
              {bookingStep === 'processing' && (
                <div className="px-7 py-16 flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="font-display text-xl text-foreground">Réservation en cours…</p>
                </div>
              )}

              {/* ── Success ── */}
              {bookingStep === 'success' && selectedConsult && (
                <div className="px-7 py-8 flex flex-col items-center gap-6 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2, ease: 'easeOut', delay: 0.1 }}
                    className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"
                  >
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                  </motion.div>

                  <div>
                    <h3 className="font-display text-3xl text-foreground mb-2">Ajouté au panier</h3>
                    <p className="font-body text-sm text-muted-foreground">
                      Votre consultation <span className="text-foreground font-semibold">{selectedConsult.title}</span> est prête à être confirmée.
                    </p>
                  </div>

                  <div className="w-full bg-muted rounded-xl p-5 text-left flex flex-col gap-3">
                    <div className="flex justify-between">
                      <span className="font-body text-xs text-muted-foreground">Consultation</span>
                      <span className="font-body text-sm text-foreground">{selectedConsult.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body text-xs text-muted-foreground">Date souhaitée</span>
                      <span className="font-body text-sm text-foreground">
                        {new Date(bookingForm.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à {bookingForm.time}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-3">
                      <span className="font-body text-xs text-muted-foreground">Tarif</span>
                      <span className="font-display text-base text-primary">{fmt(priceFor(selectedConsult, bookingForm.mode))}</span>
                    </div>
                  </div>

                  <p className="font-body text-xs text-muted-foreground text-center">
                    {doctor.nom} vous confirmera le rendez-vous par WhatsApp dans les 24h.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 w-full">
                    <button
                      onClick={closeBooking}
                      className="flex-1 font-body text-sm px-6 py-3 border border-border text-muted-foreground hover:text-foreground transition-colors rounded-xl"
                    >
                      Continuer
                    </button>
                    <Link
                      to="/panier"
                      onClick={closeBooking}
                      className="flex-1 font-body text-sm px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl text-center"
                    >
                      Voir mon panier
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
