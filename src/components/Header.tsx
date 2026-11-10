import { Link, NavLink } from 'react-router-dom';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { CircleUser, ShoppingBag, Menu, X, Home, Leaf, Orange, UtensilsCrossed, CalendarDays, Stethoscope } from '@/components/icons';
import { cn } from '@/lib/utils';
import { BackIconButton } from '@/components/BackButton';
import logo from '@/assets/logo.webp';

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
        <div className="flex items-center gap-2 min-w-0">
          <BackIconButton className="lg:hidden" />
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
        
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4 lg:gap-6 xl:gap-8">
          <NavItem to="/" label="Accueil" icon={Home} end />
          <NavItem to="/composer" label="Salades" icon={Leaf} />
          <NavItem to="/jus" label="Jus & Détox" icon={Orange} />
          <NavItem to="/repas" label="Repas" icon={UtensilsCrossed} />
          <NavItem to="/abonnement" label="Abonnement" icon={CalendarDays} />
          <NavItem to="/dieteticien" label="Diététicien" icon={Stethoscope} />
          {user ? (
            <Link
              to="/mon-compte"
              className="flex items-center gap-1.5 font-body text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <CircleUser className="w-4 h-4" />
              {user.nom.split(' ')[0]}
            </Link>
          ) : (
            <Link
              to="/connexion"
              className="flex items-center gap-1.5 font-body text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <CircleUser className="w-4 h-4" />
              Connexion
            </Link>
          )}
          <Link
            id="cart-header-icon"
            to="/panier"
            className="relative flex items-center gap-1.5 font-body text-sm font-medium text-foreground hover:text-primary transition-colors"
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
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="absolute -top-2 -right-3 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-semibold"
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
              <MobileNavItem to="/" label="Accueil" icon={Home} end onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/composer" label="Salades" icon={Leaf} onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/jus" label="Jus & Détox" icon={Orange} onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/repas" label="Repas" icon={UtensilsCrossed} onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/abonnement" label="Abonnement" icon={CalendarDays} onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/dieteticien" label="Diététicien" icon={Stethoscope} onClick={() => setMenuOpen(false)} />
              <MobileNavItem to="/panier" label={`Panier (${totalItems})`} icon={ShoppingBag} onClick={() => setMenuOpen(false)} />
              {user ? (
                <MobileNavItem to="/mon-compte" label="Mon Compte" icon={CircleUser} onClick={() => setMenuOpen(false)} />
              ) : (
                <MobileNavItem to="/connexion" label="Connexion" icon={CircleUser} onClick={() => setMenuOpen(false)} />
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

type IconType = React.ElementType;

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: IconType; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        'flex items-center gap-1.5 font-body text-sm font-medium transition-colors hover:text-primary whitespace-nowrap',
        isActive ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </NavLink>
  );
}

function MobileNavItem({ to, label, icon: Icon, end, onClick }: { to: string; label: string; icon: IconType; end?: boolean; onClick: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => cn(
        'flex items-center gap-3 font-display text-2xl transition-colors hover:text-primary',
        isActive ? 'text-primary' : 'text-foreground',
      )}
    >
      <Icon className="w-6 h-6 shrink-0" />
      {label}
    </NavLink>
  );
}
