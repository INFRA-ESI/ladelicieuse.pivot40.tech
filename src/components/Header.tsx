import { Link } from 'react-router-dom';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { CircleUser, ShoppingBag, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

export default function Header() {
  const { totalItems } = useCart();
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const prevItems = useRef(totalItems);
  const [cartBump, setCartBump] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (totalItems > prevItems.current) {
      setCartBump(true);
      setTimeout(() => setCartBump(false), 500);
    }
    prevItems.current = totalItems;
  }, [totalItems]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 bg-white border-b border-border/50 transition-shadow duration-500 ease-out',
        scrolled ? 'shadow-[0_8px_32px_rgba(0,0,0,0.08)]' : 'shadow-none'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img
            src={logo}
            alt="La Délicieuse Diète"
            className="h-14 sm:h-16 w-auto shrink-0"
          />
          <span className="font-display text-xl sm:text-2xl md:text-3xl font-semibold text-foreground tracking-tight truncate">
            La Délicieuse Diète
          </span>
        </Link>
        
        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8">
          <NavItem to="/composer" label="Salades" />
          <NavItem to="/jus" label="Jus & Détox" />
          <NavItem to="/repas" label="Repas" />
          <NavItem to="/abonnement" label="Abonnement" />
          <NavItem to="/dieteticien" label="Diététicien" />
          {user ? (
            <Link
              to="/mon-compte"
              className="flex items-center gap-1.5 font-body text-sm font-medium tracking-wide uppercase text-muted-foreground hover:text-primary transition-colors"
            >
              <CircleUser className="w-4 h-4" />
              {user.nom.split(' ')[0]}
            </Link>
          ) : (
            <Link
              to="/connexion"
              className="flex items-center gap-1.5 font-body text-sm font-medium tracking-wide uppercase text-muted-foreground hover:text-primary transition-colors"
            >
              <CircleUser className="w-4 h-4" />
              Connexion
            </Link>
          )}
          <Link
            id="cart-header-icon"
            to="/panier"
            className="relative flex items-center gap-1.5 font-body text-sm font-medium tracking-wide uppercase text-foreground hover:text-primary transition-colors"
          >
            <motion.div
              animate={cartBump ? { scale: [1, 1.35, 0.9, 1.1, 1] } : { scale: 1 }}
              transition={{ duration: 0.45, ease: 'easeInOut' }}
            >
              <ShoppingBag className="w-5 h-5" />
            </motion.div>
            <AnimatePresence mode="popLayout">
              {totalItems > 0 && (
                <motion.span
                  key={totalItems}
                  initial={{ scale: 0, y: -4 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  className="absolute -top-2 -right-3 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold"
                >
                  {totalItems}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </nav>

        {/* Mobile menu button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          className="md:hidden flex items-center justify-center w-10 h-10 rounded-xl border border-border text-foreground"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile nav */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden bg-white border-b border-border"
          >
            <div className="px-6 py-6 flex flex-col gap-4">
              <MobileNavItem to="/composer" label="Salades" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/jus" label="Jus & Détox" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/repas" label="Repas" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/abonnement" label="Abonnement" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/dieteticien" label="Diététicien" onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/panier" label={`Panier (${totalItems})`} onClick={() => setMenuOpen(false)} />
              {user ? (
                <MobileNavItem to="/mon-compte" label="Mon Compte" onClick={() => setMenuOpen(false)} />
              ) : (
                <MobileNavItem to="/connexion" label="Connexion" onClick={() => setMenuOpen(false)} />
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <Link 
      to={to} 
      className="font-body text-sm font-medium tracking-wide uppercase text-muted-foreground hover:text-primary transition-colors"
    >
      {label}
    </Link>
  );
}

function MobileNavItem({ to, label, onClick }: { to: string; label: string; onClick: () => void }) {
  return (
    <Link 
      to={to} 
      onClick={onClick}
      className="font-display text-2xl text-foreground hover:text-primary transition-colors"
    >
      {label}
    </Link>
  );
}
