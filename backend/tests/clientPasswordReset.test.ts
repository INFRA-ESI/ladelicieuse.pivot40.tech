import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

process.env.JWT_SECRET = 'x'.repeat(48);

type FakeUser = {
  email: string; nom: string; emailVerified: boolean;
  emailVerificationToken?: string; passwordResetToken?: string; passwordResetExpires?: Date; password?: string;
  save: ReturnType<typeof vi.fn>;
};
const makeUser = (over: Partial<FakeUser> = {}): FakeUser =>
  ({ email: 'cliente@test.ga', nom: 'Awa', emailVerified: false, save: vi.fn(async () => undefined), ...over });

let current: FakeUser | null = null;
const findOne = vi.fn(async (filter: Record<string, unknown>) => {
  if (!current) return null;
  if ('passwordResetToken' in filter) return filter.passwordResetToken === current.passwordResetToken ? current : null;
  return filter.email === current.email ? current : null;
});
const sendPasswordResetEmail = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('../models/User.model.js', () => ({ default: { findOne: (f: Record<string, unknown>) => findOne(f) } }));
vi.mock('../models/Order.model.js', () => ({ default: {} }));
vi.mock('../services/email.service.js', () => ({
  sendVerificationEmail: vi.fn(), sendWelcomeEmail: vi.fn(), sendPasswordResetEmail,
}));
vi.mock('../services/fidelite.service.js', () => ({ getHistoriqueFidelite: vi.fn(), rachatPoints: vi.fn(), calculerPointsGagnes: vi.fn() }));
vi.mock('../services/push.service.js', () => ({ sendPushToUser: vi.fn() }));
vi.mock('../middleware/rateLimiter.js', () => ({
  rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  memoryRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { default: clientRouter } = await import('../routes/client.routes.js');

const app = express();
app.use(express.json());
app.use('/client', clientRouter);
const server = app.listen(0);
const post = (path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/client${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

beforeEach(() => { current = null; vi.clearAllMocks(); });
afterAll(() => { server.close(); });

describe('POST /client/forgot-password', () => {
  it("répond comme si tout allait bien pour une adresse inconnue, sans envoyer d'e-mail", async () => {
    const res = await post('/forgot-password', { email: 'inconnue@test.ga' });
    expect(res.status).toBe(200);
    expect((await json(res)).success).toBe(true);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("envoie le lien même si le compte n'est pas encore vérifié, valable 1 heure", async () => {
    current = makeUser({ emailVerified: false });
    const before = Date.now();
    const res = await post('/forgot-password', { email: 'Cliente@Test.ga ' });
    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [to, , token] = sendPasswordResetEmail.mock.calls[0] as [string, string, string];
    expect(to).toBe('cliente@test.ga');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(current.passwordResetToken).toBe(token);
    const ttl = (current.passwordResetExpires as Date).getTime() - before;
    expect(ttl).toBeGreaterThan(59 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(61 * 60 * 1000);
  });

  it("ne révèle pas l'existence du compte quand l'envoi d'e-mail échoue", async () => {
    current = makeUser();
    sendPasswordResetEmail.mockRejectedValueOnce(new Error('SMTP indisponible'));
    const res = await post('/forgot-password', { email: 'cliente@test.ga' });
    expect(res.status).toBe(200);
    expect((await json(res)).success).toBe(true);
  });
});

describe('POST /client/reset-password', () => {
  const token = 'a'.repeat(64);

  it("enregistre le mot de passe, vérifie l'adresse et invalide le lien", async () => {
    current = makeUser({ passwordResetToken: token, passwordResetExpires: new Date(Date.now() + 60_000), emailVerificationToken: 'old' });
    const res = await post('/reset-password', { token, password: 'Nouveau#Mdp1' });
    expect(res.status).toBe(200);
    expect(current.password).toBe('Nouveau#Mdp1');
    expect(current.emailVerified).toBe(true);
    expect(current.passwordResetToken).toBeUndefined();
    expect(current.passwordResetExpires).toBeUndefined();
    expect(current.emailVerificationToken).toBeUndefined();
    expect(current.save).toHaveBeenCalled();
  });

  it('refuse un lien inconnu ou expiré avec un message qui invite à en redemander un', async () => {
    current = makeUser({ passwordResetToken: token });
    const res = await post('/reset-password', { token: 'b'.repeat(64), password: 'Nouveau#Mdp1' });
    expect(res.status).toBe(400);
    expect(String((await json(res)).message)).toMatch(/invalide ou expiré/);
  });

  it('refuse un mot de passe trop faible sans consommer le lien', async () => {
    current = makeUser({ passwordResetToken: token, passwordResetExpires: new Date(Date.now() + 60_000) });
    const res = await post('/reset-password', { token, password: 'faible' });
    expect(res.status).toBe(400);
    expect(current.passwordResetToken).toBe(token);
  });
});
