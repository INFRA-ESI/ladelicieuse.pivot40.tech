import { AnimatePresence, motion } from 'framer-motion';
import InstallAppButton from '@/components/InstallAppButton';
import IOSInstallCard from '@/components/IOSInstallCard';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

// Point de montage unique (voir App.tsx) qui affiche soit le bouton d'installation natif
// (Chrome/Edge Android & desktop), soit la carte d'instructions iOS — jamais les deux à la
// fois, jamais si l'app est déjà installée.
export default function PWAInstall() {
  const { canInstall } = useInstallPrompt();

  return (
    <>
      <AnimatePresence>
        {canInstall && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 z-50 flex justify-center sm:justify-end"
          >
            <InstallAppButton className="shadow-xl" />
          </motion.div>
        )}
      </AnimatePresence>
      <IOSInstallCard />
    </>
  );
}
