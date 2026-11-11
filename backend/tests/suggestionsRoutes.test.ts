import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 's'.repeat(48);
const SECRET = process.env.JWT_SECRET;
const ID = 'a'.repeat(24);

const db = vi.hoisted(() => ({
  list: [] as Record<string, unknown>[],
  saved: [] as Record<string, unknown>[],
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  bulkWrite: vi.fn(async () => ({})),
  updateMany: vi.fn(async () => ({})),
  countDocuments: vi.fn(async () => 3),
}));

vi.mock('../routes/auth.routes.js', () => ({
  verifyJWT: (req: { headers: { authorization?: string } }, res: { status: (c: number) => { json: (b: unknown) => void } }, next: () => void) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ success: false }); return; }
    try {
      if ((jwt.verify(token, SECRET) as { role?: string }).role !== 'admin') { res.status(403).json({ success: false }); return; }
      next();
    } catch { res.status(401).json({ success: false }); }
  },
}));
vi.mock('../middleware/cache.js', () => ({ cache: () => (_q: unknown, _r: unknown, next: () => void) => next(), invalidateCache: vi.fn(async () => undefined) }));
vi.mock('../models/HistoryLog.model.js', () => ({ logAction: vi.fn(async () => undefined) }));
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../models/Suggestion.model.js', () => {
  class Suggestion {
    constructor(public data: Record<string, unknown>) { Object.assign(this, data); }
    async save() { db.saved.push(this.data); }
    static find() { return { lean: async () => db.list, select: () => ({ lean: async () => db.list }) }; }
    static findById(id: string) { return { select: () => ({ lean: async () => db.findById(id) }), lean: async () => db.findById(id), ...(db.findById(id) ?? {}) }; }
    static findByIdAndUpdate = db.findByIdAndUpdate;
    static bulkWrite = db.bulkWrite;
    static updateMany = db.updateMany;
    static countDocuments = db.countDocuments;
  }
  return { default: Suggestion };
});

const { default: router } = await import('../routes/suggestions.routes.js');
const { invalidateCache } = await import('../middleware/cache.js');

const app = express();
app.use(express.json());
app.use('/suggestions', router);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => { server.close(); });

