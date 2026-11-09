import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'o'.repeat(48);

const id = (c: string) => c.repeat(24);
const JUS = id('a');   // 2000 FCFA, promo 1800, format 1L à 3500
const SALAD_ING = id('d'); // 300 FCFA

const saved: Record<string, unknown>[] = [];
// Commandes déjà en base, pour les routes de changement de statut.
const stored = new Map<string, Record<string, unknown>>();
const realtime = vi.hoisted(() => ({ notifyOrderCreated: vi.fn(), notifyOrderStatus: vi.fn(), notifyOrderUpdated: vi.fn() }));
let transactionExists: unknown = null;
const transactionQuery = vi.fn();

vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../routes/auth.routes.js', () => ({ verifyJWT: (_q: unknown, _r: unknown, next: () => void) => next() }));
vi.mock('../models/HistoryLog.model.js', () => ({ logAction: vi.fn(async () => undefined) }));
vi.mock('../services/fidelite.service.js', () => ({ attributerPoints: vi.fn() }));
vi.mock('../services/whatsapp.service.js', () => ({ sendStatusNotification: vi.fn(async () => undefined), sendFideliteNotification: vi.fn(async () => undefined) }));
vi.mock('../services/realtime.service.js', () => realtime);
vi.mock('../services/push.service.js', () => ({ sendPushToUser: vi.fn(async () => undefined) }));
vi.mock('../services/email.service.js', () => ({ sendOrderConfirmationEmail: vi.fn(async () => undefined) }));

vi.mock('../models/Order.model.js', () => ({
  default: class {
    static async findOne(q: { refPaiement?: string }) { return saved.find(o => o.refPaiement === q.refPaiement) ?? null; }
    static async findById(orderId: string) { return stored.get(orderId) ?? null; }
    static async findByIdAndUpdate(orderId: string, patch: Record<string, unknown>) {
      const order = stored.get(orderId);
      return order ? Object.assign(order, patch) : null;
    }
    numero = 'CMD-1';
    constructor(data: Record<string, unknown>) { Object.assign(this, data); }
    async save() { saved.push({ ...this } as Record<string, unknown>); }
  },
}));
vi.mock('../models/Transaction.model.js', () => ({
  default: { exists: async (q: unknown) => { transactionQuery(q); return transactionExists; } },
}));
vi.mock('../models/Meal.model.js', () => ({
  default: { find: () => ({ select: () => ({ lean: async () => [
    { _id: JUS, prix: 2000, prixPromo: 1800, formats: [{ label: '1L', prix: 3500, disponible: true }] },
  ] }) }) },
}));
vi.mock('../models/Ingredient.model.js', () => ({
  default: { find: () => ({ select: () => ({ lean: async () => [{ _id: SALAD_ING, prixVente: 300 }] }) }) },
}));
vi.mock('../models/Consultation.model.js', () => ({ default: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }));
vi.mock('../models/Settings.model.js', () => ({
  default: { findOne: () => ({ select: () => ({ lean: async () => ({ zonesLivraison: [{ frais: 2000 }], fraisLivraison: 2000 }) }) }) },
  ZONES_DEFAULT: [{ frais: 2000 }],
}));

const { default: ordersRouter } = await import('../routes/orders.routes.js');
const { signQuote } = await import('../services/quote.service.js');

