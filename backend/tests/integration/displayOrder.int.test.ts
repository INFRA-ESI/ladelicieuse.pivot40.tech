// Ordre d'affichage des ingrédients (par catégorie) et des repas/jus du catalogue contre une VRAIE base MongoDB,
// à travers les vraies routes. Ignoré tant que MONGO_TEST_URI n'est pas défini.
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'd'.repeat(48);
const uri = process.env.MONGO_TEST_URI;

vi.mock('../../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../middleware/cache.js', () => ({ cache: () => (_q: unknown, _r: unknown, next: () => void) => next(), invalidateCache: vi.fn(async () => undefined) }));
// Contrôle d'accès équivalent au vrai : seul « Bearer admin » passe, « Bearer client » est refusé (403), sans jeton 401.
vi.mock('../../routes/auth.routes.js', () => ({
  verifyJWT: (req: { headers: { authorization?: string } }, res: { status: (c: number) => { json: (b: unknown) => void } }, next: () => void) => {
    const header = req.headers.authorization;
    if (!header) { res.status(401).json({ success: false }); return; }
    if (header !== 'Bearer admin') { res.status(403).json({ success: false }); return; }
    next();
  },
}));

const Ingredient = (await import('../../models/Ingredient.model.js')).default;
const Meal = (await import('../../models/Meal.model.js')).default;
const { default: ingredientsRouter } = await import('../../routes/ingredients.routes.js');
const { default: mealsRouter } = await import('../../routes/meals.routes.js');

