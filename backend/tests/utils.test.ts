import { describe, expect, it } from 'vitest';
import { similarKey } from '../utils/similarKey.js';
import { pickFields } from '../utils/pickFields.js';

describe('similarKey (doublons de catégories)', () => {
  it('rapproche casse, accents et pluriels', () => {
    expect(similarKey('Sauce et pain')).toBe(similarKey('Sauces et Pains'));
    expect(similarKey('Légumes')).toBe(similarKey('legume'));
  });

  it('ne confond pas des catégories différentes', () => {
    expect(similarKey('Sauces')).not.toBe(similarKey('Sauce et pain'));
    expect(similarKey('Bases')).not.toBe(similarKey('Bases vertes'));
  });
});

describe('pickFields (écritures publiques)', () => {
  const allowed = ['clientNom', 'price'] as const;

  it('ignore les champs non autorisés', () => {
    const picked = pickFields({ clientNom: 'Awa', price: 25000, statut: 'cancelled', userId: 'x', _id: 'y' }, allowed);
    expect(picked).toEqual({ clientNom: 'Awa', price: 25000 });
  });

  it('nettoie et borne les chaînes', () => {
    const picked = pickFields({ clientNom: `  ${'a'.repeat(500)}  ` }, allowed, 50);
    expect((picked.clientNom as string).length).toBe(50);
  });

  it("renvoie un objet vide pour un corps absent ou invalide", () => {
    expect(pickFields(undefined, allowed)).toEqual({});
    expect(pickFields('texte', allowed)).toEqual({});
  });

  it("n'invente pas de champ absent", () => {
    expect(pickFields({ clientNom: 'Awa' }, allowed)).not.toHaveProperty('price');
  });
});
