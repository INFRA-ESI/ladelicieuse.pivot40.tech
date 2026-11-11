import { describe, expect, it } from 'vitest';
import { toGabonMobile } from '../utils/gabonPhone.js';

describe('toGabonMobile', () => {
  it.each([
    ['77123456', '+24177123456'],
    ['077123456', '+24177123456'],
    ['077 12 34 56', '+24177123456'],
    ['077-12-34-56', '+24177123456'],
    ['+241 77 12 34 56', '+24177123456'],
    ['+241 077 12 34 56', '+24177123456'],
    ['00241 66 12 34 56', '+24166123456'],
    ['24162123456', '+24162123456'],
    ['(074) 12.34.56', '+24174123456'],
    ['  066123456  ', '+24166123456'],
  ])('accepte et normalise %s', (input, expected) => {
    expect(toGabonMobile(input)).toBe(expected);
  });

  it.each([
    '', '   ', '1234', '7712345', '771234567', '0771234567',
    '01123456',            // fixe (commence par 0 puis 1) : pas un mobile
    '+33 6 12 34 56 78',   // autre pays
    '+24277123456',        // indicatif voisin
    '+241 12 34 56 78',    // 8 chiffres ne commençant pas par 6 ou 7
    '77 12 34 5a',
    '+241+77123456',
    '77123456; DROP TABLE',
    'x'.repeat(40),
  ])('refuse %s', (input) => {
    expect(toGabonMobile(input)).toBeNull();
  });

  it.each([undefined, null, 77123456, {}, ['77123456']])('refuse une valeur qui n\'est pas du texte : %o', (input) => {
    expect(toGabonMobile(input)).toBeNull();
  });
});
