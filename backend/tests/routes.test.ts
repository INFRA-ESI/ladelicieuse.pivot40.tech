import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

// Enregistrements simulés : ce que chaque route a réellement voulu écrire en base.
const bulkWrite = vi.fn(async (..._args: unknown[]) => ({}));
const findByIdAndUpdate = vi.fn();
const reappro = {
  statut: 'commandee',
  articles: [{ ingredientId: { toString: () => 'ing-1' }, quantiteRecue: 0 }, { ingredientId: { toString: () => 'ing-2' }, quantiteRecue: 0 }],
  fournisseur: 'Marché',
  save: vi.fn(async () => undefined),
};

vi.mock('../routes/auth.routes.js', () => ({ verifyJWT: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../models/HistoryLog.model.js', () => ({ logAction: vi.fn(async () => undefined) }));
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../models/Ingredient.model.js', () => ({ default: { bulkWrite, findByIdAndUpdate } }));
vi.mock('../models/StockReappro.model.js', () => ({ default: { findById: async () => reappro } }));

const { default: stocksRouter } = await import('../routes/stocks.routes.js');

const app = express();
app.use(express.json());
app.use('/stocks', stocksRouter);

const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const send = (method: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base()}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

beforeEach(() => { vi.clearAllMocks(); });
afterAll(() => { server.close(); });

describe('PATCH /stocks/reappro/:id/status', () => {
  it("applique tous les stocks reçus en UNE requête groupée, sans requête par article", async () => {
    const res = await send('PATCH', '/stocks/reappro/r1/status', {
      statut: 'recue',
      articles: [{ ingredientId: 'ing-1', quantiteRecue: 10 }, { ingredientId: 'ing-2', quantiteRecue: 4 }],
    });
    expect(res.status).toBe(200);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const ops = bulkWrite.mock.calls[0][0] as unknown as { updateOne: { filter: { _id: string }; update: { $inc: { stock: number } } } }[];
    expect(ops.map(o => [o.updateOne.filter._id, o.updateOne.update.$inc.stock])).toEqual([['ing-1', 10], ['ing-2', 4]]);
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
    expect(reappro.articles.map(a => a.quantiteRecue)).toEqual([10, 4]);
  });

  it("ne touche pas aux stocks si le statut n'est pas « recue »", async () => {
    await send('PATCH', '/stocks/reappro/r1/status', { statut: 'annulee', articles: [{ ingredientId: 'ing-1', quantiteRecue: 10 }] });
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});
