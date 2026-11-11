// Abonnements push contre une VRAIE base MongoDB (modèle, index et requêtes réels ; seul l'envoi web-push est simulé).
// Ignoré tant que MONGO_TEST_URI n'est pas défini (voir db.int.test.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

process.env.VAPID_PUBLIC_KEY = 'pub';
process.env.VAPID_PRIVATE_KEY = 'priv';

const web = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn(async (_s: unknown, _d: unknown, _o: unknown) => undefined) }));
vi.mock('web-push', () => ({ default: web }));
vi.mock('../../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const uri = process.env.MONGO_TEST_URI;
const { default: PushSubscription } = await import('../../models/PushSubscription.model.js');
const push = await import('../../services/push.service.js');

const USER = new mongoose.Types.ObjectId();
const OTHER = new mongoose.Types.ObjectId();
const keys = { p256dh: 'BKey', auth: 'aKey' };
const payload = { title: 'T', body: 'B', tag: 'order-1' };
const httpError = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

describe.skipIf(!uri)('intégration MongoDB — abonnements push', () => {
  beforeAll(async () => {
    await mongoose.connect(uri as string, { dbName: `ld_push_${Date.now()}` });
    await PushSubscription.init();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await PushSubscription.deleteMany({});
    web.sendNotification.mockReset();
    web.sendNotification.mockImplementation(async () => undefined);
  });

  const endpointsSent = () => web.sendNotification.mock.calls.map(c => (c[0] as { endpoint: string }).endpoint).sort();

  it('un client reçoit sur tous SES appareils, jamais sur ceux d\'un autre compte ni de l\'équipe', async () => {
    await PushSubscription.create([
      { endpoint: 'https://p.example/mine-1', keys, userId: USER, audience: 'client' },
      { endpoint: 'https://p.example/mine-2', keys, userId: USER, audience: 'client' },
      { endpoint: 'https://p.example/other', keys, userId: OTHER, audience: 'client' },
      { endpoint: 'https://p.example/staff', keys, audience: 'admin' },
    ]);
    expect(await push.sendPushToUser(String(USER), payload)).toMatchObject({ sent: 2, failed: 0 });
    expect(endpointsSent()).toEqual(['https://p.example/mine-1', 'https://p.example/mine-2']);
  });

  it('les abonnements enregistrés avant le champ « audience » restent des abonnements clients', async () => {
    await PushSubscription.collection.insertOne({ endpoint: 'https://p.example/legacy', keys, userId: USER });
    expect(await push.sendPushToUser(String(USER), payload)).toMatchObject({ sent: 1 });
    expect(await push.sendPushToAdmins(payload)).toMatchObject({ sent: 0 });
  });

  it('l\'équipe ne reçoit que sur ses appareils ; la diffusion aux clients ne la touche pas', async () => {
    await PushSubscription.create([
      { endpoint: 'https://p.example/staff-1', keys, audience: 'admin' },
      { endpoint: 'https://p.example/client-1', keys, userId: USER, audience: 'client' },
    ]);
    await push.sendPushToAdmins(payload);
    expect(endpointsSent()).toEqual(['https://p.example/staff-1']);
    web.sendNotification.mockClear();
    await push.sendPushBroadcast(payload);
    expect(endpointsSent()).toEqual(['https://p.example/client-1']);
  });

  it('un endpoint = un seul abonnement (index unique) : impossible d\'en créer deux', async () => {
    await PushSubscription.create({ endpoint: 'https://p.example/x', keys, userId: USER });
    await expect(PushSubscription.create({ endpoint: 'https://p.example/x', keys, userId: OTHER })).rejects.toMatchObject({ code: 11000 });
  });

  it('abonnement expiré (410) : supprimé de la base ; panne passagère : conservé avec échecs comptés ; succès : compteur remis à zéro', async () => {
    await PushSubscription.create([
      { endpoint: 'https://p.example/gone', keys, userId: USER },
      { endpoint: 'https://p.example/down', keys, userId: USER },
      { endpoint: 'https://p.example/ok', keys, userId: USER, failures: 3 },
    ]);
    web.sendNotification.mockImplementation(async (sub: unknown) => {
      const endpoint = (sub as { endpoint: string }).endpoint;
      if (endpoint.endsWith('gone')) throw httpError(410);
      if (endpoint.endsWith('down')) throw httpError(503);
    });
    expect(await push.sendPushToUser(String(USER), payload)).toEqual({ sent: 1, failed: 2, removed: 1 });

    expect(await PushSubscription.findOne({ endpoint: 'https://p.example/gone' })).toBeNull();
    expect(await PushSubscription.findOne({ endpoint: 'https://p.example/down' })).toMatchObject({ failures: 1 });
    expect(await PushSubscription.findOne({ endpoint: 'https://p.example/ok' })).toMatchObject({ failures: 0 });
  });

  it('échecs répétés : retiré au bout de MAX_CONSECUTIVE_FAILURES envois ratés', async () => {
    await PushSubscription.create({ endpoint: 'https://p.example/down', keys, userId: USER });
    web.sendNotification.mockRejectedValue(httpError(500));
    for (let i = 0; i < push.MAX_CONSECUTIVE_FAILURES - 1; i++) {
      await push.sendPushToUser(String(USER), payload);
      expect(await PushSubscription.countDocuments({})).toBe(1);
    }
    await push.sendPushToUser(String(USER), payload);
    expect(await PushSubscription.countDocuments({})).toBe(0);
  });

  it('un envoi réussi entre deux pannes remet le compteur à zéro : l\'abonnement n\'est pas retiré à tort', async () => {
    await PushSubscription.create({ endpoint: 'https://p.example/flaky', keys, userId: USER });
    for (let round = 0; round < 3; round++) {
      web.sendNotification.mockRejectedValueOnce(httpError(502)).mockRejectedValueOnce(httpError(502));
      await push.sendPushToUser(String(USER), payload);
      await push.sendPushToUser(String(USER), payload);
      web.sendNotification.mockImplementation(async () => undefined);
      await push.sendPushToUser(String(USER), payload);
    }
    expect(await PushSubscription.countDocuments({})).toBe(1);
    expect(await PushSubscription.findOne({})).toMatchObject({ failures: 0 });
  });
});
