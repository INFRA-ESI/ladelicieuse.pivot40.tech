// Ordre des suggestions du chef contre une VRAIE base MongoDB. Ignoré tant que MONGO_TEST_URI n'est pas défini.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const uri = process.env.MONGO_TEST_URI;
const { default: Suggestion } = await import('../../models/Suggestion.model.js');
const { normalizeOrder, nextPosition, reorder, setPinned, sortSuggestions, SuggestionOrderError } = await import('../../services/suggestionOrder.js');

const make = (nom: string, type: 'crudites' | 'fruits' = 'crudites', extra: Record<string, unknown> = {}) =>
  Suggestion.create({ nom, description: nom, type, ...extra });
const names = async (type: 'crudites' | 'fruits' = 'crudites') => sortSuggestions(await Suggestion.find({ type }).lean()).map(s => s.nom);
const day = (n: number) => new Date(2026, 0, n);

describe.skipIf(!uri)('intégration MongoDB — ordre des suggestions du chef', () => {
  beforeAll(async () => { await mongoose.connect(uri as string, { dbName: `ld_sugg_${Date.now()}` }); await Suggestion.init(); });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => { await Suggestion.deleteMany({}); });

  // Anciennes suggestions : pas de position, la plus récente s'affichait en premier.
  const seedLegacy = async () => {
    await Suggestion.collection.insertMany([
      { nom: 'Ancienne', description: 'x', type: 'crudites', actif: true, createdAt: day(1), updatedAt: day(1) },
      { nom: 'Moyenne', description: 'x', type: 'crudites', actif: true, createdAt: day(2), updatedAt: day(2) },
      { nom: 'Récente', description: 'x', type: 'crudites', actif: true, createdAt: day(3), updatedAt: day(3) },
    ]);
  };

  it('les anciennes suggestions gardent l\'ordre affiché jusqu\'ici (la plus récente d\'abord)', async () => {
    await seedLegacy();
    expect(await names()).toEqual(['Récente', 'Moyenne', 'Ancienne']);
  });

  it('une nouvelle suggestion est ajoutée EN FIN de liste : elle ne déplace pas les autres', async () => {
    await seedLegacy();
    const position = await nextPosition('crudites');
    await make('Nouvelle', 'crudites', { ordre: position });
    expect(await names()).toEqual(['Récente', 'Moyenne', 'Ancienne', 'Nouvelle']);
    // et la suivante vient après
    await make('Encore une', 'crudites', { ordre: await nextPosition('crudites') });
    expect(await names()).toEqual(['Récente', 'Moyenne', 'Ancienne', 'Nouvelle', 'Encore une']);
  });

  it('sans ce rattrapage, la nouvelle suggestion passerait devant les anciennes (le défaut que corrige normalizeOrder)', async () => {
    await seedLegacy();
    await make('Naïve', 'crudites', { ordre: 3 });
    expect((await names())[0]).toBe('Naïve');   // une position sans les autres : elle passe devant
    await Suggestion.deleteMany({ nom: 'Naïve' });
    await normalizeOrder('crudites');
    const positions = (await Suggestion.find({}).sort({ ordre: 1 }).lean()).map(s => s.ordre);
    expect(positions).toEqual([0, 1, 2]);
  });

  it('épingler la meilleure salade : première, quels que soient les ajouts et réordonnancements ensuite', async () => {
    await seedLegacy();
    const best = (await Suggestion.findOne({ nom: 'Ancienne' }))!;
    await setPinned(String(best._id), true);
    expect((await names())[0]).toBe('Ancienne');

    await make('Nouvelle 1', 'crudites', { ordre: await nextPosition('crudites') });
    await make('Nouvelle 2', 'crudites', { ordre: await nextPosition('crudites') });
    expect((await names())[0]).toBe('Ancienne');

    // même si l'équipe place une autre suggestion « en premier » dans la liste
    const all = (await Suggestion.find({ type: 'crudites' }).lean()).map(s => String(s._id));
    await reorder('crudites', [...all].reverse());
    expect((await names())[0]).toBe('Ancienne');
  });

  it('une seule meilleure salade par type : en épingler une autre retire l\'épingle de la précédente', async () => {
    const a = await make('A');
    const b = await make('B');
    const fruit = await make('Fruit', 'fruits');
    await setPinned(String(fruit._id), true);
    await setPinned(String(a._id), true);
    await setPinned(String(b._id), true);
    expect((await Suggestion.find({ type: 'crudites', epinglee: true }).lean()).map(s => s.nom)).toEqual(['B']);
    expect((await Suggestion.findById(fruit._id))!.epinglee).toBe(true);   // l'autre type n'est pas touché
  });

  it('désépingler : la suggestion garde sa place, aucune autre ne la dépasse', async () => {
    await seedLegacy();
    const best = (await Suggestion.findOne({ nom: 'Ancienne' }))!;
    await setPinned(String(best._id), true);
    await setPinned(String(best._id), false);
    expect((await names())[0]).toBe('Ancienne');
  });

  it('épingler une suggestion inconnue : 404', async () => {
    const error = await setPinned(String(new mongoose.Types.ObjectId()), true).catch(e => e);
    expect(error).toBeInstanceOf(SuggestionOrderError);
    expect(error.status).toBe(404);
  });

  it('réordonner : l\'ordre demandé est celui de la liste publique', async () => {
    const a = await make('A', 'crudites', { ordre: 0 });
    const b = await make('B', 'crudites', { ordre: 1 });
    const c = await make('C', 'crudites', { ordre: 2 });
    await reorder('crudites', [String(c._id), String(a._id), String(b._id)]);
    expect(await names()).toEqual(['C', 'A', 'B']);
  });

  it('réordonner refuse une liste incomplète, avec doublon ou avec un intrus : rien ne bouge', async () => {
    const a = await make('A', 'crudites', { ordre: 0 });
    const b = await make('B', 'crudites', { ordre: 1 });
    const fruit = await make('Fruit', 'fruits', { ordre: 0 });
    for (const ids of [[String(a._id)], [String(a._id), String(a._id)], [String(a._id), String(b._id), String(fruit._id)], [String(a._id), String(new mongoose.Types.ObjectId())]]) {
      await expect(reorder('crudites', ids)).rejects.toBeInstanceOf(SuggestionOrderError);
    }
    expect(await names()).toEqual(['A', 'B']);
  });

  it('les deux types ont chacun leur ordre', async () => {
    await make('C1', 'crudites', { ordre: 0 });
    await make('F1', 'fruits', { ordre: 0 });
    await make('F2', 'fruits', { ordre: 1 });
    expect(await nextPosition('fruits')).toBe(2);
    expect(await nextPosition('crudites')).toBe(1);
  });

  it('normalizeOrder est sans effet quand les positions sont déjà bonnes', async () => {
    await make('A', 'crudites', { ordre: 0 });
    await make('B', 'crudites', { ordre: 1 });
    await normalizeOrder('crudites');
    await normalizeOrder('crudites');
    expect(await names()).toEqual(['A', 'B']);
  });
});
