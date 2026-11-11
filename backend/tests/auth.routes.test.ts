import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

process.env.JWT_SECRET = 'x'.repeat(48);
process.env.ADMIN_EMAIL = 'admin@test.ga';
process.env.FRONTEND_URL = 'https://site.test';

// Redis simulé : mêmes méthodes que celles utilisées par les routes d'authentification.
const store = new Map<string, string>();
let redisDown = false;
const fakeRedis = {
  set: async (key: string, value: string) => { store.set(key, value); return 'OK'; },
  get: async (key: string) => store.get(key) ?? null,
  getdel: async (key: string) => { const v = store.get(key) ?? null; store.delete(key); return v; },
  del: async (...keys: string[]) => { keys.forEach(k => store.delete(k)); return keys.length; },
  incr: async () => 1, expire: async () => 1, ttl: async () => 900,
};

const settings = { adminPasswordHash: 'hash:Secret123!', save: vi.fn(async () => undefined) };
const sendLoginOTPEmail = vi.fn(async (..._args: unknown[]) => undefined);
const sendAdminPasswordResetEmail = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('../config/redis.js', () => ({ getRedis: () => (redisDown ? null : fakeRedis) }));
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../models/HistoryLog.model.js', () => ({ logAction: vi.fn(async () => undefined) }));
vi.mock('../models/Settings.model.js', () => ({
  default: { findOne: () => ({ select: async () => settings }), create: vi.fn() },
}));
vi.mock('bcryptjs', () => ({
  default: { compare: async (p: string, h: string) => h === `hash:${p}`, hash: async (p: string) => `hash:${p}` },
}));
vi.mock('../services/email.service.js', () => ({ sendLoginOTPEmail, sendAdminPasswordResetEmail }));

const { default: authRouter } = await import('../routes/auth.routes.js');

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// Une IP différente par appel : les routes sont limitées en débit par IP.
let ipCounter = 0;
const post = (path: string, body: unknown) =>
  fetch(`${base()}/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.1.0.${++ipCounter}` },
    body: JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

beforeEach(() => {
  store.clear();
  redisDown = false;
  settings.adminPasswordHash = 'hash:Secret123!';
  vi.clearAllMocks();
});
afterAll(() => { server.close(); });

