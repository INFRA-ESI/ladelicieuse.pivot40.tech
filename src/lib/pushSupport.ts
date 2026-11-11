// Que peut faire cet appareil avec les notifications ? Fonction pure, séparée du navigateur pour être testée.
//
// iPhone et iPad : Safari n'envoie des notifications qu'aux sites AJOUTÉS À L'ÉCRAN D'ACCUEIL et ouverts depuis leur
// icône (iOS 16.4 ou plus récent). Dans un onglet Safari, l'API de notification n'existe pas : il faut d'abord guider
// l'installation, puis demander l'autorisation depuis un geste de l'utilisateur.

export type PushAvailability =
  | 'unsupported'   // navigateur sans notifications (ou iOS trop ancien)
  | 'ios-install'   // iPhone/iPad : installer le site sur l'écran d'accueil d'abord
  | 'denied'        // l'utilisateur a bloqué les notifications dans les réglages
  | 'ready';        // on peut demander l'autorisation (ou elle est déjà accordée)

export interface PushEnvironment {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  permission: NotificationPermission | null;
}

export function pushAvailability(env: PushEnvironment): PushAvailability {
  if (env.isIOS && !env.isStandalone) return 'ios-install';
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return 'ready';
}

export function readPushEnvironment(
  isIOS: boolean, isStandalone: boolean,
): PushEnvironment {
  const hasWindow = typeof window !== 'undefined';
  return {
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    hasPushManager: hasWindow && 'PushManager' in window,
    hasNotification: hasWindow && 'Notification' in window,
    isIOS,
    isStandalone,
    permission: hasWindow && 'Notification' in window ? Notification.permission : null,
  };
}

// Clé publique VAPID (base64 URL-safe) → octets attendus par pushManager.subscribe().
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
