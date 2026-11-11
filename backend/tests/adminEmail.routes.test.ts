import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'x'.repeat(48);
process.env.ADMIN_EMAIL = 'admin@test.ga';
process.env.ADMIN_PASSWORD = 'Secret123!';

const store = new Map<string, string>();
let redisDown = false;
const fakeRedis = {
  set: async (key: string, value: string) => { store.set(key, value); return 'OK'; },
  get: async (key: string) => store.get(key) ?? null,
  getdel: async (key: string) => { const v = store.get(key) ?? null; store.delete(key); return v; },
  del: async (...keys: string[]) => { keys.forEach(k => store.delete(k)); return keys.length; },
  incr: async () => 1, expire: async () => 1, ttl: async () => 600,
};

const settings = { adminEmail: '', adminPasswordHash: undefined as string | undefined, save: vi.fn(async () => undefined) };
const sendAdminEmailChangeCode = vi.fn(async (..._args: unknown[]) => undefined);
const sendAdminEmailChangedNotice = vi.fn(async (..._args: unknown[]) => undefined);
const logAction = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('../config/redis.js', () => ({ getRedis: () => (redisDown ? null : fakeRedis) }));
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../models/HistoryLog.model.js', () => ({ logAction }));
vi.mock('../models/Settings.model.js', () => {
  const findOne = () => Object.assign(Promise.resolve(settings), { select: async () => settings });
  return { default: findOneModel(findOne), ZONES_DEFAULT: [], SLOTS_DEFAULT: [] };
  function findOneModel(fn: typeof findOne) { return { findOne: fn, create: vi.fn() }; }
});
vi.mock('bcryptjs', () => ({
  default: { compare: async (p: string, h: string) => h === `hash:${p}`, hash: async (p: string) => `hash:${p}` },
}));
vi.mock('../services/email.service.js', () => ({
  sendLoginOTPEmail: vi.fn(), sendAdminPasswordResetEmail: vi.fn(), sendAdminEmailChangeCode, sendAdminEmailChangedNotice,
}));

const { default: settingsRouter } = await import('../routes/settings.routes.js');

