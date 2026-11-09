import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatPrixFcfa } from '@/lib/fcfa';
import { formatPrice } from '@/data/products';
import { formatFCFA } from '@/lib/utils';

const FINE = String.fromCharCode(0x202f); // séparateur de milliers de fr-FR
const reference = new Intl.NumberFormat('fr-FR'); // créé avant toute substitution d'Intl
const attendu = (valeur: unknown) => reference.format(valeur as number) + ' FCFA';

/** Remplace Intl.NumberFormat par un compteur de constructions ; restore() remet l'original. */
function compterConstructions() {
  const intl = Intl as unknown as { NumberFormat: typeof Intl.NumberFormat };
  const original = intl.NumberFormat;
  let constructions = 0;
  intl.NumberFormat = new Proxy(original, {
    construct(cible, args, nouvelleCible) { constructions++; return Reflect.construct(cible, args, nouvelleCible); },
  });
  return { get constructions() { return constructions; }, restore: () => { intl.NumberFormat = original; } };
}

let compteur: ReturnType<typeof compterConstructions> | undefined;
afterEach(() => { compteur?.restore(); compteur = undefined; vi.resetModules(); });

describe('formatPrixFcfa — valeurs attendues (littérales, pas recopiées depuis Intl)', () => {
  it.each([
    [0, '0 FCFA'],
    [1, '1 FCFA'],
    [999, '999 FCFA'],
    [1000, `1${FINE}000 FCFA`],
    [1500, `1${FINE}500 FCFA`],
    [12345, `12${FINE}345 FCFA`],
    [100000, `100${FINE}000 FCFA`],
    [1234567, `1${FINE}234${FINE}567 FCFA`],
    [-1, '-1 FCFA'],
    [-1000, `-1${FINE}000 FCFA`],
    [-1234567, `-1${FINE}234${FINE}567 FCFA`],
    [Number.MAX_SAFE_INTEGER, `9${FINE}007${FINE}199${FINE}254${FINE}740${FINE}991 FCFA`],
  ])('%d → %s', (montant, resultat) => {
    expect(formatPrixFcfa(montant)).toBe(resultat);
  });

  it("le séparateur est l'espace insécable fine U+202F et le suffixe est précédé d'une espace ordinaire", () => {
    const s = formatPrixFcfa(2500);
    expect(s.charCodeAt(1)).toBe(0x202f);
    expect(s.charCodeAt(5)).toBe(0x20);
    expect(s.endsWith(' FCFA')).toBe(true);
  });
});

describe('formatPrixFcfa — identique à Intl.NumberFormat("fr-FR") sur les entiers', () => {
  it('tous les entiers de -20 000 à 250 000', () => {
    for (let n = -20_000; n <= 250_000; n++) {
      if (formatPrixFcfa(n) !== attendu(n)) throw new Error(`écart pour ${n} : ${JSON.stringify(formatPrixFcfa(n))} au lieu de ${JSON.stringify(attendu(n))}`);
    }
  });

  it('autour de chaque puissance de dix (frontières de groupes), en positif et en négatif', () => {
    for (let k = 0; k <= 15; k++) {
      for (const base of [10 ** k - 1, 10 ** k, 10 ** k + 1]) {
        for (const n of [base, -base]) expect(formatPrixFcfa(n)).toBe(attendu(n));
      }
    }
  });

  it('50 000 entiers sûrs tirés au hasard (graine fixe), toutes tailles confondues', () => {
    let graine = 123456789;
    const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296; };
    for (let i = 0; i < 50_000; i++) {
      const chiffres = 1 + Math.floor(alea() * 15);
      const n = Math.trunc(alea() * 10 ** chiffres) * (alea() < 0.2 ? -1 : 1);
      if (formatPrixFcfa(n) !== attendu(n)) throw new Error(`écart pour ${n}`);
    }
  });

  it('bornes des entiers sûrs', () => {
    for (const n of [Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) expect(formatPrixFcfa(n)).toBe(attendu(n));
  });
});