const app = express();
app.use(express.json());
app.use('/orders', ordersRouter);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// Une IP par appel : les routes sont limitées en débit par IP.
let ip = 0;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.2.0.${++ip}`, ...headers },
    body: JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as { success: boolean; message?: string; data?: Record<string, unknown> };
const bearer = (role: string, secret = process.env.JWT_SECRET as string) =>
  ({ Authorization: `Bearer ${jwt.sign({ id: 'user-123', email: 'awa@example.com', role }, secret)}` });

const quoteBody = (overrides: Record<string, unknown> = {}) => ({
  orderId: 'ORDER-1',
  modeCommande: 'livraison',
  fraisLivraison: 2000,
  items: [{ nom: 'Jus détox', qty: 2, prix: 2000, ref: { type: 'jus', id: JUS } }],
  ...overrides,
});
const client = { nom: 'Awa', telephone: '077000000' };

// Demande un vrai devis au serveur, comme le fait le panier avant le paiement.
async function getQuote(overrides: Record<string, unknown> = {}) {
  const res = await post('/orders/quote', quoteBody(overrides));
  return (await json(res)).data as { quote: string; total: number };
}

beforeEach(() => { saved.length = 0; stored.clear(); transactionExists = null; vi.clearAllMocks(); });
afterAll(() => { server.close(); });

describe('POST /orders/quote', () => {
  it('renvoie un devis signé et le total calculé par le serveur', async () => {
    const res = await post('/orders/quote', quoteBody());
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data).toMatchObject({ sousTotal: 4000, fraisLivraison: 2000, total: 6000 });
    expect(typeof data?.quote).toBe('string');
  });

  it('refuse un article à 0 FCFA avant tout paiement (la faille corrigée)', async () => {
    const res = await post('/orders/quote', quoteBody({ items: [{ nom: 'Jus détox', qty: 1, prix: 0, ref: { type: 'jus', id: JUS } }] }));
    expect(res.status).toBe(400);
    expect((await json(res)).message).toMatch(/prix/i);
  });

  it('refuse un article sans référence au catalogue', async () => {
    const res = await post('/orders/quote', quoteBody({ items: [{ nom: 'Jus', qty: 1, prix: 2000 }] }));
    expect(res.status).toBe(400);
  });

  it('refuse des frais de livraison inventés', async () => {
    const res = await post('/orders/quote', quoteBody({ fraisLivraison: 5 }));
    expect(res.status).toBe(400);
  });

  it('refuse une livraison à 0 FCFA (livraison offerte inventée), accepte les frais de la zone', async () => {
    expect((await post('/orders/quote', quoteBody({ modeCommande: 'livraison', fraisLivraison: 0 }))).status).toBe(400);
    expect((await post('/orders/quote', quoteBody({ modeCommande: 'livraison', fraisLivraison: 2000 }))).status).toBe(200);
  });

  it('refuse des frais de livraison pour un retrait sur place', async () => {
    expect((await post('/orders/quote', quoteBody({ modeCommande: 'sur_place', fraisLivraison: 2000 }))).status).toBe(400);
  });

  it('valide une salade composée par la somme de ses ingrédients', async () => {
    const salade = { nom: 'Ma salade', qty: 1, prix: 900, ref: { type: 'salade', composition: [{ id: SALAD_ING, quantity: 3 }] } };
    expect((await post('/orders/quote', quoteBody({ items: [salade] }))).status).toBe(200);
    expect((await post('/orders/quote', quoteBody({ items: [{ ...salade, prix: 100 }] }))).status).toBe(400);
  });
});

describe('POST /orders — prix issus du devis', () => {
  it('enregistre les prix du devis, même si le corps de la requête annonce autre chose', async () => {
    const { quote } = await getQuote();
    const res = await post('/orders', {
      quote, client, modePaiement: 'especes',
      items: [{ nom: 'Jus détox', qty: 2, prix: 1 }], sousTotal: 1, fraisLivraison: 0, total: 1,
    });
    expect(res.status).toBe(201);
    expect(saved[0]).toMatchObject({ sousTotal: 4000, fraisLivraison: 2000, total: 6000 });
    expect((saved[0].items as { prix: number }[])[0].prix).toBe(2000);
  });

  it('refuse une commande sans devis, rien n’est enregistré', async () => {
    const res = await post('/orders', { client, items: [{ nom: 'Jus détox', qty: 1, prix: 0 }] });
    expect(res.status).toBe(400);
    expect(saved).toHaveLength(0);
  });

  it("refuse un devis d'ABONNEMENT : il ne peut pas servir à créer une commande au prix d'un plan", async () => {
    const quote = signQuote({
      kind: 'abonnement', abonnement: { planId: id('1'), planNom: 'Vitalité', billing: 'monthly' },
      orderId: 'SUB-1', items: [{ nom: 'Abonnement', qty: 1, prix: 1, customizations: [] }],
      sousTotal: 1, fraisLivraison: 0, total: 1, modeCommande: 'sur_place',
    });
    const res = await post('/orders', { quote, client });
    expect(res.status).toBe(400);
    expect(saved).toHaveLength(0);
  });

  it('refuse un devis falsifié', async () => {
    const { quote } = await getQuote();
    const [h, , s] = quote.split('.');
    const forged = Buffer.from(JSON.stringify({ orderId: 'ORDER-1', items: [], sousTotal: 0, fraisLivraison: 0, total: 0, modeCommande: 'sur_place', typ: 'quote' })).toString('base64url');
    const res = await post('/orders', { quote: `${h}.${forged}.${s}`, client });
    expect(res.status).toBe(400);
    expect(saved).toHaveLength(0);
  });

  it('est idempotente : renvoyer le même devis ne crée pas de seconde commande', async () => {
    const { quote } = await getQuote();
    const first = await post('/orders', { quote, client });
    const second = await post('/orders', { quote, client });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(saved).toHaveLength(1);
  });

  it('naît toujours « en attente », quel que soit le statut demandé', async () => {
    const { quote } = await getQuote();
    await post('/orders', { quote, client, statut: 'confirmee' });
    expect(saved[0].statut).toBe('en_attente');
  });

  it("garde le mode de commande du devis, pas celui du corps", async () => {
    const { quote } = await getQuote({ modeCommande: 'sur_place', fraisLivraison: 0 });
    await post('/orders', { quote, client, modeCommande: 'livraison' });
    expect(saved[0].modeCommande).toBe('sur_place');
  });

  it('enregistre un email vide, et non la chaîne « undefined », quand l’email est absent', async () => {
    const { quote } = await getQuote();
    await post('/orders', { quote, client });
    expect((saved[0].client as { email: string }).email).toBe('');
  });
});

describe('POST /orders — indicateur de paiement vérifié', () => {
  it('est vrai quand un paiement en ligne réussi du bon montant existe', async () => {
    transactionExists = { _id: 'txn' };
    const { quote } = await getQuote();
    await post('/orders', { quote, client, modePaiement: 'carte' });
    expect(saved[0].paiementVerifie).toBe(true);
    expect(transactionQuery).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'ORDER-1', status: 'success', provider: { $in: ['airtel', 'moov', 'card'] }, amount: { $gte: 6000 },
    }));
  });

  it('est faux sans paiement retrouvé, et la commande est enregistrée quand même (jamais bloquée)', async () => {
    const { quote } = await getQuote();
    const res = await post('/orders', { quote, client, modePaiement: 'mobile_money' });
    expect(res.status).toBe(201);
    expect(saved[0].paiementVerifie).toBe(false);
  });

  it('ne compte pas les espèces, dont l’enregistrement est public', async () => {
    transactionExists = { _id: 'txn' };
    const { quote } = await getQuote();
    await post('/orders', { quote, client, modePaiement: 'especes' });
    expect(saved[0].paiementVerifie).toBe(false);
    expect(transactionQuery).not.toHaveBeenCalled();
  });
});

describe('POST /orders — rattachement au compte (points de fidélité)', () => {
  it('rattache la commande au compte du jeton client', async () => {
    const { quote } = await getQuote();
    expect((await post('/orders', { quote, client }, bearer('client'))).status).toBe(201);
    expect(saved[0].userId).toBe('user-123');
  });

  it("ignore le userId du corps : un invité ne peut pas viser le compte d'un autre", async () => {
    const { quote } = await getQuote();
    await post('/orders', { quote, client, userId: 'compte-de-la-victime' });
    expect(saved[0].userId).toBeUndefined();
  });

  it('le jeton prime sur un userId différent envoyé dans le corps', async () => {
    const { quote } = await getQuote();
    await post('/orders', { quote, client, userId: 'compte-de-la-victime' }, bearer('client'));
    expect(saved[0].userId).toBe('user-123');
  });

  it('accepte la commande comme invité quand le jeton est falsifié', async () => {
    const { quote } = await getQuote();
    const res = await post('/orders', { quote, client }, bearer('client', 'z'.repeat(48)));
    expect(res.status).toBe(201);
    expect(saved[0].userId).toBeUndefined();
  });

  it("n'utilise pas un jeton admin comme identité client", async () => {
    const { quote } = await getQuote();
    await post('/orders', { quote, client }, bearer('admin'));
    expect(saved[0].userId).toBeUndefined();
  });
});

describe('POST /orders — validation du client', () => {
  it('exige le nom et le téléphone', async () => {
    const { quote } = await getQuote();
    expect((await post('/orders', { quote, client: { telephone: '077000000' } })).status).toBe(400);
    expect((await post('/orders', { quote, client: { nom: 'Awa' } })).status).toBe(400);
  });
});

describe('temps réel — un signal par changement réel, jamais en double ni en cas d\x27erreur', () => {
  const patch = (path: string, body: unknown) =>
    fetch(`${base()}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const seed = (extra: Record<string, unknown> = {}) => {
    const order = {
      _id: 'order-1', numero: 'LDD-0001', statut: 'en_attente', userId: 'user-123', total: 4000,
      client: { nom: 'Awa', telephone: '077000000' }, historique: [] as unknown[],
      save: vi.fn(async () => undefined), ...extra,
    };
    stored.set('order-1', order);
    return order;
  };

  it('création : un seul signal à la création (201)', async () => {
    const { quote } = await getQuote();
    expect((await post('/orders', { quote, client, modePaiement: 'especes' })).status).toBe(201);
    expect(realtime.notifyOrderCreated).toHaveBeenCalledTimes(1);
    expect(realtime.notifyOrderStatus).not.toHaveBeenCalled();
  });

  it('création : renvoyer le même devis (réponse 200) n\x27émet PAS un second signal', async () => {
    const { quote } = await getQuote();
    await post('/orders', { quote, client, modePaiement: 'especes' });
    const second = await post('/orders', { quote, client, modePaiement: 'especes' });
    expect(second.status).toBe(200);
    expect(realtime.notifyOrderCreated).toHaveBeenCalledTimes(1);
  });

  it('création refusée (400) : aucun signal', async () => {
    expect((await post('/orders', { client, modePaiement: 'especes' })).status).toBe(400);         // sans devis
    expect((await post('/orders', { quote: 'x', client: {}, modePaiement: 'especes' })).status).toBe(400); // sans nom
    expect(realtime.notifyOrderCreated).not.toHaveBeenCalled();
  });

  it('changement de statut : un signal, avec la commande enregistrée (propriétaire inclus)', async () => {
    const order = seed();
    const res = await patch('/orders/order-1/status', { statut: 'confirmee', par: 'Admin' });
    expect(res.status).toBe(200);
    expect(realtime.notifyOrderStatus).toHaveBeenCalledTimes(1);
    expect(realtime.notifyOrderStatus).toHaveBeenCalledWith(order);
    expect(order.save).toHaveBeenCalledTimes(1);
  });

  it('changement de statut : le signal part APRÈS l\x27enregistrement (le rechargement voit le nouvel état)', async () => {
    const ordre: string[] = [];
    const order = seed({ save: vi.fn(async () => { ordre.push('save'); }) });
    realtime.notifyOrderStatus.mockImplementationOnce(() => { ordre.push('signal'); });
    await patch('/orders/order-1/status', { statut: 'prete' });
    expect(ordre).toEqual(['save', 'signal']);
    expect(order.statut).toBe('prete');
  });

  it('commande inconnue ou enregistrement en échec : aucun signal', async () => {
    expect((await patch('/orders/inconnue/status', { statut: 'prete' })).status).toBe(404);
    seed({ save: vi.fn(async () => { throw new Error('base indisponible'); }) });
    expect((await patch('/orders/order-1/status', { statut: 'prete' })).status).toBe(400);
    expect(realtime.notifyOrderStatus).not.toHaveBeenCalled();
  });

  it('anomalie (annulation ou remboursement) : signal de changement de statut', async () => {
    const order = seed();
    const res = await post('/orders/order-1/anomalie', { type: 'annulation', raison: 'client absent', montant: 0 });
    expect(res.status).toBe(200);
    expect(order.statut).toBe('annulee');
    expect(realtime.notifyOrderStatus).toHaveBeenCalledTimes(1);
  });

  it('priorité : signal « mise à jour » réservé à l\x27équipe, pas un changement de statut', async () => {
    seed();
    expect((await patch('/orders/order-1/priority', { priorite: 'urgente' })).status).toBe(200);
    expect(realtime.notifyOrderUpdated).toHaveBeenCalledTimes(1);
    expect(realtime.notifyOrderStatus).not.toHaveBeenCalled();
    expect((await patch('/orders/inconnue/priority', { priorite: 'urgente' })).status).toBe(404);
    expect(realtime.notifyOrderUpdated).toHaveBeenCalledTimes(1);
  });
});
