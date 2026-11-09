// Tests d'intégration contre une VRAIE base MongoDB (modèles, index, requêtes et migrations réels).
// Ignorés tant que MONGO_TEST_URI n'est pas défini. Exemple :
//   docker run -d --rm -p 127.0.0.1:27099:27017 --name ld-mongo-test mongo:7
//   MONGO_TEST_URI=mongodb://127.0.0.1:27099 npm run test:backend
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { io as connectClient, type Socket } from 'socket.io-client';

process.env.JWT_SECRET = 'i'.repeat(48);
const uri = process.env.MONGO_TEST_URI;

vi.mock('../../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
// L'authentification admin est testée ailleurs : ici on laisse passer pour exercer les routes sur la vraie base.
vi.mock('../../routes/auth.routes.js', () => ({ verifyJWT: (_q: unknown, _r: unknown, next: () => void) => next() }));
vi.mock('../../services/fidelite.service.js', () => ({
  attributerPoints: vi.fn(), getHistoriqueFidelite: vi.fn(), rachatPoints: vi.fn(), calculerPointsGagnes: vi.fn(),
}));
vi.mock('../../services/whatsapp.service.js', () => ({ sendStatusNotification: vi.fn(async () => undefined), sendFideliteNotification: vi.fn(async () => undefined) }));
vi.mock('../../services/push.service.js', () => ({ sendPushToUser: vi.fn(async () => undefined) }));
vi.mock('../../services/email.service.js', () => ({
  sendOrderConfirmationEmail: vi.fn(async () => undefined),
  sendVerificationEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => undefined),
  sendPasswordResetEmail: vi.fn(async () => undefined),
}));

const Order = (await import('../../models/Order.model.js')).default;
const Transaction = (await import('../../models/Transaction.model.js')).default;
const Meal = (await import('../../models/Meal.model.js')).default;
const Ingredient = (await import('../../models/Ingredient.model.js')).default;
const Consultation = (await import('../../models/Consultation.model.js')).default;
const Category = (await import('../../models/Category.model.js')).default;
const Plan = (await import('../../models/Plan.model.js')).default;
const StockReappro = (await import('../../models/StockReappro.model.js')).default;
const Subscription = (await import('../../models/Subscription.model.js')).default;
const User = (await import('../../models/User.model.js')).default;
const { default: clientRouter } = await import('../../routes/client.routes.js');
const { default: subscriptionsRouter } = await import('../../routes/subscriptions.routes.js');
const Settings = (await import('../../models/Settings.model.js')).default;
const { default: ordersRouter } = await import('../../routes/orders.routes.js');
const { default: stocksRouter } = await import('../../routes/stocks.routes.js');
const { default: categoriesRouter } = await import('../../routes/categories.routes.js');
const { initRealtime, closeRealtime } = await import('../../services/realtime.service.js');
const { migratePlansToWeekly, migrateConsultationsPresentielPrice, migrateOrderNumbersToLdd, backfillMealNutrition } = await import('../../services/migrations.service.js');

