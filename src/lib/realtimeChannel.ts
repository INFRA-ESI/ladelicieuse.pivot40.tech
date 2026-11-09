import type { ManagerOptions, Socket, SocketOptions } from 'socket.io-client';

// Canal temps réel côté navigateur. Les événements reçus sont de simples SIGNAUX (« une commande a changé ») :
// ils ne prouvent rien, en particulier pas un paiement. Les pages rechargent leurs données via l'API
// authentifiée, qui reste la source de vérité ; le canal ne fait que les prévenir plus vite que le polling.

type Handler = (event: string, payload: unknown) => void;
type ConnectOptions = Partial<ManagerOptions & SocketOptions>;
type Connect = (options: ConnectOptions) => Promise<Socket>;

export interface Subscription {
  events: readonly string[];
  handler: Handler;
  /** Appelée à chaque (re)connexion : rattrape ce qui a pu être manqué pendant la coupure. */
  onResync?: () => void;
  /** Appelée quand l'état de la connexion change (et à l'abonnement, avec l'état courant). */
  onStatus?: (connected: boolean) => void;
}

interface ChannelOptions {
  /** Jeton courant, relu à chaque (re)connexion : un jeton renouvelé est pris en compte. */
  getToken: () => string | null;
  /** Remplaçable pour les tests. Par défaut : socket.io-client, chargé seulement quand on en a besoin. */
  connect?: Connect;
  /** Délai avant de rouvrir une connexion coupée volontairement par le serveur (expiration du jeton). */
  serverDisconnectRetryMs?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
}

/** Identifiants d'événements gardés en mémoire pour écarter un doublon. */
const SEEN_LIMIT = 200;

// La bibliothèque est chargée à la demande : elle n'alourdit pas le premier affichage du site.
const defaultConnect: Connect = async options => {
  const { io } = await import('socket.io-client');
  return io(options);
};

export function createRealtimeChannel({
  getToken,
  connect = defaultConnect,
  serverDisconnectRetryMs = 1000,
  reconnectionDelay = 1000,
  reconnectionDelayMax = 15_000,
}: ChannelOptions) {
  const subscriptions = new Set<Subscription>();
  const listeners = new Map<string, (payload: unknown) => void>();
  const seen = new Set<string>();

  let socket: Socket | null = null;
  let opening = false;
  let connected = false;
  /** Jeton refusé par le serveur : on arrête d'insister jusqu'au prochain abonnement. */
  let refused = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const safely = (fn?: () => void) => { try { fn?.(); } catch { /* un abonné défaillant ne doit pas gêner les autres */ } };

  function setConnected(value: boolean): void {
    if (connected === value) return;
    connected = value;
    subscriptions.forEach(sub => safely(() => sub.onStatus?.(value)));
  }

  /** Un même changement peut arriver deux fois : on ne le traite qu'une. */
  function isDuplicate(payload: unknown): boolean {
    const id = (payload as { eventId?: unknown } | null)?.eventId;
    if (typeof id !== 'string') return false;
    if (seen.has(id)) return true;
    seen.add(id);
    if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);
    return false;
  }

  function dispatch(event: string, payload: unknown): void {
    if (isDuplicate(payload)) return;
    subscriptions.forEach(sub => {
      if (sub.events.includes(event)) safely(() => sub.handler(event, payload));
    });
  }

  /** Un écouteur par nom d'événement réellement demandé, retiré dès que plus personne n'en veut. */
  function syncListeners(): void {
    if (!socket) return;
    const needed = new Set<string>();
    subscriptions.forEach(sub => sub.events.forEach(event => needed.add(event)));
    for (const [event, listener] of listeners) {
      if (!needed.has(event)) { socket.off(event, listener); listeners.delete(event); }
    }
    for (const event of needed) {
      if (listeners.has(event)) continue;
      const listener = (payload: unknown) => dispatch(event, payload);
      socket.on(event, listener);
      listeners.set(event, listener);
    }
  }

  function wire(s: Socket): void {
    s.on('connect', () => {
      setConnected(true);
      subscriptions.forEach(sub => safely(sub.onResync));
    });
    s.on('disconnect', reason => {
      setConnected(false);
      // Coupure volontaire du serveur (jeton expiré) : socket.io ne se reconnecte pas seul dans ce cas.
      if (reason === 'io server disconnect' && !refused) {
        retryTimer = setTimeout(() => { if (socket === s && !refused) s.connect(); }, serverDisconnectRetryMs);
      }
    });
    s.on('connect_error', error => {
      // Jeton refusé (expiré, révoqué) : inutile d'insister, le rechargement périodique prend le relais.
      if (error.message === 'unauthorized') { refused = true; s.disconnect(); setConnected(false); }
      // Toute autre erreur (réseau, serveur arrêté) : socket.io retente seul avec un délai croissant.
    });
    syncListeners();
    s.connect();
  }

  async function open(): Promise<void> {
    if (socket || opening || refused || !getToken()) return;
    opening = true;
    try {
      const s = await connect({
        path: '/socket.io',
        autoConnect: false,
        reconnection: true,
        reconnectionDelay,
        reconnectionDelayMax,
        auth: callback => callback({ token: getToken() }),
      });
      if (subscriptions.size === 0) { s.disconnect(); return; } // tout le monde est parti pendant le chargement
      socket = s;
      wire(s);
    } catch {
      // Bibliothèque ou réseau indisponible : le rechargement périodique des pages continue de fonctionner.
    } finally {
      opening = false;
    }
  }

  function close(): void {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (socket) { socket.removeAllListeners(); socket.disconnect(); }
    socket = null;
    listeners.clear();
    seen.clear();
    connected = false;
  }

  function subscribe(subscription: Subscription): () => void {
    subscriptions.add(subscription);
    if (refused) {
      // Nouvelle page, peut-être nouveau jeton : une seule nouvelle tentative.
      refused = false;
      socket?.connect();
    }
    syncListeners();
    safely(() => subscription.onStatus?.(connected));
    void open();

    return () => {
      subscriptions.delete(subscription);
      if (subscriptions.size === 0) close(); else syncListeners();
    };
  }

  return { subscribe, isConnected: () => connected };
}

export type RealtimeChannel = ReturnType<typeof createRealtimeChannel>;