const sign = (role: string) => jwt.sign({ id: 'u', email: 'x@y.z', role }, SECRET, { expiresIn: '1h' });
const admin = sign('admin');
const client = sign('client');
const call = (method: string, path: string, body?: unknown, token?: string) =>
  fetch(`${base()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  db.list = [];
  db.saved.length = 0;
  db.findById.mockReturnValue({ _id: ID, type: 'crudites', nom: 'Exemple' });
  db.findByIdAndUpdate.mockResolvedValue({ _id: ID, nom: 'Exemple' });
});

describe('liste publique : la meilleure salade d\'abord, puis l\'ordre réglé, puis les plus récentes', () => {
  it('trie épinglée → position → date', async () => {
    db.list = [
      { nom: 'Récente sans position', createdAt: '2026-03-01' },
      { nom: 'Seconde', ordre: 1, createdAt: '2026-01-01' },
      { nom: 'Meilleure', ordre: 5, epinglee: true, createdAt: '2025-01-01' },
      { nom: 'Première des autres', ordre: 0, createdAt: '2026-02-01' },
      { nom: 'Ancienne sans position', createdAt: '2026-01-15' },
    ];
    const res = await call('GET', '/suggestions?type=crudites');
    expect((await res.json()).data.map((s: { nom: string }) => s.nom)).toEqual([
      'Meilleure', 'Première des autres', 'Seconde', 'Récente sans position', 'Ancienne sans position',
    ]);
  });

  it('liste administrateur : regroupée par type, même règle dans chaque type', async () => {
    db.list = [
      { nom: 'F-2', type: 'fruits', ordre: 1 }, { nom: 'C-2', type: 'crudites', ordre: 1 },
      { nom: 'F-1', type: 'fruits', ordre: 0 }, { nom: 'C-1', type: 'crudites', ordre: 0, epinglee: false },
    ];
    const res = await call('GET', '/suggestions/all', undefined, admin);
    expect((await res.json()).data.map((s: { nom: string }) => s.nom)).toEqual(['C-1', 'C-2', 'F-1', 'F-2']);
  });
});

describe('droits administrateur', () => {
  it.each([
    ['POST', '/suggestions', { nom: 'x', description: 'y', type: 'fruits' }],
    ['PATCH', '/suggestions/reorder', { type: 'fruits', ids: [ID] }],
    ['PATCH', `/suggestions/${ID}/pin`, { epinglee: true }],
    ['PATCH', `/suggestions/${ID}`, { nom: 'x' }],
  ])('%s %s : 401 sans session, 403 pour un client', async (method, path, body) => {
    expect((await call(method, path, body)).status).toBe(401);
    expect((await call(method, path, body, client)).status).toBe(403);
    expect(db.bulkWrite).not.toHaveBeenCalled();
    expect(db.saved).toHaveLength(0);
  });
});

describe('création', () => {
  it('position réglée par le serveur (fin de liste) : ordre et épingle envoyés par le navigateur sont ignorés', async () => {
    const res = await call('POST', '/suggestions', { nom: 'Nouvelle', description: 'd', type: 'fruits', ordre: 0, epinglee: true }, admin);
    expect(res.status).toBe(201);
    expect(db.saved[0]).toMatchObject({ nom: 'Nouvelle', type: 'fruits', ordre: 3 });
    expect(db.saved[0].epinglee).toBeUndefined();
    expect(invalidateCache).toHaveBeenCalledWith('/api/suggestions');
  });

  it('type invalide : 400, rien n\'est enregistré', async () => {
    expect((await call('POST', '/suggestions', { nom: 'x', description: 'y', type: 'desserts' }, admin)).status).toBe(400);
    expect(db.saved).toHaveLength(0);
  });
});

describe('modification', () => {
  it('une modification ne touche ni à la position ni à l\'épingle', async () => {
    await call('PATCH', `/suggestions/${ID}`, { nom: 'Renommée', ordre: 0, epinglee: true }, admin);
    expect(db.findByIdAndUpdate).toHaveBeenCalledWith(ID, { nom: 'Renommée' }, expect.anything());
  });

  it('changer de type : fin de liste du nouveau type, sans reprendre l\'épingle', async () => {
    await call('PATCH', `/suggestions/${ID}`, { type: 'fruits' }, admin);
    expect(db.findByIdAndUpdate).toHaveBeenCalledWith(ID, { type: 'fruits', ordre: 3, epinglee: false }, expect.anything());
  });

  it('type invalide au changement : 400', async () => {
    expect((await call('PATCH', `/suggestions/${ID}`, { type: 'desserts' }, admin)).status).toBe(400);
    expect(db.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('réordonner', () => {
  it.each([
    ['type invalide', { type: 'desserts', ids: [ID] }],
    ['sans liste', { type: 'fruits' }],
    ['identifiant invalide', { type: 'fruits', ids: ['pas-un-id'] }],
    ['identifiants qui ne sont pas du texte', { type: 'fruits', ids: [{ $ne: null }] }],
  ])('%s : 400', async (_label, body) => {
    expect((await call('PATCH', '/suggestions/reorder', body, admin)).status).toBe(400);
    expect(db.bulkWrite).not.toHaveBeenCalled();
  });

  it('liste qui ne correspond plus aux suggestions : 400 avec message, rien n\'est écrit', async () => {
    db.list = [{ _id: ID }, { _id: 'b'.repeat(24) }];
    const res = await call('PATCH', '/suggestions/reorder', { type: 'fruits', ids: [ID] }, admin);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Rechargez la page/);
    expect(db.bulkWrite).not.toHaveBeenCalled();
  });

  it('liste exacte : positions écrites, cache public rafraîchi', async () => {
    const other = 'b'.repeat(24);
    db.list = [{ _id: ID }, { _id: other }];
    const res = await call('PATCH', '/suggestions/reorder', { type: 'fruits', ids: [other, ID] }, admin);
    expect(res.status).toBe(200);
    expect(db.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: other }, update: { $set: { ordre: 0 } } } },
      { updateOne: { filter: { _id: ID }, update: { $set: { ordre: 1 } } } },
    ]);
    expect(invalidateCache).toHaveBeenCalledWith('/api/suggestions');
  });
});

describe('épingler', () => {
  it('valeur qui n\'est pas un booléen : 400 ; identifiant invalide : 404', async () => {
    expect((await call('PATCH', `/suggestions/${ID}/pin`, { epinglee: 'oui' }, admin)).status).toBe(400);
    expect((await call('PATCH', '/suggestions/pas-un-id/pin', { epinglee: true }, admin)).status).toBe(404);
  });
});
