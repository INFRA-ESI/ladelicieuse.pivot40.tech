import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

const aggregate = vi.hoisted(() => vi.fn(async () => [{ _id: 'Salade de fruits', total: 3, revenu: 10500 }]));

vi.mock('../routes/auth.routes.js', () => ({ verifyJWT: (_q: unknown, _r: unknown, next: () => void) => next() }));
vi.mock('../middleware/cache.js', () => ({ cache: () => (_q: unknown, _r: unknown, next: () => void) => next() }));
vi.mock('../models/Order.model.js', () => ({ default: { aggregate } }));
vi.mock('../models/User.model.js', () => ({ default: {} }));
vi.mock('../models/Ingredient.model.js', () => ({ default: {} }));
vi.mock('../models/Invoice.model.js', () => ({ default: {} }));
vi.mock('../models/Subscription.model.js', () => ({ default: {} }));
vi.mock('../models/Testimonial.model.js', () => ({ default: {} }));

const { default: dashboardRouter } = await import('../routes/dashboard.routes.js');

const app = express();
app.use('/dashboard', dashboardRouter);
const server = app.listen(0);
const get = (path: string) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);

beforeEach(() => { aggregate.mockClear(); });
afterAll(() => { server.close(); });

describe('GET /dashboard/top-meals (rapport journalier)', () => {
  it('sans date : toutes les commandes, sans filtre', async () => {
    const res = await get('/dashboard/top-meals');
    expect(res.status).toBe(200);
    expect((aggregate.mock.calls[0][0] as unknown[])[0]).toEqual({ $match: {} });
  });

  it('avec une date : uniquement les commandes de ce jour à Libreville (UTC+1), hors annulées et remboursées', async () => {
    const res = await get('/dashboard/top-meals?date=2026-11-11');
    expect(res.status).toBe(200);
    const match = (aggregate.mock.calls[0][0] as { $match: { createdAt: { $gte: Date; $lt: Date }; statut: unknown } }[])[0].$match;
    expect(match.createdAt.$gte.toISOString()).toBe('2026-11-10T23:00:00.000Z');
    expect(match.createdAt.$lt.toISOString()).toBe('2026-11-11T23:00:00.000Z');
    expect(match.statut).toEqual({ $nin: ['annulee', 'remboursee'] });
  });

  it.each(['hier', '2026-13-45', '2026-02-30', '11/11/2026', '2026-11-11;drop'])('refuse la date invalide %s', async (date) => {
    const res = await get(`/dashboard/top-meals?date=${encodeURIComponent(date)}`);
    expect(res.status).toBe(400);
    expect(aggregate).not.toHaveBeenCalled();
  });
});
