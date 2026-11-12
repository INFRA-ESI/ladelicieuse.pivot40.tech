import type { Types } from 'mongoose';
import Meal, { slugify } from '../models/Meal.model.js';
import DailyMenu from '../models/DailyMenu.model.js';
import { addDays, isRealDay, todayInBoutique } from '../utils/dates.js';
import { logger } from '../config/logger.js';

// Réutiliser le menu d'une date pour d'autres dates.
//
// Le « menu du jour » d'une date, ce sont les repas rattachés à cette date (champ `date` du repas) ; le document DailyMenu
// n'est que la liste publiée de ces repas. Réutiliser un menu, c'est donc COPIER les repas vers la nouvelle date : chaque
// date garde ses propres repas (autres _id, autres fiches), modifiables et supprimables sans toucher aux autres dates.
// Le contenu (les repas) et la programmation (la date, publié ou non) sont deux choses distinctes : on programme à la copie.

export const MAX_TARGETS = 31;
export const MAX_DAYS_AHEAD = 366;

export type OnConflict = 'skip' | 'replace';

export class MenuDuplicationError extends Error {
  constructor(message: string, public readonly status: 400 | 404 = 400) {
    super(message);
  }
}

export interface DuplicateResult {
  created:  { date: string; meals: number; published: boolean }[];
  replaced: { date: string; meals: number; published: boolean }[];
  skipped:  { date: string; reason: string }[];
  failed:   { date: string; reason: string }[];
}

// `published` absent : une nouvelle date reste en brouillon, une date remplacée garde son état de publication.
interface Parsed { source: string; targets: string[]; onConflict: OnConflict; published: boolean | undefined }

function parse(input: Record<string, unknown>, today: string): Parsed {
  const { source, targets, onConflict = 'skip', published } = input;
  if (!isRealDay(source)) throw new MenuDuplicationError('Date source invalide (format AAAA-MM-JJ).');
  if (!Array.isArray(targets) || targets.length === 0) throw new MenuDuplicationError('Choisissez au moins une date de destination.');
  if (targets.length > MAX_TARGETS) throw new MenuDuplicationError(`Au plus ${MAX_TARGETS} dates à la fois.`);
  if (onConflict !== 'skip' && onConflict !== 'replace') throw new MenuDuplicationError('Option de conflit invalide.');
  if (published !== undefined && typeof published !== 'boolean') throw new MenuDuplicationError('Option de publication invalide.');

  const limit = addDays(today, MAX_DAYS_AHEAD);
  const unique: string[] = [];
  for (const t of targets) {
    if (!isRealDay(t)) throw new MenuDuplicationError(`Date de destination invalide : ${String(t).slice(0, 20)}.`);
    if (t < today) throw new MenuDuplicationError(`${t} est déjà passée : on ne programme un menu qu'à partir d'aujourd'hui.`);
    if (t > limit) throw new MenuDuplicationError(`${t} est trop lointaine (au plus ${MAX_DAYS_AHEAD} jours).`);
    if (!unique.includes(t)) unique.push(t);
  }
  return { source, targets: unique, onConflict, published };
}

// Slug propre à chaque copie : le slug d'un repas est unique dans toute la base.
async function uniqueSlug(nom: string, taken: Set<string>): Promise<string> {
  const base = slugify(nom) || 'produit';
  let slug = base;
  let n = 0;
  while (taken.has(slug) || await Meal.exists({ slug })) {
    n++;
    slug = `${base}-${n}`;
  }
  taken.add(slug);
  return slug;
}

interface PreviousMenu { repas: Types.ObjectId[]; published: boolean; copiedFrom?: string }
type SourceMeal = Record<string, unknown> & { nom: string };

