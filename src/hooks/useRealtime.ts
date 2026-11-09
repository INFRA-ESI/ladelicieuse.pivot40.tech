import { useEffect, useRef, useState } from 'react';
import { createRealtimeChannel } from '@/lib/realtimeChannel';
import { ls } from '@/lib/storage';
import { TOKEN_KEY } from '@/context/UserContext';

// Un canal par type de compte : l'équipe et les clients n'ont pas le même jeton ni les mêmes événements.
// Aucune connexion tant qu'aucune page ne s'abonne (la bibliothèque n'est même pas chargée).
const channels = {
  admin:  createRealtimeChannel({ getToken: () => ls.get('admin_token') }),
  client: createRealtimeChannel({ getToken: () => ls.get(TOKEN_KEY) }),
};

/** Plusieurs signaux rapprochés (une commande + son statut) ne provoquent qu'un seul rechargement. */
const REFRESH_DEBOUNCE_MS = 300;

interface Options {
  /** Recharge les données de la page. Appelé après un signal, et à chaque (re)connexion pour rattraper les manqués. */
  refresh?: () => void;
  /** Réaction immédiate à un signal (notification, par exemple). */
  onSignal?: (event: string, payload: unknown) => void;
  enabled?: boolean;
}

/**
 * S'abonne à des signaux temps réel pendant que le composant est affiché. Renvoie `true` quand la connexion est
 * ouverte : la page peut alors espacer son rechargement périodique, qui reste le filet de sécurité sinon.
 * Un signal ne contient jamais de donnée à afficher ni de preuve de paiement : on recharge toujours via l'API.
 */
export function useRealtime(channel: keyof typeof channels, events: readonly string[], { refresh, onSignal, enabled = true }: Options = {}): boolean {
  const [connected, setConnected] = useState(false);
  const refreshRef = useRef(refresh);
  const signalRef = useRef(onSignal);
  useEffect(() => { refreshRef.current = refresh; signalRef.current = onSignal; });

  const key = events.join('|');
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const planifier = () => {
      if (!refreshRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current?.(), REFRESH_DEBOUNCE_MS);
    };
    const unsubscribe = channels[channel].subscribe({
      events: key.split('|'),
      handler: (event, payload) => { signalRef.current?.(event, payload); planifier(); },
      onResync: planifier,
      onStatus: setConnected,
    });
    return () => { unsubscribe(); if (timer) clearTimeout(timer); };
  }, [channel, key, enabled]);

  return enabled && connected;
}