const app = express();
app.use(express.json());
app.use('/settings', settingsRouter);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/settings`;
const token = jwt.sign({ id: 'a1', email: 'admin@test.ga', name: 'Administrateur', role: 'admin', jti: 'j1' }, process.env.JWT_SECRET!);

let ip = 0;
const call = (method: string, path: string, body?: unknown) =>
  fetch(`${base()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Forwarded-For': `10.2.0.${++ip}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as { data: { email: string } };
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const pending = () => JSON.parse(store.get('admin-email-change') ?? 'null') as { email: string; codeHash: string; attempts: number } | null;

const ask = (nouvelEmail = 'nouveau@test.ga', motDePasse = 'Secret123!') => call('POST', '/email/request', { nouvelEmail, motDePasse });
const sentCode = () => String(sendAdminEmailChangeCode.mock.calls.at(-1)?.[1]);

beforeEach(() => {
  store.clear();
  redisDown = false;
  settings.adminEmail = '';
  settings.adminPasswordHash = undefined;
  vi.clearAllMocks();
});
afterAll(() => { server.close(); });

describe('GET /settings/email', () => {
  it('renvoie l\'adresse de ADMIN_EMAIL tant qu\'aucune n\'a été choisie', async () => {
    expect((await json(await call('GET', '/email'))).data.email).toBe('admin@test.ga');
  });

  it('renvoie l\'adresse choisie dans le back-office', async () => {
    settings.adminEmail = 'choisie@test.ga';
    expect((await json(await call('GET', '/email'))).data.email).toBe('choisie@test.ga');
  });

  it('refuse sans jeton administrateur', async () => {
    expect((await fetch(`${base()}/email`)).status).toBe(401);
  });
});

describe('POST /settings/email/request', () => {
  it('envoie un code à la nouvelle adresse et ne garde que son empreinte', async () => {
    const res = await ask('  Nouveau@Test.ga ');
    expect(res.status).toBe(200);
    expect(sendAdminEmailChangeCode).toHaveBeenCalledWith('nouveau@test.ga', expect.stringMatching(/^\d{6}$/));
    const stored = pending();
    expect(stored?.email).toBe('nouveau@test.ga');
    expect(stored?.codeHash).toBe(sha256(sentCode()));
    expect(JSON.stringify(stored)).not.toContain(sentCode());
  });

  it('refuse un mot de passe incorrect, sans rien envoyer', async () => {
    const res = await ask('nouveau@test.ga', 'mauvais');
    expect(res.status).toBe(403);
    expect(sendAdminEmailChangeCode).not.toHaveBeenCalled();
    expect(pending()).toBeNull();
  });

  it('vérifie le mot de passe enregistré (hash) une fois changé', async () => {
    settings.adminPasswordHash = 'hash:Autre#Passe9';
    expect((await ask('nouveau@test.ga', 'Secret123!')).status).toBe(403);
    expect((await ask('nouveau@test.ga', 'Autre#Passe9')).status).toBe(200);
  });

  it('refuse une adresse invalide ou identique à l\'actuelle', async () => {
    expect((await ask('pas-une-adresse')).status).toBe(400);
    expect((await ask('ADMIN@test.ga')).status).toBe(400);
    expect(sendAdminEmailChangeCode).not.toHaveBeenCalled();
  });

  it('annule la demande si le code n\'a pas pu partir', async () => {
    sendAdminEmailChangeCode.mockRejectedValueOnce(Object.assign(new Error('smtp'), { code: 'ETIMEDOUT' }));
    const res = await ask();
    expect(res.status).toBe(502);
    expect(pending()).toBeNull();
  });

  it('refuse quand Redis est indisponible (fail closed)', async () => {
    redisDown = true;
    expect((await ask()).status).toBe(503);
    expect(sendAdminEmailChangeCode).not.toHaveBeenCalled();
  });
});

describe('POST /settings/email/confirm', () => {
  const confirm = (code: string) => call('POST', '/email/confirm', { code });

  it('change l\'adresse avec le bon code, prévient l\'ancienne adresse et invalide son code de connexion', async () => {
    await ask();
    store.set('otp:admin@test.ga', '{"otp":"123456","attempts":0}');
    const res = await confirm(sentCode());
    expect(res.status).toBe(200);
    expect((await json(res)).data.email).toBe('nouveau@test.ga');
    expect(settings.adminEmail).toBe('nouveau@test.ga');
    expect(settings.save).toHaveBeenCalled();
    expect(pending()).toBeNull();
    expect(store.has('otp:admin@test.ga')).toBe(false);
    expect(sendAdminEmailChangedNotice).toHaveBeenCalledWith('admin@test.ga', 'nouveau@test.ga');
    expect(logAction).toHaveBeenCalled();
  });

  it('refuse un mauvais code, compte les essais et ne change rien', async () => {
    await ask();
    const res = await confirm('000000' === sentCode() ? '111111' : '000000');
    expect(res.status).toBe(400);
    expect(settings.adminEmail).toBe('');
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('annule la demande après 5 essais ratés, même avec le bon code ensuite', async () => {
    await ask();
    const good = sentCode();
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) { store.set('admin-email-change', JSON.stringify({ ...pending(), attempts: i })); await confirm(bad); }
    store.set('admin-email-change', JSON.stringify({ ...pending(), attempts: 5 }));
    const res = await confirm(good);
    expect(res.status).toBe(400);
    expect(settings.adminEmail).toBe('');
    expect(pending()).toBeNull();
  });

  it('refuse quand aucune demande n\'est en cours', async () => {
    expect((await confirm('123456')).status).toBe(400);
  });

  it('un code déjà utilisé ne sert pas deux fois', async () => {
    await ask();
    const code = sentCode();
    expect((await confirm(code)).status).toBe(200);
    expect((await confirm(code)).status).toBe(400);
  });

  it('refuse un code qui n\'a pas 6 chiffres', async () => {
    expect((await confirm('12ab')).status).toBe(400);
  });
});

describe('PATCH /settings', () => {
  it('ne laisse pas modifier l\'adresse de connexion par le chemin général', async () => {
    const res = await call('PATCH', '/', { nom: 'Nouveau nom', adminEmail: 'pirate@test.ga' });
    expect(res.status).toBe(200);
    expect(settings.adminEmail).toBe('');
  });
});
