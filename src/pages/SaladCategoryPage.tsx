import { Link } from 'react-router-dom';
import SmartImage from '@/components/SmartImage';
import PageIntro, { introPrimaryClass, introSecondaryClass } from '@/components/PageIntro';
import { useUser } from '@/context/UserContext';
import { motion } from 'framer-motion';
import Footer from '@/components/Footer';
import cruditesImg from '@/assets/category-crudites.webp';
import fruitsImg from '@/assets/category-fruits.webp';
import heroImg from '@/assets/hero-salad.webp';

// Images représentatives par catégorie (Unsplash)
const IMG = {
  detox:      'https://images.unsplash.com/photo-1610970881699-44a5587cabec?auto=format&fit=crop&w=800&q=80',
  jusFruits:  'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=800&q=80',
  repasChaud: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80',
  omelette:   'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=800&q=80',
  soupe:      'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80',
};

const CATEGORIES = [
  {
    id: 'crudites',
    title: 'Salade de Crudités',
    description: 'Choisissez vos légumes, protéines et sauces maison.',
    tag: 'Sur mesure',
    image: cruditesImg,
    href: '/composer/crudites',
    span: 'md:col-span-6',
  },
  {
    id: 'fruits',
    title: 'Salade de Fruits',
    description: 'Mélangez vos fruits préférés pour une salade vitaminée.',
    tag: 'Sur mesure',
    image: fruitsImg,
    href: '/composer/fruits',
    span: 'md:col-span-6',
  },
  {
    id: 'detox',
    title: 'Jus Détox',
    description: 'Concombre, épinard, gingembre, citron — purifiants et énergisants.',
    tag: 'Détoxification',
    image: IMG.detox,
    href: '/jus/detox',
    span: 'md:col-span-6',
  },
  {
    id: 'jus-fruits',
    title: 'Jus de Fruits Pressés',
    description: 'Orange, mangue, ananas, pastèque — pressés à la minute.',
    tag: 'Frais du jour',
    image: IMG.jusFruits,
    href: '/jus/fruits',
    span: 'md:col-span-6',
  },
  {
    id: 'chaud',
    title: 'Repas Chauds',
    description: 'Poulet rôti, ragoût de légumes — mijotés avec soin.',
    tag: 'Plat du jour',
    image: IMG.repasChaud,
    href: '/repas/chaud',
    span: 'md:col-span-4',
  },
  {
    id: 'omelette',
    title: 'Omelettes',
    description: 'Moelleuses et garnies : herbes fraîches, poulet-épinards et plus.',
    tag: 'Rapide & nourrissant',
    image: IMG.omelette,
    href: '/repas/omelette',
    span: 'md:col-span-4',
  },
  {
    id: 'soupe',
    title: 'Soupes & Bouillons',
    description: 'Veloutés maison, légumes du jardin, bouillon de poulet.',
    tag: 'Fait maison',
    image: IMG.soupe,
    href: '/repas/soupe',
    span: 'md:col-span-4',
  },
];

export default function SaladCategoryPage() {
  const { user } = useUser();
  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Hero plein écran ── */}
      {user ? (
        <PageIntro
          clearBar
          eyebrow="Notre carte"
          title="À Commander, fait avec soin"
          subtitle="Salades, jus, repas chauds, omelettes et soupes — pressés ou mijotés à la commande."
          actions={<>
            <a href="#menu" className={introPrimaryClass}>Explorer la carte</a>
            <Link to="/jus" className={introSecondaryClass}>Jus & Détox</Link>
          </>}
        />
      ) : (
      <section className="relative min-h-[60vh] md:min-h-[64vh] pt-28 flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <SmartImage
            src={heroImg}
            alt="À Commander — La Délicieuse Diète"
            className="w-full h-full object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/25 to-transparent" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="relative z-10 w-full max-w-5xl mx-auto px-6 md:px-12 pb-10 md:pb-14"
        >
          <span className="font-body text-xs text-primary mb-4 block">
            Notre carte
          </span>
          <h1 className="font-display text-4xl md:text-6xl lg:text-7xl text-primary-foreground leading-[0.95] mb-6">
            À Commander,<br />
            <span>fait avec soin</span>
          </h1>
          <p className="font-display text-xl md:text-2xl text-primary-foreground/75 max-w-xl mb-10">
            Salades, jus, repas chauds, omelettes et soupes — pressés ou mijotés à la commande.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="#menu"
              className="font-body text-sm px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl"
            >
              Explorer la carte
            </a>
            <Link
              to="/jus"
              className="font-body text-sm px-8 py-4 border border-white/40 text-white hover:bg-white/10 transition-colors rounded-xl"
            >
              Jus & Détox
            </Link>
          </div>
        </motion.div>
      </section>
      )}

      {/* ── Catégories ── */}
      <div id="menu" className="flex-1 bg-muted/30">
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-20">

          {/* Salades */}
          <section className="mb-12">
            <SectionLabel label="Salades sur mesure" />
            <div className="grid md:grid-cols-12 gap-6">
              {CATEGORIES.filter(c => c.id === 'crudites' || c.id === 'fruits').map((cat, i) => (
                <CategoryCard key={cat.id} cat={cat} delay={i * 0.1} />
              ))}
            </div>
          </section>

          {/* Jus */}
          <section className="mb-12">
            <SectionLabel label="Jus & Détox" />
            <div className="grid md:grid-cols-12 gap-6">
              {CATEGORIES.filter(c => c.id === 'detox' || c.id === 'jus-fruits').map((cat, i) => (
                <CategoryCard key={cat.id} cat={cat} delay={i * 0.1} />
              ))}
            </div>
          </section>

          {/* Repas chauds */}
          <section>
            <SectionLabel label="Repas Chauds" />
            <div className="grid md:grid-cols-12 gap-6">
              {CATEGORIES.filter(c => c.id === 'chaud' || c.id === 'omelette' || c.id === 'soupe').map((cat, i) => (
                <CategoryCard key={cat.id} cat={cat} delay={i * 0.1} />
              ))}
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <h2 className="font-display text-2xl text-foreground mb-6">{label}</h2>
  );
}

function CategoryCard({ cat, delay }: { cat: typeof CATEGORIES[0]; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cat.span}
    >
      <Link
        to={cat.href}
        className="block group relative overflow-hidden rounded-2xl h-64 shadow-md hover:shadow-xl transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-300"
      >
        <SmartImage
          src={cat.image}
          alt={cat.title}
          className="absolute inset-0 w-full h-full object-cover"
          sizes="(min-width: 768px) 512px, 100vw"
          widths={[320, 480, 640, 960]}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          <span className="font-body text-xs text-secondary mb-1 block">
            {cat.tag}
          </span>
          <h3 className="font-display text-xl md:text-2xl mb-1">{cat.title}</h3>
          <p className="font-body text-white/70 text-sm leading-relaxed">{cat.description}</p>
          <span className="inline-block font-body text-xs text-white/80 group-hover:text-secondary transition-colors mt-3">
            Commander →
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