describe('POST /auth/forgot-password', () => {
  it("répond pareil pour une mauvaise adresse, sans envoyer d'email ni stocker de jeton", async () => {
    const res = await post('/forgot-password', { email: 'autre@test.ga' });
    expect(res.status).toBe(200);
    expect((await json(res)).success).toBe(true);
    expect(sendAdminPasswordResetEmail).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('envoie un lien construit sur FRONTEND_URL et ne stocke que le jeton haché', async () => {
    const res = await post('/forgot-password', { email: 'admin@test.ga' });
    expect(res.status).toBe(200);
    expect(sendAdminPasswordResetEmail).toHaveBeenCalledTimes(1);
    const url = String(sendAdminPasswordResetEmail.mock.calls[0][1]);
    const token = url.split('token=')[1];
    expect(url.startsWith('https://site.test/admin/reset-password?token=')).toBe(true);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(store.has(`admin-reset:${sha256(token)}`)).toBe(true);
    expect([...store.keys()].some(k => k.includes(token))).toBe(false);
  });

  it("reste neutre si l'envoi SMTP échoue, et supprime le jeton devenu inutile", async () => {
    sendAdminPasswordResetEmail.mockRejectedValueOnce(Object.assign(new Error('auth'), { code: 'EAUTH' }));
    const res = await post('/forgot-password', { email: 'admin@test.ga' });
    expect(res.status).toBe(200);
    expect(store.size).toBe(0);
  });

  it("refuse (503) en production sans FRONTEND_URL plutôt que de bâtir un lien non fiable", async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FRONTEND_URL', '');
    const res = await post('/forgot-password', { email: 'admin@test.ga' });
    vi.unstubAllEnvs();
    expect(res.status).toBe(503);
    expect(sendAdminPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('renvoie 503 quand Redis est indisponible (fail closed)', async () => {
    redisDown = true;
    const res = await post('/forgot-password', { email: 'admin@test.ga' });
    expect(res.status).toBe(503);
  });
});

describe('POST /auth/reset-password', () => {
  const token = 'a'.repeat(64);
  const seedToken = (t = token) => store.set(`admin-reset:${sha256(t)}`, 'admin@test.ga');

  it('change le mot de passe avec un jeton valide, puis invalide le jeton (usage unique)', async () => {
    seedToken();
    store.set('otp:admin@test.ga', JSON.stringify({ otp: '123456', attempts: 0 }));

    const first = await post('/reset-password', { token, password: 'Nouveau#Mdp1' });
    expect(first.status).toBe(200);
    expect(settings.adminPasswordHash).toBe('hash:Nouveau#Mdp1');
    expect(settings.save).toHaveBeenCalled();
    expect(store.has('otp:admin@test.ga')).toBe(false);

    const second = await post('/reset-password', { token, password: 'Autre#Mdp2' });
    expect(second.status).toBe(400);
    expect(settings.adminPasswordHash).toBe('hash:Nouveau#Mdp1');
  });

  it('refuse un jeton inconnu', async () => {
    const res = await post('/reset-password', { token: 'b'.repeat(64), password: 'Nouveau#Mdp1' });
    expect(res.status).toBe(400);
    expect(settings.adminPasswordHash).toBe('hash:Secret123!');
  });

  it("refuse un mot de passe faible SANS consommer le jeton", async () => {
    seedToken();
    const res = await post('/reset-password', { token, password: 'faible' });
    expect(res.status).toBe(400);
    expect(store.has(`admin-reset:${sha256(token)}`)).toBe(true);
  });

  it("refuse un jeton mal formé", async () => {
    const res = await post('/reset-password', { token: 'pas-un-jeton', password: 'Nouveau#Mdp1' });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/request-otp', () => {
  it("après un changement d'adresse dans le back-office : la nouvelle adresse (même en majuscules) reçoit le code, l'ancienne est refusée", async () => {
    Object.assign(settings, { adminEmail: 'nouveau@test.ga' });
    try {
      const ancienne = await post('/request-otp', { email: 'admin@test.ga', password: 'Secret123!' });
      expect(ancienne.status).toBe(401);
      expect(sendLoginOTPEmail).not.toHaveBeenCalled();

      const nouvelle = await post('/request-otp', { email: 'Nouveau@Test.ga', password: 'Secret123!' });
      expect(nouvelle.status).toBe(200);
      expect(sendLoginOTPEmail.mock.calls[0][0]).toBe('nouveau@test.ga');
    } finally {
      Object.assign(settings, { adminEmail: undefined });
    }
  });

  it('refuse un mauvais mot de passe (401) sans envoyer de code', async () => {
    const res = await post('/request-otp', { email: 'admin@test.ga', password: 'mauvais' });
    expect(res.status).toBe(401);
    expect(sendLoginOTPEmail).not.toHaveBeenCalled();
  });

  it("refuse un mot de passe CORRECT mais qui ne respecte pas la règle (403) : aucun code n'est envoyé, et on est dirigé vers « Mot de passe oublié »", async () => {
    settings.adminPasswordHash = 'hash:faible123'; // pas de majuscule
    const res = await post('/request-otp', { email: 'admin@test.ga', password: 'faible123' });
    const corps = await json(res);
    expect(res.status).toBe(403);
    expect(corps.passwordWeak).toBe(true);
    expect(String(corps.message)).toMatch(/majuscule/);
    expect(String(corps.message)).toMatch(/Mot de passe oublié/);
    expect(sendLoginOTPEmail).not.toHaveBeenCalled();
    expect([...store.keys()].some(k => k.startsWith('otp:'))).toBe(false);
  });

  it("un mot de passe FAUX et faible reste une simple erreur d'identifiants (401), sans indiquer que la règle est en cause", async () => {
    const res = await post('/request-otp', { email: 'admin@test.ga', password: 'faible123' });
    const corps = await json(res);
    expect(res.status).toBe(401);
    expect(corps.passwordWeak).toBeUndefined();
  });

  it("accepte un mot de passe conforme SANS caractère spécial (nouvelle règle)", async () => {
    settings.adminPasswordHash = 'hash:Moussavou1';
    const res = await post('/request-otp', { email: 'admin@test.ga', password: 'Moussavou1' });
    expect(res.status).toBe(200);
    expect(sendLoginOTPEmail).toHaveBeenCalledTimes(1);
  });

  it('envoie un code à 6 chiffres et le stocke', async () => {
    const res = await post('/request-otp', { email: 'admin@test.ga', password: 'Secret123!' });
    expect(res.status).toBe(200);
    expect(sendLoginOTPEmail).toHaveBeenCalledTimes(1);
    // Le code envoyé par email est bien celui qui sera comparé à la saisie.
    const emailedOtp = String(sendLoginOTPEmail.mock.calls[0][1]);
    expect(emailedOtp).toMatch(/^\d{6}$/);
    expect(JSON.parse(store.get('otp:admin@test.ga') as string).otp).toBe(emailedOtp);
  });

  it("répond 502 et supprime le code si l'email ne part pas (code inutilisable)", async () => {
    sendLoginOTPEmail.mockRejectedValueOnce(Object.assign(new Error('smtp'), { code: 'ETIMEDOUT' }));
    const res = await post('/request-otp', { email: 'admin@test.ga', password: 'Secret123!' });
    expect(res.status).toBe(502);
    expect(store.has('otp:admin@test.ga')).toBe(false);
  });
});

describe('POST /auth/verify-otp', () => {
  it('refuse un mauvais code (401) puis accepte le bon et délivre un jeton', async () => {
    store.set('otp:admin@test.ga', JSON.stringify({ otp: '123456', attempts: 0 }));

    const wrong = await post('/verify-otp', { email: 'admin@test.ga', otp: '000000' });
    expect(wrong.status).toBe(401);

    const ok = await post('/verify-otp', { email: 'admin@test.ga', otp: '123456' });
    expect(ok.status).toBe(200);
    expect(typeof (await json(ok)).token).toBe('string');
    expect(store.has('otp:admin@test.ga')).toBe(false);
  });

  it("refuse quand aucun code n'est en attente", async () => {
    const res = await post('/verify-otp', { email: 'admin@test.ga', otp: '123456' });
    expect(res.status).toBe(400);
  });
});
