import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { Server, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';

// Temps réel : de simples SIGNAUX « quelque chose a changé ». Un événement ne transporte que des identifiants
// et un statut, jamais de données personnelles, et n'est jamais une preuve de quoi que ce soit (surtout pas
// d'un paiement) : le navigateur recharge ensuite via l'API authentifiée, qui reste la source de vérité.
//
// Isolation par construction : le serveur place lui-même chaque socket dans sa salle (`admin` ou
// `client:<id>`) et n'écoute AUCUN événement entrant, donc rien ne permet de rejoindre la salle d'un autre.

export interface OrderSignal {
  /** Identifiant unique de ce changement : le navigateur écarte un doublon déjà traité. */
  eventId: string;
  orderId: string;
  numero: string;
  statut: string;
  at: string;
}

export interface SubscriptionSignal {
  eventId: string;
  subscriptionId: string;
  statut: string;
  at: string;
}

interface Identity {
  role: 'admin' | 'client';
  id: string;
  /** Fin de validité du jeton, en secondes (epoch). */
  exp: number;
}

interface TokenPayload {
  id?: unknown;
  role?: unknown;
  exp?: unknown;
  jti?: unknown;
}

/** Connexions simultanées autorisées pour un même compte (plusieurs onglets, plusieurs appareils). */
const MAX_CONNECTIONS_PER_IDENTITY = 10;
/** setTimeout plafonne à 2^31 - 1 ms (~24,8 jours) : au-delà, on se reconnecte avec un jeton frais. */
const MAX_TIMER_MS = 2_147_483_647;

let io: Server | null = null;
const openConnections = new Map<string, number>();

const identityKey = ({ role, id }: Identity): string => `${role}:${id}`;
const roomOf = ({ role, id }: Identity): string => (role === 'admin' ? 'admin' : `client:${id}`);

/** Même règles que les routes HTTP : signature, rôle connu, jeton admin non révoqué (liste noire Redis). */
async function authenticate(token: unknown): Promise<Identity | null> {
  const secret = process.env.JWT_SECRET;
  if (typeof token !== 'string' || !token || !secret) return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as TokenPayload;
    const { id, role, exp, jti } = payload;
    if (role !== 'admin' && role !== 'client') return null;
    if (typeof exp !== 'number') return null; // un jeton sans expiration ne doit jamais ouvrir un canal durable
    const identifiant = typeof id === 'string' && id ? id : role === 'admin' ? 'admin' : null;
    if (!identifiant) return null;

    if (role === 'admin' && typeof jti === 'string') {
      const revoque = await getRedis()?.get(`blacklist:${jti}`);
      if (revoque) return null;
    }
    return { role, id: identifiant, exp };
  } catch {
    return null; // jeton falsifié ou expiré
  }
}

function onConnection(socket: Socket): void {
  const identity = socket.data.identity as Identity;
  const key = identityKey(identity);

  const count = (openConnections.get(key) ?? 0) + 1;
  if (count > MAX_CONNECTIONS_PER_IDENTITY) {
    logger.warn('[Realtime] trop de connexions pour un même compte', { role: identity.role });
    socket.disconnect(true);
    return;
  }
  openConnections.set(key, count);

  socket.join(roomOf(identity));

  // Le canal ne survit pas au jeton : à son expiration, on coupe. Le navigateur se reconnecte avec le jeton
  // courant, ou renonce s'il n'en a plus.
  const timer = setTimeout(
    () => socket.disconnect(true),
    Math.min(Math.max(identity.exp * 1000 - Date.now(), 0), MAX_TIMER_MS),
  );
  timer.unref();

  socket.on('disconnect', () => {
    clearTimeout(timer);
    const restantes = (openConnections.get(key) ?? 1) - 1;
    if (restantes <= 0) openConnections.delete(key); else openConnections.set(key, restantes);
  });
}

