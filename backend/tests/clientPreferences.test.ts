import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'x'.repeat(48);

let stored: string[] = ['halal'];
const findByIdAndUpdate = vi.fn((_id: string, update: { $set: { preferences: string[] } }) => ({
  select: async () => { stored = update.$set.preferences; return { preferences: stored }; },
}));
const findById = vi.fn(() => ({ select: () => ({ lean: async () => ({ preferences: stored }) }) }));

vi.mock('../models/User.model.js', () => ({ default: { findByIdAndUpdate, findById } }));
vi.mock('../models/Order.model.js', () => ({ default: {} }));
vi.mock('../services/email.service.js', () => ({ sendVerificationEmail: vi.fn(), sendWelcomeEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));
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
const url = (path: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}/client${path}`;
const auth = { Authorization: `Bearer ${jwt.sign({ id: 'user-1', email: 'a@test.ga', role: 'client' }, process.env.JWT_SECRET!)}` };
const patch = (body: unknown) => fetch(url('/preferences'), { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => { stored = ['halal']; vi.clearAllMocks(); });
afterAll(() => { server.close(); });

describe('préférences alimentaires du compte', () => {
  it('enregistre la sélection en base pour le bon compte et la renvoie', async () => {
    const res = await patch({ preferences: ['vegetarien', 'sans_gluten'] });
    expect(res.status).toBe(200);
    expect(findByIdAndUpdate).toHaveBeenCalledWith('user-1', { $set: { preferences: ['vegetarien', 'sans_gluten'] } }, { new: true });
    expect(((await res.json()) as { data: { preferences: string[] } }).data.preferences).toEqual(['vegetarien', 'sans_gluten']);
  });

  it('écarte les valeurs inconnues et les doublons', async () => {
    await patch({ preferences: ['vegan', 'vegan', 'pirate', 42, 'halal'] });
    expect(stored).toEqual(['vegan', 'halal']);
  });

  it("permet de tout décocher", async () => {
    await patch({ preferences: [] });
    expect(stored).toEqual([]);
  });

  it('refuse un corps qui n’est pas un tableau', async () => {
    const res = await patch({ preferences: 'vegan' });
    expect(res.status).toBe(400);
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('relit ce qui est en base', async () => {
    stored = ['low_carb'];
    const res = await fetch(url('/preferences'), { headers: auth });
    expect(((await res.json()) as { data: { preferences: string[] } }).data.preferences).toEqual(['low_carb']);
  });

  it('exige une connexion', async () => {
    const res = await fetch(url('/preferences'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"preferences":[]}' });
    expect(res.status).toBe(401);
  });
});
