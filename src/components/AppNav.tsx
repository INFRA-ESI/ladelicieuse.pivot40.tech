import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSidebarCollapse } from '@/hooks/useSidebarCollapse';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  Home, Leaf, Orange, UtensilsCrossed, CalendarDays, Stethoscope, TrendingUp,
  ShoppingBag, Menu, LogOut, CircleUser, ArrowRight, PanelLeft,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import logo from '@/assets/logo.webp';

import { CLIENT_SIDEBAR_KEY } from '@/lib/sidebarKeys';

type Item = { to: string; label: string; icon: React.ElementType; end?: boolean };

const ITEMS: Item[] = [
  { to: '/',            label: 'Accueil',      icon: Home, end: true },
  { to: '/composer',    label: 'Salades',      icon: Leaf },
  { to: '/jus',         label: 'Jus & Détox',  icon: Orange },
  { to: '/repas',       label: 'Repas',        icon: UtensilsCrossed },
  { to: '/abonnement',  label: 'Abonnement',   icon: CalendarDays },
  { to: '/dieteticien', label: 'Diététicien',  icon: Stethoscope },
  { to: '/suivi',       label: 'Mon suivi',    icon: TrendingUp },
];

function CartBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1.5 -right-2 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">
      {count}
    </span>
  );
}

// Pastille d'icône : carrée, calme ; l'élément actif prend la couleur de la marque.
function IconTile({ icon: Icon, active }: { icon: React.ElementType; active: boolean }) {
  return (
    <span className={cn(
      'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors',
      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-primary',
    )}>
      <Icon className="w-[18px] h-[18px]" />
    </span>
  );
}

