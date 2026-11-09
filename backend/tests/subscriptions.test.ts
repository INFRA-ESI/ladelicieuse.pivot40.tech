import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 's'.repeat(48);

const id = (c: string) => c.repeat(24);
const PLAN = id('1'); // Vitalité : 14 100 / semaine, 45 000 / mois

const saved: Record<string, unknown>[] = [];
// Abonnements déjà en base, pour les routes d'administration.
const existing = new Map<string, { statut: string; billing: string; startDate: Date; endDate: Date; clientNom: string; save: () => Promise<void> }>();
let transactionExists: unknown = null;
const transactionQuery = vi.fn();

vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../routes/auth.routes.js', () => ({ verifyJWT: (_q: unknown, _r: unknown, next: () => void) => next() }));
vi.mock('../models/HistoryLog.model.js', () => ({ logAction: vi.fn(async () => undefined) }));
const realtime = vi.hoisted(() => ({ notifySubscriptionCreated: vi.fn(), notifySubscriptionUpdated: vi.fn() }));
vi.mock('../services/realtime.service.js', () => realtime);
vi.mock('../models/Meal.model.js', () => ({ default: {} }));
vi.mock('../models/Ingredient.model.js', () => ({ default: {} }));
vi.mock('../models/Consultation.model.js', () => ({ default: {} }));
vi.mock('../models/Settings.model.js', () => ({ default: {}, ZONES_DEFAULT: [] }));
vi.mock('../models/Plan.model.js', () => ({
  default: {
    findOne: (q: { _id: string }) => ({
      select: () => ({ lean: async () => (q._id === PLAN ? { _id: PLAN, nom: 'Vitalité', prixHebdo: 14100, prixMensuel: 45000 } : null) }),
    }),
  },
}));
vi.mock('../models/Transaction.model.js', () => ({
  default: { exists: async (q: unknown) => { transactionQuery(q); return transactionExists; } },
}));
vi.mock('../models/Subscription.model.js', () => ({
  default: class {
    static async findOne(q: { refPaiement?: string }) { return saved.find(s => s.refPaiement === q.refPaiement) ?? null; }
    static async findById(subId: string) { return existing.get(subId) ?? null; }
    _id = 'sub-1';
    constructor(data: Record<string, unknown>) { Object.assign(this, data); }
    async save() { saved.push({ ...this } as Record<string, unknown>); }
  },
}));

const { default: subscriptionsRouter } = await import('../routes/subscriptions.routes.js');
const { signQuote } = await import('../services/quote.service.js');