describe('formatPrixFcfa — tout le reste est délégué à Intl, donc identique à avant', () => {
  const cas: [string, unknown][] = [
    ['décimal', 1234.5], ['décimal à 2 chiffres', 1234.56], ['arrondi à 3 décimales', 1234.5678], ['très petit', 0.0004], ['0,5', 0.5],
    ['négatif décimal', -1234.5], ['moins zéro', -0], ['NaN', NaN], ['Infini', Infinity], ['-Infini', -Infinity],
    ['entier non sûr (2^53)', 2 ** 53], ['1e21', 1e21], ['texte numérique', '1500'], ['texte vide', ''], ['null', null],
    ['undefined', undefined], ['booléen', true], ['BigInt', 123n],
  ];
  it.each(cas)('%s', (_nom, valeur) => {
    expect(formatPrixFcfa(valeur as number)).toBe(attendu(valeur));
  });
});

describe("formatPrixFcfa — contrat de performance : pas d'initialisation d'Intl pour un entier", () => {
  it('ne construit aucun Intl.NumberFormat pour des montants entiers', async () => {
    vi.resetModules();
    compteur = compterConstructions();
    const { formatPrixFcfa: neuf } = await import('@/lib/fcfa');
    for (const n of [0, 500, 1500, 25_000, 1_250_000, -3000]) neuf(n);
    expect(compteur.constructions).toBe(0);
  });

  it("construit le formateur de secours une seule fois, même après plusieurs valeurs hors entiers", async () => {
    vi.resetModules();
    compteur = compterConstructions();
    const { formatPrixFcfa: neuf } = await import('@/lib/fcfa');
    neuf(1234.5); neuf(NaN); neuf(0.5); neuf(-0);
    expect(compteur.constructions).toBe(1);
  });
});

describe('formatPrice (data/products) — mêmes résultats qu’avant', () => {
  it.each([0, 1500, 2500, 12000, 125000, 1234567, -1500, 1234.5])('formatPrice(%s)', montant => {
    expect(formatPrice(montant)).toBe(attendu(montant));
  });
});

// Les anciennes expressions, recopiées telles qu'elles étaient dans le code, contre les nouveaux appels.
describe('anciens formateurs remplacés — rendu strictement identique', () => {
  const montants = [0, 500, 1500, 2500, 12_000, 125_000, 1_250_000, 18_000_000, -2500, 1234.5, 99.9];

  it('utils.formatFCFA (paiement)', () => {
    for (const m of montants) expect(formatFCFA(m)).toBe(new Intl.NumberFormat('fr-FR').format(m) + ' FCFA');
  });

  it('ConsultationsPage.fmt et UsersPage.fmtPrice (même expression qu’avant)', () => {
    for (const m of montants) expect(formatPrixFcfa(m)).toBe(new Intl.NumberFormat('fr-FR').format(m) + ' FCFA');
  });

  it('HomePage : libellé d’une promotion de type « fixe » (-X FCFA)', () => {
    for (const m of [500, 1000, 2500, 10_000, 150_000]) {
      expect(`-${formatPrice(m)}`).toBe(`-${new Intl.NumberFormat('fr-FR').format(m)} FCFA`);
    }
  });

  it('MonComptePage : montant mensuel de l’abonnement', () => {
    for (const m of [15_000, 35_000, 60_000, 120_000]) {
      expect(formatPrice(m)).toBe(`${new Intl.NumberFormat('fr-FR').format(m)} FCFA`);
    }
  });

  it('InvoicesPage : n.toLocaleString("fr-FR") est équivalent pour tout nombre', () => {
    for (const m of [...montants, 0, NaN, 1e9, -1e9]) expect(formatPrixFcfa(m)).toBe(m.toLocaleString('fr-FR') + ' FCFA');
  });
});
