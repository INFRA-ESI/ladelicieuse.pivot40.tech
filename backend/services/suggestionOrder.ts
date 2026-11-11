import Suggestion from '../models/Suggestion.model.js';

// Ordre d'affichage des suggestions du chef, par type (crudités / fruits).
//   1. la suggestion épinglée (« meilleure salade »), une seule par type, toujours en tête
//   2. les autres selon leur position (`ordre`), que l'équipe règle à la main
//   3. à égalité ou sans position (anciennes suggestions) : la plus récente d'abord, comme avant
// Une nouvelle suggestion est ajoutée EN FIN de liste : elle ne déplace jamais les autres.

export type SuggestionType = 'crudites' | 'fruits';
export const SUGGESTION_TYPES: SuggestionType[] = ['crudites', 'fruits'];

interface Orderable { ordre?: number | null; epinglee?: boolean; createdAt?: Date | string | number }

const time = (d: Orderable['createdAt']) => (d ? new Date(d).getTime() : 0);

export function compareSuggestions(a: Orderable, b: Orderable): number {
  if (!!a.epinglee !== !!b.epinglee) return a.epinglee ? -1 : 1;
  const ao = a.ordre ?? Number.POSITIVE_INFINITY;
  const bo = b.ordre ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao < bo ? -1 : 1;
  return time(b.createdAt) - time(a.createdAt);
}

export const sortSuggestions = <T extends Orderable>(list: T[]): T[] => [...list].sort(compareSuggestions);

// Donne une position à chaque suggestion du type, en conservant l'ordre actuellement affiché (les anciennes suggestions
// n'en ont pas). Sans cela, une suggestion nouvelle (position 3) passerait devant les anciennes (sans position).
export async function normalizeOrder(type: SuggestionType): Promise<void> {
  const docs = await Suggestion.find({ type }).select('ordre epinglee createdAt').lean();
  const sorted = sortSuggestions(docs);
  const writes = sorted
    .map((d, index) => ({ d, index }))
    .filter(({ d, index }) => d.ordre !== index)
    .map(({ d, index }) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { ordre: index } } } }));
  if (writes.length > 0) await Suggestion.bulkWrite(writes);
}

export async function nextPosition(type: SuggestionType): Promise<number> {
  await normalizeOrder(type);
  return Suggestion.countDocuments({ type });
}

export class SuggestionOrderError extends Error {
  constructor(message: string, public readonly status: 400 | 404 = 400) {
    super(message);
  }
}

// Nouvel ordre complet d'un type : la liste doit contenir exactement les suggestions du type (ni oubli, ni doublon, ni intrus),
// sinon deux administrateurs qui réordonnent en même temps pourraient perdre une suggestion de la liste.
export async function reorder(type: SuggestionType, ids: string[]): Promise<void> {
  if (new Set(ids).size !== ids.length) throw new SuggestionOrderError('La liste contient des doublons.');
  const existing = await Suggestion.find({ type }).select('_id').lean();
  const known = new Set(existing.map(d => String(d._id)));
  if (ids.length !== known.size || ids.some(id => !known.has(id))) {
    throw new SuggestionOrderError('La liste ne correspond plus aux suggestions existantes. Rechargez la page.');
  }
  await Suggestion.bulkWrite(ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { ordre: index } } } })));
}

// Épingle une suggestion (et retire l'épingle de l'ancienne du même type), ou la désépingle.
export async function setPinned(id: string, pinned: boolean) {
  const target = await Suggestion.findById(id);
  if (!target) throw new SuggestionOrderError('Suggestion introuvable', 404);
  if (pinned) {
    await Suggestion.updateMany({ type: target.type, epinglee: true, _id: { $ne: target._id } }, { $set: { epinglee: false } });
    target.epinglee = true;
  } else {
    target.epinglee = false;
  }
  await target.save();
  await normalizeOrder(target.type as SuggestionType);
  return Suggestion.findById(id).lean();
}
