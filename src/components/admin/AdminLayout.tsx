import { Link, useLocation, Outlet } from 'react-router-dom';
import AdminErrorBoundary from './AdminErrorBoundary';
import { useState } from 'react';
import { logout as logoutAdmin } from '@/services/authService';
import {
  LayoutDashboard, ShoppingCart, FolderTree, Carrot, Users, FileText,
  History, Settings, MessageCircle, LogOut, Menu, X, ChefHat, Utensils,
  Warehouse, BarChart3, Ticket, Sparkles, Stethoscope, Layers,
  HelpCircle, MessageSquare, Truck, Home,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Opérations',
    items: [
      { to: '/admin',             icon: LayoutDashboard, label: 'Dashboard',       end: true },
      { to: '/admin/commandes',   icon: ShoppingCart,    label: 'Commandes' },
      { to: '/admin/menu',        icon: Utensils,        label: 'Menu du jour' },
      { to: '/admin/rapports',    icon: BarChart3,       label: 'Rapports' },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { to: '/admin/categories',  icon: FolderTree,  label: 'Catégories' },
      { to: '/admin/ingredients', icon: Carrot,      label: 'Ingrédients' },
      { to: '/admin/stocks',      icon: Warehouse,   label: 'Stocks' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { to: '/admin/promotions',    icon: Ticket,      label: 'Promotions' },
      { to: '/admin/suggestions',   icon: Sparkles,    label: 'Suggestions chef' },
      { to: '/admin/consultations', icon: Stethoscope, label: 'Consultations' },
      { to: '/admin/plans',         icon: Layers,      label: 'Plans abonnement' },
    ],
  },
  {
    label: 'Contenu',
    items: [
      { to: '/admin/faqs',      icon: HelpCircle,    label: 'FAQs' },
      { to: '/admin/avis',      icon: MessageSquare, label: 'Avis clients' },
      { to: '/admin/livraison', icon: Truck,         label: 'Livraison' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/utilisateurs', icon: Users,          label: 'Utilisateurs' },
      { to: '/admin/factures',     icon: FileText,       label: 'Factures' },
      { to: '/admin/historique',   icon: History,        label: 'Historique' },
      { to: '/admin/whatsapp',     icon: MessageCircle,  label: 'Communications' },
      { to: '/admin/parametres',   icon: Settings,       label: 'Paramètres' },
    ],
  },
];

export default function AdminLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-foreground text-primary-foreground transform transition-transform duration-300 flex flex-col
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-primary-foreground/10 shrink-0">
          <Link to="/admin" className="flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-primary" />
            <span className="font-display text-xl">La Délicieuse Diète</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="px-3 py-4 flex-1 overflow-y-auto space-y-5">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <p className="px-3 mb-1 text-[10px] font-body font-semibold uppercase tracking-widest text-primary-foreground/30 select-none">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const isActive = item.end
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-body transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/5'
                      }`}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-primary-foreground/10 shrink-0">
          <Link to="/" className="flex items-center gap-3 px-3 py-2 text-sm font-body text-primary-foreground/60 hover:text-primary-foreground transition-colors rounded-md hover:bg-primary-foreground/5">
            <Home className="w-4 h-4" />
            Retour au site
          </Link>
          <button
            onClick={() => { logoutAdmin().finally(() => { window.location.href = '/admin/login'; }); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-body text-primary-foreground/60 hover:text-destructive hover:bg-destructive/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        <header className="bg-background border-b border-border px-4 md:px-8 py-4 flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="font-display text-xl text-foreground">Administration</h1>
        </header>
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <AdminErrorBoundary key={location.pathname}>
            <Outlet />
          </AdminErrorBoundary>
        </main>
      </div>
    </div>
  );
}
