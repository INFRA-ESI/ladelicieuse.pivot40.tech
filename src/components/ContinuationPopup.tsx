import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ShoppingCart, Plus, X } from '@/components/icons';
import { useCart } from '@/context/CartContext';
import { formatPrice } from '@/data/products';

export default function ContinuationPopup() {
  const { lastAdded, dismissContinuation, totalItems, totalPrice } = useCart();

  return (
    <AnimatePresence>
      {lastAdded && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={dismissContinuation}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-x-4 bottom-6 z-50 md:inset-auto md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md"
          >
            <div className="bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-start justify-between px-6 pt-6 pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-body text-xs text-muted-foreground mb-0.5">Ajouté au panier</p>
                    <h3 className="font-display text-xl text-foreground">{lastAdded.name}</h3>
                  </div>
                </div>
                <button
                  onClick={dismissContinuation}
                  className="text-muted-foreground hover:text-foreground transition-colors mt-1"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Cart summary */}
              <div className="px-6 pt-4 pb-2">
                <div className="bg-muted/50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="font-body text-sm text-muted-foreground">
                    {totalItems} article{totalItems > 1 ? 's' : ''} dans le panier
                  </span>
                  <span className="font-display text-base text-primary font-semibold">
                    {formatPrice(totalPrice)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 pt-4 flex flex-col gap-3">
                <Link
                  to="/panier"
                  onClick={dismissContinuation}
                  className="w-full flex items-center justify-center gap-2 font-body text-sm px-6 py-4 bg-primary text-primary-foreground hover:opacity-90 transition-opacity rounded-lg"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Voir mon panier & payer
                </Link>
                <button
                  onClick={dismissContinuation}
                  className="w-full flex items-center justify-center gap-2 font-body text-sm px-6 py-3 border border-border text-foreground hover:bg-muted transition-colors rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  Continuer mes achats
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
