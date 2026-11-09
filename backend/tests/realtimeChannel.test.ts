import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { io as connectClient, type Socket } from 'socket.io-client';

process.env.JWT_SECRET = 'c'.repeat(48);
const SECRET = process.env.JWT_SECRET;

vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../config/redis.js', () => ({ getRedis: () => null }));

const { initRealtime, closeRealtime, notifyOrderStatus, notifyOrderCreated } = await import('../services/realtime.service.js');
const { createRealtimeChannel } = await import('../../src/lib/realtimeChannel.js');

const tokenFor = (id: string, expiresIn: number | string = '1h') => jwt.sign({ id, role: 'client' }, SECRET, { expiresIn });
const order = (n: number) => ({ _id: 'o1', numero: 'LDD-0001', statut: 'confirmee', userId: 'u1', historique: new Array(n).fill({}) });

let server: HttpServer | null = null;
const created: Socket[] = [];

async function start(port = 0): Promise<number> {
  server = createServer();
  initRealtime(server, { isOriginAllowed: () => true });
  await new Promise<void>(resolve => server!.listen(port, resolve));
  return (server.address() as AddressInfo).port;
}
async function stop(): Promise<void> {
  closeRealtime();
  const s = server;
  server = null;
  if (s) await new Promise<void>(resolve => { s.closeAllConnections?.(); s.close(() => resolve()); });
}

/** Le « connect » du canal, branché sur le vrai serveur de test (WebSocket pur, délais courts). */
const connectTo = (port: number) => vi.fn(async (options: object) => {
  const socket = connectClient(`http://127.0.0.1:${port}`, { ...options, transports: ['websocket'], forceNew: true });
  created.push(socket);
  return socket;
});

const settle = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (condition: () => boolean, ms = 4000) => {
  const deadline = Date.now() + ms;
  while (!condition() && Date.now() < deadline) await settle(20);
  return condition();
};

const FAST = { reconnectionDelay: 40, reconnectionDelayMax: 80, serverDisconnectRetryMs: 40 };

afterEach(async () => {
  for (const socket of created.splice(0)) socket.close();
  await stop();
});

describe('canal du navigateur — abonnement et nettoyage', () => {
  it("reçoit les signaux demandés, et seulement ceux-là", async () => {
    const port = await start();
    const channel = createRealtimeChannel({ getToken: () => tokenFor('u1'), connect: connectTo(port), ...FAST });
    const recus: Array<[string, unknown]> = [];
    const off = channel.subscribe({ events: ['order:status'], handler: (e, p) => recus.push([e, p]) });
    await waitFor(() => channel.isConnected());

    notifyOrderStatus(order(1));
    notifyOrderCreated(order(1)); // événement admin : n'arrive pas à un client, et n'est de toute façon pas demandé
    expect(await waitFor(() => recus.length === 1)).toBe(true);
    await settle();
    expect(recus).toHaveLength(1);
    expect(recus[0][0]).toBe('order:status');
    off();
  });

  it("ne se connecte pas sans jeton (visiteur : le rechargement périodique suffit)", async () => {
    const port = await start();
    const connect = connectTo(port);
    const channel = createRealtimeChannel({ getToken: () => null, connect, ...FAST });
    const off = channel.subscribe({ events: ['order:status'], handler: () => undefined });
    await settle(200);
    expect(connect).not.toHaveBeenCalled();
    expect(channel.isConnected()).toBe(false);
    off();
  });

  it('une seule connexion partagée entre plusieurs abonnés, fermée quand le dernier part', async () => {
    const port = await start();
    const connect = connectTo(port);
    const channel = createRealtimeChannel({ getToken: () => tokenFor('u1'), connect, ...FAST });
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = channel.subscribe({ events: ['order:status'], handler: (_e, p) => a.push(p) });
    const offB = channel.subscribe({ events: ['order:created'], handler: (_e, p) => b.push(p) });
    await waitFor(() => channel.isConnected());
    expect(connect).toHaveBeenCalledTimes(1);

    notifyOrderStatus(order(1));
    await waitFor(() => a.length === 1);
    expect(b).toEqual([]);                       // B n'a demandé que « order:created »

    offA();
    expect(channel.isConnected()).toBe(true);    // B est toujours là
    offB();
    expect(created[0].connected).toBe(false);    // plus personne : connexion fermée
  });

  it('retire ses écouteurs au désabonnement (aucune fuite)', async () => {
    const port = await start();
    const channel = createRealtimeChannel({ getToken: () => tokenFor('u1'), connect: connectTo(port), ...FAST });
    const recus: unknown[] = [];
    const off = channel.subscribe({ events: ['order:status', 'order:updated'], handler: (_e, p) => recus.push(p) });
    await waitFor(() => channel.isConnected());
    const socket = created[0];
    expect(socket.hasListeners('order:status')).toBe(true);

    off();
    expect(socket.hasListeners('order:status')).toBe(false);
    expect(socket.hasListeners('order:updated')).toBe(false);
    notifyOrderStatus(order(1));
    await settle();
    expect(recus).toEqual([]);
  });

  it("l'abandon d'une page retire seulement ses propres écouteurs, pas ceux des autres", async () => {
    const port = await start();
    const channel = createRealtimeChannel({ getToken: () => tokenFor('u1'), connect: connectTo(port), ...FAST });
    const garde: unknown[] = [];
    const offTemporaire = channel.subscribe({ events: ['order:status'], handler: () => undefined });
    const offGarde = channel.subscribe({ events: ['order:status'], handler: (_e, p) => garde.push(p) });
    await waitFor(() => channel.isConnected());

    offTemporaire();
    notifyOrderStatus(order(1));
    expect(await waitFor(() => garde.length === 1)).toBe(true);
    offGarde();
  });
});

