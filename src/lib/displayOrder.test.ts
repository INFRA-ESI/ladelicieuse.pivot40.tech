import { describe, expect, it } from 'vitest';
import { canMove, moveRow } from './displayOrder';

const row = (_id: string, epinglee = false) => ({ _id, epinglee });
const ids = (list: { _id: string }[] | null) => list?.map(r => r._id);

describe('déplacement dans l\'ordre d\'affichage', () => {
  const list = [row('a'), row('b'), row('c')];

  it('monte et descend d\'un cran', () => {
    expect(ids(moveRow(list, 1, -1))).toEqual(['b', 'a', 'c']);
    expect(ids(moveRow(list, 1, 1))).toEqual(['a', 'c', 'b']);
  });

  it('ne sort pas de la liste', () => {
    expect(moveRow(list, 0, -1)).toBeNull();
    expect(moveRow(list, 2, 1)).toBeNull();
    expect(canMove(list, 5, 1)).toBe(false);
  });

  it('ne modifie pas la liste d\'origine', () => {
    moveRow(list, 1, -1);
    expect(ids(list)).toEqual(['a', 'b', 'c']);
  });

  it('l\'épinglé ne bouge pas et personne ne passe devant lui', () => {
    const pinned = [row('best', true), row('b'), row('c')];
    expect(moveRow(pinned, 0, 1)).toBeNull();
    expect(moveRow(pinned, 1, -1)).toBeNull();
    expect(canMove(pinned, 1, -1)).toBe(false);
    expect(ids(moveRow(pinned, 1, 1))).toEqual(['best', 'c', 'b']);
  });
});