const app = express();
app.use(express.json());
app.use('/subscriptions', subscriptionsRouter);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let ip = 0;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base()}/subscriptions${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.4.0.${++ip}`, ...headers },
    body: JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as { success: boolean; message?: string; data?: Record<string, unknown> };
const bearer = (role: string) => ({ Authorization: `Bearer ${jwt.sign({ id: 'user-123', email: 'a@b.ga', role }, process.env.JWT_SECRET as string)}` });

const getQuote = async (billing: 'weekly' | 'monthly' = 'monthly', orderId = 'SUB-1') => {
  const res = await post('/quote', { orderId, planId: PLAN, billing });
  return (await json(res)).data as { quote: string; total: number };
};
const client = { clientNom: 'Awa', clientEmail: 'awa@example.com', clientTelephone: '077000000' };

beforeEach(() => { saved.length = 0; existing.clear(); transactionExists = null; vi.clearAllMocks(); });
afterAll(() => { server.close(); });

describe('POST /subscriptions/quote', () => {
  it('fixe le prix depuis le plan en base, mensuel comme hebdomadaire', async () => {
    expect((await getQuote('monthly')).total).toBe(45000);
    expect((await getQuote('weekly', 'SUB-2')).total).toBe(14100);
  });

  it('refuse un plan inconnu ou un identifiant invalide', async () => {
    expect((await post('/quote', { orderId: 'SUB-1', planId: id('9'), billing: 'monthly' })).status).toBe(400);
    expect((await post('/quote', { orderId: 'SUB-1', planId: 'essentiel', billing: 'monthly' })).status).toBe(400);
  });

  it('refuse la facturation annuelle, supprimée', async () => {
    expect((await post('/quote', { orderId: 'SUB-1', planId: PLAN, billing: 'annual' })).status).toBe(400);
  });
});

describe('POST /subscriptions — activation', () => {
  it('refuse sans devis : on ne peut plus s’abonner en envoyant simplement un corps de requête', async () => {
    const res = await post('/', { ...client, planId: PLAN, planName: 'Vitalité', billing: 'monthly', price: 1, statut: 'active' });
    expect(res.status).toBe(400);
    expect(saved).toHaveLength(0);
  });

  it("refuse un devis de COMMANDE : il ne peut pas servir à créer un abonnement", async () => {
    const quote = signQuote({ kind: 'commande', orderId: 'ORDER-1', items: [], sousTotal: 1, fraisLivraison: 0, total: 1, modeCommande: 'sur_place' });
    expect((await post('/', { ...client, quote })).status).toBe(400);
    expect(saved).toHaveLength(0);
  });

  it('en espèces : demande « en_attente », prix et plan issus du devis, jamais du corps', async () => {
    const { quote } = await getQuote('monthly');
    const res = await post('/', { ...client, quote, modePaiement: 'especes', planId: 'autre', planName: 'Gratuit', billing: 'weekly', price: 1, statut: 'active' });
    expect(res.status).toBe(201);
    expect((await json(res)).data).toMatchObject({ statut: 'en_attente', price: 45000, planName: 'Vitalité', billing: 'monthly' });
    expect(saved[0]).toMatchObject({ paiementVerifie: false, planId: PLAN, price: 45000, refPaiement: 'SUB-1' });
    expect(transactionQuery).not.toHaveBeenCalled();
  });

  it('avec un paiement en ligne réussi du bon montant : abonnement « active »', async () => {
    transactionExists = { _id: 'txn' };
    const { quote } = await getQuote('weekly');
    const res = await post('/', { ...client, quote, modePaiement: 'mobile_money' });
    expect((await json(res)).data).toMatchObject({ statut: 'active', price: 14100 });
    expect(transactionQuery).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'SUB-1', status: 'success', provider: { $in: ['airtel', 'moov', 'card'] }, amount: { $gte: 14100 },
    }));
  });

  it('par carte : « active » si la transaction carte réussie est retrouvée, « en_attente » sinon', async () => {
    transactionExists = { _id: 'txn-carte' };
    const { quote } = await getQuote('monthly', 'SUB-CARTE-1');
    const payee = await json(await post('/', { ...client, quote, modePaiement: 'carte' }));
    expect(payee.data).toMatchObject({ statut: 'active', price: 45000 });
    expect(transactionQuery).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'SUB-CARTE-1', status: 'success', provider: { $in: ['airtel', 'moov', 'card'] }, amount: { $gte: 45000 },
    }));
    expect(saved[0]).toMatchObject({ paiementVerifie: true });
  });

  it('sans paiement retrouvé, reste « en_attente » (jamais activé gratuitement) après quelques essais', async () => {
    const { quote } = await getQuote('monthly');
    const res = await post('/', { ...client, quote, modePaiement: 'mobile_money' });
    expect(res.status).toBe(201);
    expect((await json(res)).data?.statut).toBe('en_attente');
    expect(transactionQuery).toHaveBeenCalledTimes(4);
  }, 15000);

  it('est idempotente : renvoyer le même devis ne crée pas un second abonnement', async () => {
    const { quote } = await getQuote('monthly');
    const first = await post('/', { ...client, quote, modePaiement: 'especes' });
    const second = await post('/', { ...client, quote, modePaiement: 'especes' });
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(saved).toHaveLength(1);
  });

  it('rattache l’abonnement au compte du jeton, jamais à un userId du corps', async () => {
    const { quote } = await getQuote('monthly', 'SUB-A');
    await post('/', { ...client, quote, userId: 'victime' }, bearer('client'));
    expect(saved[0].userId).toBe('user-123');

    const { quote: quote2 } = await getQuote('monthly', 'SUB-B');
    await post('/', { ...client, quote: quote2, userId: 'victime' });
    expect(saved[1].userId).toBeUndefined();
  });

  it('calcule la fin de période selon la facturation', async () => {
    const { quote } = await getQuote('weekly', 'SUB-W');
    await post('/', { ...client, quote });
    const jours = ((saved[0].endDate as Date).getTime() - (saved[0].startDate as Date).getTime()) / 86_400_000;
    expect(Math.round(jours)).toBe(7);
  });

  it("ne révèle pas les références internes de paiement dans la réponse", async () => {
    const { quote } = await getQuote('monthly');
    const body = await json(await post('/', { ...client, quote }));
    expect(body.data).not.toHaveProperty('refPaiement');
    expect(body.data).not.toHaveProperty('paiementVerifie');
  });
});

describe('PATCH /subscriptions/:id/status — administration', () => {
  const patch = (subId: string, body: unknown) =>
    fetch(`${base()}/subscriptions/${subId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const seed = (statut: string, billing = 'weekly') => {
    const longTemps = new Date('2026-01-01T00:00:00Z');
    const sub = { statut, billing, startDate: longTemps, endDate: new Date('2026-01-08T00:00:00Z'), clientNom: 'Awa', save: vi.fn(async () => undefined) };
    existing.set('sub-1', sub);
    return sub;
  };

  it("activer une demande « en_attente » fait démarrer la période à l'activation, pas à la date de la demande", async () => {
    const sub = seed('en_attente', 'weekly');
    const avant = Date.now();
    expect((await patch('sub-1', { statut: 'active' })).status).toBe(200);
    expect(sub.statut).toBe('active');
    expect(sub.startDate.getTime()).toBeGreaterThanOrEqual(avant);
    expect(Math.round((sub.endDate.getTime() - sub.startDate.getTime()) / 86_400_000)).toBe(7);
    expect(sub.save).toHaveBeenCalled();
  });

  it('reprendre un abonnement en pause ne touche pas à ses dates', async () => {
    const sub = seed('paused');
    const debut = sub.startDate;
    await patch('sub-1', { statut: 'active' });
    expect(sub.startDate).toBe(debut);
  });

  it("refuse un statut inconnu et ne modifie rien", async () => {
    const sub = seed('en_attente');
    expect((await patch('sub-1', { statut: 'offert' })).status).toBe(400);
    expect((await patch('sub-1', {})).status).toBe(400);
    expect(sub.statut).toBe('en_attente');
  });

  it('répond 404 pour un abonnement inconnu', async () => {
    expect((await patch('inconnu', { statut: 'active' })).status).toBe(404);
  });
});

