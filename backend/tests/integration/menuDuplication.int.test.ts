// Réutilisation d'un menu du jour contre une VRAIE base MongoDB (index uniques, copies, concurrence).
// Ignoré tant que MONGO_TEST_URI n'est pas défini (voir db.int.test.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const uri = process.env.MONGO_TEST_URI;
const { default: Meal } = await import('../../models/Meal.model.js');
const { default: DailyMenu } = await import('../../models/DailyMenu.model.js');
const { duplicateMenu, MenuDuplicationError, MAX_TARGETS } = await import('../../services/menuDuplication.js');

// « Aujourd'hui » figé : mercredi 11 novembre 2026, 14 h à Libreville.
const NOW = new Date('2026-11-11T13:00:00Z');
const SOURCE = '2026-11-11';
const D1 = '2026-11-14';
const D2 = '2026-11-15';

const seedSource = async () => {
  const meals = await Meal.create([
    { nom: 'Poulet braisé', categorie: 'Plats chauds', prix: 3500, date: SOURCE, slug: 'poulet-braise', description: 'Avec plantain',
      ingredients: [{ nom: 'Poulet', quantite: 200, unite: 'g' }], formats: [{ label: 'Grand', prix: 4500 }], nutrition: { calories: 520 }, popular: true },
    { nom: 'Salade fraîcheur', categorie: 'Salades', prix: 2500, date: SOURCE, slug: 'salade-fraicheur', disponible: false },
  ]);
  await DailyMenu.create({ date: SOURCE, repas: meals.map(m => m._id), published: true });
  return meals;
};