function Row({ to, label, icon, end, badge, cartId, onClick, compact }: Item & { badge?: number; cartId?: boolean; onClick?: () => void; compact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      title={compact ? label : undefined}
      className={({ isActive }) => cn(
        'flex items-center gap-3 rounded-xl px-2 py-1.5 font-body text-[15px] transition-colors',
        compact && 'justify-center px-0',
        isActive ? 'bg-primary/10 text-foreground font-medium' : 'text-foreground hover:bg-muted/60',
      )}
    >
      {({ isActive }) => (
        <>
          <span id={cartId ? 'cart-header-icon' : undefined} className="relative">
            <IconTile icon={icon} active={isActive} />
            {badge !== undefined && <CartBadge count={badge} />}
          </span>
          <span className={compact ? 'sr-only' : 'truncate'}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function UserRow({ onClick, large, compact }: { onClick?: () => void; large?: boolean; compact?: boolean }) {
  const { user } = useUser();
  if (!user) return null;
  return (
    <NavLink
      to="/mon-compte"
      onClick={onClick}
      title={compact ? `${user.prenoms} ${user.nom}` : undefined}
      className={({ isActive }) => cn(
        'flex items-center gap-3 rounded-xl px-2 py-2 transition-colors',
        compact && 'justify-center px-0',
        isActive ? 'bg-primary/10' : 'hover:bg-muted/60',
      )}
    >
      <Avatar user={user} className={large ? 'w-12 h-12' : 'w-9 h-9'} textClassName={large ? 'text-lg' : 'text-sm'} />
      <span className={cn('min-w-0 flex-1', compact && 'sr-only')}>
        <span className="block font-display text-base text-foreground truncate">{user.prenoms} {user.nom}</span>
        <span className="block font-body text-xs text-muted-foreground">Mon compte · {user.points.toLocaleString('fr-FR')} pts</span>
      </span>
      {large && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
    </NavLink>
  );
}

function LogoutButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={compact ? 'Se déconnecter' : undefined}
      className={cn('w-full flex items-center gap-3 rounded-xl px-2 py-1.5 font-body text-[15px] text-destructive hover:bg-destructive/10 transition-colors', compact && 'justify-center px-0')}
    >
      <span className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
        <LogOut className="w-[18px] h-[18px]" />
      </span>
      <span className={compact ? 'sr-only' : undefined}>Se déconnecter</span>
    </button>
  );
}

function LegalLinks({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <p className={cn('font-body text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 px-2', className)}>
      <Link to="/mentions-legales" onClick={onClick} className="hover:text-foreground hover:underline">Mentions légales</Link>
      <Link to="/politique-confidentialite" onClick={onClick} className="hover:text-foreground hover:underline">Confidentialité</Link>
    </p>
  );
}

// Se déconnecter ramène toujours à l'accueil, quelle que soit la page où l'on se trouvait.
function useSignOut() {
  const { logout } = useUser();
  const navigate = useNavigate();
  return () => { navigate('/', { replace: true }); logout(); };
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { totalItems } = useCart();
  const signOut = useSignOut();
  return (
    <aside className={cn(
      'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-background transition-[width] duration-200',
      collapsed ? 'w-[4.5rem]' : 'w-64',
    )}>
      <Link to="/" title={collapsed ? 'La Délicieuse Diète' : undefined} className={cn('flex items-center gap-2 pt-4 pb-3 min-w-0', collapsed ? 'justify-center px-2' : 'px-4')}>
        <img src={logo} alt="" className="h-10 w-auto shrink-0" />
        <span className={cn('font-display text-lg font-semibold text-foreground leading-tight', collapsed && 'sr-only')}>La Délicieuse Diète</span>
      </Link>
      <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 flex flex-col gap-0.5">
        <UserRow compact={collapsed} />
        <div className="h-px bg-border my-2" />
        {ITEMS.map(item => <Row key={item.to} {...item} compact={collapsed} />)}
        <Row to="/panier" label="Panier" icon={ShoppingBag} badge={totalItems} cartId compact={collapsed} />
      </nav>
      <div className="border-t border-border p-3 flex flex-col gap-0.5">
        <LogoutButton onClick={signOut} compact={collapsed} />
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          title={collapsed ? 'Agrandir la barre latérale' : undefined}
          className={cn('w-full flex items-center gap-3 rounded-xl px-2 py-1.5 font-body text-[15px] text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors', collapsed && 'justify-center px-0')}
        >
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
            <PanelLeft className="w-[18px] h-[18px]" />
          </span>
          <span className={collapsed ? 'sr-only' : undefined}>{collapsed ? 'Agrandir la barre latérale' : 'Réduire la barre latérale'}</span>
        </button>
        {!collapsed && <LegalLinks className="pt-2" />}
      </div>
    </aside>
  );
}

function BottomBar() {
  const { totalItems } = useCart();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const signOut = useSignOut();
  const close = () => setMenuOpen(false);

  // Le composeur de salade a sa propre barre fixe en bas (calories + validation) : on ne la double pas.
  const hideBar = /^\/composer\/.+/.test(pathname);

  const tab = 'flex flex-col items-center justify-center gap-0.5 py-2 font-body text-[11px] transition-colors';
  const tabClass = ({ isActive }: { isActive: boolean }) => cn(tab, isActive ? 'text-primary' : 'text-muted-foreground');

  return (
    <>
      {!hideBar && (
        <nav
          aria-label="Navigation principale"
          className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
        >
          <NavLink to="/" end className={tabClass}><Home className="w-6 h-6" />Accueil</NavLink>
          <NavLink to="/composer" className={tabClass}><Leaf className="w-6 h-6" />Salades</NavLink>
          <NavLink to="/panier" className={tabClass}>
            <span id="cart-header-icon" className="relative"><ShoppingBag className="w-6 h-6" /><CartBadge count={totalItems} /></span>
            Panier
          </NavLink>
          <NavLink to="/mon-compte" className={tabClass}><CircleUser className="w-6 h-6" />Compte</NavLink>
          <button onClick={() => setMenuOpen(true)} className={cn(tab, menuOpen ? 'text-primary' : 'text-muted-foreground')}>
            <Menu className="w-6 h-6" />Menu
          </button>
        </nav>
      )}

      {/* Le menu complet : la même liste que la barre latérale du bureau. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl px-4 pt-6 pb-4 flex flex-col">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Accès à toutes les pages du site</SheetDescription>
          <nav aria-label="Menu" className="flex-1 overflow-y-auto flex flex-col gap-0.5">
            <UserRow large onClick={close} />
            <div className="h-px bg-border my-2" />
            {ITEMS.map(item => <Row key={item.to} {...item} onClick={close} />)}
            <Row to="/panier" label="Panier" icon={ShoppingBag} badge={totalItems} onClick={close} />
          </nav>
          <div className="border-t border-border pt-3">
            <LogoutButton onClick={() => { close(); signOut(); }} />
            <LegalLinks className="pt-3" onClick={close} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// Remplace la barre du haut dès qu'un client est connecté : barre latérale réductible sur ordinateur et tablette,
// barre du bas + menu sur mobile. Le décalage du contenu suit la largeur de la barre (voir useAppNavOffset).
export default function AppNav() {
  const isMobile = useIsMobile();
  const [collapsed, toggle] = useSidebarCollapse(CLIENT_SIDEBAR_KEY);
  return isMobile ? <BottomBar /> : <Sidebar collapsed={collapsed} onToggle={toggle} />;
}
