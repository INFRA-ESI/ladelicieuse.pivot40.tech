// Ordre d'affichage réglable par l'équipe, pour les ingrédients (par catégorie) et les repas/jus du catalogue (par catégorie).
//   1. l'élément épinglé (« le meilleur »), un seul par catégorie, toujours en tête
//   2. les autres selon leur position (`ordre`), réglée à la main
//   3. à égalité ou sans position (anciens éléments) : l'ordre d'avant, fourni par `legacy`
// Un nouvel élément est ajouté EN FIN de sa catégorie : il ne déplace jamais les autres, ni le meilleur épinglé.
// Même règle que pour les suggestions du chef (services/suggestionOrder.ts).

export interface Orderable {
  ordre?: number | null;
  epinglee?: boolean;
}

// Comparateur d'avant ce système : chaque modèle (ingrédient, repas) le définit avec ses propres champs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LegacyCompare<T = any> = (a: T, b: T) => number;

export function compareOrdered<T extends Orderable>(a: T, b: T, legacy: LegacyCompare<T>): number {
  if (!!a.epinglee !== !!b.epinglee) return a.epinglee ? -1 : 1;
  const ao = a.ordre ?? Number.POSITIVE_INFINITY;
  const bo = b.ordre ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao < bo ? -1 : 1;
  return legacy(a, b);
}

export const sortOrdered = <T extends Orderable>(list: T[], legacy: LegacyCompare<T>): T[] => [...list].sort((a, b) => compareOrdered(a, b, legacy));

// Trie à l'intérieur de chaque catégorie en gardant les catégories dans leur ordre d'apparition (l'ordre entre catégories
// ne change pas : seule la position DANS une catégorie se règle).
export function sortWithinGroups<T extends Orderable>(list: T[], groupOf: (item: T) => string, legacy: LegacyCompare<T>): T[] {
  const groups = new Map<string, T[]>();
  for (const item of list) {
    const key = groupOf(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item); else groups.set(key, [item]);
  }
  return [...groups.values()].flatMap(bucket => sortOrdered(bucket, legacy));
}

// Champs lus pour retrouver l'ordre d'avant (nom, populaire, date de création) : la liste est la même pour tous.
const legacyFields = 'nom popular createdAt';

export class DisplayOrderError extends Error {
  constructor(message: string, public readonly status: 400 | 404 = 400) {
    super(message);
  }
}

interface Row extends Orderable { _id: unknown; [key: string]: unknown }

export interface DisplayOrderConfig {
  /** Modèle Mongoose (Ingredient, Meal…). */
  model: unknown;
  /** Champ qui définit la catégorie (ex. « categorie »). */
  groupField: string;
  /** Périmètre commun à tous les éléments concernés (ex. { date: null } pour le catalogue des repas). */
  scope?: Record<string, unknown>;
  /** Ordre d'avant l'arrivée de ce système, pour les éléments sans position. */
  legacy: LegacyCompare;
}

export function createDisplayOrder({ model, groupField, scope = {}, legacy }: DisplayOrderConfig) {
  // Mongoose type fortement chaque modèle ; ce service n'utilise que des opérations communes à tous.
  const M = model as unknown as {
    find(filter: Record<string, unknown>): { select(fields: string): { lean(): Promise<Row[]> } };
    findById(id: string): Promise<(Row & { save(): Promise<unknown> }) | null>;
    countDocuments(filter: Record<string, unknown>): Promise<number>;
    updateMany(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>;
    bulkWrite(ops: unknown[]): Promise<unknown>;
  };
  const inGroup = (group: string) => ({ ...scope, [groupField]: group });

  // Donne une position à chaque élément de la catégorie en gardant l'ordre actuellement affiché (les anciens n'en ont pas).
  // Sans cela, un nouvel élément (position 3) passerait devant les anciens (sans position).
  async function normalize(group: string): Promise<void> {
    const rows = await M.find(inGroup(group)).select(`ordre epinglee ${legacyFields}`).lean();
    const sorted = sortOrdered(rows, legacy);
    const ops = sorted
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => row.ordre !== index)
      .map(({ row, index }) => ({ updateOne: { filter: { _id: row._id }, update: { $set: { ordre: index } } } }));
    if (ops.length > 0) await M.bulkWrite(ops);
  }

  async function nextPosition(group: string): Promise<number> {
    await normalize(group);
    return M.countDocuments(inGroup(group));
  }

  // Nouvel ordre complet d'une catégorie : la liste doit contenir exactement ses éléments (ni oubli, ni doublon, ni intrus),
  // sinon deux administrateurs qui réordonnent en même temps pourraient perdre un élément de la liste.
  async function reorder(group: string, ids: string[]): Promise<void> {
    if (new Set(ids).size !== ids.length) throw new DisplayOrderError('La liste contient des doublons.');
    const existing = await M.find(inGroup(group)).select('_id').lean();
    const known = new Set(existing.map(r => String(r._id)));
    if (ids.length !== known.size || ids.some(id => !known.has(id))) {
      throw new DisplayOrderError('La liste ne correspond plus aux éléments existants. Rechargez la page.');
    }
    await M.bulkWrite(ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { ordre: index } } } })));
  }

  // Épingle un élément (et retire l'épingle de l'ancien de la même catégorie), ou le désépingle.
  async function setPinned(id: string, pinned: boolean): Promise<Row> {
    const target = await M.findById(id);
    const group = target ? String(target[groupField]) : '';
    const outOfScope = target ? Object.entries(scope).some(([k, v]) => (target[k] ?? null) !== v) : true;
    if (!target || outOfScope) throw new DisplayOrderError('Élément introuvable', 404);
    if (pinned) {
      await M.updateMany({ ...inGroup(group), epinglee: true, _id: { $ne: target._id } }, { $set: { epinglee: false } });
    }
    target.epinglee = pinned;
    await target.save();
    await normalize(group);
    return target;
  }

  return { normalize, nextPosition, reorder, setPinned };
}

