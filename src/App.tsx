import { lazy, Suspense, Component, useEffect } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { ls } from "@/lib/storage";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/context/CartContext";
import { UserProvider, useUser } from "@/context/UserContext";
import Header from "@/components/Header";
import AppNav from "@/components/AppNav";
import { BackBar } from "@/components/BackButton";
import { useAppNavOffset } from "@/hooks/useAppNavOffset";
import ContinuationPopup from "@/components/ContinuationPopup";
import FloatingDietician from "@/components/FloatingDietician";
import PWAInstall from "@/components/PWAInstall";
import AdminPageLoader from "@/components/admin/AdminPageLoader";

// Page d'accueil — chargée immédiatement (LCP critique)
import HomePage from "@/pages/HomePage";

// Pages publiques — lazy-loadées (chunks séparés, pas dans le bundle initial)
const SaladCategoryPage   = lazy(() => import("@/pages/SaladCategoryPage"));
const SaladComposerPage   = lazy(() => import("@/pages/SaladComposerPage"));
const JuicesPage          = lazy(() => import("@/pages/JuicesPage"));
const MealsPage           = lazy(() => import("@/pages/MealsPage"));
const ConsultationsPage   = lazy(() => import("@/pages/ConsultationsPage"));
const AbonnementPage      = lazy(() => import("@/pages/AbonnementPage"));
const CartPage            = lazy(() => import("@/pages/CartPage"));
const MonComptePage       = lazy(() => import("@/pages/MonComptePage"));
const SuiviPage           = lazy(() => import("@/pages/SuiviPage"));
const ConnexionPage       = lazy(() => import("@/pages/ConnexionPage"));
const VerifyEmailPage     = lazy(() => import("@/pages/VerifyEmailPage"));
const ForgotPasswordPage  = lazy(() => import("@/pages/ForgotPasswordPage"));
const ResetPasswordPage   = lazy(() => import("@/pages/ResetPasswordPage"));
const CheckoutPage        = lazy(() => import("@/pages/CheckoutPage"));
const PaymentSuccessPage  = lazy(() => import("@/pages/PaymentSuccessPage"));
const PaymentFailurePage  = lazy(() => import("@/pages/PaymentFailurePage"));
const NotFound                   = lazy(() => import("./pages/NotFound"));
const MentionsLegalesPage        = lazy(() => import("@/pages/MentionsLegalesPage"));
const PolitiqueConfidentialitePage = lazy(() => import("@/pages/PolitiqueConfidentialitePage"));

// Admin pages — lazy-loadées (chunk séparé, pas chargé pour les clients)
const AdminLoginPage        = lazy(() => import("@/pages/admin/AdminLoginPage"));
const AdminPasswordResetPage = lazy(() => import("@/pages/admin/AdminPasswordResetPage"));
const AdminLayout           = lazy(() => import("@/components/admin/AdminLayout"));
const DashboardPage         = lazy(() => import("@/pages/admin/DashboardPage"));
const OrdersPage            = lazy(() => import("@/pages/admin/OrdersPage"));
const MenuDayPage           = lazy(() => import("@/pages/admin/MenuDayPage"));
const CategoriesPage        = lazy(() => import("@/pages/admin/CategoriesPage"));
const IngredientsPage       = lazy(() => import("@/pages/admin/IngredientsPage"));
const UsersPage             = lazy(() => import("@/pages/admin/UsersPage"));
const InvoicesPage          = lazy(() => import("@/pages/admin/InvoicesPage"));
const HistoryPage           = lazy(() => import("@/pages/admin/HistoryPage"));
const AvisClientsAdminPage  = lazy(() => import("@/pages/admin/AvisClientsAdminPage"));
const WhatsAppPage          = lazy(() => import("@/pages/admin/WhatsAppPage"));
const SettingsPage          = lazy(() => import("@/pages/admin/SettingsPage"));
const StocksPage            = lazy(() => import("@/pages/admin/StocksPage"));
const SalesReportPage       = lazy(() => import("@/pages/admin/SalesReportPage"));
const PromotionsPage        = lazy(() => import("@/pages/admin/PromotionsPage"));
const SuggestionsPage       = lazy(() => import("@/pages/admin/SuggestionsPage"));
const ConsultationsAdminPage = lazy(() => import("@/pages/admin/ConsultationsAdminPage"));
const PlansAdminPage        = lazy(() => import("@/pages/admin/PlansAdminPage"));
const SubscriptionsAdminPage = lazy(() => import("@/pages/admin/SubscriptionsAdminPage"));
const FAQsAdminPage         = lazy(() => import("@/pages/admin/FAQsAdminPage"));
const LivraisonAdminPage    = lazy(() => import("@/pages/admin/LivraisonAdminPage"));
const ProductPage           = lazy(() => import("@/pages/ProductPage"));

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const PublicSuspense = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<PageFallback />}>{children}</Suspense>
);

