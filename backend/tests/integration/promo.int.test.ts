// Codes promo contre une VRAIE base MongoDB : devis → commande, plafonds d'utilisation, concurrence.
// Ignoré tant que MONGO_TEST_URI n'est pas défini (voir db.int.test.ts).
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'q'.repeat(48);
const uri = process.env.MONGO_TEST_URI;

vi.mock('../../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../routes/auth.routes.js', () => ({ verifyJWT: (_q: unknown, _r: unknown, next: () => void) => next() }));
vi.mock('../../services/fidelite.service.js', () => ({ attributerPoints: vi.fn() }));
vi.mock('../../services/whatsapp.service.js', () => ({ sendStatusNotification: vi.fn(async () => undefined), sendFideliteNotification: vi.fn(async () => undefined) }));
vi.mock('../../services/push.service.js', () => ({ sendPushToUser: vi.fn(async () => undefined) }));
vi.mock('../../services/staffAlerts.js', () => ({ alertStaffNewOrder: vi.fn(async () => undefined) }));
vi.mock('../../services/email.service.js', () => ({ sendOrderConfirmationEmail: vi.fn(async () => undefined) }));

const Order = (await import('../../models/Order.model.js')).default;
const Meal = (await import('../../models/Meal.model.js')).default;
const PromoCode = (await import('../../models/PromoCode.model.js')).default;
const Settings = (await import('../../models/Settings.model.js')).default;
const { default: ordersRouter } = await import('../../routes/orders.routes.js');
const { default: promotionsRouter } = await import('../../routes/promotions.routes.js');
const { evaluatePromo, computeRemise, consumePromo, MIN_PAYABLE } = await import('../../services/promoCodes.js');