const app = express();
app.use(express.json());
app.use('/ingredients', ingredientsRouter);
app.use('/meals', mealsRouter);
const server = app.listen(0);
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const call = (method: string, path: string, body?: unknown, token: string | null = 'admin') =>
  fetch(`${base()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as { success: boolean; message?: string; data?: Record<string, unknown> & unknown[] };

const ing = (nom: string, categorie: string, extra: Record<string, unknown> = {}) =>
  ({ nom, categorie, prixAchat: 100, prixVente: 300, stock: 10, ...extra });
const publicNames = async (categorie?: string) =>
  ((await json(await call('GET', `/ingredients/public${categorie ? `?categorie=${encodeURIComponent(categorie)}` : ''}`, undefined, null))).data as unknown as { nom: string; categorie: string }[]);
const mealNames = async (categorie: string) =>
  ((await json(await call('GET', '/meals?catalog=true', undefined, null))).data as unknown as { nom: string; categorie: string }[]).filter(m => m.categorie === categorie).map(m => m.nom);
const idOf = async (Model: typeof Ingredient | typeof Meal, nom: string) => String((await Model.findOne({ nom }))!._id);

describe.skipIf(!uri)('intégration MongoDB — ordre d\'affichage des ingrédients et du catalogue', () => {
  beforeAll(async () => { await mongoose.connect(uri as string, { dbName: `ld_order_${Date.now()}` }); await Promise.all([Ingredient.init(), Meal.init()]); });
  afterAll(async () => { server.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => { await Promise.all([Ingredient.deleteMany({}), Meal.deleteMany({})]); });

  describe('ingrédients', () => {
    // Anciens ingrédients : sans position, affichés par nom dans leur catégorie.
    const seedLegacy = () => Ingredient.collection.insertMany([
      { ...ing('Mangue', 'Fruits'), actif: true, usage: 'salade', createdAt: new Date(), updatedAt: new Date() },
      { ...ing('Ananas', 'Fruits'), actif: true, usage: 'salade', createdAt: new Date(), updatedAt: new Date() },
      { ...ing('Papaye', 'Fruits'), actif: true, usage: 'salade', createdAt: new Date(), updatedAt: new Date() },
      { ...ing('Vinaigrette miel', 'Sauces'), actif: true, usage: 'salade', createdAt: new Date(), updatedAt: new Date() },
      { ...ing('Vinaigrette citron', 'Sauces'), actif: true, usage: 'salade', createdAt: new Date(), updatedAt: new Date() },
    ]);

    it('avant tout réglage : l\'ordre alphabétique d\'avant est conservé dans chaque catégorie', async () => {
      await seedLegacy();
      expect((await publicNames('Fruits')).map(i => i.nom)).toEqual(['Ananas', 'Mangue', 'Papaye']);
      expect((await publicNames()).map(i => i.nom)).toEqual(['Ananas', 'Mangue', 'Papaye', 'Vinaigrette citron', 'Vinaigrette miel']);
    });

    it('épingler le plus commandé : première position de SA catégorie seulement', async () => {
      await seedLegacy();
      expect((await call('PATCH', `/ingredients/${await idOf(Ingredient, 'Papaye')}/pin`, { epinglee: true })).status).toBe(200);
      expect((await publicNames()).map(i => i.nom)).toEqual(['Papaye', 'Ananas', 'Mangue', 'Vinaigrette citron', 'Vinaigrette miel']);
    });

    it('une seule épingle par catégorie : en épingler une autre retire la précédente ; les autres catégories sont intactes', async () => {
      await seedLegacy();
      await call('PATCH', `/ingredients/${await idOf(Ingredient, 'Vinaigrette miel')}/pin`, { epinglee: true });
      await call('PATCH', `/ingredients/${await idOf(Ingredient, 'Mangue')}/pin`, { epinglee: true });
      await call('PATCH', `/ingredients/${await idOf(Ingredient, 'Papaye')}/pin`, { epinglee: true });
      expect((await Ingredient.find({ epinglee: true }).lean()).map(i => i.nom).sort()).toEqual(['Papaye', 'Vinaigrette miel']);
    });

    it('un nouvel ingrédient s\'ajoute EN FIN de sa catégorie, sans déplacer le meilleur ni les autres', async () => {
      await seedLegacy();
      await call('PATCH', `/ingredients/${await idOf(Ingredient, 'Papaye')}/pin`, { epinglee: true });
      expect((await call('POST', '/ingredients', ing('Banane', 'Fruits'))).status).toBe(201);
      expect((await call('POST', '/ingredients', ing('Avocat', 'Fruits'))).status).toBe(201);
      // ni l'ordre alphabétique d'avant (Avocat, Banane viendraient en tête), ni l'ajout ne déplacent quoi que ce soit
      expect((await publicNames('Fruits')).map(i => i.nom)).toEqual(['Papaye', 'Ananas', 'Mangue', 'Banane', 'Avocat']);
    });

    it('position et épingle envoyées à la création ou à la modification sont ignorées', async () => {
      await seedLegacy();
      await call('POST', '/ingredients', { ...ing('Goyave', 'Fruits'), ordre: 0, epinglee: true });
      const goyave = (await Ingredient.findOne({ nom: 'Goyave' }).lean())!;
      expect(goyave.epinglee).toBe(false);
      expect(goyave.ordre).toBe(3);
      await call('PATCH', `/ingredients/${goyave._id}`, { prixVente: 450, ordre: 0, epinglee: true });
      expect(await Ingredient.findById(goyave._id)).toMatchObject({ prixVente: 450, ordre: 3, epinglee: false });
    });

    it('réordonner : l\'ordre demandé est celui du composeur', async () => {
      await seedLegacy();
      const [a, m, p] = await Promise.all(['Ananas', 'Mangue', 'Papaye'].map(n => idOf(Ingredient, n)));
      expect((await call('PATCH', '/ingredients/reorder', { categorie: 'Fruits', ids: [p, a, m] })).status).toBe(200);
      expect((await publicNames('Fruits')).map(i => i.nom)).toEqual(['Papaye', 'Ananas', 'Mangue']);
    });

    it('réordonner refuse une liste incomplète, avec doublon, avec un intrus d\'une autre catégorie ou invalide', async () => {
      await seedLegacy();
      const [a, m, p, v] = await Promise.all(['Ananas', 'Mangue', 'Papaye', 'Vinaigrette miel'].map(n => idOf(Ingredient, n)));
      for (const ids of [[a, m], [a, a, m, p], [a, m, p, v], ['pas-un-id']]) {
        expect((await call('PATCH', '/ingredients/reorder', { categorie: 'Fruits', ids })).status).toBe(400);
      }
      expect((await call('PATCH', '/ingredients/reorder', { ids: [a] })).status).toBe(400);
      expect((await publicNames('Fruits')).map(i => i.nom)).toEqual(['Ananas', 'Mangue', 'Papaye']);
    });

    it('changer un ingrédient de catégorie : fin de la nouvelle catégorie, sans reprendre l\'épingle', async () => {
      await seedLegacy();
      const papaye = await idOf(Ingredient, 'Papaye');
      await call('PATCH', `/ingredients/${papaye}/pin`, { epinglee: true });
      await call('PATCH', `/ingredients/${papaye}`, { categorie: 'Sauces' });
      expect((await publicNames('Sauces')).map(i => i.nom)).toEqual(['Vinaigrette citron', 'Vinaigrette miel', 'Papaye']);
      expect((await Ingredient.findById(papaye))!.epinglee).toBe(false);
    });

    it('un ingrédient en rupture ou désactivé reste invisible, même épinglé (la règle d\'avant ne change pas)', async () => {
      await seedLegacy();
      const mangue = await idOf(Ingredient, 'Mangue');
      await call('PATCH', `/ingredients/${mangue}/pin`, { epinglee: true });
      await Ingredient.updateOne({ _id: mangue }, { $set: { stock: 0 } });
      expect((await publicNames('Fruits')).map(i => i.nom)).toEqual(['Ananas', 'Papaye']);
    });

    it('liste d\'une catégorie pour le réglage : complète (masqués inclus), dans l\'ordre affiché, catégorie exacte seulement', async () => {
      await seedLegacy();
      await Ingredient.create(ing('Noix de coco', 'Fruits secs'));
      const mangue = await idOf(Ingredient, 'Mangue');
      await call('PATCH', `/ingredients/${mangue}/pin`, { epinglee: true });
      await Ingredient.updateOne({ nom: 'Ananas' }, { $set: { actif: false } });
      const res = await json(await call('GET', '/ingredients/order?categorie=Fruits'));
      expect((res.data as unknown as { nom: string }[]).map(i => i.nom)).toEqual(['Mangue', 'Ananas', 'Papaye']);
      expect((await call('GET', '/ingredients/order')).status).toBe(400);
      expect((await call('GET', '/ingredients/order?categorie=Fruits', undefined, null)).status).toBe(401);
      expect((await call('GET', '/ingredients/order?categorie=Fruits', undefined, 'client')).status).toBe(403);
    });

    it('droits : sans session 401, client 403, aucune écriture', async () => {
      await seedLegacy();
      const id = await idOf(Ingredient, 'Mangue');
      for (const token of [null, 'client'] as const) {
        const expected = token === null ? 401 : 403;
        expect((await call('PATCH', `/ingredients/${id}/pin`, { epinglee: true }, token)).status).toBe(expected);
        expect((await call('PATCH', '/ingredients/reorder', { categorie: 'Fruits', ids: [id] }, token)).status).toBe(expected);
      }
      expect(await Ingredient.countDocuments({ epinglee: true })).toBe(0);
    });

    it('épingle invalide : valeur non booléenne 400, identifiant invalide ou inconnu 404', async () => {
      await seedLegacy();
      const id = await idOf(Ingredient, 'Mangue');
      expect((await call('PATCH', `/ingredients/${id}/pin`, { epinglee: 'oui' })).status).toBe(400);
      expect((await call('PATCH', '/ingredients/pas-un-id/pin', { epinglee: true })).status).toBe(404);
      expect((await call('PATCH', `/ingredients/${new mongoose.Types.ObjectId()}/pin`, { epinglee: true })).status).toBe(404);
    });
  });

  describe('repas et jus du catalogue', () => {
    const seedLegacy = () => Meal.collection.insertMany([
      { nom: 'Jus gingembre', slug: 'jus-gingembre', categorie: 'Jus Détox', prix: 1500, popular: false, disponible: true, date: null, createdAt: new Date(), updatedAt: new Date() },
      { nom: 'Jus ananas', slug: 'jus-ananas', categorie: 'Jus Détox', prix: 1500, popular: true, disponible: true, date: null, createdAt: new Date(), updatedAt: new Date() },
      { nom: 'Jus bissap', slug: 'jus-bissap', categorie: 'Jus Détox', prix: 1500, popular: false, disponible: true, date: null, createdAt: new Date(), updatedAt: new Date() },
      { nom: 'Omelette nature', slug: 'omelette-nature', categorie: 'Omelettes', prix: 2500, popular: false, disponible: true, date: null, createdAt: new Date(), updatedAt: new Date() },
      { nom: 'Omelette fromage', slug: 'omelette-fromage', categorie: 'Omelettes', prix: 3000, popular: false, disponible: true, date: null, createdAt: new Date(), updatedAt: new Date() },
      { nom: 'Plat du jour', slug: 'plat-du-jour', categorie: 'Jus Détox', prix: 3000, popular: false, disponible: true, date: '2026-11-12', createdAt: new Date(), updatedAt: new Date() },
    ]);
    const make = (nom: string, categorie: string, extra: Record<string, unknown> = {}) => ({ nom, categorie, prix: 1500, ...extra });

    it('avant tout réglage : populaires d\'abord puis par nom, comme avant', async () => {
      await seedLegacy();
      expect(await mealNames('Jus Détox')).toEqual(['Jus ananas', 'Jus bissap', 'Jus gingembre']);
      expect(await mealNames('Omelettes')).toEqual(['Omelette fromage', 'Omelette nature']);
    });

    it('épingler le meilleur jus : première position, le reste garde son ordre', async () => {
      await seedLegacy();
      expect((await call('PATCH', `/meals/${await idOf(Meal, 'Jus gingembre')}/pin`, { epinglee: true })).status).toBe(200);
      expect(await mealNames('Jus Détox')).toEqual(['Jus gingembre', 'Jus ananas', 'Jus bissap']);
      expect(await mealNames('Omelettes')).toEqual(['Omelette fromage', 'Omelette nature']);
    });

    it('un nouveau jus s\'ajoute en fin de catégorie ; le meilleur épinglé reste premier', async () => {
      await seedLegacy();
      await call('PATCH', `/meals/${await idOf(Meal, 'Jus bissap')}/pin`, { epinglee: true });
      await call('POST', '/meals', make('Jus de pomme', 'Jus Détox'));
      await call('POST', '/meals', make('Jus d\'orange', 'Jus Détox', { popular: true }));
      expect(await mealNames('Jus Détox')).toEqual(['Jus bissap', 'Jus ananas', 'Jus gingembre', 'Jus de pomme', 'Jus d\'orange']);
    });

    it('un repas du jour (daté) n\'a ni position ni épingle, et ne perturbe pas le catalogue', async () => {
      await seedLegacy();
      await call('POST', '/meals', make('Plat daté', 'Jus Détox', { date: '2026-11-13', ordre: 0, epinglee: true }));
      const dated = (await Meal.findOne({ nom: 'Plat daté' }).lean())!;
      expect(dated.ordre).toBeUndefined();
      expect(dated.epinglee).toBe(false);
      expect(await mealNames('Jus Détox')).toEqual(['Jus ananas', 'Jus bissap', 'Jus gingembre']);
    });

    it('épingler ou réordonner un repas daté est refusé', async () => {
      await seedLegacy();
      const dated = await idOf(Meal, 'Plat du jour');
      expect((await call('PATCH', `/meals/${dated}/pin`, { epinglee: true })).status).toBe(404);
      expect((await call('PATCH', '/meals/reorder', { categorie: 'Jus Détox', ids: [dated] })).status).toBe(400);
    });

    it('réordonner le catalogue d\'une catégorie : un ordre exact est exigé', async () => {
      await seedLegacy();
      const [g, a, b] = await Promise.all(['Jus gingembre', 'Jus ananas', 'Jus bissap'].map(n => idOf(Meal, n)));
      expect((await call('PATCH', '/meals/reorder', { categorie: 'Jus Détox', ids: [b, g, a] })).status).toBe(200);
      expect(await mealNames('Jus Détox')).toEqual(['Jus bissap', 'Jus gingembre', 'Jus ananas']);
      expect((await call('PATCH', '/meals/reorder', { categorie: 'Jus Détox', ids: [b, g] })).status).toBe(400);
      expect(await mealNames('Jus Détox')).toEqual(['Jus bissap', 'Jus gingembre', 'Jus ananas']);
    });

    it('changer de catégorie : fin de la nouvelle, sans reprendre l\'épingle', async () => {
      await seedLegacy();
      const jus = await idOf(Meal, 'Jus ananas');
      await call('PATCH', `/meals/${jus}/pin`, { epinglee: true });
      await call('PATCH', `/meals/${jus}`, { categorie: 'Omelettes' });
      expect(await mealNames('Omelettes')).toEqual(['Omelette fromage', 'Omelette nature', 'Jus ananas']);
      expect((await Meal.findById(jus))!.epinglee).toBe(false);
    });

    it('modifier un repas (prix, nom) ne touche ni à sa position ni à son épingle', async () => {
      await seedLegacy();
      const id = await idOf(Meal, 'Jus ananas');
      await call('PATCH', `/meals/${id}/pin`, { epinglee: true });
      await call('PATCH', `/meals/${id}`, { prix: 1800, ordre: 9, epinglee: false });
      expect(await Meal.findById(id)).toMatchObject({ prix: 1800, epinglee: true, ordre: 0 });
    });

    it('liste d\'une catégorie pour le réglage : catalogue seulement, indisponibles inclus, dans l\'ordre affiché', async () => {
      await seedLegacy();
      await Meal.updateOne({ nom: 'Jus bissap' }, { $set: { disponible: false } });
      await call('PATCH', `/meals/${await idOf(Meal, 'Jus gingembre')}/pin`, { epinglee: true });
      const res = await json(await call('GET', `/meals/order?categorie=${encodeURIComponent('Jus Détox')}`));
      // le « Plat du jour » daté de la même catégorie n'apparaît pas
      expect((res.data as unknown as { nom: string }[]).map(m => m.nom)).toEqual(['Jus gingembre', 'Jus ananas', 'Jus bissap']);
      expect((await call('GET', '/meals/order')).status).toBe(400);
      expect((await call('GET', '/meals/order?categorie=Omelettes', undefined, null)).status).toBe(401);
    });

    it('droits : sans session 401, client 403', async () => {
      await seedLegacy();
      const id = await idOf(Meal, 'Jus ananas');
      for (const token of [null, 'client'] as const) {
        const expected = token === null ? 401 : 403;
        expect((await call('PATCH', `/meals/${id}/pin`, { epinglee: true }, token)).status).toBe(expected);
        expect((await call('PATCH', '/meals/reorder', { categorie: 'Jus Détox', ids: [id] }, token)).status).toBe(expected);
      }
      expect(await Meal.countDocuments({ epinglee: true })).toBe(0);
    });
  });
});
