import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Share, SquarePlus, X } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { PWA_IOS_CARD_DISMISSED_KEY } from '@/lib/pwa';

const STEPS = [
  { icon: Share,      text: <>Touchez le bouton <strong>Partager</strong>.</> },
  { icon: SquarePlus, text: <>Sélectionnez <strong>« Ajouter à l'écran d'accueil »</strong>.</> },
  { icon: null,       text: <>Appuyez sur <strong>Ajouter</strong>.</> },
] as const;

// Safari (iOS/iPadOS) n'a pas d'équivalent à `beforeinstallprompt` : l'installation ne peut
// se faire que manuellement via le menu Partager. Cette carte explique la marche à suivre,
// une seule fois (mémorisée en localStorage), et jamais si l'app est déjà installée.
export default function IOSInstallCard() {
  const { isIOS } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(PWA_IOS_CARD_DISMISSED_KEY) === '1'; } catch { return false; }
  });

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(PWA_IOS_CARD_DISMISSED_KEY, '1'); } catch { /* stockage indisponible — pas bloquant */ }
  };

  const open = isIOS && !dismissed;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-modal="false"
          aria-label="Instructions d'installation sur iOS"
          className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:w-full sm:max-w-sm z-50 bg-background border border-border rounded-2xl shadow-2xl p-5"
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="Fermer"
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-3 mb-4 pr-6">
            <img src="/apple-touch-icon.png" alt="" className="w-11 h-11 rounded-xl shadow-sm shrink-0" />
            <h3 className="font-display text-lg text-foreground leading-tight">Installer La Délicieuse Diète</h3>
          </div>

          <ol className="space-y-3 mb-4">
            {STEPS.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-body text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="font-body text-sm text-foreground leading-relaxed flex items-center gap-1.5 flex-wrap">
                  {step.text}
                  {step.icon && <step.icon className="w-4 h-4 text-primary inline shrink-0" aria-hidden="true" />}
                </span>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={dismiss}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-body text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            J'ai compris
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