describe('temps réel — abonnements', () => {
  const patch = (subId: string, body: unknown) =>
    fetch(`${base()}/subscriptions/${subId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const seed = () => {
    const sub = { statut: 'en_attente', billing: 'weekly', startDate: new Date(), endDate: new Date(), clientNom: 'Awa', save: vi.fn(async () => undefined) };
    existing.set('sub-1', sub);
    return sub;
  };

  it('création : un seul signal, et PAS de second quand le même devis est renvoyé', async () => {
    const { quote } = await getQuote('monthly', 'SUB-RT-1');
    expect((await post('/', { ...client, quote, modePaiement: 'especes' })).status).toBe(201);
    expect((await post('/', { ...client, quote, modePaiement: 'especes' })).status).toBe(200);
    expect(realtime.notifySubscriptionCreated).toHaveBeenCalledTimes(1);
  });

  it('création refusée (sans devis) : aucun signal', async () => {
    expect((await post('/', { ...client, planId: PLAN, price: 1 })).status).toBe(400);
    expect(realtime.notifySubscriptionCreated).not.toHaveBeenCalled();
  });

  it('changement de statut : un signal après l\x27enregistrement ; aucun si statut invalide ou abonnement inconnu', async () => {
    const ordre: string[] = [];
    const sub = seed();
    sub.save.mockImplementation(async () => { ordre.push('save'); });
    realtime.notifySubscriptionUpdated.mockImplementationOnce(() => { ordre.push('signal'); });

    expect((await patch('sub-1', { statut: 'active' })).status).toBe(200);
    expect(ordre).toEqual(['save', 'signal']);
    expect(realtime.notifySubscriptionUpdated).toHaveBeenCalledWith(sub);

    expect((await patch('sub-1', { statut: 'offert' })).status).toBe(400);
    expect((await patch('inconnu', { statut: 'active' })).status).toBe(404);
    expect(realtime.notifySubscriptionUpdated).toHaveBeenCalledTimes(1);
  });
});