describe.skipIf(!uri)('intégration MongoDB — réutiliser un menu du jour', () => {
  beforeAll(async () => {
    await mongoose.connect(uri as string, { dbName: `ld_menu_${Date.now()}` });
    await Promise.all([Meal.init(), DailyMenu.init()]);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await Promise.all([Meal.deleteMany({}), DailyMenu.deleteMany({})]);
    vi.restoreAllMocks();
  });

  describe('copie indépendante', () => {
    it('crée de NOUVEAUX repas pour la date cible (autres _id, autres slugs), contenu identique, source intacte', async () => {
      const source = await seedSource();
      const result = await duplicateMenu({ source: SOURCE, targets: [D1] }, NOW);
      expect(result.created).toEqual([{ date: D1, meals: 2, published: false }]);

      const copies = await Meal.find({ date: D1 }).sort({ nom: -1 }).lean();
      expect(copies).toHaveLength(2);
      const poulet = copies.find(c => c.nom === 'Poulet braisé')!;
      expect(String(poulet._id)).not.toBe(String(source[0]._id));
      expect(poulet.slug).not.toBe('poulet-braise');
      expect(poulet).toMatchObject({ prix: 3500, description: 'Avec plantain', popular: true, date: D1 });
      expect(poulet.ingredients[0]).toMatchObject({ nom: 'Poulet', quantite: 200 });
      expect(poulet.formats[0]).toMatchObject({ label: 'Grand', prix: 4500 });
      expect(poulet.nutrition.calories).toBe(520);
      // l'indisponibilité est copiée telle quelle
      expect(copies.find(c => c.nom === 'Salade fraîcheur')!.disponible).toBe(false);

      // la source n'a pas bougé
      const sourceAfter = await Meal.find({ date: SOURCE }).lean();
      expect(sourceAfter.map(m => String(m._id)).sort()).toEqual(source.map(m => String(m._id)).sort());
      expect(await DailyMenu.findOne({ date: SOURCE })).toMatchObject({ published: true });
    });

    it('modifier la copie ne modifie PAS la source, et inversement', async () => {
      const source = await seedSource();
      await duplicateMenu({ source: SOURCE, targets: [D1] }, NOW);
      const copy = (await Meal.findOne({ date: D1, nom: 'Poulet braisé' }))!;

      await Meal.updateOne({ _id: copy._id }, { $set: { nom: 'Poulet du dimanche', prix: 5000 } });
      expect(await Meal.findById(source[0]._id)).toMatchObject({ nom: 'Poulet braisé', prix: 3500 });

      await Meal.updateOne({ _id: source[0]._id }, { $set: { prix: 999 } });
      expect(await Meal.findById(copy._id)).toMatchObject({ nom: 'Poulet du dimanche', prix: 5000 });
    });

    it('supprimer un repas de la source ne supprime pas la copie, et le menu de la copie reste valide', async () => {
      const source = await seedSource();
      await duplicateMenu({ source: SOURCE, targets: [D1] }, NOW);
      await Meal.deleteMany({ date: SOURCE });
      await DailyMenu.deleteOne({ date: SOURCE });
      expect(await Meal.countDocuments({ date: D1 })).toBe(2);
      const menu = await DailyMenu.findOne({ date: D1 }).populate('repas');
      expect(menu!.repas).toHaveLength(2);
      expect(source).toHaveLength(2);
    });

    it('le menu de la cible liste exactement ses propres repas, en brouillon par défaut, avec son origine', async () => {
      await seedSource();
      await duplicateMenu({ source: SOURCE, targets: [D1] }, NOW);
      const menu = (await DailyMenu.findOne({ date: D1 }).lean())!;
      const copyIds = (await Meal.find({ date: D1 }).lean()).map(m => String(m._id)).sort();
      expect(menu.repas.map(String).sort()).toEqual(copyIds);
      expect(menu).toMatchObject({ published: false, copiedFrom: SOURCE });
    });

    it('plusieurs dates d\'un coup, publiées : chaque date a ses propres repas', async () => {
      await seedSource();
      const result = await duplicateMenu({ source: SOURCE, targets: [D1, D2, D1], published: true }, NOW);
      expect(result.created.map(c => c.date)).toEqual([D1, D2]); // doublon dans la demande ignoré
      expect(await Meal.countDocuments({ date: D1 })).toBe(2);
      expect(await Meal.countDocuments({ date: D2 })).toBe(2);
      const ids1 = (await Meal.find({ date: D1 })).map(m => String(m._id));
      const ids2 = (await Meal.find({ date: D2 })).map(m => String(m._id));
      expect(ids1.some(id => ids2.includes(id))).toBe(false);
      expect(await DailyMenu.countDocuments({ published: true })).toBe(3); // la source + 2 copies
    });

    it('les slugs restent uniques même avec des noms identiques et des copies répétées', async () => {
      await Meal.create([
        { nom: 'Jus', categorie: 'Jus', prix: 1000, date: SOURCE, slug: 'jus' },
        { nom: 'Jus', categorie: 'Jus', prix: 1200, date: SOURCE, slug: 'jus-1' },
      ]);
      await duplicateMenu({ source: SOURCE, targets: [D1, D2] }, NOW);
      const slugs = (await Meal.find({}).lean()).map(m => m.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      expect(slugs).toHaveLength(6);
    });
  });

  describe('doublons et conflits', () => {
    it('une date qui a déjà un menu enregistré : ignorée, rien n\'est modifié', async () => {
      await seedSource();
      const existing = await Meal.create({ nom: 'Menu existant', categorie: 'Plats', prix: 100, date: D1, slug: 'menu-existant' });
      await DailyMenu.create({ date: D1, repas: [existing._id], published: true });

      const result = await duplicateMenu({ source: SOURCE, targets: [D1, D2] }, NOW);
      expect(result.skipped).toEqual([{ date: D1, reason: 'Un menu existe déjà à cette date.' }]);
      expect(result.created.map(c => c.date)).toEqual([D2]);
      expect((await Meal.find({ date: D1 })).map(m => m.nom)).toEqual(['Menu existant']);
      expect(await DailyMenu.findOne({ date: D1 })).toMatchObject({ published: true });
    });

    it('une date qui a seulement des repas en brouillon (menu jamais publié) est aussi un conflit', async () => {
      await seedSource();
      await Meal.create({ nom: 'Brouillon', categorie: 'Plats', prix: 100, date: D1, slug: 'brouillon' });
      const result = await duplicateMenu({ source: SOURCE, targets: [D1] }, NOW);
      expect(result.skipped).toHaveLength(1);
      expect(await Meal.countDocuments({ date: D1 })).toBe(1);
      expect(await DailyMenu.countDocuments({ date: D1 })).toBe(0); // la réservation temporaire est levée
    });

    it('remplacement explicite : l\'ancien contenu disparaît, le nouveau le remplace, l\'état publié est conservé', async () => {
      await seedSource();
      const old = await Meal.create({ nom: 'Ancien', categorie: 'Plats', prix: 100, date: D1, slug: 'ancien' });
      await DailyMenu.create({ date: D1, repas: [old._id], published: true });

      const result = await duplicateMenu({ source: SOURCE, targets: [D1], onConflict: 'replace' }, NOW);
      expect(result.replaced).toEqual([{ date: D1, meals: 2, published: true }]);
      expect((await Meal.find({ date: D1 })).map(m => m.nom).sort()).toEqual(['Poulet braisé', 'Salade fraîcheur']);
      expect(await Meal.findById(old._id)).toBeNull();
      expect(await DailyMenu.findOne({ date: D1 })).toMatchObject({ published: true, copiedFrom: SOURCE });
    });

    it('remplacement avec publication demandée explicitement', async () => {
      await seedSource();
      const old = await Meal.create({ nom: 'Ancien', categorie: 'Plats', prix: 100, date: D1, slug: 'ancien' });
      await DailyMenu.create({ date: D1, repas: [old._id], published: true });
      await duplicateMenu({ source: SOURCE, targets: [D1], onConflict: 'replace', published: false }, NOW);
      expect(await DailyMenu.findOne({ date: D1 })).toMatchObject({ published: false });
    });

    it('deux copies simultanées vers la même date : une seule réussit, aucun doublon', async () => {
      await seedSource();
      const [a, b] = await Promise.all([
        duplicateMenu({ source: SOURCE, targets: [D1] }, NOW),
        duplicateMenu({ source: SOURCE, targets: [D1] }, NOW),
      ]);
      expect(a.created.length + b.created.length).toBe(1);
      expect(a.skipped.length + b.skipped.length).toBe(1);
      expect(await Meal.countDocuments({ date: D1 })).toBe(2);
      expect(await DailyMenu.countDocuments({ date: D1 })).toBe(1);
    });

    it('la date source dans les destinations : ignorée', async () => {
      await seedSource();
      const result = await duplicateMenu({ source: SOURCE, targets: [SOURCE, D1] }, NOW);
      expect(result.skipped).toEqual([{ date: SOURCE, reason: 'Identique à la date source.' }]);
      expect(await Meal.countDocuments({ date: SOURCE })).toBe(2);
    });
  });

  describe('échecs : retour à l\'état d\'avant, les autres dates continuent', () => {
    it('copie qui échoue : pas de menu ni de repas à moitié créés pour cette date', async () => {
      await seedSource();
      vi.spyOn(Meal, 'insertMany').mockRejectedValueOnce(new Error('base indisponible'));
      const result = await duplicateMenu({ source: SOURCE, targets: [D1, D2] }, NOW);
      expect(result.failed.map(f => f.date)).toEqual([D1]);
      expect(result.created.map(c => c.date)).toEqual([D2]);
      expect(await Meal.countDocuments({ date: D1 })).toBe(0);
      expect(await DailyMenu.countDocuments({ date: D1 })).toBe(0);
      expect(await Meal.countDocuments({ date: D2 })).toBe(2);
    });

    it('remplacement qui échoue : l\'ancien menu est intact', async () => {
      await seedSource();
      const old = await Meal.create({ nom: 'Ancien', categorie: 'Plats', prix: 100, date: D1, slug: 'ancien' });
      await DailyMenu.create({ date: D1, repas: [old._id], published: true });
      vi.spyOn(Meal, 'insertMany').mockRejectedValueOnce(new Error('base indisponible'));
      const result = await duplicateMenu({ source: SOURCE, targets: [D1], onConflict: 'replace' }, NOW);
      expect(result.failed).toHaveLength(1);
      expect((await Meal.find({ date: D1 })).map(m => m.nom)).toEqual(['Ancien']);
      expect(await DailyMenu.findOne({ date: D1 })).toMatchObject({ published: true });
    });

    it('suppression de l\'ancien contenu en échec : copies retirées, menu restauré', async () => {
      await seedSource();
      const old = await Meal.create({ nom: 'Ancien', categorie: 'Plats', prix: 100, date: D1, slug: 'ancien' });
      await DailyMenu.create({ date: D1, repas: [old._id], published: true });
      vi.spyOn(Meal, 'deleteMany').mockRejectedValueOnce(new Error('échec suppression'));
      const result = await duplicateMenu({ source: SOURCE, targets: [D1], onConflict: 'replace' }, NOW);
      expect(result.failed).toHaveLength(1);
      vi.restoreAllMocks();
      expect((await Meal.find({ date: D1 })).map(m => m.nom)).toEqual(['Ancien']);
      const menu = (await DailyMenu.findOne({ date: D1 }).lean())!;
      expect(menu.repas.map(String)).toEqual([String(old._id)]);
      expect(menu.published).toBe(true);
    });
  });

  describe('demandes refusées (rien n\'est créé)', () => {
    const refused = async (input: Record<string, unknown>, message: RegExp, status = 400) => {
      await seedSource();
      const error = await duplicateMenu(input, NOW).catch(e => e);
      expect(error).toBeInstanceOf(MenuDuplicationError);
      expect(error.status).toBe(status);
      expect(error.message).toMatch(message);
      expect(await Meal.countDocuments({ date: { $ne: SOURCE } })).toBe(0);
      expect(await DailyMenu.countDocuments({ date: { $ne: SOURCE } })).toBe(0);
    };

    it('source invalide ou impossible', () => refused({ source: '2026-02-30', targets: [D1] }, /source invalide/i));
    it('aucune destination', () => refused({ source: SOURCE, targets: [] }, /au moins une date/i));
    it('destinations qui ne sont pas une liste', () => refused({ source: SOURCE, targets: D1 }, /au moins une date/i));
    it('destination invalide', () => refused({ source: SOURCE, targets: ['demain'] }, /destination invalide/i));
    it('destination dans le passé', () => refused({ source: SOURCE, targets: ['2026-11-10'] }, /déjà passée/i));
    it('destination trop lointaine', () => refused({ source: SOURCE, targets: ['2028-01-01'] }, /trop lointaine/i));
    it('trop de destinations', () => refused({ source: SOURCE, targets: Array.from({ length: MAX_TARGETS + 1 }, (_, i) => `2026-12-${String((i % 28) + 1).padStart(2, '0')}`) }, /au plus 31/i));
    it('option de conflit inconnue', () => refused({ source: SOURCE, targets: [D1], onConflict: 'écraser' }, /conflit invalide/i));
    it('publication qui n\'est pas un booléen', () => refused({ source: SOURCE, targets: [D1], published: 'oui' }, /publication invalide/i));
    it('source sans aucun repas : 404', async () => {
      const error = await duplicateMenu({ source: '2026-11-12', targets: [D1] }, NOW).catch(e => e);
      expect(error).toBeInstanceOf(MenuDuplicationError);
      expect(error.status).toBe(404);
    });

    it('aujourd\'hui est accepté comme destination (heure de Libreville)', async () => {
      await Meal.create({ nom: 'Plat', categorie: 'Plats', prix: 100, date: '2026-11-09', slug: 'plat' });
      // 23 h 30 UTC le 11 = 00 h 30 le 12 à Libreville : « aujourd'hui » est le 12, le 11 est passé.
      const late = new Date('2026-11-11T23:30:00Z');
      const result = await duplicateMenu({ source: '2026-11-09', targets: ['2026-11-12'] }, late);
      expect(result.created).toHaveLength(1);
      await expect(duplicateMenu({ source: '2026-11-09', targets: ['2026-11-11'] }, late)).rejects.toThrow(/déjà passée/);
    });
  });
});
