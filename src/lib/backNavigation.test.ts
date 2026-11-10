import { describe, expect, it } from 'vitest';
import { parentPath, showsBackButton } from './backNavigation';

describe('navigation retour', () => {
  it('remonte d\'un niveau dans les sections à sous-pages', () => {
    expect(parentPath('/composer/crudites')).toBe('/composer');
    expect(parentPath('/jus/detox')).toBe('/jus');
    expect(parentPath('/repas/soupe')).toBe('/repas');
  });

  it('ramène les autres pages à l\'accueil', () => {
    expect(parentPath('/composer')).toBe('/');
    expect(parentPath('/produit/salade-cesar')).toBe('/');
    expect(parentPath('/mon-compte')).toBe('/');
    expect(parentPath('/panier')).toBe('/');
  });

  it('n\'affiche pas le bouton sur l\'accueil', () => {
    expect(showsBackButton('/')).toBe(false);
    expect(showsBackButton('/panier')).toBe(true);
  });
});
