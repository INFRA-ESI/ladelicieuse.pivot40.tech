// Règles de déplacement dans la liste d'une catégorie : l'élément épinglé (« le meilleur ») reste en tête quoi qu'on fasse,
// les autres se déplacent d'un cran sans jamais passer devant lui.
export interface OrderRow {
  _id: string;
  epinglee?: boolean;
}

export function canMove(list: OrderRow[], index: number, direction: -1 | 1): boolean {
  const row = list[index];
  if (!row || row.epinglee) return false;
  const target = index + direction;
  if (target < 0 || target >= list.length) return false;
  return !list[target].epinglee;
}

/** Nouvelle liste après déplacement d'un cran, ou null si le déplacement n'est pas permis. */
export function moveRow<T extends OrderRow>(list: T[], index: number, direction: -1 | 1): T[] | null {
  if (!canMove(list, index, direction)) return null;
  const next = [...list];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
}
