import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Stethoscope } from '@/components/icons';

const HIDDEN_PREFIXES = ['/dieteticien', '/composer', '/admin', '/connexion', '/mon-compte', '/suivi', '/panier', '/mot-de-passe-oublie', '/reset-password'];

export default function FloatingDietician() {
  const { pathname } = useLocation();
  // Pas sur la page diététicien elle-même, ni pendant la composition d'une salade où il masque le contenu,
  // ni dans le back office où il recouvre la pagination et les actions.
  // Le bouton flottant masquerait du contenu sur les écrans étroits (formulaires de connexion, espace client, panier).
  if (HIDDEN_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))) return null;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1.4, duration: 0.2, ease: 'easeOut' }}
      className="fixed bottom-24 right-4 sm:bottom-8 sm:right-6 z-40 group"
    >
      <Link to="/dieteticien" aria-label="Consultation diététicien">

        {/* Tooltip */}
        <span className="
          absolute right-full mr-3 top-1/2 -translate-y-1/2
          whitespace-nowrap font-body text-xs
          bg-foreground text-background px-3 py-2 rounded-xl shadow-elevated
          opacity-0 translate-x-2
          group-hover:opacity-100 group-hover:translate-x-0
          transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-200 pointer-events-none
        ">
          Diététicien
        </span>

        {/* Bouton */}
        <motion.div
          whileTap={{ scale: 0.9 }}
          className="
            w-14 h-14 rounded-full
            bg-primary text-primary-foreground
            shadow-warm hover:shadow-elevated
            flex items-center justify-center
            transition-shadow duration-200
          "
        >
          <Stethoscope className="w-6 h-6" />
        </motion.div>
      </Link>
    </motion.div>
  );
}
