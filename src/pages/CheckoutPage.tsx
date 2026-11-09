import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShoppingBag, ChevronRight, Loader2, Lock, ArrowLeft,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { PaymentMethods } from '@/components/payment/PaymentMethods';
import { useCart } from '@/context/CartContext';
import { formatFCFA } from '@/lib/utils';
import Header from '@/components/Header';

interface LocationState {
  orderId?: string;
  amount?: number;
  items?: Array<{ name: string; qty: number; price: number }>;
  deliveryFee?: number;
}

export default function CheckoutPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { items, totalPrice, clearCart } = useCart();

  const state = (location.state ?? {}) as LocationState;

  // Fallback vers les données du panier si pas de state
  const orderId     = state.orderId ?? `ORDER-${Date.now()}`;
  const amount      = state.amount  ?? totalPrice;
  const deliveryFee = state.deliveryFee ?? 0;
  const cartItems   = state.items   ?? items.map((i) => ({
    name: i.name,
    qty: i.quantity,
    price: i.totalPrice,
  }));
  const total = amount + deliveryFee;

  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (total <= 0 && !state.orderId) {
      // Panier vide et pas de données en state → retour accueil
      navigate('/', { replace: true });
    }
  }, []);

  const handleSuccess = () => {
    // Appelé uniquement après confirmation réelle de SingPay (polling success)
    // ou pour les paiements espèces (confirmation immédiate volontaire).
    toast.success('Paiement confirmé', {
      description: 'Votre commande est en cours de traitement.',
    });
    setIsProcessing(false);
    clearCart();
    navigate(`/paiement/succes?order=${orderId}`, { replace: true });
  };

  const handleError = (error: string) => {
    setIsProcessing(false);
    toast.error('Erreur de paiement', { description: error });
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-20 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Fil d'Ariane */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-sm text-gray-500 mb-8"
          >
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 pl-0 hover:text-primary"
              onClick={() => navigate('/panier')}
            >
              <ArrowLeft className="w-4 h-4" />
              Panier
            </Button>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-900 font-medium">Paiement</span>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ── Colonne gauche : méthodes de paiement ────────────────────────── */}
            <div className="lg:col-span-2">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">Paiement sécurisé</h1>
                    <p className="text-sm text-gray-500">Choisissez votre méthode de paiement</p>
                  </div>
                </div>

                {/* Loader global */}
                <AnimatePresence>
                  {isProcessing && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center z-10"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-sm text-gray-600">Traitement en cours…</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative">
                  <PaymentMethods
                    amount={total}
                    orderId={orderId}
                    onSuccess={handleSuccess}
                    onError={handleError}
                  />
                </div>

                {/* Badge sécurité */}
                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    SSL 256-bit
                  </span>
                  <span>·</span>
                  <span>SingPay certifié</span>
                  <span>·</span>
                  <span>Paiements Gabon</span>
                </div>
              </motion.div>
            </div>

            {/* ── Colonne droite : récapitulatif ───────────────────────────────── */}
            <div className="lg:col-span-1">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24"
              >
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingBag className="w-5 h-5 text-gray-600" />
                  <h2 className="font-semibold text-gray-900">Récapitulatif</h2>
                </div>

                {/* Articles */}
                <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
                  {cartItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600 truncate max-w-[60%]">
                        {item.name}
                        {item.qty > 1 && (
                          <span className="ml-1 text-xs text-gray-400">×{item.qty}</span>
                        )}
                      </span>
                      <span className="font-medium text-gray-900 whitespace-nowrap">
                        {formatFCFA(item.price)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Sous-total</span>
                    <span>{formatFCFA(amount)}</span>
                  </div>
                  {deliveryFee > 0 && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Livraison</span>
                      <span>{formatFCFA(deliveryFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-base pt-1 border-t border-gray-100">
                    <span>Total</span>
                    <span className="text-primary">{formatFCFA(total)}</span>
                  </div>
                </div>

                {/* Commande ID */}
                <div className="mt-4 bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-400">
                    Référence : <span className="font-mono font-medium">#{orderId.slice(-8).toUpperCase()}</span>
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
