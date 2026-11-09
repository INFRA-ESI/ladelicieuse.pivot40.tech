import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { XCircle, RotateCcw, Home, MessageCircle, AlertTriangle } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { STORE_WHATSAPP } from '@/lib/config';

const WHATSAPP_NUMBER = STORE_WHATSAPP;

const REASON_LABELS: Record<string, string> = {
  annulation: 'Vous avez annulé le paiement.',
  timeout:    'Le délai de paiement a expiré.',
  echec:      'Le paiement a échoué côté opérateur.',
  solde:      'Solde insuffisant sur votre compte.',
  default:    'Le paiement n\'a pas pu être finalisé.',
};

export default function PaymentFailurePage() {
  const [searchParams] = useSearchParams();

  const orderId  = searchParams.get('order') ?? '';
  const provider = searchParams.get('provider') ?? '';
  const reason   = searchParams.get('reason') ?? 'default';

  const reasonLabel = REASON_LABELS[reason] ?? REASON_LABELS.default;

  const providerLabel: Record<string, string> = {
    airtel: 'Airtel Money',
    moov:   'Moov Money',
    paypal: 'PayPal / Maviance',
    card:   'Carte bancaire',
    cash:   'Espèces',
  };

  const supportMsg = encodeURIComponent(
    `Bonjour, j'ai un problème avec mon paiement pour la commande #${orderId?.slice(-8).toUpperCase() || 'N/A'}. Pouvez-vous m'aider ?`
  );

  const tips: string[] = [];
  if (provider === 'airtel' || provider === 'moov') {
    tips.push('Vérifiez votre solde Mobile Money');
    tips.push('Assurez-vous que votre numéro est bien activé pour les paiements');
    tips.push('Réessayez avec un autre numéro si nécessaire');
  } else if (provider === 'paypal') {
    tips.push('Vérifiez que votre numéro est lié à un compte Maviance actif');
    tips.push('Assurez-vous d\'avoir un solde PayPal suffisant');
    tips.push('Contactez Maviance si le problème persiste');
  } else {
    tips.push('Vérifiez vos informations de paiement');
    tips.push('Essayez avec un autre moyen de paiement');
    tips.push('Contactez votre banque si le problème persiste');
  }

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
            <XCircle className="w-10 h-10 text-red-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Paiement échoué</h1>
          <p className="text-gray-500 mb-6">{reasonLabel}</p>

          {/* Détails */}
          {(orderId || provider) && (
            <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-6">
              {orderId && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Commande</span>
                  <span className="font-semibold">#{orderId.slice(-8).toUpperCase()}</span>
                </div>
              )}
              {provider && providerLabel[provider] && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Méthode tentée</span>
                  <span className="font-semibold">{providerLabel[provider]}</span>
                </div>
              )}
            </div>
          )}

          {/* Conseils */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm font-medium text-amber-800">Que faire ?</p>
            </div>
            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
              {tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link to="/panier">
                <RotateCcw className="w-4 h-4 mr-2" />
                Réessayer le paiement
              </Link>
            </Button>

            <Button asChild variant="outline" className="w-full">
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${supportMsg}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Contacter le support
              </a>
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