const app = express();
app.use(express.json());
app.use('/orders', ordersRouter);
app.use('/stocks', stocksRouter);
app.use('/categories', categoriesRouter);
app.use('/subscriptions', subscriptionsRouter);
app.use('/client', clientRouter);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let ip = 0;
const call = (method: string, path: string, body?: unknown) =>
  fetch(`${base()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.3.0.${++ip}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as { success: boolean; message?: string; data?: Record<string, unknown> };

describe.skipIf(!uri)('intégration MongoDB', () => {
  beforeAll(async () => {
    await mongoose.connect(uri as string, { dbName: `ld_test_${Date.now()}` });
    // Les index uniques (refPaiement, nom de catégorie…) doivent exister pour tester les doublons.
    await Promise.all([Order, Category, Transaction, Meal, Ingredient, Subscription].map(m => m.init()));
  });

  afterAll(async () => {
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all(
      [Order, Transaction, Meal, Ingredient, Consultation, Category, Plan, StockReappro, Settings, Subscription].map(m => m.deleteMany({})),
    );
  });

  // ── Commande : devis → paiement → commande, avec les vrais modèles ────────────────────────────
  describe('commande', () => {
    const seedCatalogue = async () => {
      const jus = await Meal.create({ nom: 'Jus détox', categorie: 'Jus Détox', prix: 2000, prixPromo: 1800 });
      const laitue = await Ingredient.create({ nom: 'Laitue', categorie: 'Bases', stock: 50, prixAchat: 100, prixVente: 300 });
      return { jus, laitue };
    };
    const quoteFor = async (jusId: string, overrides: Record<string, unknown> = {}) => {
      const res = await call('POST', '/orders/quote', {
        orderId: 'ORDER-INT-1', modeCommande: 'sur_place', fraisLivraison: 0,
        items: [{ nom: 'Jus détox', qty: 2, prix: 2000, ref: { type: 'jus', id: jusId } }],
        ...overrides,
      });
      return { status: res.status, body: await json(res) };
    };
    const client = { nom: 'Awa', telephone: '077000000' };

    it('un devis valide donne une commande enregistrée aux prix du catalogue, avec un vrai numéro', async () => {
      const { jus } = await seedCatalogue();
      const { body } = await quoteFor(String(jus._id));
      const created = await call('POST', '/orders', { quote: body.data?.quote, client, modePaiement: 'especes', items: [{ nom: 'x', qty: 1, prix: 1 }] });
      expect(created.status).toBe(201);

      const order = await Order.findOne({ refPaiement: 'ORDER-INT-1' }).lean();
      expect(order).toMatchObject({ total: 4000, statut: 'en_attente', numero: 'LDD-0001', paiementVerifie: false });
      expect(order?.items[0]).toMatchObject({ nom: 'Jus détox', qty: 2, prix: 2000 });
    });

    it('refuse à la fois un prix à 0 et un produit supprimé, sans créer de commande', async () => {
      const { jus } = await seedCatalogue();
      expect((await quoteFor(String(jus._id), { items: [{ nom: 'Jus', qty: 1, prix: 0, ref: { type: 'jus', id: String(jus._id) } }] })).status).toBe(400);
      await Meal.deleteOne({ _id: jus._id });
      expect((await quoteFor(String(jus._id))).status).toBe(400);
      expect(await Order.countDocuments()).toBe(0);
    });

    it('un renvoi du même devis ne crée pas de doublon (index unique réel)', async () => {
      const { jus } = await seedCatalogue();
      const { body } = await quoteFor(String(jus._id));
      const first = await call('POST', '/orders', { quote: body.data?.quote, client });
      const second = await call('POST', '/orders', { quote: body.data?.quote, client });
      expect([first.status, second.status]).toEqual([201, 200]);
      expect(await Order.countDocuments()).toBe(1);
    });

    it('deux envois SIMULTANÉS du même devis donnent une seule commande, les deux réponses réussissent', async () => {
      const { jus } = await seedCatalogue();
      const { body } = await quoteFor(String(jus._id));
      const results = await Promise.all([
        call('POST', '/orders', { quote: body.data?.quote, client }),
        call('POST', '/orders', { quote: body.data?.quote, client }),
        call('POST', '/orders', { quote: body.data?.quote, client }),
      ]);
      expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
      expect(await Order.countDocuments()).toBe(1);
    });

    it('marque le paiement comme vérifié seulement s’il existe une transaction réussie du bon montant', async () => {
      const { jus } = await seedCatalogue();
      const { body } = await quoteFor(String(jus._id));
      await Transaction.create({ transactionId: 'T1', idempotencyKey: 'k1', orderId: 'ORDER-INT-1', provider: 'card', status: 'success', amount: 4000 });
      await call('POST', '/orders', { quote: body.data?.quote, client, modePaiement: 'carte' });
      expect((await Order.findOne().lean())?.paiementVerifie).toBe(true);
    });

    it('ignore une transaction trop faible ou en attente', async () => {
      const { jus } = await seedCatalogue();
      const { body } = await quoteFor(String(jus._id));
      await Transaction.create({ transactionId: 'T2', idempotencyKey: 'k2', orderId: 'ORDER-INT-1', provider: 'card', status: 'success', amount: 1 });
      await Transaction.create({ transactionId: 'T3', idempotencyKey: 'k3', orderId: 'ORDER-INT-1', provider: 'airtel', status: 'pending', amount: 9999 });
      await Transaction.create({ transactionId: 'T4', idempotencyKey: 'k4', orderId: 'ORDER-INT-1', provider: 'cash', status: 'success', amount: 9999 });
      await call('POST', '/orders', { quote: body.data?.quote, client, modePaiement: 'carte' });
      expect((await Order.findOne().lean())?.paiementVerifie).toBe(false);
    });

    it('valide les frais de livraison contre les zones enregistrées en base', async () => {
      const { jus } = await seedCatalogue();
      await Settings.create({ zonesLivraison: [{ label: 'Libreville', keywords: [], frais: 2000, group: 'Libreville' }] });
      const ok = await quoteFor(String(jus._id), { modeCommande: 'livraison', fraisLivraison: 2000 });
      const faux = await quoteFor(String(jus._id), { modeCommande: 'livraison', fraisLivraison: 1500 });
      expect([ok.status, faux.status]).toEqual([200, 400]);
    });

    it('refuse une livraison à 0 FCFA mais accepte les frais de la zone', async () => {
      const { jus } = await seedCatalogue();
      await Settings.create({ zonesLivraison: [{ label: 'Libreville', keywords: [], frais: 2000, group: 'Libreville' }] });
      expect((await quoteFor(String(jus._id), { modeCommande: 'livraison', fraisLivraison: 0 })).status).toBe(400);
      expect((await quoteFor(String(jus._id), { modeCommande: 'livraison', fraisLivraison: 2000 })).status).toBe(200);
    });

    it('valide une consultation selon le mode choisi', async () => {
      const c = await Consultation.create({ titre: 'Perte de poids', description: 'x', prix: 15000, prixPresentiel: 25000, duree: '60 min' });
      const bon = await quoteFor('', { items: [{ nom: 'Consultation', qty: 1, prix: 25000, ref: { type: 'consultation', id: String(c._id), mode: 'presentiel' } }] });
      const faux = await quoteFor('', { items: [{ nom: 'Consultation', qty: 1, prix: 15000, ref: { type: 'consultation', id: String(c._id), mode: 'presentiel' } }] });
      expect([bon.status, faux.status]).toEqual([200, 400]);
    });
  });

  // ── Abonnement : devis → enregistrement, avec les vrais modèles et index ──────────────────────────
  describe('abonnement', () => {
    const seedPlan = async () => {
      const res = await Plan.collection.insertOne({ nom: 'Vitalité', description: 'x', prixHebdo: 14100, prixMensuel: 45000, features: [], actif: true });
      return String(res.insertedId);
    };
    const quoteSub = async (planId: string, billing = 'monthly', orderId = 'SUB-INT-1') => {
      const res = await call('POST', '/subscriptions/quote', { orderId, planId, billing });
      return { status: res.status, body: await json(res) };
    };
    const client = { clientNom: 'Awa', clientEmail: 'awa@example.com', clientTelephone: '077000000' };

    it('le devis fixe le prix depuis le plan en base ; un plan inconnu est refusé', async () => {
      const planId = await seedPlan();
      expect((await quoteSub(planId, 'monthly')).body.data?.total).toBe(45000);
      expect((await quoteSub(planId, 'weekly')).body.data?.total).toBe(14100);
      expect((await quoteSub(String(new mongoose.Types.ObjectId()))).status).toBe(400);
    });

    it('en espèces : abonnement « en_attente » enregistré au prix du plan, même si le corps annonce autre chose', async () => {
      const { body } = await quoteSub(await seedPlan());
      const res = await call('POST', '/subscriptions', { ...client, quote: body.data?.quote, modePaiement: 'especes', price: 1, statut: 'active' });
      expect(res.status).toBe(201);
      const sub = await Subscription.findOne({ refPaiement: 'SUB-INT-1' }).lean();
      expect(sub).toMatchObject({ statut: 'en_attente', price: 45000, planName: 'Vitalité', billing: 'monthly', paiementVerifie: false });
    });

    it('avec un paiement en ligne réussi du bon montant : « active »', async () => {
      const { body } = await quoteSub(await seedPlan());
      await Transaction.create({ transactionId: 'TS1', idempotencyKey: 'ks1', orderId: 'SUB-INT-1', provider: 'airtel', status: 'success', amount: 45000 });
      await call('POST', '/subscriptions', { ...client, quote: body.data?.quote, modePaiement: 'mobile_money' });
      expect((await Subscription.findOne().lean())?.statut).toBe('active');
    });

    it('trois envois SIMULTANÉS du même devis donnent un seul abonnement', async () => {
      const { body } = await quoteSub(await seedPlan());
      const results = await Promise.all([1, 2, 3].map(() => call('POST', '/subscriptions', { ...client, quote: body.data?.quote, modePaiement: 'especes' })));
      expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
      expect(await Subscription.countDocuments()).toBe(1);
    });

    it('un devis de commande ne crée pas d’abonnement, et un devis d’abonnement ne crée pas de commande', async () => {
      const planId = await seedPlan();
      const meal = await Meal.create({ nom: 'Jus', categorie: 'Jus', prix: 2000 });
      const orderQuote = (await json(await call('POST', '/orders/quote', {
        orderId: 'ORDER-X', modeCommande: 'sur_place', fraisLivraison: 0,
        items: [{ nom: 'Jus', qty: 1, prix: 2000, ref: { type: 'jus', id: String(meal._id) } }],
      }))).data?.quote;
      expect((await call('POST', '/subscriptions', { ...client, quote: orderQuote })).status).toBe(400);

      const subQuote = (await quoteSub(planId)).body.data?.quote;
      expect((await call('POST', '/orders', { quote: subQuote, client: { nom: 'Awa', telephone: '077000000' } })).status).toBe(400);
      expect(await Subscription.countDocuments()).toBe(0);
      expect(await Order.countDocuments()).toBe(0);
    });
  });

  // ── Réapprovisionnement : bulkWrite réel ─────────────────────────────────────────────────────
  describe('réapprovisionnement', () => {
    const seedReappro = async () => {
      const a = await Ingredient.create({ nom: 'Riz', categorie: 'Bases', stock: 5, prixAchat: 1, prixVente: 2 });
      const b = await Ingredient.create({ nom: 'Poulet', categorie: 'Protéines', stock: 10, prixAchat: 1, prixVente: 2 });
      const reappro = await StockReappro.create({
        fournisseurId: new mongoose.Types.ObjectId(), fournisseur: 'Marché', statut: 'envoyee',
        articles: [
          { ingredientId: a._id, nom: 'Riz', quantiteCommandee: 20, prixUnitaire: 10 },
          { ingredientId: b._id, nom: 'Poulet', quantiteCommandee: 8, prixUnitaire: 10 },
        ],
      });
      return { a, b, reappro };
    };

    it('incrémente tous les stocks reçus en une opération', async () => {
      const { a, b, reappro } = await seedReappro();
      const res = await call('PATCH', `/stocks/reappro/${reappro._id}/status`, {
        statut: 'recue',
        articles: [{ ingredientId: String(a._id), quantiteRecue: 20 }, { ingredientId: String(b._id), quantiteRecue: 8 }],
      });
      expect(res.status).toBe(200);
      expect((await Ingredient.findById(a._id).lean())?.stock).toBe(25);
      expect((await Ingredient.findById(b._id).lean())?.stock).toBe(18);
    });

    it('n’applique AUCUN stock si un identifiant est invalide (avant : réception à moitié appliquée)', async () => {
      const { a, reappro } = await seedReappro();
      const res = await call('PATCH', `/stocks/reappro/${reappro._id}/status`, {
        statut: 'recue',
        articles: [{ ingredientId: String(a._id), quantiteRecue: 20 }, { ingredientId: 'pas-un-id', quantiteRecue: 8 }],
      });
      expect(res.status).toBe(400);
      expect((await Ingredient.findById(a._id).lean())?.stock).toBe(5);
    });
  });

  // ── Catégories : renommage, fusion, doublons ─────────────────────────────────────────────────
  describe('catégories', () => {
    it('un renommage se propage aux ingrédients et aux plats', async () => {
      const cat = await Category.create({ nom: 'Sauces' });
      await Ingredient.create({ nom: 'Vinaigrette', categorie: 'Sauces', stock: 5, prixAchat: 1, prixVente: 2 });
      await Meal.create({ nom: 'Plat', categorie: 'Sauces', categorieId: cat._id, prix: 1000 });
      const res = await call('PATCH', `/categories/${cat._id}`, { nom: 'Sauces et pain' });
      expect(res.status).toBe(200);
      expect((await Ingredient.findOne().lean())?.categorie).toBe('Sauces et pain');
      expect((await Meal.findOne().lean())?.categorie).toBe('Sauces et pain');
    });

    it('refuse une catégorie dont le nom est trop proche d’une existante', async () => {
      await Category.create({ nom: 'Sauce et pain' });
      const res = await call('POST', '/categories', { nom: 'Sauces et Pains' });
      expect(res.status).toBe(409);
      expect(await Category.countDocuments()).toBe(1);
    });

    it('la fusion rattache ingrédients et plats à la catégorie conservée, puis supprime l’autre', async () => {
      const garde = await Category.create({ nom: 'Sauces et pain' });
      const doublon = await Category.create({ nom: 'Sauces' });
      await Ingredient.create({ nom: 'Mayonnaise', categorie: 'Sauces', stock: 5, prixAchat: 1, prixVente: 2 });
      const res = await call('POST', `/categories/${doublon._id}/merge`, { intoId: String(garde._id) });
      expect(res.status).toBe(200);
      expect((await Ingredient.findOne().lean())?.categorie).toBe('Sauces et pain');
      expect(await Category.countDocuments()).toBe(1);
    });
  });

  // ── Migrations de démarrage : jamais exécutées contre une base avant ce test ─────────────────
  describe('migrations de démarrage', () => {
    it('plans : calcule le prix hebdomadaire manquant (25 000 → 7 800), laisse les autres, et est idempotente', async () => {
      await Plan.collection.insertOne({ nom: 'Essentiel', description: 'x', prixMensuel: 25000, prixAnnuel: 20000, features: [], actif: true });
      await Plan.collection.insertOne({ nom: 'Vitalité', description: 'x', prixMensuel: 45000, prixHebdo: 14000, features: [], actif: true });
      await migratePlansToWeekly();
      expect((await Plan.findOne({ nom: 'Essentiel' }).lean())?.prixHebdo).toBe(7800);
      expect((await Plan.findOne({ nom: 'Vitalité' }).lean())?.prixHebdo).toBe(14000);
      await migratePlansToWeekly();
      expect((await Plan.findOne({ nom: 'Essentiel' }).lean())?.prixHebdo).toBe(7800);
    });

    it('consultations : ajoute le tarif présentiel manquant sans toucher à celui déjà défini', async () => {
      await Consultation.collection.insertOne({ titre: 'Ancienne', description: 'x', prix: 15000, duree: '60 min', actif: true });
      await Consultation.collection.insertOne({ titre: 'Déjà réglée', description: 'x', prix: 15000, prixPresentiel: 30000, duree: '60 min', actif: true });
      await migrateConsultationsPresentielPrice();
      expect((await Consultation.findOne({ titre: 'Ancienne' }).lean())?.prixPresentiel).toBe(25000);
      expect((await Consultation.findOne({ titre: 'Déjà réglée' }).lean())?.prixPresentiel).toBe(30000);
    });

    it('commandes : CMD-xxxx devient LDD-xxxx (même numéro), les autres numéros sont intacts, et la migration est idempotente', async () => {
      await Order.collection.insertMany([{ numero: 'CMD-0007' }, { numero: 'CMD-0012' }, { numero: 'LDD-0003' }]);
      await migrateOrderNumbersToLdd();
      const numeros = async () => (await Order.collection.find().toArray()).map(o => o.numero).sort();
      expect(await numeros()).toEqual(['LDD-0003', 'LDD-0007', 'LDD-0012']);
      await migrateOrderNumbersToLdd();
      expect(await numeros()).toEqual(['LDD-0003', 'LDD-0007', 'LDD-0012']);
    });

    it('plats : recalcule les calories à 0 depuis les ingrédients, et ne touche pas aux autres', async () => {
      const riz = await Ingredient.create({ nom: 'Riz', categorie: 'Bases', stock: 5, prixAchat: 1, prixVente: 2, nutrition: { calories: 130 } });
      await Meal.create({
        nom: 'À corriger', categorie: 'Repas', prix: 1000, portions: 2,
        ingredients: [{ ingredientId: riz._id, nom: 'Riz', quantite: 200, unite: 'g' }],
      });
      await Meal.create({ nom: 'Déjà bon', categorie: 'Repas', prix: 1000, nutrition: { calories: 500 } });
      await backfillMealNutrition();
      expect((await Meal.findOne({ nom: 'À corriger' }).lean())?.nutrition.calories).toBe(130); // 130×2 / 2 portions
      expect((await Meal.findOne({ nom: 'Déjà bon' }).lean())?.nutrition.calories).toBe(500);
    });
  });

  // ── Temps réel de bout en bout : vraies routes, vraie base, vrais sockets ─────────────────────
  describe('temps réel de bout en bout', () => {
    const sockets: Socket[] = [];
    const secret = process.env.JWT_SECRET as string;
    // De vrais identifiants de compte (ObjectId), comme ceux des jetons clients émis par le serveur.
    const CLIENT_A = 'a'.repeat(24);
    const CLIENT_B = 'b'.repeat(24);
    const tokenOf = (role: 'admin' | 'client', id: string) => jwt.sign({ id, role }, secret, { expiresIn: '1h' });
    const wait = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

    beforeAll(() => { initRealtime(server, { isOriginAllowed: () => true }); });
    afterAll(() => { for (const s of sockets) s.close(); closeRealtime(); });

    async function open(token: string): Promise<Socket> {
      const socket = connectClient(base(), { path: '/socket.io', transports: ['websocket'], reconnection: false, forceNew: true, auth: { token } });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });
      return socket;
    }
    const listen = (socket: Socket, ...events: string[]) => {
      const recus: Array<{ event: string; payload: Record<string, unknown> }> = [];
      for (const event of events) socket.on(event, payload => recus.push({ event, payload }));
      return recus;
    };
    const as = (token: string | null, method: string, path: string, body?: unknown) =>
      fetch(`${base()}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.0.${++ip}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const EVENTS = ['order:created', 'order:status', 'order:updated', 'subscription:created', 'subscription:updated'];
    const commande = { nom: 'Awa', telephone: '077000000' };

    async function seedOrder(token: string | null, orderId = 'ORDER-RT-1') {
      const jus = await Meal.create({ nom: 'Jus détox', categorie: 'Jus Détox', prix: 2000 });
      const quote = await json(await as(null, 'POST', '/orders/quote', {
        orderId, modeCommande: 'sur_place', fraisLivraison: 0,
        items: [{ nom: 'Jus détox', qty: 1, prix: 2000, ref: { type: 'jus', id: String(jus._id) } }],
      }));
      const res = await as(token, 'POST', '/orders', { quote: quote.data?.quote, client: commande, modePaiement: 'especes' });
      return { res, quote: quote.data?.quote as string };
    }

    it("création : l'équipe est prévenue avec le vrai numéro ; le client et un autre compte ne reçoivent rien", async () => {
      const admin = await open(tokenOf('admin', 'admin-1'));
      const proprietaire = await open(tokenOf('client', CLIENT_A));
      const autre = await open(tokenOf('client', CLIENT_B));
      const adminRecu = listen(admin, ...EVENTS);
      const proprietaireRecu = listen(proprietaire, ...EVENTS);
      const autreRecu = listen(autre, ...EVENTS);

      expect((await seedOrder(tokenOf('client', CLIENT_A))).res.status).toBe(201);
      await wait();

      const enBase = await Order.findOne({ refPaiement: 'ORDER-RT-1' }).lean();
      expect(adminRecu).toHaveLength(1);
      expect(adminRecu[0]).toMatchObject({ event: 'order:created', payload: { orderId: String(enBase?._id), numero: enBase?.numero, statut: 'en_attente' } });
      expect(enBase?.numero).toMatch(/^LDD-[0-9]{4}$/);
      expect(proprietaireRecu).toEqual([]);
      expect(autreRecu).toEqual([]);
    });

    it('renvoi du même devis : réponse 200 et AUCUN second signal', async () => {
      const admin = await open(tokenOf('admin', 'admin-1'));
      const adminRecu = listen(admin, 'order:created');
      const { quote } = await seedOrder(null);
      await wait();
      expect(adminRecu).toHaveLength(1);

      const replay = await as(null, 'POST', '/orders', { quote, client: commande, modePaiement: 'especes' });
      await wait();
      expect(replay.status).toBe(200);
      expect(adminRecu).toHaveLength(1);
    });

    it("changement de statut : l'équipe et le propriétaire sont prévenus, pas un autre client ; la base est DÉJÀ à jour à la réception", async () => {
      const proprietaireToken = tokenOf('client', CLIENT_A);
      await seedOrder(proprietaireToken);
      const enBase = await Order.findOne({ refPaiement: 'ORDER-RT-1' }).lean();

      const admin = await open(tokenOf('admin', 'admin-1'));
      const proprietaire = await open(proprietaireToken);
      const autre = await open(tokenOf('client', CLIENT_B));
      const statutVuALaReception: string[] = [];
      proprietaire.on('order:status', async (payload: { orderId: string }) => {
        statutVuALaReception.push((await Order.findById(payload.orderId).lean())?.statut ?? 'introuvable');
      });
      const adminRecu = listen(admin, 'order:status');
      const proprietaireRecu = listen(proprietaire, 'order:status');
      const autreRecu = listen(autre, ...EVENTS);

      const res = await as(null, 'PATCH', `/orders/${enBase?._id}/status`, { statut: 'confirmee' });
      await wait(300);

      expect(res.status).toBe(200);
      expect(adminRecu).toHaveLength(1);
      expect(proprietaireRecu).toHaveLength(1);
      expect(proprietaireRecu[0].payload).toMatchObject({ numero: enBase?.numero, statut: 'confirmee' });
      expect(statutVuALaReception).toEqual(['confirmee']);      // un rechargement à la réception voit déjà le nouvel état
      expect(autreRecu).toEqual([]);
    });

    it("commande d'invité : le changement de statut ne va qu'à l'équipe", async () => {
      await seedOrder(null);
      const enBase = await Order.findOne({ refPaiement: 'ORDER-RT-1' }).lean();
      const admin = await open(tokenOf('admin', 'admin-1'));
      const client = await open(tokenOf('client', CLIENT_A));
      const adminRecu = listen(admin, 'order:status');
      const clientRecu = listen(client, 'order:status');

      await as(null, 'PATCH', `/orders/${enBase?._id}/status`, { statut: 'prete' });
      await wait();

      expect(adminRecu).toHaveLength(1);
      expect(clientRecu).toEqual([]);
    });

    it("statut refusé par la base (valeur inconnue) : aucun signal, rien n'est enregistré", async () => {
      await seedOrder(null);
      const enBase = await Order.findOne({ refPaiement: 'ORDER-RT-1' }).lean();
      const admin = await open(tokenOf('admin', 'admin-1'));
      const adminRecu = listen(admin, ...EVENTS);

      const res = await as(null, 'PATCH', `/orders/${enBase?._id}/status`, { statut: 'offert' });
      await wait();

      expect(res.status).toBe(400);
      expect(adminRecu).toEqual([]);
      expect((await Order.findById(enBase?._id).lean())?.statut).toBe('en_attente');
    });

    it("abonnement : signal à la création puis à l'activation, réservé à l'équipe", async () => {
      const plan = await Plan.collection.insertOne({ nom: 'Vitalité', description: 'x', prixHebdo: 14100, prixMensuel: 45000, features: [], actif: true });
      const quote = await json(await as(null, 'POST', '/subscriptions/quote', { orderId: 'SUB-RT-1', planId: String(plan.insertedId), billing: 'monthly' }));
      const admin = await open(tokenOf('admin', 'admin-1'));
      const client = await open(tokenOf('client', CLIENT_A));
      const adminRecu = listen(admin, ...EVENTS);
      const clientRecu = listen(client, ...EVENTS);

      const created = await as(null, 'POST', '/subscriptions', { clientNom: 'Awa', clientEmail: 'a@b.ga', clientTelephone: '077000000', quote: quote.data?.quote, modePaiement: 'especes' });
      expect(created.status).toBe(201);
      const subId = String((await Subscription.findOne({ refPaiement: 'SUB-RT-1' }).lean())?._id);
      expect((await as(null, 'PATCH', `/subscriptions/${subId}/status`, { statut: 'active' })).status).toBe(200);
      await wait(300);

      expect(adminRecu.map(e => e.event)).toEqual(['subscription:created', 'subscription:updated']);
      expect(adminRecu[1].payload).toMatchObject({ subscriptionId: subId, statut: 'active' });
      expect(clientRecu).toEqual([]);
      // Un signal n'est jamais une preuve de paiement : ni montant, ni indicateur de paiement dans le message.
      expect(JSON.stringify(adminRecu)).not.toMatch(/paiement|45000|price|prix/i);
    });
  });

  // ── Comptes clients : règle des mots de passe (8 caractères, une majuscule, un chiffre), vraies routes et vraie base ──
  describe('comptes clients : mots de passe', () => {
    const EMAILS = ['eric.moussavou@example.com', 'etienne.nzamba@example.com', 'ancien.client@example.com', 'faible@example.com'];
    beforeEach(async () => { await User.deleteMany({ email: { $in: EMAILS } }); });

    // Une adresse IP par appel : l'inscription est limitée en débit par IP.
    const requete = (method: string, path: string, body: unknown, token?: string) =>
      fetch(`${base()}/client${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.8.0.${++ip}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
    const inscription = (email: string, password: string, extra: Record<string, unknown> = {}) =>
      requete('POST', '/register', { nom: 'MOUSSAVOU', prenoms: 'Eric', email, password, ...extra });

    it('inscription : un mot de passe sans majuscule est refusé, avec le message à corriger, et aucun compte n\'est créé', async () => {
      const res = await inscription(EMAILS[0], 'moussavou1');
      const corps = await json(res);
      expect(res.status).toBe(400);
      expect(corps.message).toMatch(/majuscule/);
      expect(await User.countDocuments({ email: EMAILS[0] })).toBe(0);
    });

    it('inscription : sans chiffre, ou trop court, est refusé aussi', async () => {
      expect((await json(await inscription(EMAILS[0], 'Moussavoux'))).message).toMatch(/chiffre/);
      expect((await json(await inscription(EMAILS[0], 'Mous1'))).message).toMatch(/8 caractères/);
      expect(await User.countDocuments({ email: EMAILS[0] })).toBe(0);
    });

    it('inscription : un mot de passe SANS caractère spécial est accepté (nouvelle règle), stocké haché', async () => {
      const res = await inscription(EMAILS[0], 'Moussavou1');
      expect(res.status).toBe(201);
      const compte = await User.findOne({ email: EMAILS[0] }).select('+password');
      expect(compte).toBeTruthy();
      expect(compte?.password).not.toBe('Moussavou1');
      expect(await compte?.comparePassword('Moussavou1')).toBe(true);
      expect(compte?.emailVerified).toBe(false);
    });

    it("inscription : une majuscule accentuée suffit (« Étienne2026 »)", async () => {
      const res = await inscription(EMAILS[1], 'Étienne2026', { prenoms: 'Étienne', nom: 'NZAMBA' });
      expect(res.status).toBe(201);
    });

    it('connexion : un mot de passe correct ET conforme à la règle ouvre la session (200, jeton)', async () => {
      await User.create({ nom: 'MOUSSAVOU', prenoms: 'Eric', email: EMAILS[2], password: 'Moussavou1', emailVerified: true, statut: 'actif' });
      const res = await requete('POST', '/login', { email: EMAILS[2], password: 'Moussavou1' });
      const corps = (await res.json()) as { token?: string };
      expect(res.status).toBe(200);
      expect(corps.token).toBeTruthy();
    });

    it("connexion : un mot de passe CORRECT mais qui ne respecte pas la règle est refusé (403), sans jeton, avec le renvoi vers « Mot de passe oublié »", async () => {
      await User.create({ nom: 'ANCIEN', prenoms: 'Client', email: EMAILS[2], password: 'abc123', emailVerified: true, statut: 'actif' });
      const res = await requete('POST', '/login', { email: EMAILS[2], password: 'abc123' });
      const corps = (await res.json()) as { token?: string; passwordWeak?: boolean; message: string };
      expect(res.status).toBe(403);
      expect(corps.passwordWeak).toBe(true);
      expect(corps.token).toBeUndefined();
      expect(corps.message).toMatch(/8 caractères/);
      expect(corps.message).toMatch(/Mot de passe oublié/);
    });

    it("connexion : un mot de passe FAUX reste une erreur d'identifiants (401), qu'il soit faible ou non", async () => {
      await User.create({ nom: 'ANCIEN', prenoms: 'Client', email: EMAILS[2], password: 'abc123', emailVerified: true, statut: 'actif' });
      for (const faux of ['Abc1234', 'zzz']) {
        const res = await requete('POST', '/login', { email: EMAILS[2], password: faux });
        expect(res.status).toBe(401);
        expect(((await res.json()) as { passwordWeak?: boolean }).passwordWeak).toBeUndefined();
      }
    });

    it('changement de mot de passe : la nouvelle règle s\'applique, et seul le nouveau mot de passe fonctionne ensuite', async () => {
      await User.create({ nom: 'ANCIEN', prenoms: 'Client', email: EMAILS[2], password: 'Ancien2026', emailVerified: true, statut: 'actif' });
      const { token } = (await (await requete('POST', '/login', { email: EMAILS[2], password: 'Ancien2026' })).json()) as { token: string };

      const faible = await requete('POST', '/change-password', { currentPassword: 'Ancien2026', newPassword: 'nouveau2026' }, token);
      expect(faible.status).toBe(400);
      expect((await json(faible)).message).toMatch(/majuscule/);
      expect((await requete('POST', '/login', { email: EMAILS[2], password: 'Ancien2026' })).status).toBe(200); // inchangé

      const ok = await requete('POST', '/change-password', { currentPassword: 'Ancien2026', newPassword: 'Nouveau2026' }, token);
      expect(ok.status).toBe(200);
      expect((await requete('POST', '/login', { email: EMAILS[2], password: 'Nouveau2026' })).status).toBe(200);
      expect((await requete('POST', '/login', { email: EMAILS[2], password: 'Ancien2026' })).status).toBe(401);
    }, 20_000); // plusieurs vérifications bcrypt (coût 12, volontairement lent)

    it('réinitialisation : un mot de passe faible est refusé SANS consommer le jeton, un bon est accepté', async () => {
      await User.create({
        nom: 'FAIBLE', prenoms: 'Client', email: EMAILS[3], password: 'abc123', emailVerified: true, statut: 'actif',
        passwordResetToken: 'jeton-de-test', passwordResetExpires: new Date(Date.now() + 60_000),
      });
      const refus = await requete('POST', '/reset-password', { token: 'jeton-de-test', password: 'sansmajuscule1' });
      expect(refus.status).toBe(400);
      expect((await User.findOne({ email: EMAILS[3] }))?.passwordResetToken).toBe('jeton-de-test'); // jeton conservé

      const ok = await requete('POST', '/reset-password', { token: 'jeton-de-test', password: 'Reinitialise1' });
      expect(ok.status).toBe(200);
      expect((await requete('POST', '/login', { email: EMAILS[3], password: 'Reinitialise1' })).status).toBe(200);
    });
  });
});
