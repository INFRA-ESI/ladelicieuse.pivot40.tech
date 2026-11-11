import { describe, it, expect } from 'vitest';
import { pdfText, toneFor } from './pdfDocument';
import { safeFileName } from './downloadFile';

describe('pdfText', () => {
  it("remplace l'espace fine des milliers, que les polices standard d'un PDF n'affichent pas", () => {
    expect(pdfText((10030).toLocaleString('fr-FR'))).toBe('10 030');
  });

  it('garde les accents et la ponctuation française', () => {
    expect(pdfText('Délicieuse Diète — Quartier Louis · 18 %…')).toBe('Délicieuse Diète — Quartier Louis · 18 %…');
  });

  it('retire les caractères que le PDF ne sait pas écrire (emojis)', () => {
    expect(pdfText('Merci 😀 !')).toBe('Merci  !');
  });

  it('accepte les valeurs vides', () => {
    expect(pdfText(undefined)).toBe('');
    expect(pdfText(null)).toBe('');
  });
});

describe('toneFor', () => {
  it('classe la marge', () => {
    expect(toneFor(60)).toBe('good');
    expect(toneFor(45)).toBe('warn');
    expect(toneFor(10)).toBe('bad');
  });
});

describe('safeFileName', () => {
  it('retire les accents et les caractères interdits dans un nom de fichier', () => {
    expect(safeFileName("Aujourd'hui · mercredi 11 novembre 2026")).toBe('aujourd-hui-mercredi-11-novembre-2026');
    expect(safeFileName('F-2026/0007')).toBe('f-2026-0007');
  });

  it('ne rend jamais un nom vide', () => {
    expect(safeFileName('***')).toBe('document');
  });
});
