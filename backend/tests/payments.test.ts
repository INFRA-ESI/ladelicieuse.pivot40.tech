import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

process.env.JWT_SECRET = 'p'.repeat(48);

const initTransaction = vi.fn(async (..._args: unknown[]) => ({ transactionId: 'TXN-1', paymentUrl: 'https://pay.test', message: 'ok' }));
const initiateCardPayment = vi.fn(async (..._args: unknown[]) => ({ link: 'https://card.test', exp: '2027-01-01', reference: 'REF-1' }));
const saveTransaction = vi.fn(async (..._args: unknown[]) => undefined);
const checkDoublePayment = vi.fn(async (..._args: unknown[]) => ({ blocked: false } as { blocked: boolean; reason?: string }));
const supersedePending = vi.fn(async (..._args: unknown[]) => 0);

vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../config/redis.js', () => ({ getRedis: () => null }));
vi.mock('../models/Order.model.js', () => ({ default: {} }));
vi.mock('../services/whatsapp.service.js', () => ({ sendPaymentNotification: vi.fn(async () => undefined) }));
vi.mock('../services/push.service.js', () => ({ sendPushToUser: vi.fn() }));
vi.mock('../services/singpay.service.js', () => ({
  singPayService: {
    checkDoublePayment, supersedePending,
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
const { PaymentError, unavailableError } = await import('../services/paymentErrors.js');

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

describe("POST /payments/singpay/init — pannes et refus de l'opérateur", () => {
  const body = { method: 'mobile_money', provider: 'moov', phone: '066123456', orderId: 'ORDER-1', quote: quoteFor('ORDER-1', 2500) };

  it("passerelle Moov en panne : 503, message clair, code PROVIDER_UNAVAILABLE, rien d'enregistré", async () => {
    initTransaction.mockRejectedValueOnce(unavailableError('moov', 'Moov gateway error: 502 Bad Gateway (code: 502)'));
    const res = await post('/singpay/init', body);
    const out = (await res.json()) as { success: boolean; error: string; code: string };
    expect(res.status).toBe(503);
    expect(out).toMatchObject({ success: false, code: 'PROVIDER_UNAVAILABLE' });
    expect(out.error).toMatch(/Moov Money est momentanément indisponible/);
    expect(JSON.stringify(out)).not.toMatch(/gateway|502|SingPay/i);
    expect(saveTransaction).not.toHaveBeenCalled();
  });

  it("refus de l'opérateur (solde) : 400 avec son message", async () => {
    initTransaction.mockRejectedValueOnce(new PaymentError('Solde insuffisant', 'rejected'));
    const res = await post('/singpay/init', body);
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ success: false, error: 'Solde insuffisant' });
  });

  it('erreur inattendue (texte brut de SingPay) : 500 générique, le texte brut ne sort jamais', async () => {
    initTransaction.mockRejectedValueOnce(new Error('SingPay: Moov gateway error: 502 Bad Gateway (code: 502)'));
    const res = await post('/singpay/init', body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/gateway|502|SingPay/i);
  });

  it('carte bancaire, passerelle en panne : 503 aussi', async () => {
    initiateCardPayment.mockRejectedValueOnce(unavailableError(undefined, 'HTTP 502'));
    const res = await post('/singpay/card', { orderId: 'ORDER-1', quote: quoteFor('ORDER-1', 2500) });
    expect(res.status).toBe(503);
    expect((await res.json() as { code: string }).code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('carte bancaire, erreur inattendue : 500 générique', async () => {
    initiateCardPayment.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.9:443'));
    const res = await post('/singpay/card', { orderId: 'ORDER-1', quote: quoteFor('ORDER-1', 2500) });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.9');
  });
});

describe("POST /payments/singpay/init — nouvel essai après annulation ou changement de moyen de paiement", () => {
  const body = (provider: string) => ({ method: 'mobile_money', provider, phone: '066123456', orderId: 'ORDER-1', quote: quoteFor('ORDER-1', 2500) });

  it("un nouvel essai part : les essais précédents en cours sont remplacés avant l'envoi", async () => {
    supersedePending.mockResolvedValueOnce(1);
    const res = await post('/singpay/init', body('airtel'));
    expect(res.status).toBe(200);
    expect(checkDoublePayment).toHaveBeenCalledWith('ORDER-1', 'airtel');
    expect(supersedePending).toHaveBeenCalledWith('ORDER-1');
    expect(initTransaction).toHaveBeenCalledTimes(1);
  });

  it("commande déjà payée : 409, rien n'est remplacé ni envoyé", async () => {
    checkDoublePayment.mockResolvedValueOnce({ blocked: true, reason: 'Cette commande a déjà été payée.' });
    const res = await post('/singpay/init', body('moov'));
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ error: 'Cette commande a déjà été payée.' });
    expect(supersedePending).not.toHaveBeenCalled();
    expect(initTransaction).not.toHaveBeenCalled();
  });

  it('base indisponible pour la vérification : le paiement reste possible', async () => {
    checkDoublePayment.mockRejectedValueOnce(new Error('base indisponible'));
    expect((await post('/singpay/init', body('moov'))).status).toBe(200);
    expect(initTransaction).toHaveBeenCalledTimes(1);
  });

  it('carte bancaire : même règle (déjà payée refusée, essais abandonnés remplacés)', async () => {
    expect((await post('/singpay/card', { orderId: 'ORDER-1', quote: quoteFor('ORDER-1', 2500) })).status).toBe(200);
    expect(checkDoublePayment).toHaveBeenCalledWith('ORDER-1', 'card');
    expect(supersedePending).toHaveBeenCalledWith('ORDER-1');
    checkDoublePayment.mockResolvedValueOnce({ blocked: true, reason: 'Cette commande a déjà été payée.' });
    expect((await post('/singpay/card', { orderId: 'ORDER-1', quote: quoteFor('ORDER-1', 2500) })).status).toBe(409);
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
