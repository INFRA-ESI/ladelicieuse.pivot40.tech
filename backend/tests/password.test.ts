import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX_LENGTH, loginPasswordError, passwordError, passwordSchema } from '../utils/password.js';
import { PASSWORD_RULES, loginPasswordError as loginPasswordErrorFront, passwordError as passwordErrorFront } from '../../src/lib/password.js';

// Règle : 8 caractères minimum, une majuscule, un chiffre. Aucun caractère spécial exigé.

const ACCEPTES = [
  'Moussavou1',              // majuscule + chiffre, sans caractère spécial : la nouvelle règle
  'Eric2026',                // exactement 8 caractères
  'MOUSSAVOU1',              // seulement des majuscules et un chiffre
  'moussavoU9',              // la majuscule n'est pas forcément la première lettre
  'Nouveau#Mdp1',            // avec caractère spécial : toujours accepté
  'Mot de passe 1 Long',     // espaces autorisés
  'Étienne2026',             // majuscule accentuée : fréquente dans les prénoms écrits en français
  'moussavou1É',
];

const REFUSES: Array<[string, string, RegExp]> = [
  ['trop court (7 caractères)', 'Abcde12', /8 caractères/],
  ['vide', '', /8 caractères/],
  ['sans majuscule', 'moussavou1', /majuscule/],
  ['avec seulement une minuscule accentuée', 'étienne2026', /majuscule/],
  ['sans chiffre', 'Moussavoux', /chiffre/],
  ['chiffres seuls', '12345678', /majuscule/],
  ['lettres minuscules seules', 'abcdefghij', /majuscule/],
  ['trop long', 'A1' + 'x'.repeat(PASSWORD_MAX_LENGTH), /trop long/],
];

describe('règle des mots de passe — serveur', () => {
  it.each(ACCEPTES)('accepte « %s »', mot => {
    expect(passwordError(mot)).toBeNull();
  });

  it.each(REFUSES)('refuse un mot de passe %s, avec un message qui dit quoi corriger', (_nom, mot, message) => {
    expect(passwordError(mot)).toMatch(message);
  });

  it("n'exige PAS de caractère spécial (l'ancienne règle le demandait)", () => {
    expect(passwordError('Moussavou1')).toBeNull();
  });

  it("refuse tout ce qui n'est pas du texte, sans lever d'erreur", () => {
    for (const mauvais of [undefined, null, 12345678, { a: 1 }, ['Abcdefg1']]) {
      expect(passwordError(mauvais)).toBe('Le mot de passe est requis.');
    }
  });

  it('le schéma zod (réinitialisation admin) applique la même règle et renvoie le même message', () => {
    expect(passwordSchema.safeParse('Moussavou1').success).toBe(true);
    const refus = passwordSchema.safeParse('moussavou1');
    expect(refus.success).toBe(false);
    expect(!refus.success && refus.error.issues[0].message).toBe(passwordError('moussavou1'));
  });
});

describe('règle des mots de passe — le site et le serveur disent la même chose', () => {
  const MATRICE = [
    ...ACCEPTES, ...REFUSES.map(([, mot]) => mot),
    'Abcdefg1', 'abcdefg1', 'Abcdefgh', 'ABCDEFG1', 'aA1', 'Aa1Aa1Aa1', '        ', 'Éric2026é', '1234567A',
  ];

  it.each(MATRICE)('même verdict et même message pour « %s »', mot => {
    expect(passwordErrorFront(mot)).toBe(passwordError(mot));
  });

  it.each(MATRICE)('même message de CONNEXION pour « %s »', mot => {
    expect(loginPasswordErrorFront(mot)).toBe(loginPasswordError(mot));
  });

  it("le message de connexion reprend la règle et indique la sortie de secours ; il est vide pour un mot de passe conforme", () => {
    expect(loginPasswordError('Moussavou1')).toBeNull();
    expect(loginPasswordError('moussavou1')).toBe(`${passwordError('moussavou1')} Pour votre sécurité, choisissez-en un nouveau avec « Mot de passe oublié ».`);
  });

  it("la liste de conditions affichée pendant la saisie correspond à la règle (aucune condition en plus ni en moins)", () => {
    const parLaListe = (mot: string) => PASSWORD_RULES.every(r => r.test(mot));
    for (const mot of MATRICE.filter(m => m.length <= PASSWORD_MAX_LENGTH)) {
      expect(parLaListe(mot)).toBe(passwordError(mot) === null);
    }
  });
});
