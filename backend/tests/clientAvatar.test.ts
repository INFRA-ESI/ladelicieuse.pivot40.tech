import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'x'.repeat(48);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatars-'));
process.env.AVATAR_DIR = dir;

type FakeUser = { avatar: string; save: ReturnType<typeof vi.fn> };
let current: FakeUser;
const makeUser = (avatar = ''): FakeUser => ({ avatar, save: vi.fn(async () => undefined) });
vi.mock('../models/User.model.js', () => ({ default: { findById: () => ({ select: async () => current }) } }));
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
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/client/avatar`;
const auth = { Authorization: `Bearer ${jwt.sign({ id: 'u1', email: 'a@test.ga', role: 'client' }, process.env.JWT_SECRET!)}` };

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const send = (bytes: Buffer, type = 'image/png', headers: Record<string, string> = auth) => {
  const form = new FormData();
  form.append('avatar', new Blob([new Uint8Array(bytes)], { type }), 'photo.png');
  return fetch(url, { method: 'PUT', headers, body: form });
};
const files = () => fs.readdirSync(dir);

beforeEach(() => { current = makeUser(); for (const f of files()) fs.unlinkSync(path.join(dir, f)); });
afterAll(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('photo de profil du client', () => {
  it('enregistre une image valide et renvoie son adresse publique', async () => {
    const res = await send(PNG);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { avatar: string } };
    expect(data.avatar).toMatch(/^\/uploads\/avatars\/u1-[a-f0-9]{12}\.png$/);
    expect(current.avatar).toBe(data.avatar);
    expect(current.save).toHaveBeenCalled();
    expect(files()).toEqual([path.basename(data.avatar)]);
  });

  it('remplace l\'ancienne photo et supprime son fichier', async () => {
    fs.writeFileSync(path.join(dir, 'ancienne.png'), PNG);
    current = makeUser('/uploads/avatars/ancienne.png');
    await send(PNG);
    expect(files()).not.toContain('ancienne.png');
    expect(files()).toHaveLength(1);
  });

  it("refuse un fichier qui n'est pas une image, même annoncé comme image/png", async () => {
    const res = await send(Buffer.from('<script>alert(1)</script>'), 'image/png');
    expect(res.status).toBe(400);
    expect(files()).toHaveLength(0);
    expect(current.save).not.toHaveBeenCalled();
  });

  it('refuse une photo de plus de 2 Mo', async () => {
    const res = await send(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]));
    expect(res.status).toBe(413);
    expect(files()).toHaveLength(0);
  });

  it("n'efface jamais un fichier hors du dossier des photos", async () => {
    const outside = path.join(os.tmpdir(), 'hors-dossier.txt');
    fs.writeFileSync(outside, 'à conserver');
    current = makeUser('/uploads/avatars/../../hors-dossier.txt');
    await send(PNG);
    expect(fs.existsSync(outside)).toBe(true);
    fs.unlinkSync(outside);
  });

  it('retire la photo et son fichier', async () => {
    fs.writeFileSync(path.join(dir, 'u1-aaaaaaaaaaaa.png'), PNG);
    current = makeUser('/uploads/avatars/u1-aaaaaaaaaaaa.png');
    const res = await fetch(url, { method: 'DELETE', headers: auth });
    expect(res.status).toBe(200);
    expect(current.avatar).toBe('');
    expect(files()).toHaveLength(0);
  });

  it('exige une connexion', async () => {
    const res = await send(PNG, 'image/png', {});
    expect(res.status).toBe(401);
  });
});
