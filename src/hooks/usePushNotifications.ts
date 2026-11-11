import { useCallback, useEffect, useState } from 'react';
import { ls } from '@/lib/storage';
import { isIOSDevice, isStandaloneDisplayMode } from '@/lib/pwa';
import { pushAvailability, readPushEnvironment, urlBase64ToUint8Array, type PushAvailability } from '@/lib/pushSupport';

// Notifications push : jamais de demande d'autorisation au chargement d'une page. L'autorisation est demandée quand
// l'utilisateur touche « Activer les notifications » (obligatoire sur iPhone, mieux accepté partout ailleurs).
// L'identité de l'abonné est celle de sa session : le jeton part dans l'en-tête, le serveur n'accepte aucun identifiant
// envoyé par le navigateur.

export type PushAudience = 'client' | 'admin';

const CLIENT_TOKEN_KEY = 'ladelicieuse_token';
const ADMIN_TOKEN_KEY = 'admin_token';

const config = (audience: PushAudience) => ({
  tokenKey: audience === 'admin' ? ADMIN_TOKEN_KEY : CLIENT_TOKEN_KEY,
  base: audience === 'admin' ? '/api/notifications/push/admin' : '/api/notifications/push',
});

async function fetchVapidKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/notifications/push/vapid-key');
    const json = await res.json();
    return json.success ? json.publicKey : null;
  } catch {
    return null;
  }
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

async function sendToServer(audience: PushAudience, method: 'POST' | 'DELETE', body: unknown): Promise<void> {
  const { tokenKey, base } = config(audience);
  const token = ls.get(tokenKey);
  if (!token) throw new Error('Connectez-vous pour gérer les notifications.');
  const res = await fetch(`${base}/${method === 'POST' ? 'subscribe' : 'unsubscribe'}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Session expirée : reconnectez-vous.' : 'Le serveur a refusé l\'abonnement. Réessayez.');
}

// Abonne l'appareil (l'autorisation est déjà accordée) et l'enregistre côté serveur : l'abonnement existant est réutilisé.
async function subscribeAndRegister(audience: PushAudience): Promise<PushSubscription> {
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = await fetchVapidKey();
    if (!key) throw new Error('Les notifications ne sont pas disponibles pour le moment.');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
  }
  await sendToServer(audience, 'POST', { subscription: sub.toJSON() });
  return sub;
}

// Resynchronisation silencieuse : si l'utilisateur a déjà accordé l'autorisation, l'abonnement est rafraîchi côté serveur
// (le service push peut renouveler le point d'accès). Ne demande JAMAIS l'autorisation et ne dit rien en cas d'échec.
export async function syncPushSilently(audience: PushAudience): Promise<void> {
  try {
    const env = readPushEnvironment(isIOSDevice(), isStandaloneDisplayMode());
    if (pushAvailability(env) !== 'ready' || env.permission !== 'granted') return;
    if (!ls.get(config(audience).tokenKey)) return;
    await subscribeAndRegister(audience);
  } catch {
    // non critique
  }
}

export interface PushState {
  availability: PushAvailability;
  /** Cet appareil reçoit les notifications. */
  subscribed: boolean;
  /** Vérification ou action en cours. */
  busy: boolean;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

export function usePushNotifications(audience: PushAudience): PushState {
  const [availability, setAvailability] = useState<PushAvailability>(() => pushAvailability(readPushEnvironment(isIOSDevice(), isStandaloneDisplayMode())));
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // État de départ : l'appareil est-il déjà abonné ? (lecture seule, aucune demande d'autorisation)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const env = readPushEnvironment(isIOSDevice(), isStandaloneDisplayMode());
        const state = pushAvailability(env);
        if (alive) setAvailability(state);
        if (state !== 'ready' || env.permission !== 'granted') return;
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = await reg?.pushManager.getSubscription();
        if (alive) setSubscribed(!!sub);
      } catch {
        // état inconnu : le bouton reste proposé
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      // Première instruction asynchrone : l'autorisation doit être demandée pendant le geste de l'utilisateur (iOS).
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setAvailability(permission === 'denied' ? 'denied' : 'ready');
        if (permission === 'default') setError('Autorisation non accordée. Touchez de nouveau le bouton pour réessayer.');
        return;
      }
      await subscribeAndRegister(audience);
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }, [audience]);

  const disable = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await sendToServer(audience, 'DELETE', { endpoint }).catch(() => { /* déjà désabonné côté appareil : le serveur le retirera à la prochaine expiration */ });
      }
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Désactivation impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }, [audience]);

  return { availability, subscribed, busy, error, enable, disable };
}
