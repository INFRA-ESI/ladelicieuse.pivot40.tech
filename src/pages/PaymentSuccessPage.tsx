import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, ShoppingBag, Home, MessageCircle } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { formatFCFA } from '@/lib/utils';
import { STORE_WHATSAPP } from '@/lib/config';

const WHATSAPP_NUMBER = STORE_WHATSAPP;

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();

  const orderId     = searchParams.get('order') ?? '';
  const provider    = searchParams.get('provider') ?? '';
  const txnId       = searchParams.get('txn') ?? sessionStorage.getItem('singpay_txn') ?? '';

  const [txnStatus, setTxnStatus] = useState<'loading' | 'verified' | 'unverified'>('loading');
  const [amount, setAmount]       = useState<number | null>(null);

  useEffect(() => {
    // Nettoyer le panier et le sessionStorage
    clearCart();
    sessionStorage.removeItem('singpay_txn');
    sessionStorage.removeItem('singpay_order');

    if (!txnId) {
      setTxnStatus('verified');
      return;
    }

    // Vérifier le statut de la transaction
    fetch(`/api/payments/singpay/check/${txnId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.status === 'success') {
          setAmount(json.data.amount ?? null);
          setTxnStatus('verified');
        } else {
          setTxnStatus('unverified');
        }
      })
      .catch(() => setTxnStatus('verified')); // tolérant en cas d'erreur réseau
  }, []);

  const providerLabel: Record<string, string> = {
    airtel: 'Airtel Money',
    moov:   'Moov Money',
    paypal: 'PayPal / Maviance',
    card:   'Carte bancaire',
    cash:   'Espèces',
  };

  const whatsappMsg = encodeURIComponent(
    `Bonjour, mon paiement a été confirmé pour la commande #${orderId?.slice(-8).toUpperCase() || 'N/A'}. Merci`
  );

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center"
      >
        {/* Icône animée */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, duration: 0.2, ease: 'easeOut' }}
          className="flex justify-center mb-6"
        >
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Paiement confirmé</h1>
          <p className="text-gray-500 mb-6">
            Votre commande a bien été reçue et est en cours de préparation.
          </p>

          {/* Détails */}
          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-6">
            {orderId && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Commande</span>
                <span className="font-semibold">#{orderId.slice(-8).toUpperCase()}</span>
              </div>
            )}
            {provider && providerLabel[provider] && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Moyen de paiement</span>
                <span className="font-semibold">{providerLabel[provider]}</span>
              </div>
            )}
            {amount !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Montant</span>
                <span className="font-semibold text-green-700">{formatFCFA(amount)}</span>
              </div>
            )}
            {txnStatus === 'loading' && (
              <div className="text-xs text-gray-400">Vérification du paiement…</div>
            )}
          </div>

          {/* Prochaines étapes */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left mb-6">
            <p className="text-sm font-medium text-green-800 mb-2">Prochaines étapes :</p>
            <ul className="text-sm text-green-700 space-y-1 list-disc list-inside">
              <li>Notre équipe prépare votre commande</li>
              <li>Vous recevrez une confirmation par SMS</li>
              <li>Livraison estimée selon votre créneau choisi</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button asChild className="w-full bg-green-600 hover:bg-green-700">
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMsg}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Suivre ma commande sur WhatsApp
              </a>
            </Button>

            <Button asChild variant="outline" className="w-full">
              <Link to="/mon-compte">
                <ShoppingBag className="w-4 h-4 mr-2" />
                Voir mes commandes
              </Link>
            </Button>

            <Button asChild variant="ghost" className="w-full">
              <Link to="/">
                <Home className="w-4 h-4 mr-2" />
                Retour à l'accueil
              </Link>
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
