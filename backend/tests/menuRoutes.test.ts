import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'm'.repeat(48);
const SECRET = process.env.JWT_SECRET;

const db = vi.hoisted(() => ({
  menuFindOne: vi.fn(),
  menuFind: vi.fn(),
  mealAggregate: vi.fn(),
  duplicate: vi.fn(),
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
vi.mock('../models/DailyMenu.model.js', () => ({
  default: {
    findOne: (filter: unknown) => ({ populate: async () => db.menuFindOne(filter) }),
    find: (filter: unknown) => ({ select: () => ({ lean: async () => db.menuFind(filter) }) }),
  },
}));
vi.mock('../models/Meal.model.js', () => ({ default: { aggregate: db.mealAggregate }, slugify: (s: string) => s }));
vi.mock('../services/menuDuplication.js', async () => {
  class MenuDuplicationError extends Error { constructor(message: string, public readonly status: 400 | 404 = 400) { super(message); } }
  return { duplicateMenu: db.duplicate, MenuDuplicationError };
});

const { default: router } = await import('../routes/menu.routes.js');
const { MenuDuplicationError } = await import('../services/menuDuplication.js');
const { invalidateCache } = await import('../middleware/cache.js');

const app = express();
app.use(express.json());
app.use('/menu', router);
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

beforeEach(() => { vi.clearAllMocks(); db.menuFindOne.mockResolvedValue(null); db.menuFind.mockResolvedValue([]); db.mealAggregate.mockResolvedValue([]); });
afterEach(() => { vi.useRealTimers(); });

describe('menu public', () => {
  it('« aujourd\'hui » se lit à l\'heure de Libreville : 23 h 30 UTC est déjà le lendemain', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-11T23:30:00Z') });
    await call('GET', '/menu');
    expect(db.menuFindOne).toHaveBeenCalledWith({ date: '2026-11-12', published: true });
  });

  it('un menu programmé mais pas publié ne se lit pas en devinant sa date', async () => {
    db.menuFindOne.mockImplementation(async (filter: { published?: boolean }) => (filter.published === true ? null : { date: '2026-11-20', published: false }));
    const res = await call('GET', '/menu/2026-11-20');
    expect(res.status).toBe(404);
    expect(db.menuFindOne).toHaveBeenCalledWith({ date: '2026-11-20', published: true });
  });

  it('un menu publié se lit', async () => {
    db.menuFindOne.mockResolvedValue({ date: '2026-11-20', published: true, repas: [] });
    expect((await call('GET', '/menu/2026-11-20')).status).toBe(200);
  });
});

describe('menu — lecture administrateur (brouillons compris)', () => {
  it('sans session : 401 ; client : 403', async () => {
    expect((await call('GET', '/menu/admin/2026-11-20')).status).toBe(401);
    expect((await call('GET', '/menu/admin/2026-11-20', undefined, client)).status).toBe(403);
  });

  it('administrateur : voit le brouillon, sans filtre « publié »', async () => {
    db.menuFindOne.mockResolvedValue({ date: '2026-11-20', published: false });
    const res = await call('GET', '/menu/admin/2026-11-20', undefined, admin);
    expect(res.status).toBe(200);
    expect(db.menuFindOne).toHaveBeenCalledWith({ date: '2026-11-20' });
  });

  it('menu inconnu : 404', async () => {
    expect((await call('GET', '/menu/admin/2026-11-20', undefined, admin)).status).toBe(404);
  });
});

describe('calendrier des menus (administrateur)', () => {
  it('refusé sans session ou à un client', async () => {
    expect((await call('GET', '/menu/admin/schedule')).status).toBe(401);
    expect((await call('GET', '/menu/admin/schedule', undefined, client)).status).toBe(403);
  });

  it('fusionne repas et menus par date, triés, avec l\'origine des copies', async () => {
    db.mealAggregate.mockResolvedValue([{ _id: '2026-11-14', meals: 3 }, { _id: '2026-11-12', meals: 2 }]);
    db.menuFind.mockResolvedValue([{ date: '2026-11-14', published: true, copiedFrom: '2026-11-11' }, { date: '2026-11-13', published: false }]);
    const res = await call('GET', '/menu/admin/schedule?from=2026-11-11&to=2026-11-20', undefined, admin);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([
      { date: '2026-11-12', meals: 2, published: false },
      { date: '2026-11-13', meals: 0, published: false },
      { date: '2026-11-14', meals: 3, published: true, copiedFrom: '2026-11-11' },
    ]);
  });

  it.each(['from=pas-une-date', 'from=2026-11-20&to=2026-11-11', 'from=2026-01-01&to=2028-01-01'])('période invalide (%s) : 400', async (query) => {
    expect((await call('GET', `/menu/admin/schedule?${query}`, undefined, admin)).status).toBe(400);
  });
});

describe('POST /menu/duplicate', () => {
  const body = { source: '2026-11-11', targets: ['2026-11-14'] };

  it('sans session : 401 ; client : 403 ; rien n\'est copié', async () => {
    expect((await call('POST', '/menu/duplicate', body)).status).toBe(401);
    expect((await call('POST', '/menu/duplicate', body, client)).status).toBe(403);
    expect(db.duplicate).not.toHaveBeenCalled();
  });

  it('administrateur : lance la copie, renvoie le détail, rafraîchit le cache public', async () => {
    db.duplicate.mockResolvedValue({ created: [{ date: '2026-11-14', meals: 2, published: false }], replaced: [], skipped: [], failed: [] });
    const res = await call('POST', '/menu/duplicate', body, admin);
    expect(res.status).toBe(200);
    expect((await res.json()).data.created).toHaveLength(1);
    expect(db.duplicate).toHaveBeenCalledWith(body);
    expect(invalidateCache).toHaveBeenCalledWith('/api/meals', '/api/menu');
  });

  it('tout est ignoré (conflits) : 200 avec le détail, cache non touché', async () => {
    db.duplicate.mockResolvedValue({ created: [], replaced: [], skipped: [{ date: '2026-11-14', reason: 'Un menu existe déjà à cette date.' }], failed: [] });
    const res = await call('POST', '/menu/duplicate', body, admin);
    expect(res.status).toBe(200);
    expect(invalidateCache).not.toHaveBeenCalled();
  });

  it('demande refusée : le code et le message du service sont renvoyés', async () => {
    db.duplicate.mockRejectedValue(new MenuDuplicationError('Aucun repas à copier le 2026-11-11.', 404));
    const res = await call('POST', '/menu/duplicate', body, admin);
    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Aucun repas/);
  });

  it('tout a échoué : 500 avec le détail par date', async () => {
    db.duplicate.mockResolvedValue({ created: [], replaced: [], skipped: [], failed: [{ date: '2026-11-14', reason: 'La copie a échoué' }] });
    expect((await call('POST', '/menu/duplicate', body, admin)).status).toBe(500);
  });

  it('erreur inattendue : 500 sans détail technique', async () => {
    db.duplicate.mockRejectedValue(new Error('connexion refusée 10.0.0.5'));
    const res = await call('POST', '/menu/duplicate', body, admin);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.5');
  });
});
