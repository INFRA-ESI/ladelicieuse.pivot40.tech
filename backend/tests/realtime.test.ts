import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { io as connectClient, type Socket } from 'socket.io-client';

process.env.JWT_SECRET = 'r'.repeat(48);
const SECRET = process.env.JWT_SECRET;

const revoked = new Set<string>();
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../config/redis.js', () => ({ getRedis: () => ({ get: async (key: string) => (revoked.has(key) ? '1' : null) }) }));

const {
  initRealtime, closeRealtime,
  notifyOrderCreated, notifyOrderStatus, notifyOrderUpdated, notifySubscriptionCreated, notifySubscriptionUpdated,
} = await import('../services/realtime.service.js');

const ALLOWED_ORIGIN = 'http://app.test';
const tokens = {
  admin:  () => jwt.sign({ id: 'admin-1', role: 'admin', jti: 'jti-ok' }, SECRET, { expiresIn: '1h' }),
  client: (id = 'u1') => jwt.sign({ id, email: `${id}@example.com`, role: 'client' }, SECRET, { expiresIn: '1h' }),
};

let server: HttpServer | null = null;
const sockets: Socket[] = [];
const disconnectReasons = new WeakMap<Socket, string>();

async function start(port = 0): Promise<number> {
  server = createServer();
  initRealtime(server, { isOriginAllowed: origin => !origin || origin === ALLOWED_ORIGIN });
  await new Promise<void>(resolve => server!.listen(port, resolve));
  return (server.address() as AddressInfo).port;
}

async function stop(): Promise<void> {
  closeRealtime();
  const s = server;
  server = null;
  if (s) await new Promise<void>(resolve => { s.closeAllConnections?.(); s.close(() => resolve()); });
}

const url = (port: number) => `http://127.0.0.1:${port}`;

/** Ouvre un socket ; la promesse échoue avec le message de refus du serveur. */
function open(port: number, token: string | undefined, extra: Record<string, unknown> = {}): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connectClient(url(port), {
      path: '/socket.io', transports: ['websocket'], reconnection: false, forceNew: true,
      auth: token === undefined ? {} : { token }, ...extra,
    });
    sockets.push(socket);
    socket.on('disconnect', reason => disconnectReasons.set(socket, reason));
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', error => reject(error));
  });
}

/** Événements reçus pendant une courte fenêtre : suffit à prouver qu'un message n'est PAS arrivé. */
function listen(socket: Socket, ...events: string[]): Array<{ event: string; payload: Record<string, unknown> }> {
  const received: Array<{ event: string; payload: Record<string, unknown> }> = [];
  for (const event of events) socket.on(event, payload => received.push({ event, payload }));
  return received;
}
const settle = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (condition: () => boolean, ms = 3000) => {
  const deadline = Date.now() + ms;
  while (!condition() && Date.now() < deadline) await settle(20);
  return condition();
};

const order = { _id: 'o1', numero: 'LDD-0001', statut: 'confirmee', userId: 'u1', historique: [{}, {}] };
const ALL_EVENTS = ['order:created', 'order:status', 'order:updated', 'subscription:created', 'subscription:updated'];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  revoked.clear();
  await stop();
});

describe('authentification des connexions', () => {
  it('accepte un jeton admin et un jeton client valides', async () => {
    const port = await start();
    expect((await open(port, tokens.admin())).connected).toBe(true);
    expect((await open(port, tokens.client())).connected).toBe(true);
  });

  it.each([
    ['sans jeton', undefined],
    ['avec un jeton vide', ''],
    ['avec un jeton illisible', 'pas-un-jwt'],
    ['avec un jeton signé par une autre clé', jwt.sign({ id: 'x', role: 'admin' }, 'z'.repeat(48), { expiresIn: '1h' })],
    ['avec un jeton expiré', jwt.sign({ id: 'u1', role: 'client' }, SECRET, { expiresIn: -10 })],
    ['avec un rôle inconnu', jwt.sign({ id: 'u1', role: 'invite' }, SECRET, { expiresIn: '1h' })],
    ['avec un jeton sans expiration', jwt.sign({ id: 'u1', role: 'client' }, SECRET)],
    ['avec un jeton « alg: none » non signé', `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id: 'u1', role: 'client', exp: 9999999999 })).toString('base64url')}.`],
  ])('refuse la connexion %s', async (_nom, token) => {
    const port = await start();
    await expect(open(port, token)).rejects.toThrow('unauthorized');
  });

  it('refuse un jeton admin révoqué (liste noire), comme les routes HTTP', async () => {
    const port = await start();
    revoked.add('blacklist:jti-ok');
    await expect(open(port, tokens.admin())).rejects.toThrow('unauthorized');
  });

  it('refuse une origine inconnue (WebSocket) et accepte l\'origine du site', async () => {
    const port = await start();
    await expect(open(port, tokens.client(), { extraHeaders: { Origin: 'https://evil.example' } })).rejects.toBeTruthy();
    expect((await open(port, tokens.client(), { extraHeaders: { Origin: ALLOWED_ORIGIN } })).connected).toBe(true);
  });
});

