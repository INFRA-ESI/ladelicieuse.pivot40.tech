import { describe, it, expect } from 'vitest';
import { formatFCFA, normalizeGabonPhoneNumber, validateGabonPhoneNumber } from '@/lib/utils';

// ── formatFCFA ────────────────────────────────────────────────────────────────
describe('formatFCFA', () => {
  it('formate un montant entier', () => {
    // Intl.NumberFormat('fr-FR') utilise un espace insécable étroit   comme séparateur
    expect(formatFCFA(5000)).toBe('5 000 FCFA');
  });

  it('formate zéro', () => {
    expect(formatFCFA(0)).toBe('0 FCFA');
  });

  it('formate un grand montant', () => {
    const result = formatFCFA(1500000);
    expect(result).toContain('FCFA');
    expect(result).toContain('1');
    expect(result).toContain('500');
  });
});

// ── normalizeGabonPhoneNumber ─────────────────────────────────────────────────
describe('normalizeGabonPhoneNumber', () => {
  it('normalise un numéro local 8 chiffres', () => {
    expect(normalizeGabonPhoneNumber('77123456')).toBe('+24177123456');
  });

  it('normalise un numéro local avec 0 initial', () => {
    expect(normalizeGabonPhoneNumber('077123456')).toBe('+24177123456');
  });

  it('normalise un numéro international sans +', () => {
    expect(normalizeGabonPhoneNumber('24177123456')).toBe('+24177123456');
  });

  it('nettoie les espaces et tirets', () => {
    expect(normalizeGabonPhoneNumber('077 12 34 56')).toBe('+24177123456');
    expect(normalizeGabonPhoneNumber('077-12-34-56')).toBe('+24177123456');
  });
});

// ── validateGabonPhoneNumber ──────────────────────────────────────────────────
describe('validateGabonPhoneNumber', () => {
  it('valide un numéro Airtel 77', () => {
    expect(validateGabonPhoneNumber('77123456')).toBe(true);
  });

  it('valide un numéro Moov 66', () => {
    expect(validateGabonPhoneNumber('66123456')).toBe(true);
  });

  it('rejette un numéro trop court', () => {
    expect(validateGabonPhoneNumber('1234')).toBe(false);
  });

  it('rejette une chaîne vide', () => {
    expect(validateGabonPhoneNumber('')).toBe(false);
  });

  it('rejette un numéro non-gabonais', () => {
    expect(validateGabonPhoneNumber('+33612345678')).toBe(false);
  });
});

// ── Logique fidélité ──────────────────────────────────────────────────────────
// Règle : 1 point par 100 FCFA dépensés (POINTS_PAR_100_FCFA = 1)
// Valeur rachat : 1 point = 5 FCFA (FCFA_PAR_POINT = 5)
describe('Calcul des points fidélité', () => {
  function calculerPoints(montant: number): number {
    return Math.floor((montant / 100) * 1);
  }

  function valeurRachat(points: number): number {
    return points * 5;
  }

  it('calcule 0 points pour moins de 100 FCFA', () => {
    expect(calculerPoints(99)).toBe(0);
  });

  it('calcule 1 point pour exactement 100 FCFA', () => {
    expect(calculerPoints(100)).toBe(1);
  });

  it('calcule 10 points pour 1000 FCFA', () => {
    expect(calculerPoints(1000)).toBe(10);
  });

  it("arrondit à l'inférieur (150 FCFA → 1 point)", () => {
    expect(calculerPoints(150)).toBe(1);
  });

  it('convertit 100 points en 500 FCFA', () => {
    expect(valeurRachat(100)).toBe(500);
  });

  it('valeur rachat de 0 points est 0', () => {
    expect(valeurRachat(0)).toBe(0);
  });
});

// ── Tiers de fidélité ─────────────────────────────────────────────────────────
describe('Tiers de fidélité', () => {
  const TIERS = [
    { slug: 'bronze',  min: 0    },
    { slug: 'argent',  min: 500  },
    { slug: 'or',      min: 1500 },
    { slug: 'platine', min: 3500 },
  ];

  function getTier(points: number): string {
    return [...TIERS].reverse().find(t => points >= t.min)?.slug ?? 'bronze';
  }

  it('bronze pour 0 points',    () => expect(getTier(0)).toBe('bronze'));
  it('bronze pour 499 points',  () => expect(getTier(499)).toBe('bronze'));
  it('argent pour 500 points',  () => expect(getTier(500)).toBe('argent'));
  it('or pour 1500 points',     () => expect(getTier(1500)).toBe('or'));
  it('platine pour 3500 points',() => expect(getTier(3500)).toBe('platine'));
  it('platine pour 10000 points',() => expect(getTier(10000)).toBe('platine'));
});
