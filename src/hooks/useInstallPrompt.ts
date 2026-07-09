import { useCallback, useEffect, useState } from 'react';
import type { BeforeInstallPromptEvent, InstallOutcome } from '@/types/pwa.types';
import { isIOSDevice, isStandaloneDisplayMode } from '@/lib/pwa';

interface UseInstallPromptResult {
  /** true quand le navigateur a proposé l'invite native (Chrome/Edge Android & desktop) */
  canInstall: boolean;
  /** true sur iOS/iPadOS tant que l'app n'est pas installée (pas d'invite native possible) */
  isIOS: boolean;
  /** true si l'app tourne déjà en mode standalone (installée) */
  isInstalled: boolean;
  /** Déclenche la fenêtre d'installation native. Retourne 'unavailable' si aucune invite en attente. */
  promptInstall: () => Promise<InstallOutcome>;
}

// Centralise la détection d'installabilité PWA : capture `beforeinstallprompt` (en empêchant
// le mini-banner natif du navigateur), suit l'état "déjà installé", et expose une fonction
// unique pour déclencher l'invite native au moment choisi par l'UI (clic sur notre bouton).
export function useInstallPrompt(): UseInstallPromptResult {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplayMode());
  const [isIOS] = useState(() => isIOSDevice());

  useEffect(() => {
    if (isInstalled) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // empêche le mini-banner par défaut du navigateur
      setDeferredEvent(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredEvent(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isInstalled]);

  // Détecte aussi une installation faite hors de notre bouton (ex: menu natif du navigateur)
  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const handleChange = () => setIsInstalled(isStandaloneDisplayMode());
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferredEvent) return 'unavailable';
    await deferredEvent.prompt();
    const choice = await deferredEvent.userChoice;
    setDeferredEvent(null);
    if (choice.outcome === 'accepted') setIsInstalled(true);
    return choice.outcome;
  }, [deferredEvent]);

  return {
    canInstall: !isInstalled && deferredEvent !== null,
    isIOS: !isInstalled && isIOS,
    isInstalled,
    promptInstall,
  };
}
