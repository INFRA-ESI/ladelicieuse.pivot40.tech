import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

process.env.JWT_SECRET = 'p'.repeat(48);

const initTransaction = vi.fn(async (..._args: unknown[]) => ({ transactionId: 'TXN-1', paymentUrl: 'https://pay.test', message: 'ok' }));
const initiateCardPayment = vi.fn(async (..._args: unknown[]) => ({ link: 'https://card.test', exp: '2027-01-01', reference: 'REF-1' }));
const saveTransaction = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../config/redis.js', () => ({ getRedis: () => null }));
vi.mock('../models/Order.model.js', () => ({ default: {} }));
vi.mock('../services/whatsapp.service.js', () => ({ sendPaymentNotification: vi.fn(async () => undefined) }));
vi.mock('../services/push.service.js', () => ({ sendPushToUser: vi.fn() }));
vi.mock('../services/singpay.service.js', () => ({
  singPayService: {
    checkDoublePayment: async () => ({ blocked: false }),
    initTransaction, initiateCardPayment, saveTransaction,
  },
}));
// Le service de devis lit les modèles seulement pour établir un devis ; ici on se contente de le signer.
vi.mock('../models/Meal.model.js', () => ({ default: {} }));
vi.mock('../models/Ingredient.model.js', () => ({ default: {} }));
vi.mock('../models/Consultation.model.js', () => ({ default: {} }));
vi.mock('../models/Settings.model.js', () => ({ default: {}, ZONES_DEFAULT: [] }));

const { default: paymentRouter } = await import('../routes/payment.routes.js');
const { signQuote } = await import('../services/quote.service.js');

const app = express();
app.use(express.json());
app.use('/payments', paymentRouter);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const post = (path: string, body: unknown) =>
  fetch(`${base()}/payments${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = async (res: Response) => (await res.json()) as { success: boolean; error?: string };

const quoteFor = (orderId: string, total: number) =>
  signQuote({ orderId, items: [], sousTotal: total, fraisLivraison: 0, total, modeCommande: 'sur_place' });

beforeEach(() => vi.clearAllMocks());
afterAll(() => { server.close(); });

describe('POST /payments/singpay/init — le montant vient du devis', () => {
  const mobile = { method: 'mobile_money', provider: 'airtel', phone: '077000000' };

  it('débite le total du devis, même si le navigateur annonce 1 FCFA', async () => {
    const res = await post('/singpay/init', { ...mobile, orderId: 'ORDER-1', amount: 1, quote: quoteFor('ORDER-1', 8500) });
    expect(res.status).toBe(200);
    expect(initTransaction.mock.calls[0][0]).toMatchObject({ amount: 8500, orderId: 'ORDER-1' });
    expect(saveTransaction.mock.calls[0][0]).toMatchObject({ amount: 8500 });
  });

  it('refuse un paiement sans devis', async () => {
    const res = await post('/singpay/init', { ...mobile, orderId: 'ORDER-1', amount: 8500 });
    expect(res.status).toBe(400);
    expect(initTransaction).not.toHaveBeenCalled();
  });

  it('refuse un devis qui ne correspond pas à la commande payée (autre orderId)', async () => {
    const res = await post('/singpay/init', { ...mobile, orderId: 'ORDER-2', quote: quoteFor('ORDER-1', 8500) });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/revalid/i);
    expect(initTransaction).not.toHaveBeenCalled();
  });

  it('refuse un devis falsifié', async () => {
    const token = quoteFor('ORDER-1', 8500);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ orderId: 'ORDER-1', items: [], sousTotal: 1, fraisLivraison: 0, total: 1, modeCommande: 'sur_place', typ: 'quote' })).toString('base64url');
    const res = await post('/singpay/init', { ...mobile, orderId: 'ORDER-1', quote: `${h}.${forged}.${s}` });
    expect(res.status).toBe(400);
    expect(initTransaction).not.toHaveBeenCalled();
  });
});

describe('POST /payments/singpay/card — le montant vient du devis', () => {
  it('débite le total du devis, pas le montant annoncé', async () => {
    const res = await post('/singpay/card', { orderId: 'ORDER-3', amount: 1, quote: quoteFor('ORDER-3', 12000) });
    expect(res.status).toBe(200);
    expect(initiateCardPayment.mock.calls[0][0]).toMatchObject({ amount: 12000, orderId: 'ORDER-3' });
  });

  it('refuse un paiement par carte sans devis ou avec le devis d’une autre commande', async () => {
    expect((await post('/singpay/card', { orderId: 'ORDER-3', amount: 12000 })).status).toBe(400);
    expect((await post('/singpay/card', { orderId: 'ORDER-4', quote: quoteFor('ORDER-3', 12000) })).status).toBe(400);
    expect(initiateCardPayment).not.toHaveBeenCalled();
  });
});