const AdminSuspense = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<AdminPageLoader />}>{children}</Suspense>
);

// Guard synchrone — vérifie présence ET expiration du JWT avant de charger les chunks admin.
function isAdminTokenValid(): boolean {
  const token = ls.get('admin_token');
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false; // token malformé
  }
}

function ProtectedAdminRoute({ children }: { children: ReactNode }) {
  if (!isAdminTokenValid()) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
          <p className="text-lg font-semibold text-gray-800">Une erreur inattendue s'est produite.</p>
          <button
            className="px-4 py-2 text-sm rounded bg-primary text-white"
            onClick={() => { this.setState({ crashed: false }); window.location.href = '/'; }}
          >
            Retour à l'accueil
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Une nouvelle page doit s'ouvrir en haut, pas à la hauteur de scroll de la précédente.
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

// Visiteur : barre du haut. Client connecté : plus de barre du haut, navigation latérale (bureau) ou barre du bas (mobile).
// Le contenu des pages réserve 5 rem sous la barre fixe du haut : on les reprend quand elle n'existe plus.
function Shell({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const offset = useAppNavOffset();
  if (!user) return <><Header />{children}</>;
  return (
    <>
      <AppNav />
      <BackBar className={offset} />
      <div className={`-mt-20 pb-16 md:pb-0 transition-[padding] duration-200 ${offset}`}>{children}</div>
    </>
  );
}

const App = () => (
  <ErrorBoundary>
    <TooltipProvider>
      <UserProvider>
      <CartProvider>
        <Sonner position="top-right" richColors closeButton />
        <BrowserRouter>
          <ScrollToTop />
          <ContinuationPopup />
          <FloatingDietician />
          <PWAInstall />
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Shell><HomePage /></Shell>} />
            <Route path="/composer" element={<Shell><PublicSuspense><SaladCategoryPage /></PublicSuspense></Shell>} />
            <Route path="/composer/:type" element={<Shell><PublicSuspense><SaladComposerPage /></PublicSuspense></Shell>} />
            <Route path="/jus" element={<Shell><PublicSuspense><JuicesPage /></PublicSuspense></Shell>} />
            <Route path="/jus/:categorie" element={<Shell><PublicSuspense><JuicesPage /></PublicSuspense></Shell>} />
            <Route path="/repas" element={<Shell><PublicSuspense><MealsPage /></PublicSuspense></Shell>} />
            <Route path="/repas/:categorie" element={<Shell><PublicSuspense><MealsPage /></PublicSuspense></Shell>} />
            <Route path="/produit/:slug" element={<Shell><PublicSuspense><ProductPage /></PublicSuspense></Shell>} />
            <Route path="/dieteticien" element={<Shell><PublicSuspense><ConsultationsPage /></PublicSuspense></Shell>} />
            <Route path="/abonnement" element={<Shell><PublicSuspense><AbonnementPage /></PublicSuspense></Shell>} />
            <Route path="/panier" element={<Shell><PublicSuspense><CartPage /></PublicSuspense></Shell>} />
            <Route path="/mon-compte" element={<Shell><PublicSuspense><MonComptePage /></PublicSuspense></Shell>} />
            <Route path="/suivi" element={<Shell><PublicSuspense><SuiviPage /></PublicSuspense></Shell>} />
            <Route path="/connexion" element={<Shell><PublicSuspense><ConnexionPage /></PublicSuspense></Shell>} />
            <Route path="/verify-email" element={<PublicSuspense><VerifyEmailPage /></PublicSuspense>} />
            <Route path="/mot-de-passe-oublie" element={<Shell><PublicSuspense><ForgotPasswordPage /></PublicSuspense></Shell>} />
            <Route path="/reset-password" element={<Shell><PublicSuspense><ResetPasswordPage /></PublicSuspense></Shell>} />
            <Route path="/checkout" element={<PublicSuspense><CheckoutPage /></PublicSuspense>} />
            <Route path="/paiement/succes" element={<PublicSuspense><PaymentSuccessPage /></PublicSuspense>} />
            <Route path="/paiement/echec" element={<PublicSuspense><PaymentFailurePage /></PublicSuspense>} />
            <Route path="/mentions-legales" element={<Shell><PublicSuspense><MentionsLegalesPage /></PublicSuspense></Shell>} />
            <Route path="/politique-confidentialite" element={<Shell><PublicSuspense><PolitiqueConfidentialitePage /></PublicSuspense></Shell>} />

            {/* Admin routes — lazy + guard synchrone */}
            <Route path="/admin/login" element={<AdminSuspense><AdminLoginPage /></AdminSuspense>} />
            <Route path="/admin/forgot-password" element={<AdminSuspense><AdminPasswordResetPage /></AdminSuspense>} />
            <Route path="/admin/reset-password" element={<AdminSuspense><AdminPasswordResetPage /></AdminSuspense>} />
            <Route path="/admin" element={
              <ProtectedAdminRoute>
                <AdminSuspense><AdminLayout /></AdminSuspense>
              </ProtectedAdminRoute>
            }>
              <Route index                element={<AdminSuspense><DashboardPage /></AdminSuspense>} />
              <Route path="commandes"     element={<AdminSuspense><OrdersPage /></AdminSuspense>} />
              <Route path="menu"          element={<AdminSuspense><MenuDayPage /></AdminSuspense>} />
              <Route path="categories"    element={<AdminSuspense><CategoriesPage /></AdminSuspense>} />
              <Route path="ingredients"   element={<AdminSuspense><IngredientsPage /></AdminSuspense>} />
              <Route path="stocks"        element={<AdminSuspense><StocksPage /></AdminSuspense>} />
              <Route path="utilisateurs"  element={<AdminSuspense><UsersPage /></AdminSuspense>} />
              <Route path="factures"      element={<AdminSuspense><InvoicesPage /></AdminSuspense>} />
              <Route path="historique"    element={<AdminSuspense><HistoryPage /></AdminSuspense>} />
              <Route path="avis"          element={<AdminSuspense><AvisClientsAdminPage /></AdminSuspense>} />
              <Route path="whatsapp"      element={<AdminSuspense><WhatsAppPage /></AdminSuspense>} />
              <Route path="rapports"      element={<AdminSuspense><SalesReportPage /></AdminSuspense>} />
              <Route path="promotions"    element={<AdminSuspense><PromotionsPage /></AdminSuspense>} />
              <Route path="suggestions"   element={<AdminSuspense><SuggestionsPage /></AdminSuspense>} />
              <Route path="consultations" element={<AdminSuspense><ConsultationsAdminPage /></AdminSuspense>} />
              <Route path="plans"         element={<AdminSuspense><PlansAdminPage /></AdminSuspense>} />
              <Route path="abonnements"   element={<AdminSuspense><SubscriptionsAdminPage /></AdminSuspense>} />
              <Route path="faqs"          element={<AdminSuspense><FAQsAdminPage /></AdminSuspense>} />
              <Route path="temoignages"   element={<AdminSuspense><AvisClientsAdminPage /></AdminSuspense>} />
              <Route path="livraison"     element={<AdminSuspense><LivraisonAdminPage /></AdminSuspense>} />
              <Route path="parametres"    element={<AdminSuspense><SettingsPage /></AdminSuspense>} />
            </Route>

            <Route path="*" element={<Shell><PublicSuspense><NotFound /></PublicSuspense></Shell>} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
      </UserProvider>
    </TooltipProvider>
  </ErrorBoundary>
);

export default App;
