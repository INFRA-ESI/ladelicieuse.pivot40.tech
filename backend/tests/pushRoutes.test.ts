import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'p'.repeat(48);
const SECRET = process.env.JWT_SECRET;

const db = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(async () => ({})),
  deleteOne: vi.fn(async () => ({})),
  countDocuments: vi.fn(async (filter?: { audience?: unknown }) => (filter?.audience === 'admin' ? 2 : 5)),
}));

// Même contrôle de rôle que le vrai verifyJWT (sans Redis) : seul un jeton « admin » passe.
vi.mock('../routes/auth.routes.js', () => ({
  verifyJWT: (req: { headers: { authorization?: string } }, res: { status: (c: number) => { json: (b: unknown) => void } }, next: () => void) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ success: false }); return; }
    try {
      const decoded = jwt.verify(token, SECRET) as { role?: string };
      if (decoded.role !== 'admin') { res.status(403).json({ success: false }); return; }
      next();
    } catch { res.status(401).json({ success: false }); }
  },
}));
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../models/PushSubscription.model.js', () => ({ default: db }));
vi.mock('../models/User.model.js', () => ({ default: {} }));
vi.mock('../models/FideliteTransaction.model.js', () => ({ default: { countDocuments: async () => 0 } }));
vi.mock('../models/HistoryLog.model.js', () => ({ logAction: vi.fn(async () => undefined) }));
vi.mock('../services/whatsapp.service.js', () => ({ sendWhatsAppNotification: vi.fn(), sendWhatsAppBroadcast: vi.fn() }));
vi.mock('../services/email.service.js', () => ({ sendBroadcastEmail: vi.fn() }));
vi.mock('../services/push.service.js', () => ({ sendPushBroadcast: vi.fn(async () => ({ sent: 0, failed: 0, removed: 0 })) }));

const { default: router } = await import('../routes/notifications.routes.js');

const app = express();
app.use(express.json());
app.use('/notifications', router);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => { server.close(); });