describe('isolation des événements', () => {
  it("un client ne reçoit que les événements de SES commandes, l'équipe reçoit tout", async () => {
    const port = await start();
    const admin = await open(port, tokens.admin());
    const proprietaire = await open(port, tokens.client('u1'));
    const autre = await open(port, tokens.client('u2'));
    const adminRecu = listen(admin, ...ALL_EVENTS);
    const proprietaireRecu = listen(proprietaire, ...ALL_EVENTS);
    const autreRecu = listen(autre, ...ALL_EVENTS);

    notifyOrderStatus(order);
    await settle();

    expect(adminRecu.map(e => e.event)).toEqual(['order:status']);
    expect(proprietaireRecu.map(e => e.event)).toEqual(['order:status']);
    expect(autreRecu).toEqual([]);
  });

  it("un client ne reçoit jamais les événements réservés à l'équipe (création, priorité, abonnements)", async () => {
    const port = await start();
    const admin = await open(port, tokens.admin());
    const client = await open(port, tokens.client('u1'));
    const adminRecu = listen(admin, ...ALL_EVENTS);
    const clientRecu = listen(client, ...ALL_EVENTS);

    notifyOrderCreated(order);
    notifyOrderUpdated({ ...order, updatedAt: new Date(1) });
    notifySubscriptionCreated({ _id: 's1', statut: 'en_attente' });
    notifySubscriptionUpdated({ _id: 's1', statut: 'active', updatedAt: new Date(2) });
    await settle();

    expect(adminRecu.map(e => e.event).sort()).toEqual(['order:created', 'order:updated', 'subscription:created', 'subscription:updated']);
    expect(clientRecu).toEqual([]);
  });

  it("un client ne peut pas rejoindre une salle en l'envoyant lui-même (aucun événement entrant n'est écouté)", async () => {
    const port = await start();
    const admin = await open(port, tokens.admin());
    const pirate = await open(port, tokens.client('u9'));
    listen(admin, ...ALL_EVENTS);
    const pirateRecu = listen(pirate, ...ALL_EVENTS);

    for (const tentative of ['join', 'join:admin', 'subscribe', 'room', 'admin']) {
      pirate.emit(tentative, 'admin');
      pirate.emit(tentative, { room: 'admin' }, () => undefined);
    }
    await settle();
    notifyOrderCreated(order);
    notifyOrderStatus({ ...order, userId: 'u1' });
    await settle();

    expect(pirateRecu).toEqual([]);
  });

  it("une commande d'invité (sans compte) n'est envoyée qu'à l'équipe", async () => {
    const port = await start();
    const admin = await open(port, tokens.admin());
    const client = await open(port, tokens.client('u1'));
    const adminRecu = listen(admin, 'order:status');
    const clientRecu = listen(client, 'order:status');

    notifyOrderStatus({ ...order, userId: undefined });
    await settle();

    expect(adminRecu).toHaveLength(1);
    expect(clientRecu).toEqual([]);
  });

  it("un jeton client ne donne jamais accès à la salle de l'équipe même avec un id « admin »", async () => {
    const port = await start();
    const faux = await open(port, tokens.client('admin'));
    const fauxRecu = listen(faux, ...ALL_EVENTS);

    notifyOrderCreated(order);
    await settle();

    expect(fauxRecu).toEqual([]);
  });
});