async function cloneMeals(sourceMeals: SourceMeal[], target: string): Promise<Types.ObjectId[]> {
  const taken = new Set<string>();
  const docs: Record<string, unknown>[] = [];
  for (const m of sourceMeals) {
    // Rien de l'identité du repas d'origine ne suit : ni _id, ni slug, ni dates de création/modification.
    const { _id, slug: _slug, createdAt: _c, updatedAt: _u, __v: _v, ordre: _o, epinglee: _e, ...content } = m as Record<string, unknown>;
    void _id; void _slug; void _c; void _u; void _v; void _o; void _e;   // un repas daté n'a ni position ni épingle de catalogue
    docs.push({ ...content, slug: await uniqueSlug(m.nom, taken), date: target });
  }
  const inserted = await Meal.insertMany(docs, { ordered: true });
  return inserted.map(d => d._id as Types.ObjectId);
}

export async function duplicateMenu(input: Record<string, unknown>, now: Date = new Date()): Promise<DuplicateResult> {
  const { source, targets, onConflict, published } = parse(input, todayInBoutique(now));

  const sourceMeals = await Meal.find({ date: source }).sort({ createdAt: 1 }).lean() as unknown as SourceMeal[];
  if (sourceMeals.length === 0) throw new MenuDuplicationError(`Aucun repas à copier le ${source}.`, 404);

  const result: DuplicateResult = { created: [], replaced: [], skipped: [], failed: [] };

  for (const target of targets) {
    if (target === source) { result.skipped.push({ date: target, reason: 'Identique à la date source.' }); continue; }

    let previous = null as PreviousMenu | null;
    let inserted: Types.ObjectId[] = [];
    let menuTouched = false;
    try {
      // Réserve la date AVANT de copier : l'index unique sur la date fait qu'une seule demande à la fois peut la prendre,
      // deux copies simultanées vers la même date ne produisent donc jamais de doublon. `new: false` renvoie l'état d'avant.
      previous = await DailyMenu.findOneAndUpdate(
        { date: target },
        { $setOnInsert: { date: target, repas: [], published: false, copiedFrom: source } },
        { upsert: true, new: false },
      ).lean() as PreviousMenu | null;

      // Conflit = un menu enregistré pour cette date, ou des repas déjà créés pour elle (brouillon non publié).
      const existingMeals = await Meal.find({ date: target }).select('_id').lean();
      const conflict = previous !== null || existingMeals.length > 0;

      if (conflict && onConflict === 'skip') {
        if (previous === null) await DailyMenu.deleteOne({ date: target });
        result.skipped.push({ date: target, reason: 'Un menu existe déjà à cette date.' });
        continue;
      }

      // Les copies sont créées D'ABORD ; l'ancien contenu n'est retiré qu'une fois la copie réussie (jamais de perte à moitié).
      inserted = await cloneMeals(sourceMeals, target);
      const finalPublished = published ?? previous?.published ?? false;
      menuTouched = true;
      await DailyMenu.updateOne({ date: target }, { $set: { repas: inserted, published: finalPublished, copiedFrom: source } });
      if (existingMeals.length > 0) {
        await Meal.deleteMany({ _id: { $in: existingMeals.map(m => m._id) } });
      }
      (conflict ? result.replaced : result.created).push({ date: target, meals: inserted.length, published: finalPublished });
    } catch (error) {
      // Retour à l'état d'avant pour cette date : copies supprimées, menu restauré ou réservation levée.
      logger.error('[Menu] copie échouée', { date: target, message: (error as Error).message });
      try {
        if (inserted.length > 0) await Meal.deleteMany({ _id: { $in: inserted } });
        if (previous === null) await DailyMenu.deleteOne({ date: target });
        else if (menuTouched) {
          await DailyMenu.updateOne({ date: target }, previous.copiedFrom
            ? { $set: { repas: previous.repas, published: previous.published, copiedFrom: previous.copiedFrom } }
            : { $set: { repas: previous.repas, published: previous.published }, $unset: { copiedFrom: '' } });
        }
      } catch (cleanup) {
        logger.error('[Menu] nettoyage après échec impossible', { date: target, message: (cleanup as Error).message });
      }
      result.failed.push({ date: target, reason: "La copie a échoué, rien n'a été modifié pour cette date." });
    }
  }
  return result;
}