describe('canal du navigateur — doublons et robustesse', () => {
  it('traite une seule fois un même changement reçu en double, mais pas deux changements distincts', async () => {
    const port = await start();
    const channel = createRealtimeChannel({ getToken: () => tokenFor('u1'), connect: connectTo(port), ...FAST });
    const recus: unknown[] = [];
    const off = channel.subscribe({ events: ['order:status'], handler: (_e, p) => recus.push(p) });
    await waitFor(() => channel.isConnected());

    notifyOrderStatus(order(1));
    notifyOrderStatus(order(1));   // même identifiant : doublon
    notifyOrderStatus(order(2));   // nouveau changement
    expect(await waitFor(() => recus.length === 2)).toBe(true);
    await settle();
    expect(recus).toHaveLength(2);
    off();
  });

  it("un abonné qui plante n'empêche pas les autres de recevoir le signal", async () => {
    const port = await start();
    const channel = createRealtimeChannel({ getToken: () => tokenFor('u1'), connect: connectTo(port), ...FAST });
    const recus: unknown[] = [];
    const off1 = channel.subscribe({ events: ['order:status'], handler: () => { throw new Error('bug dans une page'); } });
    const off2 = channel.subscribe({ events: ['order:status'], handler: (_e, p) => recus.push(p) });
    await waitFor(() => channel.isConnected());

    notifyOrderStatus(order(1));
    expect(await waitFor(() => recus.length === 1)).toBe(true);
    off1(); off2();
  });

  it("signale l'état de la connexion pour que les pages ajustent leur rechargement périodique", async () => {
    const port = await start();
    const channel = createRealtimeChannel({ getToken: () => tokenFor('u1'), connect: connectTo(port), ...FAST });
    const etats: boolean[] = [];
    const off = channel.subscribe({ events: ['order:status'], handler: () => undefined, onStatus: c => etats.push(c) });
    await waitFor(() => channel.isConnected());
    expect(etats).toEqual([false, true]);
    off();
  });
});

describe('canal du navigateur — reconnexion', () => {
  it('se reconnecte seul après un redémarrage du serveur, relance un rechargement et reçoit de nouveau les signaux', async () => {
    const port = await start();
    const channel = createRealtimeChannel({ getToken: () => tokenFor('u1'), connect: connectTo(port), ...FAST });
    const recus: unknown[] = [];
    let resyncs = 0;
    const off = channel.subscribe({ events: ['order:status'], handler: (_e, p) => recus.push(p), onResync: () => { resyncs++; } });
    await waitFor(() => channel.isConnected());
    expect(resyncs).toBe(1);                   // première connexion : rattrape ce qui est arrivé pendant le chargement

    await stop();
    expect(await waitFor(() => !channel.isConnected())).toBe(true);
    await start(port);
    expect(await waitFor(() => channel.isConnected(), 6000)).toBe(true);
    expect(resyncs).toBe(2);                   // reconnexion : un nouveau rechargement rattrape les signaux manqués

    notifyOrderStatus(order(1));
    expect(await waitFor(() => recus.length === 1)).toBe(true);
    off();
  });

  it("après la coupure du serveur à l'expiration du jeton, se reconnecte avec le jeton renouvelé", async () => {
    const port = await start();
    let courant = tokenFor('u1', 1);              // expire dans 1 s
    const channel = createRealtimeChannel({ getToken: () => courant, connect: connectTo(port), ...FAST });
    let resyncs = 0;
    const off = channel.subscribe({ events: ['order:status'], handler: () => undefined, onResync: () => { resyncs++; } });
    await waitFor(() => channel.isConnected());

    courant = tokenFor('u1', '1h');               // le navigateur a renouvelé son jeton entre-temps
    expect(await waitFor(() => !channel.isConnected(), 3000)).toBe(true);   // le serveur coupe à l'expiration
    expect(await waitFor(() => channel.isConnected(), 4000)).toBe(true);    // et le canal se rouvre tout seul
    expect(resyncs).toBe(2);
    off();
  });

  it("un jeton refusé ne provoque pas de boucle de reconnexion", async () => {
    const port = await start();
    const connect = connectTo(port);
    const channel = createRealtimeChannel({ getToken: () => tokenFor('u1', -10), connect, ...FAST }); // déjà expiré
    const off = channel.subscribe({ events: ['order:status'], handler: () => undefined });
    await settle(500);

    expect(channel.isConnected()).toBe(false);
    expect(created[0].active).toBe(false);        // plus de reconnexion automatique prévue
    off();
  });

  it("un nouvel abonnement (nouvelle page) retente une fois avec le jeton courant", async () => {
    const port = await start();
    let courant = tokenFor('u1', -10);            // refusé
    const channel = createRealtimeChannel({ getToken: () => courant, connect: connectTo(port), ...FAST });
    const off1 = channel.subscribe({ events: ['order:status'], handler: () => undefined });
    await settle(400);
    expect(channel.isConnected()).toBe(false);

    courant = tokenFor('u1', '1h');               // l'utilisateur s'est reconnecté
    const off2 = channel.subscribe({ events: ['order:status'], handler: () => undefined });
    expect(await waitFor(() => channel.isConnected())).toBe(true);
    off1(); off2();
  });
});