let ip = 0;
const call = (method: string, path: string, body?: unknown, token?: string) =>
  fetch(`${base()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.0.${++ip}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const sign = (payload: Record<string, unknown>, secret = SECRET) => jwt.sign(payload, secret, { expiresIn: '1h' });
const clientToken = (id = 'client-1') => sign({ id, email: 'c@example.com', role: 'client' });
const adminToken = () => sign({ id: 'dev-admin', email: 'admin@example.com', role: 'admin' });

const subscription = (over: Record<string, unknown> = {}) => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
  ...over,
});

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /push/subscribe (client)', () => {
  it('sans session : 401, rien n\'est enregistré', async () => {
    expect((await call('POST', '/notifications/push/subscribe', { subscription: subscription() })).status).toBe(401);
    expect(db.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('jeton falsifié ou signé avec une autre clé : 401', async () => {
    expect((await call('POST', '/notifications/push/subscribe', { subscription: subscription() }, sign({ id: 'x', role: 'client' }, 'z'.repeat(48)))).status).toBe(401);
    expect(db.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('un administrateur ne peut pas s\'inscrire comme client : 403', async () => {
    expect((await call('POST', '/notifications/push/subscribe', { subscription: subscription() }, adminToken())).status).toBe(403);
    expect(db.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('l\'identité vient du jeton, jamais du corps : un userId fourni par le navigateur est ignoré', async () => {
    const res = await call('POST', '/notifications/push/subscribe', { subscription: subscription(), userId: 'AUTRE-COMPTE', audience: 'admin' }, clientToken('client-1'));
    expect(res.status).toBe(200);
    const [filter, update] = db.findOneAndUpdate.mock.calls[0] as unknown as [{ endpoint: string }, { $set: Record<string, unknown> }];
    expect(filter).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' });
    expect(update.$set).toMatchObject({ userId: 'client-1', audience: 'client', failures: 0 });
    expect(JSON.stringify(update)).not.toContain('AUTRE-COMPTE');
  });

  it('réabonnement du même appareil : mise à jour par endpoint (upsert), pas de doublon', async () => {
    await call('POST', '/notifications/push/subscribe', { subscription: subscription() }, clientToken());
    await call('POST', '/notifications/push/subscribe', { subscription: subscription() }, clientToken());
    const calls = db.findOneAndUpdate.mock.calls as unknown as [unknown, unknown, { upsert: boolean }][];
    expect(calls).toHaveLength(2);
    expect(calls.every(c => c[2].upsert === true)).toBe(true);
  });

  it.each([
    ['sans abonnement', {}],
    ['endpoint non HTTPS', { subscription: subscription({ endpoint: 'http://push.example/x' }) }],
    ['endpoint illisible', { subscription: subscription({ endpoint: 'pas une url' }) }],
    ['endpoint démesuré', { subscription: subscription({ endpoint: 'https://push.example/' + 'a'.repeat(3000) }) }],
    ['clés manquantes', { subscription: { endpoint: 'https://push.example/x' } }],
    ['clé avec caractères interdits', { subscription: subscription({ keys: { p256dh: '<script>', auth: 'abc' } }) }],
    ['clés qui ne sont pas du texte', { subscription: subscription({ keys: { p256dh: 1, auth: 2 } }) }],
    ['clé démesurée', { subscription: subscription({ keys: { p256dh: 'a'.repeat(500), auth: 'abc' } }) }],
  ])('abonnement invalide (%s) : 400', async (_label, body) => {
    expect((await call('POST', '/notifications/push/subscribe', body, clientToken())).status).toBe(400);
    expect(db.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('base en panne : 500 propre, sans détail technique', async () => {
    db.findOneAndUpdate.mockRejectedValueOnce(new Error('connexion refusée 10.0.0.5'));
    const res = await call('POST', '/notifications/push/subscribe', { subscription: subscription() }, clientToken());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.5');
  });
});

describe('POST /push/admin/subscribe (équipe)', () => {
  it('sans session : 401', async () => {
    expect((await call('POST', '/notifications/push/admin/subscribe', { subscription: subscription() })).status).toBe(401);
  });

  it('un client ne peut pas recevoir les alertes de l\'équipe : 403', async () => {
    expect((await call('POST', '/notifications/push/admin/subscribe', { subscription: subscription() }, clientToken())).status).toBe(403);
    expect(db.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('administrateur : audience « admin », aucun compte client rattaché', async () => {
    const res = await call('POST', '/notifications/push/admin/subscribe', { subscription: subscription(), userId: 'client-1' }, adminToken());
    expect(res.status).toBe(200);
    const [, update] = db.findOneAndUpdate.mock.calls[0] as unknown as [unknown, { $set: Record<string, unknown>; $unset?: Record<string, unknown> }];
    expect(update.$set).toMatchObject({ audience: 'admin' });
    expect(update.$set.userId).toBeUndefined();
    expect(update.$unset).toEqual({ userId: '' });
  });
});

describe('désabonnement', () => {
  it('un client ne supprime que SES abonnements', async () => {
    const res = await call('DELETE', '/notifications/push/unsubscribe', { endpoint: 'https://push.example/x' }, clientToken('client-1'));
    expect(res.status).toBe(200);
    expect(db.deleteOne).toHaveBeenCalledWith({ endpoint: 'https://push.example/x', audience: { $ne: 'admin' }, userId: 'client-1' });
  });

  it('sans session : 401 ; administrateur sur la route client : 403', async () => {
    expect((await call('DELETE', '/notifications/push/unsubscribe', { endpoint: 'x' })).status).toBe(401);
    expect((await call('DELETE', '/notifications/push/unsubscribe', { endpoint: 'x' }, adminToken())).status).toBe(403);
    expect(db.deleteOne).not.toHaveBeenCalled();
  });

  it('administrateur : supprime un appareil de l\'équipe, un client n\'y a pas accès', async () => {
    expect((await call('DELETE', '/notifications/push/admin/unsubscribe', { endpoint: 'x' }, clientToken())).status).toBe(403);
    expect((await call('DELETE', '/notifications/push/admin/unsubscribe', { endpoint: 'https://push.example/x' }, adminToken())).status).toBe(200);
    expect(db.deleteOne).toHaveBeenCalledTimes(1);
    expect(db.deleteOne).toHaveBeenCalledWith({ endpoint: 'https://push.example/x', audience: 'admin' });
  });

  it('endpoint absent ou pas du texte : 400', async () => {
    expect((await call('DELETE', '/notifications/push/unsubscribe', {}, clientToken())).status).toBe(400);
    expect((await call('DELETE', '/notifications/push/unsubscribe', { endpoint: { $ne: null } }, clientToken())).status).toBe(400);
    expect(db.deleteOne).not.toHaveBeenCalled();
  });
});

describe('GET /stats (administrateur)', () => {
  it('sépare les abonnés clients des appareils de l\'équipe', async () => {
    const res = await call('GET', '/notifications/stats', undefined, adminToken());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ pushSubscriptions: 5, staffDevices: 2 });
  });

  it('refusé à un client', async () => {
    expect((await call('GET', '/notifications/stats', undefined, clientToken())).status).toBe(403);
  });
});