describe('contenu des événements', () => {
  it("ne transporte que des signaux (identifiants, statut), sans donnée personnelle ni montant ni paiement", async () => {
    const port = await start();
    const admin = await open(port, tokens.admin());
    const recu = listen(admin, 'order:created');

    notifyOrderCreated({
      ...order,
      // Ces champs existent sur une vraie commande et ne doivent JAMAIS sortir.
      ...({ client: { nom: 'Awa', telephone: '077000000' }, total: 4000, paiementVerifie: true, items: [{}] } as object),
    });
    await settle();

    expect(Object.keys(recu[0].payload).sort()).toEqual(['at', 'eventId', 'numero', 'orderId', 'statut']);
    expect(JSON.stringify(recu[0].payload)).not.toMatch(/077000000|Awa|4000|paiement/i);
  });

  it("l'identifiant d'événement est stable pour un même changement et différent d'un changement à l'autre", async () => {
    const port = await start();
    const admin = await open(port, tokens.admin());
    const recu = listen(admin, 'order:status');

    notifyOrderStatus(order);
    notifyOrderStatus(order);                                          // même état : même identifiant
    notifyOrderStatus({ ...order, historique: [{}, {}, {}] });         // nouveau changement : autre identifiant
    await settle();

    const ids = recu.map(e => e.payload.eventId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it("émettre sans serveur démarré ne fait rien et ne lève pas d'erreur (routes utilisables seules)", () => {
    expect(() => notifyOrderStatus(order)).not.toThrow();
    expect(() => notifySubscriptionCreated({ _id: 's1', statut: 'x' })).not.toThrow();
  });
});

describe('durée de vie et limites', () => {
  it("coupe la connexion à l'expiration du jeton", async () => {
    const port = await start();
    const court = jwt.sign({ id: 'u1', role: 'client' }, SECRET, { expiresIn: 1 });
    const socket = await open(port, court);

    expect(await waitFor(() => disconnectReasons.has(socket), 4000)).toBe(true);
    expect(disconnectReasons.get(socket)).toBe('io server disconnect');
    // Et le même jeton ne rouvre pas de canal : il est expiré.
    await expect(open(port, court)).rejects.toThrow('unauthorized');
  });

  it('plafonne les connexions simultanées d\'un même compte, sans gêner les autres comptes', async () => {
    const port = await start();
    const token = tokens.client('u1');
    for (let i = 0; i < 10; i++) await open(port, token);

    const onzieme = await open(port, token);
    expect(await waitFor(() => disconnectReasons.get(onzieme) === 'io server disconnect')).toBe(true);

    expect((await open(port, tokens.client('u2'))).connected).toBe(true);
  });

  it('libère le plafond quand un onglet se ferme', async () => {
    const port = await start();
    const token = tokens.client('u1');
    const ouverts: Socket[] = [];
    for (let i = 0; i < 10; i++) ouverts.push(await open(port, token));
    ouverts[0].close();
    await settle(200);

    const nouveau = await open(port, token);
    const recu = listen(nouveau, 'order:status');
    notifyOrderStatus(order);
    expect(await waitFor(() => recu.length === 1)).toBe(true);
  });
});

describe('reconnexion', () => {
  it('le navigateur se reconnecte seul après un redémarrage du serveur, et reçoit de nouveau les événements', async () => {
    const port = await start();
    const socket = await open(port, tokens.client('u1'), { reconnection: true, reconnectionDelay: 50, reconnectionDelayMax: 100 });
    let reconnexions = 0;
    socket.io.on('reconnect', () => { reconnexions++; });
    const recu = listen(socket, 'order:status');

    await stop();                  // redémarrage du serveur
    expect(await waitFor(() => !socket.connected)).toBe(true);
    expect(disconnectReasons.get(socket)).toBe('transport close');   // pas 'io server disconnect' : le client se reconnecte seul

    await start(port);             // même port
    expect(await waitFor(() => socket.connected, 5000)).toBe(true);
    expect(reconnexions).toBe(1);

    notifyOrderStatus(order);
    expect(await waitFor(() => recu.length === 1)).toBe(true);
  });
});
