import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.VAPID_PUBLIC_KEY = 'pub';
process.env.VAPID_PRIVATE_KEY = 'priv';

const web = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => undefined) }));
const db = vi.hoisted(() => ({
  subs: [] as Record<string, unknown>[],
  find: vi.fn(),
  updateMany: vi.fn(async () => ({})),
  deleteMany: vi.fn(async () => ({})),
}));

vi.mock('web-push', () => ({ default: web }));
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../models/PushSubscription.model.js', () => ({
  default: {
    find: (filter: unknown) => ({ lean: async () => { db.find(filter); return db.subs; } }),
    updateMany: db.updateMany,
    deleteMany: db.deleteMany,
  },
}));

const push = await import('../services/push.service.js');

const sub = (id: string, failures = 0) => ({ _id: id, endpoint: `https://push.example/${id}`, keys: { p256dh: 'k', auth: 'a' }, failures });
const httpError = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
const payload = { title: 'T', body: 'B', url: '/mon-compte', tag: 'order-1' };

beforeEach(() => {
  vi.clearAllMocks();
  db.subs = [];
  web.sendNotification.mockImplementation(async () => undefined);
});

describe('service push — ciblage', () => {
  it('un client : ses appareils de client uniquement (les anciens abonnements sans champ « audience » en font partie)', async () => {
    db.subs = [sub('a')];
    await push.sendPushToUser('user-1', payload);
    expect(db.find).toHaveBeenCalledWith({ userId: 'user-1', audience: { $ne: 'admin' } });
  });

  it("l'équipe : appareils administrateurs uniquement", async () => {
    db.subs = [sub('a')];
    await push.sendPushToAdmins(payload);
    expect(db.find).toHaveBeenCalledWith({ audience: 'admin' });
  });

  it("la diffusion à tous ne part jamais vers l'équipe, même si le filtre demande l'inverse", async () => {
    db.subs = [sub('a')];
    await push.sendPushBroadcast(payload, { audience: 'admin' });
    expect(db.find).toHaveBeenCalledWith({ audience: { $ne: 'admin' } });
  });

  it('aucun abonné : rien à envoyer, aucun appel au service push', async () => {
    expect(await push.sendPushToUser('user-1', payload)).toEqual({ sent: 0, failed: 0, removed: 0 });
    expect(web.sendNotification).not.toHaveBeenCalled();
  });
});

describe('service push — envoi', () => {
  it('envoie le contenu, avec durée de vie, urgence et sujet dérivé du tag (anti-doublon côté service push)', async () => {
    db.subs = [sub('a')];
    const result = await push.sendPushToUser('user-1', payload);
    expect(result).toEqual({ sent: 1, failed: 0, removed: 0 });
    const [target, data, options] = web.sendNotification.mock.calls[0] as unknown as [{ endpoint: string }, string, { TTL: number; urgency: string; topic: string }];
    expect(target.endpoint).toBe('https://push.example/a');
    expect(JSON.parse(data)).toMatchObject({ title: 'T', url: '/mon-compte', tag: 'order-1' });
    expect(options).toMatchObject({ TTL: 21600, urgency: 'high' });
    expect(options.topic).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
  });

  it('même tag → même sujet, tag différent → sujet différent', async () => {
    db.subs = [sub('a')];
    await push.sendPushToUser('u', { ...payload, tag: 'order-1' });
    await push.sendPushToUser('u', { ...payload, tag: 'order-1' });
    await push.sendPushToUser('u', { ...payload, tag: 'order-2' });
    const topics = web.sendNotification.mock.calls.map(c => (c as unknown as [unknown, unknown, { topic: string }])[2].topic);
    expect(topics[0]).toBe(topics[1]);
    expect(topics[2]).not.toBe(topics[0]);
  });

  it('succès : le compteur d\'échecs repart de zéro', async () => {
    db.subs = [sub('a', 3)];
    await push.sendPushToUser('u', payload);
    expect(db.updateMany).toHaveBeenCalledWith({ _id: { $in: ['a'] } }, { $set: expect.objectContaining({ failures: 0 }) });
  });

  it.each([404, 410])('abonnement expiré (%i) : supprimé tout de suite', async (status) => {
    db.subs = [sub('a')];
    web.sendNotification.mockRejectedValueOnce(httpError(status));
    const result = await push.sendPushToUser('u', payload);
    expect(result).toEqual({ sent: 0, failed: 1, removed: 1 });
    expect(db.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['a'] } });
  });

  it.each([429, 500, 502, 503, undefined])('panne passagère (%s) : abonnement conservé, échec compté', async (status) => {
    db.subs = [sub('a', 1)];
    web.sendNotification.mockRejectedValueOnce(status ? httpError(status) : new Error('réseau coupé'));
    const result = await push.sendPushToUser('u', payload);
    expect(result).toEqual({ sent: 0, failed: 1, removed: 0 });
    expect(db.deleteMany).not.toHaveBeenCalled();
    expect(db.updateMany).toHaveBeenCalledWith({ _id: { $in: ['a'] } }, { $inc: { failures: 1 }, $set: expect.objectContaining({ lastFailureAt: expect.any(Date) }) });
  });

  it('trop d\'échecs consécutifs : l\'abonnement est retiré', async () => {
    db.subs = [sub('a', push.MAX_CONSECUTIVE_FAILURES - 1)];
    web.sendNotification.mockRejectedValueOnce(httpError(500));
    const result = await push.sendPushToUser('u', payload);
    expect(result.removed).toBe(1);
    expect(db.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['a'] } });
  });

  it('mélange : un appareil joint, un expiré, un en panne — chacun traité séparément', async () => {
    db.subs = [sub('ok'), sub('gone'), sub('down')];
    web.sendNotification.mockImplementation(async (target: unknown) => {
      const endpoint = (target as { endpoint: string }).endpoint;
      if (endpoint.endsWith('gone')) throw httpError(410);
      if (endpoint.endsWith('down')) throw httpError(503);
    });
    expect(await push.sendPushToUser('u', payload)).toEqual({ sent: 1, failed: 2, removed: 1 });
    expect(db.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['gone'] } });
  });

  it('une écriture en base en échec ne fait pas échouer l\'envoi', async () => {
    db.subs = [sub('a')];
    db.updateMany.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(push.sendPushToUser('u', payload)).resolves.toMatchObject({ sent: 1 });
  });
});

describe('service push — non configuré', () => {
  it('sans clés VAPID : aucun envoi, aucune erreur', async () => {
    vi.resetModules();
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const fresh = await import('../services/push.service.js');
    expect(fresh.isPushConfigured()).toBe(false);
    expect(await fresh.sendPushToAdmins(payload)).toEqual({ sent: 0, failed: 0, removed: 0 });
    expect(web.sendNotification).not.toHaveBeenCalled();
  });
});