export interface RealtimeOptions {
  /** Origine autorisée ? Même filtre que le CORS des routes HTTP (le navigateur envoie toujours Origin sur un socket). */
  isOriginAllowed: (origin: string | undefined, req: IncomingMessage) => boolean;
}

export function initRealtime(httpServer: HttpServer, { isOriginAllowed }: RealtimeOptions): Server {
  io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 10_000,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      const autorisee = isOriginAllowed(origin, req);
      if (!autorisee) logger.warn(`[Realtime] Origine refusée: ${origin}`);
      callback(null, autorisee);
    },
  });

  io.use(async (socket, next) => {
    const identity = await authenticate((socket.handshake.auth as { token?: unknown } | undefined)?.token);
    if (!identity) { next(new Error('unauthorized')); return; }
    socket.data.identity = identity;
    next();
  });
  io.on('connection', onConnection);
  return io;
}

/**
 * Ferme les connexions au niveau du transport, sans fermer le serveur HTTP (l'arrêt gracieux s'en charge).
 * Volontairement PAS `disconnectSockets` : un socket coupé ainsi par le serveur ne se reconnecte pas, alors qu'une
 * fermeture du transport (redémarrage, déploiement) déclenche la reconnexion automatique du navigateur.
 */
export function closeRealtime(): void {
  if (!io) return;
  const server = io;
  io = null;
  openConnections.clear();
  server.engine.close();
}

// ── Émission : jamais bloquante, jamais fatale pour la requête HTTP qui la déclenche ─────────────────────────

function emit(rooms: string[], event: string, payload: object): void {
  if (!io) return;
  try {
    io.to(rooms).emit(event, payload);
  } catch (error) {
    logger.warn('[Realtime] émission échouée', { event, message: (error as Error).message });
  }
}

interface OrderLike {
  _id: unknown;
  numero: string;
  statut: string;
  userId?: unknown;
  historique?: unknown[];
  updatedAt?: Date;
}

const orderSignal = (order: OrderLike, eventId: string): OrderSignal => ({
  eventId,
  orderId: String(order._id),
  numero: order.numero,
  statut: order.statut,
  at: new Date().toISOString(),
});

/** Nouvelle commande : l'équipe seulement (le client la voit déjà dans son panier). */
export function notifyOrderCreated(order: OrderLike): void {
  emit(['admin'], 'order:created', orderSignal(order, `${String(order._id)}:created`));
}

/** Changement de statut : l'équipe et le propriétaire du compte (une commande d'invité n'a pas de canal client). */
export function notifyOrderStatus(order: OrderLike): void {
  // Un changement = une entrée de plus dans l'historique : l'identifiant est unique et reste stable aux relectures.
  const rooms = ['admin'];
  if (order.userId) rooms.push(`client:${String(order.userId)}`);
  emit(rooms, 'order:status', orderSignal(order, `${String(order._id)}:${order.historique?.length ?? 0}`));
}

/** Autre modification (priorité) : l'équipe seulement. */
export function notifyOrderUpdated(order: OrderLike): void {
  emit(['admin'], 'order:updated', orderSignal(order, `${String(order._id)}:u:${order.updatedAt?.getTime() ?? Date.now()}`));
}

interface SubscriptionLike {
  _id: unknown;
  statut: string;
  updatedAt?: Date;
}

const subscriptionSignal = (sub: SubscriptionLike, eventId: string): SubscriptionSignal => ({
  eventId,
  subscriptionId: String(sub._id),
  statut: sub.statut,
  at: new Date().toISOString(),
});

export function notifySubscriptionCreated(sub: SubscriptionLike): void {
  emit(['admin'], 'subscription:created', subscriptionSignal(sub, `${String(sub._id)}:created`));
}

export function notifySubscriptionUpdated(sub: SubscriptionLike): void {
  emit(['admin'], 'subscription:updated', subscriptionSignal(sub, `${String(sub._id)}:${sub.statut}:${sub.updatedAt?.getTime() ?? Date.now()}`));
}