const app = express();
app.use(express.json());
app.use('/orders', ordersRouter);
app.use('/promotions', promotionsRouter);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let ip = 0;
const call = (method: string, path: string, body?: unknown) =>
  fetch(`${base()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.7.0.${++ip}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as { success: boolean; message?: string; data?: Record<string, unknown> };

const DAY = 24 * 60 * 60 * 1000;
const client = { nom: 'Awa', telephone: '077000000' };

describe.skipIf(!uri)('intégration MongoDB — codes promo', () => {
  beforeAll(async () => {
    await mongoose.connect(uri as string, { dbName: `ld_promo_${Date.now()}` });
    await Promise.all([Order, PromoCode, Meal].map(m => m.init()));
  });
  afterAll(async () => {
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await Promise.all([Order, PromoCode, Meal, Settings].map(m => m.deleteMany({})));
  });

  const jus = () => Meal.create({ nom: 'Jus détox', categorie: 'Jus Détox', prix: 2000 });
  const promo = (over: Record<string, unknown> = {}) =>
    PromoCode.create({ code: 'BIENVENUE10', reduction: 10, typeReduction: 'pourcentage', minCommande: 0, maxUtilisations: 100, ...over });
  // 2 jus à 2000 = 4000 FCFA d'articles, livraison 2000.
  const quote = async (jusId: string, codePromo?: string, orderId = 'ORDER-P1') => {
    const res = await call('POST', '/orders/quote', {
      orderId, modeCommande: 'livraison', fraisLivraison: 2000, ...(codePromo !== undefined ? { codePromo } : {}),
      items: [{ nom: 'Jus détox', qty: 2, prix: 2000, ref: { type: 'jus', id: jusId } }],
    });
    return { status: res.status, body: await json(res) };
  };

  describe('calcul de la réduction', () => {
    it('pourcentage arrondi à l\'entier inférieur ; montant fixe ; jamais sous le plancher payable', () => {
      expect(computeRemise({ reduction: 15, typeReduction: 'pourcentage' }, 4999)).toBe(749);
      expect(computeRemise({ reduction: 500, typeReduction: 'fixe' }, 4000)).toBe(500);
      expect(computeRemise({ reduction: 100, typeReduction: 'pourcentage' }, 4000)).toBe(4000 - MIN_PAYABLE);
      expect(computeRemise({ reduction: 9999, typeReduction: 'fixe' }, 4000)).toBe(4000 - MIN_PAYABLE);
      expect(computeRemise({ reduction: 10, typeReduction: 'fixe' }, 50)).toBe(0);
      expect(computeRemise({ reduction: 250, typeReduction: 'pourcentage' }, 4000)).toBe(4000 - MIN_PAYABLE); // plafonné à 100 %
    });
  });

  describe('vérification d\'un code', () => {
    it('code valide, saisi en minuscules avec des espaces', async () => {
      await promo();
      expect(await evaluatePromo('  bienvenue10 ', 4000)).toMatchObject({ code: 'BIENVENUE10', remise: 400, type: 'pourcentage' });
    });

    it.each([
      ['inconnu', () => evaluatePromo('NEXISTEPAS', 4000), /invalide/],
      ['vide', () => evaluatePromo('', 4000), /invalide/],
      ['caractères spéciaux', () => evaluatePromo('A$B; drop', 4000), /invalide/],
      ['objet de requête (injection)', () => evaluatePromo({ $ne: null }, 4000), /invalide/],
      ['pas du texte', () => evaluatePromo(12345, 4000), /invalide/],
    ])('code %s : refusé', async (_label, run, message) => {
      await promo();
      await expect(run()).rejects.toThrow(message);
    });

    it('code désactivé, expiré, épuisé, panier sous le minimum : chacun son message', async () => {
      await promo({ code: 'OFF', active: false });
      await promo({ code: 'PASSE', expiry: new Date(Date.now() - DAY) });
      await promo({ code: 'FINI', maxUtilisations: 2, utilisations: 2 });
      await promo({ code: 'GROS', minCommande: 10_000 });
      await expect(evaluatePromo('OFF', 4000)).rejects.toThrow(/invalide/);
      await expect(evaluatePromo('PASSE', 4000)).rejects.toThrow(/expiré/);
      await expect(evaluatePromo('FINI', 4000)).rejects.toThrow(/épuisé/);
      await expect(evaluatePromo('GROS', 4000)).rejects.toThrow(/au moins 10 000 FCFA/);
    });

    it('un code encore valable aujourd\'hui (expiry demain) est accepté', async () => {
      await promo({ expiry: new Date(Date.now() + DAY) });
      await expect(evaluatePromo('BIENVENUE10', 4000)).resolves.toMatchObject({ remise: 400 });
    });
  });

  describe('route de vérification du panier', () => {
    it('renvoie le montant de la réduction (nom « reduction » conservé)', async () => {
      await promo();
      const res = await call('POST', '/promotions/codes/validate', { code: 'bienvenue10', montant: 4000 });
      expect(res.status).toBe(200);
      expect((await json(res)).data).toMatchObject({ reduction: 400, remise: 400, code: 'BIENVENUE10', type: 'pourcentage' });
    });

    it.each([
      [{ code: 'INCONNU', montant: 4000 }, 404],
      [{ code: 'BIENVENUE10', montant: '4000' }, 400],
      [{ code: 'BIENVENUE10' }, 400],
      [{ montant: 4000 }, 404],
      [{ code: { $gt: '' }, montant: 4000 }, 404],
      [undefined, 400],
    ])('entrée %o : %i, jamais une erreur 500', async (body, status) => {
      await promo();
      expect((await call('POST', '/promotions/codes/validate', body)).status).toBe(status);
    });
  });

  describe('devis → commande', () => {
    it('le code réduit les ARTICLES (pas la livraison) et le total signé, qui est le montant débité', async () => {
      const meal = await jus();
      await promo();
      const { status, body } = await quote(String(meal._id), 'bienvenue10');
      expect(status).toBe(200);
      expect(body.data).toMatchObject({ sousTotal: 4000, fraisLivraison: 2000, remise: 400, codePromo: 'BIENVENUE10', total: 5600 });
    });

    it('la commande enregistre la réduction et le code, et compte UNE utilisation', async () => {
      const meal = await jus();
      await promo();
      const { body } = await quote(String(meal._id), 'BIENVENUE10');
      expect((await call('POST', '/orders', { quote: body.data?.quote, client, modePaiement: 'especes' })).status).toBe(201);
      const order = (await Order.findOne({ refPaiement: 'ORDER-P1' }).lean())!;
      expect(order).toMatchObject({ sousTotal: 4000, remise: 400, codePromo: 'BIENVENUE10', total: 5600 });
      await vi.waitFor(async () => expect((await PromoCode.findOne({ code: 'BIENVENUE10' }))!.utilisations).toBe(1));
    });

    it('un renvoi du même devis ne consomme pas le code une seconde fois', async () => {
      const meal = await jus();
      await promo();
      const { body } = await quote(String(meal._id), 'BIENVENUE10');
      await call('POST', '/orders', { quote: body.data?.quote, client });
      await call('POST', '/orders', { quote: body.data?.quote, client });
      await vi.waitFor(async () => expect((await PromoCode.findOne({ code: 'BIENVENUE10' }))!.utilisations).toBe(1));
      expect(await Order.countDocuments()).toBe(1);
    });

    it('sans code : aucune réduction, aucune utilisation comptée', async () => {
      const meal = await jus();
      await promo();
      const { body } = await quote(String(meal._id));
      expect(body.data).toMatchObject({ remise: 0, codePromo: '', total: 6000 });
      await call('POST', '/orders', { quote: body.data?.quote, client });
      expect((await PromoCode.findOne({ code: 'BIENVENUE10' }))!.utilisations).toBe(0);
      expect(await Order.findOne({}).lean()).toMatchObject({ remise: 0, codePromo: '', total: 6000 });
    });

    it.each([
      ['inconnu', 'NEXISTEPAS', /Code promo invalide/],
      ['expiré', 'PASSE', /expiré/],
      ['épuisé', 'FINI', /épuisé/],
    ])('code %s au devis : 400 avec le motif, aucun devis signé', async (_label, code, message) => {
      const meal = await jus();
      await promo({ code: 'PASSE', expiry: new Date(Date.now() - DAY) });
      await promo({ code: 'FINI', maxUtilisations: 1, utilisations: 1 });
      const { status, body } = await quote(String(meal._id), code);
      expect(status).toBe(400);
      expect(body.message).toMatch(message);
      expect(body.data).toBeUndefined();
    });

    it('code à usage unique : le premier panier le consomme, le second ne peut plus le DEVISER', async () => {
      const meal = await jus();
      await promo({ code: 'UNIQUE', maxUtilisations: 1 });
      const first = await quote(String(meal._id), 'UNIQUE', 'ORDER-A');
      await call('POST', '/orders', { quote: first.body.data?.quote, client });
      await vi.waitFor(async () => expect((await PromoCode.findOne({ code: 'UNIQUE' }))!.utilisations).toBe(1));
      const second = await quote(String(meal._id), 'UNIQUE', 'ORDER-B');
      expect(second.status).toBe(400);
      expect(second.body.message).toMatch(/épuisé/);
    });

    it('deux devis faits AVANT l\'épuisement : les deux commandes sont honorées, l\'utilisation n\'est comptée qu\'une fois', async () => {
      const meal = await jus();
      await promo({ code: 'UNIQUE', maxUtilisations: 1 });
      const a = await quote(String(meal._id), 'UNIQUE', 'ORDER-A');
      const b = await quote(String(meal._id), 'UNIQUE', 'ORDER-B');
      const [ra, rb] = await Promise.all([
        call('POST', '/orders', { quote: a.body.data?.quote, client }),
        call('POST', '/orders', { quote: b.body.data?.quote, client }),
      ]);
      expect([ra.status, rb.status]).toEqual([201, 201]);
      await vi.waitFor(async () => expect(await Order.countDocuments({ codePromo: 'UNIQUE' })).toBe(2));
      expect((await PromoCode.findOne({ code: 'UNIQUE' }))!.utilisations).toBe(1);   // jamais au-delà du plafond
    });

    it('un devis falsifié (remise gonflée) est refusé : le total ne peut pas être modifié', async () => {
      const meal = await jus();
      await promo();
      const { body } = await quote(String(meal._id), 'BIENVENUE10');
      const [h, p, s] = String(body.data?.quote).split('.');
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
      payload.remise = 3900; payload.total = 2100;
      const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
      const res = await call('POST', '/orders', { quote: forged, client });
      expect(res.status).toBe(400);
      expect(await Order.countDocuments()).toBe(0);
    });
  });

  describe('consommation', () => {
    it('plafond respecté sous charge : 10 consommations simultanées d\'un code à 3 utilisations n\'en comptent que 3', async () => {
      await promo({ code: 'TROIS', maxUtilisations: 3 });
      const results = await Promise.all(Array.from({ length: 10 }, () => consumePromo('TROIS')));
      expect(results.filter(Boolean)).toHaveLength(3);
      expect((await PromoCode.findOne({ code: 'TROIS' }))!.utilisations).toBe(3);
    });

    it('code inconnu ou désactivé : false', async () => {
      await promo({ code: 'OFF', active: false });
      expect(await consumePromo('OFF')).toBe(false);
      expect(await consumePromo('NEXISTEPAS')).toBe(false);
    });
  });

  describe('création d\'un code par l\'équipe', () => {
    const create = (body: Record<string, unknown>) => call('POST', '/promotions/codes', body);

    it('code valide : créé', async () => {
      const res = await create({ code: 'ETE-2026', reduction: 15, typeReduction: 'pourcentage', minCommande: 0, maxUtilisations: 50, expiry: null, active: true });
      expect(res.status).toBe(201);
    });

    it.each([
      ['pourcentage supérieur à 100', { code: 'ABC', reduction: 150, typeReduction: 'pourcentage' }],
      ['réduction nulle', { code: 'ABC', reduction: 0, typeReduction: 'fixe' }],
      ['réduction qui n\'est pas un nombre', { code: 'ABC', reduction: '10', typeReduction: 'fixe' }],
      ['code trop court', { code: 'AB', reduction: 10, typeReduction: 'fixe' }],
      ['code avec espaces ou symboles', { code: 'MON CODE!', reduction: 10, typeReduction: 'fixe' }],
      ['type inconnu', { code: 'ABC', reduction: 10, typeReduction: 'cadeau' }],
      ['utilisations à 0', { code: 'ABC', reduction: 10, typeReduction: 'fixe', maxUtilisations: 0 }],
      ['date d\'expiration illisible', { code: 'ABC', reduction: 10, typeReduction: 'fixe', expiry: 'demain' }],
      ['sans code', { reduction: 10, typeReduction: 'fixe' }],
    ])('%s : 400, rien n\'est créé', async (_label, body) => {
      expect((await create(body)).status).toBe(400);
      expect(await PromoCode.countDocuments()).toBe(0);
    });
  });
});
