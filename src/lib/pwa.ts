// Constantes et détection de plateforme pour l'installation PWA

export const PWA_IOS_CARD_DISMISSED_KEY = 'ld_pwa_ios_card_dismissed';

// Détecte si l'app tourne déjà en mode installé (standalone), quel que soit l'OS.
// `navigator.standalone` est la seule API iOS pour ça (pas de matchMedia fiable avant iOS 13
// pour ce cas précis, donc on vérifie les deux).
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isStandaloneMedia || iosStandalone;
}

// iOS/iPadOS n'émet jamais `beforeinstallprompt` — seule la détection par user-agent
// permet de savoir qu'il faut afficher les instructions manuelles "Partager > Ajouter".
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOSUA = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ s'annonce comme "MacIntel" mais garde un écran tactile — seul indice fiable.
  const isIPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
  return isIOSUA || isIPadOS;
}

// Enregistre le service worker dès le démarrage, indépendamment des notifications push
// (usePushNotifications.ts enregistre aussi /sw.js — appeler register() deux fois avec la
// même URL/scope est sans effet de bord, cf. spec Service Worker). C'est ce qui rend l'app
// installable même si l'utilisateur refuse/n'active jamais les notifications.
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Non bloquant : l'app reste utilisable sans SW, juste sans cache hors-ligne.
    });
  });
}
